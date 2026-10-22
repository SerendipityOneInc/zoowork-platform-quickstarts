# ZooWork Platform Quickstarts

Independent application starters built with [ZooWork Platform](https://platform.zoowork.ai)
and the published [TypeScript SDK](https://www.npmjs.com/package/@zoowork-ai/sdk).
Each application uses a server-side **Project key** (`zwp_live_`) and creates its own Agent
through the SDK. Each directory has its own dependencies, configuration and local state.

**To build your own Agent, start with [Starter](starter/).** It is a minimal chat app with no
business logic: define the Agent in one file, run setup, and chat with it locally. It is the
companion workspace for the [Publish your Agent guide](https://zoowork.ai/guides/publish-agent).

**To see a complete scenario, start with Customer Support.** It is a browser workbench: look up
an order, check its shipment, ask follow-up questions and create an after-sales ticket after
confirmation. Tool calls, order details and saved ticket status are visible in the UI. It runs
a real Agent with your Project key.

## Applications

[Starter](starter/) is the general starting point. The four capability demos each show one SDK
feature inside a business scenario. Knowledge Assistant still has only the lifecycle foundation
(Agent setup/status/cleanup), without the planned browser application.

| Application | User outcome | SDK focus | Status |
| --- | --- | --- | --- |
| [Starter](starter/) | Chat with an Agent you define in one file; take it into your product | Agent definition, setup/update, durable Session streaming, approvals | Runnable application; offline checks |
| [Customer Support](customer-support/) | Track orders and shipments; confirm and save support tickets | Custom Tools, durable Sessions and recovery | Runnable application; offline browser checks |
| [Product Advisor](product-advisor/) | Search, compare and shortlist products | Remote MCP | Runnable application, merged in [PR #22](https://github.com/SerendipityOneInc/zoowork-platform-quickstarts/pull/22) |
| [Knowledge Assistant](knowledge-assistant/) | Ask an existing knowledge base and inspect citations | External RAG | Lifecycle foundation; retrieval design in progress |
| [Research Assistant](research-assistant/) | Research a topic and continue a saved sourced brief | Vercel Chat SDK | Runnable application, merged in [PR #21](https://github.com/SerendipityOneInc/zoowork-platform-quickstarts/pull/21) |

Application features and dependencies stay inside their directories. See each app's README
and PLAN for its current scope. Main publication follows the [integration handoff](docs/HANDOFF.md).

## Run Customer Support

Use **Node 22.20+** and npm.

1. Sign in to [Platform Console](https://platform.zoowork.ai), select a Project and open
   **API Keys** to create a `zwp_live_` key. Copy the secret when it is shown.
2. Check Organization **Billing** and available credits. Agent creation needs initialized
   billing; real model turns consume credits shared by the Organization's Projects.
3. Clone the repository, copy `.env.example` to `.env`, and set `ZOOWORK_API_KEY`. Keep the
   key server-side and out of Git.

```sh
git clone https://github.com/SerendipityOneInc/zoowork-platform-quickstarts.git
cd zoowork-platform-quickstarts/customer-support
npm ci
cp .env.example .env
# Edit .env with your Project key before continuing.
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
describe their checks in their own READMEs; the shared [lifecycle verification](docs/VALIDATION.md)
covers the foundation.

Setup records exact creation requests and resource IDs under ignored `.local/` state.
Repeat setup to reuse recorded resources. Keep this state after an uncertain operation or
failed cleanup. To remove an app's recorded resources, stop its server, then run
`npm run cleanup` from that app's directory. Cleanup verifies ownership and only operates
on recorded resources.

See [the Platform contract](docs/PLATFORM.md) for the resource flow and current limits. Offline verification and actual live evidence are documented
separately; passing offline tests do not prove SDK or deployed API integration.

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
