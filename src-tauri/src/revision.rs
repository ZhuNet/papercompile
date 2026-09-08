use crate::core::{FileSnapshot, ProposedChangeSet, apply_patch};
use std::{fs, path::Path};
use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum RevisionWriteError {
    #[error("revision path is unsafe")]
    UnsafePath,
    #[error("project file cannot be read or written")]
    Io,
    #[error("project file changed externally")]
    StaleSnapshot,
    #[error("revision patch is invalid")]
    InvalidPatch,
}

pub fn accept_change_set(
    root: &Path,
    changes: &ProposedChangeSet,
) -> Result<(), RevisionWriteError> {
    let mut candidates = Vec::new();
    for patch in &changes.patches {
        let relative = Path::new(&patch.path);
        if relative.is_absolute()
            || relative
                .components()
                .any(|part| matches!(part, std::path::Component::ParentDir))
        {
            return Err(RevisionWriteError::UnsafePath);
        }
        let path = root.join(relative);
        let current = fs::read_to_string(&path).map_err(|_| RevisionWriteError::Io)?;
        let snapshot = FileSnapshot::new(&patch.path, current);
        if snapshot.content_hash != patch.expected_hash {
            return Err(RevisionWriteError::StaleSnapshot);
        }
        let updated =
            apply_patch(&snapshot, patch).map_err(|_| RevisionWriteError::InvalidPatch)?;
        candidates.push((path, updated.content));
    }
    for (path, content) in candidates {
        let temp = path.with_extension(format!(
            "{}.papercompile.tmp",
            path.extension()
                .and_then(|value| value.to_str())
                .unwrap_or("file")
        ));
        fs::write(&temp, content).map_err(|_| RevisionWriteError::Io)?;
        fs::rename(&temp, &path).map_err(|_| RevisionWriteError::Io)?;
    }
    Ok(())
}
