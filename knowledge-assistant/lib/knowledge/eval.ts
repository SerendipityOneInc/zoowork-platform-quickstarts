import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { isRunFinished, type ZooworkClient } from "@zoowork-ai/sdk";
import { applyEvent, emptyView, runSources, type RunStatus, type RunTurn, type SessionView } from "../chat/reducer";
import { loadAgentDefinition } from "../zoowork/agent-definition";
import { AppError, errorCode, isNotFound } from "../zoowork/errors";
import { agentStatus } from "../zoowork/lifecycle";
import { toWire } from "../zoowork/relay";
import type { ChatClient } from "../zoowork/runtime";
import { createRecordedSession, recoverPendingCreates } from "../zoowork/session-create";
import { fileSessionStore, titleFrom, type SessionStore } from "../zoowork/sessions";
import { agentStatePath, APP, LOCAL_DIR, loadAgentState, runningWebPid } from "../zoowork/state";
import { enrichEvent } from "./enrich";
import { fileEvidenceStore, type EvidenceStore } from "./evidence";

// `npm run eval`: fixed questions, asked through the real Agent and search. Each
// answer goes through the same worker, citation check and event fold as the
// chat, and is scored by plain rules, so a result means what a user would see.

/** The sentence agent/agent.md tells the Agent to start with when the docs have no answer. */
export const REFUSAL = "The Fernwick docs do not cover this.";

const QUESTIONS_FILE = join("eval", "questions.json");
const QUESTION_TIMEOUT_MS = 3 * 60_000;
const RECONNECT_MS = 1_000;

export type Expected = { source: string; fragment: string };

export type EvalQuestion = { id: string; question: string } & (
  | { kind: "direct" | "synonym" | "multi_source"; expect: Expected[] }
  | { kind: "not_in_docs"; absent: string[] }
);

/** What one run showed the user. */
export type EvalOutcome = {
  status: RunStatus | "no_run";
  /** The final reply, as the chat shows it. */
  reply: string;
  sources: string[];
  unverified: string[];
  searches: number;
  searchFailed?: string;
};

export type EvalResult = {
  id: string;
  kind: EvalQuestion["kind"];
  pass: boolean;
  reason?: string;
  seconds: number;
  outcome?: EvalOutcome;
};

/** A document the questions can be checked against, when the app has them locally. */
export type SourceDocument = { key: string; text: string };

export type EvalClient = Pick<ChatClient, "createSession" | "postEvents" | "streamEvents" | "deleteSession">;

export type EvalStores = { sessions: SessionStore; evidence: EvidenceStore };

export type EvalDeps = EvalStores & {
  client: EvalClient;
  agentId: string;
  instance: string;
  worker: { start(): void; wake(): void; stop(): void };
  log?: (line: string) => void;
  /** Stops the run, for Ctrl+C. Sessions are still deleted. */
  signal?: AbortSignal;
  timeoutMs?: number;
};

/** Compare text the way a reader would: ignore case, spacing and Markdown emphasis. */
const plain = (text: string) => text.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

const mentions = (text: string, fragment: string) => plain(text).includes(plain(fragment));

const mentionsWord = (text: string, term: string) =>
  new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);

function invalid(id: unknown): AppError {
  return new AppError(`invalid_eval_question:${typeof id === "string" && id ? id : "unknown"}`);
}

function validQuestion(raw: unknown, corpus?: readonly SourceDocument[]): EvalQuestion {
  const q = raw as Partial<Record<keyof (EvalQuestion & { expect: unknown; absent: unknown }), unknown>> | null;
  if (typeof q?.id !== "string" || !q.id || typeof q.question !== "string" || !q.question.trim()) throw invalid(q?.id);
  const { id, question } = q;
  if (q.kind === "not_in_docs") {
    const absent = q.absent;
    if (!Array.isArray(absent) || !absent.length) throw invalid(id);
    // A refusal is only right if the docs really have nothing on it.
    const present = (term: unknown) => typeof term !== "string" || !term || !!corpus?.some((d) => mentionsWord(d.text, term));
    if (absent.some(present)) throw invalid(id);
    return { id, kind: "not_in_docs", question, absent: absent as string[] };
  }
  if (q.kind !== "direct" && q.kind !== "synonym" && q.kind !== "multi_source") throw invalid(id);
  const expect = q.expect;
  if (!Array.isArray(expect) || !expect.length) throw invalid(id);
  for (const item of expect as Partial<Expected>[]) {
    if (typeof item?.source !== "string" || !item.source || typeof item.fragment !== "string" || !item.fragment) throw invalid(id);
    if (!corpus) continue;
    const doc = corpus.find((d) => d.key === item.source);
    if (!doc || !mentions(doc.text, item.fragment)) throw invalid(id);
  }
  return { id, kind: q.kind, question, expect: expect as Expected[] };
}

