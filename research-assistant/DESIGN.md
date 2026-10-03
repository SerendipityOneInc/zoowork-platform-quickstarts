---
name: Research Assistant
description: Local research reading interface centered on briefs and sources
colors:
  accent: "#36523d"
  accent-hover: "#243f2b"
  text: "#252820"
  muted: "#61675d"
  background: "#f7f6f2"
  paper: "#fffefa"
  sidebar: "#edeee7"
  line: "#dedfd5"
  control-hover: "#e9ece3"
  history-selected: "#dfe4d8"
  on-accent: "#fff"
  failure: "#943e2d"
typography:
  headline:
    fontFamily: "Georgia, 'Songti SC', serif"
    fontSize: "1.85rem"
    fontWeight: 500
    lineHeight: 1.5
  section-title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.05rem"
    fontWeight: 650
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: ".95rem"
    lineHeight: 1.9
  control:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: ".86rem"
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: ".77rem"
  metadata:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: ".7rem"
  code-data:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: ".77rem"
rounded:
  control: "7px"
  compact: "5px"
spacing:
  small: "8px"
  compact: "12px"
  group: "18px"
  section: "24px"
  reading-inset: "34px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: ".6rem .85rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: ".6rem .85rem"
  button-secondary-hover:
    backgroundColor: "{colors.control-hover}"
  history-selected:
    backgroundColor: "{colors.history-selected}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "{spacing.compact}"
---

# Design System: Research Assistant

## Overview

**Creative North Star: Research brief reading interface**

Preserve the official Claude Chat SDK sample's history sidebar and reading layout.
Warm surfaces, clear body hierarchy and a separate sources area support continuous
reading. Brief headlines use serif; controls and supporting information use sans-serif.

Keep containers flat. Surface colors and thin borders separate regions; muted green
marks actions, links and selection. This document describes `web/app.css` and the
implemented components, rather than promoting one-off values into general tokens.

## Colors

Frontmatter defines the canonical palette. `accent` serves primary buttons, links,
active tabs, icons and tool status; `accent-hover` handles primary hover. `on-accent`
is reserved for text on the green primary action.

`background` is the reading surface, `paper` serves inputs and the composer, and
`sidebar` serves history and the mobile top bar. `text` and `muted` distinguish body
and supporting information. `line` separates regions. `control-hover` and
`history-selected` distinguish hover and selected history. `failure` marks failed tools
and the stop action. Source read states always include text, rather than relying on color.

## Typography

- **Display:** Georgia, with Songti SC as a fallback for saved non-English content.
  The welcome page also retains Noto Serif CJK SC as a fallback.
- **Body:** system-ui, -apple-system, Segoe UI, sans-serif for prose, controls and metadata.
- **Code/data:** `code-data` for SDK methods, IDs, tools, seq and argument/result JSON.
  Debug titles, tabs, purpose, states and provenance remain sans-serif.

Brief headlines use `headline`, reduced to 1.5rem on mobile. Section titles use
`section-title` with greater preceding space. Briefs and conversation use `body` and
a reading container capped at 850px. Controls, labels and metadata decrease in size.
Dates and source numbers use tabular numerals. JSON uses 1.7 line height and wraps
within its region. Call times and durations remain sans-serif with tabular numerals.

Use serif for the main brief headline, not to distinguish source credibility.

## Layout

Desktop has a 248px sticky history sidebar and a shrinkable content column. History
scrolls internally. The reading area has a separate 240px sources column; at 1500px
and wider it grows to 280px, with centered reading content and larger insets.

At 1150px and below, sources follow the brief and initially use two columns. At
760px and below, history becomes a 270px drawer, sources become one column, and the
top bar opens history. The mobile composer follows the document; desktop uses a
sticky bottom composer. Reading insets shrink to 23px on mobile. Long titles, URLs,
tables and code wrap or scroll within their own regions.

SDK Debug appears above both welcome and research views. Agent and Session IDs are
two columns on desktop and one on mobile. Mobile summaries and controls wrap, call
times occupy a separate line, purpose sits below the method, and parameter indentation
is removed. Logs scroll within a 360px desktop or 330px mobile maximum height.

## Elevation and Shapes

No box shadows. Surfaces and thin borders distinguish history, sources, inputs and
reading. The drawer has a translucent backdrop; keyboard focus uses an outline.
Buttons use `control` radius; version selection uses `compact`. Tabs and example
questions use straight edges and bottom borders. User messages have slight rounding.
Icons use consistent inline SVG strokes.

## Components

### Buttons and Inputs

Primary buttons are solid green. Secondary buttons are transparent with thin borders.
Disabled controls use .48 opacity and a disabled cursor. Buttons, links, select,
textarea and source items use a 2px keyboard focus outline with a 3px offset.
Textareas are transparent, borderless internally, inherit text color, use 1.7 line
height and resize vertically. Labels remain visible; placeholders supply examples.
The caret uses accent.

### Navigation and Reading

History items show topic, status and date. Topics are limited visually to two lines
and retain their full text in `title`. Selection uses `history-selected`; active tabs
use green text and a bottom border. Mobile reuses the same history inside its drawer.
Briefs occupy the reading surface directly; user messages use a pale rounded container.
Assistant text remains continuous prose. All app labels, examples, statuses, recovery
messages and accessible names are English. Content from saved research is displayed verbatim.

### Sources and Activity

Sources show number, title, domain and read status. Inline citation numbers focus the
matching source; external source links open independently. Links underline on hover
and show keyboard focus. `Research activity` uses native details with a rotating
chevron, status and actual call count. It opens while research runs and can collapse
afterward. Tool rows distinguish In progress, Completed, Not executed, Needs attention
and Failed.

### SDK Debug

Native details separates this flat area from research with a thin border. Its summary
retains SDK Debug, Current research/All sessions scope, running-call count, paused or
unavailable state. Expansion is remembered in browser session storage.

SDK calls and Platform events have separate tabs. The selected tab uses green text
and `paper`. Left/right keys switch and focus tabs; Home/End choose first/last. Only
the selected tab joins the tab order. Both panels stay mounted, switch with `hidden`,
and maintain aria-controls/aria-labelledby linkage.

Show history and status reads is enabled by default. Arguments and results uses
native details per call. Pause display freezes records, becoming Resume display;
research continues. Call rows show newest first: time, method, purpose, status and
measured duration, up to 40 entries. Running, Succeeded, Failed and Closed are distinct;
a successful SDK return does not mean research completed.

Events show up to 60 records with seq, type, provenance, tool phase and Run ID.
History read and Live stream remain text labels; historical tools are not new execution.
Loading, empty scope and read failures have explicit copy. Fault copy explains automatic
reconnection and continuing research. Offline mode explicitly states that Platform is
not connected. Only safe argument/result summaries are shown.

## Do's and Don'ts

- Preserve the documented surface, text and interaction palette, thin borders and small radii.
- Maintain reading, source and history hierarchy; stack in reading order on narrow screens.
- Keep action text, keyboard focus and explicit source status explanations.
- Avoid shadows or gradients on persistent reading surfaces.
- Do not imply fact verification using decoration, font differences or color alone.
- Do not fix the mobile composer over the brief or sources.
