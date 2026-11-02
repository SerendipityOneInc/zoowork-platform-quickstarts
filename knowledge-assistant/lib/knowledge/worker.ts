import type { ZooworkClient, CustomToolCallRecord } from "@zoowork-ai/sdk";
import { errorCode } from "../zoowork/errors";
import type { EvidenceCall, EvidenceStore } from "./evidence";
import type { Retriever } from "./retriever";
import { SEARCH_TOOL } from "./search-tool";

const QUERY_MAX = 500;
/** Poll quickly around a message, and rarely otherwise, to pick up calls left by a restart. */
const FAST_MS = 800;
const SLOW_MS = 15_000;
const FAST_WINDOW_MS = 10 * 60_000;

type ToolClient = Pick<ZooworkClient, "listCustomToolCalls" | "getCustomToolCall" | "resolveCustomToolCall">;

export type SearchWorkerDeps = {
  client: ToolClient;
  agentId: string;
  retriever: Retriever;
  evidence: EvidenceStore;
  /** The authorization point: a call is answered only for a Session this app created. */
  ownsSession: (sessionId: string) => Promise<boolean>;
};

function toolResult(call: EvidenceCall) {
  if (call.status === "failed") return { error: "search_failed" };
  return {
    found: call.passages.length,
    passages: call.passages.map(({ key, title, text }) => ({ source: key, title, text })),
  };
}

async function runSearch(call: CustomToolCallRecord, retriever: Retriever): Promise<EvidenceCall> {
  const query = typeof call.input.query === "string" ? call.input.query.trim() : "";
  const base = {
    callId: call.call_id,
    sessionId: call.session_id,
    ...(call.run_id ? { runId: call.run_id } : {}),
    query: query.slice(0, QUERY_MAX),
    requestedAt: call.requested_at,
  };
  if (!query || query.length > QUERY_MAX) return { ...base, status: "failed", code: "invalid_query", passages: [] };
  try {
    return { ...base, status: "ok", passages: await retriever.search(query) };
  } catch (error) {
    return { ...base, status: "failed", code: errorCode(error), passages: [] };
  }
}

/**
 * Answers the Agent's searches on the server, so a run does not depend on a
 * browser being connected. The search result is saved before it is sent. If
 * sending fails, the next pass sends the saved result again and does not search
 * twice. A failed search is returned to the Agent as a tool error; it is never
 * reported as "nothing found".
 */
export function createSearchWorker({ client, agentId, retriever, evidence, ownsSession }: SearchWorkerDeps) {
  const inFlight = new Set<string>();
  let fastUntil = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = true;

  async function answer(call: CustomToolCallRecord) {
    if (call.name !== SEARCH_TOOL || inFlight.has(call.call_id)) return;
    inFlight.add(call.call_id);
    try {
      if (!(await ownsSession(call.session_id))) return;
      let saved = await evidence.get(call.call_id);
      if (saved?.delivered) return;
      if (!saved) {
        // The pending list leaves out the run. Citations are checked per run, so read it first.
        const { run_id } = call.run_id ? call : await client.getCustomToolCall(agentId, call.call_id);
        saved = await runSearch({ ...call, ...(run_id ? { run_id } : {}) }, retriever);
        await evidence.save(saved);
      }
      await client.resolveCustomToolCall(agentId, call.call_id, {
        content: [{ type: "json", value: toolResult(saved) }],
        isError: saved.status === "failed",
        resolvedBy: "knowledge-assistant",
      });
      await evidence.save({ ...saved, delivered: true });
    } finally {
      inFlight.delete(call.call_id);
    }
  }

  /** One pass over the pending calls. Returns how many were pending. */
  async function poll(): Promise<number> {
    const calls = await client.listCustomToolCalls(agentId, { status: "pending" });
    await Promise.all(calls.map(answer));
    return calls.length;
  }

  function schedule() {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(loop, Date.now() < fastUntil ? FAST_MS : SLOW_MS);
    timer.unref?.();
  }

  async function loop() {
    try {
      if ((await poll()) > 0) fastUntil = Date.now() + FAST_WINDOW_MS;
    } catch (error) {
      console.error(`[knowledge-assistant] search worker ${errorCode(error)}`);
    }
    schedule();
  }

  return {
    poll,
    start() {
      if (!stopped) return;
      stopped = false;
      void loop();
    },
    /** A message was sent, so a search may be coming. */
    wake() {
      fastUntil = Date.now() + FAST_WINDOW_MS;
      schedule();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
