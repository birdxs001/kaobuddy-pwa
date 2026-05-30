export type MaterialKind = "text" | "file" | "handwriting" | "video" | "pdf" | "markdown";

export type ProviderPreset = {
  provider_name: string;
  base_url: string;
  model: string;
};

export type ApiConfig = ProviderPreset & {
  api_key: string;
  temperature: number;
  max_tokens: number;
};

export type StudyProject = {
  id: string;
  subject: string;
  exam_date: string;
  daily_minutes: number;
  target_score?: string;
  weak_points?: string;
  created_at: string;
  updated_at: string;
};

export type StudyMaterial = {
  id: string;
  project_id: string;
  title: string;
  kind: MaterialKind;
  content: string;
  source_url?: string;
  file_name?: string;
  image_data_urls?: string[];
  warnings?: string[];
  created_at: string;
};

export type AiNote = {
  id: string;
  project_id: string;
  mode: "plan" | "teach" | "practice" | "mock";
  title: string;
  content: string;
  created_at: string;
};

export type AppExport = {
  version: 1;
  exported_at: string;
  projects: StudyProject[];
  materials: StudyMaterial[];
  notes: AiNote[];
};

