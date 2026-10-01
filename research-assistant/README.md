# Research Assistant

Status: runnable Platform lifecycle foundation. The Research Assistant application is not implemented yet.

Read [the outline](../docs/OUTLINE.md), [Platform contract](../docs/PLATFORM.md) and
[session handoff](../docs/handoffs/research-assistant.md).

## Planned application

A research app: enter a topic, follow research progress, receive a brief with sources, and return to the saved conversation to refine or export the brief.

Read [the application plan](PLAN.md) for scope and acceptance criteria.

## Run the foundation

Use Node 22.20+, a Platform Project key and the public API URL.

```sh
npm ci
cp .env.example .env
# Fill in the Project key and base URL.
npm run check
npm run setup
npm run status
npm run cleanup
```

Setup creates this app's Agent through the SDK. Its ignored `.local/agent.json` stores
the exact create request, idempotency identity and returned Agent ID. Setup reuses it.
Config changes after setup need an explicit update flow or cleanup followed by setup.
Keep recovery state after failures; do not manually substitute another Agent ID.

## Staging smoke

With explicit authorization, inject a staging Project key and set
`ZOOWORK_BASE_URL=https://claw-interface.ecap.yesy.live/service/v1`, then run:

```sh
npm run test:staging -- --confirm-staging
```

This tests one temporary Agent/Session, one model turn, stream/history consistency and
cleanup. It does not test the unfinished application features. A failed cleanup keeps a
private `.local/smoke-*.json` record and prints the exact recovery command.
Do not delete ambiguous state or repeat a paid smoke automatically.

## Files

- `src/agent.ts`: this demo's Agent configuration.
- `src/platform.ts`: Project-key config, bounded client, lifecycle and recovery state.
- `scripts/platform.ts`: setup/status/cleanup commands.
- `scripts/staging.ts`: bounded staging smoke.
- `test/platform.test.ts`: offline lifecycle/scope/recovery checks.

The feature session owns this directory. No sibling imports or workspace links.
