use crate::core::FileSnapshot;
use crate::latex::{LatexNode, project_latex};
use crate::outline::{OutlineItem, extract_outline};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
};
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectDocument {
    pub path: String,
    pub nodes: Vec<LatexNode>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Project {
    pub root: String,
    pub entry: String,
    pub files: Vec<ProjectFile>,
    pub folders: Vec<String>,
    pub documents: Vec<ProjectDocument>,
    pub outline: Vec<OutlineItem>,
    pub body: Vec<LatexNode>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectFile {
    pub path: String,
    pub content: Option<String>,
    pub content_hash: Option<String>,
    pub extension: Option<String>,
    pub size: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourceFile {
    pub path: String,
    pub content: String,
}

pub fn project_from_sources(root: &str, entry: &str, sources: &[SourceFile]) -> Project {
    let by_path = sources
        .iter()
        .map(|source| (source.path.as_str(), source.content.as_str()))
        .collect::<std::collections::HashMap<_, _>>();
    let mut ordered = Vec::new();
    let mut seen = BTreeSet::new();
    fn visit(
        path: &str,
        by_path: &std::collections::HashMap<&str, &str>,
        seen: &mut BTreeSet<String>,
        ordered: &mut Vec<String>,
    ) {
        if !seen.insert(path.to_string()) {
            return;
        }
        ordered.push(path.to_string());
        if let Some(content) = by_path.get(path) {
            for dependency in dependencies(content) {
                let candidate = if by_path.contains_key(dependency.as_str()) {
                    Some(dependency)
                } else {
                    let tex = format!("{dependency}.tex");
                    by_path.contains_key(tex.as_str()).then_some(tex)
                };
                if let Some(candidate) = candidate {
                    visit(&candidate, by_path, seen, ordered);
                }
            }
        }
    }
    visit(entry, &by_path, &mut seen, &mut ordered);
    let documents = ordered
        .iter()
        .filter_map(|path| {
            by_path.get(path.as_str()).map(|content| ProjectDocument {
                path: path.clone(),
                nodes: project_latex(path, content),
            })
        })
        .collect::<Vec<_>>();
    let body = documents
        .iter()
        .flat_map(|document| document.nodes.clone())
        .collect::<Vec<_>>();
    let outline = extract_outline(
        &documents
            .iter()
            .map(|document| {
                (
                    document.path.clone(),
                    by_path[document.path.as_str()].to_string(),
                )
            })
            .collect::<Vec<_>>(),
    );
    Project {
        root: root.to_string(),
        entry: entry.to_string(),
        files: sources
            .iter()
            .map(|source| ProjectFile {
                path: source.path.clone(),
                content: Some(source.content.clone()),
                content_hash: None,
                extension: Path::new(&source.path)
                    .extension()
                    .map(|value| value.to_string_lossy().into()),
                size: source.content.len() as u64,
            })
            .collect(),
        folders: Vec::new(),
        documents,
        outline,
        body,
    }
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ProjectError {
    #[error("project directory does not exist")]
    MissingRoot,
    #[error("could not identify a unique LaTeX entry file")]
    AmbiguousEntry,
    #[error("dependency escapes project directory")]
    UnsafeDependency,
    #[error("project file could not be read")]
    UnreadableFile,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ProjectFileError {
    #[error("project path is unsafe")]
    UnsafePath,
    #[error("project item name is invalid")]
    InvalidName,
    #[error("project item already exists")]
    AlreadyExists,
    #[error("project item does not exist")]
    MissingItem,
    #[error("project file operation failed")]
    Io,
}

fn project_item_path(root: &Path, relative: &str) -> Result<PathBuf, ProjectFileError> {
    let relative = Path::new(relative);
    if relative.as_os_str().is_empty()
        || relative.is_absolute()
        || relative.components().any(|part| {
            matches!(
                part,
                std::path::Component::ParentDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        })
    {
        return Err(ProjectFileError::UnsafePath);
    }
    for component in relative.components() {
        match component {
            std::path::Component::Normal(name) if is_valid_project_item_name(name) => {}
            std::path::Component::Normal(_) | std::path::Component::CurDir => {
                return Err(ProjectFileError::InvalidName);
            }
            _ => {}
        }
    }
    Ok(root.join(relative))
}

fn is_valid_project_item_name(name: &std::ffi::OsStr) -> bool {
    let Some(name) = name.to_str() else {
        return false;
    };
    if name.is_empty()
        || name != name.trim()
        || name == "."
        || name == ".."
        || name.ends_with(['.', ' '])
        || name
            .chars()
            .any(|character| character.is_control() || matches!(character, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
    {
        return false;
    }
    let stem = name.split('.').next().unwrap_or_default().to_ascii_uppercase();
    !matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        && !(stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && matches!(stem.as_bytes()[3], b'1'..=b'9'))
}

pub fn create_project_folder(root: &Path, path: &str) -> Result<(), ProjectFileError> {
    let target = project_item_path(root, path)?;
    if target.exists() {
        return Err(ProjectFileError::AlreadyExists);
    }
    fs::create_dir_all(target).map_err(|_| ProjectFileError::Io)
}

pub fn create_project_text_file(root: &Path, path: &str) -> Result<(), ProjectFileError> {
    create_project_text_file_with_content(root, path, "")
}

pub fn create_project_text_file_with_content(
    root: &Path,
    path: &str,
    content: &str,
) -> Result<(), ProjectFileError> {
    let target = project_item_path(root, path)?;
    if target.exists() {
        return Err(ProjectFileError::AlreadyExists);
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|_| ProjectFileError::Io)?;
    }
    fs::write(target, content).map_err(|_| ProjectFileError::Io)
}

pub fn read_project_file(root: &Path, path: &str) -> Result<String, ProjectFileError> {
    let target = project_item_path(root, path)?;
    if !target.is_file() {
        return Err(ProjectFileError::MissingItem);
    }
    fs::read_to_string(target).map_err(|_| ProjectFileError::Io)
}

pub fn rename_project_item(root: &Path, from: &str, to: &str) -> Result<(), ProjectFileError> {
    let source = project_item_path(root, from)?;
    let target = project_item_path(root, to)?;
    if !source.exists() {
        return Err(ProjectFileError::MissingItem);
    }
    if source == target {
        return Ok(());
    }
    if target.exists() {
        return Err(ProjectFileError::AlreadyExists);
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|_| ProjectFileError::Io)?;
    }
    fs::rename(source, target).map_err(|_| ProjectFileError::Io)
}

pub fn delete_project_item(root: &Path, path: &str) -> Result<(), ProjectFileError> {
    let target = project_item_path(root, path)?;
    if !target.exists() {
        return Err(ProjectFileError::MissingItem);
    }
    if target.is_dir() {
        trash::delete(target).map_err(|_| ProjectFileError::Io)
    } else {
        trash::delete(target).map_err(|_| ProjectFileError::Io)
    }
}

pub fn import_project_files(
    root: &Path,
    folder: &str,
    sources: &[PathBuf],
) -> Result<Vec<String>, ProjectFileError> {
    let destination = if folder.is_empty() {
        root.to_path_buf()
    } else {
        project_item_path(root, folder)?
    };
    fs::create_dir_all(&destination).map_err(|_| ProjectFileError::Io)?;
    let mut imported = Vec::new();
    for source in sources {
        let name = source.file_name().ok_or(ProjectFileError::UnsafePath)?;
        let target = destination.join(name);
        if target.exists() {
            return Err(ProjectFileError::AlreadyExists);
        }
        fs::copy(source, &target).map_err(|_| ProjectFileError::Io)?;
        imported.push(
            target
                .strip_prefix(root)
                .map_err(|_| ProjectFileError::UnsafePath)?
                .to_string_lossy()
                .replace('\\', "/"),
        );
    }
    Ok(imported)
}

pub fn open_project(root: &Path, entry: Option<&str>) -> Result<Project, ProjectError> {
    if !root.is_dir() {
        return Err(ProjectError::MissingRoot);
    }
    let mut tex_files = Vec::new();
    collect_tex(root, root, &mut tex_files)?;
    let entry_path = match entry {
        Some(value) => safe_path(root, Path::new(value))?,
        None => {
            let roots: Vec<_> = tex_files
                .iter()
                .filter(|(_, text)| text.contains("\\documentclass"))
                .map(|(path, _)| path.clone())
                .collect();
            let conventional = ["main.tex", "paper.tex"]
                .into_iter()
                .find(|candidate| tex_files.iter().any(|(path, _)| path == candidate));
            let selected = conventional
                .map(str::to_string)
                .or_else(|| (roots.len() == 1).then(|| roots[0].clone()))
                .or_else(|| (tex_files.len() == 1).then(|| tex_files[0].0.clone()))
                .ok_or(ProjectError::AmbiguousEntry)?;
            root.join(selected)
        }
    };
    let entry_relative = entry_path
        .strip_prefix(root)
        .map_err(|_| ProjectError::UnsafeDependency)?
        .to_string_lossy()
        .replace('\\', "/");
    let mut paths = BTreeSet::new();
    let mut queue = vec![entry_path];
    while let Some(path) = queue.pop() {
        let relative = path
            .strip_prefix(root)
            .map_err(|_| ProjectError::UnsafeDependency)?
            .to_string_lossy()
            .replace('\\', "/");
        if !paths.insert(relative.clone()) {
            continue;
        }
        let text = fs::read_to_string(&path).map_err(|_| ProjectError::UnreadableFile)?;
        for dependency in dependencies(&text) {
            let resolved = resolve_dependency(root, &path, &dependency)?;
            if resolved.exists() {
                queue.push(resolved);
            }
        }
    }
    let document_paths = paths.clone();
    let ordered_document_paths: Vec<String> =
        dependency_order(root, &document_paths, &entry_relative)?;
    let mut files = Vec::new();
    let mut folders = Vec::new();
    collect_files(root, root, &mut files, &mut folders)?;
    let mut documents: Vec<ProjectDocument> = ordered_document_paths
        .iter()
        .filter_map(|path| files.iter().find(|file| &file.path == path))
        .map(|file| ProjectDocument {
            path: file.path.clone(),
            nodes: project_latex(&file.path, file.content.as_deref().unwrap_or_default()),
        })
        .collect();
    let mut section_number = 0;
    for document in &mut documents {
        for node in &mut document.nodes {
            if node.kind == crate::latex::LatexNodeKind::Section {
                section_number += 1;
                node.display = format!("{section_number} {}", node.text);
            }
        }
    }
    let outline = extract_outline(
        &ordered_document_paths
            .iter()
            .filter_map(|path| files.iter().find(|file| &file.path == path))
            .map(|file| (file.path.clone(), file.content.clone().unwrap_or_default()))
            .collect::<Vec<_>>(),
    );
    let body = documents
        .iter()
        .flat_map(|document| document.nodes.clone())
        .collect();
    Ok(Project {
        root: root.to_string_lossy().into(),
        entry: entry_relative,
        files,
        folders,
        documents,
        outline,
        body,
    })
}

pub fn scan_project(root: &Path) -> Result<Project, ProjectError> {
    if !root.is_dir() {
        return Err(ProjectError::MissingRoot);
    }
    let mut files = Vec::new();
    let mut folders = Vec::new();
    collect_files(root, root, &mut files, &mut folders)?;
    let entry = files
        .iter()
        .find(|file| file.path.eq_ignore_ascii_case("main.tex"))
        .or_else(|| {
            files
                .iter()
                .find(|file| file.path.eq_ignore_ascii_case("paper.tex"))
        })
        .or_else(|| {
            files.iter().find(|file| {
                file.extension
                    .as_deref()
                    .is_some_and(|value| value.eq_ignore_ascii_case("tex"))
            })
        })
        .map(|file| file.path.clone())
        .unwrap_or_default();
    Ok(Project {
        root: root.to_string_lossy().into_owned(),
        entry,
        files,
        folders,
        documents: Vec::new(),
        outline: Vec::new(),
        body: Vec::new(),
    })
}

fn dependency_order(
    root: &Path,
    allowed: &BTreeSet<String>,
    entry: &str,
) -> Result<Vec<String>, ProjectError> {
    let mut result = Vec::new();
    let mut seen = BTreeSet::new();
    fn visit(
        root: &Path,
        allowed: &BTreeSet<String>,
        path: &Path,
        seen: &mut BTreeSet<String>,
        result: &mut Vec<String>,
    ) -> Result<(), ProjectError> {
        let relative = path
            .strip_prefix(root)
            .map_err(|_| ProjectError::UnsafeDependency)?
            .to_string_lossy()
            .replace('\\', "/");
        if !allowed.contains(&relative) || !seen.insert(relative.clone()) {
            return Ok(());
        }
        result.push(relative);
        let text = fs::read_to_string(path).map_err(|_| ProjectError::UnreadableFile)?;
        for dependency in dependencies(&text) {
            let child = resolve_dependency(root, path, &dependency)?;
            if child.exists() {
                visit(root, allowed, &child, seen, result)?;
            }
        }
        Ok(())
    }
    visit(root, allowed, &root.join(entry), &mut seen, &mut result)?;
    Ok(result)
}

fn collect_files(
    root: &Path,
    dir: &Path,
    files: &mut Vec<ProjectFile>,
    folders: &mut Vec<String>,
) -> Result<(), ProjectError> {
    for item in fs::read_dir(dir).map_err(|_| ProjectError::UnreadableFile)? {
        let path = item.map_err(|_| ProjectError::UnreadableFile)?.path();
        if path.is_dir() {
            folders.push(
                path.strip_prefix(root)
                    .map_err(|_| ProjectError::UnsafeDependency)?
                    .to_string_lossy()
                    .replace('\\', "/"),
            );
            collect_files(root, &path, files, folders)?;
            continue;
        }
        let relative = path
            .strip_prefix(root)
            .map_err(|_| ProjectError::UnsafeDependency)?
            .to_string_lossy()
            .replace('\\', "/");
        let metadata = fs::metadata(&path).map_err(|_| ProjectError::UnreadableFile)?;
        let content = if is_text_file(&path) {
            Some(fs::read_to_string(&path).map_err(|_| ProjectError::UnreadableFile)?)
        } else {
            None
        };
        let content_hash = content
            .as_deref()
            .map(|value| FileSnapshot::new("", value).content_hash);
        files.push(ProjectFile {
            path: relative,
            content,
            content_hash,
            extension: path.extension().map(|value| value.to_string_lossy().into()),
            size: metadata.len(),
        });
    }
    files.sort_by(|left, right| left.path.cmp(&right.path));
    folders.sort();
    Ok(())
}

fn is_text_file(path: &Path) -> bool {
    let Ok(bytes) = fs::read(path) else {
        return false;
    };
    !bytes.contains(&0) && std::str::from_utf8(&bytes).is_ok()
}

fn collect_tex(
    root: &Path,
    dir: &Path,
    out: &mut Vec<(String, String)>,
) -> Result<(), ProjectError> {
    for item in fs::read_dir(dir).map_err(|_| ProjectError::UnreadableFile)? {
        let path = item.map_err(|_| ProjectError::UnreadableFile)?.path();
        if path.is_dir() {
            collect_tex(root, &path, out)?;
        } else if path.extension().is_some_and(|ext| ext == "tex") {
            let text = fs::read_to_string(&path).map_err(|_| ProjectError::UnreadableFile)?;
            let relative = path
                .strip_prefix(root)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            out.push((relative, text));
        }
    }
    Ok(())
}

fn dependencies(text: &str) -> Vec<String> {
    ["\\input{", "\\include{", "\\bibliography{"]
        .into_iter()
        .flat_map(|marker| {
            text.match_indices(marker).filter_map(move |(start, _)| {
                text[start + marker.len()..]
                    .find('}')
                    .map(|end| text[start + marker.len()..start + marker.len() + end].to_string())
            })
        })
        .collect()
}

fn resolve_dependency(
    root: &Path,
    source: &Path,
    dependency: &str,
) -> Result<PathBuf, ProjectError> {
    let base = source.parent().unwrap_or(root);
    let path = base.join(dependency);
    if path.extension().is_some() {
        return safe_path(root, &path.strip_prefix(root).unwrap_or(&path));
    }
    for extension in ["tex", "bib"] {
        let candidate = path.with_extension(extension);
        let safe = safe_path(root, &candidate.strip_prefix(root).unwrap_or(&candidate))?;
        if safe.exists() {
            return Ok(safe);
        }
    }
    safe_path(root, &path.strip_prefix(root).unwrap_or(&path))
}

fn safe_path(root: &Path, relative: &Path) -> Result<PathBuf, ProjectError> {
    if relative.is_absolute()
        || relative
            .components()
            .any(|part| matches!(part, std::path::Component::ParentDir))
    {
        return Err(ProjectError::UnsafeDependency);
    }
    Ok(root.join(relative))
}
