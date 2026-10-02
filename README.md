# ZooWork Platform Quickstarts

Independent application starters built with [ZooWork Platform](https://platform.zoowork.ai)
and the published [TypeScript SDK](https://www.npmjs.com/package/@zoowork-ai/sdk).
Each application uses a server-side **Project key** (`zwp_live_`) and creates its own Agent
through the SDK. Each directory has its own dependencies, configuration and local state.

**Start with Customer Support.** It is a complete browser workbench: look up an order,
check its shipment, ask follow-up questions and create an after-sales ticket after confirmation.
Tool calls, order details and saved ticket status are visible in the UI. You can try it offline
before connecting your Project key.

## Applications

The status below describes the application code in this branch. A lifecycle foundation
provides Agent setup/status/cleanup; it does not yet provide the planned browser application.

| Application | User outcome | SDK focus | Status |
| --- | --- | --- | --- |
| [Customer Support](customer-support/) | Track orders and shipments; confirm and save support tickets | Custom Tools, durable Sessions and recovery | Runnable application; offline browser and actual staging verification |
| [Product Advisor](product-advisor/) | Search, compare and shortlist products | Remote MCP | Lifecycle foundation; application development in [PR #22](https://github.com/SerendipityOneInc/zoowork-platform-quickstarts/pull/22) |
| [Knowledge Assistant](knowledge-assistant/) | Ask an existing knowledge base and inspect citations | External RAG | Lifecycle foundation; retrieval design in progress |
| [Research Assistant](research-assistant/) | Research a topic and continue a saved sourced brief | Vercel Chat SDK | Lifecycle foundation; application development in [PR #21](https://github.com/SerendipityOneInc/zoowork-platform-quickstarts/pull/21) |

Application features and dependencies stay inside their directories. See each app's README
and PLAN for its current scope. Main publication follows the [integration handoff](docs/HANDOFF.md).

## Try Customer Support without a key

Use **Node 22.20+** and npm. Clone the repository:

```sh
git clone https://github.com/SerendipityOneInc/zoowork-platform-quickstarts.git
cd zoowork-platform-quickstarts
```

If your checkout still contains `custom-tool/`, `mcp/`, `rag/` and `chat-sdk/`, the application
integration has not reached its default branch. In this fresh, clean checkout, select it first:

```sh
git switch --track origin/feature/platform-demo-handoffs
```

If `customer-support/` is already present, skip that switch. The
[integration handoff](docs/HANDOFF.md#foundation-and-isolation) explains the branch relationship.
Then run:

```sh
cd customer-support
npm ci
npm run demo:offline
```

Open **http://localhost:4600**. This mode uses simulated Agent replies and the real local
business handlers. No Platform request or model call is made. Orders and shipments are
synthetic; tickets record a request and do not issue refunds or contact a carrier.
The offline database is in memory and resets when the process stops.

## Connect your Project key

1. Sign in to [Platform Console](https://platform.zoowork.ai), select a Project and open
   **API Keys** to create a `zwp_live_` key. Copy the secret when it is shown.
2. Check Organization **Billing** and available credits. Agent creation needs initialized
   billing; real model turns consume credits shared by the Organization's Projects.
3. Stop the offline preview, copy `.env.example` to `.env`, and set `ZOOWORK_API_KEY` and
   the matching public `/service/v1` `ZOOWORK_BASE_URL`. Keep the key server-side and out of Git.

From `customer-support/`:

```sh
cp .env.example .env
# Edit .env with your Project key and matching API URL before continuing.
npm run check
npm run setup
npm run dev
```

`setup` creates and starts the Agent; no manually created Agent or Agent ID is required.
Open **http://localhost:4600**, choose **Track ORD-1001** and click **Send** to see the tools
and Agent reply.
Platform mode persists messages, pending confirmations and tickets across restarts.
See [Customer Support setup, walkthrough and troubleshooting](customer-support/README.md).

## Checks, state and cleanup

Every app supports `npm ci` and `npm run check` from its own directory. CI runs offline
and needs no credentials. Customer Support also has a complete browser workflow check;
see [its verification evidence](customer-support/docs/VALIDATION.md). The other applications
currently share [the lifecycle verification](docs/VALIDATION.md).

Setup records exact creation requests and resource IDs under ignored `.local/` state.
Repeat setup to reuse recorded resources. Keep this state after an uncertain operation or
failed cleanup. To remove an app's recorded resources, stop its server, then run
`npm run cleanup` from that app's directory. Cleanup verifies ownership and only operates
on recorded resources.

Live tests require explicit authorization. Read [Platform and staging](docs/PLATFORM.md)
before an optional live check. Offline verification and actual live evidence are documented
separately; a working offline preview does not prove SDK or deployed API integration.

## Development and references

- [Scope and delivery criteria](docs/OUTLINE.md)
- [Platform contract and entry flow](docs/PLATFORM.md)
- [Application assignments and integration](docs/HANDOFF.md)
- [Session prompt](docs/SESSION-PROMPT.md)
- [Knowledge Assistant research](knowledge-assistant/docs/RAG-RESEARCH.md)
- [Sources and license policy](docs/REFERENCES.md)

This repository uses Platform Project keys and SDK-created Agents. The former Work-based
`chat/`, `skill-lab/` and `app-kit/` templates have been removed. Public API docs may still
contain the older organization-key flow; use this repository's Project-key setup instructions.

[Platform Console](https://platform.zoowork.ai) ·
[SDK source](https://github.com/SerendipityOneInc/zoowork-sdk-typescript) ·
[API docs](https://zoowork.ai/docs/)

MIT. See [LICENSE](LICENSE).
