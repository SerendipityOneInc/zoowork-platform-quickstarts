import assert from "node:assert/strict";
import { test } from "node:test";
import { connectKnowledge, MAX_PASSAGES, readCloudflareConfig, toPassages } from "../lib/knowledge/cloudflare";
import { searchTool } from "../lib/knowledge/search-tool";

const config = { accountId: "acc", apiToken: "secret-token" };

/** The shape AI Search returned in a live run, with scoring details. */
const searchBody = {
  success: true,
  result: {
    query_kind: "text",
    search_query: "how long do export links last",
    chunks: [
      {
        id: "9aaae75f",
        type: "text",
        score: 1,
        text: "# Export links\n\nExport links expire after 24 hours.",
        item: { key: "exports/export-links.md", timestamp: 1793618220000, metadata: { chunk_modality: "text" } },
        scoring_details: { vector_score: 0.81, keyword_score: 0.83, vector_rank: 1, keyword_rank: 1, fusion_method: "rrf" },
      },
      {
        id: "0d26aad0",
        type: "text",
        score: 0.984,
        text: "Invite links for new members expire after 7 days.",
        item: { key: "teams/invite-members.md", timestamp: 1793618220000, metadata: { chunk_modality: "text" } },
        scoring_details: { vector_score: 0.586, keyword_score: 0, vector_rank: 2, keyword_rank: 2, fusion_method: "rrf" },
      },
    ],
    hybrid_meta: { search_methods: ["vector", "keyword"], vector_result_count: 2, keyword_result_count: 2 },
  },
};

function fakeFetch(answers: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = answers.shift();
    if (!next) throw new Error("no more answers");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test("search results map to passages with the document key to cite", () => {
  assert.deepEqual(toPassages(searchBody), [
    { key: "exports/export-links.md", title: "Export links", text: searchBody.result.chunks[0]!.text, score: 1 },
    { key: "teams/invite-members.md", title: "Invite members", text: searchBody.result.chunks[1]!.text, score: 0.984 },
  ]);
});

test("no chunks is an empty result; a malformed answer is a failure", () => {
  assert.deepEqual(toPassages({ result: { chunks: [] } }), []);
  assert.throws(() => toPassages({ result: {} }), /cloudflare_invalid_response/);
  assert.throws(() => toPassages(null), /cloudflare_invalid_response/);
});

test("chunks without text or a key are dropped, and the result is capped", () => {
  const chunk = { text: "x", score: 1, item: { key: "a.md" } };
  const body = { result: { chunks: [{ text: "", item: { key: "a.md" } }, { text: "x" }, ...Array(20).fill(chunk)] } };
  assert.equal(toPassages(body).length, MAX_PASSAGES);
});

test("search sends the query and the token, and retries a server error once", async () => {
  const { impl, calls } = fakeFetch([new Response("boom", { status: 500 }), json(searchBody)]);
  const passages = await connectKnowledge("kb", config, impl, 0).search("export links");
  assert.equal(passages.length, 2);
  assert.equal(calls.length, 2);
  assert.match(calls[0]!.url, /\/accounts\/acc\/ai-search\/namespaces\/default\/instances\/kb\/search$/);
  assert.deepEqual(JSON.parse(calls[0]!.init.body as string), {
    messages: [{ role: "user", content: "export links" }],
    ai_search_options: {
      reranking: { enabled: true, model: "@cf/baai/bge-reranker-base", match_threshold: 0 },
    },
  });
  assert.equal((calls[0]!.init.headers as Record<string, string>).authorization, "Bearer secret-token");
});

test("a network failure is retried once, then reported as Cloudflare's, not the Platform's", async () => {
  const { impl, calls } = fakeFetch([new TypeError("fetch failed"), new TypeError("fetch failed")]);
  await assert.rejects(connectKnowledge("kb", config, impl, 0).search("q"), /cloudflare_unreachable/);
  assert.equal(calls.length, 2);
});

test("a timeout is retried once, then reported with its own code", async () => {
  const timeout = () => Object.assign(new Error("timed out"), { name: "TimeoutError" });
  const { impl, calls } = fakeFetch([timeout(), timeout()]);
  await assert.rejects(connectKnowledge("kb", config, impl, 0).search("q"), /cloudflare_timeout/);
  assert.equal(calls.length, 2);
});

test("a refused request is not retried, and errors carry only a status code", async () => {
  const { impl, calls } = fakeFetch([new Response("token secret-token is invalid", { status: 401 })]);
  await assert.rejects(connectKnowledge("kb", config, impl, 0).search("q"), (error: Error) => {
    assert.equal(error.message, "cloudflare_http_401");
    return true;
  });
  assert.equal(calls.length, 1);
});

test("exists tells a missing instance from a failed check", async () => {
  assert.equal(await connectKnowledge("kb", config, fakeFetch([json({ result: { id: "kb" } })]).impl).exists(), true);
  assert.equal(await connectKnowledge("kb", config, fakeFetch([new Response("", { status: 404 })]).impl).exists(), false);
  const refused = fakeFetch([new Response("", { status: 403 })]);
  await assert.rejects(connectKnowledge("kb", config, refused.impl).exists(), /cloudflare_http_403/);
});

test("create turns the similarity cache off", async () => {
  const { impl, calls } = fakeFetch([json({ result: { id: "kb" } }, 201)]);
  await connectKnowledge("kb", config, impl).create();
  assert.equal(calls[0]!.init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0]!.init.body as string), { id: "kb", cache: false });
});

