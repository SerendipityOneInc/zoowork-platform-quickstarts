import { readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { AppError } from "../zoowork/errors";
import { LOCAL_DIR, writePrivateJson } from "../zoowork/state";
import type { Passage } from "./retriever";

/** One search the Agent asked for, and what the app handed back. */
export type EvidenceCall = {
  callId: string;
  sessionId: string;
  runId?: string;
  query: string;
  status: "ok" | "failed";
  /** Safe failure code when status is `failed`. */
  code?: string;
  passages: Passage[];
  requestedAt: string;
  /** The result reached the Platform. Until then the worker sends the saved result again. */
  delivered?: boolean;
};

/**
 * The passages each run actually received. Saved before the result goes to the
 * Agent, so a reply can be checked against them, on replay as well as live.
 * This file store is for one local user, like the Session index.
 */
export interface EvidenceStore {
  get(callId: string): Promise<EvidenceCall | undefined>;
  forRun(sessionId: string, runId: string): Promise<EvidenceCall[]>;
  save(call: EvidenceCall): Promise<void>;
  /** Forget a deleted conversation's queries and passages. */
  removeSession(sessionId: string): Promise<void>;
}

type EvidenceFile = { version: 1; calls: EvidenceCall[] };

export const evidencePath = (cwd = process.cwd()) => join(cwd, LOCAL_DIR, "evidence.json");

export function fileEvidenceStore(path: string): EvidenceStore {
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
  };

  async function load(): Promise<EvidenceFile> {
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, calls: [] };
      throw new AppError("invalid_local_state", 500);
    }
    try {
      const file = JSON.parse(raw) as EvidenceFile;
      if (file.version === 1 && Array.isArray(file.calls)) return file;
    } catch {
      // Reported below.
    }
    throw new AppError("invalid_local_state", 500);
  }

  // Every replayed event reads this, and only this process writes it.
  let cached: EvidenceFile | undefined;
  const read = async () => (cached ??= await load());
  const write = async (file: EvidenceFile) => {
    cached = undefined;
    await writePrivateJson(path, file);
    cached = file;
  };

  return {
    async get(callId) {
      return (await read()).calls.find((c) => c.callId === callId);
    },
    async forRun(sessionId, runId) {
      return (await read()).calls.filter((c) => c.sessionId === sessionId && c.runId === runId);
    },
    save(call) {
      return serial(async () => {
        const file = await read();
        const index = file.calls.findIndex((c) => c.callId === call.callId);
        const calls = index === -1 ? [...file.calls, call] : file.calls.with(index, call);
        await write({ ...file, calls });
      });
    },
    removeSession(sessionId) {
      return serial(async () => {
        const file = await read();
        const calls = file.calls.filter((c) => c.sessionId !== sessionId);
        if (calls.length !== file.calls.length) await write({ ...file, calls });
      });
    },
  };
}

/** Move the evidence aside after cleanup. */
export async function retireEvidence(path: string, suffix: string): Promise<void> {
  try {
    await rename(path, path.replace(/\.json$/, `.retired-${suffix}.json`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
