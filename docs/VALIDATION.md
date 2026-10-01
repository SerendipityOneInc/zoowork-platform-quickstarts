# Foundation validation

2026-10-01, Node 22.23.2, published `@zoowork-ai/sdk@0.9.0`.

- All four independent packages installed from their npm lockfiles.
- Each directory passed TypeScript checking and the same 12 offline lifecycle checks:
  Project-key input, staging target, resource reuse, uncertain create, 404 handling,
  cleanup ownership, stop failure, uncertain Session create, cleanup order, deployment
  isolation, concurrent setup and failure-log redaction.
- One authorized staging smoke ran from `custom-tool/` against the public staging API.
  It created/started one temporary Agent, created one Session, completed one model turn,
  matched REST history with SSE text and deleted the Session, stopped/deleted the Agent.
  The recovery record was removed after successful cleanup. No key or live ID is recorded here.
- Relative documentation links and Git whitespace checks passed.

The lifecycle sources are identical across the four directories; demo identity/configuration
is local. The single live check validates this common foundation, not Custom Tool execution,
MCP calls/approval, external retrieval, Chat SDK UI or production deployment.
Feature sessions must add their own implementation and verification evidence.
