# Product Advisor sources

Checked 2026-10-01. Application, MCP, tests, catalog descriptions and SVGs are original. No third-party application source or imagery was copied. Dependencies retain their packaged licenses; the repository license covers this example.

| Primary source | Snapshot | Used for |
| --- | --- | --- |
| [ZooWork SDK v0.9.0](https://github.com/SerendipityOneInc/zoowork-sdk-typescript/tree/6e205a2ac68f20a274583fbdfc7dc2f7379097a9) | published package `0.9.0`; `6e205a2ac68f20a274583fbdfc7dc2f7379097a9` | public Project-key client, Agent/Session/events/approvals; no local override |
| [MCP TypeScript SDK v1.29.0](https://github.com/modelcontextprotocol/typescript-sdk/tree/e12cbd7078db388152f6e839abdbe09ba01f3f32) | published package `1.29.0`; MIT | McpServer, stateless Streamable HTTP transport, Client and probe APIs; matches the inspected Engine consumer dependency |
| ZooClaw Engine | `bdfc79ec6a70a769255b8b4d4f0a24a43ab72c2b` | `packages/agent-assembly/src/mcp-config.ts`, `services/controld/src/render/mcp-permissions.ts`, `services/agent-worker/src/activities/mcp-context.ts`, tool preview/event behavior |
| claw-interface public service | inspected `73cffba7f`; later HEAD `4184093a8214cd2244f752616aac64ce23e6923f` | Project-key tenancy, resource passthrough, approvals, credentials route restrictions |
| ZooWork Agents Docs | `83ab0521fcb45db13f993d327abf001636ef9e7a` | public MCP/events/approvals contract |

Internal source snapshots are evidence for this implementation; they are not copied code or proof that a deployment already has those revisions. See PLAN.md for capability details and VALIDATION.md for actual tests.

The SDK 0.9.0 nested `McpToolPermissionOverride` type omits Engine's `requireConfirmation` field. This app declares an intersection type for its original Agent resource and passes the object through the published client; no dependency patch or consumer workaround that simulates approval is used. [SDK issue #39](https://github.com/SerendipityOneInc/zoowork-sdk-typescript/issues/39) tracks the type gap. Live validation must confirm mandatory approvals rather than relying on this type annotation.

2026-10-02 staging verified mandatory approvals through the published client, including separate approval of details/comparison and zero remote tool execution after denial. [Cloudflare Quick Tunnels documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) supports the account-free temporary catalog endpoint used by `npm run demo`; the implementation uses JSON HTTP responses and does not tunnel the Web SSE stream. No Cloudflare source code was copied.

Startup waits for tunnel registration and checks the generated hostname through [Cloudflare's documented DNS-over-HTTPS JSON endpoint](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/), before making the first local lookup. Only the public generated hostname is sent, without Project credentials or user content.

All 18 products are invented. Illustrations in `public/products/*.svg` use original simple geometry, share category artwork, and are not physical model photos. No real review, merchant, stock photo, or trademark claim is introduced.
