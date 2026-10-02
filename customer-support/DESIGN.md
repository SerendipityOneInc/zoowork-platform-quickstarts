---
name: Customer Support
description: A practical support workbench with conversation and saved order context.
colors:
  ink: "#20312d"
  muted: "#5e6d67"
  line: "#dce3de"
  paper: "#fff"
  canvas: "#f5f6f2"
  green: "#183c35"
  green-soft: "#e9f1eb"
  green-hover: "#29594b"
  focus: "#437465"
  amber: "#86501a"
  amber-soft: "#fff5e5"
  danger: "#9c3434"
  error-soft: "#f9eaea"
  nav-hover: "#eaf0e9"
  nav-active: "#e4ebe3"
  input-border: "#bccbc0"
  input-focus: "#3c7660"
  secondary-border: "#b9c7bd"
  order-border: "#c8d2c9"
  order-active-border: "#648472"
  badge-soft: "#e3eee4"
  badge-delayed: "#f7eacd"
  confirmation-ink: "#573816"
  confirmation-muted: "#775735"
typography:
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "26px"
    fontWeight: 550
    lineHeight: 1.55
    letterSpacing: "-0.025em"
  title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "24px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  section:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "15px"
    fontWeight: 650
    lineHeight: 1.55
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  message:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.8
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "12px"
    fontWeight: 550
    lineHeight: 1.55
  small:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.55
  trace:
    fontFamily: "monospace"
    fontSize: "10px"
    fontWeight: 400
rounded:
  badge: "5px"
  chip: "6px"
  button: "7px"
  navigation: "8px"
  surface: "12px"
  circle: "50%"
spacing:
  tight: "4px"
  small: "8px"
  compact: "12px"
  regular: "16px"
  inset: "18px"
  mobile-gutter: "20px"
  section: "24px"
  conversation-gutter: "30px"
  wide-gutter: "42px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "9px 13px"
  button-primary-hover:
    backgroundColor: "{colors.green-hover}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "9px 13px"
  button-secondary-hover:
    backgroundColor: "{colors.green-soft}"
  button-icon:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.navigation}"
    size: "32px"
  conversation-link:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.navigation}"
    padding: "12px"
    width: "100%"
  conversation-link-hover:
    backgroundColor: "{colors.nav-hover}"
  conversation-link-active:
    backgroundColor: "{colors.nav-active}"
  order-selector:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.chip}"
    padding: "7px 11px"
  order-selector-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.green}"
  status:
    backgroundColor: "{colors.green-soft}"
    textColor: "{colors.green}"
    rounded: "{rounded.chip}"
    padding: "5px 9px"
  status-review:
    backgroundColor: "{colors.amber-soft}"
    textColor: "{colors.amber}"
  status-error:
    backgroundColor: "{colors.error-soft}"
    textColor: "{colors.danger}"
  composer:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.surface}"
    padding: "8px"
  confirmation:
    backgroundColor: "{colors.amber-soft}"
    textColor: "{colors.confirmation-ink}"
    rounded: "{rounded.surface}"
    padding: "18px"
  message-user:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "15px 18px"
---

# Design System: Customer Support

## Overview

**Creative North Star: "Practical Operate Workbench"**

The interface gives conversation and saved business context comparable visual weight. Muted green, an off-white canvas, a white conversation surface, and thin dividers support a compact working interface. Headings identify the task; small labels and tabular numbers make records easy to scan.

The signature interaction is an inline ticket review in the context panel. Its warm surface distinguishes a pending human decision from ordinary order information. Custom Tool summaries appear in the conversation timeline; raw call details stay in a closed disclosure at rest. System UI fonts and authored geometric SVG line icons provide the entire visual vocabulary; the app has no external font, image, or shipping raster asset.

This document records the code-built implementation in `public/index.html`, `public/style.css`, and `public/app.js`. There was no approved raster comp. The final independent verdict was **ship** for the two reviewed fixes: clearing stale messages when selecting an empty conversation and retaining keyboard focus during polling. That verdict is bounded to those fixes, rather than a whole-surface approval.

**Key Characteristics:**

