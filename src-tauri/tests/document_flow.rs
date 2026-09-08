use papercompile_core::project::open_project;
use std::fs;

#[test]
fn project_exposes_one_expanded_body_flow_for_editor_and_outline() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("main.tex"), "\\documentclass{article}\n\\begin{document}\n\\section{Intro}\n\\input{chapter}\n\\end{document}").unwrap();
    fs::write(
        root.path().join("chapter.tex"),
        "\\section{Results}\nVisible results.",
    )
    .unwrap();

    let project = open_project(root.path(), None).unwrap();

    assert_eq!(project.body.len(), 3);
    assert_eq!(project.body[0].display, "1 Intro");
    assert_eq!(project.body[1].display, "2 Results");
    assert_eq!(project.body[1].file, "chapter.tex");
    assert_eq!(project.outline[1].id, project.body[1].id);
}
