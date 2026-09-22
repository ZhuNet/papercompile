use papercompile_core::project::{
    ProjectFileError, create_project_folder, create_project_text_file, delete_project_item,
    import_project_files, rename_project_item, scan_project,
};
use std::fs;

#[test]
fn creates_renames_and_deletes_project_items() {
    let root = tempfile::tempdir().unwrap();
    create_project_folder(root.path(), "sections").unwrap();
    create_project_text_file(root.path(), "sections/intro.tex").unwrap();
    fs::write(root.path().join("sections/intro.tex"), "content").unwrap();

    rename_project_item(root.path(), "sections/intro.tex", "sections/background.tex").unwrap();
    assert_eq!(
        fs::read_to_string(root.path().join("sections/background.tex")).unwrap(),
        "content"
    );

    delete_project_item(root.path(), "sections/background.tex").unwrap();
    assert!(!root.path().join("sections/background.tex").exists());
}

#[test]
fn renaming_an_item_to_its_existing_path_is_a_noop() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("main.tex"), "content").unwrap();

    rename_project_item(root.path(), "main.tex", "main.tex").unwrap();
    assert_eq!(fs::read_to_string(root.path().join("main.tex")).unwrap(), "content");
}

#[test]
fn imports_external_files_into_a_project_folder() {
    let root = tempfile::tempdir().unwrap();
    let upload = tempfile::tempdir().unwrap();
    let source = upload.path().join("figure.png");
    fs::write(&source, [1_u8, 2, 3]).unwrap();

    let imported = import_project_files(root.path(), "figures", &[source]).unwrap();

    assert_eq!(imported, vec!["figures/figure.png"]);
    assert_eq!(
        fs::read(root.path().join("figures/figure.png")).unwrap(),
        [1_u8, 2, 3]
    );
}

#[test]
fn rejects_paths_that_escape_or_overwrite_project_items() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("main.tex"), "original").unwrap();

    assert_eq!(
        create_project_text_file(root.path(), "../outside.tex"),
        Err(ProjectFileError::UnsafePath)
    );
    assert_eq!(
        create_project_text_file(root.path(), "main.tex"),
        Err(ProjectFileError::AlreadyExists)
    );
    assert_eq!(
        create_project_text_file(root.path(), "CON"),
        Err(ProjectFileError::InvalidName)
    );
    assert_eq!(
        create_project_folder(root.path(), "bad?name"),
        Err(ProjectFileError::InvalidName)
    );
    assert_eq!(
        rename_project_item(root.path(), "main.tex", "../outside.tex"),
        Err(ProjectFileError::UnsafePath)
    );
    assert_eq!(
        rename_project_item(root.path(), "main.tex", "aux.txt"),
        Err(ProjectFileError::InvalidName)
    );
    assert_eq!(
        delete_project_item(root.path(), ""),
        Err(ProjectFileError::UnsafePath)
    );
}

#[test]
fn deleting_an_item_uses_the_system_trash_operation() {
    let root = tempfile::tempdir().unwrap();
    let item = root.path().join("discard-me.tex");
    fs::write(&item, "content").unwrap();

    delete_project_item(root.path(), "discard-me.tex").unwrap();

    assert!(!item.exists());
}

#[test]
fn scans_log_files_as_editable_text() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("main.tex"), "\\documentclass{article}").unwrap();
    fs::write(root.path().join("build.log"), "LaTeX output\n").unwrap();

    let project = scan_project(root.path()).unwrap();
    let log = project.files.iter().find(|file| file.path == "build.log").unwrap();

    assert_eq!(log.content.as_deref(), Some("LaTeX output\n"));
}

#[test]
fn detects_text_and_binary_files_by_content_not_extension() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("main.tex"), "\\documentclass{article}").unwrap();
    fs::write(root.path().join("notes.data"), "plain text").unwrap();
    fs::write(root.path().join("image.data"), [0_u8, 1, 2, 3]).unwrap();

    let project = scan_project(root.path()).unwrap();

    assert_eq!(
        project.files.iter().find(|file| file.path == "notes.data").unwrap().content.as_deref(),
        Some("plain text")
    );
    assert_eq!(
        project.files.iter().find(|file| file.path == "image.data").unwrap().content,
        None
    );
}
