// npm run eval
//
// Ask the fixed questions in eval/questions.json through the real Agent and
// search, score each answer by plain rules, and exit non-zero on any failure.
// This makes model and search calls that use credits. Stop npm run dev first.
//
// Output never includes a key or token. Each Session is deleted after its
// question; npm run eval or npm run cleanup removes any left by a crash.

import { rm } from "node:fs/promises";
import { createZooworkClient } from "@zoowork-ai/sdk";
import { connectKnowledge, readCloudflareConfig } from "../lib/knowledge/cloudflare";
import { loadCorpus } from "../lib/knowledge/corpus";
import { evalEvidencePath, evalPreflight, evalStores, formatSummary, loadQuestions, runEval } from "../lib/knowledge/eval";
import { knowledgeStatePath, loadKnowledgeState } from "../lib/knowledge/setup";
import { createSearchWorker } from "../lib/knowledge/worker";
import { readApiKey } from "../lib/zoowork/config";
import { AppError, errorCode } from "../lib/zoowork/errors";
import { withTransientRetry } from "../lib/zoowork/retry";
import { agentStatePath, withStateLock } from "../lib/zoowork/state";
import { nextStep } from "./next-step";

async function main() {
  const questions = loadQuestions(loadCorpus());
  const config = readCloudflareConfig();
  const client = withTransientRetry(createZooworkClient({ apiKey: readApiKey() }));
  // Ctrl+C stops after the current question, so its Session is deleted and the lock released.
  const stop = new AbortController();
  process.once("SIGINT", () => stop.abort());

  await withStateLock(agentStatePath(), async () => {
    const { agentId, instance } = await evalPreflight(client);
    const knowledge = await loadKnowledgeState(knowledgeStatePath());
    if (!knowledge?.readyAt) throw new AppError("run_setup_first");
    const stores = evalStores({ instance, agentId });
    const worker = createSearchWorker({
      client,
      agentId,
      retriever: connectKnowledge(knowledge.instanceId, config),
      evidence: stores.evidence,
      ownsSession: async (id) => !!(await stores.sessions.get(id)),
    });
    console.log(`Asking ${questions.length} questions. This uses model and search credits.`);
    const results = await runEval(
      { ...stores, client, agentId, instance, worker, signal: stop.signal, log: (line) => console.log(line) },
      questions,
    );
    await rm(evalEvidencePath(), { force: true });
    console.log(formatSummary(results, questions.length));
    if (results.length < questions.length || results.some((r) => !r.pass)) process.exitCode = 1;
  });
}

main().catch((error: unknown) => {
  const code = errorCode(error);
  console.error(`FAIL: ${code}`);
  console.error(nextStep(code));
  process.exitCode = 1;
});
