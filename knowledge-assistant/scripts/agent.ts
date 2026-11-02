// npm run setup | status | cleanup | models
//
// setup    create the AI Search instance, upload corpus/ and wait until it is
//          searchable, then create the Agent from agent/agent.md (or update it
//          after the file changed) and start it
// status   show the recorded Agent, whether it matches agent/agent.md, and
//          the state of the knowledge index
// cleanup  delete this app's recorded conversations, stop and delete its
//          Agent, then delete the AI Search instance (stop npm run dev first)
// models   list the models this key can use, for agent/agent.md's model:
//
// Output never includes a key or token. On failure the command prints a code from
// the README troubleshooting table and keeps .local/ for the next attempt.

import { createZooworkClient } from "@zoowork-ai/sdk";
import { connectKnowledge, newInstanceId, readCloudflareConfig } from "../lib/knowledge/cloudflare";
import { loadCorpus, PROBE } from "../lib/knowledge/corpus";
import { clearEvalState, evalStores } from "../lib/knowledge/eval";
import { evidencePath, retireEvidence } from "../lib/knowledge/evidence";
import {
  cleanupAll,
  knowledgeStatePath,
  knowledgeStatusLines,
  loadKnowledgeState,
  prepareKnowledge,
  removeKnowledge,
} from "../lib/knowledge/setup";
import { loadAgentDefinition } from "../lib/zoowork/agent-definition";
import { readApiKey } from "../lib/zoowork/config";
import { AppError, errorCode } from "../lib/zoowork/errors";
import { agentStatus, applyAgent, cleanupAgent } from "../lib/zoowork/lifecycle";
import { withTransientRetry } from "../lib/zoowork/retry";
import { fileSessionStore, sessionsPath } from "../lib/zoowork/sessions";
import { agentStatePath, loadAgentState, runningWebPid, withStateLock } from "../lib/zoowork/state";
import { nextStep } from "./next-step";

const list = (fields: string[]) => fields.map((f) => `"${f}"`).join(", ");

async function main(command: string | undefined) {
  if (!["setup", "status", "cleanup", "models"].includes(command ?? "")) {
    throw new AppError("expected_setup_status_cleanup_or_models");
  }
  // Reads and keyed creates are retried once on a network failure; updates are not.
  const client = withTransientRetry(createZooworkClient({ apiKey: readApiKey() }));

  if (command === "models") {
    const models = await client.listModels();
    for (const m of models) {
      if (m.selectable === false) continue;
      const levels = m.thinking?.levels?.length ? `  thinking: ${m.thinking.levels.join(", ")}` : "";
      console.log(`${m.model}${m.display_name ? `  (${m.display_name})` : ""}${levels}`);
    }
    return;
  }

  const path = agentStatePath();
  if (command === "status") {
    const state = await loadAgentState(path);
    const knowledge = await loadKnowledgeState(knowledgeStatePath());
    if (!state && !knowledge) throw new AppError("run_setup_first");
    if (knowledge) {
      for (const line of await knowledgeStatusLines(() => connectKnowledge(knowledge.instanceId), knowledge)) console.log(line);
    }
    if (!state) return;
    const report = await agentStatus(client, state, loadAgentDefinition().resource);
    console.log(`Agent:      ${report.agentId}`);
    console.log(`State:      ${report.desiredState}`);
    console.log(`Definition: ${report.definitionApplied ? "matches agent/agent.md" : "differs from agent/agent.md; run npm run setup"}`);
    if (report.unsupportedRemoval) console.log(`Note:       ${nextStep(report.unsupportedRemoval)}`);
    if (report.undeclaredPolicy.length) {
      console.log(`Note:       The Agent's tool policy has ${list(report.undeclaredPolicy)}, which agent/agent.md does not declare.`);
      console.log("            npm run setup will remove it. To keep an approval, add it under permissions: in agent/agent.md.");
    }
    return;
  }

  await withStateLock(path, async () => {
    const state = await loadAgentState(path);
    const knowledgePath = knowledgeStatePath();
    const recorded = await loadKnowledgeState(knowledgePath);
    if (command === "setup") {
      if (state?.agentDeleteRequestedAt || state?.agentDeletedAt) throw new AppError("cleanup_incomplete_run_cleanup");
      const definition = loadAgentDefinition();
      readCloudflareConfig();
      const knowledge = recorded ?? { version: 1 as const, instanceId: newInstanceId(), uploaded: {} };
      const started = Date.now();
      const { changed } = await prepareKnowledge(connectKnowledge(knowledge.instanceId), knowledgePath, knowledge, loadCorpus(), PROBE, {
        log: (line) => console.log(line),
      });
      console.log(
        changed
          ? `Knowledge ready in ${Math.round((Date.now() - started) / 1000)}s: ${knowledge.instanceId}`
          : `Knowledge already matches corpus/: ${knowledge.instanceId}`,
      );
      const result = await applyAgent(client, path, state, definition.resource, {
        onReplacePolicy: (fields) => {
          console.warn(`WARNING: The Agent's tool policy has ${list(fields)}, which agent/agent.md does not declare.`);
          console.warn("         This update replaces the whole tool policy and removes it. To keep an approval,");
          console.warn("         add it under permissions: in agent/agent.md and run npm run setup again.");
        },
      });
      const verb = { created: "created", updated: "updated from agent/agent.md", unchanged: "already matches agent/agent.md" }[result.action];
      console.log(`Agent ${verb}: ${result.agentId}`);
      console.log("Agent ready. Run npm run dev and open the URL it prints (http://localhost:3000 unless that port is in use).");
      return;
    }
    if (!state && !recorded) throw new AppError("run_setup_first");
    const pid = await runningWebPid();
    if (pid) throw new AppError("web_server_running");
    await cleanupAll({
      ...(state && {
        agent: async () => {
          const scope = { instance: state.instance, agentId: state.agentId ?? "" };
          const sessions = fileSessionStore(sessionsPath(), scope);
          const { sessionsDeleted } = await cleanupAgent(client, path, state, sessions, () =>
            clearEvalState({ ...evalStores(scope), client, agentId: scope.agentId }, state.instance),
          );
          console.log(`Deleted ${sessionsDeleted} conversation(s), then stopped and deleted Agent ${state.agentId}.`);
        },
      }),
      evidence: () => retireEvidence(evidencePath(), recorded?.instanceId ?? "knowledge"),
      ...(recorded && {
        knowledge: async () => {
          await removeKnowledge(connectKnowledge(recorded.instanceId), knowledgePath, recorded);
          console.log(`Deleted AI Search instance ${recorded.instanceId}.`);
        },
      }),
    });
    console.log("Run npm run setup to start again.");
  });
}

main(process.argv[2]).catch((error: unknown) => {
  const code = errorCode(error);
  console.error(`FAIL: ${code}`);
  console.error(nextStep(code));
  process.exitCode = 1;
});
