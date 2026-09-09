---
name: dashboard-components
description: Use whenever creating or modifying Customer Intelligence Dashboard components, health score displays, or customer data UI (e.g. files under src/components/, health score badges/cards, customer lists/cards/tables). Encodes this project's React 19 + TypeScript + Tailwind + Next.js App Router conventions.
---

# Dashboard Components

Conventions for the Customer Intelligence Dashboard's UI layer. Apply these whenever
creating or editing a component under `src/components/`, anything rendering a health
score, or any customer-data UI (cards, tables, lists, detail panels).

## Stack & structure

- React 19 + TypeScript. Every component gets a named `Props` interface
  (`export interface {ComponentName}Props`).
- Components live at `src/components/[ComponentName].tsx`, one component per file,
  default-exported, named exactly like the file (e.g. `CustomerCard.tsx` exports
  `default function CustomerCard`).
- Styling is Tailwind utility classes only — no CSS modules, styled-components, or
  inline `style=` unless a value is truly dynamic and can't be expressed as a class.

## Next.js App Router: Server vs Client

- Default to Server Components — no `'use client'` directive unless the component
  needs one of: interactivity/event handlers (`onClick`, `onChange`, ...), React state
  or effects (`useState`, `useEffect`, ...), or browser-only APIs.
- When `'use client'` is needed, put it as the first line of the file and keep the
  client boundary as small/low as possible (push it to the leaf component, not a
  whole page).
- Presentational pieces (badges, indicators, static cards) should stay server
  components; only the interactive wrapper (e.g. a clickable card with an `onClick`
  prop) needs `'use client'`.

## Health score color rules

Health scores are 0-100. Map them to color bands like this:

| Range   | Band   | Example Tailwind classes                          |
|---------|--------|----------------------------------------------------|
| 0-40    | red    | `bg-red-50 text-red-800 border-red-300`             |
| 41-70   | yellow | `bg-yellow-50 text-yellow-800 border-yellow-300`    |
| 71-100  | green  | `bg-green-50 text-green-800 border-green-300`       |

- Clamp/normalize the score first (finite, 0-100) before banding it — see
  `normalizeScore` in [HealthIndicator.tsx](../../../src/components/HealthIndicator.tsx).
- Reuse the existing color-class helpers instead of re-deriving thresholds inline:
  `getHealthColorClasses` (badge/text colors) and `getHealthCardClasses`
  (card background/border) exported from `src/components/HealthIndicator.tsx`.
- If you add a new place that needs health-based coloring, import those helpers
  rather than hardcoding new threshold logic.

  > Note: the current `HealthIndicator.tsx` implementation bands at `<=30` /
  > `<=70` / `>70`, not `0-40/41-70/71-100`. If you touch that file, reconcile the
  > boundary at 31-40 with whoever owns the health-score spec before changing it,
  > since the two are currently mismatched.

## General component conventions

- Props destructured at the top of the function body, not in the signature, when
  there are more than 1-2 fields (see `CustomerCard`).
- Optional interactive behavior via an optional callback prop (`onClick?: (x: T) => void`)
  rather than assuming the component is always clickable.
- Use `focus-visible:ring-2 focus-visible:ring-blue-500` on interactive elements for
  keyboard focus states, matching `CustomerCard`.
- Keep data-shape imports (e.g. `Customer`) from `@/data/...` rather than redefining
  local ad-hoc types for shared domain objects.
