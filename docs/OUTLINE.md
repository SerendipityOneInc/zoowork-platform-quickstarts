# Platform starter outline

Updated 2026-10-01. This is an implementation plan, not a completed-feature claim.

## Common foundation

The developer obtains a Project key in Platform. Server-side setup creates and starts
an Agent. The application creates Sessions, posts input and renders durable SDK events.
Agent IDs are setup output, not a value copied from another product.

Four independent directories each contain a TypeScript lifecycle foundation and offline
checks. Deliver one complete runnable app per feature PR, including README, environment
example, recovery behavior and authorized staging evidence.

## Custom Tool: order assistant

Ask for order A001's fulfillment status and inspect the application's lookup.

- Declare `lookup_order` with `resource.custom_tools` and an object input schema.
- Consume `agent.custom_tool_use`, validate inputs, run an application handler and call
  `resolveCustomToolCall` with JSON results.
- Display request, pending state, result and answer. Supply deterministic synthetic orders;
  make the handler replaceable with a database/HTTP service. Start with read-only operations.
- Handle missing orders, handler failure, duplicate events and pending-call recovery.
  Persist event cursors after processing. A `202` acknowledgment is not proof of consumption.

Acceptance: answer matches a real tool result; failures are visible; restarting the app
does not silently abandon pending calls.

## MCP: remote catalog assistant

Ask about products, observe a remote MCP tool and explicitly approve a call.

- Supply a small read-only MCP server, synthetic catalog and deployment instructions.
- Configure public Streamable HTTP, explicit `toolFilter` and a small `direct` tool set.
- Show start/end/blocked phases, matching approval, denied calls and connection errors.
- Staging must reach a public endpoint. Localhost alone is insufficient. External
  bearer/OAuth credentials are outside the currently available public contract.

Acceptance: trace proves remote execution; denial prevents execution; unavailable servers
produce understandable errors. Exposure and approval are separate settings.

## RAG: external knowledge Q&A

Reuse existing knowledge retrieval and receive an answer with inspectable evidence.
Provider and UX are undecided. Read `RAG-RESEARCH.md` before implementation.

- Decide whether to connect an existing retrieval service or also teach ingestion.
- Application executes a retrieval custom tool with server-side provider credentials.
- Normalize retrieved chunks and source IDs; display citations and excerpts.
- Distinguish empty results from provider failures. Keep authorization outside model inputs.
- Provide a small evaluation set for supported answers, absent information and citations.

Acceptance: retrieval uses the selected real provider; citations refer to retrieved evidence;
missing information does not produce fabricated sources. Do not fix Dify or a vector store yet.

## Chat SDK: research chat

Open a browser chat, follow actual progress, refresh and continue the conversation.

- Use Vercel Chat SDK's official Web adapter and a small React UI.
- Bridge handlers to Platform SDK; persist conversation/thread to Agent/Session bindings.
- Restore history from Platform events and resume with opaque cursors.
- Render complete replies, tool progress, errors and turn outcome. Current SDK does not
  expose preview deltas; do not simulate token streaming.
- Run locally by default. Define application user identity before public deployment.
  Transport disconnect does not imply interrupting an Agent run.

Acceptance: refresh/follow-up reuse the correct Session; conversations stay separate;
browser receives neither a Project key nor arbitrary Agent access.

## Delivery

Custom Tool establishes external execution. RAG can reuse that pattern after design discussion.
MCP is independent. Chat SDK supplies the richer chat surface. Each is one feature session/PR.
Call out any foundation changes that affect other directories before broadening scope.
