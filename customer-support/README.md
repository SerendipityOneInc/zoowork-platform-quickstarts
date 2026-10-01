# Customer Support

A runnable English support workbench built with ZooWork Platform and the published
`@zoowork-ai/sdk@0.9.0`. Ask about an order, inspect its shipment, continue the conversation,
and create an after-sales ticket after reviewing its exact contents in the browser.

The application creates its own Agent with a **Platform Project key**. It uses application-executed
Custom Tools and durable Session events. All shop records are synthetic. Tickets record a request;
they do not approve a refund, arrange a return or contact a carrier.

## Run with Platform

Use Node **22.20 or newer** (verified on 22.23.2), npm and a Project key from Platform.
Node 22 reports an experimental warning for its built-in SQLite driver.

```sh
cd customer-support
npm ci
cp .env.example .env
# Set ZOOWORK_API_KEY to your zwp_live_ Project key and set ZOOWORK_BASE_URL.
npm run check
npm run setup
npm run dev
```

Open **http://localhost:4600**. `PORT` can select another local port. The key stays in the
server process; the browser receives neither the key nor an Agent ID. There is no Work Agent,
channels API, sibling app import or local SDK override.

`setup` creates and starts this application's Agent using an exact request and idempotency key
saved in `.local/agent.json`. Repeating setup reuses that Agent. Edit the model setting before
initial setup. An Agent created by the previous lifecycle-only foundation needs cleanup followed
by setup to get the three Custom Tools; configuration is never silently changed.

## Walkthrough

1. Select **Track ORD-1001**, then send the prepared message. The Agent calls `lookup_order` and
   `lookup_shipment`. The database shows a Trail Daypack, a delayed shipment and an October 2 estimate.
2. Ask **“What does the latest shipment event mean?”** The same Session retains the conversation.
3. Ask **“Create a delivery ticket for ORD-1001 because the shipment is delayed.”** The Agent calls
   `create_support_ticket`. The workbench shows the order, category and exact reason for review.
4. Choose **Cancel request**. No ticket is written, and an error result releases the paused tool.
   Ask for another ticket and choose **Confirm & create ticket**. Its ID and **Open** status appear
   in both the ticket panel and the Agent reply.
5. Reload the page. Messages, ticket state and a pending confirmation survive. Stop and restart
   `npm run dev` to resume the recorded Session and pending calls without creating new resources.

ORD-1002 is a delivered bottle order. ORD-9999 is unknown. ORD-2001 belongs to a different
synthetic customer and returns the same `order_not_found` result as an unknown order.
Custom Tool calls appear directly in the conversation timeline, with their function names, business results and confirmation or failure states. **Review ticket request** moves focus to the protected confirmation. The closed **Tool call details** disclosure contains call IDs, input parameters, structured results and decisions.

## Offline preview and checks

The offline fixture runs the actual HTTP routes, SQLite store and business handlers with a
**fake Platform transport**. It is clearly labeled **Offline test fixture** and never calls a
model. It is useful for the workbench walkthrough; it is not evidence of SDK integration.
It uses an in-memory database and resets when the preview process stops. Reloading a page in
that process retains state. Platform mode uses the durable on-disk database described below.

