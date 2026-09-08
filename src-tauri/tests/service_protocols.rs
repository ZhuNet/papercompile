use papercompile_core::core::FileSnapshot;
use papercompile_core::services::{
    AiResponseError, DiagnosticSeverity, parse_ai_change_set, parse_latex_diagnostics,
    parse_tectonic_diagnostics,
};

#[test]
fn parses_tectonic_error_into_a_locatable_diagnostic() {
    let output = "error: sections/method.tex:42: Undefined control sequence\nwarning: references.bib:8: missing field year";

    let diagnostics = parse_tectonic_diagnostics(output);

    assert_eq!(diagnostics.len(), 2);
    assert_eq!(diagnostics[0].severity, DiagnosticSeverity::Error);
    assert_eq!(diagnostics[0].file, "sections/method.tex");
    assert_eq!(diagnostics[0].line, Some(42));
    assert_eq!(diagnostics[0].message, "Undefined control sequence");
}

#[test]
fn parses_xelatex_file_line_errors() {
    let output = "./sections/method.tex:42: Undefined control sequence.\nmain.tex:17: LaTeX Warning: Reference `fig:x' undefined";

    let diagnostics = parse_latex_diagnostics(output);

    assert_eq!(diagnostics.len(), 2);
    assert_eq!(diagnostics[0].severity, DiagnosticSeverity::Error);
    assert_eq!(diagnostics[0].file, "./sections/method.tex");
    assert_eq!(diagnostics[0].line, Some(42));
    assert_eq!(diagnostics[1].severity, DiagnosticSeverity::Warning);
}

#[test]
fn accepts_ai_change_set_when_patch_matches_current_snapshot() {
    let snapshot = FileSnapshot::new("main.tex", "Old text");
    let json = format!(
        r#"{{
      "id":"task-1","source":"Ai","summary":"Improve wording","patches":[{{
        "path":"main.tex","expected_hash":"{}","start":0,"end":3,
        "old_text":"Old","new_text":"New"
      }}]
    }}"#,
        snapshot.content_hash
    );

    let changes = parse_ai_change_set(&json, &[snapshot]).expect("valid AI patch should pass");

    assert_eq!(changes.summary, "Improve wording");
}

#[test]
fn rejects_ai_change_set_that_targets_parent_directory() {
    let snapshot = FileSnapshot::new("main.tex", "Old text");
    let json = format!(
        r#"{{
      "id":"task-2","source":"Ai","summary":"Escape project","patches":[{{
        "path":"../secret.tex","expected_hash":"{}","start":0,"end":3,
        "old_text":"Old","new_text":"New"
      }}]
    }}"#,
        snapshot.content_hash
    );

    assert_eq!(
        parse_ai_change_set(&json, &[snapshot]),
        Err(AiResponseError::UnsafePath)
    );
}
