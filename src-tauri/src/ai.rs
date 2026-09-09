use serde::{Deserialize, Serialize};
use thiserror::Error;

const ACTION_SCHEMA: &str = include_str!("ai_schema.json");

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChatRequest {
    pub endpoint: String,
    pub model: String,
    pub system: String,
    pub messages: Vec<ChatMessage>,
}

impl ChatRequest {
    pub fn new(
        base_url: &str,
        model: &str,
        instruction: &str,
        directory: &str,
        history: &[ChatMessage],
    ) -> Self {
        Self {
            endpoint: format!("{}/chat/completions", base_url.trim_end_matches('/')),
            model: model.into(),
            system: format!(
                "You are the execution assistant for the current LaTeX project. Act directly on the user's request and take responsibility for completing it. You may inspect the project directory and modify LaTeX source files to edit the document. Ordinary text is returned as-is. Put each file operation in the fixed <tool>...</tool> schema below; use one block per action, including when there are multiple actions. Use <tool>Done</tool> only after confirming that the user's requested work is fully completed.\nAction schema:\n{ACTION_SCHEMA}\nProject files:\n{directory}",
                ACTION_SCHEMA = ACTION_SCHEMA,
                directory = directory
            ),
            messages: history
                .iter()
                .cloned()
                .chain((!instruction.trim().is_empty()).then(|| ChatMessage {
                    role: "user".into(),
                    content: instruction.into(),
                }))
                .collect(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AiAction {
    ReadFile {
        path: String,
    },
    Patch {
        path: String,
        old_text: String,
        new_text: String,
    },
    CreateFile {
        path: String,
        content: String,
    },
    CreateFolder {
        path: String,
    },
    Rename {
        from: String,
        to: String,
    },
    Move {
        from: String,
        to: String,
    },
    Trash {
        path: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AiResponse {
    pub id: String,
    pub message: String,
    pub segments: Vec<AiSegment>,
    pub actions: Vec<AiAction>,
    #[serde(default)]
    pub tool_errors: Vec<String>,
    #[serde(default)]
    pub done: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AiSegment {
    Text { text: String },
    Tool { action: AiAction },
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum AiResponseError {
    #[error("invalid AI response")]
    InvalidResponse,
    #[error("invalid structured action JSON")]
    InvalidPatch,
}

fn validate_action(action: &AiAction) -> Result<(), String> {
    let safe = |path: &str| {
        !path.trim().is_empty()
            && !path.starts_with('/')
            && !path.contains("\\")
            && !path.split('/').any(|part| part == "..")
            && !path.contains(':')
    };
    match action {
        AiAction::ReadFile { path }
        | AiAction::CreateFolder { path }
        | AiAction::Trash { path } => {
            if safe(path) {
                Ok(())
            } else {
                Err("path must be a non-empty project-relative path".into())
            }
        }
        AiAction::CreateFile { path, .. } => {
            if safe(path) {
                Ok(())
            } else {
                Err("path must be a non-empty project-relative path".into())
            }
        }
        AiAction::Rename { from, to } | AiAction::Move { from, to } => {
            if safe(from) && safe(to) {
                Ok(())
            } else {
                Err("from and to must be project-relative paths".into())
            }
        }
        AiAction::Patch { path, old_text, .. } => {
            if !path.to_lowercase().ends_with(".tex") {
                return Err("patch is only allowed for .tex source".into());
            }
            if !safe(path) {
                return Err("path must be a project-relative path".into());
            }
            if old_text.is_empty() {
                return Err("patch old_text must not be empty".into());
            }
            Ok(())
        }
    }
}

#[derive(Deserialize)]
struct Completion {
    choices: Vec<Choice>,
}
#[derive(Deserialize)]
struct Choice {
    message: Message,
}
#[derive(Deserialize)]
struct Message {
    content: Option<String>,
}

pub fn parse_ai_response(response: &str) -> Result<AiResponse, AiResponseError> {
    let completion: Completion =
        serde_json::from_str(response).map_err(|_| AiResponseError::InvalidResponse)?;
    let content = completion
        .choices
        .first()
        .and_then(|choice| choice.message.content.as_deref())
        .ok_or(AiResponseError::InvalidResponse)?;
    parse_mixed_response(content)
}

pub fn parse_mixed_response(content: &str) -> Result<AiResponse, AiResponseError> {
    let mut message = String::new();
    let mut segments = Vec::new();
    let mut actions = Vec::new();
    let mut done = false;
    let mut cursor = 0;
    let mut errors = Vec::new();
    while let Some(relative_start) = content[cursor..].find("<tool>") {
        let start = cursor + relative_start;
        let text = &content[cursor..start];
        message.push_str(text);
        if !text.is_empty() {
            segments.push(AiSegment::Text { text: text.into() });
        }
        let json_start = start + "<tool>".len();
        let Some(relative_end) = content[json_start..].find("</tool>") else {
            errors.push("missing </tool>".to_string());
            break;
        };
        let end = json_start + relative_end;
        let tool_content = content[json_start..end].trim();
        if tool_content == "Done" {
            done = true;
        } else {
            match serde_json::from_str::<AiAction>(tool_content) {
                Ok(action) => match validate_action(&action) {
                    Ok(()) => {
                        segments.push(AiSegment::Tool {
                            action: action.clone(),
                        });
                        actions.push(action);
                    }
                    Err(error) => errors.push(error),
                },
                Err(error) => errors.push(format!("invalid tool JSON: {error}")),
            }
        }
        cursor = end + "</tool>".len();
    }
    let text = &content[cursor..];
    message.push_str(text);
    if !text.is_empty() {
        segments.push(AiSegment::Text { text: text.into() });
    }
    Ok(AiResponse {
        id: "ai-response".into(),
        message: message.trim().into(),
        segments,
        actions,
        tool_errors: errors,
        done,
    })
}

#[derive(Debug, Serialize)]
pub struct OpenAiPayload<'a> {
    pub model: &'a str,
    pub messages: Vec<OpenAiMessage<'a>>,
    pub temperature: f32,
}

#[derive(Debug, Serialize)]
pub struct OpenAiMessage<'a> {
    pub role: &'a str,
    pub content: &'a str,
}

pub async fn request_actions(
    request: ChatRequest,
    api_key: &str,
) -> Result<AiResponse, AiResponseError> {
    if api_key.trim().is_empty() {
        return Err(AiResponseError::InvalidResponse);
    }
    let mut messages = vec![OpenAiMessage {
        role: "system",
        content: &request.system,
    }];
    messages.extend(request.messages.iter().map(|message| OpenAiMessage {
        role: &message.role,
        content: &message.content,
    }));
    let payload = OpenAiPayload {
        model: &request.model,
        messages,
        temperature: 0.1,
    };
    let response = reqwest::Client::new()
        .post(request.endpoint)
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|_| AiResponseError::InvalidResponse)?;
    let body = response
        .text()
        .await
        .map_err(|_| AiResponseError::InvalidResponse)?;
    parse_ai_response(&body)
}
