import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from "react";
import { importVideo, recognizeHandwriting, runAi, runModulePractice, testApiConfig } from "./api";
import { documentPlaceholder, readAsDataUrl, readPdfText, readTextFile } from "./fileReaders";
import { createId, storage } from "./storage";
import type {
  AiNote,
  ApiConfig,
  MaterialKind,
  Mistake,
  MockAttempt,
  ProviderPreset,
  StudyMaterial,
  StudyProject,
  StudyTask,
  WeakPoint
} from "./types";

type ProjectTab = "overview" | "materials" | "plan" | "module" | "result" | "review";
type ModuleStatus = "todo" | "doing" | "done";
type ModulePriority = "low" | "medium" | "high";
type ModuleDifficulty = "low" | "medium" | "high";
type UploadQueueItem = {
  id: string;
  name: string;
  state: "reading" | "vision" | "done" | "failed";
  message: string;
};

const presets: ProviderPreset[] = [
  { provider_name: "DeepSeek", base_url: "https://api.deepseek.com", model: "deepseek-chat" },
  { provider_name: "Kimi 国内", base_url: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  { provider_name: "Kimi 国际", base_url: "https://api.moonshot.ai/v1", model: "moonshot-v1-8k" },
  { provider_name: "OpenAI", base_url: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
  { provider_name: "自定义", base_url: "https://", model: "" }
];

const defaultApiConfig: ApiConfig = {
  ...presets[0],
  api_key: "",
  temperature: 0.4,
  max_tokens: 1800
};

const emptyProject = {
  subject: "",
  exam_date: "",
  daily_minutes: 120,
  target_score: "",
  weak_points: ""
};

const emptyModule = {
  title: "",
  estimated_minutes: 45,
  priority: "medium" as ModulePriority,
  difficulty: "medium" as ModuleDifficulty,
  note: ""
};

const emptyMistake = {
  question: "",
  reason: "",
  fix: ""
};

const emptyWeakPoint: Pick<WeakPoint, "title" | "evidence" | "severity"> = {
  title: "",
  evidence: "",
  severity: "medium"
};

const emptyMock = {
  title: "",
  score: "",
  duration_minutes: 30,
  feedback: ""
};

const moduleColumns: { status: ModuleStatus; title: string; hint: string }[] = [
  { status: "todo", title: "待学习", hint: "还没开始的知识点" },
  { status: "doing", title: "学习中", hint: "正在学的内容" },
  { status: "done", title: "已学习", hint: "已经学完的模块" }
];

const visibleTabs: { tab: ProjectTab; label: string }[] = [
  { tab: "overview", label: "总览" },
  { tab: "materials", label: "资料" },
  { tab: "plan", label: "计划" },
  { tab: "review", label: "复盘" }
];

const knowledgeTerms = [
  "操作系统引论",
  "进程同步",
  "进程通信",
  "进程调度",
  "处理器调度",
  "线程",
  "进程",
  "互斥",
  "信号量",
  "管程",
  "死锁",
  "内存管理",
  "虚拟存储",
  "页面置换",
  "分页",
  "分段",
  "文件目录",
  "文件管理",
  "磁盘调度",
  "磁盘存储",
  "设备管理",
  "输入输出",
  "I/O"
];

function nowIso() {
  return new Date().toISOString();
}

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function daysLeft(date: string) {
  if (!date) return "-";
  const target = new Date(`${date}T23:59:59`);
  return Math.max(0, Math.ceil((target.getTime() - Date.now()) / 86400000));
}

function normalizeMinutes(value: number) {
  if (!Number.isFinite(value)) return 30;
  return Math.max(10, Math.min(480, Math.round(value)));
}

function moduleStatus(task: StudyTask): ModuleStatus {
  if (task.module_status) return task.module_status;
  return task.status === "done" ? "done" : "todo";
}

function materialKindLabel(material: StudyMaterial) {
  const labels: Record<MaterialKind, string> = {
    pdf: "PDF 课件 · 文字和页面识别",
    document: "Word / DOC 资料",
    markdown: "Markdown 笔记",
    text: "手动文本",
    file: "文本文件",
    handwriting: "手写笔记",
    video: "视频字幕"
  };
  return labels[material.kind] || material.kind;
}

function stripMarkdown(text: string) {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ""))
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/[*_~#]+/g, "")
    .replace(/\|/g, " ")
    .trim();
}

function previewText(text: string, max = 220) {
  return stripMarkdown(text).replace(/\n{3,}/g, "\n\n").slice(0, max);
}

function compactTitle(raw: string, fallback: string) {
  const cleaned = stripMarkdown(raw)
    .replace(/^(模块|知识点|名称|标题)\s*[:：]?\s*/i, "")
    .replace(/优先级\s*[:：]?\s*[高中低]/g, "")
    .replace(/预计(学习)?时间\s*[:：]?\s*\d+(\.\d+)?\s*(分钟|min|小时|h)/gi, "")
    .trim();
  const firstPart = cleaned.split(/[：:。；;，,\n（(]/)[0]?.trim();
  const title = (firstPart || cleaned || fallback).replace(/\s+/g, " ");
  return title.length > 18 ? `${title.slice(0, 18)}...` : title;
}

function getJsonArrayText(text: string) {
  const cleaned = stripMarkdown(text);
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  return start >= 0 && end > start ? cleaned.slice(start, end + 1) : "";
}

function jsonModulesToHumanText(text: string) {
  const jsonText = getJsonArrayText(text);
  if (!jsonText) return "";
  try {
    const data = JSON.parse(jsonText);
    if (!Array.isArray(data)) return "";
    const modules = data
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const record = item as Record<string, unknown>;
        const title = String(record.title || record.name || record.module || record.moduleName || "").trim();
        if (!title) return "";
        const minutes = record.estimatedminutes ?? record.estimated_minutes ?? record.estimatedMinutes ?? record.minutes;
        const priority = String(record.priority || "").trim();
        const note = String(record.note || record.reason || record.description || record.practice || "").trim();
        return [
          `模块：${title}`,
          minutes ? `预计时间：${minutes} 分钟` : "",
          priority ? `优先级：${priority}` : "",
          note ? `说明：${note}` : ""
        ].filter(Boolean).join("\n");
      })
      .filter(Boolean);
    return modules.join("\n\n");
  } catch {
    return "";
  }
}

function humanReadableAiText(text: string) {
  return jsonModulesToHumanText(text) || stripMarkdown(text);
}

