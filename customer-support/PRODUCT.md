# Customer Support

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

TypeScript, the published ZooWork SDK, Node's SQLite driver and native HTML/CSS/JavaScript.
The existing app uses TypeScript. The browser implementation is a session assumption:
no additional frontend framework is needed for one independently runnable workbench.

## Users

Developers evaluating a Platform customer support application, using a synthetic customer account.

## Product Purpose

Inspect orders and shipment history, continue a conversation, and create an after-sales ticket
only after a person confirms the exact request. The workbench shows the saved business state.

## Operating Context

Run locally with a server-side Project key. The application creates its own Agent and Sessions.
The database contains synthetic shop fixtures. No real shop, carrier or refund system is connected.

## Capabilities and Constraints

Custom Tools execute in the application. SQLite persists conversations, business data, confirmation
requests, tool results and event cursors. A model decision cannot authorize a ticket write.
English is required for the interface, Agent replies, data and application documentation.
Only customer-support is in scope. No Work Agents, channels, local SDK overrides or public deployment.

## Evidence on Hand

Orders ORD-1001 (delayed shipment) and ORD-1002 (delivered). A separate customer owns ORD-2001,
which must be inaccessible. The official OpenAI customer support example supplies architectural
reference material, rather than claims about this application's verification.

## Product Principles

- Show order, shipment and ticket data beside the conversation.
- Make confirmation explicit and recoverable.
- Preserve uncertainty after network failures.
- Keep technical traces secondary to customer outcomes.
