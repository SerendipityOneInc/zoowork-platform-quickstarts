# ZooWork Platform Quickstarts

Example applications built on the published `@zoowork-ai/sdk`. Each directory is an independent
npm project. Work inside one directory and read its `README.md` (and `AGENTS.md`, if present).

- `starter/`: minimal chat app. The Agent is defined in `agent/agent.md`.
- `customer-support/`: Custom Tools with confirmation and durable Sessions.
- `product-advisor/`: remote MCP tools with approvals.
- `research-assistant/`: Vercel Chat SDK with saved, sourced briefs.
- `knowledge-assistant/`: Agent setup, status and cleanup only.

Rules:

- The only setting is `ZOOWORK_API_KEY`, a Platform Project key (`zwp_live_`), in the app's `.env`.
  Keep it server-side: never in browser code, logs, chat or Git.
- `npm run setup` creates the app's Agent. Do not create Agents by hand or reuse Agent IDs.
- `.local/` holds recorded resource IDs and recovery state. Do not delete it to get past an
  error; run `npm run cleanup` to remove the app's resources.
- `npm run check` runs offline and must pass after a change. Setup and chat use real credits.
