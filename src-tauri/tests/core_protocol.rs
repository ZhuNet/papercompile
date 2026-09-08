use papercompile_core::core::{
    ChangeSource, FilePatch, FileSnapshot, PatchError, ProposedChangeSet, apply_change_set,
    apply_patch,
};

#[test]
fn applies_patch_only_when_snapshot_hash_matches() {
    let snapshot = FileSnapshot::new("main.tex", "Before text");
    let patch = FilePatch {
        path: "main.tex".into(),
        expected_hash: snapshot.content_hash.clone(),
        start: 0,
        end: 6,
        old_text: "Before".into(),
        new_text: "After".into(),
    };

    let updated = apply_patch(&snapshot, &patch).expect("matching patch should apply");

    assert_eq!(updated.content, "After text");
}

#[test]
fn rejects_patch_when_file_changed_externally() {
    let snapshot = FileSnapshot::new("main.tex", "Externally changed");
    let patch = FilePatch {
        path: "main.tex".into(),
        expected_hash: "stale-hash".into(),
        start: 0,
        end: 10,
        old_text: "Previously".into(),
        new_text: "Proposed".into(),
    };

    assert_eq!(
        apply_patch(&snapshot, &patch),
        Err(PatchError::StaleSnapshot)
    );
}

#[test]
fn applies_multi_file_change_set_atomically() {
    let main = FileSnapshot::new("main.tex", "Title");
    let section = FileSnapshot::new("section.tex", "Old paragraph");
    let changes = ProposedChangeSet {
        id: "ai-1".into(),
        source: ChangeSource::Ai,
        summary: "Improve title and paragraph".into(),
        patches: vec![
            FilePatch::replace_all(&main, "New title"),
            FilePatch::replace_all(&section, "New paragraph"),
        ],
    };

    let updated = apply_change_set(&[main, section], &changes).expect("set should apply");

    assert_eq!(updated[0].content, "New title");
    assert_eq!(updated[1].content, "New paragraph");
}

#[test]
fn leaves_every_file_unchanged_when_one_patch_is_stale() {
    let main = FileSnapshot::new("main.tex", "Title");
    let section = FileSnapshot::new("section.tex", "Externally changed");
    let changes = ProposedChangeSet {
        id: "ai-2".into(),
        source: ChangeSource::Ai,
        summary: "Attempt stale edit".into(),
        patches: vec![
            FilePatch::replace_all(&main, "New title"),
            FilePatch {
                path: section.path.clone(),
                expected_hash: "old".into(),
                start: 0,
                end: section.content.len(),
                old_text: section.content.clone(),
                new_text: "New paragraph".into(),
            },
        ],
    };

    assert_eq!(
        apply_change_set(&[main, section], &changes),
        Err(PatchError::StaleSnapshot)
    );
}
