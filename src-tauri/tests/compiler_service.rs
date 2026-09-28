use papercompile_core::compiler::{
    CompileError, CompilerKind, compile_project_with, compiler_arguments, compiler_output_path,
    compiler_passes, enable_pdf_bookmarks, pdf_outline_items, prepare_compile_workspace,
    select_compiler, snapshot_compile_workspace, synchronize_compile_outputs,
};
use papercompile_core::project::SourceFile;
use std::fs;

#[test]
fn reports_missing_compiler_without_touching_project() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("main.tex"), "original").unwrap();

    let result = compile_project_with(root.path(), "main.tex", "definitely-missing-tectonic");

    assert_eq!(result, Err(CompileError::CompilerUnavailable));
    assert_eq!(
        fs::read_to_string(root.path().join("main.tex")).unwrap(),
        "original"
    );
}

#[test]
fn rejects_entry_outside_project_before_running_compiler() {
    let root = tempfile::tempdir().unwrap();
    assert_eq!(
        compile_project_with(root.path(), "../secret.tex", "tectonic"),
        Err(CompileError::UnsafeEntry)
    );
}

#[test]
fn converts_pdf_toc_entries_into_navigation_items() {
    let items = pdf_outline_items(&[
        (1, "Introduction".to_string(), 2),
        (2, "Method".to_string(), 4),
    ]);

    assert_eq!(items[0].title, "Introduction");
    assert_eq!(items[0].level, 1);
    assert_eq!(items[0].page, 2);
    assert_eq!(items[1].level, 2);
}

#[test]
fn prefers_installed_xelatex_over_other_engines() {
    let selected = select_compiler(|name| matches!(name, "xelatex" | "pdflatex" | "tectonic"));

    assert_eq!(selected.unwrap().kind, CompilerKind::XeLatex);
}

#[test]
fn falls_back_through_supported_compilers() {
    let selected = select_compiler(|name| name == "tectonic");

    assert_eq!(selected.unwrap().kind, CompilerKind::Tectonic);
}

#[test]
fn builds_engine_specific_arguments() {
    assert_eq!(
        compiler_arguments(CompilerKind::XeLatex, "main.tex"),
        vec![
            "-interaction=nonstopmode",
            "-file-line-error",
            "-synctex=1",
            "main.tex"
        ]
    );
    assert_eq!(
        compiler_arguments(CompilerKind::Tectonic, "main.tex"),
        vec!["main.tex", "--keep-logs", "--keep-intermediates"]
    );
}

#[test]
fn resolves_nested_entry_output_from_the_compiler_working_directory() {
    let root = std::path::Path::new("C:/temporary/project");

    assert_eq!(
        compiler_output_path(root, "latex/final_paper.tex"),
        root.join("final_paper.pdf")
    );
    assert_eq!(
        compiler_output_path(root, "main.tex"),
        root.join("main.pdf")
    );
}

#[test]
fn every_compiler_runs_once_per_compile_action() {
    assert_eq!(compiler_passes(CompilerKind::XeLatex), 1);
    assert_eq!(compiler_passes(CompilerKind::LuaLatex), 1);
    assert_eq!(compiler_passes(CompilerKind::PdfLatex), 1);
    assert_eq!(compiler_passes(CompilerKind::Tectonic), 1);
}

#[test]
fn enables_pdf_bookmarks_only_in_the_temporary_entry_source() {
    let plain = "\\documentclass{article}\n\\begin{document}\n\\section{Intro}\n\\end{document}";
    let enabled = enable_pdf_bookmarks(plain);
    assert!(enabled.contains("\\usepackage[bookmarks=true,bookmarksopen=true]{hyperref}"));
    assert!(enabled.find("\\usepackage").unwrap() < enabled.find("\\begin{document}").unwrap());

    let existing =
        "\\documentclass{article}\n\\usepackage{hyperref}\n\\begin{document}\nText\\end{document}";
    let enabled = enable_pdf_bookmarks(existing);
    assert_eq!(enabled.matches("\\usepackage{hyperref}").count(), 1);
    assert!(enabled.contains("\\hypersetup{bookmarks=true,bookmarksopen=true}"));
}

#[test]
fn prepares_an_isolated_workspace_with_unsaved_source_overrides() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("sections")).unwrap();
    fs::write(root.path().join("main.tex"), "saved source").unwrap();
    fs::write(root.path().join("sections/body.tex"), "saved body").unwrap();
    fs::write(root.path().join("figure.png"), [1_u8, 2, 3]).unwrap();
    fs::write(root.path().join("main.pdf"), b"stale pdf").unwrap();

    let workspace = prepare_compile_workspace(
        root.path(),
        "main.tex",
        &[
            SourceFile {
                path: "main.tex".into(),
                content: "unsaved source".into(),
            },
            SourceFile {
                path: "sections/body.tex".into(),
                content: "unsaved body".into(),
            },
        ],
    )
    .unwrap();

    assert_eq!(
        fs::read_to_string(workspace.path().join("main.tex")).unwrap(),
        "unsaved source"
    );
    assert_eq!(
        fs::read_to_string(workspace.path().join("sections/body.tex")).unwrap(),
        "unsaved body"
    );
    assert_eq!(
        fs::read(workspace.path().join("figure.png")).unwrap(),
        [1_u8, 2, 3]
    );
    assert!(!workspace.path().join("main.pdf").exists());
    assert_eq!(
        fs::read_to_string(root.path().join("main.tex")).unwrap(),
        "saved source"
    );
}

