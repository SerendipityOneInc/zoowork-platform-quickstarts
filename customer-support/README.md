# Customer Support

A support workbench built on ZooWork Platform and the published TypeScript SDK
(`@zoowork-ai/sdk`). Ask about an order, follow its shipment, continue the conversation, and
create an after-sales ticket after you review its exact contents in the browser.

The Agent uses three **Custom Tools** that this application runs on your own server:
`lookup_order`, `lookup_shipment` and `create_support_ticket`. All shop records are synthetic.
A ticket records a request; it does not approve a refund, arrange a return or contact a carrier.

## 1. Get a Project key

1. Sign in to [Platform Console](https://platform.zoowork.ai) and select a Project. The
   **Default Project** is fine.
2. Open **API Keys**, create a key and copy it. The Console shows it once. It starts with
   `zwp_live_`. Organization keys that start with `zct_` are not accepted.
3. Open **Billing** and check that the Organization has credits. Creating the Agent needs billing
   to be set up, and every reply uses credits. All Projects in an Organization share one balance.

Keep the key on the server. Do not paste it into a chat, browser code, a screenshot or Git.
You do not need an Agent ID: `npm run setup` creates this app's Agent.

## 2. Run it

Use Node.js **22.20 or later**, on the latest security release of your line, and npm.
Node.js 22 prints an experimental warning for its built-in SQLite driver; Node.js 24 does not.

```sh
git clone https://github.com/SerendipityOneInc/zoowork-platform-quickstarts.git
cd zoowork-platform-quickstarts/customer-support
npm ci
cp .env.example .env
```

Edit `.env` and set your key:

```dotenv
ZOOWORK_API_KEY=zwp_live_replace_with_your_project_key
PORT=4600
```

`ZOOWORK_MODEL` is optional; leave it empty to use the Platform default model. Set it before the
first `npm run setup`. `.env` is ignored by Git.

```sh
npm run setup
npm run dev
```

Setup prints `Agent ready: <agent-id>` and records the Agent in `.local/agent.json`. Running setup
again reuses the same Agent. The server prints
`Customer Support: http://localhost:4600 (synthetic data)`.

Open **http://localhost:4600**. The server only answers on `localhost`; set `PORT` in `.env` to use
another port.

## 3. Walkthrough

1. Choose **Track ORD-1001** and select **Send**. The conversation shows the `lookup_order` and
   `lookup_shipment` calls as they run, then the Agent's reply: a Trail Daypack whose shipment is
   delayed, with an October 2 estimate. The first reply on a new Agent can take longer while the
   Platform starts it.
2. Ask **“What does the latest shipment event mean?”** The same conversation continues.
3. Ask **“Create a delivery ticket for ORD-1001 because the shipment is delayed.”** The Agent calls
   `create_support_ticket`, and the order panel shows the order, category and exact reason for you
   to review.
4. Choose **Cancel request**. No ticket is written, and the Agent is told the request was cancelled.
   Ask for the ticket again and choose **Confirm & create ticket**. The ticket ID and **Open**
   status appear in the ticket panel and in the Agent's reply.
5. Reload the page. Messages, tickets and a pending confirmation are still there. You can also stop
   and restart `npm run dev`; the app continues the same conversation without creating a new Agent
   or Session.

Other sample orders: ORD-1002 is a delivered bottle order and ORD-9999 does not exist. ORD-2001
belongs to a different synthetic customer and returns the same `order_not_found` result as an
unknown order, so the Agent cannot read other customers' orders.

Each tool call appears in the conversation with its name, its business result, and whether it is
waiting, confirmed, cancelled or failed. **Review ticket request** moves focus to the
confirmation. **Tool call details** in the order panel lists call IDs, inputs and results.

## How it works

```text
browser ── /api/conversations ──▶ this app's server ── createSession, postEvents ──▶ ZooWork Platform
                                   │   ▲                                               │
                                   │   └──── streamEvents: tool requests, replies ◀────┘
                                   └── runs the tool against SQLite, then resolveCustomToolCall
```

- **Custom Tools.** When the Agent calls a tool, the Platform pauses the run and sends a
  `requested` event. The server checks that the order belongs to the signed-in customer, runs the
  tool against its database and returns the result with `resolveCustomToolCall`. The model never
  chooses the customer.
- **Confirmation before a write.** `create_support_ticket` waits for a click in the browser. The
  ticket and its tool result are saved in one SQLite transaction before the result is sent to the
  Platform, so a lost response can be resent without creating a second ticket. Cancelled and
  expired requests create no ticket. A request expires after ten minutes.
- **Saved state.** `.local/support.sqlite` stores the sample orders, conversations, messages,
  tool results, tickets and the stream position of each Session. On restart, the server reads the
  Session history from that position and resends any result the Platform has not received.
- **Safe retries.** Every message is sent with an idempotency key. If a send fails or its response
  is lost, **Recover conversation** first reads the Session history and only resends the same
  message, with the same key, if the Platform never received it.
- **Browser access.** Each browser gets an HttpOnly cookie, and every route checks that the
  conversation belongs to it. Changes need a same-origin request with a CSRF token. Agent replies
  are shown with basic Markdown formatting; all text is HTML-escaped first.

This is a local, single-user sample, not a shop login system. Before real customers use it, replace
the sample identity with your own authentication, connect the tools to your order service, and add
your ticket policy. Keep the confirmation step and the save-before-resolve order.

## Troubleshooting

Errors print a stable code and a next step. They never print the key or a provider response body.

| Code | What to do |
| --- | --- |
| `platform_project_key_required` | Copy `.env.example` to `.env` and set `ZOOWORK_API_KEY` to a `zwp_live_` Project key. Restart after editing `.env`. |
| `run_setup_first` | Run `npm run setup`, then `npm run dev`. |
| `http_401` | The key was rejected. Check it was copied completely and is still active. |
| `http_402` | Set up billing or add credits for the Organization in Platform Console. |
| `http_403` | Check the selected Project and the key's permissions. |
| `http_400` during setup | Check billing and the `ZOOWORK_MODEL` value. Keep `.local/` while you investigate. |
| `state_scope_mismatch` / `http_404` for a recorded resource | `.local/` belongs to another key or Project. Restore the original key. Do not delete `.local/` to force a new Agent. |
| `agent_config_outdated_cleanup_then_setup` | The recorded Agent was created by an older version of this app. Stop the server, run `npm run cleanup`, then `npm run setup` and `npm run dev`. |
| `EADDRINUSE` / `request_or_runner_failed` at start | Another process uses the port. Stop it or set a free `PORT` in `.env`. The second code can also mean a connection problem. |

## Status and cleanup

```sh
npm run status
# Stop npm run dev first, then:
npm run cleanup
```

Cleanup only touches the Agent and Sessions recorded in `.local/`, and checks their labels
before deleting them. It never lists your Project to choose what to delete. If the server is
running, a Session creation is uncertain, or a deletion fails, cleanup stops and keeps `.local/`
so you can run it again. After success it stops and deletes the Agent and keeps the old database
as `.local/archived-<instance>.sqlite`. The next `npm run setup` starts fresh.

If a command was killed while holding `.local/agent.json.lock`, make sure no setup or cleanup is
running, then delete the lock. Do not delete the Agent record or the database to get past an error.

## Checks

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:browser
# Or, with Google Chrome already installed:
PLAYWRIGHT_CHANNEL=chrome npm run test:browser
```

`check` runs the TypeScript check, a syntax check of the browser code and offline Node tests. It
needs no key and makes no network request to ZooWork. The browser tests cover the full walkthrough,
reload, Markdown rendering, hostile tool and model text, the desktop and mobile layouts, switching
to an empty conversation, and keyboard focus. They start `test/fixture-server.ts`, which runs the
real routes, SQLite store and tool handlers against an in-memory fake of the Platform. It exists
only for these tests.

## Main files

| File | Responsibility |
| --- | --- |
| `src/agent.ts` | Agent instructions and the three Custom Tool schemas |
| `src/store.ts`, `src/tools.ts` | SQLite data, customer ownership, confirmation and saved tool results |
| `src/service.ts` | Sending messages, reading the event stream, recovery and returning tool results |
| `src/http.ts`, `scripts/server.ts` | Local browser API, cookie and CSRF checks, server start and stop |
| `public/` | The workbench page; `markdown.js` formats Agent replies |
| `src/platform.ts`, `src/cleanup.ts` | Agent setup and cleanup of recorded resources |
| `test/`, `e2e/` | Offline tests and browser tests |
