import { errorCode, StarterError } from "@/lib/zoowork/errors";
import { readJson, route } from "@/lib/zoowork/http";
import { getRuntime } from "@/lib/zoowork/runtime";
import { createRecordedSession, recoverPendingCreates } from "@/lib/zoowork/session-create";
import { titleFrom } from "@/lib/zoowork/sessions";
import { APP } from "@/lib/zoowork/state";
import { summarize } from "./summary";

// The conversation list. Each conversation is one Platform Session on this
// app's Agent; the local index records which Sessions this app created.
//
// GET  /api/sessions                      → { sessions: SessionSummary[] }
// POST /api/sessions {threadId, title}    → SessionSummary (201)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const THREAD_ID = /^[A-Za-z0-9_-]{1,100}$/;

export const GET = route(async () => {
  const rt = await getRuntime();
  // Finish any create whose response was lost (a reload, a crash), so its
  // Session appears in the list. Best effort: failures stay recorded.
  try {
    await recoverPendingCreates(rt.client, rt.agentId, rt.sessions);
  } catch (error) {
    console.error(`[starter] session recovery: ${errorCode(error)}`);
  }
  const sessions = await rt.sessions.list({ includeArchived: true });
  return Response.json({ sessions: sessions.map(summarize) });
});

export const POST = route(
  async (request) => {
    const rt = await getRuntime();
    const body = await readJson(request);
    const threadId = typeof body.threadId === "string" ? body.threadId : "";
    if (!THREAD_ID.test(threadId)) throw new StarterError("thread_id_required");
    const title = titleFrom(body.title);
    // Saved before sending, with the exact body and idempotency key, so a lost
    // response is recovered by repeating the same request (see GET above).
    const now = new Date().toISOString();
    const entry = await createRecordedSession(rt.client, rt.agentId, rt.sessions, {
      threadId,
      idempotencyKey: `starter:${rt.instance}:session:${threadId}`,
      title,
      metadata: { starter_app: APP, starter_instance: rt.instance, title },
      requestedAt: now,
    });
    return Response.json(summarize(entry), { status: 201 });
  },
  { write: true },
);
