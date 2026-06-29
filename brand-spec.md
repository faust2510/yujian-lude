# 迦南之约 — Brand Spec

## Reference
- **Source:** zhenai.com — leading Chinese dating platform
- **Layout patterns:** Full-width clean hero with search panel, trust credential strip,
  value-prop feature sections, service flow numbering, app download CTA
- **Mood:** Warm, trustworthy, professional — adapted for a Christian audience

## Palette (hex → OKLch)

| Token | Hex | OKLch | Role |
|-------|-----|-------|------|
| `--bg` | `#F7F5F2` | oklch(96% 0.010 80) | Page background — warm light stone |
| `--surface` | `#FFFFFF` | — | Cards, modals, form panels |
| `--fg` | `#1C1E24` | oklch(18% 0.010 260) | Primary text |
| `--fg-2` | `#374151` | oklch(30% 0.015 260) | Secondary text |
| `--muted` | `#6B7280` | oklch(50% 0.010 260) | Captions, metadata |
| `--border` | `#E5E3DF` | oklch(88% 0.008 80) | Card/input borders |
| `--border-soft` | `#F0EDE8` | oklch(92% 0.008 80) | Subtle dividers |
| `--accent` | `#C97B6B` | oklch(60% 0.080 30) | Warm rose — primary CTAs, links |
| `--accent-on` | `#FFFFFF` | — | Text on accent bg |
| `--accent-hover` | color-mix(in oklab, #C97B6B, black 8%) |
| `--accent-soft` | `#FBF0EC` | oklch(95% 0.025 30) | Accent tint backgrounds |

## Typography

- **Display (headings, hero):** `"Noto Serif SC", "Source Han Serif SC", Georgia, serif`
  — elegant, trustworthy, editorial feel
- **Body:** `-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif`
- **Mono:** `ui-monospace, "JetBrains Mono", monospace`
- Scale: 13 / 14 / 16 / 18 / 20 / 24 / 32 / 48 / 64
- Heading weight: 700 for display, 600 for body headlines

## Layout

- Max container: 1200px, centered
- Full-width sections alternating `--bg` and `--surface` backgrounds
- Hero: 2-column split (text left 1.1fr × search form right 400px)
  with large photography background overlay
- Trust strip: 4-column, light tint bg, centered icons/numbers
- Section rhythm: 80px top+bottom (desktop), 48px (tablet), 32px (phone)
- Cards: white, 12px radius, 1px border, minimal shadow on hover

## Component Rules

- **Primary button:** accent fill, white label, 8px radius, 44px min-height
- **Secondary button:** transparent, 1px border in accent, 8px radius
- **Input/Select:** 1px border, 12px radius, accent ring on focus
- **Links:** accent, no underline, underline on hover
- **Hero:** large-format photography background, tinted overlay,
  serif headline 48-64px
