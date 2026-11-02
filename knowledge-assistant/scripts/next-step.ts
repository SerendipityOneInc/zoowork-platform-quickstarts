// What `npm run setup | status | cleanup` prints after each failure code.

export const NEXT_STEP: Record<string, string> = {
  cloudflare_credentials_required: "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .env. See the README.",
  cloudflare_http_400: "Cloudflare refused the request. An invalid CLOUDFLARE_API_TOKEN also looks like this, so check it first.",
  cloudflare_http_401: "Cloudflare rejected the token. Check CLOUDFLARE_API_TOKEN.",
  cloudflare_http_403: "The token cannot use AI Search on this account. It needs AI Search:Edit and AI Search:Run, on the account in CLOUDFLARE_ACCOUNT_ID.",
  cloudflare_http_404: "Cloudflare does not have the recorded instance. Check that .env and .local/ belong together.",
  cloudflare_http_429: "Cloudflare is rate limiting the requests. Wait a minute and run the command again.",
  cloudflare_unreachable: "Could not reach Cloudflare (network failure). Keep .local/ as it is, check your connection and run the command again.",
  cloudflare_timeout: "Cloudflare did not answer in time. Keep .local/ as it is and run the command again.",
  cloudflare_invalid_response: "Cloudflare sent an unexpected answer. Run the command again; .local/ keeps the progress.",
  knowledge_index_missing: "The recorded search index is not there. If .env changed, restore it. If the index was deleted, delete .local/knowledge.json and run npm run setup to build a new one.",
  knowledge_indexing_failed: "The named documents could not be indexed. Fix or remove them in corpus/ and run npm run setup, which uploads them again. A temporary failure needs no fix.",
  knowledge_probe_not_in_corpus: "PROBE in lib/knowledge/corpus.ts names a document that is not in corpus/. Change it to a question your documents answer.",
  knowledge_indexing_timeout: "Indexing did not finish in time. Run npm run setup again; it continues from here.",
  knowledge_not_searchable: "Indexing finished but the search does not answer yet. Run npm run setup again in a few minutes.",
  corpus_missing: "No Markdown documents found in corpus/.",
  platform_project_key_required: "Copy .env.example to .env and set ZOOWORK_API_KEY to your Platform Project key (zwp_live_).",
  run_setup_first: "Run npm run setup first.",
  agent_creation_uncertain_run_setup_again: "Setup stopped before the Agent was confirmed. If it failed with an error such as http_402, nothing else is left to clean up. Otherwise run npm run setup to finish it, then npm run cleanup.",
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

/** What to do about a failure code. */
export function nextStep(code: string): string {
  const head = code.split(":")[0]!;
  if (head === "invalid_agent_definition") return "Fix agent/agent.md and run the command again.";
  if (/^cloudflare_http_5\d\d$/.test(head)) return "A problem on Cloudflare's side. Run the command again; .local/ keeps the progress.";
  return NEXT_STEP[head] ?? "Check .env and keep .local/ as it is while investigating.";
}
