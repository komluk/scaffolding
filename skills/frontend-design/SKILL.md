---
name: frontend-design
description: "Distinctive, non-generic visual identity for new landing pages and public-facing UI. TRIGGER when: designing a new marketing/landing page or brand-forward UI that must not look templated. SKIP: rules, palette and font databases, a11y checklists (use ui-ux-pro-max); component code (use react-patterns)."
---

# Frontend Design — A Look Worth Remembering

Use when the goal is a page that looks **specific to its subject**, not like the
output every generator converges on. This skill is about *taste and decisions*.
For reference data (style catalogue, palettes, font pairings, UX rules, a11y), use
`ui-ux-pro-max`; for component code, `react-patterns` / `mui-styling`.

## Boundary with `ui-ux-pro-max`

| Question | Skill |
|----------|-------|
| "Which palette / font pair / UX rule fits this product type?" | `ui-ux-pro-max` (lookup) |
| "How do I make this page feel unlike every other one?" | `frontend-design` (direction) |
| Internal tool, dashboard, admin UI, existing design system | `ui-ux-pro-max` only — conventions beat novelty there |
| New landing page, campaign, portfolio, public product site | `frontend-design`, then `ui-ux-pro-max` to verify a11y/contrast |

If the user or an existing design system already fixes the look, follow it. This
skill only fills the choices the brief leaves open.

## 1. Anchor in the subject

Before any visual choice, write three lines: **what it is, who it is for, what the
visitor should do first.** Pull visual material from the subject's own world —
its materials, tools, vocabulary, artefacts, era — rather than from "what modern
sites look like". A cooperative bakery and a quantum-key vendor should not share
a layout.

## 2. Decide, don't default

Pick one deliberate answer per axis and be able to say *why it fits this subject*:

| Axis | Decide |
|------|--------|
| Palette | 4-6 named hex values; one dominant, one accent, neutrals with a tint |
| Type | One or two families with distinct roles; a defined scale and weights |
| Layout | A single organising idea (grid, axis, rhythm) and an alignment rule |
| Imagery | Real content, diagrams or illustration style — not stock filler |
| Motion | One orchestrated moment at most; the rest responds to user action |

## 3. Reflex check — common generic tells

If the first thing you reach for is on this list, treat it as a default and
justify or replace it:

- Purple-to-blue gradient hero, glassmorphism, glowing blobs
- Identical rounded cards in a three-column grid, same shadow on all
- Centred hero + two buttons + logo strip, always in that order
- Default system or most-popular web font, used at one weight
- Emoji or generic line icons as feature bullets
- Every section fading/sliding in on scroll; hover-lift on every card
- Filler copy: "Unlock the power of…", "Seamless", "Revolutionary"

A listed trait is fine when the subject genuinely calls for it; the failure is
using it *because it was the default*.

## 4. Spend boldness once

Choose **one** memorable element (a typographic treatment, a hero artefact, an
unusual layout break) and keep everything around it quiet. Remove decoration that
carries no meaning. Contrast between one loud and many calm elements reads as
intent; uniform loudness reads as noise.

## 5. Write the copy as design

Headlines state a concrete claim or outcome. Buttons name the action
("Start a free trial", not "Submit"). Use real or realistic content, never
lorem ipsum, and keep one name for one thing across the page.

## 6. Plan, review, then build

1. Write a short plan: palette, type roles, layout idea, the one bold element.
2. Compare it against §3. Rewrite any part you would produce for *any* similar brief.
3. Build. Keep CSS specificity flat so section/spacing rules do not cancel out.
4. Self-critique against the rendered result (screenshot if available).

## Quality floor (non-negotiable)

Responsive down to mobile, visible keyboard focus, `prefers-reduced-motion`
honoured, text contrast meets WCAG AA. Verify with `ui-ux-pro-max` accessibility
rules.