test("create accepts a name a lost response already created", async () => {
  await connectKnowledge("kb", config, fakeFetch([new Response("", { status: 409 })]).impl).create();
});

test("destroy says whether the instance was there", async () => {
  assert.equal(await connectKnowledge("kb", config, fakeFetch([json({ result: {} })]).impl).destroy(), true);
  assert.equal(await connectKnowledge("kb", config, fakeFetch([new Response("", { status: 404 })]).impl).destroy(), false);
});

test("documents maps each item status, including one setup must not wait for", async () => {
  const items = [
    { id: "1", key: "ready.md", status: "completed", error: null },
    { id: "2", key: "queued.md", status: "queued", error: null },
    { id: "3", key: "running.md", status: "running", error: null },
    { id: "4", key: "outdated.md", status: "outdated", error: null },
    { id: "5", key: "empty.md", status: "error", error: "file_content_empty" },
    { id: "6", key: "skipped.md", status: "skipped", error: null },
  ];
  const { impl, calls } = fakeFetch([json({ result: items, result_info: { total_count: 6 } })]);
  assert.deepEqual(await connectKnowledge("kb", config, impl).documents(), [
    { key: "ready.md", state: "ready" },
    { key: "queued.md", state: "pending" },
    { key: "running.md", state: "pending" },
    { key: "outdated.md", state: "pending" },
    { key: "empty.md", state: "failed", reason: "file_content_empty" },
    { key: "skipped.md", state: "failed", reason: "skipped" },
  ]);
  assert.match(calls[0]!.url, /\/items\?page=1&per_page=50$/);
});

test("documents reads every page", async () => {
  const page = (start: number, count: number) =>
    Array.from({ length: count }, (_, i) => ({ id: `${start + i}`, key: `${start + i}.md`, status: "completed" }));
  const { impl, calls } = fakeFetch([json({ result: page(0, 50) }), json({ result: page(50, 3) })]);
  assert.equal((await connectKnowledge("kb", config, impl).documents()).length, 53);
  assert.equal(calls.length, 2);
});

test("documents retries a passing failure, so a long wait survives one bad read", async () => {
  const { impl, calls } = fakeFetch([new Response("", { status: 502 }), json({ result: [] })]);
  assert.deepEqual(await connectKnowledge("kb", config, impl, 0).documents(), []);
  assert.equal(calls.length, 2);
});

test("a chunk's title comes from its document heading, or else from the file name", () => {
  const title = (text: string, key = "billing/annual-refunds.md") =>
    toPassages({ result: { chunks: [{ text, item: { key } }] } })[0]!.title;
  assert.equal(title("# Refunds\n\nWithin 30 days."), "Refunds");
  assert.equal(title("Later text\n\n### Step 2\n\nMore."), "Annual refunds");
  assert.equal(title("```sh\n# a comment\n```"), "Annual refunds");
});

test("upload sends the document key as the file name", async () => {
  const { impl, calls } = fakeFetch([json({ result: { key: "billing/plans.md", status: "queued" } })]);
  await connectKnowledge("kb", config, impl).upload("billing/plans.md", "# Plans");
  assert.match(calls[0]!.url, /\/instances\/kb\/items$/);
  assert.equal(((calls[0]!.init.body as FormData).get("file") as File).name, "billing/plans.md");
});

test("removing a document looks it up by key, then deletes it by ID", async () => {
  const { impl, calls } = fakeFetch([json({ result: [{ id: "it1", key: "a.md" }] }), json({ result: {} })]);
  await connectKnowledge("kb", config, impl).removeDocument("a.md");
  assert.match(calls[0]!.url, /\/items\?key=a\.md$/);
  assert.equal(calls[1]!.init.method, "DELETE");
  assert.match(calls[1]!.url, /\/items\/it1$/);
});

test("the credentials are required, and the example values do not count", () => {
  assert.deepEqual(readCloudflareConfig({ CLOUDFLARE_ACCOUNT_ID: " acc ", CLOUDFLARE_API_TOKEN: " t " }), { accountId: "acc", apiToken: "t" });
  assert.throws(() => readCloudflareConfig({}), /cloudflare_credentials_required/);
  assert.throws(
    () => readCloudflareConfig({ CLOUDFLARE_ACCOUNT_ID: "acc", CLOUDFLARE_API_TOKEN: "replace_with_your_cloudflare_api_token" }),
    /cloudflare_credentials_required/,
  );
  assert.throws(
    () => readCloudflareConfig({ CLOUDFLARE_ACCOUNT_ID: "replace_with_your_cloudflare_account_id", CLOUDFLARE_API_TOKEN: "t" }),
    /cloudflare_credentials_required/,
  );
});

test("the Agent waits longer for a search than a search with its retry can take", () => {
  assert.ok(searchTool.timeoutMs! > 2 * 30_000 + 15_000 + 1_000);
});
