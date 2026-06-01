export type MaterialKind = "text" | "file" | "handwriting" | "video" | "pdf" | "markdown" | "document";

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

export type StudyTask = {
  id: string;
  project_id: string;
  title: string;
  date: string;
  estimated_minutes: number;
  status: "todo" | "done";
  module_status?: "todo" | "doing" | "done";
  priority?: "low" | "medium" | "high";
  difficulty?: "low" | "medium" | "high";
  importance_rank?: number;
  exam_points?: string;
  practice_questions?: string;
  completed_at?: string;
  order?: number;
  source_note_id?: string;
  note?: string;
  created_at: string;
  updated_at: string;
};

export type Mistake = {
  id: string;
  project_id: string;
  question: string;
  reason: string;
  fix: string;
  status: "new" | "reviewed";
  source_note_id?: string;
  created_at: string;
  updated_at: string;
};

export type WeakPoint = {
  id: string;
  project_id: string;
  title: string;
  evidence: string;
  severity: "low" | "medium" | "high";
  last_reviewed_at?: string;
  created_at: string;
  updated_at: string;
};

export type MockAttempt = {
  id: string;
  project_id: string;
  title: string;
  score: string;
  duration_minutes: number;
  feedback: string;
  source_note_id?: string;
  created_at: string;
};

export type AppExport = {
  version: 1 | 2;
  exported_at: string;
  projects: StudyProject[];
  materials: StudyMaterial[];
  notes: AiNote[];
  tasks?: StudyTask[];
  mistakes?: Mistake[];
  weak_points?: WeakPoint[];
  mock_attempts?: MockAttempt[];
};
