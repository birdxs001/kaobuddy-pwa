import type { AiNote, ApiConfig, AppExport, Mistake, MockAttempt, StudyMaterial, StudyProject, StudyTask, WeakPoint } from "./types";

const DB_NAME = "kaobuddy-db";
const DB_VERSION = 2;
const API_CONFIG_KEY = "kaobuddy-api-config";

type StoreName = "projects" | "materials" | "notes" | "tasks" | "mistakes" | "weak_points" | "mock_attempts";

function ensureStore(db: IDBDatabase, name: StoreName, indexes: string[] = []) {
  if (db.objectStoreNames.contains(name)) return;
  const store = db.createObjectStore(name, { keyPath: "id" });
  indexes.forEach((index) => store.createIndex(index, index));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      ensureStore(db, "projects");
      ensureStore(db, "materials", ["project_id"]);
      ensureStore(db, "notes", ["project_id"]);
      ensureStore(db, "tasks", ["project_id", "date"]);
      ensureStore(db, "mistakes", ["project_id"]);
      ensureStore(db, "weak_points", ["project_id"]);
      ensureStore(db, "mock_attempts", ["project_id"]);
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function getAll<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as T[]);
  });
}

async function put<T>(storeName: StoreName, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readwrite").objectStore(storeName).put(value);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function clear(storeName: StoreName): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readwrite").objectStore(storeName).clear();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function deleteById(storeName: StoreName, id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readwrite").objectStore(storeName).delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

function normalizeTask(task: StudyTask, index: number): StudyTask {
  const moduleStatus = task.module_status || (task.status === "done" ? "done" : "todo");
  return {
    ...task,
    status: moduleStatus === "done" ? "done" : "todo",
    module_status: moduleStatus,
    priority: task.priority || "medium",
    order: typeof task.order === "number" ? task.order : index,
  };
}

export const storage = {
  projects: () => getAll<StudyProject>("projects"),
  materials: () => getAll<StudyMaterial>("materials"),
  notes: () => getAll<AiNote>("notes"),
  tasks: () => getAll<StudyTask>("tasks"),
  mistakes: () => getAll<Mistake>("mistakes"),
  weakPoints: () => getAll<WeakPoint>("weak_points"),
  mockAttempts: () => getAll<MockAttempt>("mock_attempts"),
  saveProject: (project: StudyProject) => put("projects", project),
  saveMaterial: (material: StudyMaterial) => put("materials", material),
  deleteMaterial: (id: string) => deleteById("materials", id),
  saveNote: (note: AiNote) => put("notes", note),
  saveTask: (task: StudyTask) => put("tasks", task),
  saveMistake: (mistake: Mistake) => put("mistakes", mistake),
  saveWeakPoint: (weakPoint: WeakPoint) => put("weak_points", weakPoint),
  saveMockAttempt: (attempt: MockAttempt) => put("mock_attempts", attempt),
  saveApiConfig: (config: ApiConfig) => localStorage.setItem(API_CONFIG_KEY, JSON.stringify(config)),
  getApiConfig: (): ApiConfig | null => {
    const raw = localStorage.getItem(API_CONFIG_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ApiConfig;
    } catch {
      return null;
    }
  },
  exportAll: async (): Promise<AppExport> => ({
    version: 2,
    exported_at: new Date().toISOString(),
    projects: await getAll<StudyProject>("projects"),
    materials: await getAll<StudyMaterial>("materials"),
    notes: await getAll<AiNote>("notes"),
    tasks: await getAll<StudyTask>("tasks"),
    mistakes: await getAll<Mistake>("mistakes"),
    weak_points: await getAll<WeakPoint>("weak_points"),
    mock_attempts: await getAll<MockAttempt>("mock_attempts")
  }),
  importAll: async (data: AppExport) => {
    await clear("projects");
    await clear("materials");
    await clear("notes");
    await clear("tasks");
    await clear("mistakes");
    await clear("weak_points");
    await clear("mock_attempts");
    await Promise.all(data.projects.map((item) => put("projects", item)));
    await Promise.all(data.materials.map((item) => put("materials", item)));
    await Promise.all(data.notes.map((item) => put("notes", item)));
    await Promise.all((data.tasks || []).map((item, index) => put("tasks", normalizeTask(item, index))));
    await Promise.all((data.mistakes || []).map((item) => put("mistakes", item)));
    await Promise.all((data.weak_points || []).map((item) => put("weak_points", item)));
    await Promise.all((data.mock_attempts || []).map((item) => put("mock_attempts", item)));
  }
};

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}