- Compact working density with a clearly separated conversation and business context.
- Flat surfaces, restrained green actions, and warm pending-review emphasis.
- Explicit inline confirmation and recoverable error states.
- Responsive navigation and a vertical mobile reading order.
- Native controls, visible focus, and stable interactive regions during polling.

## Colors

The palette combines a dark muted green with warm off-white and white surfaces. Functional warm and red accents identify review and error states.

### Primary

- **Muted Green** (`green`): topbar, primary actions, selected order text, latest timeline marker, and ready status text.
- **Green Hover** (`green-hover`): primary button hover state.
- **Soft Green** (`green-soft`): ready status, secondary button hover, icon button hover, and order selector hover.
- **Focus Green** (`focus`): keyboard focus outlines on buttons, links, textareas, and disclosure summaries. The composer uses the separate `input-focus` stroke for its focus-within state.

### Secondary

- **Review Amber** (`amber`, `amber-soft`): pending-review status and delayed shipment state. The inline confirmation uses `amber-soft` with darker `confirmation-ink` and `confirmation-muted` text.
- **Delayed Badge** (`badge-delayed`): compact shipment warning surface.

### Tertiary

- **Error Red** (`danger`, `error-soft`): conversation status that needs attention. Recovery and the page alert use their existing warm brown treatments rather than turning all messages red.

### Neutral

- **Ink** (`ink`): primary reading text and control labels.
- **Muted Text** (`muted`): supporting copy, timestamps, field names, and technical disclosure content.
- **Paper** (`paper`): conversation panel, buttons, composer, and selected order selector.
- **Canvas** (`canvas`): outer workbench and user message surface.
- **Divider** (`line`): panel boundaries and context section separators.
- **Navigation Hover / Active** (`nav-hover`, `nav-active`): distinct conversation hover and current states.
- **Control Strokes** (`input-border`, `secondary-border`, `order-border`, `order-active-border`): input and secondary control boundaries.
- **Order Badge** (`badge-soft`): ordinary order and ticket status surface.

**The State Meaning Rule.** Keep status text alongside color. Warm emphasis means a review or delay; red means the conversation needs attention.

## Typography

**Interface Font:** the system UI stack in the frontmatter. All interface text, headings, controls, and messages use it. **Trace Font:** the browser's generic monospace font for structured results. There are no downloaded fonts.

### Hierarchy

- **Headline:** the centered welcome heading. It becomes (24px) at the mobile breakpoint.
- **Title:** the conversation heading. It becomes (23px) on mobile.
- **Section:** sidebar and context headings. The mobile context heading becomes (18px); shipment headings use (14px), and the inline review heading uses (16px).
- **Body:** standard interface text. Welcome and message paragraphs use the more open `message` line-height; assistant messages have a maximum width of (66ch).
- **Label:** composer labels and primary/secondary buttons. Context facts and supporting copy also commonly use (12px), with weight depending on purpose.
- **Small:** metadata and status labels. Hints, ticket timestamps, timeline times, and compact badges use (10px).
- **Trace:** preformatted handler results, wrapping rather than forcing horizontal page overflow.

Brand text uses (18px, weight 600) on desktop and (16px) on mobile. Order headings use (17px, weight 550). Dates, prices, order facts, and selectors use tabular numerals. Message text preserves newlines and wraps long unbroken content.

## Layout

The topbar spans the viewport at (76px) high. The centered workbench has a maximum width of (1700px) and a desktop height of `calc(100dvh - 76px)`. Its three columns are saved conversations, the flexible conversation panel, and order/shipment/ticket context. The sidebar, message log, and context panel have their own overflow behavior; the composer stays below the flexible message log.

| Width boundary | Implemented layout |
| --- | --- |
| Above 1100px and below 1400px | Columns (220px / minmax(360px, 1fr) / 365px). Conversation gutter (30px); context horizontal inset (24px). |
| At least 1400px | Columns (245px / minmax(420px, 1fr) / 400px). Conversation gutter (42px); context horizontal inset (30px). |
| At most 1100px | Columns (180px / minmax(300px, 1fr) / 320px). Conversation gutter (24px); context horizontal inset (18px). |
| At most 900px, above 680px | Sidebar becomes a full-width horizontal navigation row above a two-column conversation/context layout (minmax(300px, 1fr) / 330px). Saved conversations scroll horizontally; dates and the sidebar note are hidden. |
| At most 680px | Workbench becomes a vertical flow: compact navigation, conversation, then business context. Topbar height is (64px). Account mode and name are hidden; the initials remain. |

