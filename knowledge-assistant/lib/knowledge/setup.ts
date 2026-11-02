import { readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { AppError, errorCode, isCode } from "../zoowork/errors";
import { sleep as defaultSleep } from "../zoowork/retry";
import { LOCAL_DIR, writePrivateJson } from "../zoowork/state";
import type { CorpusDocument } from "./corpus";
import type { KnowledgeIndex, Retriever } from "./retriever";

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

/**
 * Wait until every document in the corpus is searchable. A failed document stops
 * the wait and is forgotten, so the next run uploads it again; the code shows
 * which one failed and why, because an empty file fails the same way each time.
 */
async function waitUntilIndexed(
  index: KnowledgeIndex,
  path: string,
  state: KnowledgeState,
  corpus: CorpusDocument[],
  options: PrepareOptions,
): Promise<void> {
  const { log = () => {}, sleep = defaultSleep, pollMs = 3_000, indexTimeoutMs = 600_000 } = options;
  let last = "";
  for (let waited = 0; waited <= indexTimeoutMs; waited += pollMs) {
    // Uploads are queued a moment after the request returns.
    await sleep(pollMs);
    const documents = new Map((await index.documents()).map((doc) => [doc.key, doc]));
    const failed = corpus.flatMap((doc) => (documents.get(doc.key)?.state === "failed" ? [documents.get(doc.key)!] : []));
    if (failed.length) {
      for (const doc of failed) delete state.uploaded[doc.key];
      await saveKnowledgeState(path, state);
      throw new AppError(`knowledge_indexing_failed: ${failed.map((doc) => `${doc.key} (${doc.reason ?? "unknown"})`).join(", ")}`);
    }
    const ready = corpus.filter((doc) => documents.get(doc.key)?.state === "ready").length;
    const line = `Indexing: ${ready} of ${corpus.length} documents done`;
    if (line !== last) log(line);
    last = line;
    if (ready === corpus.length) return;
  }
  throw new AppError("knowledge_indexing_timeout");
}

async function waitUntilSearchable(
  retriever: Retriever,
  probe: { query: string; key: string },
  options: PrepareOptions,
): Promise<void> {
  const { sleep = defaultSleep, pollMs = 3_000, probeTimeoutMs = 180_000 } = options;
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
  if (!corpus.some((doc) => doc.key === probe.key)) throw new AppError("knowledge_probe_not_in_corpus");
  await saveKnowledgeState(path, state);
  if (!(await knowledge.exists())) {
    // Creating one here would leave an empty index that looks ready: the record
    // says everything was uploaded. Other credentials also see "not there".
    if (state.createdAt) throw new AppError("knowledge_index_missing");
    await knowledge.create();
  }
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

  await waitUntilIndexed(knowledge, path, state, corpus, options);
  log("Indexed. Waiting for the search to answer.");
  await waitUntilSearchable(knowledge, probe, options);
  state.readyAt = new Date().toISOString();
  await saveKnowledgeState(path, state);
  return { state, changed: changed.length + removed.length };
}

/** The service answered and refused, so the request did nothing. Anything else may have worked. */
const refused = (error: unknown) => error instanceof AppError && /_http_4\d\d$/.test(error.code);

/**
 * Delete the recorded index, then move the record aside. "Not there" means
 * "already deleted" only if the create never happened or this app sent the
 * delete, because other credentials also see "not there". After a timeout the
 * delete may have worked, so the record of sending it stays.
 */
export async function removeKnowledge(knowledge: Pick<KnowledgeIndex, "destroy">, path: string, state: KnowledgeState): Promise<void> {
  const sentBefore = !!state.deleteRequestedAt;
  state.deleteRequestedAt ??= new Date().toISOString();
  await saveKnowledgeState(path, state);
  const forgetRequest = async () => {
    if (sentBefore) return;
    delete state.deleteRequestedAt;
    await saveKnowledgeState(path, state);
  };
  let existed: boolean;
  try {
    existed = await knowledge.destroy();
  } catch (error) {
    if (refused(error)) await forgetRequest();
    throw error;
  }
  if (!existed && !sentBefore && state.createdAt) {
    await forgetRequest();
    throw new AppError("knowledge_index_missing");
  }
  await rename(path, path.replace(/\.json$/, `.retired-${state.instanceId}.json`));
}

/**
 * `npm run cleanup`. A setup that stopped before the Agent was created (for
 * example, no credits) must not leave the paid index behind, so the index goes
 * even then, and the Agent's state is reported afterwards. Evidence goes first:
 * once the index record is retired, a rerun of cleanup no longer reaches it.
 */
export async function cleanupAll(steps: {
  agent?: () => Promise<void>;
  evidence: () => Promise<void>;
  knowledge?: () => Promise<void>;
}): Promise<void> {
  let unfinishedAgent: unknown;
  try {
    await steps.agent?.();
  } catch (error) {
    if (!isCode(error, "agent_creation_uncertain_run_setup_again")) throw error;
    unfinishedAgent = error;
  }
  if (steps.knowledge) {
    await steps.evidence();
    await steps.knowledge();
  }
  if (unfinishedAgent) throw unfinishedAgent;
}

/** What `npm run status` prints about the index. A failure here must not hide the Agent's status. */
export async function knowledgeStatusLines(
  connect: () => Pick<KnowledgeIndex, "documents">,
  state: KnowledgeState,
): Promise<string[]> {
  const lines = [`Knowledge:  ${state.instanceId}`];
  try {
    const documents = await connect().documents();
    const count = (name: string) => documents.filter((doc) => doc.state === name).length;
    lines.push(`Documents:  ${count("ready")} indexed, ${count("pending")} waiting, ${count("failed")} failed`);
  } catch (error) {
    lines.push(`Documents:  unavailable (${errorCode(error)})`);
  }
  lines.push(`Search:     ${state.readyAt ? "ready" : "not ready; run npm run setup"}`);
  return lines;
}