/**
 * The questions. Given the documents, each one is checked against them: an
 * expected answer has to be in the document it names, and a question the docs
 * should not answer has to use terms no document contains.
 */
export function loadQuestions(corpus?: readonly SourceDocument[], cwd = process.cwd()): EvalQuestion[] {
  let file: { version?: unknown; questions?: unknown };
  try {
    file = JSON.parse(readFileSync(join(cwd, QUESTIONS_FILE), "utf8")) as typeof file;
  } catch {
    throw new AppError("eval_questions_missing");
  }
  if (file.version !== 1 || !Array.isArray(file.questions) || !file.questions.length) {
    throw new AppError("eval_questions_missing");
  }
  const questions = file.questions.map((q) => validQuestion(q, corpus));
  const ids = questions.map((q) => q.id);
  const repeated = ids.find((id, index) => ids.indexOf(id) !== index);
  if (repeated) throw invalid(repeated);
  return questions;
}

/** What the chat would show for the run in this view. */
export function outcomeOf(view: SessionView): EvalOutcome {
  const turn = view.turns.findLast((t): t is RunTurn => t.role === "assistant");
  if (!turn) return { status: "no_run", reply: "", sources: [], unverified: [], searches: 0 };
  const { citations, searches, searchFailed } = runSources(turn, view);
  const texts = turn.parts.flatMap((part) => (part.type === "text" && part.text.trim() ? [part.text] : []));
  return {
    status: turn.status,
    reply: (texts.at(-1) ?? "").trim(),
    sources: citations.sources.map((s) => s.key),
    unverified: citations.unverified,
    searches,
    ...(searchFailed ? { searchFailed } : {}),
  };
}

/** Why the answer fails, or undefined if it passes. A failed run or search is never a refusal. */
export function failureOf(question: EvalQuestion, outcome: EvalOutcome): string | undefined {
  if (outcome.status !== "succeeded") return `run_${outcome.status}`;
  if (outcome.searchFailed) return `search_failed:${outcome.searchFailed}`;
  if (question.kind === "not_in_docs") {
    if (outcome.sources.length) return `source_on_refusal:${outcome.sources.join(",")}`;
    return outcome.reply.startsWith(REFUSAL) ? undefined : "not_refused";
  }
  for (const { source, fragment } of question.expect) {
    if (!outcome.sources.includes(source)) return `source_missing:${source}`;
    if (!mentions(outcome.reply, fragment)) return `fragment_missing:${fragment}`;
  }
  return undefined;
}

async function readRun(deps: EvalDeps, sessionId: string, signal: AbortSignal): Promise<SessionView> {
  let view = emptyView();
  let cursor: string | undefined;
  for (;;) {
    for await (const event of deps.client.streamEvents(deps.agentId, sessionId, { ...(cursor ? { cursor } : {}), signal })) {
      view = applyEvent(view, await enrichEvent(deps.evidence, sessionId, toWire(event)));
      cursor = event.cursor ?? cursor;
      if (isRunFinished(event)) return view;
    }
    // The Platform closes idle streams. Continue from the last event.
    signal.throwIfAborted();
    await new Promise((resolve) => setTimeout(resolve, RECONNECT_MS));
  }
}

/** Delete one Session and what was saved for it. The record stays if the delete fails. */
async function forget(deps: Pick<EvalDeps, "client" | "agentId" | "sessions" | "evidence">, sessionId: string) {
  try {
    await deps.client.deleteSession(deps.agentId, sessionId);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  await deps.evidence.removeSession(sessionId);
  await deps.sessions.remove(sessionId);
}

/** Remove the recorded Sessions of an eval that did not finish. Only recorded IDs are touched. */
export async function removeEvalSessions(deps: Pick<EvalDeps, "client" | "agentId" | "sessions" | "evidence">): Promise<number> {
  await recoverPendingCreates(deps.client, deps.agentId, deps.sessions, { strict: true });
  const recorded = await deps.sessions.list({ includeArchived: true });
  for (const session of recorded) await forget(deps, session.id);
  return recorded.length;
}

async function ask(deps: EvalDeps, question: EvalQuestion, runId: string): Promise<EvalResult> {
  const { client, agentId, instance, sessions, worker } = deps;
  const started = Date.now();
  // A plain timer, not AbortSignal.timeout(): that one does not keep the process alive.
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), deps.timeoutMs ?? QUESTION_TIMEOUT_MS);
  const signal = deps.signal ? AbortSignal.any([deps.signal, timeout.signal]) : timeout.signal;
  const key = `${APP}:${instance}:eval:${runId}:${question.id}`;
  const title = titleFrom(question.question);
  const result = (reason: string | undefined, outcome?: EvalOutcome): EvalResult => ({
    id: question.id,
    kind: question.kind,
    pass: !reason,
    ...(reason ? { reason } : {}),
    seconds: Math.round((Date.now() - started) / 1000),
    ...(outcome ? { outcome } : {}),
  });
  let sessionId: string | undefined;
  try {
    const entry = await createRecordedSession(client, agentId, sessions, {
      threadId: `eval-${runId}-${question.id}`,
      idempotencyKey: `${key}:session`,
      title,
      metadata: { quickstart_app: APP, quickstart_instance: instance, title },
      requestedAt: new Date().toISOString(),
    });
    sessionId = entry.id;
    const receipt = await client.postEvents(agentId, sessionId, [
      { type: "user.message", content: question.question, idempotency_key: `${key}:message` },
    ]);
    if (receipt.events[0]?.accepted !== true) return result("message_not_accepted");
    worker.wake();
    const outcome = outcomeOf(await readRun(deps, sessionId, signal));
    return result(failureOf(question, outcome), outcome);
  } catch (error) {
    return result(timeout.signal.aborted ? "timeout" : deps.signal?.aborted ? "interrupted" : `error:${errorCode(error)}`);
  } finally {
    clearTimeout(timer);
    if (sessionId) {
      await forget(deps, sessionId).catch((error: unknown) => {
        deps.log?.(`Could not delete Session ${sessionId} (${errorCode(error)}). The next npm run eval or npm run cleanup removes it.`);
      });
    }
  }
}