On mobile the conversation has a minimum height of (650px) and a requested height of `calc(100dvh - 122px)`. The context panel follows below it with visible overflow and a top divider. This is a scrollable page, not a compressed three-column desktop. Confirmation remains inline in the context panel. The mobile message gutter is (20px); composer and suggestion gutters are (16px). User messages expand from an (85%) desktop maximum to (94%) on mobile.

The spacing vocabulary is compact: small control gaps, regular section gaps, and larger panel gutters. Context data uses two-column label/value facts. Shipment events use a vertical timeline. Suggestions and confirmation actions wrap when space is limited. Do not infer a generic card grid from these sections.

## Elevation & Depth

There are no box shadows, gradients, glass effects, or floating overlays. White conversation content, the off-white surrounding canvas, state fills, and single-pixel borders convey hierarchy. The inline review gains attention through its warm fill rather than elevation.

**The Flat Surface Rule.** Preserve the current tonal and divider hierarchy when extending this workbench; do not add shadows to ordinary panels or records.

## Shapes

Rounded corners remain small and functional. The largest recurring radius is `surface`, used by the composer, user message, and inline confirmation. Navigation and recovery use `navigation`; buttons use `button`; selectors and status chips use `chip`; compact record badges use `badge`. The account initials and timeline dots are circular.

Icons are authored inline SVG with no fill, rounded strokes, a stroke width of (1.7), and simple geometric paths. The common icon size is (22px). Brand, welcome, item, and send icons have their own observed sizes. Keep icons secondary to text labels.

## Components

### Buttons and selectors

Primary and secondary buttons share compact label typography, the `button` radius, an (8px) content gap, and centered inline-flex alignment. Primary buttons use `green` and `paper`; hover uses `green-hover`. Secondary buttons use a white surface, `secondary-border`, and `ink`, with a `green-soft` hover fill. The new-conversation icon button is a (32px) square with a divider stroke and the `navigation` radius. There is no separate pressed transform or motion effect.

Disabled buttons use opacity (0.5) and a wait cursor. Busy work disables Send, New, Recover, and confirmation actions. Send is also disabled when the active conversation is not ready. The textarea remains editable while the Agent works. Order selection remains available during busy work; conversation selection ignores clicks while busy.

Order selectors are native buttons with `aria-pressed`. The selected selector has a white fill, green text, the `order-active-border` stroke, and weight (600). They are not an ARIA tab widget with arrow-key navigation. Starter suggestions place a prepared prompt into the textarea and focus it; they do not send it immediately.

### Composer and focus

The composer pairs a visible label with a resizable textarea and Send button inside a single outlined surface. Its field has a minimum height of (64px), maximum height of (200px), and a (4000-character) limit. Enter submits, Shift + Enter adds a line, and composition input is allowed to finish before Enter handling.

The global keyboard focus outline is (3px) with a (4px) offset. The textarea intentionally removes its own outline; the enclosing surface changes to `input-focus` through `:focus-within`. Buttons, links, and the technical summary retain their outlines. New conversation and starter suggestion actions move focus into the composer.

### Conversation navigation and messages

Saved conversation buttons show a strong title and muted tabular timestamp. Hover and `aria-current="true"` have distinct fills. At the compact-navigation breakpoint, titles remain and timestamps disappear.

The message log uses `role="log"`, polite live announcements, and additions/text relevance. Assistant messages remain on white without a bubble; user messages are right-aligned with a filled rounded surface. The empty state displays the welcome content. Switching to a saved empty conversation resets the message signature, so previous conversation messages cannot remain visible.

Messages and tool summaries are rendered only when their combined serialized contents change. The log follows a changed message when already within (90px) of the bottom, or when the latest message is from the user. Otherwise it preserves the reader's scroll position. Smooth log scrolling changes to automatic scrolling under `prefers-reduced-motion: reduce`; no other animation is defined.

