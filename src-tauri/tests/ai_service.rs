use papercompile_core::ai::{AiAction, AiResponseError, AiSegment, ChatRequest, parse_ai_response};

#[test]
fn builds_openai_compatible_request_with_structured_output_instruction() {
    let request = ChatRequest::new(
        "https://api.example.com/v1",
        "model-x",
        "Improve the abstract",
        "main.tex",
        &[],
    );

    assert_eq!(
        request.endpoint,
        "https://api.example.com/v1/chat/completions"
    );
    assert_eq!(request.model, "model-x");
    assert!(request.system.contains("Action schema:"));
    assert!(request.system.contains("multiple actions"));
    assert!(request.system.contains("fully completed"));
    assert!(request.system.contains("main.tex"));
}

#[test]
fn places_the_current_directory_listing_and_history_in_the_ai_request() {
    let request = ChatRequest::new(
        "https://api.example.com/v1",
        "model-x",
        "Rename the draft",
        "main.tex\nsections/\nsections/draft.tex",
        &[papercompile_core::ai::ChatMessage {
            role: "assistant".into(),
            content: "[分析文本]\nAssistant: inspected".into(),
        }],
    );

    assert!(request.system.contains("sections/draft.tex"));
    assert!(request.system.contains("current LaTeX project"));
    assert!(!request.system.contains("absolute paths"));
    assert!(!request.system.contains(".. segments"));
    assert!(!request.system.contains("every file action"));
    assert!(
        request
            .messages
            .iter()
            .any(|message| message.content.contains("Assistant: inspected"))
    );
    assert!(!request.system.contains("compile"));
}

#[test]
fn parses_json_content_from_chat_completion() {
    let response = r#"{"choices":[{"message":{"content":"Done. <tool>{\"type\":\"create_folder\",\"path\":\"sections\"}</tool>"}}]}"#;

    let parsed = parse_ai_response(response).expect("valid completion should parse");

    assert_eq!(parsed.id, "ai-response");
    assert_eq!(parsed.message, "Done.");
    assert!(parsed.tool_errors.is_empty());
    assert_eq!(
        parsed.actions,
        vec![AiAction::CreateFolder {
            path: "sections".into()
        }]
    );
}

#[test]
fn preserves_real_history_and_appends_only_the_current_user_instruction() {
    let request = ChatRequest::new(
        "https://api.example.com/v1",
        "model-x",
        "Rename the draft",
        "main.tex",
        &[
            papercompile_core::ai::ChatMessage {
                role: "user".into(),
                content: "q1".into(),
            },
            papercompile_core::ai::ChatMessage {
                role: "assistant".into(),
                content: "analysis 1\n\nread main.tex\n\nExecution results:\nmain.tex: source"
                    .into(),
            },
        ],
    );

    assert_eq!(request.messages.len(), 3);
    assert_eq!(request.messages[0].role, "user");
    assert_eq!(request.messages[0].content, "q1");
    assert_eq!(request.messages[1].role, "assistant");
    assert_eq!(request.messages[1].content, "analysis 1\n\nread main.tex\n\nExecution results:\nmain.tex: source");
    assert_eq!(request.messages[2].role, "user");
    assert_eq!(request.messages[2].content, "Rename the draft");
}

#[test]
fn does_not_append_an_implicit_follow_up_user_message() {
    let request = ChatRequest::new(
        "https://api.example.com/v1",
        "model-x",
        "",
        "main.tex",
        &[papercompile_core::ai::ChatMessage {
            role: "assistant".into(),
            content: "analysis".into(),
        }],
    );

    assert_eq!(request.messages.len(), 1);
    assert_eq!(
        request.messages[0].content,
        "analysis"
    );
}

#[test]
fn extracts_valid_tools_in_order_and_keeps_plain_text() {
    let parsed = papercompile_core::ai::parse_mixed_response(
        "A <tool>{\"type\":\"create_folder\",\"path\":\"a\"}</tool> middle <tool>{\"type\":\"trash\",\"path\":\"b.tex\"}</tool> end",
    ).expect("mixed response should parse");
    assert_eq!(
        parsed.segments,
        vec![
            AiSegment::Text { text: "A ".into() },
            AiSegment::Tool {
                action: AiAction::CreateFolder { path: "a".into() }
            },
            AiSegment::Text { text: " middle ".into() },
            AiSegment::Tool {
                action: AiAction::Trash { path: "b.tex".into() }
            },
            AiSegment::Text { text: " end".into() },
        ]
    );
    assert!(matches!(parsed.actions[0], AiAction::CreateFolder { .. }));
    assert!(matches!(parsed.actions[1], AiAction::Trash { .. }));
}

#[test]
fn excludes_invalid_tools_from_ordered_display_segments_but_keeps_the_error() {
    let parsed = papercompile_core::ai::parse_mixed_response(
        "before <tool>{\"type\":\"patch\",\"path\":\"a.txt\",\"old_text\":\"x\",\"new_text\":\"y\"}</tool> after",
    )
    .expect("mixed response should parse");

    assert_eq!(
        parsed.segments,
        vec![
            AiSegment::Text { text: "before ".into() },
            AiSegment::Text { text: " after".into() },
        ]
    );
    assert_eq!(parsed.tool_errors.len(), 1);
}

#[test]
fn accepts_a_patch_without_model_provided_character_offsets() {
    let parsed = papercompile_core::ai::parse_mixed_response(
        "<tool>{\"type\":\"patch\",\"path\":\"main.tex\",\"old_text\":\"Old title\",\"new_text\":\"New title\"}</tool>",
    )
    .expect("patch should parse");

    assert_eq!(parsed.actions.len(), 1);
    assert!(parsed.tool_errors.is_empty());
}

#[test]
fn recognizes_done_tool_as_completion_without_a_file_action() {
    let parsed = papercompile_core::ai::parse_mixed_response(
        "All requested edits are finished. <tool>Done</tool>",
    )
    .expect("completion should parse");
    assert!(parsed.done);
    assert!(parsed.actions.is_empty());
    assert_eq!(parsed.message, "All requested edits are finished.");
}

#[test]
fn keeps_file_actions_before_done_in_the_same_response() {
    let parsed = papercompile_core::ai::parse_mixed_response(
        "<tool>{\"type\":\"create_folder\",\"path\":\"chapters\"}</tool><tool>Done</tool>",
    )
    .expect("mixed response should parse");
    assert!(parsed.done);
    assert_eq!(parsed.actions.len(), 1);
}

#[test]
fn keeps_valid_tools_when_a_later_tool_is_invalid() {
    let parsed = papercompile_core::ai::parse_mixed_response(
        "<tool>{\"type\":\"create_folder\",\"path\":\"a\"}</tool><tool>{\"type\":\"patch\",\"path\":\"a.txt\",\"old_text\":\"x\",\"new_text\":\"y\"}</tool>",
    ).expect("mixed response should parse");
    assert_eq!(parsed.actions.len(), 1);
    assert!(!parsed.message.contains("patch is only allowed"));
    assert_eq!(parsed.tool_errors.len(), 1);
    assert!(parsed.tool_errors[0].contains("patch is only allowed"));
}

#[test]
fn rejects_completion_without_structured_content() {
    assert_eq!(
        parse_ai_response(r#"{"choices":[]}"#),
        Err(AiResponseError::InvalidResponse)
    );
}
