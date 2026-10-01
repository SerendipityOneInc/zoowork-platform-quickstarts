# Four session assignments

Updated 2026-10-01. Public repository:
[SerendipityOneInc/zoowork-platform-quickstarts](https://github.com/SerendipityOneInc/zoowork-platform-quickstarts).
The existing Finn machine checkout is still `/Users/wangfulong/src/zoo/zoowork-quickstarts`;
its Git remote points to the new repository name. Do not rename another session's checkout.

## Foundation and isolation

[Foundation PR #18](https://github.com/SerendipityOneInc/zoowork-platform-quickstarts/pull/18)
is merged into main at `43403d2a16cc50dc4ee436871ada0dc62f11c46d`. It contains the
lifecycle foundations under their former capability names. The application directory names,
plans and prompts in this handoff are a separate update on `feature/platform-demo-handoffs`.

Fetch and inspect the PR for that handoff branch before starting. If merged, start from
actual updated main. If open, start from its actual head and use `feature/platform-demo-handoffs`
as the feature PR base. Create an independent worktree/branch for each app. Do not commit
in the shared foundation worktree or alter another session's branch. Do not reset, stash
or rebase automatically.

## Startup assignment

| Session identity | Scope | Initial action |
| --- | --- | --- |
| [customer-support](handoffs/customer-support.md) | `customer-support/` | Start implementation now; first complete app |
| [product-advisor](handoffs/product-advisor.md) | `product-advisor/` | Read context and propose implementation; wait for Finn to start |
| [knowledge-assistant](handoffs/knowledge-assistant.md) | `knowledge-assistant/` | Continue RAG research/design discussion; keep decisions in this app |
| [research-assistant](handoffs/research-assistant.md) | `research-assistant/` | Read context and propose implementation; wait for Finn to start |

Send the same [shared prompt](SESSION-PROMPT.md) with a different `本 session 负责` line.
The four linked files contain ready-to-copy versions. Preparation sessions may record
app-specific plans in their own worktree but do not implement features or open a feature
PR until started. They do not start automatically when another session finishes.

## Validation and authorization

Finn has authorized use of the SDK staging configuration for this Platform demo work.
The shared prompt carries bounded staging authorization for the started feature session:
one temporary Agent, at most two Sessions and four user turns per verification run, with
cleanup of only recorded resources. This is a ceiling, not a target; prefer a smaller check.
Do not automatically retry paid calls, use production credentials or deploy publicly.
Credentials and local recovery state do not transfer through Git. Finding a saved key or
passing a confirmation flag alone is not authorization; this session instruction is.

Before implementation, read the app's `PLAN.md`, README, nested rules and the current
Platform contract. Keep app code, dependencies, tests and design inside its directory.
Raise shared foundation/SDK gaps explicitly before broadening scope. Submit one feature
PR for a completed app, with offline checks and actual staging evidence clearly separated.
