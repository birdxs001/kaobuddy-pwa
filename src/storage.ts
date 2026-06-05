import type { AiNote, ApiConfig, AppExport, InviteState, Mistake, MockAttempt, StudyMaterial, StudyProject, StudyTask, WeakPoint } from "./types";
import { defaultInviteState, normalizeInviteState } from "./inviteState";

const DB_NAME = "kaobuddy-db";
const DB_VERSION = 2;
const API_CONFIG_KEY = "kaobuddy-api-config";
const INVITE_STATE_KEY = "kaobuddy-invite-state";

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

async function deleteWhereProject(storeName: StoreName, projectId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      (request.result as { id: string; project_id?: string }[])
        .filter((item) => item.project_id === projectId)
        .forEach((item) => store.delete(item.id));
    };
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
}

function normalizeTask(task: StudyTask, index: number): StudyTask {
  const moduleStatus = task.module_status || (task.status === "done" ? "done" : "todo");
  return {
    ...task,
    status: moduleStatus === "done" ? "done" : "todo",
    module_status: moduleStatus,
    priority: task.priority || "medium",
    difficulty: task.difficulty || "medium",
    importance_rank: typeof task.importance_rank === "number" ? task.importance_rank : index + 1,
    exam_points: task.exam_points || task.note || "",
    practice_questions: task.practice_questions || "",
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
  deleteProject: async (id: string) => {
    await Promise.all([
      deleteWhereProject("materials", id),
      deleteWhereProject("notes", id),
      deleteWhereProject("tasks", id),
      deleteWhereProject("mistakes", id),
      deleteWhereProject("weak_points", id),
      deleteWhereProject("mock_attempts", id),
    ]);
    await deleteById("projects", id);
  },
  saveMaterial: (material: StudyMaterial) => put("materials", material),
  deleteMaterial: (id: string) => deleteById("materials", id),
  saveNote: (note: AiNote) => put("notes", note),
  deleteNote: (id: string) => deleteById("notes", id),
  saveTask: (task: StudyTask) => put("tasks", task),
  deleteTask: (id: string) => deleteById("tasks", id),
  saveMistake: (mistake: Mistake) => put("mistakes", mistake),
  deleteMistake: (id: string) => deleteById("mistakes", id),
  saveWeakPoint: (weakPoint: WeakPoint) => put("weak_points", weakPoint),
  deleteWeakPoint: (id: string) => deleteById("weak_points", id),
  saveMockAttempt: (attempt: MockAttempt) => put("mock_attempts", attempt),
  deleteMockAttempt: (id: string) => deleteById("mock_attempts", id),
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
  saveInviteState: (state: InviteState) => localStorage.setItem(INVITE_STATE_KEY, JSON.stringify(state)),
  getInviteState: (): InviteState => {
    const raw = localStorage.getItem(INVITE_STATE_KEY);
    if (!raw) return defaultInviteState;
    try {
      return normalizeInviteState(JSON.parse(raw) as Partial<InviteState>);
    } catch {
      return defaultInviteState;
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
