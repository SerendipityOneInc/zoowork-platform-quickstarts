# Research Assistant

A local, single-user research app built with Vercel Chat SDK's Web adapter and ZooWork Platform
Sessions. Enter a topic and watch the Agent search and read pages as it works. You get a brief
with cited sources, which you can revisit later, follow up on, compare across versions and
export as Markdown.

The brief is the main result. The Conversation tab and the activity list show how it was
produced. Each source is labeled by how the Agent used it: read in this run, read earlier,
found only in search results, or not confirmed. A page being read does not mean every claim
taken from it is verified.

## Run

Requires **Node.js 22.20 or later**, on the latest security release of your line, and a Platform
Project key (`zwp_live_`) from [Platform Console](https://platform.zoowork.ai) → your Project →
**API Keys**. The Organization needs credits: every topic and follow-up runs the Agent.

```sh
npm ci
cp .env.example .env
# Set ZOOWORK_API_KEY. ZOOWORK_MODEL is optional; leave it empty for the Platform default.
npm run setup
npm run dev
```

Open **http://localhost:3000**. Set `PORT` in `.env` to use another port. The server listens on
`127.0.0.1` only and accepts requests from its own page only. `npm start` runs without the file
watcher. `npm run build` writes browser assets to the ignored `dist/` directory; it is not a
deployment.

`npm run setup` creates and starts this app's Agent with a research prompt and two built-in tools,
`web_search` and `web_fetch`. You do not create the Agent in the Console. Setup records its ID in
the ignored `.local/` directory and reuses it on the next run.

The key stays in the server process. Never put it in browser code, URLs, logs or Git.

## Use it

1. Enter a topic, or pick an example, and choose **Start research**.
2. **Research activity** lists each search and page fetch as the Agent performs it. The brief and
   its sources appear when the run finishes.
3. Ask a follow-up in **Continue research**. Short follow-ups are answered in the **Conversation**
   tab. To get a complete, updated brief, choose **Ask for a new brief version**, which starts your
   message with "Update the brief:". Each new brief is added as a version; switch between them
   with **Version**.
4. **Copy brief** and **Export Markdown** save the selected version.
5. **Stop research** interrupts the run on the Platform. Closing the page does not stop it; reopen
   the research from the sidebar to see the result.

Research history is listed in the sidebar with each run's current status. Reloading the page or
switching between topics never sends a question again.

## SDK Debug

Expand **SDK Debug** at the top of the page to see the SDK calls the server makes (`getAgent`,
`createSession`, `getSession`, `postEvents`, `listEventsPage` and `streamEvents`), with their
state, duration and a short summary of arguments and results. A stop request appears as
`postEvents` with `user.interrupt`.

The **Platform events** tab lists the Session events the server received: event type, sequence
number, run ID and the phase of each `web_search` or `web_fetch` call. Reading history shows past
events; it does not run those tools again.

The debug log lives in server memory and is cleared on restart. It keeps the latest 160 calls and
200 events. It never stores keys, request headers, your input text, tool output or error bodies
from the Platform. **Pause display** freezes the view only; research continues.

## Saved research and recovery

The Platform stores each Session's messages, tool activity and results. The app keeps a small
local index in `.local/`: the Agent record (`agent.json`) and one file per research topic in
`.local/conversations/`, which maps it to its Session. Keep `.local/` and the same key to resume
after a restart.

Each research Session runs one question at a time, and only this app should send messages to it.
If a question's delivery cannot be confirmed (for example, the network drops while sending), the
app shows **Submission unconfirmed** and does not resend it; choose **Refresh** to check its
status.

Commands that change the Agent or local records need the web server stopped first:

```sh
npm run status        # Agent ID and state
npm run update-agent  # apply a changed research prompt to the existing Agent
npm run recover       # rebuild missing .local/conversations records from this Agent's Sessions
```

Run `update-agent` after you edit `src/research-prompt.ts` or `src/agent.ts`. Existing research
keeps its saved text.

`recover` only restores records for Sessions this app created for the same Agent. It needs the
Agent record in `.local/agent.json`; do not substitute an Agent ID.

Sessions archived elsewhere stay readable and exportable but cannot take new questions. If the web
server crashed, it leaves `.local/web.lock`; the next start removes it when the recorded process
no longer exists.

## Troubleshooting

Errors show a short code and never print the key or a Platform error body.

| Message | What to do |
| --- | --- |
| `platform_project_key_required` | Copy `.env.example` to `.env`, set `ZOOWORK_API_KEY` to a `zwp_live_` key, and restart. |
| `run_setup_first` | Run `npm run setup`, then `npm run dev`. |
| `agent_not_running` | The Agent was stopped. Run `npm run setup`; it starts the same Agent. |
| Project key is invalid or expired | Check the key was copied completely and is still active. |
| Platform credits are insufficient | Add credits for the Organization in Platform Console. |
| Research is still running in this session | Wait for the run to finish, or choose **Stop research**. |
| Submission unconfirmed | Choose **Refresh**. The question is not resent automatically. |
| `web_process_already_running` | Another `npm run dev`, `setup` or `cleanup` is using this directory. Stop it and try again. |
| `web_lock_requires_review` | `.local/web.lock` is unreadable. Make sure no app process is running, then delete the file. |

## Offline checks

```sh
npm run check
```

`check` runs TypeScript, the Node tests and the browser build. It needs no key and makes no
Platform requests.

```sh
npx playwright install chromium --only-shell
npm run test:browser
# Or reuse an installed Google Chrome:
PLAYWRIGHT_CHANNEL=chrome npm run test:browser
```

The browser tests start their own server, `test/fixture-server.ts`, on port 3187. It runs the app
against a simulated Platform with temporary data and never calls the real Platform. The tests cover
desktop and mobile: starting research, live activity, reload, follow-ups, versions, Markdown export
and history. Screenshots and traces stay in ignored directories.

## Clean up

```sh
# Stop the web server first. This deletes the app's research Sessions and its Agent.
npm run cleanup
```

Cleanup deletes the Sessions recorded in `.local/conversations/`, then stops and deletes the
Agent. If anything is uncertain or fails, it keeps `.local/` so you can run it again. After a
successful cleanup the old records are moved to `.local/conversations.retired-<instance>/`, and the
next `npm run setup` starts fresh.

## Code

- `src/agent.ts`, `src/research-prompt.ts`: the Agent definition and research prompt.
- `src/main.ts`, `src/app.ts`, `src/bot.ts`: local server, application API and the Chat SDK Web adapter.
- `src/conversations.ts`, `src/turns.ts`: local research records, sending questions and following runs.
- `src/brief.ts`: turns Session events into messages, tool activity, briefs and sources.
- `src/platform.ts`, `src/web-runtime.ts`, `src/lifecycle.ts`: setup, update, cleanup and the SDK client.
- `web/`: the React reading UI.

Replies arrive as complete messages; the Platform does not stream them token by token. The app
shows no progress percentage, time estimate or cost estimate. Brief detection is best-effort: an
answer without the brief headings or citations stays in the Conversation tab, and a failed or
stopped run does not produce a brief.

Not included: public hosting, sign-in for multiple users, chat-platform adapters, scheduled
research, file upload or a separate knowledge base.

See [REFERENCES.md](REFERENCES.md) for the Vercel Chat SDK documentation this app follows.