function renderHumanText(text: string) {
  const blocks = humanReadableAiText(text).split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  if (!blocks.length) return <p className="muted">暂无内容。</p>;
  return (
    <div className="ai-text">
      {blocks.map((block, index) => {
        const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);
        const isList = lines.length > 1 && lines.every((line) => line.startsWith("• "));
        if (isList) {
          return (
            <ul key={index}>
              {lines.map((line) => <li key={line}>{line.replace(/^•\s*/, "")}</li>)}
            </ul>
          );
        }
        return <p key={index}>{block}</p>;
      })}
    </div>
  );
}

function taskOrder(task: StudyTask, fallback: number) {
  return typeof task.order === "number" ? task.order : fallback;
}

function toProjectPayload(project: StudyProject) {
  return {
    subject: project.subject,
    exam_date: project.exam_date,
    daily_minutes: project.daily_minutes,
    target_score: project.target_score,
    weak_points: project.weak_points
  };
}

function parsePriority(line: string): ModulePriority {
  if (/重要排名\s*[:：]?\s*[1-3]\b|高|重要|核心|优先/.test(line)) return "high";
  if (/低|选学|有空/.test(line)) return "low";
  return "medium";
}

function parseDifficulty(text: string): ModuleDifficulty {
  const cleaned = stripMarkdown(text);
  const match = cleaned.match(/难度\s*[:：]\s*(低|中|高|简单|一般|困难)/);
  const value = match?.[1] || cleaned;
  if (/高|困难|难/.test(value)) return "high";
  if (/低|简单|易/.test(value)) return "low";
  return "medium";
}

function difficultyLabel(value?: ModuleDifficulty) {
  if (value === "high") return "难度高";
  if (value === "low") return "难度低";
  return "难度中";
}

function priorityLabel(value?: ModulePriority) {
  if (value === "high") return "高重要";
  if (value === "low") return "低重要";
  return "中重要";
}

function extractNumber(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const value = Number(match[1]);
      if (Number.isFinite(value)) return value;
    }
  }
  return undefined;
}

function extractField(text: string, names: string[]) {
  const label = names.join("|");
  const pattern = new RegExp(`(?:${label})\\s*[:：]\\s*([^；;\\n]+)`);
  return stripMarkdown(text.match(pattern)?.[1] || "").trim();
}

function extractExamPoints(text: string) {
  return extractField(text, ["考察内容", "考查内容", "考点内容", "考试内容", "会考什么", "重点"]);
}

function extractModuleTitle(line: string) {
  const cleaned = stripMarkdown(line)
    .replace(/预计(学习)?时间\s*[:：]?\s*\d+(\.\d+)?\s*(分钟|min|小时|h)/gi, "")
    .replace(/预计完成时间\s*[:：]?\s*\d+(\.\d+)?\s*(分钟|min|小时|h)/gi, "")
    .replace(/难度\s*[:：]\s*(低|中|高|简单|一般|困难)/g, "")
    .replace(/重要(程度)?排名\s*[:：]?\s*\d+/g, "")
    .replace(/\d+(\.\d+)?\s*(分钟|min|小时|h)/gi, "")
    .replace(/^(第\s*\d+\s*(天|章|页)\s*)+/g, "")
    .trim();
  const explicit = cleaned.match(/(?:模块名称|知识点名称|模块名|知识点|考点|主题)\s*[:：]\s*([^，。；;\n｜|]+?)(?:\s+预计|$|[，。；;\n｜|])/i);
  const pipeFirst = cleaned.split(/[｜|]/)[0]?.trim();
  const candidate = (explicit?.[1] || pipeFirst || cleaned)
    .replace(/^(模块|知识点|考点)\s*\d*\s*[:：]?\s*/i, "")
    .replace(/^(名称|标题)\s*[:：]?\s*/i, "")
    .replace(/\s+/g, "");
  const term = knowledgeTerms.find((item) => cleaned.includes(item));
  if (!candidate) return term || "";
  if (candidate.length < 2 || candidate.length > 16) return term || "";
  if (/第\s*\d+\s*(天|章|页)|每天|天数|高频|聚焦|高效|综合|复习|练习|任务|计划|安排|资料|时间|完成|根据|模块$/.test(candidate)) return term || "";
  return candidate;
}

function displayModuleTitle(title: string, note?: string) {
  const cleaned = stripMarkdown(title).replace(/\s+/g, "");
  const extracted = extractModuleTitle(cleaned) || extractModuleTitle(note || "");
  return extracted || compactTitle(cleaned, "知识点");
}

function parseModulesFromPlan(content: string, projectId: string, noteId: string, existingCount: number): StudyTask[] {
  const jsonText = getJsonArrayText(content);
  if (jsonText) {
    try {
      const data = JSON.parse(jsonText);
      if (Array.isArray(data)) {
        const seen = new Set<string>();
        return data.flatMap((item, index) => {
          if (!item || typeof item !== "object") return [];
          const record = item as Record<string, unknown>;
          const rawTitle = String(record.title || record.name || record.module || record.moduleName || "");
          const note = String(record.note || record.reason || record.description || record.practice || "");
          const examPoints = String(record.exam_points || record.examPoints || record.points || record.content || record.test_points || note || "");
          const title = extractModuleTitle(rawTitle) || extractModuleTitle(note) || compactTitle(rawTitle, "知识点");
          if (!title || seen.has(title)) return [];
          seen.add(title);
          const rawMinutes = Number(record.estimatedminutes ?? record.estimated_minutes ?? record.estimatedMinutes ?? record.minutes);
          const rawRank = Number(record.importance_rank ?? record.importanceRank ?? record.rank);
          const line = humanReadableAiText(JSON.stringify([record]));
          return [{
            id: createId("module"),
            project_id: projectId,
            title,
            date: dateKey(),
            estimated_minutes: Number.isFinite(rawMinutes) ? normalizeMinutes(rawMinutes) : 45,
            status: "todo",
            module_status: "todo",
            priority: parsePriority(String(record.priority || "")),
            difficulty: parseDifficulty(String(record.difficulty || record.level || "")),
            importance_rank: Number.isFinite(rawRank) ? rawRank : existingCount + index + 1,
            exam_points: stripMarkdown(examPoints),
            order: existingCount + index,
            source_note_id: noteId,
            note: line || note || rawTitle,
            created_at: nowIso(),
            updated_at: nowIso()
          }];
        });
      }
    } catch {
      // Fall back to line parsing below.
    }
  }
  const rawLines = content
    .split(/\n+/)
    .map((line) => stripMarkdown(line).replace(/^[\s\-*•\d.、)]+/, "").trim())
    .filter((line) => line.length >= 2);
  const candidateLines = rawLines
    .filter((line) => /模块名称|知识点名称|模块名|知识点|考点|主题|预计|分钟|小时/.test(line))
    .slice(0, 36);
  const lines = candidateLines.length ? candidateLines : rawLines.slice(0, 24);
  const seen = new Set<string>();
  return lines.flatMap((line, index) => {
    const title = extractModuleTitle(line);
    if (!title || seen.has(title)) return [];
    seen.add(title);
    const minutesMatch = line.match(/(?:预计(?:完成|学习)?时间\s*[:：]?\s*)?(\d+)\s*(分钟|min)/i);
    const hourMatch = line.match(/(\d+(?:\.\d+)?)\s*(小时|h)/i);
    const estimatedMinutes = minutesMatch
      ? normalizeMinutes(Number(minutesMatch[1]))
      : hourMatch
        ? normalizeMinutes(Number(hourMatch[1]) * 60)
        : 45;
    const rank = extractNumber(line, [/重要(?:程度)?排名\s*[:：]?\s*(\d+)/, /排名\s*[:：]?\s*(\d+)/]);
    const examPoints = extractExamPoints(line);
    return [{
      id: createId("module"),
      project_id: projectId,
      title,
      date: dateKey(),
      estimated_minutes: estimatedMinutes,
      status: "todo",
      module_status: "todo",
      priority: parsePriority(line),
      difficulty: parseDifficulty(line),
      importance_rank: rank || existingCount + index + 1,
      exam_points: examPoints,
      order: existingCount + index,
      source_note_id: noteId,
      note: line,
      created_at: nowIso(),
      updated_at: nowIso()
    }];
  });
}

