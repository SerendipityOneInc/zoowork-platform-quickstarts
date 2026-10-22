# Platform contract and verification

Checked 2026-10-01: ECAP `73cffba7f`, TypeScript SDK release `0.9.0`, public docs `83ab052`.
Source support and deployed availability must be verified separately.

## Resource flow

Platform Console manages Organization, Project, Project keys, prepaid billing and Usage.
The application's backend uses a `zwp_live_` key on `/service/v1` and creates an Agent
with `createAgent({ resource })`. The gateway supplies owner/Org/Project; do not invent
ownership or ask users for those selectors. Agents cannot be borrowed across Projects.

All Projects in an Org share its prepaid wallet. Agent creation requires valid bound owner
credentials and initialized Org billing. A model turn also needs sufficient credits.
Published names remain `@zoowork-ai/sdk`, `ZOOWORK_API_KEY`, `ZOOWORK_BASE_URL`.

## Foundation commands

| Command | Effect |
| --- | --- |
| `npm run check` | Typecheck and offline tests; no key needed |
| `npm run setup` | Create/reuse this demo's Agent and start it |
| `npm run status` | Read the recorded Agent |
| `npm run cleanup` | Verify labels, stop and delete only the recorded Agent |
| `npm run test:staging -- --confirm-staging` | Temporary Agent/Session, one turn, history check and cleanup |

Setup saves its exact create body and idempotency key before creating. Repeating an
ambiguous request uses that body/key. A recorded Agent returning 404 is not automatically
recreated: verify deployment, Project key and resource status first. Edit config before
initial setup; feature sessions can add an explicit update command.

Ignored `.local/` state contains IDs and recovery facts, no credentials. Keep it after
failed cleanup or ambiguous creation. Cleanup does not enumerate Projects for deletion.

## Staging

Staging checks are for maintainers; the demo READMEs do not cover them. Run them only with explicit
authorization. Inject a staging Project key server-side and set
`ZOOWORK_BASE_URL=https://claw-interface.ecap.yesy.live/service/v1`. Without it the demos use the
SDK's production default, which every staging command refuses.

The smoke only accepts `https://claw-interface.ecap.yesy.live/service/v1`, rejects redirects
and out-of-prefix requests, bounds the main phase to 180 seconds and reserves cleanup time.
No automatic paid retry. It validates lifecycle and stream/REST agreement, not feature demos.

On Finn's machine, authorized operators may inject the SDK staging config from
`~/.config/zoo-debug/staging/service-api.json` directly into the child process without
printing the key or writing it in this repo. Do not read production config for staging.
Saved credentials and confirmation flags alone do not grant live-test authorization.

Each demo also has `npm run test:staging -- --confirm-staging`: one temporary Agent/Session, one
model turn, stream/history consistency and cleanup. A failed cleanup keeps a private
`.local/smoke-*.json` record and prints the exact recovery command. Do not delete ambiguous state
or repeat a paid smoke automatically. Run the commands below from the demo's directory.

### Customer Support

```sh
npm run test:feature-staging -- --confirm-staging
```

The feature check creates **one temporary Agent and one Session**, uses **four user turns**, checks
real order/shipment Custom Tools, a follow-up, cancellation, confirmation, pending-call restart and
idempotency, then deletes the recorded resources. The main request phase is bounded to 180 seconds,
with a separate cleanup budget. Failure keeps a private recovery record/database and prints its exact
cleanup command. No credentials enter Git or the database.

`npm run test:staging -- --confirm-staging` remains the smaller lifecycle-only smoke; it does not
prove the application's Custom Tool workflow.

### Product Advisor

```sh
npm run test:staging -- --confirm-staging
npm run test:feature-staging -- --confirm-staging
```

The first is the foundation smoke: one temporary Agent/Session and one model turn without the
catalog, so it is not feature evidence. Feature verification needs an authorized public endpoint
and `MCP_AUDIT_DB` for that same MCP instance, to verify zero execution after denial. It creates at
most one temporary Agent, two Sessions, and four user turns: search plus separately approved
details/comparison, a lower-budget follow-up, search plus denied details, and an unavailable
endpoint on the same test Agent. Paid turns are never retried automatically. Missing approval,
receipt, comparison, or audit correlation fails the check. Actual staging passed on 2026-10-02;
SDK events and server audit agreed on zero denied-tool execution. If cleanup fails, run the
`npm run cleanup -- <reported file>` command it prints.

### Research Assistant

```sh
npm run test:research-staging
# Session regression: tools disabled, two short text turns.
npm run test:research-staging -- --session-only
# Original lifecycle-only smoke:
npm run test:staging -- --confirm-staging
```

The research check creates at most one temporary Agent, two Sessions and two user turns. Main
phase: 180 seconds. Cleanup: 60 seconds. It never retries a billable input. Default mode checks
real search/fetch, cited brief, durable replay, Markdown export, continuation and an empty
independent Session. Session-only mode checks continuation/context with a tiny output budget; it
does not prove search. Cleanup verifies recorded Agent labels and Session metadata. Failed or
ambiguous creation/cleanup preserves `.local/research-smoke-*.json` and conversation records, and
prints the exact recovery command. It never scans a Project to choose deletion targets. See
[actual validation](../research-assistant/VALIDATION.md).

## Current limits

- Custom Tool work is application-executed; recover pending calls after restart.
- External MCP requires public remote HTTP/SSE and currently supports unauthenticated
  endpoints through this public API. Credential-write routes remain unavailable.
- `streamEvents` supplies durable events and complete `agent.assistant` replies. It does
  not request `?deltas=agent.message`. That preview lane uses snapshot replacement and
  may return `501`; a generic append-delta bridge is incorrect.
- ECAP #3976 enables Agent webhooks for Project keys in source. SDK management helpers
  and live receiver verification are separate follow-ups. This foundation uses SSE.
- Top-level Skills/Environment management is not exposed by the current Project-key router.
  Use the default environment for the foundation.

## Sources

- [Platform product](https://github.com/SerendipityOneInc/ecap-workspace/blob/73cffba7f/web/platform/PRODUCT.md)
- [Project-key runtime](https://github.com/SerendipityOneInc/ecap-workspace/blob/73cffba7f/docs/superpowers/specs/2026-09-30-platform-project-key-runtime.md)
- [Public gateway](https://github.com/SerendipityOneInc/ecap-workspace/blob/73cffba7f/services/claw-interface/app/routes/service_api/router.py)
- [Agent access](https://github.com/SerendipityOneInc/ecap-workspace/blob/73cffba7f/services/claw-interface/app/routes/service_api/_agents.py)
- [SDK release](https://github.com/SerendipityOneInc/zoowork-sdk-typescript/releases/tag/v0.9.0)
- [Tools](https://zoowork.ai/docs/en/build/tools), [MCP](https://zoowork.ai/docs/en/build/mcp), [events](https://zoowork.ai/docs/en/build/events)
