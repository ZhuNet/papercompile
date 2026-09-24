import { describe, expect, it } from 'vitest';
import appSource from '../App.tsx?raw';

describe('file tree creation markup', () => {
  it('uses inline creation state instead of prompt dialogs', () => {
    expect(appSource).toContain('creationKind()');
    expect(appSource).toContain('class="tree-create"');
    expect(appSource).toContain('onKeyDown={handleCreationKeyDown}');
    expect(appSource).not.toContain('const name = window.prompt("新文件名（可包含相对路径）");');
    expect(appSource).not.toContain('const name = window.prompt("新文件夹名");');
    expect(appSource).toContain('if (!isValidProjectItemName(name))');
    expect(appSource).toContain('无法重命名：名称为空、属于系统保留名或包含非法字符');
  });

  it('commits rename on outside pointer down and cancels it with Escape', () => {
    expect(appSource).toContain('if (renamingPath() && !target.closest(".tree-rename"))');
    expect(appSource).toContain('commitRename();');
    expect(appSource).toContain('if (event.key === "Escape") props.onCancelRename();');
    expect(appSource).not.toContain('if (event.key === "Escape") props.onCommitRename();');
  });

  it('keeps the created or renamed item selected unless another item is selected', () => {
    expect(appSource).not.toContain('selectionBeforeOperation');
    expect(appSource).not.toContain('selectedDuringOperation');
    expect(appSource).not.toContain('selectionAfterOperation');
    expect(appSource).not.toContain('treeSelectionRevision');
    expect(appSource).not.toContain('selectionRevision');
    expect(appSource).toContain('const pendingTreeSelection = target.closest(".tree-item")');
    expect(appSource).toContain('item.dataset.treePath');
    expect(appSource).toContain('project-changed');
    expect(appSource).not.toContain('await refreshProjectFiles();');
    expect(appSource).not.toContain('await refreshProjectFiles([{ from, to }]);');
  });

  it('lets the disk watcher refresh after frontend file operations', () => {
    expect(appSource).not.toContain('const refreshProjectFiles = async');
    expect(appSource).not.toContain('const project = await refreshProjectFiles();');
    expect(appSource).not.toContain('await refreshProjectFiles();');
    expect(appSource).not.toContain('await refreshProjectFiles([{ from, to }]);');
    expect(appSource.match(/invoke<ProjectResponse>\("scan_project"/g)).toHaveLength(1);
    expect(appSource).toContain('listen<string>("project-changed"');
  });

  it('updates the saved baseline immediately after each successful disk write', () => {
    expect(appSource).not.toContain('pendingSaves');
    expect(appSource).toContain('setSavedFiles((files) =>');
    expect(appSource).toContain('await invoke<string>("save_source"');
    expect(appSource).toContain('setSavedFiles((files) => files.map');
    expect(appSource).toContain('content_hash: contentHash');
  });

  it('continues selecting the clicked tree item after committing creation', () => {
    expect(appSource).toContain('const pendingTreeSelection = target.closest(".tree-item")');
    expect(appSource).toContain('commitCreation((document.activeElement as HTMLInputElement | null)?.value ?? "");');
    expect(appSource).toContain('selectPendingTreeItem(pendingTreeSelection);');
  });

  it('submits every valid rename through the backend identity check', () => {
    expect(appSource).not.toContain('if (to === from)');
    expect(appSource).not.toContain('已保持名称');
    expect(appSource).toContain('() => renameOrMove(from, to)');
  });
});
