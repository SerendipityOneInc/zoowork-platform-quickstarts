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

The smoke only accepts `https://claw-interface.ecap.yesy.live/service/v1`, rejects redirects
and out-of-prefix requests, bounds the main phase to 180 seconds and reserves cleanup time.
No automatic paid retry. It validates lifecycle and stream/REST agreement, not feature demos.

On Finn's machine, authorized operators may inject the SDK staging config from
`~/.config/zoo-debug/staging/service-api.json` directly into the child process without
printing the key or writing it in this repo. Do not read production config for staging.
Saved credentials and confirmation flags alone do not grant live-test authorization.

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
