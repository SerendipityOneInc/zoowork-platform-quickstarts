# Platform application quickstarts

Updated 2026-10-02. Customer Support is implemented and verified. Other applications in this
branch have lifecycle foundations; feature delivery is tracked in the root [README](../README.md).

## Product scope

Ship four complete applications. Name each for its user outcome, and document its main
SDK capability as a technical focus. Capabilities may overlap across applications.

| Application | User outcome | Main capability | Plan |
| --- | --- | --- | --- |
| Customer Support | Inspect an order/shipment and create a support ticket | Custom Tool | [Plan](../customer-support/PLAN.md) |
| Product Advisor | Search, compare and shortlist catalog products | Remote MCP | [Plan](../product-advisor/PLAN.md) |
| Knowledge Assistant | Ask an existing knowledge base with inspectable citations | External RAG | [Design](../knowledge-assistant/PLAN.md) |
| Research Assistant | Produce a sourced brief and continue the saved research | Vercel Chat SDK | [Plan](../research-assistant/PLAN.md) |

## Platform entry flow

A developer obtains a Project key in Platform. Server-side setup creates and starts this
application's Agent. The app creates Sessions, posts input and consumes durable SDK events.
The Agent ID is setup output. Project ownership comes from the gateway. Keep product
onboarding separate from the ZooWork Work product and its existing Agents/channels.
See [Platform contract](PLATFORM.md) for current capabilities and limitations.

## Common delivery criteria

- One independently installable app with README, environment example, setup, development,
  status and cleanup commands. No sibling imports or local SDK overrides.
- A useful browser flow, representative data and a visible result. Application state and
  errors are primary UI; technical traces are secondary and can be collapsed.
- Server-side credentials, backend conversation ownership and durable Session/history.
  Recover interrupted/pending operations without duplicating business writes.
- Meaningful offline checks, a reproducible walkthrough and accurate feature verification.
  Report source support separately from actual deployed capability.
- Record source licenses and commits for copied code. Keep application-specific references
  in the app and cross-cutting references in [REFERENCES.md](REFERENCES.md).

## Delivery status

Customer Support is delivered through [PR #20](https://github.com/SerendipityOneInc/zoowork-platform-quickstarts/pull/20),
with [feature verification](../customer-support/docs/VALIDATION.md). Product Advisor and Research
Assistant have separate feature PRs; until integrated, their directories here retain the
lifecycle foundations. Knowledge Assistant continues its RAG discussion inside its own directory. Each session owns one app and an independent worktree/branch. See
[session assignments](HANDOFF.md) and the [shared prompt](SESSION-PROMPT.md).
