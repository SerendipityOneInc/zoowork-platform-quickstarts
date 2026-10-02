# Research Assistant Implementation Plan

Status: Finn authorized implementation in this session. The application, offline checks
and bounded staging verification are complete. This document retains the original technical
decisions and records the implemented changes. See [VALIDATION.md](VALIDATION.md) for evidence.

Initial review: 2026-10-01. Confirmed scope: local single-user starter.
[PRODUCT.md](PRODUCT.md) defines scope; [REFERENCES.md](REFERENCES.md) records source snapshots and reuse.

## 1. Approach

Use React, Hono and a long-running Node service with Vercel Chat SDK's official Web adapter.
The browser calls only the application backend. The backend uses published
`@zoowork-ai/sdk@0.9.0` to operate Platform Agents and Sessions.

Adapt the Claude sample's Web wiring, route organization and reading layout. Rewrite the
Platform bridge, durable-history projection and research prompt. Make a cited brief the
primary result, retaining conversation, actual activity and previous brief versions.

Platform stores messages and events. Ignored `.local/` stores conversation ownership,
Agent/Session mappings, exact create/send intents and recovery cursors. An intent is the
exact request and stable identity saved before submission, used to reconcile lost responses.
There is no separate conversation database.

Chat SDK's streaming HTTP transport does not imply Platform token streaming. Display complete
`agent.assistant` messages when durable events arrive. Show actual search/fetch events while
research runs, without simulated typing, completion percentages or time estimates.

## 2. Starting Point and Boundaries

Preparation read workspace/repository rules, HANDOFF, OUTLINE, PLATFORM, the session prompt,
and the app README/PLAN. There were no nested AGENTS.md or CLAUDE.md files in this app.
After `git fetch --prune origin`, PR #19 was OPEN at
`cd932491bcf98eddb7e6650375b6586565c911c5`, matching the remote branch.

Preparation used `feature/research-assistant-plan`; implementation uses
`feature/research-assistant` in its independent research-assistant worktree. While the handoff
PR remains open, the feature PR base is `feature/platform-demo-handoffs`; once merged, use
updated main. Never reset, stash or rebase automatically.

Keep code, dependencies, tests and design inside this application. Propose SDK/Platform gaps
separately. Commit as `finn-srp <finn@srp.one>` and use Finn's verified GitHub account `finn930`.

## 3. Platform Capabilities and UI Consequences

Preparation reviewed published/source support, without credentials or live calls. Source
support alone does not establish deployed availability. Initial snapshots: SDK 0.9.0,
public docs `83ab052`, ECAP main `4184093`.

| Capability | Contract | Application consequence |
| --- | --- | --- |
| Agent | Project key creates an Agent on `/service/v1`; gateway derives Org/Project/owner. Agent must run for Session input. | Setup creates this app's Agent; no user-entered Agent or tenancy selectors. |
| Search/fetch | Model tools `web_search` and `web_fetch`; visibility does not prove execution success. | Agent researches through Platform; no invented SDK search method or separate search provider. |
| Tool policy | Allow restricts tools; deny takes precedence. Global Skills can be disabled. | Allow only search/fetch and set `include_global_skills:false`; no exec, MCP or Custom Tool. |
| Session creation | `createSession` accepts metadata and optional nonempty-string user messages. | Create an empty Session on first valid topic, then send input once through Chat SDK. |
| Metadata/title | Write at creation; no SDK Session patch/retitle method. Metadata is not authorization. | First topic sets title; app/instance/owner metadata supports local ownership checks. |
| Follow-up | `postEvents` with stable per-input idempotency key. | Reuse the original Session and never resend history. |
| History | `listEventsPage` supports pagination; ordinary reads can be limited to 100/500 events. | Read complete pages and deduplicate by seq, rather than treating one page as all history. |
| Session index | `listSessionPage` has cursors and archived/deleted states, without app-owner metadata filtering. | List private local mappings; recover matching metadata under the recorded Agent only. |
| Status | `run_status` is the latest run; 202 means accepted/queued. | Never show completion on acceptance or infer it from legacy Session status. |
| Replies | `assistantText` reads `agent.assistant.payload.message.content`. | Use the same durable original text for live display, replay and export. |
| Tools/terminal | `toolCall` gives start/end/blocked and toolCallId; `runOutcome` reads terminal outcome. | Pair phases by toolCallId. Tool failures and overall run success are separate. |
| Recovery | Durable `streamEvents({cursor})`; no automatic SDK reconnection. REST/SSE cursors are opaque. | Preserve cursor tokens and reconnect read-only; never resend a question on disconnect. |
| Preview | Published SDK does not request deltas; preview uses snapshot replacement and may return 501. | No append-delta bridge or preview accumulator. |
| Interrupt | `user.interrupt`; accepted:false is a normal no-op without an active run. | Stop research sends an interrupt and waits for an actual terminal. Closing a page is not a stop. |
| Limits | Core loop does not emit a usable plan; tool results expose previews; usage is not reliable actual cost. | Do not invent a plan percentage, complete result counts, page contents or billing estimates. |

