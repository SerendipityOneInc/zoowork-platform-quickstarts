import { readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { AppError, isCode } from "../zoowork/errors";
import { LOCAL_DIR, writePrivateJson } from "../zoowork/state";
import type { CorpusDocument } from "./corpus";
import type { IndexStats, KnowledgeIndex, Retriever } from "./retriever";

/** What this app created on the knowledge service. It holds IDs and hashes, never credentials. */
export interface KnowledgeState {
  version: 1;
  /** Recorded before the create request, so a lost response is resolved by the same name. */
  instanceId: string;
  /** The create was confirmed. */
  createdAt?: string;
  /** Document key to content hash, for what has been uploaded. */
  uploaded: Record<string, string>;
  /** The search answered the probe for this corpus. The app needs this before it starts. */
  readyAt?: string;
  /** Cleanup sent the delete. A later 404 then means the instance is gone. */
  deleteRequestedAt?: string;
}

export const knowledgeStatePath = (cwd = process.cwd()) => join(cwd, LOCAL_DIR, "knowledge.json");

export async function loadKnowledgeState(path: string): Promise<KnowledgeState | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new AppError("invalid_local_state", 500);
  }
  try {
    const state = JSON.parse(raw) as KnowledgeState;
    if (state.version === 1 && typeof state.instanceId === "string" && state.instanceId && state.uploaded) return state;
  } catch {
    // Reported below.
  }
  throw new AppError("invalid_local_state", 500);
}

export const saveKnowledgeState = (path: string, state: KnowledgeState) => writePrivateJson(path, state);

export type PrepareOptions = {
  log?: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
  pollMs?: number;
  indexTimeoutMs?: number;
  probeTimeoutMs?: number;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitUntilIndexed(index: KnowledgeIndex, total: number, options: PrepareOptions): Promise<void> {
  const { log = () => {}, sleep = wait, pollMs = 3_000, indexTimeoutMs = 600_000 } = options;
  let last = "";
  for (let waited = 0; waited <= indexTimeoutMs; waited += pollMs) {
    // Uploads are queued a moment after the request returns.
    await sleep(pollMs);
    const stats: IndexStats = await index.stats();
    if (stats.error > 0) throw new AppError("knowledge_indexing_failed");
    const line = `Indexing: ${stats.completed} of ${total} documents done`;
    if (line !== last) log(line);
    last = line;
    if (stats.queued === 0 && stats.running === 0 && stats.completed >= total) return;
  }
  throw new AppError("knowledge_indexing_timeout");
}

async function waitUntilSearchable(
  retriever: Retriever,
  probe: { query: string; key: string },
  options: PrepareOptions,
): Promise<void> {
  const { sleep = wait, pollMs = 3_000, probeTimeoutMs = 180_000 } = options;
  for (let waited = 0; waited <= probeTimeoutMs; waited += pollMs) {
    const passages = await retriever.search(probe.query);
    if (passages.some((p) => p.key === probe.key)) return;
    await sleep(pollMs);
  }
  throw new AppError("knowledge_not_searchable");
}

/**
 * Bring the knowledge service in line with corpus/. Progress is saved after
 * every step, so running setup again continues where the last run stopped, and
 * documents that did not change are not sent again. A run with nothing to do
 * makes no upload and no search.
 *
 * Caller holds the state lock.
 */
export async function prepareKnowledge(
  knowledge: KnowledgeIndex & Retriever,
  path: string,
  state: KnowledgeState,
  corpus: CorpusDocument[],
  probe: { query: string; key: string },
  options: PrepareOptions = {},
): Promise<{ state: KnowledgeState; changed: number }> {
  const { log = () => {} } = options;
  if (state.deleteRequestedAt) throw new AppError("cleanup_incomplete_run_cleanup");
  await saveKnowledgeState(path, state);
  await knowledge.ensure();
  state.createdAt ??= new Date().toISOString();
  await saveKnowledgeState(path, state);

  const changed = corpus.filter((doc) => state.uploaded[doc.key] !== doc.hash);
  const removed = Object.keys(state.uploaded).filter((key) => !corpus.some((doc) => doc.key === key));
  if (!changed.length && !removed.length && state.readyAt) return { state, changed: 0 };

  delete state.readyAt;
  await saveKnowledgeState(path, state);
  for (const doc of changed) {
    log(`Uploading ${doc.key}`);
    await knowledge.upload(doc.key, doc.text);
    state.uploaded[doc.key] = doc.hash;
    await saveKnowledgeState(path, state);
  }
  for (const key of removed) {
    log(`Removing ${key}`);
    await knowledge.removeDocument(key);
    delete state.uploaded[key];
    await saveKnowledgeState(path, state);
  }

  await waitUntilIndexed(knowledge, corpus.length, options);
  log("Indexed. Waiting for the search to answer.");
  await waitUntilSearchable(knowledge, probe, options);
  state.readyAt = new Date().toISOString();
  await saveKnowledgeState(path, state);
  return { state, changed: changed.length + removed.length };
}

/**
 * Delete the recorded index, then move the record aside. A 404 means "already
 * deleted" only if the create never happened or this app sent the delete,
 * because other credentials also get 404.
 */
export async function removeKnowledge(knowledge: Pick<KnowledgeIndex, "destroy">, path: string, state: KnowledgeState): Promise<void> {
  const sentBefore = !!state.deleteRequestedAt;
  state.deleteRequestedAt ??= new Date().toISOString();
  await saveKnowledgeState(path, state);
  try {
    await knowledge.destroy();
  } catch (error) {
    const gone = isCode(error, "cloudflare_http_404") && (sentBefore || !state.createdAt);
    if (!gone) {
      if (!sentBefore) {
        delete state.deleteRequestedAt;
        await saveKnowledgeState(path, state);
      }
      throw error;
    }
  }
  await rename(path, path.replace(/\.json$/, `.retired-${state.instanceId}.json`));
}
