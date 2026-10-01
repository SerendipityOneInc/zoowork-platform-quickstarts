# Customer Support implementation plan

Startup: implement first. Technical focus: application-executed Custom Tools.

## Product flow

Ship a browser support workbench with seeded synthetic customers, orders and shipments.
A user asks about an order, sees its details and shipment timeline, asks a follow-up,
and creates a support ticket after confirming its contents. Show the resulting ticket ID
and status in the workbench. Clearly identify synthetic data; no production system is needed.

## Implementation

- Use a small local persistent data store with deterministic fixtures. Keep business handlers
  replaceable with a database or HTTP service; do not return hardcoded prose as a tool result.
- Declare order lookup, shipment lookup and ticket creation under `resource.custom_tools`.
  Validate tool input and enforce application customer ownership in backend code.
- Process `agent.custom_tool_use`, execute the relevant handler and return structured results
  through the released SDK. Ticket writes require explicit UI confirmation; a model decision
  alone does not confirm them. Cancellation must unblock the pending call with a clear outcome.
- Make ticket creation idempotent for a repeated tool call. Persist results and event cursors
  after successful processing; recover pending calls after application restart.
- Render useful order/shipment/ticket state as the primary UI. Keep the technical trace
  collapsible. Handle unknown orders, unavailable handlers, rejected confirmation and timeout.
- Use server-side Project-key setup to create this application's Agent. Bind each browser
  conversation to its own Platform Session and check ownership in backend routes.

## Acceptance

The seeded order can be queried through a real Custom Tool, and the answer matches its data.
A confirmed ticket persists, appears in the UI, and is not duplicated by replay or restart.
A denied ticket is not created. Reload restores the conversation and pending business action.
Tests cover ownership, input validation, replay/idempotency, confirmation and recovery.
A bounded staging run verifies actual Custom Tool execution, not only declaration acceptance.
Record a precise gateway/SDK gap if deployed execution is unavailable.

## Reference

Use [OpenAI Customer Support](https://github.com/openai/openai-chatkit-advanced-samples/tree/main/examples/customer-support)
for the relationship between chat, domain tools and the business side panel. Adapt the scope
and runtime to this app; do not carry over airline mutations, voice or attachment features.
Check the license and source commit before copying. See [references](../docs/REFERENCES.md).