Use the default Environment and SSE. Do not depend on top-level Environment/Skills management,
channels, webhooks or credential-write routes. Public product calls go through the gateway.

## 4. Stack and Reuse

Node >=22.20.0; independent npm installation and lockfile. React 19, react-markdown,
`@chat-adapter/web/react` useChat, Hono, `@hono/node-server` and esbuild. Browser transport
uses AI SDK UI messages without a model provider; model calls remain in Platform.

Pin `chat`, `@chat-adapter/web` and `@chat-adapter/state-memory` consistently to the reviewed
sample's 4.34.0. At the preparation date, npm confirmed those versions/peer ranges and latest
4.41.1. Upgrades require type, changelog and transport review.

The official sample was reviewed at `anthropics/claude-quickstarts@3994db7`. Its MIT license,
setup prompt, Web wiring, event loop, history/activity, brief/cards, React and CSS were read.

| Sample path | Reuse | Adaptation |
| --- | --- | --- |
| `src/bot.ts` | Chat/Web adapter, thread encode/decode, memory state, awaited handler. | Local identity, ownership and Platform run coordinator. |
| `src/app.ts` | Hono chat/sessions/history/activity route organization. | Registry, shared ownership, interrupt and export; remove Anthropic configuration. |
| `src/main.ts` | Same-origin Node host, esbuild and React NODE_ENV define. | Private Agent state, loopback binding, offline build and process lease. |
| `src/activity.ts` | Subscriber fan-out and isolated subscriber errors. | Durable replay followed by live state. Implemented in turns.ts, not copied functions. |
| `web/app.tsx`, `app.css` | useChat/remount, sidebar, Markdown, collapsible activity and reading layout. | Briefs, sources, versions, export, actual state, mobile recovery and interrupts; English copy. |
| `src/brief.ts` | Pure projection/shared type organization. | Remove Console URL and trusted card/tools fences; rewrite source classification. |
| `src/card.tsx` | Brief-ready product intent. | No copied multi-adapter JSX card or fallback fence. |
| `src/managed-agents.ts` | Serialization, input anchors, read-only recovery and separate activity. | Rewrite the loop; remove Anthropic client, deltas, accumulators and span/status vocabulary. |
| `src/sessions.ts` | Restore from one durable log. | Agent-nested API, pagination, metadata, runId/seq and tool phases; original registry. |
| Setup configuration | Brief acknowledgement, primary sources, dates, uncertainty and continuity. | Rewrite prompt; original inline-link/heading restrictions and character budget do not fit a full brief. |
| Provisioning | Explicit create/update separation. | Retain this demo's idempotent lifecycle and label recovery, without Claude Environment setup. |

Retain the full Anthropic copyright/license notice. Actual copied/adapted paths are recorded
in REFERENCES.md. No sibling imports, workspace links or local SDK overrides.

| Implemented module | Responsibility |
| --- | --- |
| `src/agent.ts`, `research-prompt.ts` | Configuration, tool allow list and canonical persona.docs AGENTS.md. |
| `src/platform.ts`, `lifecycle.ts`, `web-runtime.ts` | Bounded clients, lifecycle, explicit update/recovery and process locks. |
| `src/main.ts`, `app.ts`, `bot.ts` | Node host, application API and official Web adapter. |
| `src/conversations.ts` | Registry, exact intents, ownership and locks. |
| `src/turns.ts` | Input/run anchors, single Session reader, replay, fan-out, reconnect and interrupt. |
| `src/brief.ts` | Shared message/tool/brief/source projection and export. |
| `src/sdk-debug.ts`, `web/sdk-debug.tsx` | Bounded actual SDK call journal and inspectable UI. |
| `web/` | History, topic input, reading, sources, versions, activity, errors and debug. |
| `scripts/`, `test/` | Offline build, bounded staging and meaningful contract/browser verification. |

