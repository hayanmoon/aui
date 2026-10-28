import type { ExportedMessageRepositoryItem } from "@assistant-ui/react";

const DB_NAME = "assistantagents";
const DB_VERSION = 1;
const THREADS = "threads";
const MESSAGES = "messages";

export type ThreadRecord = {
  id: string;
  username: string;
  title: string;
  createdAt: number;
};

type MessageRecord = {
  id: string;
  headId: string | null;
  messages: ExportedMessageRepositoryItem[];
};

const tails = new Map<string, Promise<unknown>>();
const drafts = new Map<string, { username: string; title: string }>();

export function rememberDraft(id: string, username: string): void {
  drafts.set(id, { username, title: "New chat" });
}

export function setDraftTitle(id: string, title: string): void {
  const draft = drafts.get(id);
  if (draft) draft.title = title;
}

function enqueue<T>(id: string, task: () => Promise<T>): Promise<T> {
  const previous = tails.get(id) ?? Promise.resolve();
  const result = previous.then(task, task);
  tails.set(
    id,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

let opening: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(THREADS)) {
        const threads = db.createObjectStore(THREADS, { keyPath: "id" });
        threads.createIndex("byUsername", "username", { unique: false });
      }
      if (!db.objectStoreNames.contains(MESSAGES)) {
        db.createObjectStore(MESSAGES, { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => {
        opening = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      opening = null;
      reject(req.error ?? new Error("Could not open IndexedDB"));
    };
  });
  return opening;
}

export async function listStoredThreads(username: string): Promise<ThreadRecord[]> {
  const db = await openDb();
  const tx = db.transaction(THREADS, "readonly");
  const rows = await request(tx.objectStore(THREADS).index("byUsername").getAll(username));
  await transactionDone(tx);
  return (rows as ThreadRecord[]).sort((a, b) => b.createdAt - a.createdAt);
}

export async function listSavedChats(username: string): Promise<ThreadRecord[]> {
  const rows = await listStoredThreads(username);
  const saved: ThreadRecord[] = [];
  for (const row of rows) {
    const { messages } = await loadStoredMessages(row.id);
    if (messages.length === 0) {
      await deleteStoredThread(row.id);
      continue;
    }
    saved.push(row);
  }
  return saved;
}

export function updateStoredTitle(id: string, title: string): Promise<void> {
  return enqueue(id, async () => {
    const db = await openDb();
    const tx = db.transaction(THREADS, "readwrite");
    const store = tx.objectStore(THREADS);
    const existing = (await request(store.get(id))) as ThreadRecord | undefined;
    if (existing) store.put({ ...existing, title });
    await transactionDone(tx);
  });
}

export function deleteStoredThread(id: string): Promise<void> {
  return enqueue(id, async () => {
    const db = await openDb();
    const tx = db.transaction([THREADS, MESSAGES], "readwrite");
    tx.objectStore(THREADS).delete(id);
    tx.objectStore(MESSAGES).delete(id);
    await transactionDone(tx);
  });
}

export async function loadStoredMessages(id: string): Promise<{
  headId: string | null;
  messages: ExportedMessageRepositoryItem[];
}> {
  const db = await openDb();
  const tx = db.transaction(MESSAGES, "readonly");
  const row = (await request(tx.objectStore(MESSAGES).get(id))) as MessageRecord | undefined;
  await transactionDone(tx);
  if (!row) return { headId: null, messages: [] };
  return { headId: row.headId, messages: row.messages };
}

export function upsertStoredMessage(id: string, item: ExportedMessageRepositoryItem): Promise<void> {
  const cloned = structuredClone(item);
  return enqueue(id, async () => {
    const db = await openDb();
    const tx = db.transaction([THREADS, MESSAGES], "readwrite");
    const store = tx.objectStore(MESSAGES);
    const existing = (await request(store.get(id))) as MessageRecord | undefined;
    if (!existing) {
      const draft = drafts.get(id);
      if (!draft) {
        await transactionDone(tx);
        return;
      }
      const thread: ThreadRecord = {
        id,
        username: draft.username,
        title: draft.title,
        createdAt: Date.now(),
      };
      tx.objectStore(THREADS).put(thread);
      store.put({ id, headId: cloned.message.id, messages: [cloned] } satisfies MessageRecord);
      await transactionDone(tx);
      return;
    }
    const index = existing.messages.findIndex((entry) => entry.message.id === cloned.message.id);
    if (index === -1) {
      existing.messages.push(cloned);
      existing.headId = cloned.message.id;
    } else {
      existing.messages[index] = cloned;
    }
    store.put(existing);
    await transactionDone(tx);
  });
}
