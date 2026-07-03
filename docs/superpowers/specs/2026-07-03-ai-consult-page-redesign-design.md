# AI Consult Page Redesign Design

## Goal

Redesign `/app/ai` as a focused consultation tool page for “遇见路得”, keeping the existing AI endpoints and app shell intact while improving trust, readability, and user flow.

## Page Type

The page is a hybrid **tool page + content page** inside the protected application area. It should open directly into the working consultation experience, not a marketing landing page.

## Visual Direction

Use a quiet Apple/Notion-style application surface: warm, restrained, readable, and pastoral without becoming decorative. The page should feel like a serious guided consultation desk: the user asks, receives a bounded answer, sees sources, and can review recent questions.

## Typography

- H1: 24px / 32px, serif heading, used only once.
- Section headings: 15-16px / 24px, compact and scannable.
- Body: 14px / 24px for answers and guidance.
- Meta text: 12-13px / 18px for history, source labels, and boundary notes.
- Buttons: 14px / 20px, stable height.

## Color System

- Background: existing `--bg` warm off-white.
- Surface: `--surface` white.
- Primary: existing rose brand for app continuity.
- Secondary trust color: deep green for scope, sources, and safe guidance.
- Accent: warm warning yellow only for out-of-scope answers.
- Border: existing `--border`.
- Danger/success: existing `--danger` and `--success`.

## Layout

Desktop layout uses a two-column consultation desk:

- Header row: title, concise scope sentence, and small boundary badge.
- Main column: prompt form, suggested question chips, error state, answer panel.
- Side column: “咨询边界” checklist, “最近咨询” history, and escalation guidance.
- Empty state: visible suggestions before the first answer.
- Loading state: stable button label and answer placeholder; no layout jump.
- Mobile layout: single column, side content stacks below the main form.

## Interaction And Motion

- Textarea focus gets a subtle border/shadow transition.
- Suggested question chips fill the textarea without submitting.
- Answer and history rows use a small fade/translate entrance; hover states stay restrained.

## Not In Scope

- No backend AI behavior changes.
- No new external UI library.
- No purple gradients, glassmorphism, full-screen rounded-card wall, emoji icon piles, fake dashboard, or meaningless stats.
