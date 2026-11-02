import { contentText } from "../chat/reducer";
import type { SearchSummary, WireEvent } from "../chat/wire";
import { verifyCitations } from "./citations";
import type { EvidenceStore } from "./evidence";

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/**
 * Add what the server knows to an event before the browser sees it: for a
 * reply, the citations checked against the passages its run received; for a
 * finished search, how it went. The same code runs for replay and live events,
 * so a reload shows the same result.
 */
export async function enrichEvent(evidence: EvidenceStore, sessionId: string, event: WireEvent): Promise<WireEvent> {
  const p = event.payload;
  if (event.eventType === "agent.assistant" && event.runId) {
    const text = contentText(isObject(p.message) ? p.message.content : undefined);
    const calls = await evidence.forRun(sessionId, event.runId);
    return { ...event, citations: verifyCitations(text, calls.flatMap((c) => c.passages)) };
  }
  if (event.eventType === "agent.custom_tool_use" && p.phase === "resolved" && typeof p.callId === "string") {
    const call = await evidence.get(p.callId);
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
