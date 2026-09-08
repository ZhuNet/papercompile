use papercompile_core::project::{
    ProjectFileError, create_project_folder, create_project_text_file, delete_project_item,
    import_project_files, rename_project_item,
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
        rename_project_item(root.path(), "main.tex", "../outside.tex"),
        Err(ProjectFileError::UnsafePath)
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
