import { StarterError } from "@/lib/zoowork/errors";
import { readJson, route } from "@/lib/zoowork/http";
import { getRuntime } from "@/lib/zoowork/runtime";
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
    // The browser's thread id makes the create idempotent: a retried request
    // returns the same Session instead of creating a second one.
    const created = await rt.client.createSession(
      rt.agentId,
      { metadata: { starter_app: APP, starter_instance: rt.instance, title } },
      `starter:${rt.instance}:session:${threadId}`,
    );
    if (!created.session_id) throw new StarterError("invalid_session_receipt", 502);
    const existing = await rt.sessions.get(created.session_id);
    if (existing) return Response.json(summarize(existing), { status: 200 });
    const now = new Date().toISOString();
    const entry = { id: created.session_id, title, createdAt: now, updatedAt: now };
    await rt.sessions.add(entry);
    return Response.json(summarize(entry), { status: 201 });
  },
  { write: true },
);
