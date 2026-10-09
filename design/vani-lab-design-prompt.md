# VANI Lab: design agent prompt

Paste everything below the line into the design agent.

---

You are designing the complete UI for **"VANI Lab"**, an internal web app for IndiaMART's voice-AI team. VANI is IndiaMART's outbound voice bot that calls sellers to get a meeting fixed. VANI Lab lets a team safely test changes to VANI's prompt on a small slice of live calls, score every version on a fixed set of metrics, and roll out only the winner. Users are product managers, prompt engineers, and technical developers. It is a desktop-first, professional tool, not a consumer app.

## Product context (everything you need, no other files are provided)

- **VANI** is IndiaMART's outbound voice bot. It phones sellers (businesses listed on IndiaMART) in Hindi, English and Hinglish and tries to get a **meeting fixed** with an IndiaMART executive.
- VANI's behaviour is controlled by a **prompt**. Today, prompt changes go live to all calls on judgement alone. VANI Lab fixes that: try a change on a small slice of calls, measure it, and roll out only the winner.
- **Versions:** A is the current baseline prompt. B and C are candidate prompts (a full rewrite or a small instruction change). Up to three versions run at once (A/B/C). Live test calls are placed by voice agents powered by **Sarvam** (an Indian voice-AI platform).
- **Primary goal:** Meeting Fixed rate (share of answered calls that end with a meeting booked). Secondary goals include call duration. Guardrails make sure a "winner" is not winning by causing harm (for example, bookings the seller later rejects).
- **Traffic is split by the last digit** of a seller's GLID (IndiaMART's internal seller/user ID) or of their mobile number. Each digit 0 to 9 is about 10% of traffic.
- **Flow of a test:** define the experiment → pre-prod evals (audit-based smoke test) → live A/B/C test → analysis → decision (promote / inconclusive / reject) → scale-up to more segments.
- Decisions must be statistically defensible. The app never claims a winner without showing the evidence, and it prefers "Inconclusive" over a weak win.
- **Privacy:** this is call data from real businesses. Use only synthetic placeholder data in every screen, and mask IDs.

## Tech and component stack

- Build the UI with **React + Tailwind CSS + shadcn/ui** components (Button, Table, Dialog/Sheet, Tabs, Badge, Popover, Tooltip, Toggle, Progress, Select, Sonner toasts, Command, etc.). Use shadcn tokens (CSS variables) for colour, radius and spacing so the IndiaMART theme can be swapped in one place.
- **Design inspiration:**
  - **opensourceui.in** (Opensource UI): a restrained, "shipped, not demo-reel" look. Paper-white surfaces, ink-coloured text, hairline borders, accent colour only for state, precise spacing and typography, minimal motion that respects reduced-motion, and focus shown by border change. Avoid purple-gradient dashboards and decorative glow.
  - **www.mcpcn.dev** (mcpcn): polished, accessible, shadcn-compatible blocks (built on Base UI) for app-style interfaces. Use it as a reference for tidy cards, panels and structured result blocks.
