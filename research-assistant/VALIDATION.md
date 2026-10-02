# Research Assistant Validation

Initial date: 2026-10-01. Node 22.23.2, published `@zoowork-ai/sdk@0.9.0`.

## Initial Offline Verification

- `npm ci` and `npm run check`: TypeScript, 23 Node tests and esbuild.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:browser`: two passing flows, desktop
  1440×1000 and mobile 390px.
- Flow: topic → brief/two sources → refresh → follow-up → version selection → Markdown
  download → independent research → history switch.
- Node coverage: ownership; create/input/update idempotency; lost receipts; read-only
  reconnect; full pagination; restart; archived state; interrupt; older terminals;
  differing public/internal IDs; late echo; lock release after definite rejection;
  source downgrades and exact export.
- No browser page errors or horizontal overflow. The mobile composer follows the document.
- Fixtures are explicitly simulated, without keys or Platform requests. They do not prove live research.

## Staging: Actual Initial Research

Authorization came from this session's implementation instruction and
`docs/handoffs/research-assistant.md`. Used only staging at
`https://claw-interface.ecap.yesy.live/service/v1`.

The first check created one temporary Agent and one Session, with one paid user turn.
Actual web_search, two successful web_fetch calls, a succeeded terminal, a two-source
brief, durable replay and exact application export passed; 16 durable events were read.
Sources were official Node.js version documentation and the Release repository:

- <https://nodejs.org/en/about/previous-releases>
- <https://github.com/nodejs/Release>

A follow-up attempt returned research_busy before a second paid input. Public event id
had been treated as internal inboundMessageId; source review confirmed separate IDs
from separate tables. The active intent did not release. Temporary Agent/Session were cleaned up.

The fix preserves a pre-submit seq boundary, checks input echo/hash and associates the
sole new external run under the single-writer contract. Direct matching IDs remain preferred.
Multiple candidates or missing echo remain uncertain. Old terminals cannot release a new input.
This is application adaptation to the public API, not a new SDK capability.

## Staging: Fixed Session Continuity

A separate --session-only check avoided repeated search. It created one temporary Agent
and two Sessions. Session A used two very short turns, tools disabled, with a 128-token
output cap. Session B stayed empty for isolation. No automatic paid retries.

Verified initial completion with seven durable events, follow-up in the same Session,
model recall of the previous string, history restoration after recreating the reader,
and no history leakage into Session B. Both Sessions and the Agent were cleaned up.
The check respected the 180-second main and 60-second cleanup budgets.

## Evidence Boundaries

Initial research and fixed continuity had separate staging evidence on 2026-10-01,
without repeating full search that day. Actual browser research and brief update followed
on 2026-10-02 below. Live interrupt remains covered only by offline tests.
Initial desktop/mobile UI checks used fixtures; actual Platform checks used the same
backend/projection/export code. No production, public hosting, multi-user permissions,
load testing or complex long-running research was validated.

Read status reflects successful tool execution, not independent fact verification.
Public events expose result previews rather than complete tool contents or typed citations.
Markdown recognition follows prompt conventions; incomplete formats remain ordinary replies.
The starter requires a single writer per Session and private `.local/` registry. The public/internal
ID contract gap belongs in separate Platform/SDK documentation work; no sibling repo was changed.

## 2026-10-02: Real Demo and SDK Debug

At Finn's request, setup created/started this app's staging Agent. The actual service runs
at http://localhost:3000; the separate simulated service was stopped. Credentials were
injected from existing staging configuration into the process, never into repo, browser,
logs or screenshots.

The first browser topic created one app Session and completed one web_search, two
web_fetch calls, a two-source brief and exact Markdown export, with 18 durable events.
App resources were retained for the requested demonstration, with IDs/ownership in private
`.local/`. These are separate from the cleaned-up temporary smoke resources.

SDK Debug verification reused the same Agent/Session for one follow-up, without retries.
The second brief completed. Actual debug showed one accepted postEvents receipt,
12 new streamEvents deliveries and a closed reader. One new web_fetch was labeled
stream/history; older tools were history-only. The real page showed method names,
measured durations, allow-listed arguments, IDs and provenance. No extra Agent/Session was created.

Incremental offline checks passed: npm ci, npm run check (26 Node tests, TypeScript,
build) and two desktop/mobile browser flows. Added coverage includes running calls,
early stream closure, unchanged returned objects/exceptions, secret/body exclusion,
event deduplication/provenance, Session scope, hard bounds, read-only debug, tabs and pause.
Fixture screenshots are labeled simulated; actual-call screenshots came from localhost:3000.
Debug does not invent earlier setup calls and is not a durable audit log.

## 2026-10-02: English Demo

Interface copy, statuses, errors, accessible names, example topics, debug descriptions,
fixture briefs, staging example prompts and app documentation were translated to English.
The research persona defaults to English with Summary and Sources headings. Existing
conversation text is preserved; projection still accepts legacy Chinese headings.

Applied npm run update-agent to the existing staging demo Agent; the command confirmed the
updated persona. Restarted the real localhost:3000 service and inspected its English welcome,
controls and debug labels. Existing Chinese research content remains unchanged. No new
Agent/Session or paid model turn was used for this language change.

npm ci, npm run check (26 Node tests, TypeScript and build), git diff --check and both English
desktop/mobile browser flows passed. The flows cover creation, follow-up, version selection,
history, export, debug tabs and keyboard access. They assert html lang=en and an English fixture
body, with no page errors or horizontal overflow. Desktop/mobile screenshots were inspected;
English labels fit the existing layout without CSS changes.
