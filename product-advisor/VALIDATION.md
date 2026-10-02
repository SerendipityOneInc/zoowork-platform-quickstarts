# Product Advisor validation

Updated 2026-10-02. Published SDK 0.9.0 has passed actual feature staging and the real browser flow. Earlier offline results are retained below as historical evidence. A local MCP probe or mock Platform harness is never presented as live Platform evidence.

## Initial offline verification — 2026-10-01

No Project credentials, paid turns, or public deployment were used in this phase.

| Check | Result | Evidence boundary |
| --- | --- | --- |
| `npm ci` | PASS | Independent install, 136 packages, zero reported vulnerabilities |
| `npm run check` | PASS | TypeScript and 25 offline tests |
| `npm run build` | PASS | React/Vite client, compiled Node/MCP, catalog data |
| Local `mcp:probe` | PASS | Official Streamable HTTP initialize/list/search and receipt read |
| Browser 1440×1000 and 390×844 | PASS | Three candidates, denied details, approved comparison, reload, lower-budget follow-up; no page errors/document overflow |
| Independent UI review | Four findings resolved / ship | Verdict covers only the reviewed mobile entry, type size, persistent mock notice, and keyboard table fixes |
| MCP Docker build/probe | PASS | Linux arm64 image, npm ci/check/build, non-root initialize/list/search/receipt read |
| GitHub CI | PASS | Four app checks for implementation commit `b8d62de`; [workflow](https://github.com/SerendipityOneInc/zoowork-platform-quickstarts/actions/runs/36870445008) |
| Actual feature staging | NOT RUN at this stage | Subsequently completed below |

The browser used `scripts/test-ui.ts`: mocked Platform lifecycle/events/approvals with real local HTTP MCP data. Integration tests checked execution and denial counts. Those browser results do not prove deployed Platform connectivity. Screenshots are ignored under `.impeccable/review/`.

Offline coverage included hard budgets/filters, unknown/unavailable facts, versions, same-category comparison; real HTTP MCP and immutable receipts; receipt IDs inside a 512-character preview; visitor/Origin/other-Session approval rejection; allow-once, zero execution after deny, signaled-but-pending; exact delivery recovery, concurrent follow-up exclusion, seq deduplication; SQLite pending-approval restart; receipt expiry; invalid/no-evidence model output; no new recommendation from old receipts after catalog failure; approvals 501; and public URL/confirmation declarations.

PR #19 was OPEN at `cd932491bcf98eddb7e6650375b6586565c911c5` during the initial review; the feature PR originally targeted that handoff branch.

## Compact MCP request JSON — 2026-10-02

The approved shopping interface and simple collapsed debug were retained. Tool events show actual argument JSON and request/approval/returned/unexecuted status. A separate presentation panel, flow diagram, and counts were removed from the UI. Mock Platform versus actual local HTTP MCP remained clearly labelled.

Independent npm ci/check/build passed with 25 tests. Browser checks confirmed default-collapsed debug, correct request budget/filters, returned/pending/denied states, keyboard-accessible JSON, and no page errors or document overflow at desktop 1440px and mobile 390px. Screenshots: `.impeccable/review/mcp-json-desktop.png` and `mcp-json-mobile.png`.

PR #19 merged on 2026-10-02 at `3696818d31d2bd42a36b05af897bf78b5f9aae0f`. PR #22 integrated that main and changed its base to main.

CodeQL follow-up removed dynamic approval-key writes, using computed keys and own-property reads, with a `__proto__` approval ID persistence/decision-lock regression. Page/static rate limiting permits 300 requests per IP per minute, then 429, without counting API traffic. Fixed SPA fallback filename/root works under a `.worktrees` path. Local production checks confirmed requests 1–300 return 200, request 301 returns 429, and API status remains 200. npm ci/check/build passed with 26 tests; the client bundle was unchanged.

## Actual Platform / SDK feature staging — 2026-10-02

The authorized staging Project key, published `@zoowork-ai/sdk@0.9.0`, and this HTTP MCP ran through a temporary HTTPS tunnel. The run used one Agent, two Sessions, and four user turns. No SDK override, mock Platform, production credential, or automatic paid retry was used. The temporary tunnel was authorized by the user's explicit full-demo/SDK verification request in this session.

| Check | Actual result |
| --- | --- |
| Agent create/start, Session input/events | PASS through published SDK |
| Search, approved details, approved comparison | PASS; two separate native allow-once decisions in one turn; audit search=1/get=1/compare=1 |
| Recommendation/comparison facts | PASS; budget/minimum RAM constraints and two-product parameter matrix |
| Budget lowered to CNY 5000 | PASS; new search and shortlist obey the new budget |
| Search followed by denied details | PASS; native deny; audit search=1/get=0/compare=0 |
| Receipt preview/hydration | PASS; receipt extracted from actual successful tool-end and full result read from the fixed endpoint |
| Durable events / REST replay | PASS; every streamed seq/type exists in SDK REST history |
| Unavailable MCP endpoint | PASS; actual mcp_connection_failed, no new shortlist |
| Cleanup | PASS; only the two recorded Sessions and this temporary Agent stopped/deleted |

Temporary Agent `agt_01m3yb0rrk52pamhzxvmatr186` and Sessions `32e23e3c86c7489f890dffd6efe74eca` / `9edbe59204714d99ab5a2e077d74f481` were cleaned. The private report is ignored at `.local/feature-report-42f45a4d-b28a-4419-9ef3-a4a86a72f63d.json`. The key was never printed, copied into the repository, or passed to the tunnel process.

SDK 0.9.0 serializes `requireConfirmation` successfully and this declared configuration produces native approvals in staging. Its TypeScript declaration still omits the field; [SDK issue #39](https://github.com/SerendipityOneInc/zoowork-sdk-typescript/issues/39) tracks the gap. This run does not isolate `always_ask` without the flag. Results cover the app's API surface on this staging deployment, not the entire SDK or production.

## Default launcher and real browser — 2026-10-02

`npm run demo` ran with a Project key, an explicit staging base URL, and port 4390. No MCP URL, Agent ID, or cookie secret was manually configured. The launcher started the local catalog, waited for tunnel registration/DNS/health/discovery, prepared the app-owned Agent, and generated the private persistent cookie secret. Restart updated the same Agent to a fresh tunnel URL through the SDK; visitor identity and history survived.

App Agent: `agt_01m3yce2cb9ckr773d4kq03yds`. Sessions: `b58d49befa2545ea8f4d6cf1ba657725` and `0faa9fef685447bc9d50b152eef1c31b`. Four browser user turns covered search, allowed details, allowed two-product comparison, and a new-conversation search followed by denied details. Audit counts were search=1/get=1/compare=1 and search=1/get=0/compare=0. API status confirmed `ready=true`, `testMode=false`.

Actual browser checks passed details/matrix display, reload/history/request JSON, desktop 1440px and mobile 390px with no document overflow or page errors. Ignored report: `.local/live-browser-report.json`. Screenshots: `.impeccable/review/real-sdk-desktop.png` and `real-sdk-mobile.png`.

Actual denial emits `agent.approval` resolved=deny, then `agent.tool` phase=blocked with deniedReason=approval-denied, without tool-end. The app projects that as “Not executed” and recovers it from durable history, preserving the actual blocked phase instead of inventing an end event. A regression covers this native sequence.

npm ci, TypeScript + 32 offline tests, and build passed with zero reported vulnerabilities. Added coverage includes default SDK URL/explicit staging, concurrent private secret creation, same-Agent tunnel updates/pending recovery, key exclusion from the child environment, registration/DNS readiness, and native denial/history recovery. Final commit `4e46e2c` passed all app and CodeQL checks: [app workflow](https://github.com/SerendipityOneInc/zoowork-platform-quickstarts/actions/runs/37015357267), [CodeQL](https://github.com/SerendipityOneInc/zoowork-platform-quickstarts/actions/runs/37015351563).

This app-owned preview Agent and its two history Sessions were retained for the user's preview, separately from the cleaned feature-staging resources. After stopping the demo, `npm run cleanup` with the same staging configuration cleans only recorded resources with matching labels/metadata.

## English-only project — 2026-10-02

UI labels/errors/accessibility text, Agent instructions, generated backend messages, examples, synthetic product names/descriptions/specification labels, test prompts, README, plan, and validation are English. Currency stays CNY, displayed explicitly. English budget/RAM/weight parsing drives actual filters and preserves unrelated prior requirements. The catalog uses a new `demo-2026-10-02-en` version; older receipts retain their original snapshots.

The tracked project files, including design sidecars, contain no Han text. `npm ci`, TypeScript + 33 offline tests, and `npm run build` passed; npm reported zero vulnerabilities. The added English parsing regression verifies that CNY amounts, RAM, and maximum weight filter the actual catalog, that a category switch clears incompatible RAM constraints, and that storage capacity is not interpreted as RAM.

The English offline browser flow passed search, denied details, approved comparison, lower-budget follow-up, and reload/history. Desktop 1440px and mobile 390px had no document overflow or page errors. Authored content in the new conversation was English. Ignored report: `.local/english-browser-report.json`; screenshots: `.impeccable/review/english-desktop.png` and `english-mobile.png`. This harness still uses mock Platform events and real HTTP MCP, so it is not a new live approval check.

The default live preview was restarted on port 4390. The same app-owned Agent `agt_01m3yce2cb9ckr773d4kq03yds` was updated through SDK serialization to the English persona and new HTTPS MCP URL; status remains `ready=true`, `testMode=false`. Previously stored user messages and immutable evidence were preserved rather than translated in place.

A fresh browser visitor verified the real English entry, HTML lang=en, English example input, and no page errors or document overflow at 1440px/390px. This read-only entry check sent no model turn. Screenshot: `.impeccable/review/english-real-entry.png`.

An additional bounded English live check used one temporary Agent, one Session, and one user turn requesting search, details, and comparison. The actual MCP search returned three valid English products at version `demo-2026-10-02-en`. The expected two native approvals and comparison were not observed, so the composite check **did not pass**. Audit was search=1/get=0/compare=0. The runner reported `request_or_runner_failed`; its limited retained diagnostics do not establish a cause. It performed no automatic paid retry.

Temporary Agent `agt_01m3yfffnb57fkgghz9kjq572w` and Session `9e1d8dc5ffda4f8bae5927e13e8cf3ea` were cleaned. The remaining audit/receipt evidence and cleanup result are recorded in ignored `.local/english-feature-partial-report.json`. Earlier complete live SDK/approval checks above remain valid for their recorded scope and are not relabelled as a passing English composite run.
