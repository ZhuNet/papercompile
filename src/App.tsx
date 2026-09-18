import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { projectLocation, projectNotice } from "./projectView";
import {
  applySourceChanges,
  savableSourceFiles,
  synchronizeSourceFiles,
} from "./revisionModel";
import {
  applyAiPatches,
  isSafeAiAction,
  preflightAiActions,
  validateAiPatchTarget,
  type AiAction,
  type AiToolOperation,
} from "./aiModel";
import {
  buildProjectTree,
  parentFolder,
  type ProjectTreeNode,
} from "./projectTree";
import {
  compileFailureText,
  compileSources,
  decodeBase64,
  paginateText,
} from "./compiledPreview";
import { PdfPreview, TextDocumentPreview } from "./PdfPreview";
import { SourceScrollPositions, type SourceScrollPosition } from "./sourceView";
import { highlightText, textLanguageForPath } from "./textSyntax";
import {
  compiledPdfDocument,
  type CompiledPdfDocument,
  type PdfReadingState,
} from "./pdfViewer";
import {
  actionLabel,
  actionName,
  buildToolResult,
  loadAiPreferences,
  saveAiPreferences,
  setToolPartStatus,
  visibleAiTurns,
} from "./aiWorkbench";
import type { AiPart } from "./aiWorkbench";

type AiResponse = {
  id: string;
  message: string;
  segments: (
    | { kind: "text"; text: string }
    | { kind: "tool"; action: AiAction }
  )[];
  actions: AiAction[];
  tool_errors?: string[];
  done?: boolean;
};
type AiTurn =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      parts: AiPart[];
    };
type ProjectFile = {
  path: string;
  content?: string | null;
  content_hash?: string | null;
  extension?: string;
  size: number;
};
type ProjectResponse = {
  root: string;
  entry: string;
  files: ProjectFile[];
  folders: string[];
  outline: OutlineItem[];
};
type OutlineItem = { title: string; level: number; page: number };
type HistoryEntry = { path: string; before: string; after: string };
type CompileReport = {
  success: boolean;
  pdf_data?: string;
  compiler: string;
  outline: OutlineItem[];
  pages: string[];
  diagnostics: {
    severity: string;
    file: string;
    line?: number;
    message: string;
  }[];
  log: string;
};

