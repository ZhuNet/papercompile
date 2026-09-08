use papercompile_core::latex::{LatexNodeKind, project_latex};

#[test]
fn projects_sections_paragraphs_and_inline_styles_with_source_ranges() {
    let source =
        "\\section{Introduction}\nFirst \\textbf{important} paragraph.\n\nSecond paragraph.";

    let nodes = project_latex("intro.tex", source);

    assert_eq!(nodes[0].kind, LatexNodeKind::Section);
    assert_eq!(nodes[0].text, "Introduction");
    assert_eq!(
        &source[nodes[0].start..nodes[0].end],
        "\\section{Introduction}"
    );
    assert_eq!(nodes[1].kind, LatexNodeKind::Paragraph);
    assert_eq!(nodes[1].children[1].kind, LatexNodeKind::Bold);
    assert_eq!(nodes[1].children[1].text, "important");
    assert_eq!(nodes[2].text, "Second paragraph.");
}

#[test]
fn preserves_unknown_environment_as_raw_latex() {
    let source = "\\begin{custom}\n\\mystery{value}\n\\end{custom}";

    let nodes = project_latex("main.tex", source);

    assert_eq!(nodes.len(), 1);
    assert_eq!(nodes[0].kind, LatexNodeKind::RawLatex);
    assert_eq!(nodes[0].raw, source);
}

#[test]
fn projects_display_math_without_losing_source() {
    let source = "Before.\n\n\\[E = mc^2\\]\n\nAfter.";

    let nodes = project_latex("main.tex", source);

    assert_eq!(nodes[1].kind, LatexNodeKind::DisplayMath);
    assert_eq!(nodes[1].text, "E = mc^2");
    assert_eq!(&source[nodes[1].start..nodes[1].end], "\\[E = mc^2\\]");
}

#[test]
fn hides_preamble_and_document_control_commands_from_visual_projection() {
    let source = "\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\n\\section{Body}\nVisible text.\n\\input{chapter}\n\\bibliography{refs}\n\\end{document}";

    let nodes = project_latex("main.tex", source);

    assert!(nodes.iter().any(|node| node.text == "Body"));
    assert!(nodes.iter().any(|node| node.text.contains("Visible text")));
    assert!(!nodes.iter().any(|node| node.raw.contains("documentclass")
        || node.raw.contains("input{")
        || node.raw.contains("bibliography{")));
}

#[test]
fn parses_nested_heading_arguments_without_truncating_the_source_range() {
    let source = r#"\section{A title with \textbf{nested} text}
Visible."#;

    let nodes = project_latex("main.tex", source);

    assert_eq!(nodes[0].kind, LatexNodeKind::Section);
    assert_eq!(nodes[0].text, "A title with \\textbf{nested} text");
    assert_eq!(
        nodes[0].raw,
        r#"\section{A title with \textbf{nested} text}"#
    );
}

#[test]
fn ignores_comments_when_projecting_visual_text() {
    let source = "Visible % hidden comment\n\n% whole line\nNext.";

    let nodes = project_latex("main.tex", source);

    assert_eq!(nodes.len(), 2);
    assert_eq!(nodes[0].text, "Visible");
    assert_eq!(nodes[1].text, "Next.");
    assert!(!nodes.iter().any(|node| node.text.contains("hidden")));
}

#[test]
fn preserves_order_and_ranges_for_multiple_inline_commands() {
    let source = "A \\textbf{bold} and \\textit{italic}.";

    let nodes = project_latex("main.tex", source);
    let children = &nodes[0].children;

    assert_eq!(children.len(), 5);
    assert_eq!(children[0].text, "A ");
    assert_eq!(children[1].kind, LatexNodeKind::Bold);
    assert_eq!(children[1].text, "bold");
    assert_eq!(children[2].text, " and ");
    assert_eq!(children[3].kind, LatexNodeKind::Italic);
    assert_eq!(children[3].text, "italic");
    assert_eq!(children[4].text, ".");
    assert_eq!(
        &source[children[3].start..children[3].end],
        "\\textit{italic}"
    );
}

#[test]
fn projects_common_latex_environment_instead_of_marking_the_whole_file_raw() {
    let source = "\\begin{abstract}\nA concise abstract.\n\\end{abstract}";

    let nodes = project_latex("abstract.tex", source);

    assert_eq!(nodes.len(), 1);
    assert_eq!(nodes[0].kind, LatexNodeKind::Paragraph);
    assert_eq!(nodes[0].text, "A concise abstract.");
}

#[test]
fn ignores_non_visual_metadata_commands() {
    let source = "\\section{Intro}\n\\label{sec:intro}\nText.";

    let nodes = project_latex("main.tex", source);

    assert_eq!(nodes.len(), 2);
    assert!(
        nodes
            .iter()
            .all(|node| node.kind != LatexNodeKind::RawLatex)
    );
}

#[test]
fn projects_lists_images_and_captions_as_visual_nodes() {
    let source = "\\begin{itemize}\n\\item First item\n\\item Second item\n\\end{itemize}\n\\includegraphics[width=.8\\textwidth]{figures/model.png}\n\\caption{Model overview}";

    let nodes = project_latex("main.tex", source);

    assert_eq!(nodes[0].kind, LatexNodeKind::ListItem);
    assert_eq!(nodes[0].text, "First item");
    assert_eq!(nodes[1].kind, LatexNodeKind::ListItem);
    assert_eq!(nodes[2].kind, LatexNodeKind::Image);
    assert_eq!(nodes[2].text, "figures/model.png");
    assert_eq!(nodes[3].kind, LatexNodeKind::Caption);
    assert_eq!(nodes[3].text, "Model overview");
}
