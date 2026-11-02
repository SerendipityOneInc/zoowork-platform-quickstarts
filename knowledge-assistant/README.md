# Knowledge Assistant

A chat app that answers questions from your documents and shows where each answer came from.
The Agent runs on ZooWork Platform. The documents are searched by a knowledge service that your
app calls: here [Cloudflare AI Search](https://developers.cloudflare.com/ai-search/), behind one
small interface you can replace with your own RAG.

The sample documents describe **Fernwick**, a fictional project tracker. Ask something, and the
Agent searches the docs, answers, and cites them. Open a source to read the passage it used. Ask
something the docs do not cover, and it says so instead of guessing.

It is a minimal integration. It has **no end-user sign-in, no per-user limits and no public
deployment setup**, and it only answers on `localhost`. See [Before you go public](#before-you-go-public).

## Requirements

- Node.js **22.20 or later** (`engines` in `package.json`) and npm. The repository pins
  24.22.1 in `.node-version`; `fnm use` or `nvm use` picks it up.
- A ZooWork Platform **Project key** (`zwp_live_…`) and Organization credits.
- A **Cloudflare account** with an API token. Unlike the other examples in this repository, this
  app needs a second account, because Cloudflare hosts the search.

## 1. Get your keys

**ZooWork.** Sign in to [Platform Console](https://platform.zoowork.ai), select a Project, open
**API Keys** and create a key. It starts with `zwp_live_`. Check **Billing**: every reply uses
credits.

**Cloudflare.** In the [Cloudflare dashboard](https://dash.cloudflare.com/profile/api-tokens), go
to **My Profile > API Tokens > Create Token > Create Custom Token** and add two permissions:

- **Account > AI Search:Edit**
- **Account > AI Search:Run**

Copy the token. Your Account ID is on the account's home page in the dashboard.

Each account includes a monthly amount of AI Search usage. **Usage beyond that is billed by
Cloudflare**, separately from your ZooWork credits. See
[AI Search limits and pricing](https://developers.cloudflare.com/ai-search/platform/limits-pricing/)
for the current amounts.

## 2. Configure the server

```sh
git clone https://github.com/SerendipityOneInc/zoowork-platform-quickstarts.git
cd zoowork-platform-quickstarts/knowledge-assistant
npm ci
cp .env.example .env
```

Edit `.env`:

```dotenv
ZOOWORK_API_KEY=zwp_live_your_project_key
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
```

All three stay in the server process. Never paste them into a chat, browser code, a screenshot, a
log or Git; `.env` is ignored by Git.

## 3. Set up

```sh
npm run setup
```

Setup takes a few minutes the first time (about three and a half when this was written):

1. It creates an AI Search instance with a new name such as `knowledge-assistant-29604a28`.
2. It uploads the 20 documents in `corpus/`.
3. It waits until they are indexed, printing progress, and until a test question finds the right
   document.
4. It creates and starts the Agent from `agent/agent.md`.

Running setup again changes only what changed. If it stops partway, run it again; it continues
where it stopped. You never copy an ID anywhere: setup records them in `.local/`.

## 4. Chat

```sh
npm run dev
# or, if port 3000 is in use:
npm run dev -- --port 3001
```

Open the URL `npm run dev` prints (**http://localhost:3000** by default) and try these:

- **"How long do export links last?"** A direct answer, with `[1]` in the text and
  `exports/export-links.md` under **Sources**. Open it to read the passage.
- **"Can I get my money back on a yearly plan?"** The document says "Annual plans are refundable",
  with almost none of the same words. The search matches on meaning as well as keywords, so it
  still finds `billing/refunds.md`.
- **"Does Fernwick have a Gantt chart view?"** The docs do not say, so the Agent replies that they
  do not cover it, and no source appears.

Replies arrive as whole messages, with search activity shown live. Close the tab during a reply
and the run still finishes: the server answers the Agent's searches, and the reply is there when
you come back.

## How sources work

The model writes citations as text, so this app checks them. For each run, the server records the
passages the search returned. When a reply cites a document, the server looks it up in that record:

| What the reply cites | What you see |
| --- | --- |
| A document this run's search returned | A number in the text, and the document under **Sources** with the real passage |
| Anything else | `[unverified source]` in the text, a warning under the reply, and no source |
| Nothing | "No sources: this reply does not cite the docs." |

The check is per run. A follow-up question has to search again to cite something, which is why the
Agent's instructions tell it to.

Passages that the search returned but the reply did not cite are not shown. A question about this
product can still return passages that do not answer it, because they are about the same product.
The search only drops clear misses, and the Agent decides whether the passages answer the question.

A failed search is a failure, not an empty result. The Agent is told the search failed and replies
that it cannot answer, and the page shows the error code in red. "Nothing found" and "the service
is down" never look the same.

## Use your own RAG

Everything that talks to Cloudflare is in one file, `lib/knowledge/cloudflare.ts`. The rest of the
app uses this interface from `lib/knowledge/retriever.ts`:

```ts
export type Passage = { key: string; title: string; text: string; score: number };

export interface Retriever {
  search(query: string): Promise<Passage[]>;
}
```

`key` is the stable document ID the Agent cites. Return an empty list for no results and throw on
failure, so the two stay different.

To replace Cloudflare with a service that already has your documents:

1. Add your implementation, for example `lib/knowledge/my-retriever.ts`:

   ```ts
   import type { Retriever } from "./retriever";

   export const myRetriever: Retriever = {
     async search(query) {
       const hits = await searchMyService(query);
       return hits.map((hit) => ({ key: hit.id, title: hit.title, text: hit.text, score: hit.score }));
     },
   };
   ```

2. In `lib/zoowork/runtime.ts`, in `createRuntime()`, replace the `config` line and the
   `createPlatformRuntime` line with `const runtime = await createPlatformRuntime(client, process.cwd());`,
   and replace `connectKnowledge(knowledgeInstanceId, config)` with `myRetriever`. In
   `createPlatformRuntime()`, remove the `knowledge` lines and `knowledgeInstanceId`, change its return
   type to `Promise<Runtime>`, and remove the imports that are now unused.
3. In `scripts/agent.ts`, remove the `prepareKnowledge` step from setup and the `knowledge` parts of
   `status`. In `cleanup`, replace the `cleanupAll({ ... })` call with the body of its `agent` step,
   inside `if (state) { ... }`. Remove the imports that are now unused.
4. Delete `lib/knowledge/cloudflare.ts`, `corpus.ts` and `setup.ts`, their tests
   (`test/cloudflare.test.ts`, `test/corpus.test.ts`, `test/knowledge-setup.test.ts`), the
   `corpus/` directory, and the `CLOUDFLARE_*` lines in `.env`. In `test/runtime.test.ts`, remove
   the two lines that use `saveKnowledgeState` and the test named "missing Cloudflare settings…".
   The `cloudflare_*` messages in `scripts/next-step.ts` and `lib/chat/notices.ts` can go too.
5. Update `agent/agent.md` and `app.config.ts` for your product, then run `npm run setup`.

The search worker, the citation check, the sources panel and the Agent's tool stay the same.

To keep `npm run setup` uploading documents to another service, implement `KnowledgeIndex` from
`lib/knowledge/retriever.ts` as well, and pass it where `scripts/agent.ts` calls `connectKnowledge`.
`destroy()` returns `false` if the index is not there. A failure whose code ends in `_http_4xx` means
the service refused and nothing changed; cleanup treats any other failure as "it may have worked".

To keep Cloudflare and use your own documents, replace the files in `corpus/` instead, change
`PROBE` in `lib/knowledge/corpus.ts` to a question they answer, and run `npm run setup`. It uploads
new and changed files and removes deleted ones. The document's path under `corpus/` is its key.

## Make it yours

| Change | Where |
| --- | --- |
| The documents | `corpus/`, and `PROBE` in `lib/knowledge/corpus.ts` |
| What the Agent does and how it cites | `agent/agent.md` (then `npm run setup`) |
| The search tool's description | `lib/knowledge/search-tool.ts` (then `npm run setup`) |
| Product name, greeting, starter prompts, brand color, footnote | `app.config.ts` |
| The sources panel | `components/message-sources.tsx` |

`agent/agent.md` uses the same keys as the [Starter](../starter/README.md#3-define-your-agent),
and `tools` must include `search_knowledge`. `app.config.ts` is sent to the browser. Never put keys
or private data in it.

AI Search's default settings are used for retrieval: hybrid search, keyword terms all required, and
a minimum vector score of 0.4. Each search also turns on reranking with `@cf/baai/bge-reranker-base`,
which puts the best passage first and drops passages scoring below 0.01. Reranking adds some time to
each search. No score reliably tells whether the docs answer a question, so don't use a higher
minimum for that. The similarity cache is off, because it stores answers it generates, and this app
only uses search. To tune retrieval, see
[AI Search configuration](https://developers.cloudflare.com/ai-search/configuration/). Content in
Chinese, Japanese or Korean needs the `trigram` tokenizer, set when the instance is created in
`create()`.

## Before you go public

This app is a local, single-user development app. Before anyone else can reach it, add these.
Every visitor's message runs your Agent and **uses your Organization's prepaid credits**, and every
search counts towards your Cloudflare usage.

1. **End-user authentication.** The keys authorize your server, not your users. Sign users in with
   your own auth.
2. **Document access.** Every search here sees the whole corpus. If users must see different
   documents, apply that in your `Retriever` using the signed-in user from your server, never a
   user ID the model supplies. AI Search offers
   [one instance per tenant, or metadata filtering](https://developers.cloudflare.com/ai-search/how-to/per-tenant-search/).
3. **Session ownership.** Store which user owns each Session in your database and check it on every
   route that takes a Session ID. `ownedSession()` in `lib/zoowork/runtime.ts` is where that check goes.
4. **Per-user limits and abuse protection.** Without them, one visitor can spend your balance.
5. **Treat documents as untrusted input** if anyone but you can write them. A passage goes to the
   model, and the Agent's instructions alone cannot stop every prompt injection.
6. **Remove the local-only guard deliberately.** `guard()` in `lib/zoowork/http.ts` refuses any
   host other than `localhost`. Remove it only after 1 to 5 are in place.

## Clean up

```sh
# Stop npm run dev first.
npm run cleanup
```

Cleanup deletes the conversations this app recorded, stops and deletes its Agent, then deletes the
AI Search instance with its indexed documents. It only touches IDs in `.local/`. If anything fails,
it keeps `.local/` so you can run it again. The next `npm run setup` creates new resources.

## Troubleshooting

Errors print a stable code and never a key, a token or a provider response body.

| Code | What to do |
| --- | --- |
| `platform_project_key_required` | Set `ZOOWORK_API_KEY` in `.env` to a `zwp_live_` Project key. Restart `npm run dev`. |
| `cloudflare_credentials_required` | Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in `.env`. Restart `npm run dev`. |
| `cloudflare_http_400` | Cloudflare refused the request. An invalid token also returns this, so check `CLOUDFLARE_API_TOKEN` first. |
| `cloudflare_http_401` / `cloudflare_http_403` | Check the token, that it has **AI Search:Edit** and **AI Search:Run**, and that `CLOUDFLARE_ACCOUNT_ID` is the right account. |
| `cloudflare_http_404` | Cloudflare does not have something the app recorded. Check that `.env` and `.local/` belong together. Do not delete `.local/`. |
| `cloudflare_http_429` | Rate limited. Wait a minute and try again. |
| `cloudflare_http_5xx` / `cloudflare_invalid_response` | A problem on Cloudflare's side. Searches are retried once. Run the command again; `.local/` keeps the progress. |
| `cloudflare_unreachable` / `cloudflare_timeout` | The server could not get an answer from Cloudflare. Check your connection and try again. |
| `knowledge_index_missing` | The recorded instance is not on this account. If `.env` changed, restore it. If the instance was deleted, delete only `.local/knowledge.json` and run `npm run setup` to build a new one, then restart `npm run dev`. |
| `knowledge_indexing_timeout` | Indexing took more than ten minutes. Run `npm run setup` again to keep waiting. |
| `knowledge_indexing_failed: <document> (<reason>)` | Cloudflare could not index that document, for example `file_content_empty`. Fix or remove it in `corpus/` and run `npm run setup`, which uploads it again. A temporary failure needs no fix. |
| `knowledge_probe_not_in_corpus` | `PROBE` in `lib/knowledge/corpus.ts` names a document that is not in `corpus/`. Change it to a question your documents answer. |
| `knowledge_not_searchable` | Indexing finished but the test question found nothing. Run setup again in a few minutes. If you changed `corpus/`, check that `PROBE` in `lib/knowledge/corpus.ts` is a question they answer. |
| `corpus_missing` | Put Markdown documents in `corpus/`. |
| `run_setup_first` | Run `npm run setup`, then reload the page. |
| `agent_creation_uncertain_run_setup_again` | Setup stopped before the Agent was confirmed. Cleanup still removes the AI Search instance. If setup failed with an error such as `http_402`, nothing else is left. Otherwise run `npm run setup` to finish it, then `npm run cleanup`. |
| `agent_changed_restart_dev` | `.local/` now records a different Agent than the running server uses. Restart `npm run dev`. |
| `invalid_agent_definition: …` | Fix the named problem in `agent/agent.md`, and keep `search_knowledge` in `tools`. |
| `agent_update_not_confirmed` | Run `npm run status`, check the changed values and run setup again. |
| `cleanup_incomplete_run_cleanup` | A cleanup stopped partway. Run `npm run cleanup` to finish it, then `npm run setup`. |
| `search_timeout` / `search_cancelled` | The Agent went on without that search, so the reply cannot cite it. Ask again. |
| `session_creation_uncertain_retry_cleanup` | A conversation create could not be confirmed. Keep `.local/`, check the connection and key, and run cleanup again. |
| `request_failed` / `timeout_or_cancelled` | The server could not reach ZooWork Platform. Check your connection and try again. |
| `http_401` / `http_403` | Check `ZOOWORK_API_KEY` and its Project. |
| `http_402` | Set up billing or add credits in Platform Console. |
| `http_400` during setup | Check billing and any `model` in `agent/agent.md`. Keep `.local/`. |
| `state_scope_mismatch` / `agent_label_mismatch` | `.local/` belongs to another key or Project. Restore the original `.env`. Do not delete `.local/`. |
| `state_locked_review_before_retry` | Another setup or cleanup is running. If none is, delete `.local/agent.json.lock`. |
| `web_server_running` | Stop `npm run dev` before `npm run cleanup`. |
| `local_only_add_authentication_first` | You opened the app through a host other than `localhost`. See [Before you go public](#before-you-go-public). |
| `EADDRINUSE` | Another process uses port 3000. Run `npm run dev -- --port 3001`. |

A question that appears to do nothing right after `npm run dev` starts: the page may not be ready.
Wait for the status pill to say "Agent ready", then click again.

## How it works

```text
browser                     this app's server                       ZooWork Platform
───────                     ─────────────────                       ────────────────
question  ── POST messages ───▶ postEvents(user.message) ─────────▶ run starts
                                                                    model calls search_knowledge
                                                                    run pauses
                                search worker ◀─ listCustomToolCalls ─┘
                                  │
                                  ├─ Retriever.search(query) ──▶ Cloudflare AI Search
                                  ├─ save passages for this run (.local/evidence.json)
                                  └─ resolveCustomToolCall ───────▶ run continues, model replies
reply     ◀─ stream (SSE) ───── relay ◀──────── streamEvents ─────┘
              with citations    checks citations against the saved passages
```

- **The server answers searches.** `lib/knowledge/worker.ts` starts with the server and polls for
  pending calls, often around a message and rarely otherwise, so a browser is never needed and a
  search left waiting by a restart is still answered. The result is saved before it is sent. If
  sending fails, the next pass sends the saved result and does not search again.
- **One check for live and replay.** `lib/knowledge/enrich.ts` adds the checked citations to each
  reply as the stream relay forwards it, so a reload shows the same thing.
- **The Agent can only search.** `tools` lists only `search_knowledge`, so it has no web access and
  no sandbox.

The chat itself comes from the [Starter](../starter/README.md#how-it-works): one event stream for
history and live updates, one pure reducer for every view, and idempotent sends.

| Path | Responsibility |
| --- | --- |
| `agent/agent.md` | The Agent definition |
| `corpus/` | The sample documents |
| `lib/knowledge/retriever.ts` | The `Retriever` and `KnowledgeIndex` interfaces |
| `lib/knowledge/cloudflare.ts` | Every Cloudflare call |
| `lib/knowledge/setup.ts`, `corpus.ts` | Upload, wait for indexing, delete |
| `lib/knowledge/worker.ts`, `search-tool.ts` | The tool declaration, and answering it on the server |
| `lib/knowledge/evidence.ts`, `citations.ts`, `enrich.ts` | What each run received, and checking citations against it |
| `lib/zoowork/`, `lib/chat/`, `app/api/` | Agent setup, Sessions and the chat, as in Starter |
| `components/message-sources.tsx`, `components/tool-uis/search-knowledge.tsx` | Sources under a reply, and the search card |
| `scripts/` | `setup` / `status` / `cleanup` / `models` |
| `test/` | Offline tests and the in-memory fakes they use |

## Checks

```sh
npm ci
npm run check
```

`check` runs the TypeScript check, the offline tests and a production build. It needs no key and
makes no network request to ZooWork or Cloudflare. The tests cover mapping real search responses,
citation checks, empty and failed searches, retries, resuming setup, and cleanup.

`npm run build` and `npm start` build and serve the app locally. They are not a deployment setup;
see [Before you go public](#before-you-go-public).

## Sources and licenses

The chat UI is built with [assistant-ui](https://www.assistant-ui.com/) and
[shadcn/ui](https://ui.shadcn.com/). Their generated components under `components/` (and
`lib/utils.ts`, `hooks/`) are MIT-licensed by AgentbaseAI Inc. and shadcn; see
[`components/NOTICE.md`](components/NOTICE.md) for what was generated and the license texts.
