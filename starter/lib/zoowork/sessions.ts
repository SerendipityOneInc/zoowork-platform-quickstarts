import { readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { StarterError } from "./errors";
import { LOCAL_DIR, writePrivateJson } from "./state";

/**
 * The starter's conversation index: which Platform Sessions this app created,
 * with their titles. The Platform cannot list Sessions by end user, so an
 * application must keep this mapping itself. Every session route checks it
 * before touching a Session: knowing a Session ID is not enough.
 *
 * This file store is for one local user. A public deployment replaces it with
 * a database table keyed by the signed-in user (see the README checklist).
 */
export interface SessionEntry {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
}

interface SessionFile {
  version: 1;
  instance: string;
  agentId: string;
  sessions: SessionEntry[];
}

export interface SessionStore {
  list(opts?: { includeArchived?: boolean }): Promise<SessionEntry[]>;
  get(id: string): Promise<SessionEntry | undefined>;
  add(entry: SessionEntry): Promise<void>;
  update(id: string, patch: Partial<Omit<SessionEntry, "id">>): Promise<SessionEntry | undefined>;
  remove(id: string): Promise<void>;
  /** Move the index aside after cleanup, so a new setup starts empty. */
  retire(suffix: string): Promise<void>;
}

export const sessionsPath = (cwd = process.cwd()) => join(cwd, LOCAL_DIR, "sessions.json");

export const TITLE_MAX = 80;

export function titleFrom(text: unknown): string {
  const title = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
  if (!title) return "New chat";
  return title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1)}…` : title;
}

export function fileSessionStore(path: string, scope: { instance: string; agentId: string }): SessionStore {
  // One write at a time; each write replaces the file atomically.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
  };

  async function read(): Promise<SessionFile> {
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: 1, instance: scope.instance, agentId: scope.agentId, sessions: [] };
      }
      throw new StarterError("invalid_local_state", 500);
    }
    let file: SessionFile;
    try {
      file = JSON.parse(raw) as SessionFile;
    } catch {
      throw new StarterError("invalid_local_state", 500);
    }
    if (file.version !== 1 || !Array.isArray(file.sessions)) throw new StarterError("invalid_local_state", 500);
    if (file.instance !== scope.instance || file.agentId !== scope.agentId) throw new StarterError("state_scope_mismatch", 500);
    return file;
  }

  const write = (file: SessionFile) => writePrivateJson(path, file);

  return {
    async list(opts = {}) {
      const file = await read();
      return file.sessions
        .filter((s) => opts.includeArchived || !s.archived)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async get(id) {
      return (await read()).sessions.find((s) => s.id === id);
    },
    add(entry) {
      return serial(async () => {
        const file = await read();
        if (!file.sessions.some((s) => s.id === entry.id)) file.sessions.push(entry);
        await write(file);
      });
    },
    update(id, patch) {
      return serial(async () => {
        const file = await read();
        const entry = file.sessions.find((s) => s.id === id);
        if (!entry) return undefined;
        Object.assign(entry, patch);
        await write(file);
        return entry;
      });
    },
    remove(id) {
      return serial(async () => {
        const file = await read();
        file.sessions = file.sessions.filter((s) => s.id !== id);
        await write(file);
      });
    },
    retire(suffix) {
      return serial(async () => {
        try {
          await rename(path, path.replace(/\.json$/, `.retired-${suffix}.json`));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      });
    },
  };
}

/** In-memory store for the offline preview and tests. */
export function memorySessionStore(): SessionStore {
  const sessions = new Map<string, SessionEntry>();
  return {
    async list(opts = {}) {
      return [...sessions.values()]
        .filter((s) => opts.includeArchived || !s.archived)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((s) => ({ ...s }));
    },
    async get(id) {
      const s = sessions.get(id);
      return s && { ...s };
    },
    async add(entry) {
      if (!sessions.has(entry.id)) sessions.set(entry.id, { ...entry });
    },
    async update(id, patch) {
      const s = sessions.get(id);
      if (!s) return undefined;
      Object.assign(s, patch);
      return { ...s };
    },
    async remove(id) {
      sessions.delete(id);
    },
    async retire() {
      sessions.clear();
    },
  };
}
