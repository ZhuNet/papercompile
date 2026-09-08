use papercompile_core::{
    core::{ChangeSource, FilePatch, FileSnapshot, ProposedChangeSet},
    revision::{RevisionWriteError, accept_change_set},
};
use std::fs;

#[test]
fn accepting_revision_writes_the_validated_candidate() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("main.tex"), "old").unwrap();
    let snapshot = FileSnapshot::new("main.tex", "old");
    let changes = change_set(vec![FilePatch::replace_all(&snapshot, "new")]);

    accept_change_set(root.path(), &changes).unwrap();

    assert_eq!(
        fs::read_to_string(root.path().join("main.tex")).unwrap(),
        "new"
    );
}

#[test]
fn stale_revision_does_not_overwrite_external_change() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("main.tex"), "external").unwrap();
    let snapshot = FileSnapshot::new("main.tex", "old");
    let changes = change_set(vec![FilePatch::replace_all(&snapshot, "new")]);

    assert_eq!(
        accept_change_set(root.path(), &changes),
        Err(RevisionWriteError::StaleSnapshot)
    );
    assert_eq!(
        fs::read_to_string(root.path().join("main.tex")).unwrap(),
        "external"
    );
}

#[test]
fn multi_file_revision_is_all_or_nothing() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("main.tex"), "main old").unwrap();
    fs::write(root.path().join("refs.bib"), "external").unwrap();
    let main = FileSnapshot::new("main.tex", "main old");
    let refs = FileSnapshot::new("refs.bib", "refs old");
    let changes = change_set(vec![
        FilePatch::replace_all(&main, "main new"),
        FilePatch::replace_all(&refs, "refs new"),
    ]);

    assert_eq!(
        accept_change_set(root.path(), &changes),
        Err(RevisionWriteError::StaleSnapshot)
    );
    assert_eq!(
        fs::read_to_string(root.path().join("main.tex")).unwrap(),
        "main old"
    );
}

fn change_set(patches: Vec<FilePatch>) -> ProposedChangeSet {
    ProposedChangeSet {
        id: "revision-1".into(),
        source: ChangeSource::HumanSource,
        summary: "Source edit".into(),
        patches,
    }
}
