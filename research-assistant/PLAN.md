# Research Assistant implementation plan

Startup: prepare context and implementation plan; wait for Finn to start implementation.
Technical focus: Vercel Chat SDK backed by Platform Sessions.

## Product flow

A user enters a research question. The app shows actual research progress and produces a
brief with sources and explicit limits. The user can revisit earlier conversations, refine
the brief through follow-up questions and copy or export the result as Markdown.

## Implementation

- Use Vercel Chat SDK's official Web adapter and a small React UI. Start with Web so no
  third-party messaging app registration is required. Other adapters are later extensions.
- Bridge Chat SDK handlers to the released Platform SDK. Persist and validate the mapping
  from application user/conversation to Agent/Session. Restore history from durable events.
- Use Platform's documented `web_search` / `web_fetch` tools for research. Verify actual
  deployed availability in the feature session; a declaration or document alone is not
  evidence that search works. Show an actionable limitation if the service is unavailable.
- Show the resulting brief and sources as the main product. Tool calls can be inspected
  in a collapsible activity feed. Do not fabricate citations or research progress.
- The released SDK provides complete assistant replies and durable events; it does not
  expose preview deltas. Render complete messages and real progress without simulating
  token streaming. Transport disconnection alone does not interrupt the Agent run.
- Serve locally by default. Keep credentials server-side and verify conversation ownership
  on history, chat, activity and export routes. Public deployment needs application identity.

## Acceptance

A real research turn produces a sourced brief. Refresh and follow-up reuse the intended
Session, and conversations remain separate. Export corresponds to the actual brief.
Offline tests cover history replay, routing/ownership and completion/error behavior.
Staging evidence verifies search/fetch, session continuation and the event/UI bridge.

## Reference

[Claude Chat SDK](https://github.com/anthropics/claude-quickstarts/tree/main/managed-agents/chat-sdk)
already implements this product shape. Reuse suitable UI, card and handler structure after
checking its license and source commit. Replace the agent backend with Platform; do not
assume Claude's environment setup, token previews or session ownership model apply unchanged.
See [references](../docs/REFERENCES.md).
