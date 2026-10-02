---
version: 1
slug: "src-ui-app-tsx"
primary_target: "src/ui/App.tsx"
related_targets: ["src/ui/style.css", "route:/"]
---

# Product Advisor selection workspace

## Purpose and authority

Mode: Operate. Users select a category, budget and hard conditions, search the synthetic catalog, inspect product facts, compare selected records and continue within a saved conversation.

The functional plan was approved on 2026-10-01. The user supplied no visual brand. This is a code-led surface, with `.impeccable/direction.md` as the initial direction and `src/ui/App.tsx` plus `src/ui/style.css` as the built ground truth. There is no approved image comp. `DESIGN.md` records the shared visual rules after implementation.

## Built composition

The initial view exposes category, budget and applicable filters, example requirements and a composer. No catalog records appear before successful remote evidence exists. Empty results distinguish “not queried” from “no matching products”.

Desktop places history at the left, conditions across the main area, results in a grid and a sticky conversation at the right. Mobile displays compact history, conditions, composer/conversation and then results in that DOM order. The first-session mobile introduction is shortened so the input remains easy to reach. Mobile fields use 16px text and product parameter rows use 12px text.

Product records emphasize price and known parameters before reasons, caveats and source disclosure. The images are synthetic category illustrations, not model-specific photographs. The catalog has three categories and 18 synthetic records; this count is content, not a reusable design-system rule.

## Interaction and state contract

- Search can execute automatically. Complete details and comparisons wait for native approval. Allow, deny, submitted and uncertain-delivery states remain explicit.
- Comparison uses 2–4 selected same-category records. Its output is a factual parameter table, with unknown values preserved as “目录未提供”.
- Comparison and saved-snapshot tables have focusable, labelled horizontal scroll regions. Their minimum table width remains inside that container on mobile.
- Conditions and submission are disabled while a turn is running. Recovery resubmits or reads the existing operation; it does not imply a new paid turn.
- Conversation history restores persisted state. A budget change produces a new query; saved snapshots retain their original conditions and evidence.
- Service-unconfigured, error, interrupted and denied states retain their own copy and any prior evidence. The bottom MCP query display stays visible for this demonstration project; full response JSON and call identifiers remain native disclosures.

The MCP panel exposes tool names, request JSON, verified returned products, receipt IDs and execution state. Its data flow and provenance text distinguish the offline Platform adapter from real local HTTP MCP calls. Request counts include blocked tool requests; only verified receipts count as success.

## Evidence and review boundary

The existing screenshots are local offline-harness artifacts:

- `.impeccable/review/desktop.png`
- `.impeccable/review/mobile.png`
- `.impeccable/review/empty-desktop.png`
- `.impeccable/review/empty-mobile.png`

They are visibly labelled “离线测试” and exercise the local UI with simulated Platform lifecycle and approval behavior. They are not staging evidence, remote Engine connectivity evidence, or proof of live approval enforcement.

The independent review reported `ship` after four scoped mobile/accessibility corrections: mobile input-before-results flow, the shortened first-session introduction, 16px mobile fields with 12px parameter rows, and focusable labelled table scrolling. All four were reported resolved. That disposition covers those four findings and is not a broader live-service certification.

The design detector ran once. Its Inter warning was addressed by the current system font stack. Do not rerun the detector just to document this finished surface.

## Known constraints

The visitor cookie is local demo ownership, not production login. Public hosting and live Platform checks require their own authorization and validation. The UI does not provide real purchase links, market prices or user reviews.

Some compact supporting text remains below 12px, including the mobile rank tag. These values are recorded as current implementation limits and are not adopted as body or parameter defaults. The illustrations identify categories without differentiating physical models. Neither constraint should become an invented product claim or a default for new surfaces.

The generic active button selector has higher specificity than the primary base selector. When a primary button is activated without pointer hover, it can take the generic pale active background while keeping white text. This is a source-level constraint outside the four reviewed findings. The sidecar does not adopt that active color combination as a reusable primary-button rule.

## Maintenance

Update this brief when task order, evidence rules, responsive composition or native approval states change. Refresh `DESIGN.md` and `.impeccable/design.json` together when shared visual tokens or component treatment change. Keep screenshot provenance explicit when live evidence becomes available.
