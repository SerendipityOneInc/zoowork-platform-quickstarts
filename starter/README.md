# ZooWork Agent Starter

A minimal, general-purpose chat app for an Agent you define. You describe the Agent in one
file, `npm run setup` creates it on ZooWork Platform, and `npm run dev` gives you a chat page
to test it: multiple conversations, live tool activity, stop, tool approvals, and history
that survives reloads and dropped connections. Then use the checklist below to bring it into
your own product.

It is the companion workspace for the [Publish your Agent guide](https://zoowork.ai/guides/publish-agent).
Use it with your coding agent (Claude Code, Codex, Cursor or another): point it at this
directory and ask it to change `agent/agent.md` and `app.config.ts` for your use case.

The other directories in this repository are capability demos built around a business
scenario (Custom Tools, Remote MCP, RAG, research). This starter has no business logic; it is
the starting point for your own Agent.

Like the [OpenAI ChatKit starter](https://github.com/openai/openai-chatkit-starter-app) and the
[Claude Managed Agents quickstarts](https://github.com/anthropics/claude-quickstarts/tree/main/managed-agents),
it is a minimal integration. It has **no end-user sign-in, no per-user limits and no public
deployment setup**, and it only answers on `localhost`. See [Before you go public](#before-you-go-public).

## Requirements

- Node.js **22.20 or newer** and npm.
- A ZooWork Platform **Project key** (`zwp_live_…`) and Organization credits. Step 1 shows
  how to get them.

## 1. Get a Project key and credits

1. Sign in to [Platform Console](https://platform.zoowork.ai) and select a Project. The
   **Default Project** is fine.
2. Open **API Keys**, create a key and copy it. The Console shows it once. It starts with
   `zwp_live_`. Work organization keys (`zct_…`) are not accepted.
3. Open **Billing** and make sure the Organization has credits. Creating the Agent needs
   billing to be set up, and every reply uses credits. All Projects in an Organization share
   the same balance.

## 2. Configure the server

```sh
git clone https://github.com/SerendipityOneInc/zoowork-platform-quickstarts.git
cd zoowork-platform-quickstarts/starter
npm ci
cp .env.example .env
```

Edit `.env` and set your key:

```dotenv
ZOOWORK_API_KEY=zwp_live_your_project_key
```

The key stays in the server process. Never paste it into a chat, browser code, a screenshot,
a log or Git; `.env` is ignored by Git. The SDK connects to the production API by default.
Set `ZOOWORK_BASE_URL` only to use another deployment: it is that deployment's public API,
ending in `/service/v1`; the Console website URL is not an API URL.

## 3. Define your Agent

The Agent is one file: [`agent/agent.md`](agent/agent.md). The YAML frontmatter is the
configuration; everything below it is the Agent's instructions.

```markdown
---
name: Starter Assistant
tools:
  - web_search
  - web_fetch
global_skills: false
---

You are a helpful assistant inside a web chat. …
```

| Key | Required | Meaning |
| --- | --- | --- |
| `name` | yes | The Agent's name in Platform. |
| `tools` | yes | Tools the Agent may use, by exact name. `[]` makes a text-only Agent. |
| `model` | no | Model id. Omit to use the Platform default at creation. `npm run models` lists the models your key can use. |
| `thinking` | no | `off`, `low`, `medium`, `high` or `max`. Needs `model`. |
| `max_tokens` | no | Output token cap per model request. Needs `model`. |
| `global_skills` | no | Automatic global Skills. Default `false`, so the Agent only has what you list. |
| `skills` | no | Skills to attach, by `name` or `skill_id`, with an optional `version`. |
| `timezone` | no | Named IANA timezone, such as `Asia/Shanghai`. |

Unknown keys are rejected, so a typo fails setup instead of being ignored.

Then create and start the Agent:

```sh
npm run setup
```

Setup prints `Agent created: <id>`. You never copy an Agent ID anywhere: setup records it in
`.local/agent.json`, and the app reads it from there.

**To change the Agent later**, edit `agent/agent.md` and run `npm run setup` again. It updates
the same Agent and confirms the change by reading it back; a change the Platform did not apply
fails as `agent_update_not_confirmed` instead of being reported as done. Existing conversations
use the new configuration from their next message.

Removing a line works for `thinking` (setup clears it). The Platform has no documented way to
clear `model`, `max_tokens` or `timezone`, so setup refuses to remove them: keep a value, or run
`npm run cleanup` and then `npm run setup` to recreate the Agent. To remove all Skills, write
`skills: []` instead of deleting the line.

## 4. Chat with it

```sh
npm run dev
```

Open **http://localhost:3000** and send a message. You will see the Agent think, use its
tools, and reply. Each conversation in the sidebar is one ZooWork Session.

- **Reload or lose the connection**: the page reconnects and continues from where it stopped.
  The Agent keeps working while the page is closed; its reply is there when you come back.
- **Stop** (the square button) interrupts the run on the Platform. Closing the page does not.
- **Allow / Deny** appears when a tool call needs approval under the Agent's tool policy.
- **Archive** moves a conversation to the sidebar's **Archived** group. It stays readable but
  accepts no new messages, and cannot be unarchived. **Delete** deletes the Session on the
  Platform and removes it from the list.

Replies arrive as whole messages, with tool activity shown live. The Platform API does not
currently stream replies token by token.

If the page says `agent/agent.md` changed since the last setup, run `npm run setup`.
`npm run status` shows the Agent's ID, state, and whether it matches the file.

## 5. Make it yours

Most apps only need two files: `agent/agent.md` for what the Agent does, and `app.config.ts`
for what the page says and looks like. Changing those two turns the starter into a different
app; the code stays the same.

| Change | Where |
| --- | --- |
| What the Agent does | `agent/agent.md` (then `npm run setup`) |
| Product name, description, greeting, placeholder, starter prompts, brand color, footnote | `app.config.ts` (no code changes; the fields are described in `lib/app-config.ts`) |
| A custom card for one of your tools | `components/tool-uis/` (register it in `index.tsx`) |
| Layout and components | `app/assistant.tsx`, `components/` |

`app.config.ts` is sent to the browser. Never put keys or private data in it.

## Before you go public

This starter is a local, single-user development app. Before anyone else can reach it, add
these. Every visitor's message runs your Agent and **uses your Organization's prepaid credits**.

1. **End-user authentication.** The Project key authorizes your server, not your users. Sign
   users in with your own auth.
2. **Session ownership.** Store which user owns each Session in your database and check it on
   every route that takes a Session ID. The Platform cannot list Sessions by end user.
   `ownedSession()` in `lib/zoowork/runtime.ts` is where that check goes; replace the local
   `.local/sessions.json` index with a table keyed by user.
3. **Per-user limits and abuse protection.** Daily message or credit limits per user, rate
   limits, and bot protection on sign-up. Without them, one visitor can spend your balance.
4. **Remove the local-only guard deliberately.** `guard()` in `lib/zoowork/http.ts` refuses any
   host other than `localhost`. Remove it only after 1 to 3 are in place.
5. **Review what reaches the browser.** The stream route forwards event payloads, including tool
   arguments and result previews. Filter fields your users should not see.

For the backend pattern, see step 9, “Wire up your own front end”, in the
[ZooWork coding Skill's deployment reference](https://github.com/SerendipityOneInc/zoowork-sdk-skills/blob/main/skills/zoowork-managed-agents/references/deploy-your-agent.md).
The starter's [How it works](#how-it-works) section shows which files to reuse.

## Clean up

```sh
# Stop npm run dev first.
npm run cleanup
```

Cleanup deletes the conversations this app recorded, then stops and deletes its Agent. It only
touches IDs in `.local/`; it never lists your Project to choose what to delete. If anything is
uncertain or fails, it keeps `.local/` so you can run it again. After success the old records
are renamed to `*.retired-<instance>.json`, and the next `npm run setup` creates a new Agent.

## Troubleshooting

Errors print a stable code and never the key or a provider response body.

| Code | What to do |
| --- | --- |
| `platform_project_key_required` | Copy `.env.example` to `.env` and set `ZOOWORK_API_KEY` to a `zwp_live_` Project key. Restart `npm run dev` after editing `.env`. |
| `invalid_public_base_url` | Remove `ZOOWORK_BASE_URL` to use the production API, or set it to the `https://…/service/v1` URL of the deployment that issued the key. |
| `run_setup_first` | Run `npm run setup`, then reload the page. |
| `agent_changed_restart_dev` | `.local/agent.json` now records a different Agent than the running server uses. Restart `npm run dev`. |
| `invalid_agent_definition: …` | Fix the named problem in `agent/agent.md` and run setup again. |
| `cannot_remove_model` / `cannot_remove_max_tokens` / `cannot_remove_timezone` | Put the line back in `agent/agent.md`, or run `npm run cleanup` then `npm run setup` to recreate the Agent without it. |
| `skills_removed_set_empty_list` | Write `skills: []` to remove all Skills, then run setup. |
| `agent_update_not_confirmed` | The Platform accepted the update but the Agent does not show it. Run `npm run status`, check the changed values (model id, Skill names, tool names), and run setup again. |
| `cleanup_incomplete_run_cleanup` | A cleanup stopped partway. Run `npm run cleanup` again to finish it, then `npm run setup`. |
| `session_creation_uncertain_retry_cleanup` | A conversation was being created when its response was lost, and it could not be confirmed now. Keep `.local/`, check the connection and key, and run `npm run cleanup` again. |
| `http_401` | The key was rejected. Check it was copied completely. If `ZOOWORK_BASE_URL` is set, the key must belong to that deployment. |
| `http_402` | Set up billing or add credits for the Organization in Platform Console. |
| `http_403` | Check the key's Project and permissions. |
| `http_400` during setup | Check billing, the `model` value (`npm run models`), skills and tool names. Keep `.local/`. |
| `state_scope_mismatch` / recorded `http_404` | `.local/` belongs to another deployment or key. Restore the original `.env`. Do not delete `.local/` to force a new Agent; run cleanup with the original settings instead. |
| `agent_label_mismatch` | The recorded Agent is not this app's. Check that `.local/` and the key belong together. |
| `state_locked_review_before_retry` | Another setup or cleanup is running. If none is, delete `.local/agent.json.lock`. |
| `web_server_running` | Stop `npm run dev` before `npm run cleanup`. |
| `local_only_add_authentication_first` | You opened the app through a host other than `localhost`. See [Before you go public](#before-you-go-public). |
| "The message was accepted, but the Agent has not started" | Run `npm run status`. If the Agent is stopped, run `npm run setup`. |
| `EADDRINUSE` | Another process uses port 3000. Stop it or run `npm run dev -- --port 3001`. |

## How it works

```text
browser (assistant-ui)            this app's server (Next.js)            ZooWork Platform
──────────────────────            ───────────────────────────            ────────────────
sidebar  ── GET/POST /api/sessions ──▶ local Session index ──createSession──▶ Session
thread   ── GET  …/[id]/stream (SSE) ──▶ relay ◀────── streamEvents(cursor) ── event log
composer ── POST …/[id]/messages ─────▶ postEvents(user.message, idempotency key)
stop     ── POST …/[id]/interrupt ────▶ postEvents(user.interrupt)
allow    ── POST …/[id]/approvals/… ──▶ resolveApproval
```

- **One stream for history and live updates.** Opened without a cursor, the Platform stream
  replays the Session from its first event, then continues live. The relay forwards each event
  with its Platform cursor as the SSE event id. When the connection drops, the browser
  reconnects with that id and the stream resumes right after it, so nothing is lost or shown
  twice. `lib/zoowork/relay.ts`
- **One fold for every view.** `lib/chat/reducer.ts` is a pure function from Session events to
  assistant-ui messages, used for both the replay and live events.
  `lib/chat/session-controller.ts` owns the stream, the optimistic bubble for a sent message and
  the stop/approval actions. `lib/chat/runtime-provider.tsx` connects both to assistant-ui.
- **Safe retries.** Each sent message carries an idempotency key, so a retried request is
  delivered once and never starts a second paid run. Setup saves the exact create request and
  key before creating the Agent, and the app does the same before creating each conversation's
  Session, so a lost response is resolved by repeating the same request instead of creating a
  duplicate. Listing conversations and cleanup both finish such pending creates.
- **Ownership.** Each route checks that the Session is one this app created
  (`ownedSession()`), and approvals are checked against the Session before they are resolved.

| Path | Responsibility |
| --- | --- |
| `agent/agent.md` | The Agent definition |
| `app.config.ts` | Page text and brand |
| `app/api/` | Routes: sessions, stream, messages, interrupt, approvals, status |
| `lib/zoowork/` | Server: configuration, client, setup/cleanup, Session index, relay |
| `lib/chat/` | Browser: event reducer, session controller, assistant-ui runtime |
| `components/` | assistant-ui components, tool cards, sidebar, status bar |
| `scripts/` | `setup` / `status` / `cleanup` / `models` |
| `test/` | Offline tests and the in-memory fake Platform they use |

## Checks

```sh
npm ci
npm run check
```

`check` runs the TypeScript check, the offline tests and a production build. It needs no key
and makes no network request to ZooWork. The tests cover the agent definition parser, the
event reducer (tools, approvals, stop, failures, replay overlap), setup and cleanup recovery,
and stream relay and resume against an in-memory fake of the Session API in `test/`.

`npm run build` and `npm start` build and serve the app locally. They are not a deployment
setup; see [Before you go public](#before-you-go-public).

## Sources and licenses

The chat UI is built with [assistant-ui](https://www.assistant-ui.com/). Its copy-in components
under `components/` are MIT-licensed by AgentbaseAI Inc. (see [`components/NOTICE.md`](components/NOTICE.md)).
The app structure, reducer, session controller and runtime wiring are adapted from Anthropic's
[Claude Managed Agents assistant-ui quickstart](https://github.com/anthropics/claude-quickstarts/tree/9ec32b91df50b0d4906cae64b13c6298055ff40d/managed-agents/assistant-ui)
(MIT, [notice](third-party/anthropic-MIT.txt)) and rewritten for ZooWork Sessions.
[REFERENCES.md](REFERENCES.md) lists the copied paths and changes.