- **Mascots for versions:** use the open-source **page-mascot** library (https://github.com/nilbuild/page-mascot, MIT). Each version (A, B, C, ...) gets its **own unique mascot character**, and users interact with these mascots on the Live Pipeline screen. How it works: `npm i page-mascot`, then `<Mascot directions="/mascots/<name>-directions.webp" reactions="/mascots/<name>-reactions.webp" size={140} label="Version B mascot" />`. The mascot's head follows the cursor (nine directions) and shows one of nine expressions with a small squash animation when clicked. The squash respects reduced motion, and cursor tracking is off without a fine pointer. A character is a pair of sprite sheets (directions and reactions) that can be rendered in styles such as colour, ink, sketch, riso, paper or pixel. Use one consistent style across all versions so they read as a family. Each version's character differs clearly (species, colour, accessories) so people tell them apart at a glance. The character sheets are generated separately with the library's `/page-mascot` agent skill, so in your design use clearly marked **placeholder mascots** (simple friendly characters) in the same two-sheet format, and note that real sheets will be dropped in per version. Treat the mascot's name and character as a label for the version, for example "A: Fox", "B: Otter", "C: Owl".
- Lucide icons. No other UI frameworks.

## Design principles

- **Breathable, not a control room.** Generous whitespace, one primary task per screen, and few elements visible at once. Show the headline first and put detail behind progressive disclosure (expand, drawer, "show more"). Avoid dense dashboards, walls of numbers, and many competing colours or badges. A new user should understand each screen in about five seconds.
- Calm hierarchy: one clear primary action per screen, secondary actions visually quiet.
- Plain language labels. Keep jargon (such as confidence intervals) one click deeper than the headline.

## Visual identity (IndiaMART-styled)

- Clean, trustworthy B2B look. White and light-grey surfaces, IndiaMART brand blue as the primary colour, and a teal/green accent for positive actions and "winning" states. Match the current IndiaMART brand palette and confirm exact hex values against the brand guidelines.
- Semantic colours, used sparingly: green = pass/winning, amber = watch/inconclusive, red = failing/rejected.
- Sans-serif UI font, monospace font for prompts. 8px spacing grid, comfortable row height in tables.
- Light theme by default, dark theme supported. Accessible contrast (WCAG AA).
- Header: "VANI Lab" wordmark, experiment selector, environment badge (Pre-prod / Live), notifications bell, and user menu.
- Use synthetic or placeholder data only. Never show real seller names, phone numbers, or call content. Mask any ID shown, for example "GLID ••••482".

## Navigation

Left sidebar with these screens:

1. Experiment Setup
2. Prompts
3. Scorecard
4. Scale-up
5. Live Pipeline (a separate screen, not a tab of the others)

## Screen 1: Experiment Setup

A simple guided form, a few sections with plenty of space. It is not one long dense page. It defines a test before any traffic is sent.

- Hypothesis (one short text field).
- Versions: pick baseline A and candidates B / C from saved prompt versions.
- Traffic: eligible traffic, split between versions (for example 10% to the candidate), and a fixed time window (start and end).
- Metrics: shows the primary metric (editable) and secondary and guardrail metrics as short summaries, with "Edit" for details.
- Decision method: shows the rule in one sentence. This is a labelled placeholder until the product team finalises it.
- Review and Start. Once started, the definition is locked and read-only, with a clear "Locked" indicator and a note on why.

## Screen 2: Prompt Editor

- Left rail: the list of versions (A baseline, B, C, ...). Each shows a status chip (Draft / In test / Winner / Rejected / Live) and a small edited-by and timestamp line.
- Main area: a large monospace editor showing the full prompt of the selected version. Line numbers and find work. The editor is editable.
- Actions: Save as new version (never overwrite silently), Discard changes, Compare with another version (side-by-side diff with highlighted changes), Duplicate as new variant.
- Saved versions are immutable. Editing creates a new version with a changelog note field. Show version history with restore.
- States: unsaved-changes indicator, validation errors, and a read-only look for versions that are in a live test.

## Screen 3: Scorecard (per-metric scoring)

- A table with one row per version and one column per KPI. Each cell shows a 1 to 5 star rating, with the raw value on hover (for example "Meeting fixed rate 4.2%").
- The first score column is **Overall quality score** (1 to 5 stars plus a numeric value such as 4.3), computed from the KPI columns.
- The default sort is Overall score, descending.
- Clicking any KPI column header cycles **Ascending → Descending → Default**. Show a sort arrow and highlight the active column.
- Primary metric is Meeting Fixed rate, and it is user-editable (the user can change the primary metric and the weights). Secondary metrics sit beside it. Guardrail metrics sit in a visually separate group.
- A column-group toggle (Primary / Secondary / Guardrails / All). Default view shows Overall plus the primary and a few secondary metrics, so the table stays light.
- Each row has a quiet status: Leading, On track, Inconclusive, or Underperforming.
- **Confidence and sample progress.** Each cell stays a simple star rating. On hover or expand, show a small confidence-interval bar and a "calls collected vs needed" progress indicator. A row-level progress bar shows how close the version is to a conclusion.
- **Star-rating explainer.** An info icon opens a popover explaining how a raw metric value maps to stars and how the overall score is weighted. Keep it short, with a worked example.
- **Compare any two versions.** A "Compare" action lets the user pick two versions and see a side-by-side view with the metric deltas (better / worse / no real difference), without leaving the Scorecard.
- **Decision banner with three outcomes**: *Promote*, *Inconclusive*, *Reject*. "Inconclusive" is a first-class state meaning the baseline stays. Each outcome shows, in one short line, the rule used and the key evidence, with a "See details" link. Do not auto-promote on weak data.
- Auto-rejection panel (placeholder; the decision strategy is still being defined by the product team):
  - For a version flagged as clearly worse, show a banner such as "Version C is performing worst and is recommended for rejection."
  - Design two interchangeable modes: **Auto-reject** and **Reject on my approval** (Approve / Keep testing buttons).
  - Leave a clearly labelled slot for the "why" (evidence and rule used). The content will be supplied later. Do not invent the rule.
- One-click rollback to the baseline on any promoted version, with a link to its action history.

## Screen 4: Scale-up dialog

- Opened from a version (button "Scale to segment") as a modal or full-screen wizard.
- Step 1: Choose the version to scale.
- Step 2: Choose the segment.
  - GLID ending digit: ten selectable chips, 0 to 9, multi-select.
  - Mobile number ending digit: ten selectable chips, 0 to 9, multi-select.
  - A toggle between these two key types. Selecting multiple digits is allowed.
  - Live summary: the estimated share of traffic selected (each digit is about 10%), shown as a progress bar with a number such as "30% of eligible calls".
  - Warning if the selection overlaps a segment already in another running test.
- Step 3: Review the version, segment, traffic share, time window, and a primary-metric recap. Buttons: Confirm scale-up and Cancel.
- Show the resulting split visually: a 10-block grid with chosen digits filled in and each block labelled with its version.

## Screen 4b: Segment map

A simple page, or a panel on the Scale-up screen, that shows **which prompt version is live on each digit segment**.

- A ten-block map (digits 0 to 9) for GLID and another for mobile number, with a toggle between them.
- Each block shows the live version as a colour and a short label (for example "A", "B"), and "Free" if no test uses it.
- Click a block to see the version, since when, and the experiment it belongs to.
- Keep it airy, with large blocks and a small legend.

## Screen 5: Live Testing Pipeline (separate screen)

Purpose: show the full journey of a version from idea to live evidence. Calls in the live step are made by Sarvam-powered voice agents running versions A / B / C.

- A horizontal progress map (stepper / progress line). Each checkpoint shows Done / In progress / Pending / Skipped / Failed:
  1. Define experiment (versions, segment, split, window)
  2. Pre-prod evals (audit-based smoke test)
  3. Live test A/B/C (Sarvam voice agents on the allocated traffic)
  4. Analysis (significance and guardrail checks)
  5. Decision (promote, reject, or inconclusive)
  6. Scale-up
  - Optional and visually muted: "Digital twin (multi-turn simulation)". Mark it "Optional / later" and make it skippable.
- Clicking a checkpoint opens its detail panel below the line (logs, timestamps, numbers). Only the selected checkpoint's detail is open at a time.
- **Version mascots.** In the live step, show one "version card" per running version (A / B / C) in a row. Each card has the version's own **mascot** (see the mascot guidance above) with a small, quiet "Live" pulse dot that shows activity (still when idle, gently pulsing while calls are in progress). Under the mascot show the version label, the mascot's name, and a one-line status (for example "12 calls in progress").
  - **Interaction:** the mascot's eyes follow the cursor. Clicking the mascot gives it a playful reaction and also selects that version, which filters the detail panel and results table below to that version. The selected card gets a clear but quiet highlight, and clicking it again clears the filter.
  - Use a distinct, subtle colour per version for the card accent.
  - The mascots are the one expressive element on the screen; keep everything else quiet and uncluttered.
  - Fallbacks: no squash animation and a static dot under reduced motion; a still mascot on devices with no fine pointer.
  - Mascots can also appear, small, as the version's avatar in the pipeline detail panel and results table headers, so the identity carries through. Do not use mascots on the Scorecard star ratings or Scale-up dialog beyond a small avatar next to the version name.
- Under the version cards, show a light live strip: calls placed, answered, in progress, and the split per version against the target. Show the split-validity check as a single pass or fail badge.
- A results table of the metrics that are **statistically significant**.
  - Columns: metric, A, B, C, difference vs baseline, significance, verdict.
  - Metrics that are not significant are **hidden by default**. A clear control, such as "Show all metrics (N hidden)", reveals them. Hidden metrics are still computed internally. Revealed rows get an "internal / debug" tag. This control is intended for technical developers debugging a prompt.

## Early-stop demo

- A "Simulate a worse variant" control on the Live Pipeline screen, labelled **Simulated data** wherever it appears.
- It plays a short sequence: Version B's evidence crosses the "clearly worse" boundary, the pipeline shows an Early stop, and traffic visibly returns to A (the split strip animates back to the baseline). On the version cards, B's mascot card turns into a quiet "Stopped" state (greyed, pulse dot off), while A's card stays active.
- Show the rule that was crossed in one line and the evidence in a small expandable panel. Do not invent the rule; keep the rule text as a labelled placeholder.
- A clear "Reset demo" control.

## Notifications

- A bell in the header opens a quiet list of alerts: a guardrail breached, a version flagged for rejection, an early stop triggered, a test ended, and a decision waiting for approval.
- Each item has a short title, the experiment name, a timestamp, and one action ("Review"). Unread items get a small dot.
- A settings link lets the user choose which alert types they get. Keep the default view calm: no banners that pile up, and no sounds.
- Design it so the same alerts can later be sent to a WhatsApp dashboard. Show an optional "Also send to WhatsApp" toggle as a placeholder.

## Metrics (these names appear in the UI)

Primary (editable by the user):

- Meeting Fixed rate

Secondary:

- Call duration (seconds)
- Answer rate
- Location confirmed rate
- Callback requested rate

Guardrails (a version must not be significantly worse):

- Incorrect meeting-fixed rate (seller later rejected the meeting)
- Do-not-call rate
- Early drop rate (call dropped mid-pitch)
- Bot response latency (P95)
- Loopy / repeating calls rate
- Seller had to repeat themselves rate

Internal, hidden by default unless significant:

- Not interested rate, Call later rate, Pronunciation quality, Overlap count, Seller question gaps, Already-in-touch rate, Objection mix

Do not change or add metrics. Treat these names as a fixed list.

## Sample content to use (synthetic only)

- Versions: **A (baseline, "Current production prompt")**, **B ("Shorter opening, direct meeting ask")**, **C ("Hinglish-first greeting")**. Statuses for the demo: A = Live, B = In test, C = In test. Mascots (placeholders): A = Fox, B = Otter, C = Owl.
- Example Scorecard values: Overall A 3.6, B 4.2, C 2.7. Meeting Fixed rate A 11.5%, B 13.2%, C 9.8%. Call duration A 74s, B 69s, C 81s. These are placeholders. Mark the Scorecard "Sample data".
- Prompt text: write a plausible, short VANI sales-call prompt in English with a little Hinglish (greeting, introduce IndiaMART, ask about the seller's business, propose a meeting with an executive, handle "not interested" politely). It must not contain real names or numbers.
- Masked IDs only, such as "GLID ••••482". Experiment name example: "Shorter opening vs baseline".

## Also design

- A small regression / overfitting check badge on each version ("No regression on previous scenarios"). This is a badge only; the metric is still being defined.
- Empty, loading, error, and "inconclusive" states for every table and chart.
- Desktop-first, responsive down to 1280px wide. No mobile layout needed.
- Keyboard accessibility and visible focus states on all interactive elements.

## Deliverable

High-fidelity screens for all areas above, built from shadcn/ui components and, where custom, extending them (star rating, stepper, version mascot card, version avatar, segment map, notification list, decision banner), with design tokens (colour, type, spacing) as shadcn CSS variables, and the key interaction states (sort, hover, expand, modal, empty, early stop). If you produce code, use React + Tailwind + shadcn. Note any assumptions explicitly, and label every placeholder that depends on a pending product decision (auto-rejection strategy, decision method, regression metric, star mapping).
