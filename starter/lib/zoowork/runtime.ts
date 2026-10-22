import { rmSync, writeFileSync } from "node:fs";
import type { ZooworkClient } from "@zoowork-ai/sdk";
import { appConfig } from "@/app.config";
import { loadAgentDefinition } from "./agent-definition";
import { createPlatformClient } from "./client";
import { isPreview, readPlatformConfig } from "./config";
import { StarterError } from "./errors";
import { agentStatus } from "./lifecycle";
import { createPreviewPlatform } from "./preview";
import { fileSessionStore, memorySessionStore, sessionsPath, type SessionEntry, type SessionStore } from "./sessions";
import { agentStatePath, loadAgentState, webPidPath, type AgentState } from "./state";

/** The Session API surface the chat routes use. The preview implements the same surface. */
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
>;

export interface Runtime {
  mode: "platform" | "preview";
  client: ChatClient;
  agentId: string;
  instance: string;
  sessions: SessionStore;
  /** Platform mode only: compares the deployed Agent with `agent/agent.md`. */
  checkAgent?: () => Promise<{ definitionApplied: boolean; desiredState: string }>;
}

const KEY = Symbol.for("zoowork.starter.runtime");
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
  if (isPreview()) {
    return {
      mode: "preview",
      client: createPreviewPlatform({ productName: appConfig.name }),
      agentId: "agt_preview",
      instance: "preview",
      sessions: memorySessionStore(),
    };
  }
  const config = readPlatformConfig();
  const state = await loadAgentState(agentStatePath(), config.baseUrl);
  if (!state) throw new StarterError("run_setup_first", 503);
  if (!state.agentId) throw new StarterError("agent_creation_uncertain_run_setup_again", 503);
  const client = createPlatformClient(config);
  recordWebPid();
  const agentId = state.agentId;
  return {
    mode: "platform",
    client,
    agentId,
    instance: state.instance,
    sessions: fileSessionStore(sessionsPath(), { instance: state.instance, agentId }),
    checkAgent: () => agentStatus(client, state as AgentState, loadAgentDefinition().resource),
  };
}

function recordWebPid() {
  const path = webPidPath();
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
  if (!SESSION_ID.test(id)) throw new StarterError("session_not_found", 404);
  const entry = await runtime.sessions.get(id);
  if (!entry) throw new StarterError("session_not_found", 404);
  return entry;
}
