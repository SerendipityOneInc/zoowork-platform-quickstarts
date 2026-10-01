---
name: Product Advisor
description: Product selection controls, catalog records and inspectable comparisons.
colors:
  green: "#24583c"
  green-hover: "#19432c"
  ink: "#25342b"
  muted: "#606a62"
  line: "#dde3da"
  field-line: "#cad3c7"
  paper: "#fff"
  canvas: "#f7f8f4"
  sage-field: "#edf1e8"
  selected: "#467546"
  focus: "#49784f"
  danger: "#943b27"
typography:
  headline:
    fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: "2rem"
    fontWeight: 650
    lineHeight: 1.45
    letterSpacing: "-0.025em"
  title:
    fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: "1.05rem"
    fontWeight: 650
  product-title:
    fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: "1.08rem"
    fontWeight: 650
    lineHeight: 1.5
  body:
    fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.75
  price:
    fontSize: "1.5rem"
    fontWeight: 650
    letterSpacing: "-0.025em"
  parameter:
    fontSize: "0.81rem"
  parameter-mobile:
    fontSize: "12px"
  control-mobile:
    fontSize: "16px"
rounded:
  tag: "5px"
  control: "8px"
  table: "10px"
  panel: "12px"
spacing:
  compact: "6px"
  small: "8px"
  field: "12px"
  mobile-panel: "14px"
  medium: "16px"
  record: "18px"
  panel: "20px"
  section: "26px"
  wide-section: "28px"
components:
  button-default:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "9px 13px"
  button-primary-hover:
    backgroundColor: "{colors.green-hover}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  product-record:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "{spacing.record}"
  rank-tag:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.green}"
    rounded: "{rounded.tag}"
    padding: "4px 8px"
  conversation-panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel}"
  comparison-table:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.table}"
---

# Design System: Product Advisor

## Overview

**Creative North Star: "Inspectable catalog records"**

The implemented system is a quiet catalog workspace. White panels separate input, conversation and product facts from a pale sage canvas. Dark green identifies primary actions and confirmed selections. Product data carries the hierarchy; decoration stays secondary.

One system sans-serif family serves headings, controls and data. Borders and changes in surface color define regions without shadows. This records the built UI in `src/ui/App.tsx` and `src/ui/style.css`; it does not establish a separate display identity or a new brand.

**Key Characteristics:**

- White task panels on pale sage surfaces.
- Dark green actions with explicit hover, disabled and focus states.
- Compact records with prominent prices and aligned parameters.
- Native controls and disclosures for keyboard use.
- One-column mobile composition with readable input and data sizes.

## Colors

The palette uses muted green surfaces and a single dark green action accent. Frontmatter is the normative list of extracted colors. Sidecar tonal ramps are synthesized color previews; they do not add implemented palette tokens.

### Primary

- **Dark green** (`green`): primary actions, links, checkboxes and conversation status.
- **Deep green** (`green-hover`): primary-action hover, also changing the button border.
- **Selection green** (`selected`): product record border and outline when checked for comparison.
- **Focus green** (`focus`): keyboard-visible outlines across controls and focusable regions.

### Neutral

- **Dark green ink** (`ink`): headings, product names and default control text.
- **Muted green gray** (`muted`): parameter labels, source details, supporting copy and diagnostics.
- **Pale divider** (`line`): panel borders, table rows and section separation.
- **Field divider** (`field-line`): the slightly stronger input border.
- **White paper** (`paper`): controls, product records and conversation panels.
- **Pale canvas** (`canvas`): the page background.
- **Sage product field** (`sage-field`): the synthetic category illustration area above a record.
- **Error brown** (`danger`): error text. Error notices also use a warm tinted background and border.

**The State Color Rule.** Green reinforces an action or a state; the accompanying label, checkbox or outline remains present.

## Typography

The family in `body` is used throughout the interface. There is no separately authored display face. The base rem size is the `body` font size.

### Hierarchy

- **Headline:** the page title uses `headline`; it changes to (1.75rem) at the middle breakpoint and (1.65rem) on mobile.
- **Titles:** section titles use `title`; product names use `product-title`, then (1rem) on mobile.
- **Body:** explanatory paragraphs use the `body` line height. Conversation copy is smaller (0.86rem) and preserves line breaks.
- **Price:** `price` sits directly below the name. It changes to (1.3rem) on mobile.
- **Parameters:** `parameter` aligns labels and values. On mobile, parameter rows use `parameter-mobile` instead of shrinking the rem scale.
- **Controls:** inputs, selects and textarea inherit the base family; mobile uses `control-mobile`, including the composer textarea.

**The Numeric Alignment Rule.** Prices, product IDs, parameter values and comparison tables use `font-variant-numeric: tabular-nums` so digits remain aligned.

Compact auxiliary tags and captions have their own sizes in the current stylesheet. They are not the default type scale for future body copy or parameter rows.

## Layout

The workspace is centered with a maximum width of (1640px). Its desktop grid has a history column (222px) and a flexible main area. The header is (76px) high. Main content starts with the page heading and a full-width conditions panel.

Desktop result and conversation columns are separate CSS grid placements. The result area is flexible; the conversation is (335px) wide and sticky below a top offset of (22px). Product records use two columns with an (18px) gap. At (1450px) and wider, records use three columns and conversation width is (350px).

