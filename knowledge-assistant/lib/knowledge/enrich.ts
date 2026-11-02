import { contentText, isObject } from "../chat/reducer";
import type { SearchSummary, WireEvent } from "../chat/wire";
import { errorCode } from "../zoowork/errors";
import { verifyCitations } from "./citations";
import type { EvidenceStore } from "./evidence";

/** Citation checks must not break the chat: without evidence, citations show as unverified. */
async function readEvidence<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    console.error(`[knowledge-assistant] evidence ${errorCode(error)}`);
    return fallback;
  }
}

/**
 * Add what the server knows to an event before the browser sees it: for a
 * reply, the citations checked against the passages its run received before
 * that reply; for a finished search, how it went. The same code runs for replay
 * and live events, so a reload shows the same result.
 */
export async function enrichEvent(evidence: EvidenceStore, sessionId: string, event: WireEvent): Promise<WireEvent> {
  const p = event.payload;
  if (event.eventType === "agent.assistant" && event.runId) {
    const { runId, createdAt } = event;
    const text = contentText(isObject(p.message) ? p.message.content : undefined);
    const calls = await readEvidence(() => evidence.forRun(sessionId, runId), []);
    // A live reply cannot see a later search, so a replay must not either.
    const before = createdAt ? calls.filter((c) => Date.parse(c.requestedAt) <= Date.parse(createdAt)) : calls;
    return { ...event, citations: verifyCitations(text, before.flatMap((c) => c.passages)) };
  }
  if (event.eventType === "agent.custom_tool_use" && p.phase === "resolved" && typeof p.callId === "string") {
    const { callId } = p;
    // A timed-out search reached the Agent as a failure, whatever was saved later.
    if (typeof p.outcome === "string" && p.outcome !== "completed") {
      return { ...event, search: { status: "failed", passages: 0, code: `search_${p.outcome}` } };
    }
    const call = await readEvidence(() => evidence.get(callId), undefined);
    if (!call || call.sessionId !== sessionId) return event;
    const search: SearchSummary = {
      status: call.status,
      passages: call.passages.length,
      ...(call.code ? { code: call.code } : {}),
    };
    return { ...event, search };
  }
  return event;
}
