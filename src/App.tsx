import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
} from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { projectLocation } from "./projectView";
import { operationErrorReason, type OperationKind } from "./operationMessage";
import {
  applySourceChanges,
  savableSourceFiles,
  synchronizeSourceFiles,
} from "./revisionModel";
import {
  buildProjectTree,
  isValidProjectItemName,
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
import { aiPanelHeightKey, clampAiPanelHeight, isNearScrollBottom } from "./aiPanel";
import {
  compiledPdfDocument,
  type CompiledPdfDocument,
  type PdfReadingState,
} from "./pdfViewer";
import {
  applyAgentEvent,
  hasDuplicateLlmModel,
  loadAgentPreferences,
  restoreAgentHistory,
  saveAgentPreferences,
  type AgentEvent,
  type AgentTool,
  type AgentWorkbenchState,
  type LlmProfile,
} from "./agentWorkbench";
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
  const [toolbarMessage, setToolbarMessage] = createSignal<{
    text: string;
    tone: "success" | "warning" | "error";
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
  const [creationKind, setCreationKind] = createSignal<"file" | "folder">();
  const [creationFolder, setCreationFolder] = createSignal("");
  const [lastProjectSignature, setLastProjectSignature] = createSignal("");
  const [projectName, setProjectName] = createSignal("尚未打开项目");
  const [sourceDraft, setSourceDraft] = createSignal("");
  const [savedFiles, setSavedFiles] = createSignal<ProjectFile[]>([]);
  const [workingFiles, setWorkingFiles] = createSignal<ProjectFile[]>([]);
  const [undoStack, setUndoStack] = createSignal<HistoryEntry[]>([]);
  const sourceScrollPositions = new SourceScrollPositions();
  const initialAgentPreferences = loadAgentPreferences();
  const [llmProfiles, setLlmProfiles] = createSignal<LlmProfile[]>(initialAgentPreferences.profiles);
  const [projectAgentPreferences, setProjectAgentPreferences] = createSignal(initialAgentPreferences.projects);
  const [selectedLlmId, setSelectedLlmId] = createSignal(initialAgentPreferences.selectedLlmId);
  const [agentSessionId, setAgentSessionId] = createSignal("");
  const [activeRunId, setActiveRunId] = createSignal("");
  const [agentReady, setAgentReady] = createSignal(false);
  const [agentStatus, setAgentStatus] = createSignal("正在连接 Agent...");
  const emptyAgentState = (): AgentWorkbenchState => ({ messages: [], tools: [], interactions: [], rawEvents: [], timeline: [], running: false });
  const [agentState, setAgentState] = createSignal<AgentWorkbenchState>(emptyAgentState());
  const aiRunning = createMemo(() => agentState().running);
  const [aiSettingsOpen, setAiSettingsOpen] = createSignal(false);
  const savedAiPanelHeight = Number(localStorage.getItem(aiPanelHeightKey));
  const [aiPanelHeight, setAiPanelHeight] = createSignal(
    clampAiPanelHeight(Number.isFinite(savedAiPanelHeight) && savedAiPanelHeight > 0 ? savedAiPanelHeight : 190, window.innerHeight),
  );
  const [creatingLlmProfile, setCreatingLlmProfile] = createSignal(false);
  const [profileProvider, setProfileProvider] = createSignal("");
  const [aiEndpoint, setAiEndpoint] = createSignal("");
  const [aiModel, setAiModel] = createSignal("");
  const [aiKey, setAiKey] = createSignal("");
  let interactionScroll: HTMLDivElement | undefined;
  let followInteractionBottom = true;
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

  let toolbarMessageTimer: ReturnType<typeof setTimeout> | undefined;
  const showToolbarMessage = (
    text: string,
    tone: "success" | "warning" | "error",
  ) => {
    setToolbarMessage({ text, tone });
    clearTimeout(toolbarMessageTimer);
    toolbarMessageTimer = setTimeout(
      () => setToolbarMessage(),
      tone === "success" ? 3000 : 6000,
    );
  };
  onCleanup(() => clearTimeout(toolbarMessageTimer));

  const sendAgentCommand = (command: Record<string, unknown>) =>
    invoke("send_agent_command", { command });
  const persistAgentPreferences = (
    profiles = llmProfiles(),
    projects = projectAgentPreferences(),
    selected = selectedLlmId(),
  ) => saveAgentPreferences({ profiles, projects, selectedLlmId: selected });
  const selectedLlm = createMemo(() =>
    llmProfiles().find((profile) => profile.id === selectedLlmId()),
  );
  let openingAgentSession = false;
  const openAgentSession = async () => {
    const root = projectRoot();
    const profile = selectedLlm();
    if (!agentReady() || !root || !profile || aiRunning() || openingAgentSession || agentSessionId()) return;
    openingAgentSession = true;
    setAgentStatus("正在恢复 Oh My Pi 会话...");
    try {
      await sendAgentCommand({
        type: "open_session",
        requestId: crypto.randomUUID(),
        projectRoot: root,
        agentId: "omp",
        profile,
      });
    } finally {
      openingAgentSession = false;
    }
  };

  onMount(() => {
    const unlisteners: Promise<() => void>[] = [];
    unlisteners.push(listen<AgentEvent>("agent-event", async ({ payload }) => {
      if (payload.type === "ready") {
        setAgentReady(true);
        setAgentStatus("");
        await openAgentSession();
        return;
      }
      if (payload.type === "session_opened") {
        setAgentSessionId(String(payload.sessionId ?? ""));
        if (agentState().timeline.length === 0) {
          setAgentState(restoreAgentHistory(Array.isArray(payload.history) ? payload.history : []));
        }
        setAgentStatus("");
        return;
      }
      if (payload.type === "interaction_requested") {
        setAgentState(state => applyAgentEvent(state, payload));
        return;
      }
      if (payload.type === "error") {
        setAgentStatus(String(payload.message ?? "Agent 发生错误"));
        showToolbarMessage(`Agent 操作失败：${String(payload.message ?? "未知错误")}`, "error");
      }
      setAgentState(state => applyAgentEvent(state, payload));
      if (payload.type === "run_finished" || payload.type === "run_aborted") setActiveRunId("");
    }));
    unlisteners.push(listen<string>("agent-protocol-error", ({ payload }) => setAgentStatus(`Agent 协议错误：${payload}`)));
    unlisteners.push(listen<string>("agent-sidecar-exited", () => {
      setAgentReady(false);
      setAgentStatus("Agent 进程已退出");
    }));
    onCleanup(() => { void Promise.all(unlisteners).then(items => items.forEach(unlisten => unlisten())); });
    void invoke<string>("agent_sidecar_status").then(status => {
      if (status === "running") setAgentStatus("正在等待 Oh My Pi...");
    });
    void invoke<AgentEvent | null>("agent_ready_snapshot").then(snapshot => {
      if (!snapshot || snapshot.type !== "ready") return;
      setAgentReady(true);
      setAgentStatus("");
      void openAgentSession();
    });
  });

  createEffect(on(projectRoot, (root) => {
    if (!root) return;
    const saved = projectAgentPreferences()[root];
    const nextId = saved?.llmProfileId && llmProfiles().some(profile => profile.id === saved.llmProfileId)
      ? saved.llmProfileId
      : llmProfiles().some(profile => profile.id === selectedLlmId())
        ? selectedLlmId()
        : llmProfiles()[0]?.id ?? "";
    setSelectedLlmId(nextId);
    setAgentSessionId("");
    setAgentState(emptyAgentState());
    followInteractionBottom = true;
  }));

  createEffect(() => {
    projectRoot();
    selectedLlmId();
    if (agentReady()) void openAgentSession();
  });

  createEffect(() => {
    agentState();
    if (!followInteractionBottom) return;
    queueMicrotask(() => {
      if (!interactionScroll) return;
      interactionScroll.scrollTop = interactionScroll.scrollHeight;
    });
  });

  const resizeAiPanel = (event: PointerEvent) => {
    if (!aiOpen()) return;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = aiPanelHeight();
    const move = (moveEvent: PointerEvent) => {
      setAiPanelHeight(clampAiPanelHeight(startHeight + startY - moveEvent.clientY, window.innerHeight));
      if (followInteractionBottom) queueMicrotask(() => {
        if (interactionScroll) interactionScroll.scrollTop = interactionScroll.scrollHeight;
      });
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      localStorage.setItem(aiPanelHeightKey, String(aiPanelHeight()));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
  };

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
    const currentTreeItem = selectedTreeItem();
    const currentFile = selectedFile();
    const nextTreeItem = state.files.some((file) => file.path === currentTreeItem)
      || project.folders.includes(currentTreeItem)
      ? currentTreeItem
      : project.entry;
    const nextSelectedFile = state.files.some((file) => file.path === currentFile)
      ? currentFile
      : project.entry;
    setSelectedFile(nextSelectedFile);
    setSelectedTreeItem(nextTreeItem);
    setSourceDraft(
      state.files.find((file) => file.path === nextSelectedFile)?.content ?? "",
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
        showToolbarMessage(`无法保存 ${file.path}：${operationErrorReason("save", error)}`, "error");
        return false;
      }
    }
    await refreshProjectFiles();
    showToolbarMessage("项目源码已保存", "success");
    return true;
  };

  const openProject = async () => {
    if (aiRunning()) {
      showToolbarMessage("请先停止 Agent 任务再切换项目", "warning");
      return;
    }
    const selected = await open({
      directory: true,
      multiple: false,
      title: "打开 LaTeX 项目",
    });
    if (!selected || Array.isArray(selected)) return;
    try {
      await loadProject(selected);
      showToolbarMessage(`已打开项目：${projectLocation(selected).name}`, "success");
    } catch (error) {
      showToolbarMessage(`无法打开项目：${operationErrorReason("open-project", error)}`, "error");
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

  const addFile = async (
    path: string,
    content = "",
  ) => {
    await invoke("create_project_file_with_content", {
      root: projectRoot(),
      path,
      content,
    });
    await refreshProjectFiles();
  };
  const addFolder = async (
    path: string,
  ) => {
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
    operationKind: OperationKind,
    successMessage: string,
    failureMessage: string,
  ) => {
    if (!projectRoot()) return;
    try {
      await operation();
      showToolbarMessage(successMessage, "success");
    } catch (error) {
      showToolbarMessage(`${failureMessage}：${operationErrorReason(operationKind, error)}`, "error");
    }
  };
  const targetFolder = () => {
    const selected = selectedTreeItem();
    if (projectFolders().includes(selected)) return selected;
    return parentFolder(selected);
  };
  const beginCreation = (kind: "file" | "folder") => {
    if (creationKind()) return;
    setRenamingPath("");
    setCreationFolder(targetFolder());
    setCreationKind(kind);
  };
  const cancelCreation = () => {
    setCreationKind();
    setCreationFolder("");
  };
  const commitCreation = (name: string) => {
    const kind = creationKind();
    const folder = creationFolder();
    if (!kind) return;
    cancelCreation();
    if (!isValidProjectItemName(name)) {
      showToolbarMessage(
        kind === "file"
          ? "无法新建文件：名称为空、属于系统保留名或包含非法字符"
          : "无法新建文件夹：名称为空、属于系统保留名或包含非法字符",
        "warning",
      );
      return;
    }
    const path = folder
      ? `${folder}/${name}`
      : name;
    selectTreeItem(path, kind === "file" ? "file" : "folder");
    void userFileOperation(
      () => kind === "file"
        ? addFile(path)
        : addFolder(path),
      kind === "file" ? "create-file" : "create-folder",
      kind === "file" ? `已新建文件：${path}` : `已新建文件夹：${path}`,
      kind === "file" ? `无法新建文件 ${path}` : `无法新建文件夹 ${path}`,
    );
  };
  const handleCreationKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelCreation();
    } else if (event.key === "Enter") {
      event.preventDefault();
      commitCreation((event.currentTarget as HTMLInputElement).value);
    }
  };
  const renameItem = () => {
    const from = selectedTreeItem();
    if (!from) return;
    setRenamingPath(from);
    setRenameValue(from.slice(from.lastIndexOf("/") + 1));
  };
  const cancelRename = () => setRenamingPath("");
  const commitRename = () => {
    const from = renamingPath();
    const name = renameValue();
    if (!from) return;
    if (!isValidProjectItemName(name)) {
      setRenamingPath("");
      showToolbarMessage(
        "无法重命名：名称为空、属于系统保留名或包含非法字符",
        "warning",
      );
      return;
    }
    const folder = parentFolder(from);
    const to = folder ? `${folder}/${name}` : name;
    selectTreeItem(to, projectFolders().includes(from) ? "folder" : "file");
    setRenamingPath("");
    void userFileOperation(
      () => renameOrMove(from, to),
      "rename",
      `已将 ${from} 重命名为 ${to}`,
      `无法重命名 ${from}`,
    );
  };
  const deleteItem = () => {
    const path = selectedTreeItem();
    if (!path) return;
    if (!window.confirm(`确定删除 ${path}？文件夹内内容也会被删除。`)) return;
    void userFileOperation(
      () => trashItem(path),
      "delete",
      `已将 ${path} 移入回收站`,
      `无法删除 ${path}`,
    );
  };
  const uploadFiles = async () => {
    const selected = await open({
      multiple: true,
      directory: false,
      title: "上传文件到项目",
    });
    if (!selected) return;
    const sources = Array.isArray(selected) ? selected : [selected];
    const folder = targetFolder();
    await userFileOperation(async () => {
      await invoke("import_project_files", {
        root: projectRoot(),
        folder,
        sources,
      });
      await refreshProjectFiles();
    }, "upload", `已上传 ${sources.length} 个文件到 ${folder || "项目根目录"}`, "无法上传文件");
  };

  const runAi = async () => {
    if (!prompt().trim()) return;
    if (!projectRoot()) {
      showToolbarMessage("AI 未执行：请先打开本地项目", "warning");
      return;
    }
    if (!selectedLlm()) {
      showToolbarMessage("AI 未执行：请先创建并选择 LLM 配置", "warning");
      return;
    }
    if (!agentSessionId()) {
      await openAgentSession();
      showToolbarMessage("Agent 会话正在恢复，请稍后再试", "warning");
      return;
    }
    const text = prompt();
    const wasRunning = agentState().running;
    followInteractionBottom = true;
    queueMicrotask(() => {
      if (!interactionScroll) return;
      interactionScroll.scrollTop = interactionScroll.scrollHeight;
    });
    setPrompt("");
    const runId = wasRunning ? activeRunId() : crypto.randomUUID();
    if (!runId) {
      showToolbarMessage("Agent 运行状态不同步，请停止后重试", "error");
      return;
    }
    if (!wasRunning) setActiveRunId(runId);
    setAgentState(state => {
      const id = crypto.randomUUID();
      return {
        ...state,
        messages: [...state.messages, {
        id,
        role: wasRunning ? "steering" : "user",
        text,
      }],
        timeline: [...state.timeline, { kind: "message", id }],
      running: true,
      };
    });
    try {
      await sendAgentCommand({
        type: wasRunning ? "steer" : "prompt",
        requestId: crypto.randomUUID(),
        sessionId: agentSessionId(),
        runId,
        text,
      });
    } catch (error) {
      setAgentState(state => ({ ...state, running: false }));
      if (!wasRunning) setActiveRunId("");
      showToolbarMessage(`AI 操作失败：${String(error)}`, "error");
    }
  };

  const stopAi = async () => {
    if (!agentSessionId()) return;
    const runId = activeRunId();
    await sendAgentCommand({
      type: "abort",
      requestId: crypto.randomUUID(),
      sessionId: agentSessionId(),
      runId,
    });
  };

  const respondToInteraction = async (requestId: string, value: unknown) => {
    await sendAgentCommand({ type: "interaction_response", requestId, value });
    setAgentState(state => ({
      ...state,
      interactions: state.interactions.filter(item => item.id !== requestId),
      timeline: state.timeline.filter(item => !(item.kind === "interaction" && item.id === requestId)),
    }));
  };

  const toggleAiRun = () => {
    if (aiRunning()) void stopAi();
    else void runAi();
  };

  const openAiSettings = () => {
    const config = selectedLlm();
    setCreatingLlmProfile(false);
    setProfileProvider(config?.provider ?? "");
    setAiEndpoint(config?.endpoint ?? "");
    setAiModel(config?.model ?? "");
    setAiKey(config?.apiKey ?? "");
    setAiSettingsOpen(true);
  };
  const newLlmProfile = () => {
    setCreatingLlmProfile(true);
    setProfileProvider("");
    setAiEndpoint("");
    setAiModel("");
    setAiKey("");
    setAiSettingsOpen(true);
  };
  const deleteLlmProfile = () => {
    const profile = selectedLlm();
    if (!profile || !window.confirm(`确定删除 ${profile.provider} 的模型“${profile.model}”？`)) return;
    const profiles = llmProfiles().filter(item => item.id !== profile.id);
    const projects = Object.fromEntries(Object.entries(projectAgentPreferences()).map(([root, preference]) => [
      root,
      preference.llmProfileId === profile.id ? { ...preference, llmProfileId: "" } : preference,
    ]));
    setLlmProfiles(profiles);
    setProjectAgentPreferences(projects);
    const nextId = profiles[0]?.id ?? "";
    setSelectedLlmId(nextId);
    setAgentSessionId("");
    persistAgentPreferences(profiles, projects, nextId);
    setAiSettingsOpen(false);
  };
  const restartAgent = async () => {
    setAgentStatus("正在重新启动 Agent...");
    await invoke("restart_agent_sidecar");
  };
  const toggleAiSettings = () =>
    aiSettingsOpen() ? cancelAiSettings() : openAiSettings();
  const cancelAiSettings = () => {
    setAiSettingsOpen(false);
  };
  const applyAiSettings = () => {
    if (!profileProvider().trim() || !aiEndpoint().trim() || !aiModel().trim()) {
      showToolbarMessage("Provider、Endpoint 和 Model 不能为空", "warning");
      return;
    }
    const existing = creatingLlmProfile() ? undefined : selectedLlm();
    const profile: LlmProfile = {
      id: existing?.id ?? crypto.randomUUID(),
      provider: profileProvider().trim(),
      endpoint: aiEndpoint().trim(),
      model: aiModel().trim(),
      apiKey: aiKey(),
    };
    if (hasDuplicateLlmModel(llmProfiles(), profile)) {
      showToolbarMessage("同一 Provider 下的模型名称不能重复", "warning");
      return;
    }
    const profiles = existing
      ? llmProfiles().map(item => item.id === profile.id ? profile : item)
      : [...llmProfiles(), profile];
    setLlmProfiles(profiles);
    setSelectedLlmId(profile.id);
    setCreatingLlmProfile(false);
    setAgentSessionId("");
    const root = projectRoot();
    const projects = root
      ? { ...projectAgentPreferences(), [root]: { agentId: "omp", llmProfileId: profile.id } }
      : projectAgentPreferences();
    setProjectAgentPreferences(projects);
    persistAgentPreferences(profiles, projects, profile.id);
    setAiSettingsOpen(false);
    showToolbarMessage("LLM 配置已应用", "success");
  };
  const selectTreeItem = (path: string, kind: "file" | "folder") => {
    setSelectedTreeItem(path);
    if (kind === "file") {
      setSelectedFile(path);
      setSourceDraft(
        workingFiles().find((file) => file.path === path)?.content ?? "",
      );
      setView("source");
    }
  };
  const selectPendingTreeItem = (item: HTMLElement | null) => {
    if (!item) return;
    selectTreeItem(
      item.dataset.treePath ?? "",
      item.dataset.treeKind === "folder" ? "folder" : "file",
    );
  };

  return (
    <main
      class="app-shell"
      onPointerDown={(event) => {
        const target = event.target as Element;
        const pendingTreeSelection = target.closest(".tree-item") as HTMLElement | null;
        if (
          creationKind() &&
          !target.closest(".tree-create") &&
          !target.closest(".file-operation-row")
        ) {
          commitCreation((document.activeElement as HTMLInputElement | null)?.value ?? "");
          selectPendingTreeItem(pendingTreeSelection);
        }
        if (renamingPath() && !target.closest(".tree-rename")) {
          commitRename();
          selectPendingTreeItem(pendingTreeSelection);
        }
        if (
          aiSettingsOpen() &&
          !target.closest(".ai-settings-popover") &&
          !target.closest(".ai-settings-button")
        )
          cancelAiSettings();
      }}
    >
      <header class="topbar">
        <div class="topbar-view-toggle">
          <button
            class={view() === "source" ? "active" : ""}
            onClick={() => setView("source")}
          >源码</button>
          <button
            class={view() === "preview" ? "active" : ""}
            onClick={() => setView("preview")}
          >正文</button>
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
      <Show when={toolbarMessage()}>
        {(current) => (
          <div class={`toolbar-message ${current().tone}`}>
            {current().text}
          </div>
        )}
      </Show>
      <section class="workspace">
        <aside class="outline">
          <div class="project-file-header">
            <button
              class="project-folder-button"
              aria-label="打开项目文件夹"
              title="打开项目文件夹"
              onClick={openProject}
              disabled={aiRunning()}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 6.5h7l2 2h9v10.5H3z" />
                <path d="M3 6.5V5h7l2 2" />
              </svg>
            </button>
            <Show when={projectRoot()}>
              <div class="project-path-display" title={projectRoot()}>
                {projectRoot()}
              </div>
            </Show>
          </div>
          <div class="files-heading">
            <strong>项目文件</strong>
          </div>
          <div class="file-actions file-operation-row">
            <button title="新建文件" aria-label="新建文件" onClick={() => beginCreation("file")}>
              <svg viewBox="0 0 24 24">
                <path d="M6 3h8l4 4v14H6zM14 3v5h5M12 12v6M9 15h6" />
              </svg>
            </button>
            <button
              title="新建文件夹"
              aria-label="新建文件夹"
              onClick={() => beginCreation("folder")}
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
             <Show when={creationKind() && !creationFolder()}>
               <InlineCreationInput
                 kind={creationKind()!}
                 onKeyDown={handleCreationKeyDown}
                 onCommit={commitCreation}
               />
             </Show>
             <For each={fileTree()}>
              {(node) => (
                <FileTreeNode
                  node={node}
                  selected={selectedTreeItem()}
                  renamingPath={renamingPath()}
                  renameValue={renameValue()}
                    onRenameValue={setRenameValue}
                    onCommitRename={commitRename}
                    onCancelRename={cancelRename}
                   creationKind={creationKind()}
                   creationFolder={creationFolder()}
                   onCreationKeyDown={handleCreationKeyDown}
                   onCreationCommit={commitCreation}
                      onSelect={(item) => selectTreeItem(item.path, item.kind)}
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
      <section
        class={`ai-dock ${aiOpen() ? "" : "collapsed"}`}
        style={`--ai-panel-height: ${aiPanelHeight()}px`}
      >
        <div class="ai-dock-resize-edge" onPointerDown={resizeAiPanel} />
        <button
          class="ai-dock-toggle"
          aria-label={aiOpen() ? "收起 AI 工作台" : "展开 AI 工作台"}
          onClick={() => setAiOpen(!aiOpen())}
        >
          <span />
        </button>
        <div class="ai-body" aria-hidden={!aiOpen()}>
            <div class="ai-interaction">
              <div class="agent-controls">
                <label>Agent <select disabled={aiRunning()}><option value="omp">Oh My Pi</option></select></label>
                <label>LLM
                  <select
                    value={selectedLlmId()}
                    disabled={aiRunning() || llmProfiles().length === 0}
                    onChange={(event) => {
                      const llmProfileId = event.currentTarget.value;
                      setSelectedLlmId(llmProfileId);
                      setAgentSessionId("");
                      const root = projectRoot();
                      const projects = root
                        ? { ...projectAgentPreferences(), [root]: { agentId: "omp", llmProfileId } }
                        : projectAgentPreferences();
                      setProjectAgentPreferences(projects);
                      persistAgentPreferences(llmProfiles(), projects, llmProfileId);
                    }}
                  >
                    <For each={llmProfiles()}>{profile => <option value={profile.id}>{profile.provider} · {profile.model}</option>}</For>
                  </select>
                </label>
                <span>{agentStatus()}</span>
                <Show when={!agentReady()}><button onClick={() => void restartAgent()}>重启</button></Show>
              </div>
              <div
                ref={interactionScroll}
                class="ai-interaction-scroll"
                onScroll={(event) => {
                  followInteractionBottom = isNearScrollBottom(event.currentTarget);
                }}
              >
                <Show
                  when={agentState().timeline.length}
                  fallback={
                    <div class="ai-interaction-empty">
                      在右侧输入任务，操作记录将在这里显示。
                    </div>
                  }
                >
                  <For each={agentState().timeline}>
                    {(item) => {
                      const message = () => agentState().messages.find(value => value.id === item.id);
                      const tool = () => agentState().tools.find(value => value.id === item.id);
                      const interaction = () => agentState().interactions.find(value => value.id === item.id);
                      return item.kind === "message" && message() ? (
                        <div class={`ai-turn ${message()!.role}`}>
                          <span>{message()!.role === "user" ? "你" : message()!.role === "steering" ? "引导" : "AI"}</span>
                          <div class="ai-turn-body"><p>{message()!.text}</p></div>
                        </div>
                      ) : item.kind === "tool" && tool() ? (
                        <AgentToolCard tool={tool()!} />
                      ) : item.kind === "interaction" && interaction() ? (
                        <div class="agent-interaction-card">
                          <strong>{interaction()!.title}</strong>
                          <Show when={interaction()!.message}><p>{interaction()!.message}</p></Show>
                          <Show
                            when={interaction()!.interaction === "confirm"}
                            fallback={interaction()!.interaction === "select" ? (
                              <div class="agent-interaction-actions">
                                <For each={interaction()!.options ?? []}>{option => <button onClick={() => void respondToInteraction(item.id, typeof option === "object" && option && "label" in option ? option.label : option)}>{typeof option === "object" && option && "label" in option ? String(option.label) : String(option)}</button>}</For>
                              </div>
                            ) : (
                              <form onSubmit={(event) => { event.preventDefault(); const input = event.currentTarget.elements.namedItem("agent-input") as HTMLInputElement; void respondToInteraction(item.id, input.value); }}>
                                <input name="agent-input" placeholder={interaction()!.message ?? "输入响应"} />
                                <button type="submit">提交</button>
                              </form>
                            )}
                          >
                            <div class="agent-interaction-actions">
                              <button onClick={() => void respondToInteraction(item.id, true)}>允许</button>
                              <button onClick={() => void respondToInteraction(item.id, false)}>拒绝</button>
                            </div>
                          </Show>
                        </div>
                      ) : null;
                    }}
                  </For>
                </Show>
              </div>
            </div>
            <div class="ai-composer">
              <Show when={aiSettingsOpen()}>
                <div class="ai-settings-popover">
                  <label>
                    <span>Provider</span>
                    <input value={profileProvider()} onInput={(event) => setProfileProvider(event.currentTarget.value)} />
                  </label>
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
                    <div class="llm-settings-actions">
                      <button aria-label="保存 LLM 配置" title="保存" onClick={applyAiSettings}>√</button>
                      <Show when={selectedLlm() && !creatingLlmProfile()}>
                        <button class="llm-delete" aria-label="删除 LLM 配置" title="删除" onClick={deleteLlmProfile}>×</button>
                      </Show>
                      <button aria-label="新建 LLM 配置" title="新建" onClick={newLlmProfile}>+</button>
                    </div>
                  </label>
                </div>
              </Show>
              <textarea
                value={prompt()}
                onInput={(event) => setPrompt(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
                    toggleAiRun();
                }}
                placeholder={aiRunning() ? "输入引导消息..." : "输入项目操作或源码修改要求..."}
              />
              <div class="composer-actions">
                <button
                  class={`ai-settings-button ${aiSettingsOpen() ? "active" : ""}`}
                  aria-label="AI 设置"
                  onClick={toggleAiSettings}
                  disabled={aiRunning()}
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
                  disabled={!agentReady() || (!aiRunning() && (!projectRoot() || !selectedLlm()))}
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
      </section>
    </main>
  );
}

function AgentToolCard(props: { tool: AgentTool }) {
  const [expanded, setExpanded] = createSignal(true);
  const [collapsible, setCollapsible] = createSignal(false);
  let content: HTMLDivElement | undefined;
  let autoCollapsed = false;
  let manuallyToggled = false;
  createEffect(() => {
    props.tool.input;
    props.tool.update;
    props.tool.result;
    queueMicrotask(() => {
      if (!content) return;
      const overflowing = content.scrollHeight > 160;
      setCollapsible(overflowing);
      if (overflowing && !autoCollapsed && !manuallyToggled) {
        autoCollapsed = true;
        setExpanded(false);
      }
    });
  });
  const toggle = () => {
    manuallyToggled = true;
    setExpanded(!expanded());
  };
  return (
    <section class={`agent-tool-card ${props.tool.status}`}>
      <button class="agent-tool-heading" onClick={toggle}>
        <span>{props.tool.status === "running" ? "◌" : props.tool.status === "completed" ? "✓" : "!"}</span>
        <strong>{props.tool.name}</strong>
        <span>{expanded() ? "−" : "+"}</span>
      </button>
      <div ref={content} class={`agent-tool-content ${expanded() ? "" : "collapsed"}`}>
        <ToolValue label="输入" value={props.tool.input} />
        <Show when={props.tool.update !== undefined}><ToolValue label="进度" value={props.tool.update} /></Show>
        <Show when={props.tool.result !== undefined}><ToolValue label="结果" value={props.tool.result} /></Show>
      </div>
    </section>
  );
}

function ToolValue(props: { label: string; value: unknown }) {
  const objectValue = () => props.value && typeof props.value === "object" && !Array.isArray(props.value)
    ? Object.entries(props.value as Record<string, unknown>)
    : [];
  const displayValue = (value: unknown) => typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <div class="tool-value">
      <strong>{props.label}</strong>
      <Show
        when={objectValue().length}
        fallback={<pre>{displayValue(props.value)}</pre>}
      >
        <dl>
          <For each={objectValue()}>{([key, value]) => (
            <div class={`tool-field tool-field-${key.toLowerCase()}`}>
              <dt>{key}</dt>
              <dd><pre>{displayValue(value)}</pre></dd>
            </div>
          )}</For>
        </dl>
      </Show>
    </div>
  );
}

function FileTreeNode(props: {
  node: ProjectTreeNode;
  selected: string;
  renamingPath: string;
  renameValue: string;
  creationKind?: "file" | "folder";
  creationFolder: string;
  onRenameValue: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onCreationKeyDown: (event: KeyboardEvent) => void;
  onCreationCommit: (name: string) => void;
  onSelect: (node: ProjectTreeNode) => void;
}) {
  const [expanded, setExpanded] = createSignal(true);
  const showingChildren = () =>
    expanded() || Boolean(props.creationKind && props.creationFolder === props.node.path);
  return (
    <div class="tree-branch">
      <Show
        when={props.renamingPath === props.node.path}
        fallback={
           <button
             data-tree-path={props.node.path}
             data-tree-kind={props.node.kind}
             class={`tree-item ${props.node.kind} ${props.selected === props.node.path ? "current" : ""}`}
            onClick={() => {
              props.onSelect(props.node);
              if (props.node.kind === "folder") setExpanded(!expanded());
            }}
          >
            <span>
              {props.node.kind === "folder" ? (showingChildren() ? "▾" : "▸") : "·"}
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
            if (event.key === "Escape") props.onCancelRename();
          }}
        />
      </Show>
      <Show when={props.node.kind === "folder" && showingChildren()}>
        <div class="tree-children">
          <Show when={props.creationKind && props.creationFolder === props.node.path}>
            <InlineCreationInput
              kind={props.creationKind!}
              onKeyDown={props.onCreationKeyDown}
              onCommit={props.onCreationCommit}
            />
          </Show>
          <For each={props.node.children}>
            {(child) => (
              <FileTreeNode
                node={child}
                selected={props.selected}
                renamingPath={props.renamingPath}
                renameValue={props.renameValue}
                creationKind={props.creationKind}
                creationFolder={props.creationFolder}
                onRenameValue={props.onRenameValue}
                onCommitRename={props.onCommitRename}
                onCancelRename={props.onCancelRename}
                onCreationKeyDown={props.onCreationKeyDown}
                onCreationCommit={props.onCreationCommit}
                onSelect={props.onSelect}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function InlineCreationInput(props: {
  kind: "file" | "folder";
  onKeyDown: (event: KeyboardEvent) => void;
  onCommit: (name: string) => void;
}) {
  let input: HTMLInputElement | undefined;
  onMount(() => input?.focus());
  return (
    <div class="tree-create-row">
      <span>·</span>
      <input
        ref={input}
        class="tree-create"
        autofocus
        placeholder={props.kind === "file" ? "新建文件" : "新建文件夹"}
        onBlur={(event) => props.onCommit(event.currentTarget.value)}
        onKeyDown={props.onKeyDown}
      />
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
  let editor: HTMLDivElement | undefined;
  let lineNumberGutter: HTMLDivElement | undefined;
  const lineNumbers = createMemo(() => {
    const count = Math.max(1, props.content.split("\n").length);
    return Array.from({ length: count }, (_, index) => index + 1);
  });

  createEffect(() => {
    const path = props.path;
    const content = props.content;
    const position = props.scrollPosition;
    void path;
    queueMicrotask(() => {
      if (!editor) return;
      if (editor.textContent !== content) editor.textContent = content;
      editor.scrollTop = position.top;
      editor.scrollLeft = 0;
      if (lineNumberGutter) lineNumberGutter.scrollTop = editor.scrollTop;
    });
  });

  const pastePlainText = (event: ClipboardEvent) => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") ?? "";
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount || !editor.contains(selection.anchorNode)) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    editor?.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }));
  };

  return (
    <article class="source-wrap">
      <div class="source-code">
        <Show when={props.editable} fallback={<div class="source-unavailable">无法打开此文件</div>}>
          <div ref={lineNumberGutter} class="source-line-numbers" aria-hidden="true">
            <For each={lineNumbers()}>{(line) => <span>{line}</span>}</For>
          </div>
          <div
            ref={editor}
            class="source-editor"
            contentEditable
            role="textbox"
            aria-multiline="true"
            spellcheck={false}
            autocapitalize="off"
            autocorrect="off"
            onInput={(event) => props.onInput(event.currentTarget.textContent ?? "")}
            onPaste={pastePlainText}
            onScroll={(event) => {
              if (lineNumberGutter) lineNumberGutter.scrollTop = event.currentTarget.scrollTop;
              props.onScrollPosition({ top: event.currentTarget.scrollTop, left: 0 });
            }}
          />
        </Show>
      </div>
    </article>
  );
}
