import { route } from "@/lib/zoowork/http";
import { relayStream, resumeCursor, sseResponse } from "@/lib/zoowork/relay";
import { getRuntime, ownedSession } from "@/lib/zoowork/runtime";

// GET /api/sessions/[id]/stream — the conversation, as Server-Sent Events.
//
// One stream carries both the history and the live tail: without a cursor
// the Platform replays the Session from its first event, then continues
// live. Each frame's SSE id is the Platform resume cursor, so a dropped
// connection resumes exactly where it stopped. See lib/zoowork/relay.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (request, { params }: Ctx) => {
  const rt = await getRuntime();
  const entry = await ownedSession(rt, (await params).id);
  return sseResponse(relayStream(rt.client, rt.agentId, entry.id, resumeCursor(request), request.signal));
});
