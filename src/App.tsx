import { FormEvent, useEffect, useMemo, useState } from "react";
import { importVideo, recognizeHandwriting, runAi, testApiConfig } from "./api";
import { documentPlaceholder, downloadText, readAsDataUrl, readPdfForAi, readPdfText, readTextFile } from "./fileReaders";
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

type ProjectTab = "overview" | "materials" | "plan" | "planResult" | "review";
type ModuleStatus = "todo" | "doing" | "done";
type ModulePriority = "low" | "medium" | "high";
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
  { status: "todo", title: "待学", hint: "还没开始的知识点" },
  { status: "doing", title: "学习中", hint: "这两天正在啃的内容" },
  { status: "done", title: "已完成", hint: "已经过一遍的模块" }
];

const visibleTabs: { tab: ProjectTab; label: string }[] = [
  { tab: "overview", label: "总览" },
  { tab: "materials", label: "资料" },
  { tab: "plan", label: "计划" },
  { tab: "review", label: "复盘" }
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
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ""))
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
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
  return title.length > 28 ? `${title.slice(0, 28)}...` : title;
}

function renderHumanText(text: string) {
  const blocks = stripMarkdown(text).split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
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
  if (/高|重要|核心|优先/.test(line)) return "high";
  if (/低|选学|有空/.test(line)) return "low";
  return "medium";
}

