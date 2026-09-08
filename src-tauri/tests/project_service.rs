use papercompile_core::project::{ProjectError, open_project};
use std::fs;

#[test]
fn opens_multifile_project_and_follows_inputs() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("sections")).unwrap();
    fs::write(
        root.path().join("main.tex"),
        r#"\documentclass{article}
\begin{document}
\input{sections/introduction}
\bibliography{references}
\end{document}"#,
    )
    .unwrap();
    fs::write(
        root.path().join("sections/introduction.tex"),
        "\\section{Introduction}\nHello world.",
    )
    .unwrap();
    fs::write(
        root.path().join("references.bib"),
        "@article{demo, title={Demo}}",
    )
    .unwrap();
    fs::write(root.path().join("figure.png"), [0_u8, 1, 2]).unwrap();
    fs::write(root.path().join("custom.sty"), "\\ProvidesPackage{custom}").unwrap();

    let project = open_project(root.path(), None).expect("valid project should open");

    assert_eq!(project.entry, "main.tex");
    assert_eq!(project.files.len(), 5);
    assert!(
        project
            .files
            .iter()
            .any(|file| file.path == "sections/introduction.tex")
    );
    assert!(project.documents.iter().any(|document| {
        document.path == "sections/introduction.tex"
            && document
                .nodes
                .iter()
                .any(|node| node.text == "Introduction")
    }));
    assert!(project.files.iter().any(|file| file.path == "figure.png"));
    assert!(project.files.iter().any(|file| file.path == "custom.sty"));
    assert!(
        project
            .files
            .iter()
            .any(|file| file.path == "figure.png" && file.content.is_none())
    );
}

#[test]
fn asks_for_entry_when_multiple_roots_have_no_conventional_name() {
    let root = tempfile::tempdir().unwrap();
    fs::write(
        root.path().join("submission.tex"),
        "\\documentclass{article}",
    )
    .unwrap();
    fs::write(
        root.path().join("camera_ready.tex"),
        "\\documentclass{article}",
    )
    .unwrap();

    assert_eq!(
        open_project(root.path(), None),
        Err(ProjectError::AmbiguousEntry)
    );
}

#[test]
fn prefers_a_conventional_root_entry_when_multiple_tex_files_exist() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("main.tex"), "\\documentclass{article}").unwrap();
    fs::write(root.path().join("appendix.tex"), "\\documentclass{article}").unwrap();

    let project = open_project(root.path(), None).expect("main.tex should be selected");

    assert_eq!(project.entry, "main.tex");
}

#[test]
fn can_open_a_folder_with_tex_files_that_have_no_documentclass() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("notes.tex"), "\\section{Notes}\nText").unwrap();

    let project = open_project(root.path(), None).expect("the only tex file should be usable");

    assert_eq!(project.entry, "notes.tex");
}

#[test]
fn rejects_input_that_escapes_project_directory() {
    let root = tempfile::tempdir().unwrap();
    fs::write(
        root.path().join("main.tex"),
        "\\documentclass{article}\n\\input{../secret}",
    )
    .unwrap();

    assert_eq!(
        open_project(root.path(), None),
        Err(ProjectError::UnsafeDependency)
    );
}
