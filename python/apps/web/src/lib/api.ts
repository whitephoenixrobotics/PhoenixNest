// Base URL of the Python module's FastAPI backend, resolved once at load.
// Priority:
//   1. window.__PHOENIX_API_URL__  — injected by the Electron preload at
//      runtime (the desktop build picks the backend port at launch, like flow).
//   2. NEXT_PUBLIC_API_URL         — build-time override (CI / custom dev).
//   3. http://127.0.0.1:8200       — dev default.
// 127.0.0.1 (not "localhost"): on Windows the browser may resolve "localhost"
// to IPv6 ::1 first, but uvicorn binds IPv4 only → connection fails.
function resolveApiUrl(): string {
  if (typeof window !== "undefined") {
    const injected = (window as unknown as { __PHOENIX_API_URL__?: string })
      .__PHOENIX_API_URL__;
    if (injected) return injected.replace(/\/$/, "");
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8200";
}

export const API_URL = resolveApiUrl();

export interface ApiInfo {
  name: string;
  version: string;
  python: string;
  platform: string;
}

export async function fetchInfo(signal?: AbortSignal): Promise<ApiInfo> {
  const res = await fetch(`${API_URL}/api/info`, { signal });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exit_code: number | null;
  duration_ms: number;
  timed_out: boolean;
}

export async function runScript(
  code: string,
  signal?: AbortSignal,
): Promise<RunResult> {
  const res = await fetch(`${API_URL}/api/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
    signal,
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// ── Projects ─────────────────────────────────────────────────────────
export interface Project {
  slug: string;
  name: string;
  description: string;
  created_at: string;
  python_version: string;
  has_venv: boolean;
}

export interface ProjectDetail extends Project {
  main: string;
}

export async function listProjects(signal?: AbortSignal): Promise<Project[]> {
  const res = await fetch(`${API_URL}/api/projects`, { signal });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function createProject(
  name: string,
  description: string,
): Promise<Project> {
  const res = await fetch(`${API_URL}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function getProject(
  slug: string,
  signal?: AbortSignal,
): Promise<ProjectDetail> {
  const res = await fetch(`${API_URL}/api/projects/${slug}`, { signal });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function runProject(
  slug: string,
  code: string,
  signal?: AbortSignal,
): Promise<RunResult> {
  const res = await fetch(`${API_URL}/api/projects/${slug}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
    signal,
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function deleteProject(slug: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/projects/${slug}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
}

// ── Notebook + kernel ────────────────────────────────────────────────
export type CellKind = "code" | "markdown";

export interface NotebookCell {
  id: string;
  source: string;
  kind: CellKind;
}

export interface CellOutput {
  kind: "html" | "svg" | "image" | "text";
  data: string;
  mime: string;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  result: string | null;
  outputs: CellOutput[];
  ok: boolean;
  count: number;
  timed_out: boolean;
  duration_ms: number;
}

export interface Variable {
  name: string;
  type: string;
  preview: string;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

export interface SystemStats {
  ram_used: number;
  ram_total: number;
  ram_percent: number;
  disk_used: number;
  disk_total: number;
  disk_percent: number;
}

// `path` is the relative .ipynb within the workspace (per-file notebook).
export async function getNotebook(
  slug: string,
  path = "",
  signal?: AbortSignal,
): Promise<NotebookCell[]> {
  const qs = new URLSearchParams({ path });
  const res = await fetch(`${API_URL}/api/projects/${slug}/notebook?${qs}`, {
    signal,
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  return data.cells as NotebookCell[];
}

export async function saveNotebook(
  slug: string,
  cells: NotebookCell[],
  path = "",
): Promise<void> {
  const qs = new URLSearchParams({ path });
  const res = await fetch(`${API_URL}/api/projects/${slug}/notebook?${qs}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cells }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
}

export async function executeCell(
  slug: string,
  code: string,
  path = "",
  signal?: AbortSignal,
  stdin = "",
): Promise<ExecResult> {
  const qs = new URLSearchParams({ path });
  const res = await fetch(
    `${API_URL}/api/projects/${slug}/kernel/execute?${qs}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, stdin }),
      signal,
    },
  );
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// Interactive cell run over WebSocket — streams stdout and, when the cell
// calls input(), fires onInput(prompt); reply with the returned sendInput().
export interface InteractiveRun {
  sendInput: (value: string) => void;
  close: () => void;
}

export function runCellInteractive(
  slug: string,
  path: string,
  code: string,
  handlers: {
    onStdout: (s: string) => void;
    onInput: (prompt: string) => void;
    onResult: (res: ExecResult) => void;
    onError: (msg: string) => void;
  },
): InteractiveRun {
  const wsBase = API_URL.replace(/^http/i, "ws");
  const qs = new URLSearchParams({ path });
  const ws = new WebSocket(`${wsBase}/api/projects/${slug}/kernel/ws?${qs}`);
  let done = false;
  ws.onopen = () => ws.send(JSON.stringify({ code }));
  ws.onmessage = (e) => {
    let m: {
      type?: string;
      data?: string;
      prompt?: string;
      message?: string;
    } & Partial<ExecResult>;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    if (m.type === "stdout") handlers.onStdout(m.data ?? "");
    else if (m.type === "input") handlers.onInput(m.prompt ?? "");
    else if (m.type === "result") {
      done = true;
      handlers.onResult(m as ExecResult);
    } else if (m.type === "error") {
      done = true;
      handlers.onError(m.message ?? "error");
    }
  };
  ws.onerror = () => {
    if (!done) handlers.onError("เชื่อมต่อ kernel ไม่ได้");
  };
  ws.onclose = () => {
    // socket closed before a result → kernel died / disconnected; don't spin
    if (!done) {
      done = true;
      handlers.onError("การเชื่อมต่อ kernel ถูกปิด (อาจหยุดทำงาน) — ลองรันใหม่");
    }
  };
  return {
    sendInput: (value) => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "input", value }));
    },
    close: () => ws.close(),
  };
}

export async function restartKernel(slug: string, path = ""): Promise<void> {
  const qs = new URLSearchParams({ path });
  const res = await fetch(
    `${API_URL}/api/projects/${slug}/kernel/restart?${qs}`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error(`API ${res.status}`);
}

export async function getVariables(
  slug: string,
  path = "",
  signal?: AbortSignal,
): Promise<Variable[]> {
  const qs = new URLSearchParams({ path });
  const res = await fetch(`${API_URL}/api/projects/${slug}/kernel/vars?${qs}`, {
    signal,
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// ── Workspaces (VS Code "Open Folder") ───────────────────────────────
export interface Workspace {
  id: string;
  path: string;
  name: string;
  has_venv: boolean;
  python_version: string;
}

export async function listWorkspaces(
  signal?: AbortSignal,
): Promise<Workspace[]> {
  const res = await fetch(`${API_URL}/api/workspaces`, { signal });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function pickFolder(): Promise<string | null> {
  const res = await fetch(`${API_URL}/api/workspaces/pick`, { method: "POST" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()).path ?? null;
}

export async function openWorkspace(path: string): Promise<Workspace> {
  const res = await fetch(`${API_URL}/api/workspaces/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    throw new Error(d?.detail || `API ${res.status}`);
  }
  return res.json();
}

export async function createWorkspace(
  parent: string,
  name: string,
): Promise<Workspace> {
  const res = await fetch(`${API_URL}/api/workspaces/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parent, name }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    throw new Error(d?.detail || `API ${res.status}`);
  }
  return res.json();
}

export async function getWorkspace(
  id: string,
  signal?: AbortSignal,
): Promise<Workspace> {
  const res = await fetch(`${API_URL}/api/workspaces/${id}`, { signal });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function closeWorkspace(id: string): Promise<void> {
  await fetch(`${API_URL}/api/workspaces/${id}`, { method: "DELETE" });
}

export async function listFiles(
  slug: string,
  path = "",
  showHidden = false,
  signal?: AbortSignal,
): Promise<FileEntry[]> {
  const qs = new URLSearchParams({ path, show_hidden: String(showHidden) });
  const res = await fetch(`${API_URL}/api/projects/${slug}/files?${qs}`, {
    signal,
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function uploadFile(
  slug: string,
  file: File,
  path = "",
): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  const qs = new URLSearchParams({ path });
  const res = await fetch(
    `${API_URL}/api/projects/${slug}/files/upload?${qs}`,
    { method: "POST", body: form },
  );
  if (!res.ok) throw new Error(`API ${res.status}`);
}

export interface FileContent {
  editable: boolean;
  content: string;
  reason: string;
}

// Direct URL to a file's raw bytes (for <img>, downloads, etc.).
export function fileRawUrl(slug: string, path: string): string {
  const qs = new URLSearchParams({ path });
  return `${API_URL}/api/projects/${slug}/files/raw?${qs}`;
}

export async function getFileContent(
  slug: string,
  path: string,
  signal?: AbortSignal,
): Promise<FileContent> {
  const qs = new URLSearchParams({ path });
  const res = await fetch(
    `${API_URL}/api/projects/${slug}/files/content?${qs}`,
    { signal },
  );
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function saveFileContent(
  slug: string,
  path: string,
  content: string,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/projects/${slug}/files/content`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
}

export async function createEntry(
  slug: string,
  path: string,
  isDir: boolean,
): Promise<FileEntry> {
  const res = await fetch(`${API_URL}/api/projects/${slug}/files/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, is_dir: isDir }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || `API ${res.status}`);
  }
  return res.json();
}

export async function deleteEntry(slug: string, path: string): Promise<void> {
  const qs = new URLSearchParams({ path });
  const res = await fetch(`${API_URL}/api/projects/${slug}/files?${qs}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
}

export async function runFile(
  slug: string,
  path: string,
  signal?: AbortSignal,
  stdin = "",
): Promise<RunResult> {
  const qs = new URLSearchParams({ path });
  const res = await fetch(`${API_URL}/api/projects/${slug}/run-file?${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stdin }),
    signal,
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// Interactive .py run over WebSocket — streams stdout and pauses for input().
export function runFileInteractive(
  slug: string,
  path: string,
  handlers: {
    onStdout: (s: string) => void;
    onInput: (prompt: string) => void;
    onResult: (res: RunResult) => void;
    onError: (msg: string) => void;
  },
): InteractiveRun {
  const wsBase = API_URL.replace(/^http/i, "ws");
  const qs = new URLSearchParams({ path });
  const ws = new WebSocket(`${wsBase}/api/projects/${slug}/run-file/ws?${qs}`);
  let done = false;
  ws.onopen = () => ws.send(JSON.stringify({}));
  ws.onmessage = (e) => {
    let m: {
      type?: string;
      data?: string;
      prompt?: string;
      message?: string;
    } & Partial<RunResult>;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    if (m.type === "stdout") handlers.onStdout(m.data ?? "");
    else if (m.type === "input") handlers.onInput(m.prompt ?? "");
    else if (m.type === "result") {
      done = true;
      handlers.onResult(m as RunResult);
    } else if (m.type === "error") {
      done = true;
      handlers.onError(m.message ?? "error");
    }
  };
  ws.onerror = () => {
    if (!done) handlers.onError("เชื่อมต่อ backend ไม่ได้");
  };
  ws.onclose = () => {
    if (!done) {
      done = true;
      handlers.onError("การเชื่อมต่อถูกปิด — ลองรันใหม่");
    }
  };
  return {
    sendInput: (value) => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "input", value }));
    },
    close: () => ws.close(),
  };
}

export async function renameEntry(
  slug: string,
  path: string,
  newName: string,
): Promise<FileEntry> {
  const res = await fetch(`${API_URL}/api/projects/${slug}/files/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, new_name: newName }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || `API ${res.status}`);
  }
  return res.json();
}

export async function moveEntry(
  slug: string,
  path: string,
  destDir: string,
): Promise<FileEntry> {
  const res = await fetch(`${API_URL}/api/projects/${slug}/files/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, dest_dir: destDir }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail || `API ${res.status}`);
  }
  return res.json();
}

// Absolute filesystem path of a file (for "copy path").
export async function fileAbsPath(slug: string, path: string): Promise<string> {
  const qs = new URLSearchParams({ path });
  const res = await fetch(
    `${API_URL}/api/projects/${slug}/files/abspath?${qs}`,
  );
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()).path as string;
}

// ── Code tools (Ruff: lint / format / fix) ───────────────────────────
export interface Diagnostic {
  line: number;
  column: number;
  end_line: number;
  end_column: number;
  code: string;
  message: string;
  severity: "error" | "warning";
}

export async function lintCode(
  code: string,
  cell = false,
  signal?: AbortSignal,
): Promise<Diagnostic[]> {
  const res = await fetch(`${API_URL}/api/lint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, cell }),
    signal,
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// Kernel-aware cell lint: flags genuinely-undefined names (e.g. a forgotten
// import) but not variables defined in other cells.
export async function lintCell(
  slug: string,
  path: string,
  code: string,
  signal?: AbortSignal,
): Promise<Diagnostic[]> {
  const qs = new URLSearchParams({ path });
  const res = await fetch(`${API_URL}/api/projects/${slug}/kernel/lint?${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
    signal,
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

async function transformCode(
  endpoint: "format" | "fix",
  code: string,
): Promise<string> {
  const res = await fetch(`${API_URL}/api/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()).code as string;
}

export const formatCode = (code: string) => transformCode("format", code);
export const fixCode = (code: string) => transformCode("fix", code);

export interface Completion {
  label: string;
  type: string;
}

// Static completion for files (Jedi).
export async function completeCode(
  code: string,
  line: number,
  column: number,
  signal?: AbortSignal,
): Promise<Completion[]> {
  const res = await fetch(`${API_URL}/api/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, line, column }),
    signal,
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// Live completion for a notebook cell (kernel namespace — real runtime attrs).
export async function completeCell(
  slug: string,
  path: string,
  code: string,
  line: number,
  column: number,
  signal?: AbortSignal,
): Promise<Completion[]> {
  const qs = new URLSearchParams({ path });
  const res = await fetch(
    `${API_URL}/api/projects/${slug}/kernel/complete?${qs}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, line, column }),
      signal,
    },
  );
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function getSystemStats(
  signal?: AbortSignal,
): Promise<SystemStats> {
  const res = await fetch(`${API_URL}/api/system/stats`, { signal });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// ── Packages (pip in the project venv) ───────────────────────────────
export interface Package {
  name: string;
  version: string;
}

export async function listPackages(
  slug: string,
  topOnly = false,
  signal?: AbortSignal,
): Promise<Package[]> {
  const qs = new URLSearchParams({ top_only: String(topOnly) });
  const res = await fetch(`${API_URL}/api/projects/${slug}/packages?${qs}`, {
    signal,
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function uninstallPackage(
  slug: string,
  name: string,
): Promise<{ ok: boolean; log: string }> {
  const res = await fetch(
    `${API_URL}/api/projects/${slug}/packages/uninstall`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
  );
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// Streams pip output; calls onLine per line, returns the exit code.
export async function installPackage(
  slug: string,
  name: string,
  onLine: (line: string) => void,
  signal?: AbortSignal,
): Promise<number> {
  const res = await fetch(`${API_URL}/api/projects/${slug}/packages/install`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`API ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let code = -1;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const obj = JSON.parse(line.slice(6));
        if (obj.line !== undefined) onLine(obj.line);
        if (obj.done !== undefined) code = obj.done;
      } catch {
        /* ignore */
      }
    }
  }
  return code;
}

// ── AI assistant (Ollama / DeepSeek) ─────────────────────────────────
export interface AiProvider {
  id: string;
  kind: "openai" | "anthropic" | "gemini";
  label: string;
  model: string;
}

export interface AiStatus {
  online: boolean; // is Ollama running
  active: string; // active assistant id (ollama:<tag> | api:<id>)
  kind: "ollama" | "openai" | "anthropic";
  label: string | null;
  model: string | null;
  model_ready: boolean;
  installed: string[]; // catalog editions already pulled
  installed_models: string[]; // all installed Ollama tags
  providers: AiProvider[];
}

export interface AiHardware {
  gpu: string | null;
  vram_mb: number | null;
  ram_mb: number | null;
  recommended: string;
}

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export async function aiStatus(signal?: AbortSignal): Promise<AiStatus> {
  const res = await fetch(`${API_URL}/api/ai/status`, { signal });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function aiHardware(signal?: AbortSignal): Promise<AiHardware> {
  const res = await fetch(`${API_URL}/api/ai/hardware`, { signal });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function aiSelectModel(model: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/ai/select`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    throw new Error(d?.detail || `API ${res.status}`);
  }
}

// Delete an installed Ollama model.
export async function aiDeleteModel(model: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/ai/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    throw new Error(d?.detail || `API ${res.status}`);
  }
}

// Add an external API provider (OpenAI-compatible or Claude). Returns its id.
export async function aiAddProvider(body: {
  kind: "openai" | "anthropic" | "gemini";
  label: string;
  model: string;
  api_key: string;
  base_url: string;
}): Promise<string> {
  const res = await fetch(`${API_URL}/api/ai/providers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    throw new Error(d?.detail || `API ${res.status}`);
  }
  return (await res.json()).id as string;
}

export async function aiDeleteProvider(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/ai/providers/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    throw new Error(d?.detail || `API ${res.status}`);
  }
}

// Download a model via Ollama, streaming progress (status text + percent).
export async function aiPull(
  model: string,
  onProgress: (status: string, pct: number | null) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/ai/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
    signal,
  });
  if (!res.ok || !res.body) {
    const d = await res.json().catch(() => null);
    throw new Error(d?.detail || `API ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return;
      let obj: { status?: string; pct?: number | null; error?: string };
      try {
        obj = JSON.parse(data);
      } catch {
        continue;
      }
      if (obj.error) throw new Error(obj.error);
      onProgress(obj.status ?? "", obj.pct ?? null);
    }
  }
}

// Ask the AI for the corrected code only (for the apply-with-diff flow).
export async function aiFix(code: string, error: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/ai/fix`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, error }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    throw new Error(d?.detail || `API ${res.status}`);
  }
  return (await res.json()).code as string;
}

// Streams the assistant reply token-by-token via onToken; throws on error.
export async function aiChat(
  messages: AiMessage[],
  onToken: (t: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`API ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return;
      let obj: { t?: string; error?: string };
      try {
        obj = JSON.parse(data);
      } catch {
        continue;
      }
      if (obj.error) throw new Error(obj.error);
      if (obj.t) onToken(obj.t);
    }
  }
}

export async function killTerminal(slug: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/projects/${slug}/terminal/kill`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
}
