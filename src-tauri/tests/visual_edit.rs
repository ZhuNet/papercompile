use papercompile_core::latex::{LatexNodeKind, edit_node_text, project_latex};

#[test]
fn edits_a_paragraph_without_touching_surrounding_latex() {
    let source = "\\section{Intro}\nOld paragraph.\n\n\\label{sec:intro}";
    let paragraph = project_latex("main.tex", source)
        .into_iter()
        .find(|node| node.kind == LatexNodeKind::Paragraph)
        .unwrap();

    let updated = edit_node_text(source, &paragraph, "New paragraph.").unwrap();

    assert_eq!(
        updated,
        "\\section{Intro}\nNew paragraph.\n\n\\label{sec:intro}"
    );
}

#[test]
fn escapes_latex_special_characters_when_editing_plain_text() {
    let source = "Plain text.";
    let node = &project_latex("main.tex", source)[0];

    let updated = edit_node_text(source, node, "Price is 50%.").unwrap();

    assert_eq!(updated, "Price is 50\\%.");
}
