import type { ApiConfig, StudyMaterial, StudyProject } from "./types";

const API_BASE = "";

type AiPayload = {
  api_config: ApiConfig;
  project: Omit<StudyProject, "id" | "created_at" | "updated_at">;
  materials: Pick<StudyMaterial, "title" | "kind" | "content">[];
  extra?: string;
};

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || "请求失败，请稍后再试。");
  }
  return data as T;
}

export async function testApiConfig(api_config: ApiConfig): Promise<string> {
  const response = await fetch(`${API_BASE}/api/ai/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_config,
      messages: [{ role: "user", content: "请只回复：连接成功" }]
    })
  });
  const data = await parseResponse<{ content: string }>(response);
  return data.content;
}

export async function runAi(mode: "plan" | "teach" | "practice" | "mock-exam", payload: AiPayload): Promise<string> {
  const endpoint = mode === "mock-exam" ? "/api/ai/mock-exam" : `/api/ai/${mode}`;
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await parseResponse<{ content: string }>(response);
  return data.content;
}

export async function importVideo(url: string) {
  const response = await fetch(`${API_BASE}/api/video/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });
  return parseResponse<{
    title: string;
    description: string;
    subtitles: string;
    source_url: string;
    warnings: string[];
  }>(response);
}

export async function recognizeHandwriting(api_config: ApiConfig, image_data_urls: string[], note_hint?: string): Promise<string> {
  const response = await fetch(`${API_BASE}/api/ocr/handwriting`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_config, image_data_urls, note_hint })
  });
  const data = await parseResponse<{ content: string }>(response);
  return data.content;
}