/** Ask every question in a fresh Session, one at a time, and delete each Session afterwards. */
export async function runEval(deps: EvalDeps, questions: readonly EvalQuestion[]): Promise<EvalResult[]> {
  const left = await removeEvalSessions(deps);
  if (left) deps.log?.(`Removed ${left} Session(s) left by an earlier eval.`);
  const runId = Date.now().toString(36);
  const results: EvalResult[] = [];
  deps.worker.start();
  try {
    for (const question of questions) {
      if (deps.signal?.aborted) break;
      const result = await ask(deps, question, runId);
      results.push(result);
      for (const line of formatResult(result)) deps.log?.(line);
    }
  } finally {
    deps.worker.stop();
  }
  return results;
}

export function formatResult({ pass, kind, id, seconds, reason, outcome }: EvalResult): string[] {
  const facts = [
    `${seconds}s`,
    ...(outcome ? [`searches=${outcome.searches}`] : []),
    ...(outcome?.sources.length ? [`sources=${outcome.sources.join(",")}`] : []),
    ...(outcome?.unverified.length ? [`unverified=${outcome.unverified.join(",")}`] : []),
  ];
  const line = `${pass ? "PASS" : "FAIL"}  ${kind.padEnd(12)} ${id}  ${facts.join("  ")}`;
  if (pass) return [line];
  const reply = outcome?.reply.replace(/\s+/g, " ").slice(0, 200);
  return [`${line}  reason=${reason}`, ...(reply ? [`      reply: ${reply}`] : [])];
}

export function formatSummary(results: readonly EvalResult[], total: number): string {
  const passed = results.filter((r) => r.pass).length;
  const searches = results.reduce((sum, r) => sum + (r.outcome?.searches ?? 0), 0);
  const skipped = total - results.length;
  return `Passed ${passed} of ${total}.${skipped ? ` ${skipped} not asked.` : ""} Searches: ${searches}.`;
}

export const evalEvidencePath = (cwd = process.cwd()) => join(cwd, LOCAL_DIR, "eval-evidence.json");

/**
 * Eval keeps its own Session index and evidence, so its questions never appear
 * in the chat's conversation list.
 */
export function evalStores(scope: { instance: string; agentId: string }, cwd = process.cwd()): EvalStores {
  return {
    sessions: fileSessionStore(join(cwd, LOCAL_DIR, "eval-sessions.json"), scope),
    evidence: fileEvidenceStore(evalEvidencePath(cwd)),
  };
}

/** For cleanup: remove anything an eval left, and retire its index along with the Agent's. */
export async function clearEvalState(deps: Pick<EvalDeps, "client" | "agentId"> & EvalStores, suffix: string, cwd = process.cwd()) {
  await removeEvalSessions(deps);
  await deps.sessions.retire(suffix);
  await rm(evalEvidencePath(cwd), { force: true });
}

/** Everything eval needs before it spends anything. */
export async function evalPreflight(client: Pick<ZooworkClient, "getAgent">, cwd = process.cwd()) {
  if (await runningWebPid(cwd)) throw new AppError("web_server_running");
  const state = await loadAgentState(agentStatePath(cwd));
  if (!state) throw new AppError("run_setup_first");
  if (!state.agentId) throw new AppError("agent_creation_uncertain_run_setup_again");
  const report = await agentStatus(client, state, loadAgentDefinition(cwd).resource);
  if (report.desiredState !== "running") throw new AppError("agent_not_running");
  if (!report.definitionApplied) throw new AppError("agent_definition_changed");
  return { agentId: state.agentId, instance: state.instance };
}
