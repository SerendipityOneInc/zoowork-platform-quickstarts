# Research Assistant References and Reuse

The [full Anthropic MIT notice](third-party/anthropic-MIT.txt) is retained here.

## Official Claude Sample

- Repository: [anthropics/claude-quickstarts](https://github.com/anthropics/claude-quickstarts).
- Reviewed commit: `3994db7dc2464d9ab255aba1dfda3594fc994c21`, dated 2026-09-30 UTC.
- Sample: [managed-agents/chat-sdk](https://github.com/anthropics/claude-quickstarts/tree/3994db7dc2464d9ab255aba1dfda3594fc994c21/managed-agents/chat-sdk).
- License: [MIT, Copyright (c) 2023 Anthropic](https://github.com/anthropics/claude-quickstarts/blob/3994db7dc2464d9ab255aba1dfda3594fc994c21/LICENSE).

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