```sh
npm run demo:offline
# Open http://localhost:4600. Stop this process before running the Platform app on the same port.
```

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:browser
# Alternatively, with an already-installed Google Chrome:
PLAYWRIGHT_CHANNEL=chrome npm run test:browser
```

`check` typechecks the backend and tests, checks browser JavaScript syntax, and runs offline
Node tests. Browser tests cover the complete workflow, reload, hostile tool data, mobile layout,
empty conversation switching and keyboard focus during polling. CI's `check` needs no key or browser.
See [verification evidence](docs/VALIDATION.md).

## Persistence and recovery

- `.local/support.sqlite` stores fixture orders/shipments, browser identities, conversation ownership,
  exact Session-create requests, user messages, tool jobs, tickets, results and durable event cursors.
  The database is bound to the recorded Agent instance and deployment.
- Each browser has an opaque HttpOnly cookie. Routes check conversation ownership. The handlers
  independently check customer ownership; the model cannot select a customer or pass confirmation.
  Mutation requests require a same-origin request and a CSRF token. The server binds to localhost.
- A ticket and its tool result commit in one SQLite transaction **before** calling
  `resolveCustomToolCall`. Duplicate call IDs return saved results. Equivalent confirmed requests
  in the same conversation return the existing ticket. A failure to deliver a result cannot duplicate
  the business write. A repeated decision cannot change a cancellation into a confirmation.
- Confirmation expires at the tool deadline (ten minutes by default). Cancelled, expired and remotely
  terminal calls create no ticket. The backend checks the deployment's pending calls before confirming.
- Restart reads history and pending calls, scopes them to recorded Sessions and resubmits saved results.
  A process lease prevents two app consumers from executing the same journal concurrently; a dead
  process can be replaced without deleting business state. SQLite uses WAL and full synchronous commits.
- Failed or ambiguous user inputs keep their exact body and idempotency key. **Recover conversation**
  first reads history; if the input was not found, an explicit retry uses the saved key. Restart never
  automatically posts new model inputs. Network errors retain state and do not print provider bodies.
- Durable `agent.assistant` replies replace the displayed snapshot from saved messages. This app does
  not concatenate preview deltas or rely on the preview event lane.

This is a local single-process sample identity, not a shop login system. For a real application,
replace the synthetic identity with authenticated customer ownership, replace the business store or
handlers with your service, and add the shop's ticket policy. Keep the confirmation and result journal.

## Status and cleanup

```sh
npm run status
# Stop npm run dev first, then:
npm run cleanup
```

Cleanup checks the recorded Agent labels and verifies each **recorded** Session's metadata before
removing it. It does not enumerate Projects or choose unrelated Sessions for deletion. A running
app, ambiguous Session creation, changed labels/metadata or failed deletion blocks cleanup and keeps
recovery state. Successful cleanup archives the business database as `.local/archived-<instance>.sqlite`.
It stops/deletes the Agent and removes the active Agent record. A subsequent setup starts a fresh app
instance; the archive is retained for inspection.

If a CLI was killed while holding `agent.json.lock`, confirm no setup/cleanup process is running
before removing that lock. Never remove Agent records or databases to bypass uncertainty. For an
ambiguous Session creation, restart the app and use **Recover conversation** with the same Project
key to replay the recorded create body/key before attempting cleanup.

## Authorized staging verification

Live tests require explicit authorization in addition to the confirmation flag.
Only the exact staging endpoint is accepted. There is no paid-input retry or production fallback.

```sh
# Inject an authorized staging Project key and staging base URL into the server process.
npm run test:feature-staging -- --confirm-staging
```

The feature check creates **one temporary Agent and one Session**, uses **four user turns**, checks
real order/shipment Custom Tools, a follow-up, cancellation, confirmation, pending-call restart and
idempotency, then deletes the recorded resources. The main request phase is bounded to 180 seconds,
with a separate cleanup budget. Failure keeps a private recovery record/database and prints its exact
cleanup command. No credentials enter Git or the database.

`npm run test:staging -- --confirm-staging` remains the smaller lifecycle-only smoke; it does not
prove the application's Custom Tool workflow. Sources and licenses are recorded in
[references](docs/REFERENCES.md). Platform boundaries remain in [the shared contract](../docs/PLATFORM.md).

## Main files

| File | Responsibility |
| --- | --- |
| `src/agent.ts` | Agent persona and three Custom Tool schemas |
| `src/store.ts`, `src/tools.ts` | SQLite business data, ownership, confirmation and result journal |
| `src/service.ts` | Session inputs, event consumer, pending recovery and result delivery |
| `src/http.ts`, `scripts/server.ts` | Local browser API, cookie/CSRF checks and server lifecycle |
| `public/` | English responsive workbench |
| `src/platform.ts`, `src/cleanup.ts` | Agent setup, resource scope and recorded-resource cleanup |
| `test/`, `e2e/` | Offline behavior and browser regressions |
| `scripts/feature-staging.ts` | Bounded, authorized real feature verification |
