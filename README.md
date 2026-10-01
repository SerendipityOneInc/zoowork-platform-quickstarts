# ZooWork Platform Quickstarts

Four independent starters for applications built on [Platform](https://platform.zoowork.ai).
Each uses a Platform Project key and creates its own Agent through the published SDK.

## Status

Agent setup, status, cleanup and a staging lifecycle smoke are runnable in each directory.
The four feature demos will be implemented in separate sessions.

| Application | User outcome | Technical focus / status |
| --- | --- | --- |
| [customer-support/](customer-support/) | Look up orders and shipments, then create a support ticket | Custom Tool; implement first |
| [product-advisor/](product-advisor/) | Search and compare products, then build a recommendation shortlist | Remote MCP; prepare design |
| [knowledge-assistant/](knowledge-assistant/) | Ask an existing knowledge base and inspect cited evidence | External RAG; discuss design |
| [research-assistant/](research-assistant/) | Research a topic, produce a sourced brief and continue later | Vercel Chat SDK; prepare design |

## Run the foundation

Use Node 22.20+, a Project key from Platform, initialized Org billing and sufficient credits.

```sh
git clone https://github.com/SerendipityOneInc/zoowork-platform-quickstarts
cd zoowork-platform-quickstarts/customer-support
npm ci
cp .env.example .env
# Fill in the Project key and public /service/v1 API URL.
npm run check
npm run setup
npm run status
npm run cleanup
```

Setup records its create request and Agent ID under ignored `.local/` state. Repeating
setup reuses that resource. Cleanup stops/deletes only this app's recorded Agent.
The Project key stays server-side in `.env` or a secret manager.

Read [Platform and staging](docs/PLATFORM.md) before any optional live smoke.
Each demo installs independently with its own package and lockfile.

## Development

- [Outline and acceptance criteria](docs/OUTLINE.md)
- [Platform contract](docs/PLATFORM.md)
- [RAG examples and open decisions](knowledge-assistant/docs/RAG-RESEARCH.md)
- [Four session handoffs](docs/HANDOFF.md)
- [Reusable session prompt](docs/SESSION-PROMPT.md)
- [References and license policy](docs/REFERENCES.md)

Each directory installs independently and will become a complete application. Its technical
focus does not exclude other SDK capabilities. The four sessions share the published SDK
contract; application code and dependencies stay inside their own directories.

The previous templates are removed. This repository now targets Platform. Public API
docs are still being aligned; use `docs/PLATFORM.md` for this foundation's entry flow.

## Links

[Platform](https://platform.zoowork.ai) · [SDK](https://www.npmjs.com/package/@zoowork-ai/sdk) ·
[SDK source](https://github.com/SerendipityOneInc/zoowork-sdk-typescript) ·
[API docs](https://zoowork.ai/docs/)

MIT. See [LICENSE](LICENSE).
