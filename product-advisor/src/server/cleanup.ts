import type { ZooworkClient } from "@zoowork-ai/sdk";
import { ZooworkError } from "@zoowork-ai/sdk";
import { FoundationError, ownedAgent, type State } from "../platform.js";
import { Conversations } from "../storage/conversations.js";

export async function cleanupConversations(
  client: ZooworkClient,
  state: State,
  store: Conversations,
): Promise<void> {
  await ownedAgent(client, state);
  const recorded = store.forAgent(state.agentId!);
  if (recorded.some((c) => !c.sessionId))
    throw new FoundationError("session_creation_uncertain_keep_state");
  for (const c of recorded) {
    try {
      const session = await client.getSession(state.agentId!, c.sessionId!);
      if (
        session.metadata?.source !== "product-advisor" ||
        session.metadata?.conversation !== c.id
      )
        throw new FoundationError("session_metadata_mismatch");
      await client.deleteSession(state.agentId!, c.sessionId!);
    } catch (error) {
      if (!(error instanceof ZooworkError && error.status === 404)) throw error;
    }
  }
  // Keep the ledger until Agent stop/delete also succeeds; repeated session 404s are safe.
}
