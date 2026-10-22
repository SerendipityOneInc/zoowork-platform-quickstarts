import { route } from "@/lib/zoowork/http";
import { getRuntime, ownedSession } from "@/lib/zoowork/runtime";

// POST /api/sessions/[id]/interrupt → {accepted}
//
// The stop button. It stops the run on the Platform; closing the page would
// only stop watching it. `accepted: false` means no run was in flight.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(
  async (_request, { params }: Ctx) => {
    const rt = await getRuntime();
    const entry = await ownedSession(rt, (await params).id);
    const { events } = await rt.client.postEvents(rt.agentId, entry.id, [{ type: "user.interrupt" }]);
    return Response.json({ accepted: events[0]?.accepted === true });
  },
  { write: true },
);
