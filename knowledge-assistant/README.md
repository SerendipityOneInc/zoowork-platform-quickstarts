# Knowledge Assistant

Status: runnable Platform lifecycle foundation. The Knowledge Assistant application is not implemented yet.

Read [the outline](../docs/OUTLINE.md), [Platform contract](../docs/PLATFORM.md) and
[session handoff](../docs/handoffs/knowledge-assistant.md).

## Planned application

A knowledge Q&A app: connect an existing retrieval service, answer with inspectable source citations, and explain when the corpus does not contain an answer. Provider and ingestion scope are still to discuss.

Read [the application plan](PLAN.md) and [RAG research](docs/RAG-RESEARCH.md). Discussion comes before implementation.

## Run the foundation

Use Node.js 22 or later, on the latest security release of your line, and a Platform Project key.

```sh
npm ci
cp .env.example .env
# Fill in the Project key.
npm run check
npm run setup
npm run status
npm run cleanup
```

Setup creates this app's Agent through the SDK. Its ignored `.local/agent.json` stores
the exact create request, idempotency identity and returned Agent ID. Setup reuses it.
Config changes after setup need an explicit update flow or cleanup followed by setup.
Keep recovery state after failures; do not manually substitute another Agent ID.

## Files

- `src/agent.ts`: this demo's Agent configuration.
- `src/platform.ts`: Project-key config, lifecycle and recovery state.
- `scripts/platform.ts`: setup/status/cleanup commands.
- `test/platform.test.ts`: offline lifecycle/scope/recovery checks.

The feature session owns this directory. No sibling imports or workspace links.
