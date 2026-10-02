# Product Advisor

A complete Platform remote MCP example. Users enter a budget and requirements, search a catalog, review evidence-backed product cards, compare specifications, and adjust their requirements in the same conversation. Product facts come from successful remote MCP snapshots.

The interface, Agent responses, examples, catalog, and documentation are in English. Currency remains **CNY**. The catalog contains six invented laptops, six monitors, and six headphones. All names, prices, specifications, and illustrations are synthetic. There are no real merchant offers or purchase links. Missing specifications are displayed as “Not provided by catalog” and never treated as satisfying a hard requirement.

## Install and check offline

Requires Node **22.20+** and npm. This directory installs independently, without sibling repositories or a local SDK override. The full local demo also requires `cloudflared` to make the bundled MCP accessible to the cloud Platform. It needs no additional account or key. On macOS run `brew install cloudflared`; see the [official installation instructions](https://developers.cloudflare.com/tunnel/get-started/) for other systems.

```sh
npm ci
npm run check
npm run build
```

`check` runs TypeScript and offline tests. Tests use the official MCP client against a real local HTTP server. Platform lifecycle, events, and approvals use a test-only adapter and consume no model tokens. Checks need no credentials or staging connection.

Without a Project key, `npm run dev` opens an unconfigured interface and generates no mock recommendations.

## Run the full demo with one key

```sh
npm ci
cp .env.example .env
# Fill only ZOOWORK_API_KEY with your Platform Project key (zwp_live_).
npm run demo
# Open http://localhost:4310
```

This entry uses the real published SDK and Platform. It starts the bundled synthetic catalog, creates a temporary HTTPS tunnel, verifies tool discovery, creates or reuses the app-owned Agent, and starts the Web app. The Project key stays in the application process and is excluded from the tunnel process. Only the synthetic catalog is exposed publicly; the Web API is not tunneled. A private cookie secret is generated in `.local/cookie-secret` and reused on restart.

The default API address comes from the published SDK's production default. For an authorized staging test, also set `ZOOWORK_BASE_URL=https://claw-interface.ecap.yesy.live/service/v1`. Do not send a staging key to the production address. Local configuration and temporary tunnel addresses are not committed.

The temporary hostname changes on restart. The launcher saves an exact pending resource before updating the same owned Agent through the SDK. Ambiguous results retain the original request for recovery instead of creating a replacement Agent. Ctrl+C closes the local Web server, MCP, and tunnel; remote Agent/Session records and local history remain. Use `npm run cleanup` to remove the recorded remote resources.

Quick Tunnels are intended for local demos, with no stable address or uptime guarantee. This MCP uses JSON responses for Streamable HTTP. The Web application's SSE stays local. [Quick Tunnel limitations](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) make it unsuitable for other servers that require remote SSE. If you already host this MCP, set `MCP_PUBLIC_URL` to skip the bundled server and tunnel.

## Probe the MCP server

```sh
# Terminal A, in this directory.
npm run mcp:dev
# Terminal B.
npm run mcp:probe -- http://localhost:4311/mcp
```

The standalone server listens on `localhost:4311` by default. The probe checks initialization, discovery of all three tools, an actual search, receipt extraction from a short preview, and retrieval of the full result. This proves local MCP operation, not cloud Platform access to localhost.

| Tool | Input | Result |
| --- | --- | --- |
| `search_products` | category, budget in CNY minor units, typed filters, optional model query, limit | Filtered summaries, price, key specifications, total, version, receipt |
| `get_products` | 1–4 product IDs and exact catalogVersion | Full facts, with unknown fields retained as null |
| `compare_products` | 2–4 IDs in the same category and version, optional attributes | A specification matrix with each product's original values |

Amounts are integer minor units: CNY 6500 is `650000`. Tools accept no user identity or arbitrary external URL. Comparison returns facts without speculative scores. The model ranks candidates; the application validates the facts.

## Make the catalog accessible to Platform

Engine executes MCP remotely and cannot access a developer's localhost. The current Project-key API supports public, unauthenticated HTTP MCP. The public gateway does not allow configuring authenticated MCP credentials, so this server exposes only public synthetic facts.

`npm run demo` prepares a temporary development tunnel automatically. For separate hosting, use a Node host or an authorized tunnel with these routes under the same HTTPS origin:

- `POST /mcp`: stateless Streamable HTTP with JSON responses.
- `GET /health`: catalog version and synthetic marker.
- `GET /evidence/:receiptId`: read an already executed result without a new tool call.
- `/unavailable/mcp`: intentionally unhandled, returning 404 for controlled failure verification.

The TLS proxy must preserve MCP headers such as `Accept`, `Content-Type`, and `MCP-Protocol-Version`, and the request body. Do not redirect `/mcp` to a login page or another origin. If using a path prefix, forward evidence paths consistently. Engine still applies its egress and DNS checks.

The directory includes a standalone MCP Docker image. These commands build and run it locally; they do not deploy it:

```sh
docker build -t product-advisor-mcp .
docker run --rm -p 127.0.0.1:4311:4311 \
  --mount type=volume,src=product-advisor-catalog,dst=/app/.local \
  product-advisor-mcp
```

The image runs as a non-root user. Its volume stores receipts and private audit records. It listens on `0.0.0.0:4311` inside the container; the host port is loopback-only. Public hosting requires an authorized TLS proxy. Use `MCP_ALLOWED_HOSTS` to constrain Host. Incoming Origin is rejected by default; allow selected browser MCP clients with `MCP_ALLOWED_ORIGINS`. Platform server-to-server requests normally omit Origin.

Probe your public endpoint with `npm run mcp:probe -- https://your-authorized-host.example/mcp`. A local read probe is still separate from an actual Platform turn.

## Manual setup and hosting

```sh
cp .env.example .env
# Set server-side ZOOWORK_API_KEY, ZOOWORK_BASE_URL, and MCP_PUBLIC_URL.
# APP_COOKIE_SECRET is optional; it is generated and saved when omitted.
# Default APP_ORIGIN is http://localhost:4310.
npm run setup
npm run dev
```

The key must be a Platform Project key (`zwp_live_`). The gateway determines Org/Project/owner tenancy. Setup creates the app's own Agent and saves its exact resource, creation key, and returned ID in `.local/agent.json`. Repeating setup reuses that state. Do not supply an existing Work Agent ID.

The Agent declares the `catalog` MCP server, direct exposure, and three exact tools. Search is `always_allow`; details and comparison are `always_ask` with `requireConfirmation: true`. SDK 0.9.0 omits this nested field from its type, so this app uses a structurally compatible intersection type and the published client's normal serialization. No SDK patch is used. Separate native approvals, allow-once, and denial passed staging on 2026-10-02. The type gap is tracked in [SDK issue #39](https://github.com/SerendipityOneInc/zoowork-sdk-typescript/issues/39). Other deployments require their own verification.

After changing the URL, model, or persona, stop the local app and run:

```sh
npm run configure
npm run dev
```

Configure verifies owned labels, saves the exact pending resource, and sends an update. An uncertain response is recovered with that same resource rather than assuming new environment values were applied. Do not change the Agent during an active turn.

For a local production build:

```sh
npm run build
npm start
```

`APP_ORIGIN` must match the browser's exact origin. Write APIs validate Origin. Use `localhost` consistently; do not mix it with `127.0.0.1`. `APP_HOST` and `PORT` control the server listener. Public Web hosting additionally needs real authentication, HTTPS, access policy, and operations configuration. The demo cookie only establishes local visitor ownership.

The production server and offline UI harness limit page/static requests to 300 per IP per minute. Excess requests return 429 and `Retry-After`. API and SSE requests do not count toward this page limit.

## Walkthrough

1. Choose the Laptop / CNY 6500 example, with office/coding needs and at least 16 GB RAM. Real catalog filtering excludes over-budget, insufficient-memory, and unavailable products.
2. Review up to three recommendations. Cards show catalog prices, budget differences, known specifications, unknown fields, and evidence. Facts are hydrated from receipts rather than copied from the model's text.
3. Choose **View full specifications** and allow once or deny the native approval. Select 2–4 products of the same version, choose **Compare selected products**, approve, and view the remote specification matrix.
4. Follow up with **Lower the budget to CNY 5000.** The backend applies the explicit budget change. New recommendations must meet the new budget; earlier snapshots keep their original conditions and prices.
5. Expand **View MCP calls and request JSON** for tool names, real arguments, approval/returned/unexecuted states, and receipts. Debug stays a compact text disclosure. The offline harness explicitly labels simulated Platform events.
6. Reload and restore the conversation from history. SQLite retains tool states, approvals, comparison selection, and evidence. The persistent cookie secret preserves visitor identity across restarts.

The form defines confirmed hard requirements. Explicit English budget, RAM, and maximum-weight statements also update those requirements. Ambiguous changes require clarification or editing the form. The model has no strict JSON-output API; an invalid final block leaves validated candidates available with an explanation, without an automatic paid repair turn.

## Approval and failure recovery

| State | Application behavior |
| --- | --- |
| tool phase=blocked without deniedReason | Not executed; await the native approval for the same Session |
| tool deniedReason=approval-denied | Denied and shown as “Not executed”; the actual event sequence has no tool-end |
| resolve returns signaled / 202 | Show “Decision submitted” and wait for native approval/execution events; submission is not execution |
| Denial / timeout | No substitute local tool or receipt read for the denied action; keep successful search summaries |
| Uncertain approval delivery | Persist the original decision; only that decision may be resubmitted |
| approvals API returns 501 | Show native approvals unavailable and stop waiting; never simulate approval |
| MCP connection/authentication failed | Show the catalog failure; no new recommendation without new evidence |
| Missing/expired receipt | Persist a hydration job; bounded read retries or explicit read recovery |
| Uncertain message delivery | Keep the exact request/key; Resume delivery reuses it without creating a new paid turn |
| Event stream interrupted | Resume cursor and replay REST events, deduplicate by seq, pair tools by toolCallId |

Remote receipts are retained for at least 24 hours. Once hydrated, local snapshots preserve history independently of remote availability. Engine currently limits `resultPreview` to 512 characters. The receipt appears near the start of structuredContent. The backend extracts a constrained ID only from a successful tool-end event and reads evidence from the fixed configured origin. A model-generated receipt or URL cannot replace execution evidence.

Each new recommendation must cite a successful receipt from that turn. During connection failure, earlier snapshots remain readable but cannot support a new recommendation. Concurrent follow-ups in one conversation accept only one active request and preserve its saved body.

Public receipts contain only synthetic facts, with no user text, visitor identity, Session, runtime context, or key. Private audit retains bounded runtime coordinates for correlation; context is not authentication. The browser receives no Project key and cannot select an arbitrary Agent/Session/actor.

## Offline browser verification

```sh
npm run build
npm run test:ui
# http://localhost:4390
```

This test-only harness uses mock Platform lifecycle/events/approvals and an actual HTTP MCP catalog. It needs no key, is excluded from the production bundle, and never serves as a live fallback. It demonstrates shopping, denial, approved comparison, budget follow-ups, reload, and responsive layout. It is not proof of deployed Platform MCP or approval behavior.

## Staging and cleanup

Run live checks only with explicit authorization. The foundation smoke uses one temporary Agent/Session and one model turn without the catalog, so it is not feature evidence:

```sh
npm run test:staging -- --confirm-staging
```

Feature verification needs an authorized public endpoint and `MCP_AUDIT_DB` for that same MCP instance, to verify zero execution after denial:

```sh
npm run test:feature-staging -- --confirm-staging
```

This creates at most one temporary Agent, two Sessions, and four user turns: search plus separately approved details/comparison, a lower-budget follow-up, search plus denied details, and an unavailable endpoint on the same test Agent. Paid turns are never retried automatically. Missing approval, receipt, comparison, or audit correlation fails the check. Actual staging passed on 2026-10-02; SDK events and server audit agreed on zero denied-tool execution.

```sh
# Stop the local Web app before cleaning recorded Sessions and Agent.
npm run cleanup
# If smoke/feature cleanup failed, use the exact reported filename.
npm run cleanup -- feature-<recorded-instance>.json
```

Cleanup uses only recorded IDs, matching Agent labels, and matching Session metadata. Ambiguous creation or failed deletion retains recovery state. Never scan a Project to choose resources, delete `.local`, or create a replacement Agent automatically. SQLite conversation records are cleared only after Agent stop/delete succeeds.

## Structure and evidence

- `mcp/`, `data/`: standalone read-only MCP and original catalog.
- `src/server/`: SDK Sessions, native approvals, receipt hydration, same-origin API.
- `src/storage/`: SQLite conversation ledger and receipt/audit stores.
- `src/ui/`, `public/products/`: interface and original SVG illustrations.
- `test/`: domain, HTTP MCP, approval, delivery recovery, ownership, and foundation checks.
- [PLAN.md](PLAN.md): scope, platform contract, implementation, and acceptance criteria.
- [VALIDATION.md](VALIDATION.md): actual results and verification boundaries.
- [REFERENCES.md](REFERENCES.md): protocol and source snapshots.
