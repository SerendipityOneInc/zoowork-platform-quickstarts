import assert from "node:assert/strict";
import { test } from "node:test";
import { nextStep } from "../scripts/next-step";

test("every Cloudflare server error says to try again, not to check the settings", () => {
  for (const code of ["cloudflare_http_500", "cloudflare_http_502", "cloudflare_http_503"]) {
    assert.match(nextStep(code), /Cloudflare's side/);
  }
});

test("a code with details finds its advice", () => {
  assert.match(nextStep("knowledge_indexing_failed: a.md (file_content_empty)"), /corpus\//);
  assert.match(nextStep("invalid_agent_definition: bad"), /agent\/agent\.md/);
});

test("a stopped setup explains what is left, and a missing index how to rebuild it", () => {
  assert.match(nextStep("agent_creation_uncertain_run_setup_again"), /npm run setup/);
  assert.match(nextStep("knowledge_index_missing"), /\.local\/knowledge\.json/);
  assert.match(nextStep("cloudflare_unreachable"), /Cloudflare/);
});

test("eval failures say what to do", () => {
  assert.match(nextStep("web_server_running"), /Stop npm run dev/);
  assert.match(nextStep("invalid_eval_question:gantt-charts"), /eval\/questions\.json/);
  assert.match(nextStep("agent_definition_changed"), /npm run setup/);
  assert.match(nextStep("agent_not_running"), /npm run setup/);
});

test("an unknown code keeps .local/", () => {
  assert.match(nextStep("something_new"), /keep \.local/);
});
