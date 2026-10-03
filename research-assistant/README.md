# Research Assistant

A local, single-user research starter using Vercel Chat SDK’s Web adapter and ZooWork Platform Sessions. The interface, sample topics and default research replies are in English. Enter a topic, follow actual search/fetch activity, read a cited brief, return to saved research, ask follow-ups, choose brief versions, and export Markdown.

The brief is the primary result. Conversation and expandable activity provide context. Source labels distinguish a successful fetch, earlier research, search results, and unconfirmed links. A successful fetch does not independently verify facts.

## Run

Requires **Node 22.20+**, a Platform Project key (`zwp_live_`), and an explicit public API URL. Each demo installs independently, with no sibling application or local SDK override.

```sh
npm ci
cp .env.example .env
# Fill ZOOWORK_API_KEY and ZOOWORK_BASE_URL. Optionally set ZOOWORK_MODEL.
npm run setup
npm run dev
```

Open **http://localhost:3000**. The Node process provides the UI and API. It binds only to `127.0.0.1`; use the same origin throughout. `PORT` changes the local port. `npm start` runs without the watcher. `NODE_ENV=production npm start` caches a minified browser bundle. `npm run build` writes browser assets to ignored `dist/`; it is not a public deployment command.

Setup creates and starts this app’s Agent with a research persona and an allow list of `web_search` and `web_fetch`. The model performs these calls through Platform; there is no separate application search provider. A deployment without these tools returns limited results and unconfirmed sources. It cannot be treated as completed web research.

Keys stay in the server process. Never add a key to browser code, query parameters, logs, or Git. The normal application makes billable model/tool calls when you submit a topic or follow-up.

## SDK Debug

Expand **SDK Debug** at the top of the page to inspect the actual server-side SDK
calls: `getAgent`, `createSession`, `getSession`, `postEvents`, `listEventsPage` and
`streamEvents`. Each entry shows its in-flight/returned/failed/closed state, elapsed
time and an allow-listed argument/result summary. Interrupts appear as `postEvents`
with `user.interrupt`. Agent and Session IDs identify the current research.

The **Platform events** tab shows durable event types, sequence numbers, Run IDs and
`web_search`/`web_fetch` phases. History reads and live stream deliveries are labeled
separately and deduplicated per Session/sequence; reading a historical tool event
does not execute that tool again. SDK call success is distinct from run completion.

Debug uses process memory only, retaining up to 160 calls and 200 event summaries;
the UI shows the latest 40 calls or 60 events in the selected scope. Restarting clears
the journal; setup calls from an earlier process are not invented. Completed routine
reads are evicted first. The debug endpoint is local, read-only and does not call
Platform. It never stores keys, headers, input text, tool output, raw metadata,
cursor values or provider error bodies. **Pause display** freezes display only; it does not
interrupt research. Offline fixtures are explicitly labeled in this panel.

## History and recovery

Platform is authoritative for messages, tools, run outcomes and brief text. Ignored private `.local/agent.json` records the immutable create body/key and Agent ID. `.local/conversations/` records app conversation → Session mappings, ownership, input intents and cursors. Completed input text is removed from local intents. Keep this directory and the same Agent to resume after server restart. Browser storage remembers the active conversation and per-conversation drafts.

Each Session accepts one active input. Server locks protect against different inputs from multiple tabs; stable request identities prevent reposting the same input. Refreshing, disconnecting, or switching conversations never reposts history. Closing the browser does not stop the Platform run. **Stop research** sends `user.interrupt` and waits for an actual terminal.

Public input event IDs and internal `inboundMessageId` can differ. Under this starter’s single-writer contract, the bridge associates the matching input echo with the sole new external run after the pre-submit history boundary. An older terminal cannot finish a new input. Do not use these Sessions through another writer, schedules or an external client. Ambiguous submissions remain pending until read-only reconciliation; they are not automatically retried or silently cleared.

```sh
npm run status
# Stop the web process before commands that change local/runtime state.
npm run update-agent
npm run recover
```

