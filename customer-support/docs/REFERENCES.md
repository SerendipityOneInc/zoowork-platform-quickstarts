# Sources and licenses

Checked 2026-10-01. Changes are limited to customer-support.

| Source | Pinned snapshot | Use |
| --- | --- | --- |
| [ZooWork TypeScript SDK](https://github.com/SerendipityOneInc/zoowork-sdk-typescript/releases/tag/v0.9.0) | Published `@zoowork-ai/sdk@0.9.0`, MIT | Agent lifecycle, Session creation/posting, durable events, pending Custom Tool queries and result resolution. Type declarations and runtime code reviewed from the installed package. |
| [OpenAI advanced ChatKit customer support](https://github.com/openai/openai-chatkit-advanced-samples/tree/9729a1c05411f10bd02c2a0780b23c443d5415d6/examples/customer-support) | `9729a1c05411f10bd02c2a0780b23c443d5415d6`, MIT (Copyright 2025 OpenAI) | Architectural reference for a conversation beside mutable customer context, business tools, confirmation and outcome synchronization. |
| [Node SQLite](https://nodejs.org/docs/latest-v22.x/api/sqlite.html) | Node 22.23.2 runtime | Local SQLite transactions, WAL persistence and synchronous database operations. |

The OpenAI files inspected were:

- `examples/customer-support/backend/app/support_agent.py`
- `examples/customer-support/frontend/src/components/CustomerContextPanel.tsx`
- The root `LICENSE`, read before implementation.

No third-party application code, images or fonts were copied. This app's handlers, SQLite journal,
HTTP routes and browser source are original. The reference's Python/Agents SDK/ChatKit calls and
in-memory airline mutations were replaced with the published ZooWork SDK, persistent shop fixtures,
server-side authorization and explicit browser confirmation. Voice, attachments and airline features
were outside scope. Since no source was copied, no copied-path attribution or additional license
notice is required. Dependency licenses remain in the installed packages; the app uses the repository MIT license.
