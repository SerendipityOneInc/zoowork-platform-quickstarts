# Product Advisor implementation plan

Startup: prepare context and implementation plan; wait for Finn to start implementation.
Technical focus: remote MCP.

## Product flow

A user describes a budget and requirements. The assistant searches a synthetic catalog,
shows product cards, compares relevant attributes and produces a shortlist. Follow-up
questions refine the same conversation. The user can inspect why a product was included
or excluded; unknown attributes remain unknown.

## Implementation

- Include a small read-only MCP server with synthetic catalog records and actual structured
  search/detail tools. Keep the server and its data in this app's directory.
- Configure public Streamable HTTP, explicit `toolFilter` and a small direct tool set.
  The deployed Platform must reach the endpoint; a server on localhost is insufficient.
- The current public contract supports unauthenticated external endpoints. Use public
  synthetic data and document how to host the server; do not design around unavailable
  external bearer/OAuth credential-write routes.
- Keep comparison cards and the shortlist as the main UI. Render actual tool progress,
  connection failures and inline approval where configured. Demonstrate that a rejected
  approval prevents the remote call. Tool exposure and approval are separate settings.
- Use server-side Project-key setup and persistent Platform Sessions, with backend
  conversation ownership checks. Do not fall back to local handlers and call that MCP.
- Deliver the runnable local server and hosting instructions before proposing a public
  deployment. Deployment follows the user's separate authorization and hosting rules.

## Acceptance

Recommendations match records fetched from the remote MCP service. Comparison and
follow-up retain the correct product facts. Denial prevents execution; an unavailable
server produces an understandable error. Offline tests cover catalog filtering, approvals
and error handling. Staging evidence must show actual remote tool execution.

## Reference

Use the [MCP guide](https://zoowork.ai/docs/en/build/mcp) for Platform behavior.
Official third-party app examples can inform layout and onboarding, but an MCP server
that wraps an agent API is a different integration direction. Do not copy it as a catalog
consumer without adapting that boundary. See [references](../docs/REFERENCES.md).
