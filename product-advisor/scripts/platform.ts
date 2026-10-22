import { resolve } from "node:path";
import { createZooworkClient } from "@zoowork-ai/sdk";
import { agentResource, demo } from "../src/agent.js";
import {
  cleanupAgent,
  FoundationError,
  loadState,
  newState,
  ownedAgent,
  readApiKey,
  safeError,
  saveState,
  setupAgent,
  withStateLock,
} from "../src/platform.js";
import { Conversations } from "../src/storage/conversations.js";
import { cleanupConversations } from "../src/server/cleanup.js";

const command = process.argv[2];
try {
  if (!["setup", "status", "cleanup", "configure"].includes(command ?? ""))
    throw new FoundationError("expected_setup_status_configure_or_cleanup");
  const path = resolve(".local", "agent.json");
  const client = createZooworkClient({ apiKey: readApiKey() });
  await withStateLock(path, async () => {
    let state = await loadState(path, demo);
    if (command === "setup") {
      const ledger = new Conversations(
        resolve(".local", "conversations.sqlite"),
      );
      try {
        if (!state && ledger.agentIds().length)
          throw new FoundationError("recorded_conversations_require_recovery");
      } finally {
        ledger.close();
      }
      state ??= newState(demo, agentResource());
      const id = await setupAgent(client, state, path);
      console.log(`Agent ready: ${id}`);
      return;
    }
    if (!state) throw new FoundationError("run_setup_first");
    if (command === "configure") {
      await ownedAgent(client, state);
      state.pendingResource ??= {
        ...agentResource(),
        labels: state.resource.labels,
      };
      await saveState(path, state);
      await client.updateAgent(state.agentId!, { ...state.pendingResource });
      state.resource = state.pendingResource;
      delete state.pendingResource;
      await saveState(path, state);
      console.log("Agent configuration updated; restart the application.");
      return;
    }
    if (command === "cleanup") {
      const store = new Conversations(
        resolve(".local", "conversations.sqlite"),
      );
      try {
        await cleanupConversations(client, state, store);
        await cleanupAgent(client, state, path);
        store.clearAgent(state.agentId!);
      } finally {
        store.close();
      }
      console.log("Cleanup complete");
    } else {
      const agent = await ownedAgent(client, state);
      console.log(
        JSON.stringify({
          agentId: agent.agent_id,
          desiredState: agent.status?.desired_state ?? "unknown",
        }),
      );
    }
  });
} catch (error) {
  console.error(
    `FAIL: ${safeError(error)}; check configuration and retained .local state.`,
  );
  process.exitCode = 1;
}
