use papercompile_core::agent_sidecar::{SidecarStatus, encode_sidecar_command, parse_sidecar_line};

#[test]
fn parses_sidecar_json_without_interpreting_agent_payloads() {
    let value = parse_sidecar_line(
        r#"{"type":"raw","agentId":"omp","name":"future","payload":{"value":42}}"#,
    )
    .unwrap();
    assert_eq!(value["type"], "raw");
    assert_eq!(value["payload"]["value"], 42);
}

#[test]
fn reports_invalid_sidecar_json() {
    assert!(parse_sidecar_line("not-json").is_err());
}

#[test]
fn sidecar_status_serializes_for_the_frontend() {
    let value = serde_json::to_value(SidecarStatus::Running).unwrap();
    assert_eq!(value, "running");
}

#[test]
fn encodes_one_json_command_per_line() {
    let encoded = encode_sidecar_command(&serde_json::json!({ "type": "abort", "runId": "run-1" })).unwrap();
    assert_eq!(encoded.last(), Some(&b'\n'));
    assert_eq!(encoded.iter().filter(|byte| **byte == b'\n').count(), 1);
}