#[test]
fn copies_local_resources_and_overwrites_only_memory_tex_files() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("sections")).unwrap();
    fs::write(root.path().join("main.tex"), "stale local source").unwrap();
    fs::write(root.path().join("sections/body.tex"), "stale local body").unwrap();
    fs::write(root.path().join("references.bib"), "local references").unwrap();

    let workspace = prepare_compile_workspace(
        root.path(),
        "main.tex",
        &[SourceFile {
            path: "main.tex".into(),
            content: "memory source".into(),
        }],
    )
    .unwrap();

    assert_eq!(
        fs::read_to_string(workspace.path().join("main.tex")).unwrap(),
        "memory source"
    );
    assert_eq!(
        fs::read_to_string(workspace.path().join("sections/body.tex")).unwrap(),
        "stale local body"
    );
    assert_eq!(
        fs::read_to_string(workspace.path().join("references.bib")).unwrap(),
        "local references"
    );
}

#[test]
fn rejects_unsafe_source_override_paths() {
    let root = tempfile::tempdir().unwrap();
    let result = prepare_compile_workspace(
        root.path(),
        "main.tex",
        &[SourceFile {
            path: "../outside.tex".into(),
            content: "unsafe".into(),
        }],
    );

    assert!(matches!(result, Err(CompileError::UnsafeEntry)));
}

#[test]
fn synchronizes_compiler_file_changes_by_content_hash_except_the_preview_pdf() {
    let root = tempfile::tempdir().unwrap();
    let workspace = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("build")).unwrap();
    fs::create_dir(workspace.path().join("build")).unwrap();
    fs::write(root.path().join("build/main.aux"), b"old aux").unwrap();
    fs::write(root.path().join("removed.out"), b"remove me").unwrap();
    fs::write(root.path().join("unchanged.bin"), [0_u8, 1, 2]).unwrap();
    fs::write(workspace.path().join("build/main.aux"), b"old aux").unwrap();
    fs::write(workspace.path().join("removed.out"), b"remove me").unwrap();
    fs::write(workspace.path().join("unchanged.bin"), [0_u8, 1, 2]).unwrap();

    let disk_before = snapshot_compile_workspace(root.path()).unwrap();
    let workspace_before = snapshot_compile_workspace(workspace.path()).unwrap();
    fs::write(workspace.path().join("build/main.aux"), b"new aux").unwrap();
    fs::remove_file(workspace.path().join("removed.out")).unwrap();
    fs::write(workspace.path().join("created.bin"), [3_u8, 4, 5]).unwrap();
    fs::write(workspace.path().join("main.pdf"), b"preview only").unwrap();

    synchronize_compile_outputs(
        root.path(),
        workspace.path(),
        &disk_before,
        &workspace_before,
        std::path::Path::new("main.pdf"),
    )
    .unwrap();

    assert_eq!(
        fs::read(root.path().join("build/main.aux")).unwrap(),
        b"new aux"
    );
    assert!(!root.path().join("removed.out").exists());
    assert_eq!(
        fs::read(root.path().join("created.bin")).unwrap(),
        [3_u8, 4, 5]
    );
    assert_eq!(
        fs::read(root.path().join("unchanged.bin")).unwrap(),
        [0_u8, 1, 2]
    );
    assert!(!root.path().join("main.pdf").exists());
}

#[test]
fn rejects_all_compile_outputs_when_the_project_changed_during_compilation() {
    let root = tempfile::tempdir().unwrap();
    let workspace = tempfile::tempdir().unwrap();
    fs::write(root.path().join("main.tex"), b"original").unwrap();
    fs::write(workspace.path().join("main.tex"), b"original").unwrap();
    let disk_before = snapshot_compile_workspace(root.path()).unwrap();
    let workspace_before = snapshot_compile_workspace(workspace.path()).unwrap();

    fs::write(workspace.path().join("main.aux"), b"generated").unwrap();
    fs::write(root.path().join("main.tex"), b"external edit").unwrap();

    let result = synchronize_compile_outputs(
        root.path(),
        workspace.path(),
        &disk_before,
        &workspace_before,
        std::path::Path::new("main.pdf"),
    );

    assert_eq!(result, Err(CompileError::ProjectChanged));
    assert_eq!(
        fs::read(root.path().join("main.tex")).unwrap(),
        b"external edit"
    );
    assert!(!root.path().join("main.aux").exists());
}

#[test]
fn rolls_back_earlier_outputs_when_a_later_commit_fails() {
    let root = tempfile::tempdir().unwrap();
    let workspace = tempfile::tempdir().unwrap();
    fs::write(root.path().join("a.aux"), b"old").unwrap();
    fs::create_dir(root.path().join("z-blocked.aux")).unwrap();
    fs::write(workspace.path().join("a.aux"), b"old").unwrap();
    let disk_before = snapshot_compile_workspace(root.path()).unwrap();
    let workspace_before = snapshot_compile_workspace(workspace.path()).unwrap();

    fs::write(workspace.path().join("a.aux"), b"new").unwrap();
    fs::write(
        workspace.path().join("z-blocked.aux"),
        b"cannot replace directory",
    )
    .unwrap();

    let result = synchronize_compile_outputs(
        root.path(),
        workspace.path(),
        &disk_before,
        &workspace_before,
        std::path::Path::new("main.pdf"),
    );

    assert_eq!(result, Err(CompileError::Workspace));
    assert_eq!(fs::read(root.path().join("a.aux")).unwrap(), b"old");
    assert!(root.path().join("z-blocked.aux").is_dir());
}
