import { rename } from "node:fs/promises";
import type { AgentRecord, AgentResource, ZooworkClient } from "@zoowork-ai/sdk";
import { isNotFound, StarterError } from "./errors";
import { desiredResource, labelsFor, newAgentState, saveAgentState, type AgentState } from "./state";
import type { SessionStore } from "./sessions";

export type LifecycleClient = Pick<
  ZooworkClient,
  "createAgent" | "getAgent" | "updateAgent" | "startAgent" | "stopAgent" | "deleteAgent" | "deleteSession"
>;

/**
 * Does `actual` declare everything in `desired`? Objects compare key by key,
 * arrays element by element. Fields the Platform adds (defaults, versions)
 * do not count as drift.
 */
export function declares(actual: unknown, desired: unknown): boolean {
  if (Array.isArray(desired)) {
    return Array.isArray(actual) && actual.length === desired.length && desired.every((v, i) => declares(actual[i], v));
  }
  if (desired && typeof desired === "object") {
    return (
      !!actual &&
      typeof actual === "object" &&
      Object.entries(desired).every(([k, v]) => declares((actual as Record<string, unknown>)[k], v))
    );
  }
  return actual === desired;
}

/** Read the recorded Agent and confirm it still carries this instance's labels. */
export async function ownedAgent(client: Pick<ZooworkClient, "getAgent">, state: AgentState): Promise<AgentRecord> {
  if (!state.agentId) throw new StarterError("agent_creation_uncertain_run_setup_again");
  const agent = await client.getAgent(state.agentId);
  const labels = agent.declared?.labels as Record<string, unknown> | undefined;
  const expected = labelsFor(state);
  if (labels?.starter_app !== expected.starter_app || labels?.starter_instance !== expected.starter_instance) {
    throw new StarterError("agent_label_mismatch");
  }
  return agent;
}

export type ApplyResult = { state: AgentState; agentId: string; action: "created" | "updated" | "unchanged" };

/**
 * Make the Platform Agent match the agent definition, then start it.
 *
 * - No recorded Agent: save the exact create body and idempotency key first,
 *   then create. If the response is lost, running setup again repeats the same
 *   request, which the Platform deduplicates.
 * - Recorded Agent with a different declaration: write the definition's
 *   sections with `updateAgent` and read the Agent back to confirm.
 *
 * Caller holds the state lock.
 */
export async function applyAgent(
  client: LifecycleClient,
  path: string,
  existing: AgentState | undefined,
  baseUrl: string,
  resource: AgentResource,
): Promise<ApplyResult> {
  const state = existing ?? newAgentState(baseUrl, resource);
  let action: ApplyResult["action"] = "unchanged";
  if (!state.agentId) {
    await saveAgentState(path, state);
    const created = await client.createAgent({ resource: state.createBody }, state.createIdempotencyKey);
    if (!created.agent_id) throw new StarterError("invalid_create_receipt");
    state.agentId = created.agent_id;
    await saveAgentState(path, state);
    action = "created";
  }

  const desired = desiredResource(state, resource);
  const current = await ownedAgent(client, state);
  if (!declares(current.declared, desired)) {
    state.pendingUpdate = desired;
    await saveAgentState(path, state);
    await client.updateAgent(state.agentId, desired as unknown as Record<string, unknown>);
    const updated = await ownedAgent(client, state);
    if (!declares(updated.declared, desired)) throw new StarterError("agent_update_not_confirmed");
    if (action === "unchanged") action = "updated";
  }
  if (state.pendingUpdate) {
    delete state.pendingUpdate;
    await saveAgentState(path, state);
  }
  await client.startAgent(state.agentId);
  return { state, agentId: state.agentId, action };
}

export type AgentStatusReport = {
  agentId: string;
  desiredState: string;
  definitionApplied: boolean;
};

export async function agentStatus(
  client: Pick<ZooworkClient, "getAgent">,
  state: AgentState,
  resource: AgentResource,
): Promise<AgentStatusReport> {
  const agent = await ownedAgent(client, state);
  return {
    agentId: agent.agent_id,
    desiredState: agent.status?.desired_state ?? "unknown",
    definitionApplied: declares(agent.declared, desiredResource(state, resource)),
  };
}

/**
 * Delete this starter's recorded Sessions, then stop and delete its Agent.
 * Only IDs in local state are touched; the Project is never listed to choose
 * deletion targets. On any failure the state is kept for the next attempt.
 * After success the state files are renamed to `*.retired-<instance>.json`,
 * so the next setup creates a fresh Agent.
 */
export async function cleanupAgent(
  client: LifecycleClient,
  path: string,
  state: AgentState,
  sessions: SessionStore,
): Promise<{ sessionsDeleted: number }> {
  if (!state.agentId) throw new StarterError("agent_creation_uncertain_run_setup_again");
  await ownedAgent(client, state);
  let sessionsDeleted = 0;
  for (const session of await sessions.list({ includeArchived: true })) {
    try {
      await client.deleteSession(state.agentId, session.id);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    await sessions.remove(session.id);
    sessionsDeleted += 1;
  }
  try {
    await client.stopAgent(state.agentId);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  try {
    await client.deleteAgent(state.agentId);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  const suffix = state.instance.replace(/[^A-Za-z0-9_-]/g, "_");
  await sessions.retire(suffix);
  await rename(path, path.replace(/\.json$/, `.retired-${suffix}.json`));
  return { sessionsDeleted };
}
