import { access, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ZooworkError, type ZooworkClient } from "@zoowork-ai/sdk";
import {
  cleanupAgent,
  FoundationError,
  ownedAgent,
  type State,
} from "./platform.js";
import { Store } from "./store.js";

/** Only local recorded Session IDs are eligible. No Project/session enumeration. */
export async function cleanupApplication(
  client: ZooworkClient,
  state: State,
  path: string,
) {
  await ownedAgent(client, state);
  const filename =
    state.database ??
    (path.endsWith("/agent.json") ? "support.sqlite" : undefined);
  let store: Store | undefined, database: string | undefined;
  if (filename) {
    if (!/^[a-zA-Z0-9_-]+\.sqlite$/.test(filename))
      throw new FoundationError("invalid_database_filename");
    database = resolve(dirname(path), filename);
    try {
      await access(database);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      database = undefined;
    }
    if (database) {
      store = new Store(
        database,
        `${state.baseUrl}:${state.instance}:${state.agentId}`,
      );
      try {
        store.claimProcess();
      } catch (error) {
        store.close();
        throw error;
      }
    }
  }
  try {
    for (const conversation of store?.conversations() ?? []) {
      if (!conversation.sessionId)
        throw new FoundationError("session_creation_uncertain_keep_database");
      try {
        // Session IDs come from an app journal bound to the exact Agent instance/deployment.
        const session = await client.getSession(
          state.agentId!,
          conversation.sessionId,
        );
        if (
          session.metadata?.source !== "customer-support" ||
          session.metadata?.conversation !== conversation.id
        )
          throw new FoundationError("session_metadata_mismatch_keep_database");
        await client.deleteSession(state.agentId!, conversation.sessionId);
      } catch (error) {
        if (!(error instanceof ZooworkError && error.status === 404))
          throw error;
      }
    }
    await cleanupAgent(client, state, path);
  } finally {
    if (store) {
      store.releaseProcess();
      store.close();
    }
  }
  // Keep business/history records for inspection, without blocking a fresh Agent setup.
  if (database)
    await rename(
      database,
      resolve(dirname(path), `archived-${state.instance}.sqlite`),
    );
}