export function App() {
  const [view, setView] = createSignal<"preview" | "source">("source");
  const [aiOpen, setAiOpen] = createSignal(true);
  const [prompt, setPrompt] = createSignal("");
  const [aiToast, setAiToast] = createSignal("");
  const [aiRunning, setAiRunning] = createSignal(false);
  const [notice, setNotice] = createSignal<{
    title: string;
    detail: string;
    path: string;
    tone: "success" | "error";
  }>();
  const [projectFiles, setProjectFiles] = createSignal<ProjectFile[]>([]);
  const [projectFolders, setProjectFolders] = createSignal<string[]>([]);
  const [selectedFile, setSelectedFile] = createSignal("");
  const [selectedTreeItem, setSelectedTreeItem] = createSignal("");
  const [projectRoot, setProjectRoot] = createSignal("");
  const [entryFile, setEntryFile] = createSignal("");
  const [compileStatus, setCompileStatus] = createSignal("尚未编译");
  const [compileReport, setCompileReport] = createSignal<CompileReport>();
  const [compiledPdf, setCompiledPdf] = createSignal<CompiledPdfDocument>();
  const [pdfReadingState, setPdfReadingState] = createSignal<PdfReadingState>({
    page: 1,
    pageOffset: 0,
    scale: "auto",
  });
  const [previewZoom, setPreviewZoom] = createSignal(75);
  const [compileError, setCompileError] = createSignal("");
  const [compiling, setCompiling] = createSignal(false);
  const [renamingPath, setRenamingPath] = createSignal("");
  const [renameValue, setRenameValue] = createSignal("");
  const [lastProjectSignature, setLastProjectSignature] = createSignal("");
  const [projectName, setProjectName] = createSignal("尚未打开项目");
  const [sourceDraft, setSourceDraft] = createSignal("");
  const [savedFiles, setSavedFiles] = createSignal<ProjectFile[]>([]);
  const [workingFiles, setWorkingFiles] = createSignal<ProjectFile[]>([]);
  const [undoStack, setUndoStack] = createSignal<HistoryEntry[]>([]);
  const sourceScrollPositions = new SourceScrollPositions();
  const aiDefaults = loadAiPreferences({
    endpoint: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    key: "",
  });
  const [aiEndpoint, setAiEndpoint] = createSignal(aiDefaults.endpoint);
  const [aiModel, setAiModel] = createSignal(aiDefaults.model);
  const [aiKey, setAiKey] = createSignal(aiDefaults.key);
  const [aiHistory, setAiHistory] = createSignal<AiTurn[]>([]);
  const [aiContext, setAiContext] = createSignal<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [aiSettingsOpen, setAiSettingsOpen] = createSignal(false);
  const [appliedAiConfig, setAppliedAiConfig] = createSignal({
    endpoint: aiEndpoint(),
    model: aiModel(),
    key: aiKey(),
  });
  const dirty = createMemo(() =>
    workingFiles().some(
      (file) =>
        file.content !==
        savedFiles().find((item) => item.path === file.path)?.content,
    ),
  );
  const fileTree = createMemo(() =>
    buildProjectTree(
      projectFiles().map((file) => file.path),
      projectFolders(),
    ),
  );

  let aiToastTimer: ReturnType<typeof setTimeout> | undefined;
  let aiRunToken = 0;
  const flashAiToast = (message: string) => {
    setAiToast(message);
    clearTimeout(aiToastTimer);
    aiToastTimer = setTimeout(() => setAiToast(""), 2600);
  };
  onCleanup(() => clearTimeout(aiToastTimer));

  const applyProjectFiles = (project: ProjectResponse) => {
    setProjectFiles(project.files);
    setProjectFolders(project.folders ?? []);
    setSavedFiles(project.files);
    setWorkingFiles(project.files);
    setEntryFile(project.entry);
    setLastProjectSignature(
      `${project.entry}|${project.folders.join("|")}|${project.files.map((file) => `${file.path}:${file.size}:${file.content_hash ?? ""}`).join("|")}`,
    );
  };

  const syncProjectFiles = (
    project: ProjectResponse,
    renames: { from: string; to: string }[] = [],
  ) => {
    const renamedWorking = workingFiles().map((file) => {
      const rename = renames.find((item) => item.from === file.path);
      return rename ? { ...file, path: rename.to } : file;
    });
    const renamedSaved = savedFiles().map((file) => {
      const rename = renames.find((item) => item.from === file.path);
      return rename ? { ...file, path: rename.to } : file;
    });
    const state = synchronizeSourceFiles(
      project.files,
      renamedWorking,
      renamedSaved,
      undoStack(),
    );
    setProjectFiles(project.files);
    setProjectFolders(project.folders ?? []);
    setSavedFiles(state.saved);
    setWorkingFiles(state.files);
    setUndoStack(state.history);
    setEntryFile(project.entry);
    const nextSelected = state.files.some((file) => file.path === selectedFile())
      ? selectedFile()
      : project.entry;
    setSelectedFile(nextSelected);
    setSelectedTreeItem(nextSelected);
    setSourceDraft(
      state.files.find((file) => file.path === nextSelected)?.content ?? "",
    );
  };

  const loadProject = async (root: string) => {
    const project = await invoke<ProjectResponse>("open_project", {
      path: root,
    });
    applyProjectFiles(project);
    setProjectName(projectLocation(project.root).name);
    setProjectRoot(project.root);
    setSelectedFile(project.entry);
    setSelectedTreeItem(project.entry);
    setSourceDraft(
      project.files.find((file) => file.path === project.entry)?.content ?? "",
    );
    setCompileReport();
    setCompiledPdf();
    setPdfReadingState({ page: 1, pageOffset: 0, scale: "auto" });
    sourceScrollPositions.clear();
    setCompileError("");
    setCompileStatus("尚未编译");
    setUndoStack([]);
    setView("source");
  };

  createEffect(() => {
    const root = projectRoot();
    if (!root) return;
    void invoke("watch_project", { root });
    let syncing = false;
    void listen<string>("project-changed", async (event) => {
      if (event.payload !== root || syncing) return;
      syncing = true;
      try {
        const project = await invoke<ProjectResponse>("scan_project", {
          path: root,
        });
        const signature = `${project.entry}|${project.folders.join("|")}|${project.files.map((file) => `${file.path}:${file.size}:${file.content_hash ?? ""}`).join("|")}`;
        if (signature !== lastProjectSignature()) {
          setLastProjectSignature(signature);
          syncProjectFiles(project);
        }
      } finally {
        syncing = false;
      }
    }).then((unlisten) => onCleanup(unlisten));
  });

  const refreshProjectFiles = async (
    renames: { from: string; to: string }[] = [],
  ) => {
    const project = await invoke<ProjectResponse>("scan_project", {
      path: projectRoot(),
    });
    syncProjectFiles(project, renames);
    return project;
  };

  const editTex = (path: string, value: string) => {
    const before =
      workingFiles().find((file) => file.path === path)?.content ?? "";
    if (before === value) return;
    const change = { path, before, after: value };
    if (path === selectedFile()) setSourceDraft(value);
    const state = applySourceChanges(workingFiles(), undoStack(), [change]);
    setWorkingFiles(state.files);
    setUndoStack(state.history);
  };
  const updateSource = (value: string) => editTex(selectedFile(), value);

  const undo = () => {
    const items = undoStack();
    const action = items[items.length - 1];
    if (!action) return;
    setUndoStack(items.slice(0, -1));
    setWorkingFiles((files) =>
      files.map((file) =>
        file.path === action.path ? { ...file, content: action.before } : file,
      ),
    );
    if (action.path === selectedFile()) setSourceDraft(action.before);
  };

  const saveProject = async (): Promise<boolean> => {
    if (!projectRoot()) return false;
    for (const file of savableSourceFiles(workingFiles(), savedFiles())) {
      try {
        await invoke("save_source", {
          root: projectRoot(),
          path: file.path,
          expectedHash: file.expectedHash,
          content: file.content,
        });
      } catch (error) {
        flashAiToast(`保存失败 · ${String(error)}`);
        return false;
      }
    }
    await refreshProjectFiles();
    flashAiToast("项目源码已保存");
    return true;
  };

  const openProject = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "打开 LaTeX 项目",
    });
    if (!selected || Array.isArray(selected)) return;
    try {
      await loadProject(selected);
      setNotice(projectNotice(selected, true));
      setTimeout(() => setNotice(), 4500);
    } catch (error) {
      setNotice({ ...projectNotice(selected, false), path: String(error) });
    }
  };

  const compileProject = async () => {
    if (!projectRoot()) {
      setCompileStatus("请先打开项目");
      return;
    }
    if (compiling()) return;
    setCompiling(true);
    setCompileStatus("正在编译...");
    try {
      const sources = compileSources(workingFiles());
      const report = await invoke<CompileReport>("compile_project", {
        root: projectRoot(),
        entry: entryFile(),
        sources,
      });
      if (report.success) {
        if (!report.pdf_data) throw new Error("编译器未返回 PDF 内容");
        setCompileReport(report);
        setCompiledPdf((current) =>
          compiledPdfDocument(
            decodeBase64(report.pdf_data!),
            current?.revision ?? 0,
          ),
        );
        setCompileError("");
        setCompileStatus(`${report.compiler} 编译通过`);
        setView("preview");
      } else {
        setCompileReport(report);
        const error = compileFailureText(
          report.compiler,
          report.diagnostics,
          report.log,
        );
        setCompileError(error);
        setCompileStatus(`${report.compiler} 编译失败`);
        setView("preview");
      }
    } catch (error) {
      const message = `编译失败\n\n${String(error)}`;
      setCompileError(message);
      setCompileStatus("编译失败");
      setView("preview");
    } finally {
      setCompiling(false);
    }
  };

  const readFile = async (path: string) => {
    const cached = workingFiles().find((file) => file.path === path)?.content;
    return typeof cached === "string"
      ? cached
      : invoke<string>("read_project_file", { root: projectRoot(), path });
  };
  const addFile = async (path: string, content = "") => {
    await invoke("create_project_file_with_content", {
      root: projectRoot(),
      path,
      content,
    });
    await refreshProjectFiles();
  };
  const addFolder = async (path: string) => {
    await invoke("create_project_folder", { root: projectRoot(), path });
    await refreshProjectFiles();
  };
  const renameOrMove = async (from: string, to: string) => {
    await invoke("rename_project_item", { root: projectRoot(), from, to });
    await refreshProjectFiles([{ from, to }]);
  };
  const trashItem = async (path: string) => {
    await invoke("delete_project_item", { root: projectRoot(), path });
    await refreshProjectFiles();
  };
  const userFileOperation = async (
    operation: () => Promise<void>,
    message: string,
  ) => {
    if (!projectRoot()) return;
    try {
      await operation();
      flashAiToast(message);
    } catch (error) {
      flashAiToast(`文件操作失败 · ${String(error)}`);
    }
  };
  const targetFolder = () => {
    const selected = selectedTreeItem();
    if (projectFolders().includes(selected)) return selected;
    return parentFolder(selected);
  };
  const createFile = () => {
    const name = window.prompt("新文件名（可包含相对路径）");
    if (!name?.trim()) return;
    const path = targetFolder()
      ? `${targetFolder()}/${name.trim()}`
      : name.trim();
    void userFileOperation(() => addFile(path), `已新建 ${path}`);
  };
  const createFolder = () => {
    const name = window.prompt("新文件夹名");
    if (!name?.trim()) return;
    const path = targetFolder()
      ? `${targetFolder()}/${name.trim()}`
      : name.trim();
    void userFileOperation(() => addFolder(path), `已新建 ${path}`);
  };
  const renameItem = () => {
    const from = selectedTreeItem();
    if (!from) return;
    setRenamingPath(from);
    setRenameValue(from.slice(from.lastIndexOf("/") + 1));
  };
  const commitRename = () => {
    const from = renamingPath();
    const name = renameValue().trim();
    if (!from || !name) {
      setRenamingPath("");
      return;
    }
    const folder = parentFolder(from);
    const to = folder ? `${folder}/${name}` : name;
    setRenamingPath("");
    void userFileOperation(() => renameOrMove(from, to), `已重命名为 ${to}`);
  };
  const deleteItem = () => {
    const path = selectedTreeItem();
    if (!path) return;
    if (!window.confirm(`确定删除 ${path}？文件夹内内容也会被删除。`)) return;
    void userFileOperation(() => trashItem(path), `已移入回收站 ${path}`);
  };
  const uploadFiles = async () => {
    const selected = await open({
      multiple: true,
      directory: false,
      title: "上传文件到项目",
    });
    if (!selected) return;
    const sources = Array.isArray(selected) ? selected : [selected];
    await userFileOperation(async () => {
      await invoke("import_project_files", {
        root: projectRoot(),
        folder: targetFolder(),
        sources,
      });
      await refreshProjectFiles();
    }, `已上传 ${sources.length} 个文件`);
  };

  const runAi = async () => {
    if (!prompt().trim()) return;
    if (!projectRoot()) {
      flashAiToast("AI 未执行 · 请先打开本地项目");
      return;
    }
    if (!aiKey().trim()) {
      flashAiToast("AI 未执行 · 请在设置中填写 API Key 并点击应用");
      return;
    }
    const instruction = prompt();
    const history = [
      ...aiHistory(),
      { role: "user" as const, content: instruction },
    ];
    const context = [
      ...aiContext(),
      { role: "user" as const, content: instruction },
    ];
    setAiHistory(history);
    setAiContext(context);
    setPrompt("");
    const token = (aiRunToken += 1);
    const active = () => aiRunToken === token;
    setAiRunning(true);
    try {
      let step = 0;
      let done = false;
      const toolOperations: AiToolOperation[] = [];
      while (true) {
        if (done) break;
        if (!active()) break;
        const directory = [
          ...projectFolders().map((path) => `${path}/`),
          ...projectFiles().map((file) => file.path),
        ]
          .sort()
          .join("\n");
        const response = await invoke<AiResponse>("ask_ai", {
          endpoint: aiEndpoint(),
          model: aiModel(),
          apiKey: aiKey(),
          instruction: "",
          directory,
          history: context,
        });
        if (!active()) break;
        step += 1;
        if (!response.actions.every(isSafeAiAction))
          throw new Error("AI 返回了项目目录外操作");
        const readPreflight = preflightAiActions(
          response.actions,
          toolOperations,
        );
        const rejectedReadIndexes = new Set(
          readPreflight.rejected.map((item) => item.index),
        );
        const actions = readPreflight.accepted;
        const observations: string[] = [];
        let actionIndex = 0;
        const parts: AiPart[] = response.segments.flatMap((segment): AiPart[] => {
          if (segment.kind === "text") return [{ kind: "text", text: segment.text }];
          const currentIndex = actionIndex++;
          return rejectedReadIndexes.has(currentIndex)
            ? []
            : [{ kind: "tool", action: segment.action, status: "pending" }];
        });
        const assistantTurn: Extract<AiTurn, { role: "assistant" }> = {
          role: "assistant",
          content: response.message,
          parts,
        };
        const assistantIndex = history.push(assistantTurn) - 1;
        context.push({ role: "assistant", content: response.message });
        setAiHistory([...history]);
        setAiContext([...context]);
        for (let index = 0; index < actions.length; index += 1) {
          const action = actions[index];
          try {
            if (action.type === "read_file") {
              const value = await readFile(action.path);
              observations.push(`${action.path}:\n${value}`);
              toolOperations.push({ type: "read_file", path: action.path, response: step });
            } else if (action.type === "patch") {
              validateAiPatchTarget(action.path, step, toolOperations);
              toolOperations.push({ type: "patch", path: action.path, response: step });
              const file = workingFiles().find((item) => item.path === action.path);
              if (typeof file?.content !== "string")
                throw new Error(`无法修改 ${action.path}`);
              const updated = applyAiPatches(file.content, [action]);
              editTex(action.path, updated);
              observations.push(`patched ${action.path}`);
            } else if (action.type === "create_file") {
              await addFile(action.path, action.content);
              observations.push(`created ${action.path}`);
            } else if (action.type === "create_folder") {
              await addFolder(action.path);
              observations.push(`created folder ${action.path}`);
            } else if (action.type === "rename" || action.type === "move") {
              await renameOrMove(action.from, action.to);
              observations.push(`moved ${action.from} -> ${action.to}`);
            } else if (action.type === "trash") {
              await trashItem(action.path);
              observations.push(`moved ${action.path} to recycle bin`);
            }
            assistantTurn.parts = setToolPartStatus(
              assistantTurn.parts,
              index,
              "completed",
            );
          } catch (error) {
            const result = `action failed (${action.type}): ${String(error)}`;
            observations.push(result);
            assistantTurn.parts = setToolPartStatus(
              assistantTurn.parts,
              index,
              "failed",
            );
          }
          history[assistantIndex] = {
            ...assistantTurn,
            parts: [...assistantTurn.parts],
          };
          setAiHistory([...history]);
        }
        const toolResult = buildToolResult(
          [
            ...(response.tool_errors?.map((error) => `校验失败：${error}`) ?? []),
            ...readPreflight.rejected.map((item) => `校验失败：${item.error}`),
          ],
          observations,
        );
        if (toolResult) {
          context.push({ role: "user", content: toolResult });
          setAiContext([...context]);
        }
        done = response.done === true;
      }
    } catch (error) {
      if (active()) flashAiToast(`AI 操作失败 · ${String(error)}`);
    } finally {
      if (active()) setAiRunning(false);
    }
  };

  const stopAi = () => {
    aiRunToken += 1;
    setAiRunning(false);
  };

  const toggleAiRun = () => {
    if (aiRunning()) stopAi();
    else void runAi();
  };

  const openAiSettings = () => {
    const config = appliedAiConfig();
    setAiEndpoint(config.endpoint);
    setAiModel(config.model);
    setAiKey(config.key);
    setAiSettingsOpen(true);
  };
  const toggleAiSettings = () =>
    aiSettingsOpen() ? cancelAiSettings() : openAiSettings();
  const cancelAiSettings = () => {
    const config = appliedAiConfig();
    setAiEndpoint(config.endpoint);
    setAiModel(config.model);
    setAiKey(config.key);
    setAiSettingsOpen(false);
  };
  const applyAiSettings = () => {
    setAppliedAiConfig({
      endpoint: aiEndpoint(),
      model: aiModel(),
      key: aiKey(),
    });
    saveAiPreferences({
      endpoint: aiEndpoint(),
      model: aiModel(),
      key: aiKey(),
    });
    setAiSettingsOpen(false);
    flashAiToast("AI 配置已应用");
  };

  return (
    <main
      class="app-shell"
      onPointerDown={(event) => {
        const target = event.target as Element;
        if (renamingPath() && !target.closest(".tree-rename"))
          setRenamingPath("");
        if (
          aiSettingsOpen() &&
          !target.closest(".ai-settings-popover") &&
          !target.closest(".ai-settings-button")
        )
          cancelAiSettings();
      }}
    >
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark">P</span>
          <span>PaperCompile</span>
        </div>
        <div class="project-name">
          <div>
            <button class="project-button" onClick={openProject}>
              {projectName()}
            </button>
            <span> / {entryFile() || "未选择入口"}</span>
          </div>
          <button
            class="project-path"
            title={projectRoot() || "点击打开项目"}
            onClick={() =>
              projectRoot()
                ? navigator.clipboard?.writeText(projectRoot())
                : openProject()
            }
          >
            {projectRoot() || "点击选择 LaTeX 项目文件夹"}
          </button>
        </div>
        <div class="top-actions">
          <button title="保存" aria-label="保存" onClick={saveProject}>
            <svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
              <rect x="7" y="4" width="9" height="5" rx="1" />
              <rect x="7" y="13" width="10" height="7" rx="1" />
            </svg>
          </button>
          <button
            title="撤销"
            aria-label="撤销"
            onClick={undo}
            disabled={!undoStack().length}
          >
            <svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 7H3v-5" />
              <path d="M3.7 7.1A9 9 0 1 1 3.4 17" />
            </svg>
          </button>
          <button
            title="编译"
            aria-label="编译"
            onClick={compileProject}
            disabled={compiling()}
          >
            <svg
              class={`action-svg compile-icon ${compiling() ? "busy" : ""}`}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M5 3v18l16-9z" />
            </svg>
          </button>
        </div>
      </header>
      <nav class="toolbar">
        <button
          class={view() === "source" ? "active" : ""}
          onClick={() => setView("source")}
        >
          源码
        </button>
        <button
          class={view() === "preview" ? "active" : ""}
          onClick={() => setView("preview")}
        >
          正文
        </button>
        <span class="toolbar-spacer" />
        <span class={`save-state ${dirty() ? "dirty" : ""}`}>
          {dirty() ? "● 有未保存源码" : "✓ 源码已保存"}
        </span>
        <span class="compile-state">
          <i /> {compileStatus()}
        </span>
      </nav>
      <section class="workspace">
        <aside class="outline">
          <div class="files-heading">
            <strong>项目文件</strong>
          </div>
          <div class="file-actions file-operation-row">
            <button title="新建文件" aria-label="新建文件" onClick={createFile}>
              <svg viewBox="0 0 24 24">
                <path d="M6 3h8l4 4v14H6zM14 3v5h5M12 12v6M9 15h6" />
              </svg>
            </button>
            <button
              title="新建文件夹"
              aria-label="新建文件夹"
              onClick={createFolder}
            >
              <svg viewBox="0 0 24 24">
                <path d="M3 6h7l2 2h9v12H3zM12 11v6M9 14h6" />
              </svg>
            </button>
            <button
              title="上传文件"
              aria-label="上传文件"
              onClick={uploadFiles}
            >
              <svg viewBox="0 0 24 24">
                <path d="M12 17V4M7 9l5-5 5 5M5 20h14" />
              </svg>
            </button>
            <button title="重命名" aria-label="重命名" onClick={renameItem}>
              <svg viewBox="0 0 24 24">
                <path d="m5 16-1 4 4-1L19 8l-3-3zM14 7l3 3" />
              </svg>
            </button>
            <button title="删除" aria-label="删除" onClick={deleteItem}>
              <svg viewBox="0 0 24 24">
                <path d="M5 7h14M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" />
              </svg>
            </button>
          </div>
          <div class="file-tree">
            <For each={fileTree()}>
              {(node) => (
                <FileTreeNode
                  node={node}
                  selected={selectedTreeItem()}
                  renamingPath={renamingPath()}
                  renameValue={renameValue()}
                  onRenameValue={setRenameValue}
                  onCommitRename={commitRename}
                  onSelect={(item) => {
                    setSelectedTreeItem(item.path);
                    if (item.kind === "file") {
                      setSelectedFile(item.path);
                      setSourceDraft(
                        workingFiles().find((file) => file.path === item.path)
                          ?.content ?? "",
                      );
                      setView("source");
                    }
                  }}
                />
              )}
            </For>
          </div>
        </aside>
        <Show
          when={view() === "preview"}
          fallback={
            <SourceView
              path={selectedFile()}
              content={sourceDraft()}
              editable={
                typeof workingFiles().find(
                  (file) => file.path === selectedFile(),
                )?.content === "string"
              }
              scrollPosition={sourceScrollPositions.get(selectedFile())}
              onScrollPosition={(position) =>
                sourceScrollPositions.set(selectedFile(), position)
              }
              onInput={updateSource}
            />
          }
        >
          <article class="pdf-preview">
            <Show
              when={!compileError()}
              fallback={
                <TextDocumentPreview
                  pages={paginateText(compileError())}
                  zoom={previewZoom()}
                  targetPage={1}
                  navigationRequest={0}
                  onZoom={setPreviewZoom}
                  onPageChange={() => undefined}
                />
              }
            >
              <Show
                when={compiledPdf()}
                keyed
                fallback={
                  <div class="preview-empty">
                    <strong>尚无编译结果</strong>
                    <span>点击“编译”后，在这里显示当前源码的编译结果。</span>
                  </div>
                }
              >
                {(pdf) => (
                  <PdfPreview
                    data={pdf.data}
                    entryFile={entryFile()}
                    readingState={pdfReadingState()}
                    onReadingState={setPdfReadingState}
                  />
                )}
              </Show>
            </Show>
          </article>
        </Show>
        <aside class="revision-panel">
          <div class="panel-heading">
            <h2>项目状态</h2>
          </div>
          <div class="review-summary">
            <strong>{dirty() ? "有未保存源码" : "源码已保存"}</strong>
            <span>{projectFiles().length} 个文件</span>
          </div>
          <div class="empty-state">
            编辑只发生在项目文本文件中。
            <br />
            <small>编译不会保存源码，正文仅用于展示。</small>
          </div>
        </aside>
      </section>
      <Show when={notice()}>
        {(current) => (
          <div class={`project-notice ${current().tone}`}>
            <div class="notice-icon">
              {current().tone === "success" ? "✓" : "!"}
            </div>
            <div class="notice-copy">
              <strong>{current().title}</strong>
              <span>{current().detail}</span>
              <small title={current().path}>{current().path}</small>
            </div>
            <button class="notice-close" onClick={() => setNotice()}>
              ×
            </button>
          </div>
        )}
      </Show>
      <section class={`ai-dock ${aiOpen() ? "" : "collapsed"}`}>
        <button
          class="ai-dock-toggle"
          aria-label={aiOpen() ? "收起 AI 工作台" : "展开 AI 工作台"}
          onClick={() => setAiOpen(!aiOpen())}
        >
          <span />
        </button>
        <Show when={aiOpen()}>
          <div class="ai-body">
            <div class="ai-interaction">
              <div class="ai-interaction-scroll">
                <Show
                  when={visibleAiTurns(aiHistory()).length}
                  fallback={
                    <div class="ai-interaction-empty">
                      在右侧输入任务，操作记录将在这里显示。
                    </div>
                  }
                >
                  <For each={visibleAiTurns(aiHistory())}>
                    {(turn) => (
                      <div class={`ai-turn ${turn.role}`}>
                        <span>{turn.role === "user" ? "你" : "AI"}</span>
                        <div class="ai-turn-body">
                          {turn.role === "user" ? (
                            <p>{turn.content}</p>
                          ) : (
                            <For each={turn.parts}>
                              {(part) =>
                                part.kind === "text" ? (
                                  <p>{part.text}</p>
                                ) : (
                                  <div class={`ai-activity ${part.status}`}>
                                    <span class="ai-activity-spinner" aria-hidden="true" />
                                    <p>{part.status === "pending" ? "正在操作" : part.status === "completed" ? actionLabel(part.action) : "操作失败"}</p>
                                    <strong>{part.status === "pending" || part.status === "failed" ? actionName(part.action) : ""}</strong>
                                  </div>
                                )
                              }
                            </For>
                          )}
                        </div>
                      </div>
                    )}
                  </For>
                </Show>
              </div>
              <Show when={aiToast()}>
                <div class="ai-toast">{aiToast()}</div>
              </Show>
            </div>
            <div class="ai-composer">
              <Show when={aiSettingsOpen()}>
                <div class="ai-settings-popover">
                  <label>
                    <span>Endpoint</span>
                    <input
                      value={aiEndpoint()}
                      onInput={(event) =>
                        setAiEndpoint(event.currentTarget.value)
                      }
                    />
                  </label>
                  <label>
                    <span>Model</span>
                    <input
                      value={aiModel()}
                      onInput={(event) => setAiModel(event.currentTarget.value)}
                    />
                  </label>
                  <label class="api-key-field">
                    <span>API Key</span>
                    <input
                      type="password"
                      value={aiKey()}
                      onInput={(event) => setAiKey(event.currentTarget.value)}
                      placeholder="保存于本机"
                    />
                  </label>
                  <button onClick={applyAiSettings}>应用</button>
                </div>
              </Show>
              <textarea
                value={prompt()}
                onInput={(event) => setPrompt(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
                    toggleAiRun();
                }}
                placeholder="输入项目操作或源码修改要求..."
              />
              <div class="composer-actions">
                <button
                  class={`ai-settings-button ${aiSettingsOpen() ? "active" : ""}`}
                  aria-label="AI 设置"
                  onClick={toggleAiSettings}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5 7 7M17 17l1.5 1.5M18.5 5.5 17 7M7 17l-1.5 1.5" />
                  </svg>
                </button>
                <button
                  class="ai-send"
                  aria-label={aiRunning() ? "停止" : "发送"}
                  onClick={toggleAiRun}
                >
                  <Show
                    when={aiRunning()}
                    fallback={
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" />
                      </svg>
                    }
                  >
                    <svg class="ai-send-stop" viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
                    </svg>
                  </Show>
                </button>
              </div>
            </div>
          </div>
        </Show>
      </section>
    </main>
  );
}

