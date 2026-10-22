import { ZooworkError } from "@zoowork-ai/sdk";
import { StarterError } from "./errors";
import type { ChatClient } from "./runtime";
import type { PendingSessionCreate, SessionEntry, SessionStore } from "./sessions";

type CreateClient = Pick<ChatClient, "createSession">;

/**
 * Send one recorded create and index the result. Repeating it is safe: the
 * same body and idempotency key return the Session created the first time.
 */
async function sendPendingCreate(
  client: CreateClient,
  agentId: string,
  store: SessionStore,
  pending: PendingSessionCreate,
): Promise<SessionEntry> {
  const created = await client.createSession(agentId, { metadata: pending.metadata }, pending.idempotencyKey);
  if (!created.session_id) throw new StarterError("invalid_session_receipt", 502);
  return store.completePendingCreate(pending.threadId, {
    id: created.session_id,
    title: pending.title,
    createdAt: pending.requestedAt,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Create a Session for a browser thread. The request is saved before it is
 * sent, so a lost response leaves a record that recoverPendingCreates() can
 * resolve after a page reload or a server restart. A request the Platform
 * rejects outright (400/422) on its first attempt created nothing, so its
 * record is dropped.
 */
export async function createRecordedSession(
  client: CreateClient,
  agentId: string,
  store: SessionStore,
  request: PendingSessionCreate,
): Promise<SessionEntry> {
  const pending = await store.savePendingCreate(request);
  const fresh = pending === request;
  try {
    return await sendPendingCreate(client, agentId, store, pending);
  } catch (error) {
    if (fresh && error instanceof ZooworkError && (error.status === 400 || error.status === 422)) {
      await store.dropPendingCreate(pending.threadId);
    }
    throw error;
  }
}

/**
 * Resolve creates whose result was never recorded, by repeating each exact
 * request. Records stay on any failure, including 4xx: after a lost response
 * the Session may exist even if a later attempt is refused. With `strict`,
 * the first failure is thrown (cleanup must not leave a Session behind).
 */
export async function recoverPendingCreates(
  client: CreateClient,
  agentId: string,
  store: SessionStore,
  { strict = false }: { strict?: boolean } = {},
): Promise<{ recovered: number; remaining: number }> {
  let recovered = 0;
  let remaining = 0;
  for (const pending of await store.listPendingCreates()) {
    try {
      await sendPendingCreate(client, agentId, store, pending);
      recovered += 1;
    } catch {
      if (strict) throw new StarterError("session_creation_uncertain_retry_cleanup");
      remaining += 1;
    }
  }
  return { recovered, remaining };
}