The foundation's total 180-second smoke abort is inappropriate for a permanent server.
Separate REST request timeouts from the ten-minute Web observation budget; observer timeout
means reconnect/wait, not a failed run. Staging retains 180-second main and 60-second cleanup limits.

## 5. Interface

| Region | Content and actions |
| --- | --- |
| History | New research, topic, recent date, actual state and load more; full title remains accessible. |
| SDK Debug | Collapsible actual method calls, arguments/results and Platform events. |
| Header | Topic, status, copy and Markdown export when a brief exists. |
| Reading | First-use topic and examples, then complete brief or saved conversation. |
| Sources | Number, title, domain and observable read status; inline citations focus the source. |
| Activity | Actual search/fetch calls and states, expandable after completion. |
| Composer | Follow-up, update brief, retained draft and stop action; no concurrent input in an active Session. |

New research clears the current selection, without creating a Platform Session until the
first valid topic submission. Do not offer unsupported depth, guaranteed time or estimated cost.
Mobile history uses a drawer; sources follow the brief. Keep labels, keyboard access and
necessary aria-live announcements. Do not force readers to scroll as new events arrive.

States derive from actual intents/events: accepted input waits for start; the current run
and tool phases show progress; durable assistant messages show complete replies; a succeeded
run with formatted final text and sources produces a brief. Limited/unconfirmed sources keep
explicit limitations. Blocked tools require attention, without automatic approval. Disconnects
reconnect/read; failures/stops preserve previous briefs. Archived/deleted states cannot accept input.
429/5xx do not imply deletion. Do not display thinking text or fabricated steps.

## 6. Ownership, Input and Recovery

Keep immutable `.local/agent.json` creation records. Conversation records include schema,
app instance, fixed local owner, server UUID, base URL, recorded Agent/Session IDs, title,
exact create/send body/key, accepted receipt, runId and cursor. Use private directory/file
permissions, atomic rename and mutual exclusion. Remove completed input text from intents.

Chat SDK threads encode `web:{serverOwner}:{conversationId}`. Browser input cannot choose
Agent, deployment, owner or provider idempotency key. All application routes check the same
private registry, deployment, Agent labels and Session metadata. Knowing an ID cannot bypass
ownership. Loopback/same-origin checks are the local boundary, not multi-user authentication.

Create metadata `{app, instance, owner, conversation_id, title}`. Recover missing registry
entries only under the recorded verified Agent. Never scan Projects to select resources for
cleanup or silently recreate missing Agent state.

Input sequence:

1. Save the exact empty-Session create intent/key, create once, store the ID, then send the topic.
2. Consume only the adapter's current user message, not browser-supplied history or tool state.
3. Hold a long-running per-Session input lock. Chat SDK dedup/memory TTL is insufficient.
4. Post a nonempty string with stable input identity and save receipt IDs/seq.
5. Prefer directly matching run anchors. Staging showed public IDs differ from internal
   inboundMessageId, so under the single-writer contract use the matching input echo/hash and
   the sole new external run after the pre-submit history boundary. Ambiguity remains pending.
6. Replay durable events from the saved opaque cursor, filter by input/run/seq and deliver
   complete assistant text via awaited thread.post. Activity stays separate from reply text.
7. End observation on the current run's terminal, not stream EOF or an older terminal.

Lost create/send responses retain intent. Reconcile with read/replay; never generate a new key
and automatically retry a paid turn. Browser refresh/switch/disconnect never reposts history.

History and activity share the reducer and complete projection snapshot. Subscribe before
snapshot recovery, deduplicate by seq and use history invalidation. Application SSE seq IDs
are not Platform cursor tokens. One upstream reader serves each Session's multiple subscribers.
Reconnection is bounded, followed by REST reconciliation; server restart observes pending runs
without new input. Stopping observation, closing transport and interrupting a run are distinct.

| Application route | Responsibility |
| --- | --- |
| GET /api/sessions | Owned history and pagination. |
| POST /api/sessions | Record/create on first valid topic. |
| POST /api/chat | Official adapter and complete message response. |
| GET /api/history?conversation=... | Complete history and shared projection. |
| GET /api/activity?conversation=... | Snapshot/recovery and history invalidation. |
| POST /api/sessions/:conversation/interrupt | Interrupt receipt, followed by terminal observation. |
| GET /api/sessions/:conversation/briefs/:brief/markdown | Export the selected durable brief. |
| GET /api/debug?conversation=... | Local read-only, safely summarized instrumentation. |

These are application routes, not new Platform endpoints.

## 7. Briefs, Sources and Export

