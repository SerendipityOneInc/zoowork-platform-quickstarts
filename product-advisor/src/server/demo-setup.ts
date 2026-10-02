import { resolve } from "node:path";
import type { ZooworkClient } from "@zoowork-ai/sdk";
import { agentResource, demo } from "../agent.js";
import {
  FoundationError,
  loadState,
  newState,
  ownedAgent,
  saveState,
  setupAgent,
  withStateLock,
  type Config,
} from "../platform.js";
import { Conversations } from "../storage/conversations.js";

export async function prepareDemo(
  client: ZooworkClient,
  config: Config,
  mcpUrl: string,
  dir = resolve(".local"),
): Promise<string> {
  const path = resolve(dir, "agent.json");
  return withStateLock(path, async () => {
    let state = await loadState(path, config, demo);
    const ledger = new Conversations(resolve(dir, "conversations.sqlite"));
    try {
      if (!state && ledger.agentIds().length)
        throw new FoundationError("recorded_conversations_require_recovery");
      state ??= newState(config, demo, agentResource(mcpUrl));
      // Complete any saved creation/update exactly before applying the new tunnel URL.
      const id = await setupAgent(client, state, path);
      if (state.pendingResource) {
        await client.updateAgent(id, { ...state.pendingResource });
        state.resource = state.pendingResource;
        delete state.pendingResource;
        await saveState(path, state);
      }
      if (
        state.resource.mcp?.find((m) => m.name === "catalog")?.url !== mcpUrl
      ) {
        await ownedAgent(client, state);
        state.pendingResource = {
          ...agentResource(mcpUrl),
          labels: state.resource.labels,
        };
        await saveState(path, state);
        await client.updateAgent(id, { ...state.pendingResource });
        state.resource = state.pendingResource;
        delete state.pendingResource;
        await saveState(path, state);
      }
      return id;
    } finally {
      ledger.close();
    }
  });
}