export default function App() {
  const [apiConfig, setApiConfig] = useState<ApiConfig>(storage.getApiConfig() || defaultApiConfig);
  const [showAdvancedApi, setShowAdvancedApi] = useState(false);
  const [projects, setProjects] = useState<StudyProject[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [notes, setNotes] = useState<AiNote[]>([]);
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [weakPoints, setWeakPoints] = useState<WeakPoint[]>([]);
  const [mockAttempts, setMockAttempts] = useState<MockAttempt[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [activeTab, setActiveTab] = useState<ProjectTab>("overview");
  const [projectDraft, setProjectDraft] = useState(emptyProject);
  const [showNewProject, setShowNewProject] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualText, setManualText] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [handwritingHint, setHandwritingHint] = useState("");
  const [extra, setExtra] = useState("");
  const [moduleDraft, setModuleDraft] = useState(emptyModule);
  const [mistakeDraft, setMistakeDraft] = useState(emptyMistake);
  const [weakPointDraft, setWeakPointDraft] = useState(emptyWeakPoint);
  const [mockDraft, setMockDraft] = useState(emptyMock);
  const [draggingModuleId, setDraggingModuleId] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [resultNote, setResultNote] = useState<AiNote | null>(null);
  const [status, setStatus] = useState("准备好了。");
  const [busyLabel, setBusyLabel] = useState("");

  async function refresh() {
    const [projectRows, materialRows, noteRows, taskRows, mistakeRows, weakPointRows, mockRows] = await Promise.all([
      storage.projects(),
      storage.materials(),
      storage.notes(),
      storage.tasks(),
      storage.mistakes(),
      storage.weakPoints(),
      storage.mockAttempts()
    ]);
    setProjects(projectRows.sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
    setMaterials(materialRows.sort((a, b) => b.created_at.localeCompare(a.created_at)));
    setNotes(noteRows.sort((a, b) => b.created_at.localeCompare(a.created_at)));
    setTasks(taskRows.sort((a, b) => taskOrder(a, 0) - taskOrder(b, 0)));
    setMistakes(mistakeRows.sort((a, b) => b.created_at.localeCompare(a.created_at)));
    setWeakPoints(weakPointRows.sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
    setMockAttempts(mockRows.sort((a, b) => b.created_at.localeCompare(a.created_at)));
    if (!activeProjectId && projectRows[0]) setActiveProjectId(projectRows[0].id);
  }

  useEffect(() => {
    refresh();
  }, []);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) || projects[0],
    [activeProjectId, projects]
  );
  const scopedMaterials = useMemo(
    () => materials.filter((item) => item.project_id === activeProject?.id),
    [materials, activeProject]
  );
  const scopedNotes = useMemo(
    () => notes.filter((item) => item.project_id === activeProject?.id),
    [notes, activeProject]
  );
  const scopedModules = useMemo(
    () => tasks.filter((item) => item.project_id === activeProject?.id).sort((a, b) => taskOrder(a, 0) - taskOrder(b, 0)),
    [tasks, activeProject]
  );
  const scopedMistakes = useMemo(
    () => mistakes.filter((item) => item.project_id === activeProject?.id),
    [mistakes, activeProject]
  );
  const scopedWeakPoints = useMemo(
    () => weakPoints.filter((item) => item.project_id === activeProject?.id),
    [weakPoints, activeProject]
  );
  const scopedMocks = useMemo(
    () => mockAttempts.filter((item) => item.project_id === activeProject?.id),
    [mockAttempts, activeProject]
  );
  const completedModules = scopedModules.filter((item) => moduleStatus(item) === "done").length;
  const progress = scopedModules.length ? Math.round((completedModules / scopedModules.length) * 100) : 0;
  const busy = Boolean(busyLabel);
  const currentFocusModule = scopedModules.find((item) => moduleStatus(item) !== "done");
  const selectedModule = selectedModuleId
    ? scopedModules.find((item) => item.id === selectedModuleId) || null
    : null;
  const latestPlanNote = scopedNotes.find((note) => note.mode === "plan");
  const latestTeachNote = scopedNotes.find((note) => note.mode === "teach");
  const latestPracticeNote = scopedNotes.find((note) => note.mode === "practice");
  const latestMockNote = scopedNotes.find((note) => note.mode === "mock");
  const resultEntries = [
    { label: "查看计划结果", note: latestPlanNote },
    { label: "查看讲解结果", note: latestTeachNote },
    { label: "查看模拟卷", note: latestPracticeNote },
    { label: "查看模考结果", note: latestMockNote }
  ].filter((item): item is { label: string; note: AiNote } => Boolean(item.note));
  const currentResultNote = resultNote || scopedNotes[0] || null;

  function projectProgress(projectId: string) {
    const projectModules = tasks.filter((task) => task.project_id === projectId);
    if (!projectModules.length) return 0;
    return Math.round((projectModules.filter((task) => moduleStatus(task) === "done").length / projectModules.length) * 100);
  }

  function requireApi() {
    if (!apiConfig.api_key.trim()) {
      setStatus("先填 API Key，再让 AI 干活。");
      return false;
    }
    if (!apiConfig.base_url.trim() || !apiConfig.model.trim()) {
      setStatus("高级设置里的 Base URL 和 Model 还没填完整。");
      setShowAdvancedApi(true);
      return false;
    }
    return true;
  }

  function requireProject() {
    if (!activeProject) {
      setStatus("先创建一个考试项目。");
      return false;
    }
    return true;
  }

  function updateUploadItem(id: string, patch: Partial<UploadQueueItem>) {
    setUploadQueue((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function updatePreset(providerName: string) {
    const preset = presets.find((item) => item.provider_name === providerName) || presets[0];
    setApiConfig({ ...apiConfig, ...preset });
    setShowAdvancedApi(preset.provider_name === "自定义");
  }

  async function saveApi(event?: FormEvent) {
    event?.preventDefault();
    storage.saveApiConfig(apiConfig);
    setStatus("API 配置已保存在当前浏览器。");
  }

  async function testApi() {
    if (!requireApi()) return;
    setBusyLabel("正在测试连接...");
    try {
      const result = await testApiConfig(apiConfig);
      storage.saveApiConfig(apiConfig);
      setStatus(`连接测试完成：${result}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "连接测试失败。");
    } finally {
      setBusyLabel("");
    }
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    if (!projectDraft.subject.trim()) return setStatus("科目要填一下，比如高数、法考、期末英语。");
    if (!projectDraft.exam_date) return setStatus("考试日期也要填，不然我没法算倒计时。");
    if (!projectDraft.daily_minutes || projectDraft.daily_minutes < 10) return setStatus("每天学习时间至少填 10 分钟。");
    const timestamp = nowIso();
    const project: StudyProject = {
      id: createId("project"),
      ...projectDraft,
      subject: projectDraft.subject.trim(),
      daily_minutes: normalizeMinutes(projectDraft.daily_minutes),
      target_score: projectDraft.target_score.trim(),
      weak_points: projectDraft.weak_points.trim(),
      created_at: timestamp,
      updated_at: timestamp
    };
    await storage.saveProject(project);
    setProjectDraft(emptyProject);
    setActiveProjectId(project.id);
    setActiveTab("overview");
    setShowNewProject(false);
    setStatus("考试项目已创建。");
    await refresh();
  }

  async function addManualMaterial(kind: MaterialKind = "text") {
    if (!requireProject()) return;
    if (!manualText.trim()) return setStatus("先粘贴一点资料内容。");
    await storage.saveMaterial({
      id: createId("material"),
      project_id: activeProject!.id,
      title: manualTitle.trim() || "手动资料",
      kind,
      content: manualText.trim(),
      created_at: nowIso()
    });
    setManualTitle("");
    setManualText("");
    setStatus("资料已入库。");
    await refresh();
  }

  async function handleFiles(files: FileList | null) {
    if (!requireProject()) return;
    if (!files?.length) return setStatus("先选择要上传的课件或教材。");
    const selected = Array.from(files);
    const queueItems: UploadQueueItem[] = selected.map((file) => ({
      id: createId("upload"),
      name: file.name,
      state: "reading",
      message: "正在读取文件"
    }));
    setUploadQueue((items) => [...queueItems, ...items].slice(0, 12));
    setBusyLabel(`正在导入 ${selected.length} 个文件...`);
    try {
      let successCount = 0;
      for (const [index, file] of selected.entries()) {
        const queueId = queueItems[index].id;
        try {
          const lower = file.name.toLowerCase();
          const isDocument = lower.endsWith(".doc") || lower.endsWith(".docx") || lower.endsWith(".odt") || lower.endsWith(".rtf");
          const kind: MaterialKind = lower.endsWith(".pdf")
            ? "pdf"
            : lower.endsWith(".md") || lower.endsWith(".markdown")
              ? "markdown"
              : isDocument
                ? "document"
                : "file";
          let content = "";
          const warnings: string[] = [];
          if (kind === "pdf") {
            updateUploadItem(queueId, { state: "reading", message: "正在快速读取 PDF 文字层" });
            const text = await readPdfText(file);
            content = `PDF 文字层\n${text || "没有提取到文字层。扫描版 PDF 可以后续补充手动重点。"}`;
            warnings.push("已快速导入 PDF 文字层；扫描图片、图表和公式识别会放到后续单独处理。");
          } else {
            content = kind === "document" ? documentPlaceholder(file) : await readTextFile(file);
          }
          await storage.saveMaterial({
            id: createId("material"),
            project_id: activeProject!.id,
            title: file.name,
            kind,
            content,
            file_name: file.name,
            warnings,
            created_at: nowIso()
          });
          successCount += 1;
          updateUploadItem(queueId, { state: "done", message: kind === "pdf" ? "已快速导入 PDF 文字层" : "已导入资料库" });
        } catch (error) {
          updateUploadItem(queueId, { state: "failed", message: error instanceof Error ? error.message : "导入失败" });
        }
      }
      setStatus(`已导入 ${successCount} 个文件。${successCount < selected.length ? "有文件失败，队列里可以看到原因。" : ""}`);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "文件读取失败。");
    } finally {
      setBusyLabel("");
    }
  }

  async function handleHandwriting(files: FileList | null) {
    if (!requireProject()) return;
    if (!files?.length) return setStatus("先选择手写图片或 PDF。");
    if (!requireApi()) return;
    setBusyLabel("正在识别手写笔记...");
    try {
      const selected = Array.from(files).slice(0, 6);
      const pdfFiles = selected.filter((file) => file.name.toLowerCase().endsWith(".pdf"));
      const imageFiles = selected.filter((file) => !file.name.toLowerCase().endsWith(".pdf"));
      const pdfText = (await Promise.all(pdfFiles.map(readPdfText))).join("\n\n");
      const imageDataUrls = await Promise.all(imageFiles.map(readAsDataUrl));
      const recognized = imageDataUrls.length ? await recognizeHandwriting(apiConfig, imageDataUrls, handwritingHint) : "";
      await storage.saveMaterial({
        id: createId("material"),
        project_id: activeProject!.id,
        title: handwritingHint.trim() || "手写笔记",
        kind: "handwriting",
        content: [recognized, pdfText].filter(Boolean).join("\n\n") || "这份手写资料暂时没有识别出文本，请手动补充重点。",
        image_data_urls: imageDataUrls,
        created_at: nowIso()
      });
      setStatus("手写笔记识别完成，已保存到资料库。");
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "手写识别失败。");
    } finally {
      setBusyLabel("");
    }
  }

  async function handleVideoImport() {
    if (!requireProject()) return;
    if (!videoUrl.trim()) return setStatus("先粘贴视频链接。");
    setBusyLabel("正在读取视频公开信息...");
    try {
      const result = await importVideo(videoUrl.trim());
      const content = [result.description, result.subtitles].filter(Boolean).join("\n\n");
      await storage.saveMaterial({
        id: createId("material"),
        project_id: activeProject!.id,
        title: result.title || "视频资料",
        kind: "video",
        content: content || "没有抓到字幕。请手动补充这条视频的课程重点或字幕。",
        source_url: result.source_url,
        warnings: result.warnings,
        created_at: nowIso()
      });
      setVideoUrl("");
      setStatus(result.warnings[0] || "视频资料已导入。");
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "视频导入失败。");
    } finally {
      setBusyLabel("");
    }
  }

  async function runMode(mode: "plan" | "teach" | "practice" | "mock-exam", title: string) {
    if (!requireProject() || !requireApi()) return;
    if (!scopedMaterials.length && mode === "plan") {
      setStatus("先导入资料，再生成知识点模块。现在不会按空资料乱编计划。");
      setActiveTab("materials");
      return;
    }
    setBusyLabel(`正在生成${title}...`);
    try {
      const content = await runAi(mode, {
        api_config: apiConfig,
        project: toProjectPayload(activeProject!),
        materials: scopedMaterials.map(({ title, kind, content }) => ({ title, kind, content })),
        extra
      });
      const note: AiNote = {
        id: createId("note"),
        project_id: activeProject!.id,
        mode: mode === "mock-exam" ? "mock" : mode,
        title,
        content: stripMarkdown(content),
        created_at: nowIso()
      };
      await storage.saveNote(note);
      setResultNote(note);
      setActiveTab("result");
      setStatus(`${title} 已生成，已经打开结果页。`);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "AI 请求失败。");
    } finally {
      setBusyLabel("");
    }
  }

  async function createModulesFromPlan(note: AiNote) {
    if (!activeProject) return;
    const parsed = parseModulesFromPlan(note.content, activeProject.id, note.id, scopedModules.length);
    if (!parsed.length) return setStatus("这份计划没拆出进程、线程这类明确知识点名，可以重新生成或手动新增模块。");
    const ok = window.confirm(`我拆出了 ${parsed.length} 个知识模块，要加入计划看板吗？`);
    if (!ok) return;
    await Promise.all(parsed.map((item, index) => storage.saveTask({
      ...item,
      importance_rank: item.importance_rank || index + 1,
      difficulty: item.difficulty || "medium",
      exam_points: item.exam_points || item.note || ""
    })));
    setStatus(`${parsed.length} 个知识模块已加入计划。`);
    setActiveTab("plan");
    await refresh();
  }

  async function deleteMaterial(item: StudyMaterial) {
    const ok = window.confirm(`删除「${item.title}」吗？删除后生成计划时就不会再使用这份资料。`);
    if (!ok) return;
    await storage.deleteMaterial(item.id);
    setStatus("资料已删除。");
    await refresh();
  }

  async function saveModule(event: FormEvent) {
    event.preventDefault();
    if (!requireProject()) return;
    if (!moduleDraft.title.trim()) return setStatus("知识模块名称要填一下。");
    const timestamp = nowIso();
    await storage.saveTask({
      id: createId("module"),
      project_id: activeProject!.id,
      title: moduleDraft.title.trim(),
      date: dateKey(),
      estimated_minutes: normalizeMinutes(moduleDraft.estimated_minutes),
      status: "todo",
      module_status: "todo",
      priority: moduleDraft.priority,
      difficulty: moduleDraft.difficulty,
      importance_rank: scopedModules.length + 1,
      exam_points: moduleDraft.note.trim(),
      order: scopedModules.length,
      note: moduleDraft.note.trim(),
      created_at: timestamp,
      updated_at: timestamp
    });
    setModuleDraft(emptyModule);
    setStatus("知识模块已加入计划。");
    await refresh();
  }

  async function moveModule(targetStatus: ModuleStatus, beforeId?: string) {
    const dragged = scopedModules.find((item) => item.id === draggingModuleId);
    setDraggingModuleId("");
    if (!dragged) return;
    const withoutDragged = scopedModules.filter((item) => item.id !== dragged.id);
    const updatedDragged: StudyTask = {
      ...dragged,
      status: targetStatus === "done" ? "done" : "todo",
      module_status: targetStatus,
      updated_at: nowIso()
    };
    const targetIndex = beforeId ? withoutDragged.findIndex((item) => item.id === beforeId) : -1;
    const nextModules = [...withoutDragged];
    if (targetIndex >= 0) {
      nextModules.splice(targetIndex, 0, updatedDragged);
    } else {
      nextModules.push(updatedDragged);
    }
    await Promise.all(nextModules.map((item, index) => storage.saveTask({ ...item, order: index, updated_at: item.id === dragged.id ? nowIso() : item.updated_at })));
    setStatus("模块顺序已调整。");
    await refresh();
  }

  async function completeModule(module: StudyTask) {
    await storage.saveTask({ ...module, status: "done", module_status: "done", completed_at: nowIso(), updated_at: nowIso() });
    setStatus("这个知识模块已完成。");
    await refresh();
  }

  function openModule(module: StudyTask) {
    setSelectedModuleId(module.id);
    setActiveTab("module");
  }

  async function generateModuleQuestions(module: StudyTask) {
    if (!requireProject() || !requireApi()) return;
    if (!scopedMaterials.length) return setStatus("先导入资料，再生成这个知识点的模拟题。");
    setBusyLabel(`正在生成「${displayModuleTitle(module.title, module.note)}」的模拟题...`);
    try {
      const content = await runModulePractice({
        api_config: apiConfig,
        project: toProjectPayload(activeProject!),
        materials: scopedMaterials.map(({ title, kind, content }) => ({ title, kind, content })),
        extra,
        module_title: displayModuleTitle(module.title, module.note),
        exam_points: module.exam_points || module.note || ""
      });
      const updated = {
        ...module,
        practice_questions: stripMarkdown(content),
        updated_at: nowIso()
      };
      await storage.saveTask(updated);
      setSelectedModuleId(module.id);
      setStatus("模块模拟题已生成。");
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "模块模拟题生成失败。");
    } finally {
      setBusyLabel("");
    }
  }

  async function saveMistake(event: FormEvent) {
    event.preventDefault();
    if (!requireProject()) return;
    if (!mistakeDraft.question.trim()) return setStatus("错题内容要填一下。");
    const timestamp = nowIso();
    await storage.saveMistake({
      id: createId("mistake"),
      project_id: activeProject!.id,
      question: mistakeDraft.question.trim(),
      reason: mistakeDraft.reason.trim() || "还没写错因，复盘时补。",
      fix: mistakeDraft.fix.trim() || "还没写正确思路，复盘时补。",
      status: "new",
      created_at: timestamp,
      updated_at: timestamp
    });
    setMistakeDraft(emptyMistake);
    setStatus("错题已保存。");
    await refresh();
  }

  async function saveWeakPoint(event: FormEvent) {
    event.preventDefault();
    if (!requireProject()) return;
    if (!weakPointDraft.title.trim()) return setStatus("薄弱项名称要填一下。");
    const timestamp = nowIso();
    await storage.saveWeakPoint({
      id: createId("weak"),
      project_id: activeProject!.id,
      title: weakPointDraft.title.trim(),
      evidence: weakPointDraft.evidence.trim() || "手动标记",
      severity: weakPointDraft.severity,
      created_at: timestamp,
      updated_at: timestamp
    });
    setWeakPointDraft(emptyWeakPoint);
    setStatus("薄弱项已记录。");
    await refresh();
  }

  async function saveMock(event: FormEvent) {
    event.preventDefault();
    if (!requireProject()) return;
    if (!mockDraft.title.trim() || !mockDraft.score.trim()) return setStatus("模考标题和分数都要填。");
    await storage.saveMockAttempt({
      id: createId("mock"),
      project_id: activeProject!.id,
      title: mockDraft.title.trim(),
      score: mockDraft.score.trim(),
      duration_minutes: normalizeMinutes(mockDraft.duration_minutes),
      feedback: mockDraft.feedback.trim() || "暂无反馈",
      created_at: nowIso()
    });
    setMockDraft(emptyMock);
    setStatus("模考记录已保存。");
    await refresh();
  }

  const apiPanel = (
    <form className="panel api-panel" onSubmit={saveApi}>
      <h2>连接 AI</h2>
      <label>
        平台
        <select value={apiConfig.provider_name} onChange={(event) => updatePreset(event.target.value)}>
          {presets.map((preset) => <option key={preset.provider_name}>{preset.provider_name}</option>)}
        </select>
      </label>
      <label>API Key<input type="password" value={apiConfig.api_key} onChange={(event) => setApiConfig({ ...apiConfig, api_key: event.target.value })} placeholder="粘贴自己的 API Key" /></label>
      <p className="hint">DeepSeek 的 Key 可以去开放平台创建。复制后粘到这里就好，KaoBuddy 只存在当前浏览器里，请求 AI 时临时转发，不写数据库。</p>
      <button type="button" className="text-button" onClick={() => setShowAdvancedApi((value) => !value)}>
        {showAdvancedApi ? "收起高级设置" : "高级设置"}
      </button>
      {showAdvancedApi && (
        <div className="advanced">
          <label>Base URL<input value={apiConfig.base_url} onChange={(event) => setApiConfig({ ...apiConfig, base_url: event.target.value })} /></label>
          <label>Model<input value={apiConfig.model} onChange={(event) => setApiConfig({ ...apiConfig, model: event.target.value })} /></label>
        </div>
      )}
      <div className="actions">
        <button type="submit">保存配置</button>
        <button type="button" className="secondary" onClick={testApi} disabled={busy}>测试连接</button>
      </div>
    </form>
  );

  const projectForm = (
    <form className="panel project-form" onSubmit={createProject}>
      <h2>{projects.length ? "新建项目" : "创建第一个项目"}</h2>
      <label>科目<input value={projectDraft.subject} onChange={(event) => setProjectDraft({ ...projectDraft, subject: event.target.value })} placeholder="比如 高数 / 法考 / 期末英语" /></label>
      <label>考试日期<input type="date" value={projectDraft.exam_date} onChange={(event) => setProjectDraft({ ...projectDraft, exam_date: event.target.value })} /></label>
      <label>每天大概能学多久（分钟）<input type="number" min="10" value={projectDraft.daily_minutes} onChange={(event) => setProjectDraft({ ...projectDraft, daily_minutes: Number(event.target.value) })} /></label>
      <label>目标分数<input value={projectDraft.target_score} onChange={(event) => setProjectDraft({ ...projectDraft, target_score: event.target.value })} placeholder="可不填" /></label>
      <label>薄弱项<textarea value={projectDraft.weak_points} onChange={(event) => setProjectDraft({ ...projectDraft, weak_points: event.target.value })} placeholder="可不填，后面可以让 AI 推断" /></label>
      <button type="submit">{projects.length ? "保存项目" : "开始建立项目"}</button>
    </form>
  );

  if (!projects.length) {
    return (
      <main className="home">
        <section className="home-hero app-section">
          <p className="eyebrow">KaoBuddy</p>
          <h1>考搭子</h1>
          <p>用你自己的 AI API，把课件、笔记、PDF、手写资料和视频字幕整理成考前复习计划，再按知识模块一点点推进。</p>
        </section>
        <div className={busy ? "status loading" : "status"} aria-live="polite">{busy ? busyLabel : status}</div>
        <section className="home-grid app-section">
          <div className="panel intro-panel">
            <h2>它怎么用</h2>
            <ol>
              <li>先连接自己的 AI。</li>
              <li>创建一个考试项目。</li>
              <li>把资料放进项目里。</li>
              <li>让 AI 生成知识模块计划。</li>
              <li>拖动模块顺序，完成一个勾一个。</li>
            </ol>
          </div>
          {apiPanel}
          {projectForm}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>考搭子</strong>
          <span>KaoBuddy</span>
        </div>
        <button className="secondary" onClick={() => setShowNewProject((value) => !value)}>{showNewProject ? "收起新建" : "新建项目"}</button>
        {showNewProject && <div className="sidebar-form">{projectForm}</div>}
        <div className="project-list">
          {projects.map((project) => (
            <button
              key={project.id}
              className={project.id === activeProject?.id ? "project-card active" : "project-card"}
              onClick={() => {
                setActiveProjectId(project.id);
                setActiveTab("overview");
                setResultNote(null);
                setSelectedModuleId("");
              }}
            >
              <span>{project.subject}</span>
              <small>倒计时 {daysLeft(project.exam_date)} 天 · {projectProgress(project.id)}%</small>
            </button>
          ))}
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-head app-section">
          <div>
            <p className="eyebrow">当前项目</p>
            <h1>{activeProject?.subject || "考搭子"}</h1>
            <p>{activeProject ? `考试日期 ${activeProject.exam_date} · 目标 ${activeProject.target_score || "未填写"}` : "从左侧选择一个项目。"}</p>
          </div>
          <div className="progress-card">
            <span>整体完成进度</span>
            <div className="progress-ring" style={{ "--progress": `${Math.min(progress, 100)}%` } as CSSProperties}>
              <strong>{progress}%</strong>
            </div>
            <small>{completedModules} / {scopedModules.length} 个模块已学习</small>
          </div>
        </header>

        <div className={busy ? "status loading" : "status"} aria-live="polite">{busy ? busyLabel : status}</div>

        <nav className="tabs">
          {visibleTabs.map(({ tab, label }) => (
            <button key={tab} className={activeTab === tab ? "tab active" : "tab"} onClick={() => setActiveTab(tab)}>{label}</button>
          ))}
        </nav>

        {activeTab === "overview" && (
          <section className="page-grid app-section">
            <div className="panel metric-panel">
              <span>考试倒计时</span>
              <strong>{activeProject ? daysLeft(activeProject.exam_date) : "-"} 天</strong>
              <small>每天不用完美，模块能滚动推进就行。</small>
            </div>
            <div className="panel metric-panel">
              <span>知识模块</span>
              <strong>{completedModules} / {scopedModules.length}</strong>
              <small>学习进度按已学习模块数量计算。</small>
            </div>
            <div className="panel metric-panel">
              <span>当前重点</span>
              <strong className="focus-text">{currentFocusModule ? displayModuleTitle(currentFocusModule.title, currentFocusModule.note) : "暂无"}</strong>
              <small>去计划页拖动顺序或标记完成。</small>
            </div>
            <div className="panel metric-panel">
              <span>最近模考</span>
              <strong>{scopedMocks[0]?.score || "暂无"}</strong>
              <small>{scopedMocks[0]?.title || "复盘页可以保存模考记录。"}</small>
            </div>
            <div className="panel wide">
              <h2>薄弱项摘要</h2>
              <div className="chips">
                {scopedWeakPoints.map((item) => <span key={item.id} className={`pill ${item.severity}`}>{item.title}</span>)}
                {!scopedWeakPoints.length && <p className="muted">还没有薄弱项，练习或模考后可以手动记录。</p>}
              </div>
            </div>
          </section>
        )}

        {activeTab === "materials" && (
          <section className="grid two app-section">
            <div className="panel">
              <h2>资料导入</h2>
              <label className="file primary-upload">批量上传课件 / 教材（PDF / DOC / DOCX）<input type="file" accept=".pdf,.doc,.docx,.odt,.rtf,.txt,.md,.markdown,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" multiple onChange={(event) => handleFiles(event.target.files)} /></label>
              <p className="hint">默认会快速读取 PDF 文字层，先把资料放进库里。扫描页、图表和公式这类慢识别，后面单独处理，避免上传时卡太久。</p>
              {!!uploadQueue.length && (
                <div className="upload-queue">
                  {uploadQueue.map((item) => (
                    <div key={item.id} className={`upload-row ${item.state}`}>
                      <strong>{item.name}</strong>
                      <span>{item.message}</span>
                    </div>
                  ))}
                </div>
              )}
              <label>标题<input value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} placeholder="课件、往年题、复习提纲..." /></label>
              <label>补充文本<textarea value={manualText} onChange={(event) => setManualText(event.target.value)} placeholder="如果课件里有重点、老师画的范围，可以补充粘贴在这里" /></label>
              <button onClick={() => addManualMaterial(manualText.includes("#") ? "markdown" : "text")} disabled={!activeProject}>保存补充文本</button>
              <label>手写笔记说明<input value={handwritingHint} onChange={(event) => setHandwritingHint(event.target.value)} placeholder="比如 第三章极限笔记" /></label>
              <label className="file">上传手写图片/PDF<input type="file" accept="image/*,.pdf" multiple onChange={(event) => handleHandwriting(event.target.files)} /></label>
              <label>B站等视频链接<input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="https://www.bilibili.com/video/..." /></label>
              <button onClick={handleVideoImport} disabled={!activeProject || busy}>导入视频字幕</button>
            </div>
            <div className="panel material-library">
              <h2>资料库</h2>
              <div className="list material-list">
                {scopedMaterials.map((item) => (
                  <article key={item.id} className="item material-row">
                    <div className="item-head">
                      <strong>{item.title}</strong>
                      <button className="mini danger" onClick={() => deleteMaterial(item)}>删除</button>
                    </div>
                  </article>
                ))}
                {!scopedMaterials.length && <p className="muted">还没有资料。</p>}
              </div>
            </div>
          </section>
        )}

        {activeTab === "plan" && (
          <section className="app-section">
            <div className="panel plan-actions">
              <h2>生成知识模块计划</h2>
              <label>补充要求<textarea value={extra} onChange={(event) => setExtra(event.target.value)} placeholder="比如 只剩三天，先救选择题相关模块。" /></label>
              <div className="actions wrap">
                <button onClick={() => runMode("plan", "知识模块计划")} disabled={busy}>生成计划</button>
                <button className="secondary" onClick={() => runMode("teach", "考点讲解")} disabled={busy}>生成讲解</button>
                <button className="secondary" onClick={() => runMode("practice", "模拟卷")} disabled={busy}>生成模拟卷</button>
                <button className="secondary" onClick={() => runMode("mock-exam", "短模考")} disabled={busy}>生成模考</button>
              </div>
              {!!resultEntries.length && (
                <div className="result-shortcuts">
                  {resultEntries.map((entry) => (
                    <button
                      key={entry.note.id}
                      className="mini"
                      onClick={() => {
                        setResultNote(entry.note);
                        setActiveTab("result");
                      }}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <form className="panel module-form" onSubmit={saveModule}>
              <h2>手动加模块</h2>
              <input value={moduleDraft.title} onChange={(event) => setModuleDraft({ ...moduleDraft, title: event.target.value })} placeholder="知识点名称" />
              <input aria-label="预计学习时间" type="number" min="10" value={moduleDraft.estimated_minutes} onChange={(event) => setModuleDraft({ ...moduleDraft, estimated_minutes: Number(event.target.value) })} />
              <select aria-label="难度" value={moduleDraft.difficulty} onChange={(event) => setModuleDraft({ ...moduleDraft, difficulty: event.target.value as ModuleDifficulty })}>
                <option value="low">难度低</option>
                <option value="medium">难度中</option>
                <option value="high">难度高</option>
              </select>
              <button type="submit">加入计划</button>
            </form>

            <div className="kanban">
              {moduleColumns.map((column) => {
                const columnModules = scopedModules.filter((item) => moduleStatus(item) === column.status);
                return (
                  <div
                    key={column.status}
                    className="kanban-column"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => moveModule(column.status)}
                  >
                    <div className="column-head">
                      <strong>{column.title}</strong>
                      <small>{column.hint}</small>
                    </div>
                    {columnModules.map((item) => (
                      <article
                        key={item.id}
                        className="module-card"
                        draggable
                        onDragStart={() => setDraggingModuleId(item.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.stopPropagation();
                          moveModule(column.status, item.id);
                        }}
                        onClick={() => openModule(item)}
                      >
                        <strong>{displayModuleTitle(item.title, item.note)}</strong>
                        <div className="module-meta">
                          <span>{item.estimated_minutes} 分钟</span>
                          <span>{difficultyLabel(item.difficulty)}</span>
                          <span>第 {item.importance_rank || item.order || 1} 位</span>
                        </div>
                        {moduleStatus(item) !== "done" && <button className="mini" onClick={(event) => {
                          event.stopPropagation();
                          completeModule(item);
                        }}>完成学习</button>}
                      </article>
                    ))}
                    {!columnModules.length && <span className="empty-slot">拖到这里</span>}
                  </div>
                );
              })}
            </div>

          </section>
        )}

        {activeTab === "module" && (
          <section className="app-section">
            {selectedModule ? (
              <div className="panel module-detail">
                <div className="module-detail-head">
                  <div>
                    <span className="kind-badge">知识点模块</span>
                    <h2>{displayModuleTitle(selectedModule.title, selectedModule.note)}</h2>
                    <div className="module-meta detail-meta">
                      <span>{selectedModule.estimated_minutes} 分钟</span>
                      <span>{difficultyLabel(selectedModule.difficulty)}</span>
                      <span>{priorityLabel(selectedModule.priority)}</span>
                      <span>重要排名第 {selectedModule.importance_rank || selectedModule.order || 1}</span>
                      <span>{moduleStatus(selectedModule) === "done" ? "已学习" : moduleStatus(selectedModule) === "doing" ? "学习中" : "待学习"}</span>
                    </div>
                  </div>
                  <button className="secondary" onClick={() => setActiveTab("plan")}>回到计划</button>
                </div>

                <div className="detail-block">
                  <h3>会考什么</h3>
                  {renderHumanText(selectedModule.exam_points || selectedModule.note || "这个模块还没有考察内容说明，可以重新生成计划或手动补充。")}
                </div>

                <div className="detail-block">
                  <h3>模块模拟题</h3>
                  {selectedModule.practice_questions ? renderHumanText(selectedModule.practice_questions) : <p className="muted">学完这个知识点后，可以生成几道只围绕它的小题。</p>}
                  <div className="actions wrap">
                    <button onClick={() => generateModuleQuestions(selectedModule)} disabled={busy}>生成模块模拟题</button>
                    {moduleStatus(selectedModule) !== "done" && <button className="secondary" onClick={() => completeModule(selectedModule)}>完成学习</button>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="panel">
                <p className="muted">先从计划页选择一个知识点模块。</p>
                <button onClick={() => setActiveTab("plan")}>回到计划</button>
              </div>
            )}
          </section>
        )}

        {activeTab === "result" && (
          <section className="app-section">
            <div className="panel plan-preview">
              <span className="kind-badge">AI 生成结果</span>
              <h2>{currentResultNote?.title || "AI 结果"}</h2>
              {renderHumanText(currentResultNote?.content || "")}
              <div className="actions wrap">
                {currentResultNote?.mode === "plan" && <button onClick={() => createModulesFromPlan(currentResultNote)}>确认，拆成模块卡片</button>}
                {currentResultNote?.mode === "practice" && <button onClick={() => {
                  setMistakeDraft({ question: currentResultNote.content.slice(0, 220), reason: "从模拟卷保存", fix: "按 AI 解析复盘" });
                  setActiveTab("review");
                  setStatus("已把模拟卷放到错题草稿，可以改完保存。");
                }}>放进错题草稿</button>}
                {currentResultNote?.mode === "mock" && <button onClick={() => {
                  setMockDraft({ title: currentResultNote.title, score: "", duration_minutes: 30, feedback: currentResultNote.content.slice(0, 420) });
                  setActiveTab("review");
                  setStatus("已把模考反馈放到记录草稿，补个分数就能保存。");
                }}>放进模考记录</button>}
                <button className="secondary" onClick={() => setActiveTab("plan")}>回到计划页调整</button>
                <button className="secondary" onClick={() => setActiveTab("materials")}>继续补资料</button>
              </div>
            </div>
          </section>
        )}

        {activeTab === "review" && (
          <section className="grid two app-section">
            <div className="panel">
              <h2>错题复盘</h2>
              <form className="stack" onSubmit={saveMistake}>
                <textarea value={mistakeDraft.question} onChange={(event) => setMistakeDraft({ ...mistakeDraft, question: event.target.value })} placeholder="错题或题目摘要" />
                <input value={mistakeDraft.reason} onChange={(event) => setMistakeDraft({ ...mistakeDraft, reason: event.target.value })} placeholder="错因" />
                <input value={mistakeDraft.fix} onChange={(event) => setMistakeDraft({ ...mistakeDraft, fix: event.target.value })} placeholder="正确思路" />
                <button type="submit">保存错题</button>
              </form>
              <div className="list compact">
                {scopedMistakes.map((item) => <article key={item.id} className="item"><strong>{item.question}</strong><small>{item.reason}</small><p>{item.fix}</p></article>)}
                {!scopedMistakes.length && <p className="muted">还没有错题。</p>}
              </div>
            </div>
            <div className="panel">
              <h2>薄弱项和模考</h2>
              <form className="stack" onSubmit={saveWeakPoint}>
                <input value={weakPointDraft.title} onChange={(event) => setWeakPointDraft({ ...weakPointDraft, title: event.target.value })} placeholder="薄弱项，比如 极限运算" />
                <input value={weakPointDraft.evidence} onChange={(event) => setWeakPointDraft({ ...weakPointDraft, evidence: event.target.value })} placeholder="证据，比如 模考第 3 题" />
                <select value={weakPointDraft.severity} onChange={(event) => setWeakPointDraft({ ...weakPointDraft, severity: event.target.value as WeakPoint["severity"] })}>
                  <option value="medium">中等</option>
                  <option value="high">严重</option>
                  <option value="low">轻微</option>
                </select>
                <button type="submit">记录薄弱项</button>
              </form>
              <form className="stack" onSubmit={saveMock}>
                <input value={mockDraft.title} onChange={(event) => setMockDraft({ ...mockDraft, title: event.target.value })} placeholder="模考标题" />
                <input value={mockDraft.score} onChange={(event) => setMockDraft({ ...mockDraft, score: event.target.value })} placeholder="分数，比如 78/100" />
                <input type="number" min="10" value={mockDraft.duration_minutes} onChange={(event) => setMockDraft({ ...mockDraft, duration_minutes: Number(event.target.value) })} />
                <textarea value={mockDraft.feedback} onChange={(event) => setMockDraft({ ...mockDraft, feedback: event.target.value })} placeholder="模考反馈" />
                <button type="submit">保存模考记录</button>
              </form>
              <div className="list compact">
                {scopedMocks.map((item) => <article key={item.id} className="item"><strong>{item.title}</strong><small>{item.score} · {item.duration_minutes} 分钟</small><p>{item.feedback}</p></article>)}
              </div>
            </div>
          </section>
        )}

      </section>
    </main>
  );
}
