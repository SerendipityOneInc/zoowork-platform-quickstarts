# ZooWork Platform Quickstarts

Example applications built with [ZooWork Platform](https://platform.zoowork.ai) and the
published [TypeScript SDK](https://www.npmjs.com/package/@zoowork-ai/sdk). Each one needs only a
Platform Project key and creates its own Agent through the SDK. Each directory installs and runs
on its own.

**To build your own Agent, start with [Starter](starter/).** It is a minimal chat app with no
business logic: define the Agent in one file, run setup, and chat with it locally. It is the
companion workspace for the [Publish your Agent guide](https://zoowork.ai/guides/publish-agent).

## Applications

| Application | What you can do | SDK focus |
| --- | --- | --- |
| [Starter](starter/) | Chat with an Agent you define in one file | Agent definition, setup/update, Session streaming, approvals |
| [Customer Support](customer-support/) | Track orders and shipments; confirm and save support tickets | Custom Tools, durable Sessions and recovery |
| [Product Advisor](product-advisor/) | Search, compare and shortlist products | Remote MCP and approvals |
| [Research Assistant](research-assistant/) | Research a topic and continue a saved, sourced brief | Vercel Chat SDK |
| [Knowledge Assistant](knowledge-assistant/) | Agent setup, status and cleanup; the knowledge-base app is not built yet | External RAG (planned) |

## Run an application

Use **Node.js 22.20 or later**, on the latest security release of your line, and npm. CI and each app's `.node-version` use Node.js 24.22.1.

1. Sign in to [Platform Console](https://platform.zoowork.ai), select a Project and open
   **API Keys** to create a `zwp_live_` key. Copy it when it is shown.
2. Check Organization **Billing** and available credits. Creating an Agent needs billing set up,
   and every reply uses credits.
3. Clone the repository, enter an application directory and set your key:

```sh
git clone https://github.com/SerendipityOneInc/zoowork-platform-quickstarts.git
cd zoowork-platform-quickstarts/starter
npm ci
cp .env.example .env
# Edit .env: ZOOWORK_API_KEY=zwp_live_...
npm run setup
npm run dev
```

`setup` creates and starts the Agent; you do not create one in the Console. Each application's
README covers its own URL, walkthrough and troubleshooting.

Setup records resource IDs in the ignored `.local/` directory and reuses them on the next run.
Keep `.local/` after an error. To remove an application's Agent, stop its server and run
`npm run cleanup` in that directory.

`npm run check` typechecks and runs offline tests; it needs no key.

[Platform Console](https://platform.zoowork.ai) ·
[SDK source](https://github.com/SerendipityOneInc/zoowork-sdk-typescript) ·
[API docs](https://zoowork.ai/docs/)

MIT. See [LICENSE](LICENSE).
