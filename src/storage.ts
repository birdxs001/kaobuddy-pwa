import type { AiNote, ApiConfig, AppExport, StudyMaterial, StudyProject } from "./types";

const DB_NAME = "kaobuddy-db";
const DB_VERSION = 1;
const API_CONFIG_KEY = "kaobuddy-api-config";

type StoreName = "projects" | "materials" | "notes";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("materials")) {
        const store = db.createObjectStore("materials", { keyPath: "id" });
        store.createIndex("project_id", "project_id");
      }
      if (!db.objectStoreNames.contains("notes")) {
        const store = db.createObjectStore("notes", { keyPath: "id" });
        store.createIndex("project_id", "project_id");
      }
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

export const storage = {
  projects: () => getAll<StudyProject>("projects"),
  materials: () => getAll<StudyMaterial>("materials"),
  notes: () => getAll<AiNote>("notes"),
  saveProject: (project: StudyProject) => put("projects", project),
  saveMaterial: (material: StudyMaterial) => put("materials", material),
  saveNote: (note: AiNote) => put("notes", note),
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
    version: 1,
    exported_at: new Date().toISOString(),
    projects: await getAll<StudyProject>("projects"),
    materials: await getAll<StudyMaterial>("materials"),
    notes: await getAll<AiNote>("notes")
  }),
  importAll: async (data: AppExport) => {
    await clear("projects");
    await clear("materials");
    await clear("notes");
    await Promise.all(data.projects.map((item) => put("projects", item)));
    await Promise.all(data.materials.map((item) => put("materials", item)));
    await Promise.all(data.notes.map((item) => put("notes", item)));
  }
};

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}
