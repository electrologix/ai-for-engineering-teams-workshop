# Feature: HealthIndicator Component

## Context
- Reusable visual component for representing a customer's health score (0-100) with color coding
- Currently, health-score color logic (`getHealthColorClasses` / `getHealthCardClasses`) is duplicated inline inside `CustomerCard` — this component extracts that into a standalone, shareable unit
- Used by business analysts across the Customer Intelligence Dashboard to quickly assess customer risk at a glance
- Intended for reuse anywhere a health score needs a badge-style or card-accent visualization (e.g. `CustomerCard`, future `CustomerHealthDisplay` widget described in `requirements/health-score-calculator.md`)

## Requirements

### Functional Requirements
- Accept a numeric health score (0-100) as a prop and render a visual indicator
- Classify score into one of three risk levels: Critical (0-30), Warning (31-70), Healthy (71-100)
- Support at least a "badge" display variant (small pill showing the numeric score) matching the existing `CustomerCard` badge
- Optionally support a "card accent" variant that returns background/border classes for use on a containing card, matching existing `CustomerCard` behavior
- Gracefully handle out-of-range or invalid scores (e.g. clamp or fall back to a default state) without throwing

### User Interface Requirements
- Color-coded thresholds (must match existing `CustomerCard` and `health-score-calculator` conventions):
  - Red: 0-30 (critical)
  - Yellow: 31-70 (warning)
  - Green: 71-100 (healthy)
- Consistent with Tailwind color classes already used in `CustomerCard.tsx` (`bg-red-100 text-red-800 border-red-300`, etc.)
- No layout shift when the score updates

### Data Requirements
- Input: a single `healthScore: number` prop (0-100)
- No dependency on the full `Customer` object — should work standalone so other widgets can reuse it

### Integration Requirements
- `CustomerCard` should be refactored to consume this component instead of its inline `getHealthColorClasses`/`getHealthCardClasses` helpers
- Exposed as a typed, reusable component for future health-related widgets (e.g. `CustomerHealthDisplay`)
- Props-based, no side effects

## Constraints

### Technical Stack
- Next.js 15 (App Router)
- React 19
- TypeScript with strict mode
- Tailwind CSS for styling

### Performance Requirements
- Pure/presentational component with no side effects
- Negligible render cost (simple conditional class lookup)

### Design Constraints
- Follow the same color thresholds and Tailwind classes already established in `CustomerCard.tsx` — do not introduce a new color scheme
- Consistent spacing/sizing with existing badge usage in `CustomerCard`

### File Structure and Naming
- Component file: `src/components/HealthIndicator.tsx`
- Props interface: `HealthIndicatorProps` exported from the component file
- Follow project naming conventions (PascalCase for components)

### Security Considerations
- No user-supplied strings rendered without sanitization (score is numeric only)
- Proper TypeScript types to prevent invalid data from reaching render logic

## Acceptance Criteria

- [ ] Renders a badge showing the numeric health score
- [ ] Applies red styling for scores 0-30, yellow for 31-70, green for 71-100
- [ ] Provides a way to derive card-level accent classes (background/border) matching the same thresholds
- [ ] Handles invalid/out-of-range scores without throwing or rendering broken UI
- [ ] `CustomerCard` refactored to use `HealthIndicator` instead of its local helper functions, with no visual regression
- [ ] Proper TypeScript interfaces defined and exported
- [ ] No console errors or warnings
- [ ] Passes TypeScript strict mode checks
- [ ] Follows project code style and conventions
