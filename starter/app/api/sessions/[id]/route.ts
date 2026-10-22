import { isNotFound, StarterError } from "@/lib/zoowork/errors";
import { readJson, route } from "@/lib/zoowork/http";
import { getRuntime, ownedSession } from "@/lib/zoowork/runtime";
import { titleFrom } from "@/lib/zoowork/sessions";
import { summarize } from "../summary";

// GET    /api/sessions/[id]          → SessionSummary
// PATCH  /api/sessions/[id] {title}  → SessionSummary (the title is local to this app)
// DELETE /api/sessions/[id]          → 204; the Platform cancels an in-flight run first

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_request, { params }: Ctx) => {
  const rt = await getRuntime();
  return Response.json(summarize(await ownedSession(rt, (await params).id)));
});

export const PATCH = route(
  async (request, { params }: Ctx) => {
    const rt = await getRuntime();
    const entry = await ownedSession(rt, (await params).id);
    const body = await readJson(request);
    if (typeof body.title !== "string" || !body.title.trim()) throw new StarterError("title_required");
    const updated = await rt.sessions.update(entry.id, { title: titleFrom(body.title) });
    return Response.json(summarize(updated ?? entry));
  },
  { write: true },
);

export const DELETE = route(async (request, { params }: Ctx) => {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) throw new StarterError("cross_origin_request", 403);
  const rt = await getRuntime();
  const entry = await ownedSession(rt, (await params).id);
  try {
    await rt.client.deleteSession(rt.agentId, entry.id);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  await rt.sessions.remove(entry.id);
  return new Response(null, { status: 204 });
});
