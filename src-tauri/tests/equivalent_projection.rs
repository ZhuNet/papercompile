use papercompile_core::latex::{LatexNodeKind, project_latex};

#[test]
fn input_commands_are_not_projected_as_visible_body_text() {
    let source = "\\begin{document}\n\\input{chapter}\n\\end{document}";
    let nodes = project_latex("main.tex", source);
    assert!(nodes.iter().all(|node| !node.raw.contains("\\input")));
}

#[test]
fn section_nodes_include_display_numbering() {
    let source =
        "\\begin{document}\n\\section{Intro}\nText\n\\section{Results}\nMore\n\\end{document}";
    let nodes = project_latex("main.tex", source);
    let sections: Vec<_> = nodes
        .iter()
        .filter(|node| node.kind == LatexNodeKind::Section)
        .collect();
    assert_eq!(sections[0].display, "1 Intro");
    assert_eq!(sections[1].display, "2 Results");
}

#[test]
fn fixing_invalid_source_restores_normal_projection() {
    let broken = "\\begin{document}\n\\unknowncommand{bad}\n\\end{document}";
    let fixed = "\\begin{document}\n\\section{Fixed}\nVisible\n\\end{document}";
    assert_eq!(
        project_latex("main.tex", broken)[0].kind,
        LatexNodeKind::RawLatex
    );
    assert_eq!(
        project_latex("main.tex", fixed)[0].kind,
        LatexNodeKind::Section
    );
}

#[test]
fn projects_all_supported_heading_levels_with_hierarchical_numbers() {
    let source = "\\begin{document}\n\\chapter{Main}\n\\section{Intro}\n\\subsection{Setup}\nText\n\\end{document}";
    let nodes = project_latex("main.tex", source);
    let headings: Vec<_> = nodes
        .iter()
        .filter(|node| {
            matches!(
                node.kind,
                LatexNodeKind::Chapter | LatexNodeKind::Section | LatexNodeKind::Subsection
            )
        })
        .collect();
    assert_eq!(
        headings
            .iter()
            .map(|node| node.display.as_str())
            .collect::<Vec<_>>(),
        vec!["1 Main", "1.1 Intro", "1.1.1 Setup"]
    );
}