At (1150px) and below, history narrows to (175px), records use one column and the conversation is (300px) wide. At (850px) and below, history becomes a horizontal scrolling row above the main content, the header becomes (65px) high and the sidebar footer is hidden.

At (650px) and below, content uses one column with a (24px) gap. Conversation and results return to automatic grid placement. The DOM puts the composer and conversation before results, so users reach the input before the mobile result list. Conversation is no longer sticky. Product bodies use `mobile-panel` padding, and condition fields wrap into two columns.

**The Source Order Rule.** Keep the input and conversation before results in the DOM. Use desktop grid placement for the side-by-side layout rather than moving mobile controls below the results.

Tables retain a minimum width of (480px) inside a scroll container. Overflow belongs to that container, not the page. Long history titles, messages and IDs wrap or truncate in their own regions.

## Elevation & Depth

The implementation has no box shadows. Depth comes from white panels against pale sage backgrounds, thin borders and a stronger border plus outline for selected records. The conversation's desktop sticky position supports access to the task; it is not a floating overlay.

**The Flat Surface Rule.** Use surface color and borders for panel separation, matching the current components.

Button background and border changes use (0.16s ease-out). There are no entrance animations or animated loading effects. Reduced-motion preferences remove transitions and use automatic scrolling.

## Shapes

Controls and notices use `control` corners; main panels and product records use `panel`; rank tags use `tag`; table containers use `table`. Product records clip their illustration field to the shared rounded frame. Borders are thin and restrained; selection adds an outline without changing layout dimensions.

Action icons are inline SVG with a consistent (18px) canvas and (1.7) stroke width. Product images are local synthetic SVG category drawings. The built images identify a category; they do not distinguish a real physical model.

## Components

### Buttons

Default buttons have white backgrounds, ink text, a thin divider border and `control` corners. Hover shifts to a pale green background and stronger border; active darkens the background. Primary buttons use dark green and white with inline SVG when present. The composer narrows default horizontal padding to (12px); record detail buttons fill the card and use (8px) padding.

All buttons use the global keyboard focus outline. Disabled buttons use opacity (0.55) and a `not-allowed` cursor. Disabled submission also has no hover or active background transition.

### Inputs / Fields

Fields use white backgrounds, the stronger field border and `control` corners. Labels remain visible; the composer also has a screen-reader label. The budget field places a currency symbol beside the input without adding a second outer border. Checkboxes remain native with a green accent.

The global focus treatment is a (3px) outline with a (3px) offset. Read-only execution states disable condition fields and the composer rather than accepting a concurrent turn. Input errors appear in a separate error notice; individual fields do not currently have a distinct error style.

### Navigation

History entries are full-width, left-aligned buttons on desktop. The active conversation has a white background and stronger border. A status line sits below the title. On mobile, entries become fixed-width (170px) items in a horizontal row; long titles truncate and the status line is hidden. The new-conversation action remains an SVG icon button with an accessible label.

### Product Records / Tags

Product records place the illustration field above name, record ID, price and a definition list of parameters. Reasons and caveats follow those facts. The detail action and a native “数据依据” disclosure sit last. Checkbox selection and optional rank labels overlay the illustration field.

The selected state uses the selection border and outline while keeping the comparison checkbox checked. Rank tags are factual ordering labels, not independent product claims. Unknown values stay visibly written as “目录未提供”. Do not replace them with a dash or a favorable value.

### Conversation / Approval

The composer appears before the message log. Messages are separated by thin dividers and use explicit speaker labels. The log is scrollable with a themed thin scrollbar and polite live announcements. Status text names the current operation.

Native approval cards are pale green bordered regions within the log. They show the requested detail or comparison operation, optional argument preview, and only the allowed decisions. Submitted and uncertain delivery states replace the decision buttons with status and, when available, a button to resubmit the original decision. Recovery and stop actions sit below the log.

### Comparison / Disclosures

Comparison tables use a white frame, sage column headers, row labels and tabular figures. A caption names the catalog version and approved result. Their scroll wrappers have `tabIndex=0`, `role="region"` and a label explaining horizontal scrolling, so keyboard users can focus and scroll them.

Saved snapshots and diagnostics use native `details`/`summary`. Original query conditions and facts remain under snapshots. Tool names and long receipt IDs remain in diagnostics; they wrap rather than extending the page width.

### Empty / Notice States

The empty-result area uses a dashed border, a synthetic catalog drawing and centered instructions. Before evidence exists it explains how to begin; after a successful empty search it explains how to adjust the conditions. Service and error notices name the limitation and next action, while prior evidence stays available when a turn fails or is denied.

## Do's and Don'ts

### Do:

- **Do** use white panels, pale sage regions and thin borders to group the task.
- **Do** keep prices, units, unknown values and source disclosure adjacent to product records.
- **Do** retain mobile input sizes, parameter row sizes and keyboard-visible focus from the extracted tokens.
- **Do** keep focusable horizontal scrolling around comparison and snapshot tables.
- **Do** show pending, submitted, denied, failed and recovery states with explicit text.

### Don't:

- **Don't** treat model prose as the source for price or parameter values; rendered facts come from catalog evidence.
- **Don't** replace native controls or disclosures with unlabeled decorative affordances.
- **Don't** turn synthetic category drawings into claims about a physical product model.
- **Don't** promote compact auxiliary label sizes to the body or parameter defaults.
- **Don't** reorder mobile results ahead of the composer and approval controls.
