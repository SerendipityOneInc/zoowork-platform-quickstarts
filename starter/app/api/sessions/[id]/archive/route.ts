import { route } from "@/lib/zoowork/http";
import { getRuntime, ownedSession } from "@/lib/zoowork/runtime";
import { summarize } from "../../summary";

// POST /api/sessions/[id]/archive → SessionSummary
//
// An archived Session stays readable but accepts no new input. Interrupt any
// in-flight run first, so the archive does not race it.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(
  async (_request, { params }: Ctx) => {
    const rt = await getRuntime();
    const entry = await ownedSession(rt, (await params).id);
    if (!entry.archived) {
      await rt.client.postEvents(rt.agentId, entry.id, [{ type: "user.interrupt" }]);
      await rt.client.archiveSession(rt.agentId, entry.id);
    }
    const updated = await rt.sessions.update(entry.id, { archived: true });
    return Response.json(summarize(updated ?? entry));
  },
  { write: true },
);
