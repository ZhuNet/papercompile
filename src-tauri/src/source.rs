use crate::core::{ChangeSource, FilePatch, FileSnapshot, ProposedChangeSet};
use std::{fs, path::Path};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SourceEditError {
    #[error("source path is unsafe")]
    UnsafePath,
    #[error("source file cannot be read")]
    Unreadable,
    #[error("source file changed externally")]
    StaleSnapshot,
}

pub fn propose_source_edit(
    root: &Path,
    relative: &str,
    expected_hash: &str,
    new_source: &str,
) -> Result<ProposedChangeSet, SourceEditError> {
    let relative_path = Path::new(relative);
    if relative_path.is_absolute()
        || relative_path
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(SourceEditError::UnsafePath);
    }
    let current =
        fs::read_to_string(root.join(relative_path)).map_err(|_| SourceEditError::Unreadable)?;
    let snapshot = FileSnapshot::new(relative, current);
    if snapshot.content_hash != expected_hash {
        return Err(SourceEditError::StaleSnapshot);
    }
    Ok(ProposedChangeSet {
        id: format!("source:{relative}"),
        source: ChangeSource::HumanSource,
        summary: format!("Edit {relative}"),
        patches: vec![FilePatch::replace_all(&snapshot, new_source)],
    })
}

pub fn save_source(
    root: &Path,
    relative: &str,
    expected_hash: &str,
    content: &str,
) -> Result<(), SourceEditError> {
    let relative_path = Path::new(relative);
    if relative_path.is_absolute()
        || relative_path
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(SourceEditError::UnsafePath);
    }
    let path = root.join(relative_path);
    let current = fs::read_to_string(&path).map_err(|_| SourceEditError::Unreadable)?;
    if FileSnapshot::new(relative, current).content_hash != expected_hash {
        return Err(SourceEditError::StaleSnapshot);
    }
    let temp = path.with_extension("papercompile.save.tmp");
    fs::write(&temp, content).map_err(|_| SourceEditError::Unreadable)?;
    fs::rename(temp, path).map_err(|_| SourceEditError::Unreadable)
}
