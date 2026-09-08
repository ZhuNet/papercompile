use papercompile_core::{core::FileSnapshot, source::propose_source_edit};
use std::fs;

#[test]
fn proposes_full_file_patch_without_writing_to_disk() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("main.tex");
    fs::write(&path, "old source").unwrap();
    let snapshot = FileSnapshot::new("main.tex", "old source");

    let changes = propose_source_edit(
        root.path(),
        "main.tex",
        &snapshot.content_hash,
        "new source",
    )
    .unwrap();

    assert_eq!(changes.patches[0].old_text, "old source");
    assert_eq!(changes.patches[0].new_text, "new source");
    assert_eq!(fs::read_to_string(path).unwrap(), "old source");
}

#[test]
fn rejects_source_edit_when_disk_file_changed() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("main.tex"), "external change").unwrap();

    assert!(propose_source_edit(root.path(), "main.tex", "stale", "new source").is_err());
}
