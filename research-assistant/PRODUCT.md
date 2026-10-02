# Research Assistant Product Scope

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A local, single-user starter, confirmed by Finn on 2026-10-01. Users enter a topic,
read a brief, inspect its sources and continue the research through follow-ups.
The interface, example topics and default replies are in English. Saved input and
brief text retain their original language.

## Product Purpose

Complete the flow from question to public-source research, actual progress, a cited
brief, saved history, follow-ups and Markdown export. The brief is the primary result;
conversation carries input and follow-ups, and activity explains the research process.

The project also demonstrates SDK capabilities. SDK Debug at the top of the page shows
actual methods, state, duration and safe argument summaries. Platform events expose
run and tool phases, distinguishing history reads from live stream delivery.

## Operating Context

- One local Node service hosts both the browser UI and backend API.
- Vercel Chat SDK's official Web adapter connects to ZooWork Platform Sessions.
- A Project key and the published SDK create this application's Agent. The key stays server-side.
- Platform stores conversation text and events. Local state stores ownership mappings,
  stable request identities and recovery records.
- Refresh and server restart recovery require the same Agent and retained `.local/` data.

## Capabilities and Constraints

- Uses `web_search` and `web_fetch`, verified in staging with actual tools and a cited brief.
- The published SDK supplies complete assistant messages and durable events, without token previews.
- Session metadata is written at creation. The first submitted topic sets the title.
- Follow-ups reuse the same Session, without resending history.
- Public hosting, multi-user authentication, IM adapters, schedules, uploads and separate RAG are outside scope.
- Finn authorized implementation in this session. Staging verification follows the bounded handoff authorization.

## Evidence on Hand

Research UI, history recovery, sources, versions and export are implemented. Offline tests
cover idempotency, ownership, interruption, event recovery and source classification;
desktop and mobile browser tests cover the complete user flow.

[VALIDATION.md](VALIDATION.md) separates offline evidence from actual staging results and
uncovered areas. [REFERENCES.md](REFERENCES.md) records adapted source paths and the MIT notice.
Offline fixtures are labeled as simulated; fixture screenshots are not staging evidence.

## Product Principles

- Show sources and research limitations.
- Derive progress from actual events; never invent a completion percentage.
- Distinguish connection loss from research failure. Reconnect without resending input.
- Display, history versions and export use the same durable message text.
- Keep interface terminology, accessible labels and default output consistently English.

## Agreed Implementation Scope

Implement the local starter in [PLAN.md](PLAN.md), retaining the official sample's history
sidebar and reading layout. Code and desktop/mobile screenshots document the current UI;
there is no separate visual mockup.
