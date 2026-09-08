use crate::project::SourceFile;
use crate::services::{parse_latex_diagnostics, parse_tectonic_diagnostics};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};
use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum CompileError {
    #[error("entry file escapes project")]
    UnsafeEntry,
    #[error("no supported LaTeX compiler was found (tried xelatex, lualatex, pdflatex, tectonic)")]
    CompilerUnavailable,
    #[error("tectonic compilation failed")]
    Failed,
    #[error("could not prepare temporary compilation workspace")]
    Workspace,
}

fn copy_project(source: &Path, destination: &Path) -> Result<(), CompileError> {
    fs::create_dir_all(destination).map_err(|_| CompileError::Workspace)?;
    for item in fs::read_dir(source).map_err(|_| CompileError::Workspace)? {
        let path = item.map_err(|_| CompileError::Workspace)?.path();
        let target = destination.join(path.file_name().ok_or(CompileError::Workspace)?);
        if path.is_dir() {
            copy_project(&path, &target)?;
        } else {
            fs::copy(path, target).map_err(|_| CompileError::Workspace)?;
        }
    }
    Ok(())
}

pub fn prepare_compile_workspace(
    root: &Path,
    entry: &str,
    sources: &[SourceFile],
) -> Result<tempfile::TempDir, CompileError> {
    let workspace = tempfile::tempdir().map_err(|_| CompileError::Workspace)?;
    copy_project(root, workspace.path())?;
    for source in sources {
        let relative = Path::new(&source.path);
        if relative.as_os_str().is_empty()
            || relative.is_absolute()
            || relative
                .components()
                .any(|part| matches!(part, std::path::Component::ParentDir))
        {
            return Err(CompileError::UnsafeEntry);
        }
        let target = workspace.path().join(relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|_| CompileError::Workspace)?;
        }
        let content = if source.path.replace('\\', "/") == entry.replace('\\', "/") {
            enable_pdf_bookmarks(&source.content)
        } else {
            source.content.clone()
        };
        fs::write(target, content).map_err(|_| CompileError::Workspace)?;
    }
    let output = compiler_output_path(workspace.path(), entry);
    if output.exists() {
        fs::remove_file(output).map_err(|_| CompileError::Workspace)?;
    }
    Ok(workspace)
}

pub fn enable_pdf_bookmarks(source: &str) -> String {
    let Some(document_start) = source.find("\\begin{document}") else {
        return source.to_string();
    };
    let preamble = &source[..document_start];
    let insertion = if preamble.contains("{hyperref}") {
        "\\hypersetup{bookmarks=true,bookmarksopen=true}\n"
    } else {
        "\\usepackage[bookmarks=true,bookmarksopen=true]{hyperref}\n"
    };
    let mut enabled = source.to_string();
    enabled.insert_str(document_start, insertion);
    enabled
}

pub fn compiler_output_path(root: &Path, entry: &str) -> PathBuf {
    let name = Path::new(entry)
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy();
    root.join(format!("{name}.pdf"))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompilerKind {
    XeLatex,
    LuaLatex,
    PdfLatex,
    Tectonic,
}

impl CompilerKind {
    fn executable(self) -> &'static str {
        match self {
            Self::XeLatex => "xelatex",
            Self::LuaLatex => "lualatex",
            Self::PdfLatex => "pdflatex",
            Self::Tectonic => "tectonic",
        }
    }

    fn display_name(self) -> &'static str {
        match self {
            Self::XeLatex => "XeLaTeX",
            Self::LuaLatex => "LuaLaTeX",
            Self::PdfLatex => "pdfLaTeX",
            Self::Tectonic => "Tectonic",
        }
    }
}