function FileTreeNode(props: {
  node: ProjectTreeNode;
  selected: string;
  renamingPath: string;
  renameValue: string;
  onRenameValue: (value: string) => void;
  onCommitRename: () => void;
  onSelect: (node: ProjectTreeNode) => void;
}) {
  const [expanded, setExpanded] = createSignal(true);
  return (
    <div class="tree-branch">
      <Show
        when={props.renamingPath === props.node.path}
        fallback={
          <button
            class={`tree-item ${props.node.kind} ${props.selected === props.node.path ? "current" : ""}`}
            onClick={() => {
              props.onSelect(props.node);
              if (props.node.kind === "folder") setExpanded(!expanded());
            }}
          >
            <span>
              {props.node.kind === "folder" ? (expanded() ? "▾" : "▸") : "·"}
            </span>
            {props.node.name}
          </button>
        }
      >
        <input
          class="tree-rename"
          autofocus
          value={props.renameValue}
          onInput={(event) => props.onRenameValue(event.currentTarget.value)}
          onBlur={props.onCommitRename}
          onKeyDown={(event) => {
            if (event.key === "Enter") props.onCommitRename();
            if (event.key === "Escape") props.onCommitRename();
          }}
        />
      </Show>
      <Show when={props.node.kind === "folder" && expanded()}>
        <div class="tree-children">
          <For each={props.node.children}>
            {(child) => (
              <FileTreeNode
                node={child}
                selected={props.selected}
                renamingPath={props.renamingPath}
                renameValue={props.renameValue}
                onRenameValue={props.onRenameValue}
                onCommitRename={props.onCommitRename}
                onSelect={props.onSelect}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function SourceView(props: {
  path: string;
  content: string;
  editable: boolean;
  scrollPosition: SourceScrollPosition;
  onScrollPosition: (position: SourceScrollPosition) => void;
  onInput: (value: string) => void;
}) {
  let editor: HTMLTextAreaElement | undefined;
  const language = () => textLanguageForPath(props.path);
  createEffect(() => {
    props.path;
    const position = props.scrollPosition;
    queueMicrotask(() => {
      if (!editor) return;
      editor.scrollTop = position.top;
      editor.scrollLeft = position.left;
      const pre = editor.previousElementSibling as HTMLElement | null;
      if (pre) {
        pre.scrollTop = position.top;
        pre.scrollLeft = position.left;
      }
    });
  });
  return (
    <article class="source-wrap">
      <div class="source-header">
        <span>{props.path || "未选择文件"}</span>
        <span>{props.editable ? language().label : "二进制资源 · 只读"}</span>
      </div>
      <div class="source-code">
        <pre
          aria-hidden="true"
          innerHTML={`${highlightText(props.content, language().language)}\n`}
        />
        <textarea
          ref={editor}
          class="source-editor"
          readOnly={!props.editable}
          value={props.content}
          onInput={(event) => props.onInput(event.currentTarget.value)}
          onScroll={(event) => {
            const pre = event.currentTarget
              .previousElementSibling as HTMLElement;
            pre.scrollTop = event.currentTarget.scrollTop;
            pre.scrollLeft = event.currentTarget.scrollLeft;
            props.onScrollPosition({
              top: event.currentTarget.scrollTop,
              left: event.currentTarget.scrollLeft,
            });
          }}
          placeholder={
            props.path ? "此资源不能作为文本编辑" : "打开项目后选择源码文件"
          }
        />
      </div>
    </article>
  );
}