### Context records and shipment timeline

Orders, shipment, tickets, and trace form one contextual column with dividers, not nested elevated cards. Product symbols use simple SVG geometry on a small muted tile. Facts align labels left and values right. Shipment history is newest first, with the latest dot green and older dots muted. Status text accompanies all colored badges.

### Inline protected confirmation

The warm confirmation surface appears only when pending jobs exist. Each request shows order, category, exact reason, expiry, and separate **Confirm & create ticket** and **Cancel request** actions. Multiple jobs are divided inside the same surface. A review is a human decision, so neither arrival nor polling submits it. The expiry copy explains that an expired request creates no ticket. The interface also explains that creating a ticket does not approve a refund or return.

### Starter connection guide

The offline workbench shows a compact muted-green connection notice below the conversation header. It explicitly says replies are simulated. Its native **Connect to ZooWork Platform** disclosure provides the Console link, Project/API Keys steps, server-side `.env` variable names, billing prerequisite and setup/dev commands. The disclosure stays closed by default and is outside polling render regions, so its open state and focused link remain stable. Mobile margins align with the message log, and commands wrap without horizontal overflow. With the disclosure open, the mobile conversation panel uses natural height so the composer remains above the order context. The notice is hidden in Platform mode; configuring a key is a server task, not a customer chat form.

### Status, recovery, and technical trace

The conversation status maps to Ready, Connecting, Working, Review needed, or Needs attention. A separate polite activity line describes current work. Errors use a page-level alert and a recovery region near the composer when needed. Uncertain responses retain saved state and expose **Recover conversation**; they do not present a missing response as a successful request.

Custom Tool summaries use a muted green surface, a thin left border and a compact code icon inside the message log. Each names the function and order, explains its business result and shows the actual saved lifecycle state. Pending ticket calls use the warm review surface and a **Review ticket request** button that focuses the protected confirmation, including on mobile. Calls are ordered by their persisted request timestamps; older saved jobs without timestamps appear after the recorded messages. Unchanged polling preserves the review button and its focus.

Tool call details use native `details`/`summary` and start closed. The count, tool name, result status, decision, call ID, input and wrapping JSON become visible on request. It stays below customer-facing context. The outer disclosure node is stable, so polling does not close an open trace.

### Polling and interactive DOM identity

The client polls the active conversation every (1200ms), skips overlapping polls and busy actions, and discards a response if the selected conversation changed. Unchanged conversation navigation and order selector HTML is not replaced. When their content does change, the renderer restores focus to the matching conversation or order button without scrolling. Pending confirmation markup is replaced only when its jobs signature changes, preserving its buttons during unchanged polls.

Order details, shipment, ticket records, and trace contents are rebuilt on each render. Those regions currently contain reading content rather than focusable controls. New interactive controls placed inside them must receive an equivalent identity/focus preservation policy. Do not assume every context descendant already has stable DOM identity.

**The Stable Interaction Rule.** A background refresh must not replace an unchanged interactive region or move keyboard focus away from its current control.

## Do's and Don'ts

### Do:

- **Do** keep conversation and saved order context visible together on desktop, and preserve navigation → conversation → context reading order on mobile.
- **Do** use the system UI font stack, compact typography, tabular record numbers, and authored inline SVG icons.
- **Do** keep status words alongside green, warm, and error colors.
- **Do** preserve explicit inline ticket review, exact request text, cancellation, and expiry information.
- **Do** preserve visible keyboard focus and DOM identity for unchanged interactive regions during polling.
- **Do** show tool names, outcomes and confirmation states in the conversation; keep raw parameters and JSON in the initially closed Tool call details disclosure.

### Don't:

- **Don't** add shadows, decorative gradients, external fonts, or stock imagery to this flat working interface.
- **Don't** replace the mobile stack with narrow desktop columns or hide the context data permanently.
- **Don't** submit a starter suggestion or pending ticket simply because it becomes visible.
- **Don't** retain another conversation's messages when switching to an empty conversation.
- **Don't** claim all context nodes are stable; reading-only regions are currently rebuilt.
- **Don't** describe a ticket as an approved refund, return, or carrier action.
