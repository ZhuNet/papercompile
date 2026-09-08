use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileSnapshot {
    pub path: String,
    pub content: String,
    pub content_hash: String,
}

impl FileSnapshot {
    pub fn new(path: impl Into<String>, content: impl Into<String>) -> Self {
        let content = content.into();
        Self {
            path: path.into(),
            content_hash: hash(&content),
            content,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FilePatch {
    pub path: String,
    pub expected_hash: String,
    pub start: usize,
    pub end: usize,
    pub old_text: String,
    pub new_text: String,
}

impl FilePatch {
    pub fn replace_all(snapshot: &FileSnapshot, new_text: impl Into<String>) -> Self {
        Self {
            path: snapshot.path.clone(),
            expected_hash: snapshot.content_hash.clone(),
            start: 0,
            end: snapshot.content.len(),
            old_text: snapshot.content.clone(),
            new_text: new_text.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ChangeSource {
    HumanVisual,
    HumanSource,
    Ai,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProposedChangeSet {
    pub id: String,
    pub source: ChangeSource,
    pub summary: String,
    pub patches: Vec<FilePatch>,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum PatchError {
    #[error("file snapshot is stale")]
    StaleSnapshot,
    #[error("patch range is invalid")]
    InvalidRange,
    #[error("patch context does not match")]
    ContextMismatch,
}

pub fn apply_patch(snapshot: &FileSnapshot, patch: &FilePatch) -> Result<FileSnapshot, PatchError> {
    if snapshot.path != patch.path || snapshot.content_hash != patch.expected_hash {
        return Err(PatchError::StaleSnapshot);
    }
    if patch.start > patch.end || patch.end > snapshot.content.len() {
        return Err(PatchError::InvalidRange);
    }
    if snapshot.content.get(patch.start..patch.end) != Some(patch.old_text.as_str()) {
        return Err(PatchError::ContextMismatch);
    }
    let mut content = snapshot.content.clone();
    content.replace_range(patch.start..patch.end, &patch.new_text);
    Ok(FileSnapshot::new(snapshot.path.clone(), content))
}

pub fn apply_change_set(
    snapshots: &[FileSnapshot],
    changes: &ProposedChangeSet,
) -> Result<Vec<FileSnapshot>, PatchError> {
    let mut updated = snapshots.to_vec();
    for patch in &changes.patches {
        let index = updated
            .iter()
            .position(|file| file.path == patch.path)
            .ok_or(PatchError::StaleSnapshot)?;
        updated[index] = apply_patch(&updated[index], patch)?;
    }
    Ok(updated)
}

fn hash(content: &str) -> String {
    format!("{:x}", Sha256::digest(content.as_bytes()))
}