`update-agent` explicitly updates the recorded Agent’s research configuration. It keeps the original create body immutable, persists pending sections before writing, and reconciles a lost response by reading the Agent. Run this command for an existing Agent after changing the research prompt, including when switching to the English default. Saved conversation text keeps its original language.

`recover` rebuilds missing conversation records only from this Agent’s matching app/instance/owner metadata. It refuses corrupt or foreign files. The Agent record is still required; do not substitute an ID. Recovered Sessions retain Platform history but not lost local input request identities.

Archived Sessions are readable/exportable and cannot accept input. Unknown, deleted or mismatched Sessions fail closed. For an unresolved run, use **Refresh** and retain `.local/` for investigation. A crashed process leaves `web.lock`; the next start removes it only if the recorded PID no longer exists. An invalid lock needs manual review.

## Offline checks and demo

```sh
npm run check
npm run dev:fixture
```

`check` runs TypeScript, Node tests and the browser build without credentials or live API calls. The fixture server opens at **http://localhost:3187**, labels content as simulated, uses temporary data and never calls Platform.

```sh
npx playwright install chromium --only-shell
npm run test:browser
# Or reuse an installed Google Chrome:
PLAYWRIGHT_CHANNEL=chrome npm run test:browser
```

Browser tests start their own fixture server and verify desktop/mobile creation, refresh, follow-up, versions, exact Markdown download, history and isolation. Do not run `dev:fixture` on the same port during these tests. Screenshots and traces stay ignored.

## Authorized staging verification

With separate human authorization, inject a staging Project key server-side and set `ZOOWORK_BASE_URL=https://claw-interface.ecap.yesy.live/service/v1`:

```sh
npm run test:research-staging
# Session regression: tools disabled, two short text turns.
npm run test:research-staging -- --session-only
# Original lifecycle-only smoke:
npm run test:staging -- --confirm-staging
```

The research check creates at most one temporary Agent, two Sessions and two user turns. Main phase: 180 seconds. Cleanup: 60 seconds. It never retries a billable input. Default mode checks real search/fetch, cited brief, durable replay, Markdown export, continuation and an empty independent Session. Session-only mode checks continuation/context with a tiny output budget; it does not prove search. A flag is not authorization. These commands refuse production.

Cleanup verifies recorded Agent labels and Session metadata. Failed or ambiguous creation/cleanup preserves `.local/research-smoke-*.json` and conversation records, and prints the exact recovery command. It never scans a Project to choose deletion targets. See [actual validation](VALIDATION.md).

## Clean up

```sh
# Stop the web process. This deletes the app’s recorded research history and Agent.
npm run cleanup
```

Cleanup deletes matching recorded Sessions, then stops/deletes the Agent. It preserves recovery state when uncertain or unsuccessful. After successful application cleanup, local tombstones move to `.local/conversations.retired-<instance>/`, so a new `setup` starts a fresh registry. Smoke tombstones remain alongside their recorded state directory. Do not mix registries from different instances.

## Code and limits

- `src/agent.ts`, `research-prompt.ts`: research policy/persona.
- `src/main.ts`, `app.ts`, `bot.ts`: local host, application API, official Web adapter.
- `src/conversations.ts`, `turns.ts`: ownership, intents, single reader, durable replay.
- `src/brief.ts`: shared message/tool/brief/source projection and export text.
- `src/platform.ts`, `web-runtime.ts`, `lifecycle.ts`: lifecycle, bounded clients and locks.
- `web/`: React/useChat reading UI and responsive styles.

The published SDK supplies complete assistant messages rather than token previews. No progress percentage, duration estimate, typed citation verification or cost estimate is invented. Final Markdown parsing is best-effort: incomplete or uncited answers stay in the conversation; failed/aborted runs do not publish a complete brief.

No public hosting, multi-user authentication, IM adapter, scheduled research, upload, approval automation or separate RAG is included. History replays full durable pages; large-session optimization and a multi-process registry are outside this starter.

See [PLAN.md](PLAN.md), [PRODUCT.md](PRODUCT.md), [REFERENCES.md](REFERENCES.md) and the retained [Anthropic MIT license](third-party/anthropic-MIT.txt).