pub fn compiler_passes(_kind: CompilerKind) -> usize {
    1
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SelectedCompiler {
    pub kind: CompilerKind,
    pub executable: String,
}

pub fn select_compiler(mut available: impl FnMut(&str) -> bool) -> Option<SelectedCompiler> {
    [
        CompilerKind::XeLatex,
        CompilerKind::LuaLatex,
        CompilerKind::PdfLatex,
        CompilerKind::Tectonic,
    ]
    .into_iter()
    .find(|kind| available(kind.executable()))
    .map(|kind| SelectedCompiler {
        kind,
        executable: kind.executable().to_string(),
    })
}

pub fn compiler_arguments(kind: CompilerKind, entry: &str) -> Vec<String> {
    match kind {
        CompilerKind::Tectonic => vec![
            entry.to_string(),
            "--keep-logs".to_string(),
            "--keep-intermediates".to_string(),
        ],
        _ => vec![
            "-interaction=nonstopmode".to_string(),
            "-file-line-error".to_string(),
            "-synctex=1".to_string(),
            entry.to_string(),
        ],
    }
}

fn detect_compiler() -> Result<SelectedCompiler, CompileError> {
    select_compiler(|name| {
        Command::new(name)
            .arg("--version")
            .output()
            .is_ok_and(|output| output.status.success())
    })
    .ok_or(CompileError::CompilerUnavailable)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompileResult {
    pub pdf: Option<PathBuf>,
    pub diagnostics: Vec<crate::services::Diagnostic>,
    pub success: bool,
}

pub fn compile_project_with(
    root: &Path,
    entry: &str,
    compiler: &str,
) -> Result<CompileResult, CompileError> {
    let entry_path = Path::new(entry);
    if entry_path.is_absolute()
        || entry_path
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(CompileError::UnsafeEntry);
    }
    let kind = match compiler.to_ascii_lowercase().as_str() {
        "xelatex" => CompilerKind::XeLatex,
        "lualatex" => CompilerKind::LuaLatex,
        "pdflatex" => CompilerKind::PdfLatex,
        _ => CompilerKind::Tectonic,
    };
    let output = Command::new(compiler)
        .current_dir(root)
        .args(compiler_arguments(kind, entry))
        .output()
        .map_err(|_| CompileError::CompilerUnavailable)?;
    let diagnostics = String::from_utf8_lossy(&output.stderr).into_owned();
    if !output.status.success() {
        return Err(CompileError::Failed);
    }
    Ok(CompileResult {
        pdf: Some(root.join(entry_path).with_extension("pdf")),
        diagnostics: parse_tectonic_diagnostics(&diagnostics),
        success: true,
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct PdfOutlineItem {
    pub title: String,
    pub level: usize,
    pub page: usize,
}

pub fn pdf_outline_items(items: &[(usize, String, usize)]) -> Vec<PdfOutlineItem> {
    items
        .iter()
        .map(|(level, title, page)| PdfOutlineItem {
            title: title.clone(),
            level: *level,
            page: *page,
        })
        .collect()
}

fn read_pdf_pages(path: &Path) -> Vec<String> {
    let Ok(document) = lopdf::Document::load(path) else {
        return Vec::new();
    };
    document
        .get_pages()
        .keys()
        .map(|page| document.extract_text(&[*page]).unwrap_or_default())
        .collect()
}

fn read_pdf_outline(path: &Path) -> Vec<PdfOutlineItem> {
    let Ok(document) = lopdf::Document::load(path) else {
        return Vec::new();
    };
    let Ok(toc) = document.get_toc() else {
        return Vec::new();
    };
    pdf_outline_items(
        &toc.toc
            .into_iter()
            .map(|item| (item.level, item.title, item.page))
            .collect::<Vec<_>>(),
    )
}

#[derive(Debug, Clone, Serialize)]
pub struct CompileReport {
    pub success: bool,
    pub pdf_data: Option<String>,
    pub diagnostics: Vec<crate::services::Diagnostic>,
    pub log: String,
    pub outline: Vec<PdfOutlineItem>,
    pub compiler: String,
    pub pages: Vec<String>,
}

pub fn compile_project_detailed(
    root: &Path,
    entry: &str,
    sources: &[SourceFile],
) -> Result<CompileReport, CompileError> {
    let entry_path = Path::new(entry);
    if entry_path.is_absolute()
        || entry_path
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(CompileError::UnsafeEntry);
    }
    let workspace = prepare_compile_workspace(root, entry, sources)?;
    let compile_root = workspace.path();
    let compiler = detect_compiler()?;
    let mut log = String::new();
    let mut success = true;
    for _ in 0..compiler_passes(compiler.kind) {
        let output = Command::new(&compiler.executable)
            .current_dir(compile_root)
            .args(compiler_arguments(compiler.kind, entry))
            .output()
            .map_err(|_| CompileError::CompilerUnavailable)?;
        log.push_str(&String::from_utf8_lossy(&output.stdout));
        log.push_str(&String::from_utf8_lossy(&output.stderr));
        if !output.status.success() {
            success = false;
            break;
        }
    }
    let diagnostics = if compiler.kind == CompilerKind::Tectonic {
        parse_tectonic_diagnostics(&log)
    } else {
        parse_latex_diagnostics(&log)
    };
    let pdf_path = compiler_output_path(compile_root, entry);
    let pdf_data = success
        .then(|| fs::read(&pdf_path).ok().map(|bytes| STANDARD.encode(bytes)))
        .flatten();
    let success = success && pdf_data.is_some();
    let pages = success
        .then(|| read_pdf_pages(&pdf_path))
        .unwrap_or_default();
    Ok(CompileReport {
        success,
        pdf_data,
        diagnostics,
        log,
        outline: success
            .then(|| read_pdf_outline(&pdf_path))
            .unwrap_or_default(),
        compiler: compiler.kind.display_name().to_string(),
        pages,
    })
}
