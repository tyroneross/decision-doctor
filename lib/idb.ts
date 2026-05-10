// PRD §T-02 / U-07 — IndexedDB-backed intake form persistence (client-only).
// Survives page reload + offline; submission queue replayed on reconnect.

"use client";

const DB_NAME = "decision-doctor";
const DB_VERSION = 1;
const STORE_DRAFTS = "intake-drafts";
const STORE_QUEUE = "submission-queue";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("indexedDB unavailable"));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
        db.createObjectStore(STORE_DRAFTS, { keyPath: "templateId" });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface IntakeDraft {
  templateId: string;
  fields: Record<string, unknown>;
  updatedAt: number;
}

export async function saveDraft(draft: IntakeDraft): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_DRAFTS, "readwrite");
      tx.objectStore(STORE_DRAFTS).put(draft);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fall back to localStorage if IDB blocked (private mode etc.)
    try {
      window.localStorage.setItem(`dd:draft:${draft.templateId}`, JSON.stringify(draft));
    } catch {
      /* nothing more we can do */
    }
  }
}

export async function loadDraft(templateId: string): Promise<IntakeDraft | null> {
  try {
    const db = await openDb();
    return await new Promise<IntakeDraft | null>((resolve, reject) => {
      const tx = db.transaction(STORE_DRAFTS, "readonly");
      const req = tx.objectStore(STORE_DRAFTS).get(templateId);
      req.onsuccess = () => resolve((req.result as IntakeDraft | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const raw = window.localStorage.getItem(`dd:draft:${templateId}`);
      return raw ? (JSON.parse(raw) as IntakeDraft) : null;
    } catch {
      return null;
    }
  }
}

export async function clearDraft(templateId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_DRAFTS, "readwrite");
      tx.objectStore(STORE_DRAFTS).delete(templateId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    try {
      window.localStorage.removeItem(`dd:draft:${templateId}`);
    } catch {
      /* ignore */
    }
  }
}

export interface QueuedSubmission {
  id?: number;
  payload: unknown;
  attempts: number;
  enqueuedAt: number;
}

export async function enqueueSubmission(payload: unknown): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, "readwrite");
      tx.objectStore(STORE_QUEUE).add({
        payload,
        attempts: 0,
        enqueuedAt: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore — caller should warn the user */
  }
}

export async function drainQueue(): Promise<QueuedSubmission[]> {
  try {
    const db = await openDb();
    return await new Promise<QueuedSubmission[]>((resolve, reject) => {
      const tx = db.transaction(STORE_QUEUE, "readonly");
      const req = tx.objectStore(STORE_QUEUE).getAll();
      req.onsuccess = () => resolve(req.result as QueuedSubmission[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function removeFromQueue(id: number): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_QUEUE, "readwrite");
      tx.objectStore(STORE_QUEUE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* ignore */
  }
}
