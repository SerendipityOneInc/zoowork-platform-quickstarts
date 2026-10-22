import { archiveOnPlatform } from "@/lib/zoowork/archive";
import { route } from "@/lib/zoowork/http";
import { getRuntime, ownedSession } from "@/lib/zoowork/runtime";
import { summarize } from "../../summary";

// POST /api/sessions/[id]/archive → SessionSummary
//
// An archived Session stays readable but accepts no new input. The Platform
// is the source of truth: a retry after a partial failure finds the Session
// already archived and only updates the local index. A run in flight is
// interrupted first, and the archive waits for it to end, so the two do not
// race.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(
  async (_request, { params }: Ctx) => {
    const rt = await getRuntime();
    const entry = await ownedSession(rt, (await params).id);
    if (!entry.archived) await archiveOnPlatform(rt.client, rt.agentId, entry.id);
    const updated = await rt.sessions.update(entry.id, { archived: true });
    return Response.json(summarize(updated ?? entry));
  },
  { write: true },
);
