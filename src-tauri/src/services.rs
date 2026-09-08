use crate::core::{ChangeSource, FilePatch, FileSnapshot, ProposedChangeSet};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum DiagnosticSeverity {
    Error,
    Warning,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Diagnostic {
    pub severity: DiagnosticSeverity,
    pub file: String,
    pub line: Option<usize>,
    pub message: String,
}

pub fn parse_tectonic_diagnostics(output: &str) -> Vec<Diagnostic> {
    output
        .lines()
        .filter_map(|line| {
            let (severity, rest) = if let Some(rest) = line.strip_prefix("error: ") {
                (DiagnosticSeverity::Error, rest)
            } else if let Some(rest) = line.strip_prefix("warning: ") {
                (DiagnosticSeverity::Warning, rest)
            } else {
                return None;
            };
            let (location, message) = rest.split_once(": ")?;
            let (file, line) = location
                .rsplit_once(':')
                .map(|(file, line)| (file.to_string(), line.parse().ok()))
                .unwrap_or((location.to_string(), None));
            Some(Diagnostic {
                severity,
                file,
                line,
                message: message.trim().to_string(),
            })
        })
        .collect()
}

pub fn parse_latex_diagnostics(output: &str) -> Vec<Diagnostic> {
    output
        .lines()
        .filter_map(|line| {
            let (start, end, line_number) =
                line.char_indices().find_map(|(start, character)| {
                    if character != ':' {
                        return None;
                    }
                    let remainder = &line[start + 1..];
                    let relative_end = remainder.find(':')?;
                    let line_number = remainder[..relative_end].trim().parse::<usize>().ok()?;
                    Some((start, start + 1 + relative_end, line_number))
                })?;
            let file = line[..start].trim();
            let message = line[end + 1..].trim();
            if file.is_empty() || message.is_empty() {
                return None;
            }
            Some(Diagnostic {
                severity: if message.to_ascii_lowercase().contains("warning") {
                    DiagnosticSeverity::Warning
                } else {
                    DiagnosticSeverity::Error
                },
                file: file.to_string(),
                line: Some(line_number),
                message: message.to_string(),
            })
        })
        .collect()
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum AiResponseError {
    #[error("invalid JSON response")]
    InvalidJson,
    #[error("unsafe project path")]
    UnsafePath,
    #[error("patch does not match current file")]
    StalePatch,
}

#[derive(Deserialize)]
struct RawChangeSet {
    id: String,
    summary: String,
    patches: Vec<FilePatch>,
}

pub fn parse_ai_change_set(
    json: &str,
    snapshots: &[FileSnapshot],
) -> Result<ProposedChangeSet, AiResponseError> {
    let raw: RawChangeSet = serde_json::from_str(json).map_err(|_| AiResponseError::InvalidJson)?;
    for patch in &raw.patches {
        if patch.path.is_empty() || patch.path.starts_with('/') || patch.path.contains("..") {
            return Err(AiResponseError::UnsafePath);
        }
        let snapshot = snapshots
            .iter()
            .find(|file| file.path == patch.path)
            .ok_or(AiResponseError::StalePatch)?;
        if snapshot.content_hash != patch.expected_hash {
            return Err(AiResponseError::StalePatch);
        }
    }
    Ok(ProposedChangeSet {
        id: raw.id,
        source: ChangeSource::Ai,
        summary: raw.summary,
        patches: raw.patches,
    })
}
