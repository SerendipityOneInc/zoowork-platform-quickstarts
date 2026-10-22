import { ZooworkError } from "@zoowork-ai/sdk";
import { MESSAGE_MAX } from "@/lib/chat/wire";
import { StarterError } from "@/lib/zoowork/errors";
import { readJson, route } from "@/lib/zoowork/http";
import { getRuntime, ownedSession } from "@/lib/zoowork/runtime";

// POST /api/sessions/[id]/messages {text, clientMessageId} → {accepted, seq} (202)
//
// One user turn. The reply arrives on the stream route, not on this response.
// `clientMessageId` becomes the event's idempotency key, so a retried request
// for the same message is delivered once and never starts a second paid run.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const CLIENT_ID = /^[A-Za-z0-9_-]{8,100}$/;

export const POST = route(
  async (request, { params }: Ctx) => {
    const rt = await getRuntime();
    const entry = await ownedSession(rt, (await params).id);
    if (entry.archived) throw new StarterError("session_archived", 409);
    const body = await readJson(request);
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) throw new StarterError("message_empty");
    if (text.length > MESSAGE_MAX) throw new StarterError("message_too_long");
    const clientMessageId = typeof body.clientMessageId === "string" ? body.clientMessageId : "";
    if (!CLIENT_ID.test(clientMessageId)) throw new StarterError("client_message_id_required");

    let events;
    try {
      ({ events } = await rt.client.postEvents(rt.agentId, entry.id, [
        { type: "user.message", content: text, idempotency_key: `starter:${entry.id}:${clientMessageId}` },
      ]));
    } catch (error) {
      if (error instanceof ZooworkError && error.status === 409 && error.type === "session_archived") {
        // Archived elsewhere or by an archive whose local update failed: catch the index up.
        await rt.sessions.update(entry.id, { archived: true });
        throw new StarterError("session_archived", 409);
      }
      throw error;
    }
    const receipt = events[0];
    if (receipt?.accepted !== true) throw new StarterError("message_not_accepted", 409);
    await rt.sessions.update(entry.id, { updatedAt: new Date().toISOString() });
    const seq = typeof receipt.seq === "number" ? receipt.seq : undefined;
    return Response.json({ accepted: true, ...(seq !== undefined ? { seq } : {}) }, { status: 202 });
  },
  { write: true },
);
