# Customer Support verification

Verified on 2026-10-01 from an independent worktree based on handoff PR #19 head
`cd932491bcf98eddb7e6650375b6586565c911c5`. Node 22.23.2, npm, published SDK 0.9.0.
No sibling applications, Work Agents, channels, local SDK overrides or production credentials were used.

## Offline checks

- `npm ci`: independent install with the committed lockfile.
- `npm run check`: TypeScript and browser JavaScript syntax checks; 41 Node tests passed.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:browser`: 6 browser scenarios on local Google Chrome.
  The test transport is explicitly fake; the HTTP app, SQLite and handlers are the actual implementation.
- Desktop 1440px and mobile 390px screenshots inspected. No horizontal overflow at the mobile width.
  English content, real action controls, confirmation state and a saved ticket were visible.

Node tests cover customer/conversation ownership, schema validation, unknown/unavailable tools,
atomic confirmation/result commits, cancellation, deadlines, duplicate calls/decisions/messages,
transaction rollback, conversation ID collision, pending-call and result-delivery restart, uncertainty before/after input
acceptance, process exclusivity, cleanup scope and failure retention. Fresh-directory subprocess checks exercise the actual setup/server entry points with missing keys, missing URLs and no recorded Agent. They verify actionable instructions, no credential reflection and no created resource state.

Browser scenarios cover order/shipment lookup and follow-up, cancellation and confirmation, reload
with pending/committed state, unknown orders, escaped hostile tool data, mobile layout, switching to
an empty conversation and keyboard focus surviving a polling interval. The tool-visibility follow-up also verifies chronological inline lookup summaries, cancellation/failure/confirmation outcomes, pending review focus across polling, mobile navigation to confirmation and ticket summaries after reload. The starter onboarding scenario verifies the Console link, key/configuration/startup guidance, a stable open disclosure across polling and no overflow at 390px.

An independent UI source/screenshot review found stale messages when switching to an empty
conversation and lost keyboard focus during polling. Both were repaired and covered by browser
regressions. The mechanical design detector had unavailable parser modules; its regex-only output
was not treated as full accessibility verification. Contrast was reviewed from source colors;
full assistive-technology testing was not performed.

## Actual staging evidence

`test:feature-staging -- --confirm-staging` ran against
`https://claw-interface.ecap.yesy.live/service/v1` using the authorized staging Project key, injected
directly from private configuration into the child process. The key was not printed or saved in Git.

Exactly **one temporary Agent, one Session and four user turns** were used:

1. The Agent requested `lookup_order` and `lookup_shipment`. The actual application returned
   database records for ORD-1001. The final answer named the Trail Daypack and matched the shipment.
2. A follow-up retained order context and reported the October 2 estimate.
3. The Agent requested `create_support_ticket`. Cancellation returned a structured error result,
   resumed the paused run and left zero tickets.
4. Another ticket proposal waited for confirmation. The service stopped and reopened its SQLite
   journal while the real Platform call remained pending. Restart recovered the confirmation;
   confirming created one Open ticket. Repeating the same decision left exactly one ticket, and
   the Agent's final reply contained its ID.

The check reported all feature assertions passing. Cleanup completed for the recorded Session
and Agent; no temporary Platform resources were left. The synthetic business/history archive
remains ignored under `.local/` for local inspection.

This live run exercised the service and SDK, while the browser run independently exercised the
HTTP/UI path with a fake transport. It was not a public deployment or a production integration.
Later changes added stricter Session-metadata cleanup validation (offline tested), canonical tool-input
comparison, immutable conversation ownership, normal SSE read-timeout reconnection and the two browser regressions. Those changes did
not trigger another paid verification run. The subsequent tool-visibility UI update exposes persisted request timestamps and inputs in the owner-scoped snapshot; it was verified with the same offline checks and browser workflow, without another paid run. The starter onboarding update was also tested offline; it changes guidance and startup error text and does not create resources or issue model calls. No deployed Custom Tool capability gap was observed.

## Limits

- The store and browser identity are a localhost, single-process sample. They are not production auth
  or multi-worker coordination.
- Tickets remain Open; this sample does not implement staff fulfillment, approval or carrier writes.
- Replies use complete durable assistant events rather than preview token deltas.
- Replacing the shop fixtures, introducing real authentication and deployment are separate work.
