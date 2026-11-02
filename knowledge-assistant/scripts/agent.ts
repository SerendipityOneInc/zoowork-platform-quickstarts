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
import { evidencePath, retireEvidence } from "../lib/knowledge/evidence";
import { knowledgeStatePath, loadKnowledgeState, prepareKnowledge, removeKnowledge } from "../lib/knowledge/setup";
import { loadAgentDefinition } from "../lib/zoowork/agent-definition";
import { readApiKey } from "../lib/zoowork/config";
import { errorCode, AppError } from "../lib/zoowork/errors";
import { agentStatus, applyAgent, cleanupAgent } from "../lib/zoowork/lifecycle";
import { withTransientRetry } from "../lib/zoowork/retry";
import { fileSessionStore, sessionsPath } from "../lib/zoowork/sessions";
import { agentStatePath, loadAgentState, runningWebPid, withStateLock } from "../lib/zoowork/state";

const NEXT_STEP: Record<string, string> = {
  cloudflare_credentials_required: "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .env. See the README.",
  cloudflare_http_400: "Cloudflare refused the request. An invalid CLOUDFLARE_API_TOKEN also looks like this, so check it first.",
  cloudflare_http_401: "Cloudflare rejected the token. Check CLOUDFLARE_API_TOKEN.",
  cloudflare_http_403: "The token cannot use AI Search on this account. It needs AI Search:Edit and AI Search:Run, on the account in CLOUDFLARE_ACCOUNT_ID.",
  cloudflare_http_404: "Cloudflare does not have the recorded instance. Check that .env and .local/ belong together.",
  cloudflare_http_429: "Cloudflare is rate limiting the requests. Wait a minute and run the command again.",
  cloudflare_invalid_response: "Cloudflare sent an unexpected answer. Run the command again; .local/ keeps the progress.",
  knowledge_indexing_failed: "Cloudflare could not index a document. Check the instance's Items tab in the Cloudflare dashboard.",
  knowledge_indexing_timeout: "Indexing did not finish in time. Run npm run setup again; it continues from here.",
  knowledge_not_searchable: "Indexing finished but the search does not answer yet. Run npm run setup again in a few minutes.",
  corpus_missing: "No Markdown documents found in corpus/.",
  platform_project_key_required: "Copy .env.example to .env and set ZOOWORK_API_KEY to your Platform Project key (zwp_live_).",
  run_setup_first: "Run npm run setup first.",
  state_scope_mismatch: "The conversations in .local/ belong to another Agent. Keep .local/ and check it was not copied from another checkout.",
  state_locked_review_before_retry: "Another setup or cleanup is running. If none is, delete .local/agent.json.lock and retry.",
  agent_label_mismatch: "The recorded Agent is not this app's. Check that .local/ and the key belong together.",
  http_401: "Check that ZOOWORK_API_KEY was copied correctly.",
  http_402: "The Organization needs billing set up and credits. Check Billing in Platform Console.",
  http_403: "Check the key's Project and permissions.",
  http_404: "The recorded resource was not found. Check the key's Project before deleting .local/.",
  request_failed: "Could not reach ZooWork Platform (network failure). Keep .local/ as it is, check your connection and run the command again.",
  timeout_or_cancelled: "ZooWork Platform did not answer in time. Keep .local/ as it is, check your connection and run the command again.",
  web_server_running: "Stop npm run dev, then run cleanup again.",
  cannot_remove_model: "Put model back in agent/agent.md, or run npm run cleanup then npm run setup to recreate the Agent.",
  cannot_remove_max_tokens: "Put max_tokens back in agent/agent.md, or run npm run cleanup then npm run setup to recreate the Agent.",
  cannot_remove_timezone: "Put timezone back in agent/agent.md, or run npm run cleanup then npm run setup to recreate the Agent.",
  skills_removed_set_empty_list: "Write skills: [] in agent/agent.md to remove all Skills, then run setup.",
  agent_update_not_confirmed: "The Agent does not show the update. Run npm run status, check model, Skill and tool names, and run setup again.",
  cleanup_incomplete_run_cleanup: "A cleanup stopped partway. Run npm run cleanup to finish it, then npm run setup.",
  session_creation_uncertain_retry_cleanup: "A conversation create could not be confirmed. Keep .local/, check the connection and key, and run cleanup again.",
};

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
      const stats = await connectKnowledge(knowledge.instanceId).stats();
      console.log(`Knowledge:  ${knowledge.instanceId}`);
      console.log(`Documents:  ${stats.completed} indexed, ${stats.queued + stats.running} waiting, ${stats.error} failed`);
      console.log(`Search:     ${knowledge.readyAt ? "ready" : "not ready; run npm run setup"}`);
    }
    if (!state) return;
    const report = await agentStatus(client, state, loadAgentDefinition().resource);
    console.log(`Agent:      ${report.agentId}`);
    console.log(`State:      ${report.desiredState}`);
    console.log(`Definition: ${report.definitionApplied ? "matches agent/agent.md" : "differs from agent/agent.md; run npm run setup"}`);
    if (report.unsupportedRemoval) console.log(`Note:       ${NEXT_STEP[report.unsupportedRemoval]}`);
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
    if (state) {
      const sessions = fileSessionStore(sessionsPath(), { instance: state.instance, agentId: state.agentId ?? "" });
      const { sessionsDeleted } = await cleanupAgent(client, path, state, sessions);
      console.log(`Deleted ${sessionsDeleted} conversation(s), then stopped and deleted Agent ${state.agentId}.`);
    }
    if (recorded) {
      await removeKnowledge(connectKnowledge(recorded.instanceId), knowledgePath, recorded);
      await retireEvidence(evidencePath(), recorded.instanceId);
      console.log(`Deleted AI Search instance ${recorded.instanceId}.`);
    }
    console.log("Run npm run setup to start again.");
  });
}

main(process.argv[2]).catch((error: unknown) => {
  const code = errorCode(error);
  const head = code.split(":")[0]!;
  console.error(`FAIL: ${code}`);
  if (error instanceof AppError && head === "invalid_agent_definition") console.error("Fix agent/agent.md and run the command again.");
  else if (NEXT_STEP[head]) console.error(NEXT_STEP[head]);
  else console.error("Check .env and keep .local/ as it is while investigating.");
  process.exitCode = 1;
});
