# Product Advisor

A shopping assistant that gets its product facts from a remote MCP server. Users enter a budget
and requirements, the Agent searches a catalog through MCP, and the app shows product cards,
full specifications and side-by-side comparisons. Viewing full specifications and comparing
products ask for your approval first.

All catalog data is invented: six laptops, six monitors and six headphones, priced in CNY. There
are no real offers or purchase links. A specification the catalog does not provide is shown as
"Not provided by catalog" and never counts as meeting a requirement.

## Requirements

- Node.js **22.20 or later**, on the latest security release of your line, and npm.
- A ZooWork Platform **Project key** (`zwp_live_…`) and Organization credits. Create the key in
  [Platform Console](https://platform.zoowork.ai) under your Project's **API Keys**. Every Agent
  reply uses credits.
- [`cloudflared`](https://developers.cloudflare.com/tunnel/get-started/) for the one-command demo.
  On macOS: `brew install cloudflared`. It needs no Cloudflare account.

## Run the demo

```sh
git clone https://github.com/SerendipityOneInc/zoowork-platform-quickstarts.git
cd zoowork-platform-quickstarts/product-advisor
npm ci
cp .env.example .env
# Edit .env and set ZOOWORK_API_KEY=zwp_live_...
npm run demo
```

Open **http://localhost:4310** when the terminal prints `Product Advisor: http://localhost:4310`.

The Agent runs on ZooWork Platform, so it cannot reach an MCP server on your `localhost`.
`npm run demo` therefore:

1. starts the bundled catalog MCP server locally,
2. opens a temporary public HTTPS address for it with a Cloudflare Quick Tunnel,
3. waits until that address resolves and answers (usually about 15 seconds, at most 90),
4. creates this app's Agent, or points the existing one at the new address,
5. starts the web app.

Only the synthetic catalog is reachable through the tunnel. The web app and your key stay on
your machine; the key is not passed to `cloudflared`.

The tunnel address changes on every start, and Quick Tunnels have no uptime guarantee. Press
Ctrl+C to stop the web app, the catalog and the tunnel. The Agent and its conversations stay on
Platform until you run `npm run cleanup`.

## Walkthrough

1. Choose the **Laptop · CNY 6500** example (office work and coding, at least 16 GB RAM) and
   select **Find products**. The catalog search drops products that are over budget, have too
   little RAM or are unavailable. Up to three picks appear as cards.
2. Select **View full specifications** on a card. An approval card names the product and the
   catalog version. Choose **Allow once**: a **Full specifications** table appears below the
   cards. Choose **Deny** instead and nothing is fetched; the cards keep their search results.
3. Tick **Compare** on two to four products of the same category, then **Compare selected
   products** and approve. A **Specification comparison** table appears.
4. Send **Lower the budget to CNY 5000.** as a follow-up. The app updates the budget, the Agent
   searches again, and only products within the new budget are recommended.
5. Expand **View MCP calls and request JSON** to see each tool call, its arguments and whether
   it ran, was denied or is waiting for approval.
6. Reload the page and open the conversation from the sidebar. Its messages, approvals,
   specifications and comparison come back.

Product facts on the page always come from catalog tool results, not from the Agent's wording.
If the Agent's final answer cannot be read, the verified candidates stay on the page with a short
explanation; the app does not start another paid turn to fix it.

## The catalog MCP server

| Tool | Input | Returns |
| --- | --- | --- |
| `search_products` | category, budget in CNY minor units, typed filters, optional exact model name, limit | Matching product summaries and the catalog version |
| `get_products` | 1–4 product IDs and the catalog version | Full specifications; unknown fields stay `null` |
| `compare_products` | 2–4 IDs from one category and version, optional attributes | A specification table with each product's values |

Amounts are integer minor units: CNY 6500 is `650000`. The tools accept no user identity and no
external URL. The Agent is configured so `search_products` runs without asking, while
`get_products` and `compare_products` always ask for approval.

Each successful tool result includes a `receiptId`. The app uses it to read that exact result
from the catalog server's `/evidence/:receiptId` route and shows those facts on the page. Results
stay readable on the server for at least 24 hours and are saved locally once read.

Try the server on its own:

```sh
# Terminal A
npm run mcp:dev
# Terminal B
npm run mcp:probe -- http://localhost:4311/mcp
```

The probe initializes an MCP session, lists the three tools, runs a search and reads its full
result. It shows that the server works locally; Platform still needs a public HTTPS address.

### Host the catalog yourself

An Agent created with a Platform Project key connects to MCP servers that need no
authentication, so this server only exposes synthetic, public data. To skip the tunnel, host the catalog behind HTTPS and
set `MCP_PUBLIC_URL` in `.env`. Serve these routes from the same origin:

- `POST /mcp`: stateless Streamable HTTP with JSON responses.
- `GET /health`: catalog version and a synthetic-data marker.
- `GET /evidence/:receiptId`: an earlier tool result, without running the tool again.

Your proxy must forward the request body and the `Accept`, `Content-Type` and
`MCP-Protocol-Version` headers, and must not redirect `/mcp` to a login page or another origin.

The directory includes a Docker image for the MCP server. These commands build and run it
locally; they do not deploy it:

```sh
docker build -t product-advisor-mcp .
docker run --rm -p 127.0.0.1:4311:4311 \
  --mount type=volume,src=product-advisor-catalog,dst=/app/.local \
  product-advisor-mcp
```

The image runs as a non-root user and stores results in the volume. Inside the container it
listens on `0.0.0.0:4311`; the command above publishes it on loopback only. Use
`MCP_ALLOWED_HOSTS` to restrict the `Host` header. Requests with an `Origin` header are rejected
unless listed in `MCP_ALLOWED_ORIGINS`; Platform's requests do not send one. Check a public
deployment with `npm run mcp:probe -- https://your-host.example/mcp`.

With `MCP_PUBLIC_URL` set, run the app without the demo launcher:

```sh
npm run setup
npm run dev
```

After changing `MCP_PUBLIC_URL`, `ZOOWORK_MODEL` or the Agent instructions in `src/agent.ts`,
stop the app and run `npm run configure`, then `npm run dev`. Do not change the Agent while a
conversation is running.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `ZOOWORK_API_KEY` | none | Required. Platform Project key (`zwp_live_…`). |
| `ZOOWORK_MODEL` | Platform default | Model for the Agent, read when the Agent is created or configured. |
| `MCP_PUBLIC_URL` | tunnel | A hosted catalog. `npm run demo` skips the tunnel when set. |
| `APP_ORIGIN` | `http://localhost:4310` | Exact browser origin. Write requests from any other origin are rejected. Do not mix `localhost` and `127.0.0.1`. |
| `APP_COOKIE_SECRET` | generated | Signs the visitor cookie. Generated once into `.local/cookie-secret` when unset. |
| `MCP_HOST`, `MCP_PORT` | `localhost`, `4311` | Listener for `npm run mcp:dev`. |
| `MCP_ALLOWED_HOSTS`, `MCP_ALLOWED_ORIGINS` | none | Comma-separated allow lists for the MCP server. |

Keep the key in `.env` on the server. Never put it in browser code, chat, logs or Git.

## Approvals and failures

| Situation | What the app does |
| --- | --- |
| A tool call waits for approval | Shows the approval card with the product names; nothing runs until you decide |
| You deny | Marks the call "Not executed" and keeps earlier search results |
| You allow | Shows "Decision submitted" until the tool actually returns |
| Nobody decides in time | The call is denied; earlier results stay |
| The catalog is unreachable | Shows the failure; no new recommendation without a new successful search |
| The result cannot be read yet | Retries a few times; **Recover** retries again later |
| A message may not have arrived | Keeps the exact request; **Resume delivery** resends it without starting a second paid turn |
| The connection drops | Reconnects and continues from the last event it saw |

Each new recommendation must come from a successful search in the same turn. While the catalog
is unreachable, earlier results stay readable but cannot back a new recommendation.

## Troubleshooting

Errors print a stable code and never the key.

| Code | What to do |
| --- | --- |
| `platform_project_key_required` | Set `ZOOWORK_API_KEY` in `.env` to a `zwp_live_` Project key. |
| `cloudflared_required` | Install `cloudflared` (`brew install cloudflared` on macOS), or set `MCP_PUBLIC_URL`. |
| `tunnel_start_timeout` / `tunnel_exited` | `cloudflared` could not open a tunnel. Check your network, then run `npm run demo` again. |
| `tunnel_dns_not_ready` | The tunnel address did not resolve within 90 seconds. Run `npm run demo` again; each start gets a new address. If it keeps failing, check that your network allows `https://cloudflare-dns.com`. |
| `public_catalog_unreachable` | The address resolved but did not answer. A VPN or proxy may block `*.trycloudflare.com`; try without it, or host the catalog and set `MCP_PUBLIC_URL`. |
| `catalog_tool_set_mismatch` | The MCP server at `MCP_PUBLIC_URL` is not this catalog. Check the URL. |
| `request_or_runner_failed` | A request failed without a more specific code. At startup with `MCP_PUBLIC_URL` set, check that the URL is this catalog's `/mcp` endpoint; otherwise check your network and run the command again. |
| `mcp_public_url_required` / `public_https_mcp_url_required` | `npm run setup` and `npm run configure` need `MCP_PUBLIC_URL` set to a public `https://…/mcp` address. Use `npm run demo` for the tunnel. |
| `run_setup_first` | Run `npm run demo`, or `npm run setup` with `MCP_PUBLIC_URL`. |
| `http_401` | The key was rejected. Check it was copied completely. |
| `http_402` | Add credits for the Organization in Platform Console. |
| `http_403` | Check the key's Project and permissions. |
| `http_400` during setup | Check billing and the `ZOOWORK_MODEL` value. Keep `.local/`. |
| `state_scope_mismatch` / `agent_label_mismatch` | `.local/` belongs to another key or app. Restore the original `.env`; do not delete `.local/` to force a new Agent. |
| `recorded_conversations_require_recovery` | Conversations are recorded but the Agent record is missing. Restore `.local/agent.json` or run `npm run cleanup` with the original key. |
| `state_locked_review_before_retry` | Another setup, demo or cleanup is running. If none is, delete the `.lock` file in `.local/`. |
| `EADDRINUSE` | Port 4310 is in use. Stop the other process, or set `APP_ORIGIN` to another `http://localhost:<port>`. |

## Clean up

```sh
# Stop npm run demo or npm run dev first.
npm run cleanup
```

Cleanup deletes the conversations this app recorded, then stops and deletes its Agent. It only
uses IDs saved in `.local/` and checks their labels; it never lists your Project to choose what
to delete. If anything is uncertain or fails, it keeps `.local/` so you can run it again. Local
conversation records are removed only after the Agent is deleted.

## Checks

```sh
npm ci
npm run check
npm run build
```

`check` runs TypeScript and offline tests. They use a real local MCP server and a fake Platform,
need no key and spend no credits.

```sh
npm run build
npm run test:ui
# http://localhost:4390
```

`test:ui` serves the interface against the same fake Platform for checking layout and flows. It
is labeled as an offline test, is not part of the production build and is never used as a
fallback for the real app.

## Files

- `mcp/`, `data/`: the read-only catalog MCP server and its data.
- `src/agent.ts`: the Agent's instructions, MCP connection and tool permissions.
- `src/server/`: Sessions, approvals, reading tool results, and the local web API.
- `src/storage/`: SQLite records for conversations and tool results.
- `src/ui/`, `public/products/`: the interface and product illustrations.
- `test/`: offline tests.
