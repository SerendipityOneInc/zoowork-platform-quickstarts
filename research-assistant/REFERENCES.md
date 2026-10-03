# Research Assistant References and Reuse

Reviewed 2026-10-01. Complements [shared references](../docs/REFERENCES.md).
The [full Anthropic MIT notice](third-party/anthropic-MIT.txt) is retained here.

## Official Claude Sample

- Repository: [anthropics/claude-quickstarts](https://github.com/anthropics/claude-quickstarts).
- Reviewed commit: `3994db7dc2464d9ab255aba1dfda3594fc994c21`, dated 2026-09-30 UTC.
- Sample: [managed-agents/chat-sdk](https://github.com/anthropics/claude-quickstarts/tree/3994db7dc2464d9ab255aba1dfda3594fc994c21/managed-agents/chat-sdk).
- License: [MIT, Copyright (c) 2023 Anthropic](https://github.com/anthropics/claude-quickstarts/blob/3994db7dc2464d9ab255aba1dfda3594fc994c21/LICENSE).
- Foundation references use `09bdac6`; this app reviewed a newer snapshot without changing shared records.

Reviewed package metadata, README, CLAUDE.md, setup prompt, the modules below, React UI and
representative CSS. Copied or substantially adapted code retains the full MIT notice.
Source paths below are relative to `managed-agents/chat-sdk/`.

| Source path | Reuse decision | Implemented location |
| --- | --- | --- |
| `src/bot.ts` | Official adapter wiring, memory state and concurrent handler; add local owner and Platform bridge. | `src/bot.ts` |
| `src/app.ts` | Hono route organization; original mapping/export/interrupt behavior. | `src/app.ts` |
| `src/main.ts` | Node host/esbuild recipe; add local binding, configuration and process lease. | `src/main.ts`, `scripts/build.ts` |
| `src/activity.ts` | Fan-out structure only; rewrite durable replay and snapshots. | Structural reference in `src/turns.ts`; no copied functions. |
| `src/brief.ts` | Pure functions/shared type organization; remove Console URL/fence protocol. | `src/brief.ts`; projection/source classification rewritten. |
| `src/card.tsx` | Product intent only, without multi-adapter JSX cards. | Not copied. |
| `web/app.tsx`, `web/app.css`, `web/index.html` | React/useChat/remount/sidebar/reading layout; adapt briefs, sources, versions, states and styles. | Matching `web/` files. |
| `src/managed-agents.ts` | Serialization, anchor and recovery principles. | Not copied; `src/turns.ts` rewritten. |
| `src/sessions.ts` | Restoration from a single log. | Not copied; original `src/conversations.ts`. |
| `setup/agent-config.ts` | Primary sources, acknowledgement and continuity principles. | Not copied; rewritten `src/research-prompt.ts`. |
| `setup/create-agent.ts`, `setup/update-agent.ts` | Keep this demo's lifecycle implementation. | Claude provisioning not copied. |

## Vercel Chat SDK

- Official [Web adapter documentation](https://chat-sdk.dev/adapters/official/web)
  and [Markdown documentation](https://chat-sdk.dev/adapters/official/web.md).
- Reviewed getUser, thread ID encode/decode, persistMessageHistory, useChat/transport,
  thread.post and request abort. Web response and Platform run have separate lifecycles.
- The sample pins `chat`, `@chat-adapter/web` and `@chat-adapter/state-memory` to 4.34.0.
  npm confirmed availability and peer ranges; latest at review was 4.41.1.
- [vercel/chat](https://github.com/vercel/chat) main was
  `4b458b4c345ee61056fa4d4d6877593dc2a38107`; library implementation was not copied.
- Use published packages, without copied adapter internals or unreviewed tool/data parts.

## ZooWork SDK and Contract

- Downloaded/read npm `@zoowork-ai/sdk@0.9.0` client types, relevant implementations,
  event types/helpers and exports.
- [SDK v0.9.0](https://github.com/SerendipityOneInc/zoowork-sdk-typescript/releases/tag/v0.9.0).
- Public docs snapshot `83ab0521fcb45db13f993d327abf001636ef9e7a`:
  [Agents](https://github.com/SerendipityOneInc/zoowork-agents-docs/blob/83ab0521fcb45db13f993d327abf001636ef9e7a/docs/en/build/agents.md),
  [Tools](https://github.com/SerendipityOneInc/zoowork-agents-docs/blob/83ab0521fcb45db13f993d327abf001636ef9e7a/docs/en/build/tools.md),
  [Sessions](https://github.com/SerendipityOneInc/zoowork-agents-docs/blob/83ab0521fcb45db13f993d327abf001636ef9e7a/docs/en/build/sessions.md),
  [Events](https://github.com/SerendipityOneInc/zoowork-agents-docs/blob/83ab0521fcb45db13f993d327abf001636ef9e7a/docs/en/build/events.md).
- Focus: canonical persona docs, tool allow/deny, write-once metadata, Agent-nested Sessions,
  string inputs, idempotency, input/run anchors, tool phases, pagination, opaque cursor and interrupt.
- Preview, typed citations, complete tool results and reliable cost display are not presented
  as published first-version capabilities.

## Platform Gateway

- ECAP main snapshot: `4184093a8214cd2244f752616aac64ce23e6923f`.
- [Project-key router](https://github.com/SerendipityOneInc/ecap-workspace/blob/4184093a8214cd2244f752616aac64ce23e6923f/services/claw-interface/app/routes/service_api/router.py).
- [Agent access](https://github.com/SerendipityOneInc/ecap-workspace/blob/4184093a8214cd2244f752616aac64ce23e6923f/services/claw-interface/app/routes/service_api/_agents.py).
- Gateway derives ownership, checks Project/owner and forwards Agent-nested Session calls.
  No direct Engine path or cross-Project Agent borrowing was introduced.

## Input Association Reviewed During Implementation

Actual staging showed public event IDs differ from internal inboundMessageId.
Read-only review of Engine snapshot `9e1dd474ee8146571ac6e758803e53e7ea5c125f` covered
`packages/storage-pg/src/public-session-events.ts`,
`services/controld/src/peripheral/sessions-api.ts`,
`services/agent-worker/src/workflows/session-observability.ts` and
`activities/run-lifecycle-activities.ts`.

Ledger IDs are generated independently; run anchors use the internal inbound ID. This starter
therefore relies on its single-writer contract and seq/input-echo association, rather than
claiming the SDK directly joins the IDs. No Engine code was modified or copied.

See [VALIDATION.md](VALIDATION.md) for separate source-reviewed, offline-tested and staging-verified scope.
