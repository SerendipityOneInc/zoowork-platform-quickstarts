# Platform Quickstarts

Four independent starters for applications built on [Platform](https://platform.zoowork.ai).
Each uses a Platform Project key and creates its own Agent through the published SDK.

## Status

Agent setup, status, cleanup and a staging lifecycle smoke are runnable in each directory.
The four feature demos will be implemented in separate sessions.

| Directory | Planned demo | Status |
| --- | --- | --- |
| [custom-tool/](custom-tool/) | Order assistant with application-executed tools | Foundation ready |
| [mcp/](mcp/) | Public remote MCP and approvals | Foundation ready |
| [rag/](rag/) | External knowledge Q&A with citations | Foundation ready; provider/UX to discuss |
| [chat-sdk/](chat-sdk/) | Vercel Chat SDK Web adapter with persistent Platform Sessions | Foundation ready |

## Run the foundation

Use Node 22.20+, a Project key from Platform, initialized Org billing and sufficient credits.

```sh
git clone https://github.com/SerendipityOneInc/zoowork-quickstarts
cd zoowork-quickstarts/custom-tool
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
- [RAG examples and open decisions](docs/RAG-RESEARCH.md)
- [Four session handoffs](docs/HANDOFF.md)
- [References and license policy](docs/REFERENCES.md)

The previous templates are removed. This repository now targets Platform. Public API
docs are still being aligned; use `docs/PLATFORM.md` for this foundation's entry flow.

## Links

[Platform](https://platform.zoowork.ai) · [SDK](https://www.npmjs.com/package/@zoowork-ai/sdk) ·
[SDK source](https://github.com/SerendipityOneInc/zoowork-sdk-typescript) ·
[API docs](https://zoowork.ai/docs/)

MIT. See [LICENSE](LICENSE).
