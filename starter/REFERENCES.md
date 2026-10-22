# Starter references and reuse

Reviewed 2026-10-22. Complements the repository's [shared references](../docs/REFERENCES.md).

## Claude Managed Agents assistant-ui quickstart

- Repository: [anthropics/claude-quickstarts](https://github.com/anthropics/claude-quickstarts),
  commit `9ec32b91df50b0d4906cae64b13c6298055ff40d` (2026-10-07).
- Sample: [`managed-agents/assistant-ui`](https://github.com/anthropics/claude-quickstarts/tree/9ec32b91df50b0d4906cae64b13c6298055ff40d/managed-agents/assistant-ui).
- License: MIT, Copyright (c) 2023 Anthropic. The full notice is in
  [`third-party/anthropic-MIT.txt`](third-party/anthropic-MIT.txt).

Paths below are relative to the sample directory.

| Source path | Reuse | Location here |
| --- | --- | --- |
| `package.json`, `package-lock.json` | Dependency versions for Next.js, React, assistant-ui and Tailwind; Anthropic SDK, Next themes, diff and Shiki packages removed; ZooWork SDK and `yaml` added. | `package.json`, `package-lock.json` |
| `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `components.json`, `.npmrc`, `app/globals.css`, `app/page.tsx` | Copied. | Same paths |
| `app/layout.tsx`, `app/assistant.tsx`, `components/analyst-sidebar.tsx` | Page structure kept; text, colors and suggestions now come from `app.config.ts`; session files panel removed. | `app/layout.tsx`, `app/assistant.tsx`, `components/app-sidebar.tsx`, `components/status-bar.tsx` |
| `lib/managed-agents/reducer.ts` | Fold structure, message model, approval stripping and derived status kept; rewritten for ZooWork events (`run.*`, `agent.assistant`, `agent.tool`, `agent.approval`); token previews and custom-tool answering removed. | `lib/chat/reducer.ts` |
| `lib/managed-agents/session-controller.ts` | Registry, attach/detach, reopen backoff and optimistic send kept; the history/tail buffering replaced by the Platform's server-side stream cursor; approvals resolved through a REST route. | `lib/chat/session-controller.ts` |
| `lib/managed-agents/runtime-provider.tsx`, `session-list-adapter.ts`, `api.ts` | assistant-ui wiring kept; the thread list reads this app's Session index; titles come from the first message. | `lib/chat/` |
| `lib/sse.ts`, `app/api/sessions/**` | Route layout kept; handlers rewritten on the ZooWork SDK with local ownership, idempotency keys and cursor resume. | `lib/zoowork/relay.ts`, `app/api/` |
| `components/tool-uis/approval-bar.tsx`, `web-tools.tsx`, `index.tsx` | Adapted to ZooWork result previews and decisions; bash, file and chart cards not copied. | `components/tool-uis/` |
| `agents/*.md` (`ant apply` format) | The idea of one Markdown file with frontmatter for the Agent. The format and fields here are this starter's own. | `agent/agent.md`, `lib/zoowork/agent-definition.ts` |

Not copied: `lib/anthropic.ts`, `lib/owned-session.ts`, attachments and session files,
`skill.md`, `CLAUDE.md`, the environment file and sample data.

## assistant-ui copy-in components

`components/assistant-ui/`, `components/ui/`, `hooks/` and `lib/utils.ts` are assistant-ui
copy-in components as shipped in the sample above, generated for `@assistant-ui/react` 0.14.27.
MIT, Copyright (c) 2025 AgentbaseAI Inc. See [`components/NOTICE.md`](components/NOTICE.md).
`components/assistant-ui/thread.tsx` removes attachments, message editing, reload and
follow-up suggestions, and reads the composer placeholder from `app.config.ts`.

## OpenAI ChatKit starter

[openai/openai-chatkit-starter-app](https://github.com/openai/openai-chatkit-starter-app) at
`9cf32e6b264095591523fb026d6fa5e97f4bb20e` was reviewed for scope: a minimal integration that
defines the Agent in code and keeps UI text in one config file, without end-user
authentication, per-user isolation, limits or deployment. No code was copied. Its chat
component loads from OpenAI's CDN and needs an OpenAI domain key, so this starter uses
assistant-ui instead.

## ZooWork SDK and contract

- [`@zoowork-ai/sdk` 0.12.0](https://www.npmjs.com/package/@zoowork-ai/sdk): Agent lifecycle,
  Sessions, `postEvents` idempotency keys, `streamEvents` cursors, approvals.
- The stream's no-cursor replay from the first event and the `pse1:` cursor were confirmed in
  Engine source (`services/controld/src/peripheral/sessions-api.ts`, `resolveStreamCursor`).
- Event payload fields follow the SDK's `events.ts` and the coding Skill's
  `references/events-and-streaming.md`.
