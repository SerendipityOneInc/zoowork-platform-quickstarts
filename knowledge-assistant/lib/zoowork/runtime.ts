import { rmSync, writeFileSync } from "node:fs";
import { createZooworkClient, type ZooworkClient } from "@zoowork-ai/sdk";
import { connectKnowledge } from "../knowledge/cloudflare";
import { evidencePath, fileEvidenceStore, type EvidenceStore } from "../knowledge/evidence";
import { knowledgeStatePath, loadKnowledgeState } from "../knowledge/setup";
import { createSearchWorker } from "../knowledge/worker";
import { loadAgentDefinition } from "./agent-definition";
import { readApiKey } from "./config";
import { AppError } from "./errors";
import { agentStatus } from "./lifecycle";
import { withTransientRetry } from "./retry";
import { fileSessionStore, sessionsPath, type SessionEntry, type SessionStore } from "./sessions";
import { agentStatePath, loadAgentState, webPidPath } from "./state";

/** The Session API surface the chat routes use. Tests pass a fake with the same surface. */
export type ChatClient = Pick<
  ZooworkClient,
  | "createSession"
  | "getSession"
  | "postEvents"
  | "streamEvents"
  | "archiveSession"
  | "deleteSession"
  | "listApprovals"
  | "resolveApproval"
  | "listCustomToolCalls"
  | "getCustomToolCall"
  | "resolveCustomToolCall"
>;

export interface Runtime {
  client: ChatClient;
  agentId: string;
  instance: string;
  sessions: SessionStore;
  /** The passages each run received, for checking citations. */
  evidence: EvidenceStore;
  /** A message was sent: look for the Agent's searches more often for a while. */
  wakeSearch: () => void;
  /** Compares the deployed Agent with `agent/agent.md`. */
  checkAgent: () => Promise<{ definitionApplied: boolean; desiredState: string }>;
}

const KEY = Symbol.for("zoowork.knowledge-assistant.runtime");
type Holder = { [KEY]?: Promise<Runtime> };

/**
 * The server-side runtime, created on first use and kept for the life of the
 * process (Next.js dev reloads modules, so it lives on globalThis). A failed
 * creation is not cached: after `npm run setup`, the next request picks the
 * Agent up without restarting the server.
 */
export function getRuntime(): Promise<Runtime> {
  const holder = globalThis as Holder;
  if (!holder[KEY]) {
    holder[KEY] = createRuntime().catch((error) => {
      delete holder[KEY];
      throw error;
    });
  }
  return holder[KEY];
}

async function createRuntime(): Promise<Runtime> {
  // Calls that are safe to repeat are retried once on a network failure.
  const client = withTransientRetry(createZooworkClient({ apiKey: readApiKey() }));
  const cwd = process.cwd();
  const runtime = await createPlatformRuntime(client, cwd);
  const knowledge = await loadKnowledgeState(knowledgeStatePath(cwd));
  const worker = createSearchWorker({
    client,
    agentId: runtime.agentId,
    retriever: connectKnowledge(knowledge!.instanceId),
    evidence: runtime.evidence,
    ownsSession: async (id) => !!(await runtime.sessions.get(id)),
  });
  worker.start();
  return { ...runtime, wakeSearch: worker.wake };
}

/**
 * The Platform runtime for one recorded Agent. Exported with an injectable
 * client so tests can run the real code paths offline.
 */
export async function createPlatformRuntime(
  client: ChatClient & Pick<ZooworkClient, "getAgent">,
  cwd = process.cwd(),
): Promise<Runtime> {
  const statePath = agentStatePath(cwd);
  const state = await loadAgentState(statePath);
  if (!state) throw new AppError("run_setup_first", 503);
  if (!state.agentId) throw new AppError("agent_creation_uncertain_run_setup_again", 503);
  const knowledge = await loadKnowledgeState(knowledgeStatePath(cwd));
  if (!knowledge?.readyAt) throw new AppError("run_setup_first", 503);
  recordWebPid(cwd);
  const agentId = state.agentId;
  return {
    client,
    agentId,
    instance: state.instance,
    sessions: fileSessionStore(sessionsPath(cwd), { instance: state.instance, agentId }),
    evidence: fileEvidenceStore(evidencePath(cwd)),
    wakeSearch: () => {},
    // Read agent.json again on every check: a setup run in another terminal
    // may have recorded an update (or a lost one) since this server started.
    checkAgent: async () => {
      const current = await loadAgentState(statePath);
      if (!current || current.agentId !== agentId || current.instance !== state.instance) {
        throw new AppError("agent_changed_restart_dev", 503);
      }
      return agentStatus(client, current, loadAgentDefinition(cwd).resource);
    },
  };
}

function recordWebPid(cwd: string) {
  const path = webPidPath(cwd);
  try {
    writeFileSync(path, `${process.pid}\n`, { mode: 0o600 });
    process.once("exit", () => rmSync(path, { force: true }));
  } catch {
    // .local exists once setup ran; a failure here only weakens the cleanup guard.
  }
}

const SESSION_ID = /^[A-Za-z0-9_-]{4,128}$/;

/**
 * The authorization point for every session route: the Session must be one
 * this app created and recorded. In a multi-user deployment this is where the
 * lookup also checks the signed-in user.
 */
export async function ownedSession(runtime: Runtime, id: string): Promise<SessionEntry> {
  if (!SESSION_ID.test(id)) throw new AppError("session_not_found", 404);
  const entry = await runtime.sessions.get(id);
  if (!entry) throw new AppError("session_not_found", 404);
  return entry;
}