function parseModulesFromPlan(content: string, projectId: string, noteId: string, existingCount: number): StudyTask[] {
  const rawLines = content
    .split(/\n+/)
    .map((line) => line.replace(/^[\s\-*•\d.、)]+/, "").trim())
    .filter((line) => line.length >= 6);
  const candidateLines = rawLines.filter((line) => /模块|知识点|优先级|预计|分钟|小时|练习/.test(line)).slice(0, 24);
  const lines = candidateLines.length ? candidateLines : rawLines.slice(0, 18);
  return lines.map((line, index) => {
    const minutesMatch = line.match(/(\d+)\s*(分钟|min)/i);
    const hourMatch = line.match(/(\d+(?:\.\d+)?)\s*(小时|h)/i);
    const estimatedMinutes = minutesMatch
      ? normalizeMinutes(Number(minutesMatch[1]))
      : hourMatch
        ? normalizeMinutes(Number(hourMatch[1]) * 60)
        : 45;
    const title = compactTitle(line, `知识模块 ${index + 1}`);
    return {
      id: createId("module"),
      project_id: projectId,
      title,
      date: dateKey(),
      estimated_minutes: estimatedMinutes,
      status: "todo",
      module_status: "todo",
      priority: parsePriority(line),
      order: existingCount + index,
      source_note_id: noteId,
      note: line,
      created_at: nowIso(),
      updated_at: nowIso()
    };
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
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [planPreview, setPlanPreview] = useState<AiNote | null>(null);
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

  async function recognizePdfPages(fileName: string, pageImages: string[]) {
    if (!pageImages.length) return "";
    if (!apiConfig.api_key.trim() || !apiConfig.base_url.trim() || !apiConfig.model.trim()) {
      return "页面视觉识别没有运行。先填完整 AI 配置后，PDF 里的截图、表格、流程图和扫描内容才能交给 AI 一起识别。";
    }
    const chunks: string[] = [];
    for (let start = 0; start < pageImages.length; start += 4) {
      const chunk = pageImages.slice(start, start + 4);
      const end = Math.min(start + chunk.length, pageImages.length);
      chunks.push(await recognizeHandwriting(apiConfig, chunk, `${fileName} 第 ${start + 1}-${end} 页，请识别课件页面里的文字、表格、图示、公式和截图重点。`));
    }
    return chunks.join("\n\n");
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
            updateUploadItem(queueId, { state: "reading", message: "正在读取文字层和页面" });
            const pdf = await readPdfForAi(file);
            updateUploadItem(queueId, { state: "vision", message: "正在识别页面图表和扫描内容" });
            const visualText = await recognizePdfPages(file.name, pdf.pageImages);
            content = [
              `PDF 文字层\n${pdf.text || "没有提取到文字层。"}`,
              visualText && `页面视觉识别\n${visualText}`
            ].filter(Boolean).join("\n\n");
            if (!apiConfig.api_key.trim() || !apiConfig.base_url.trim() || !apiConfig.model.trim()) warnings.push("未进行页面视觉识别。填写完整 AI 配置后重新上传，可以识别截图、图表、扫描页等内容。");
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
          updateUploadItem(queueId, { state: "done", message: "已导入资料库" });
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
      setStatus("资料为空，计划会更粗略；我先按考试信息帮你排。");
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
      if (mode === "plan") {
        setPlanPreview(note);
        setActiveTab("planResult");
        setStatus("计划已生成。先看一眼，确认后再拆成知识模块卡片。");
      } else {
        setStatus(`${title} 已生成。`);
      }
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
    if (!parsed.length) return setStatus("这份计划没拆出明确知识模块，可以手动新增模块。");
    const ok = window.confirm(`我拆出了 ${parsed.length} 个知识模块，要加入计划看板吗？`);
    if (!ok) return;
    await Promise.all(parsed.map(storage.saveTask));
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
    await storage.saveTask({ ...module, status: "done", module_status: "done", updated_at: nowIso() });
    setStatus("这个知识模块已完成。");
    await refresh();
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

  async function exportData() {
    const data = await storage.exportAll();
    downloadText(`kaobuddy-v2-${dateKey()}.json`, JSON.stringify(data, null, 2));
  }

  async function importData(file: File) {
    const data = JSON.parse(await file.text());
    await storage.importAll(data);
    setStatus(`导入完成。${data.version === 1 ? "这是 v1 备份，二版模块数据先按空白开始。" : ""}`);
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
                setPlanPreview(null);
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
            <strong>{progress}%</strong>
            <div className="progress"><span style={{ width: `${Math.min(progress, 100)}%` }} /></div>
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
              <small>完成进度按模块数量计算。</small>
            </div>
            <div className="panel metric-panel">
              <span>当前重点</span>
              <strong>{scopedModules.find((item) => moduleStatus(item) !== "done")?.title || "暂无"}</strong>
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
              <p className="hint">PDF 会先读文字层，再把每页画面交给 AI 识别图表、截图、扫描页和公式。没有 API Key 时也能先导入文字层，之后可以补 Key 重新上传。</p>
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
            <div className="panel">
              <h2>资料库</h2>
              <div className="list">
                {scopedMaterials.map((item) => (
                  <article key={item.id} className="item">
                    <div className="item-head">
                      <strong>{item.title}</strong>
                      <button className="mini danger" onClick={() => deleteMaterial(item)}>删除</button>
                    </div>
                    <span className={`kind-badge ${item.kind}`}>{materialKindLabel(item)}</span>
                    <p>{previewText(item.content) || "暂无文本"}</p>
                    {item.warnings?.map((warning) => <small key={warning}>{warning}</small>)}
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
                <button onClick={() => runMode("plan", "知识模块计划")} disabled={busy}>调用 AI 生成计划</button>
                <button className="secondary" onClick={() => runMode("teach", "考点讲解")} disabled={busy}>生成讲解</button>
                <button className="secondary" onClick={() => runMode("practice", "练习反馈")} disabled={busy}>生成/批改练习</button>
                <button className="secondary" onClick={() => runMode("mock-exam", "短模考")} disabled={busy}>生成模考</button>
              </div>
            </div>

            <form className="panel module-form" onSubmit={saveModule}>
              <h2>手动加模块</h2>
              <input value={moduleDraft.title} onChange={(event) => setModuleDraft({ ...moduleDraft, title: event.target.value })} placeholder="知识点名称" />
              <input aria-label="预计学习时间" type="number" min="10" value={moduleDraft.estimated_minutes} onChange={(event) => setModuleDraft({ ...moduleDraft, estimated_minutes: Number(event.target.value) })} />
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
                      >
                        <strong>{compactTitle(item.title, "知识模块")}</strong>
                        <div className="module-meta">
                          <span>{item.estimated_minutes} 分钟</span>
                        </div>
                        {moduleStatus(item) !== "done" && <button className="mini" onClick={() => completeModule(item)}>完成</button>}
                      </article>
                    ))}
                    {!columnModules.length && <span className="empty-slot">拖到这里</span>}
                  </div>
                );
              })}
            </div>

            <div className="panel">
              <h2>AI 结果</h2>
              <div className="list">
                {scopedNotes.map((note) => (
                  <article key={note.id} className="item note">
                    <strong>{note.title}</strong>
                    {renderHumanText(note.content)}
                    <div className="actions wrap">
                      {note.mode === "plan" && <button className="secondary" onClick={() => createModulesFromPlan(note)}>拆成知识模块</button>}
                      {note.mode === "practice" && <button className="secondary" onClick={() => {
                        setMistakeDraft({ question: note.content.slice(0, 220), reason: "从练习反馈保存", fix: "按 AI 解析复盘" });
                        setActiveTab("review");
                        setStatus("已把练习反馈放到错题草稿，可以改完保存。");
                      }}>放进错题草稿</button>}
                      {note.mode === "mock" && <button className="secondary" onClick={() => {
                        setMockDraft({ title: note.title, score: "", duration_minutes: 30, feedback: note.content.slice(0, 420) });
                        setActiveTab("review");
                        setStatus("已把模考反馈放到记录草稿，补个分数就能保存。");
                      }}>放进模考记录</button>}
                    </div>
                  </article>
                ))}
                {!scopedNotes.length && <p className="muted">AI 生成的计划、讲解、练习会出现在这里。</p>}
              </div>
            </div>
          </section>
        )}

        {activeTab === "planResult" && (
          <section className="app-section">
            <div className="panel plan-preview">
              <span className="kind-badge">AI 生成结果</span>
              <h2>{planPreview?.title || "知识模块计划"}</h2>
              {renderHumanText(planPreview?.content || scopedNotes.find((note) => note.mode === "plan")?.content || "")}
              <div className="actions wrap">
                <button onClick={() => planPreview && createModulesFromPlan(planPreview)} disabled={!planPreview}>确认，拆成模块卡片</button>
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

        <section className="panel utility app-section">
          <h2>备份</h2>
          <button onClick={exportData}>导出 JSON</button>
          <label className="file">导入 JSON<input type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && importData(event.target.files[0])} /></label>
        </section>
      </section>
    </main>
  );
}