The prompt defaults to English with exact Markdown headings: topic title, Summary, Key findings,
Limitations and open questions, Sources. It requests primary sources, research scope/date and
inline numbered links. Dates require actual evidence. No sandbox file writes: export uses durable
message text. Explicit update-agent applies prompt changes without deleting history.

There are no typed citation objects or guaranteed complete tool results in public events.
Use original Markdown, conservative citation extraction and observable tool evidence:

- Accept safe HTTP(S) links from the Sources section; reject raw HTML/images/unsafe schemes.
- Pair successful web_fetch end with its args.url by toolCallId for Read in this run or Read earlier.
- Search previews classify only recognizable URLs as Found in search.
- Unmatched, redirected, failed or unexecuted fetches remain Not confirmed.
- Read status does not verify a claim or justify invented dates/authors/trust scores.

A ready first brief requires at least two primary sources and actual successful search/fetch.
An unavailable service can yield an explanation, not a claim of completed web research.

Only a succeeded run's complete, formatted final assistant message creates a brief version,
identified by run/message sequence. Short follow-ups do not replace the previous brief;
Update brief produces a full version. Failed/aborted partial output remains conversation.
Legacy Chinese Summary/Sources headings remain supported for saved history.

UI, history, copy and export share the same projection and selected original Markdown.
The server validates owned brief IDs, generates a safe UTF-8 filename and excludes acknowledgement,
tool traces and progress. Export does not invoke a model or create a Session.

## 8. Implementation Steps

1. Add independent Web dependencies/start/build while retaining lifecycle. Add explicit,
   ownership-checked Agent update with persisted pending sections and immutable create body/key.
2. Implement registry, exact input intents, run association, pagination, ownership and recovery.
3. Wire the official adapter, Hono and useChat with awaited handlers and separate activity.
4. Complete prompt, source/brief/history/version UI, copy/export, real interrupt and mobile access.
5. Run npm ci, npm run check and desktop/mobile offline browser flow without Platform requests.
6. Perform only authorized bounded staging verification, separating search and session evidence.
7. Document independent setup/update/recovery/cleanup, source/license reuse and actual limits;
   submit one feature PR without public deployment.

## 9. Completion Criteria

Offline checks must cover isolated conversations and follow-ups; foreign IDs/deployments and
cross-session exports; exact intents after lost responses; restart and full paginated history;
duplicate pages/SSE; older terminals, parallel tools and blocked phases; tool errors with a
successful run; EOF/browser abort without resend; interrupt semantics; safe Markdown/source
classification; unchanged selected export text; and the complete desktop/mobile user flow.

Each authorized staging run is capped at one temporary Agent, two Sessions and four user turns.
Prefer smaller checks; do not use extra paid calls to reach the ceiling. Actual search/fetch,
receipt/run/terminal association, durable replay and exact export require real evidence.
Cleanup only recorded, label-matched resources in Session → stop Agent → delete Agent order.
Preserve recovery state on ambiguity or cleanup failure; never automatically retry paid inputs.

Completion means users can submit a topic, observe actual research, read a sourced brief,
recover/reopen history, continue, choose versions and export Markdown. Offline checks pass,
staging capabilities have actual evidence, cleanup is explicit, and README/source notices are complete.
Report missing capabilities precisely; mocks or lifecycle connectivity cannot substitute for application evidence.

## 10. Implemented Differences and Evidence

Projection/source logic lives in brief.ts; replay/fan-out in turns.ts; activity routes in app.ts.
The small codebase does not create extra session-events/activity modules. Activity recovery uses
complete snapshots rather than converting browser cursors. Mobile composer scrolls with content.
Progress is actual state/call count, not an estimated completion time; no source dates are invented.

The application and offline/staging checks are complete. Real initial research and fixed
session continuity were verified separately on 2026-10-01, with temporary resources cleaned.
Real browser research and a brief update followed on 2026-10-02. See VALIDATION.md; no public deployment.

## 11. SDK Debug and English Default (2026-10-02)

SDK Debug shows actual methods, running/returned/failed/closed states, durations, Agent/Session
IDs and allow-listed summaries. Platform events expose seq, run/tool phases and history/live
provenance. Bounded process memory excludes keys, message bodies, tool output and raw errors.
Reading debug makes no Platform call and never resubmits input.

Finn requested an English demo. Interface copy, accessibility labels, examples, errors,
fixture content, staging example prompts and app documentation use English. The Agent prompt
defaults to English, while existing conversation text and parser compatibility are retained.
