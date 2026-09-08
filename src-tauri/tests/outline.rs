use papercompile_core::outline::{SectionLevel, extract_outline};

#[test]
fn extracts_nested_sections_in_source_order() {
    let files = vec![
        (
            "main.tex".to_string(),
            "\\section{Intro}\n\\input{chapter}".to_string(),
        ),
        (
            "chapter.tex".to_string(),
            "\\subsection{Method}\nText\n\\section{Results}".to_string(),
        ),
    ];
    let outline = extract_outline(&files);

    assert_eq!(outline.len(), 3);
    assert_eq!(outline[0].title, "Intro");
    assert_eq!(outline[0].level, SectionLevel::Section);
    assert_eq!(outline[0].display, "1 Intro");
    assert_eq!(outline[1].title, "Method");
    assert_eq!(outline[1].level, SectionLevel::Subsection);
    assert_eq!(outline[1].display, "1.1 Method");
    assert_eq!(outline[1].file, "chapter.tex");
    assert_eq!(outline[2].title, "Results");
}

#[test]
fn ignores_section_commands_in_preamble_and_comments() {
    let files = vec![(
        "main.tex".to_string(),
        "% \\section{No}\n\\documentclass{article}\n\\begin{document}\n\\section{Yes}".to_string(),
    )];
    let outline = extract_outline(&files);
    assert_eq!(
        outline
            .iter()
            .map(|item| item.title.as_str())
            .collect::<Vec<_>>(),
        vec!["Yes"]
    );
}
