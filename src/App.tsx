import { FormEvent, useEffect, useMemo, useState } from "react";
import { importVideo, recognizeHandwriting, runAi, testApiConfig } from "./api";
import { downloadText, readAsDataUrl, readPdfText, readTextFile } from "./fileReaders";
import { createId, storage } from "./storage";
import type { AiNote, ApiConfig, MaterialKind, ProviderPreset, StudyMaterial, StudyProject } from "./types";

const presets: ProviderPreset[] = [
  { provider_name: "DeepSeek", base_url: "https://api.deepseek.com", model: "deepseek-chat" },
  { provider_name: "Kimi 国内", base_url: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  { provider_name: "Kimi 国际", base_url: "https://api.moonshot.ai/v1", model: "moonshot-v1-8k" },
  { provider_name: "OpenAI", base_url: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
  { provider_name: "自定义", base_url: "https://", model: "" }
];

const emptyProject = {
  subject: "",
  exam_date: "",
  daily_minutes: 120,
  target_score: "",
  weak_points: ""
};

function nowIso() {
  return new Date().toISOString();
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

function daysLeft(date: string) {
  if (!date) return "-";
  const today = new Date();
  const target = new Date(`${date}T23:59:59`);
  return Math.max(0, Math.ceil((target.getTime() - today.getTime()) / 86400000));
}

export default function App() {
  const [apiConfig, setApiConfig] = useState<ApiConfig>(
    storage.getApiConfig() || { ...presets[0], api_key: "", temperature: 0.4, max_tokens: 1800 }
  );
  const [projects, setProjects] = useState<StudyProject[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [notes, setNotes] = useState<AiNote[]>([]);
  const [projectDraft, setProjectDraft] = useState(emptyProject);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [manualText, setManualText] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [handwritingHint, setHandwritingHint] = useState("");
  const [extra, setExtra] = useState("");
  const [status, setStatus] = useState("准备好了。");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [projectRows, materialRows, noteRows] = await Promise.all([storage.projects(), storage.materials(), storage.notes()]);
    setProjects(projectRows.sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
    setMaterials(materialRows.sort((a, b) => b.created_at.localeCompare(a.created_at)));
    setNotes(noteRows.sort((a, b) => b.created_at.localeCompare(a.created_at)));
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

  async function createProject(event: FormEvent) {
    event.preventDefault();
    const timestamp = nowIso();
    const project: StudyProject = {
      id: createId("project"),
      ...projectDraft,
      subject: projectDraft.subject.trim(),
      target_score: projectDraft.target_score.trim(),
      weak_points: projectDraft.weak_points.trim(),
      created_at: timestamp,
      updated_at: timestamp
    };
    if (!project.subject || !project.exam_date) {
      setStatus("科目和考试日期要填一下。");
      return;
    }
    await storage.saveProject(project);
    setProjectDraft(emptyProject);
    setActiveProjectId(project.id);
    setStatus("考试项目已创建。");
    await refresh();
  }

  async function saveApi(event: FormEvent) {
    event.preventDefault();
    storage.saveApiConfig(apiConfig);
    setStatus("API 配置已保存在当前浏览器。");
  }

  async function testApi() {
    setBusy(true);
    try {
      const result = await testApiConfig(apiConfig);
      storage.saveApiConfig(apiConfig);
      setStatus(`连接测试完成：${result}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "连接测试失败。");
    } finally {
      setBusy(false);
    }
  }

  async function addManualMaterial(kind: MaterialKind = "text") {
    if (!activeProject || !manualText.trim()) return;
    await storage.saveMaterial({
      id: createId("material"),
      project_id: activeProject.id,
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

  async function handleFile(file: File) {
    if (!activeProject) return;
    setBusy(true);
    try {
      const lower = file.name.toLowerCase();
      const kind: MaterialKind = lower.endsWith(".pdf") ? "pdf" : lower.endsWith(".md") ? "markdown" : "file";
      const content = kind === "pdf" ? await readPdfText(file) : await readTextFile(file);
      await storage.saveMaterial({
        id: createId("material"),
        project_id: activeProject.id,
        title: file.name,
        kind,
        content,
        file_name: file.name,
        created_at: nowIso()
      });
      setStatus(`${file.name} 已导入。`);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "文件读取失败。");
    } finally {
      setBusy(false);
    }
  }

  async function handleHandwriting(files: FileList | null) {
    if (!activeProject || !files?.length) return;
    setBusy(true);
    try {
      const selected = Array.from(files).slice(0, 6);
      const pdfFiles = selected.filter((file) => file.name.toLowerCase().endsWith(".pdf"));
      const imageFiles = selected.filter((file) => !file.name.toLowerCase().endsWith(".pdf"));
      const pdfText = (await Promise.all(pdfFiles.map(readPdfText))).join("\n\n");
      const imageDataUrls = await Promise.all(imageFiles.map(readAsDataUrl));
      const recognized = imageDataUrls.length
        ? await recognizeHandwriting(apiConfig, imageDataUrls, handwritingHint)
        : "";
      const content = [recognized, pdfText].filter(Boolean).join("\n\n");
      await storage.saveMaterial({
        id: createId("material"),
        project_id: activeProject.id,
        title: handwritingHint.trim() || "手写笔记",
        kind: "handwriting",
        content: content || "这份手写资料暂时没有识别出文本，请手动补充重点。",
        image_data_urls: imageDataUrls,
        created_at: nowIso()
      });
      setStatus("手写笔记识别完成，已保存到资料库。");
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "手写识别失败。");
    } finally {
      setBusy(false);
    }
  }

  async function handleVideoImport() {
    if (!activeProject || !videoUrl.trim()) return;
    setBusy(true);
    try {
      const result = await importVideo(videoUrl.trim());
      const content = [result.description, result.subtitles].filter(Boolean).join("\n\n");
      await storage.saveMaterial({
        id: createId("material"),
        project_id: activeProject.id,
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
      setBusy(false);
    }
  }

  async function runMode(mode: "plan" | "teach" | "practice" | "mock-exam", title: string) {
    if (!activeProject) {
      setStatus("先创建一个考试项目。");
      return;
    }
    setBusy(true);
    try {
      const content = await runAi(mode, {
        api_config: apiConfig,
        project: toProjectPayload(activeProject),
        materials: scopedMaterials.map(({ title, kind, content }) => ({ title, kind, content })),
        extra
      });
      await storage.saveNote({
        id: createId("note"),
        project_id: activeProject.id,
        mode: mode === "mock-exam" ? "mock" : mode,
        title,
        content,
        created_at: nowIso()
      });
      setStatus(`${title} 已生成。`);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "AI 请求失败。");
    } finally {
      setBusy(false);
    }
  }

  async function exportData() {
    const data = await storage.exportAll();
    downloadText(`kaobuddy-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
  }

  async function importData(file: File) {
    const data = JSON.parse(await file.text());
    await storage.importAll(data);
    setStatus("导入完成。");
    await refresh();
  }

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">KaoBuddy</p>
          <h1>考搭子</h1>
          <p>手机可用的免费备考工作台。资料、手写笔记、视频字幕都能放进来，再用你自己的 API 做计划、讲解、刷题和模考。</p>
        </div>
        <div className="hero-panel">
          <span>当前项目</span>
          <strong>{activeProject?.subject || "还没创建"}</strong>
          <small>{activeProject ? `距离考试 ${daysLeft(activeProject.exam_date)} 天` : "先建一个考试项目"}</small>
        </div>
      </header>

      <div className="status" aria-live="polite">{busy ? "处理中..." : status}</div>

      <section className="grid two">
        <form className="panel" onSubmit={saveApi}>
          <h2>API 设置</h2>
          <label>
            平台预设
            <select
              value={apiConfig.provider_name}
              onChange={(event) => {
                const preset = presets.find((item) => item.provider_name === event.target.value)!;
                setApiConfig({ ...apiConfig, ...preset });
              }}
            >
              {presets.map((preset) => <option key={preset.provider_name}>{preset.provider_name}</option>)}
            </select>
          </label>
          <label>Base URL<input value={apiConfig.base_url} onChange={(e) => setApiConfig({ ...apiConfig, base_url: e.target.value })} /></label>
          <label>Model<input value={apiConfig.model} onChange={(e) => setApiConfig({ ...apiConfig, model: e.target.value })} /></label>
          <label>API Key<input type="password" value={apiConfig.api_key} onChange={(e) => setApiConfig({ ...apiConfig, api_key: e.target.value })} /></label>
          <div className="actions">
            <button type="submit">保存配置</button>
            <button type="button" className="secondary" onClick={testApi} disabled={busy}>测试连接</button>
          </div>
        </form>

        <form className="panel" onSubmit={createProject}>
          <h2>考试项目</h2>
          <label>科目<input value={projectDraft.subject} onChange={(e) => setProjectDraft({ ...projectDraft, subject: e.target.value })} placeholder="比如 高数 / 法考 / 期末英语" /></label>
          <label>考试日期<input type="date" value={projectDraft.exam_date} onChange={(e) => setProjectDraft({ ...projectDraft, exam_date: e.target.value })} /></label>
          <label>每天能学多久<input type="number" min="10" value={projectDraft.daily_minutes} onChange={(e) => setProjectDraft({ ...projectDraft, daily_minutes: Number(e.target.value) })} /></label>
          <label>目标分数<input value={projectDraft.target_score} onChange={(e) => setProjectDraft({ ...projectDraft, target_score: e.target.value })} placeholder="可不填" /></label>
          <label>薄弱项<textarea value={projectDraft.weak_points} onChange={(e) => setProjectDraft({ ...projectDraft, weak_points: e.target.value })} placeholder="可不填，后面可以让 AI 推断" /></label>
          <button type="submit">创建项目</button>
        </form>
      </section>

      {projects.length > 0 && (
        <section className="panel">
          <h2>项目切换</h2>
          <div className="chips">
            {projects.map((project) => (
              <button key={project.id} className={project.id === activeProject?.id ? "chip active" : "chip"} onClick={() => setActiveProjectId(project.id)}>
                {project.subject}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="grid two">
        <div className="panel">
          <h2>资料导入</h2>
          <label>标题<input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} placeholder="课件、往年题、复习提纲..." /></label>
          <label>文本 / Markdown<textarea value={manualText} onChange={(e) => setManualText(e.target.value)} placeholder="直接粘贴资料内容" /></label>
          <button onClick={() => addManualMaterial(manualText.includes("#") ? "markdown" : "text")} disabled={!activeProject}>保存文本资料</button>
          <label className="file">上传 TXT / MD / PDF<input type="file" accept=".txt,.md,.markdown,.pdf,text/plain,application/pdf" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} /></label>
        </div>

        <div className="panel">
          <h2>手写笔记和视频</h2>
          <label>手写笔记说明<input value={handwritingHint} onChange={(e) => setHandwritingHint(e.target.value)} placeholder="比如 第三章极限笔记" /></label>
          <label className="file">上传手写图片/PDF<input type="file" accept="image/*,.pdf" multiple onChange={(e) => handleHandwriting(e.target.files)} /></label>
          <label>B站等视频链接<input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://www.bilibili.com/video/..." /></label>
          <button onClick={handleVideoImport} disabled={!activeProject || busy}>导入视频字幕</button>
        </div>
      </section>

      <section className="panel">
        <h2>AI 工作流</h2>
        <label>这次想强调什么<textarea value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="比如 只剩 3 天，优先救选择题；或者按零基础讲。" /></label>
        <div className="actions wrap">
          <button onClick={() => runMode("plan", "冲刺计划")} disabled={busy}>生成计划</button>
          <button onClick={() => runMode("teach", "考点讲解")} disabled={busy}>开始讲解</button>
          <button onClick={() => runMode("practice", "练习反馈")} disabled={busy}>生成/批改练习</button>
          <button onClick={() => runMode("mock-exam", "短模考")} disabled={busy}>生成模考</button>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <h2>资料库</h2>
          <div className="list">
            {scopedMaterials.map((item) => (
              <article key={item.id} className="item">
                <strong>{item.title}</strong>
                <span>{item.kind}</span>
                <p>{item.content.slice(0, 180) || "暂无文本"}</p>
                {item.warnings?.map((warning) => <small key={warning}>{warning}</small>)}
              </article>
            ))}
            {!scopedMaterials.length && <p className="muted">还没有资料。</p>}
          </div>
        </div>
        <div className="panel">
          <h2>AI 结果</h2>
          <div className="list">
            {scopedNotes.map((note) => (
              <article key={note.id} className="item note">
                <strong>{note.title}</strong>
                <p>{note.content}</p>
              </article>
            ))}
            {!scopedNotes.length && <p className="muted">生成的计划、讲解、练习会出现在这里。</p>}
          </div>
        </div>
      </section>

      <section className="panel utility">
        <h2>备份</h2>
        <button onClick={exportData}>导出 JSON</button>
        <label className="file">导入 JSON<input type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} /></label>
      </section>
    </main>
  );
}
