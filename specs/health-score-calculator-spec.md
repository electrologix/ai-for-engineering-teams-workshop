# Feature: Health Score Calculator

## Context
- Comprehensive customer health scoring system for the Customer Intelligence Dashboard
- Provides predictive analytics for customer relationship health and churn risk
- Combines a pure-function calculation library with a UI widget that surfaces the result
- Used by business analysts to assess customer risk and prioritize outreach
- Builds on the existing `Customer` data shape in `src/data/mock-customers.ts` and integrates with the CustomerSelector component

## Requirements

### Core Algorithm
- Calculate a customer health score on a 0-100 scale
- Multi-factor weighted calculation:
  - Payment history: 40%
  - Engagement: 30%
  - Contract status: 20%
  - Support satisfaction: 10%
- Risk level classification derived from the final score:
  - Healthy: 71-100
  - Warning: 31-70
  - Critical: 0-30

### Pure Function Implementation
- Modular calculator functions in `src/lib/healthCalculator.ts`
- One scoring function per factor:
  - `calculatePaymentScore`
  - `calculateEngagementScore`
  - `calculateContractScore`
  - `calculateSupportScore`
- A `calculateHealthScore` function that combines the four factor scores using the weights above and returns the overall score, risk level, and per-factor breakdown
- All functions are pure (no side effects, no I/O) so results are deterministic and easy to unit test
- Input validation with descriptive error messages for missing, malformed, or out-of-range data
- TypeScript interfaces exported for all inputs, outputs, and the breakdown structure

### Data Input Requirements
- Payment history: days since last payment, average payment delay (days), overdue amount
- Engagement metrics: login frequency (e.g. logins/week), feature usage count, support ticket count
- Contract information: days until renewal, contract value, whether a recent upgrade occurred
- Support data: average resolution time (hours), satisfaction score, escalation count

### Normalization & Edge Cases
- Each factor score is normalized to a 0-100 sub-score before weighting
- New customers with insufficient history (e.g. no payment or support data yet) receive a documented neutral/default sub-score rather than an error, unless required fields are missing entirely
- Missing required fields raise a validation error; optional/unknown fields fall back to documented defaults
- Trend direction (improving vs. declining) is out of scope for v1 but the data shapes should not preclude adding it later

### UI Component Integration
- `CustomerHealthDisplay` component in `src/components/CustomerHealthDisplay.tsx`
- Displays the overall health score with color-coded visualization matching existing dashboard conventions:
  - Red: 0-30 (critical)
  - Yellow: 31-70 (warning)
  - Green: 71-100 (healthy)
- Expandable/collapsible section showing the individual factor scores and their weights
- Loading and error states consistent with other dashboard widgets
- Re-renders with the newly selected customer's score when CustomerSelector's selection changes

### Integration Requirements
- Consumes the `Customer` interface (and any new factor-input fields added to mock data) from `src/data/mock-customers.ts`
- Receives the selected customer via props from the parent/CustomerSelector, following the existing props-based data flow pattern
- No direct network or storage calls from the calculator or display component — data is passed in

## Constraints

### Technical Stack
- Next.js 15 (App Router), React 19
- TypeScript with strict mode for all interfaces and functions
- Tailwind CSS for styling, consistent with existing components

### Architecture
- Pure function architecture in `src/lib/healthCalculator.ts` — no React, no side effects, fully unit-testable in isolation
- Custom error classes (e.g. `HealthScoreValidationError`) extending the base `Error`
- Detailed JSDoc comments on each exported function explaining the business rationale and formula, not just the mechanics
- `CustomerHealthDisplay` file: `src/components/CustomerHealthDisplay.tsx`; props interface `CustomerHealthDisplayProps` exported from the component file

### Performance
- Calculation must be cheap enough for real-time recalculation on every CustomerSelector change (no perceptible UI delay)
- No unnecessary re-computation — memoize the calculation result per customer where it's cheap to do so (e.g. `useMemo` keyed on customer id)

### Explainability
- Every returned result includes the per-factor breakdown (raw inputs → normalized sub-score → weighted contribution) so the overall score can be explained to stakeholders
- Weighting and normalization constants are named/exported, not magic numbers, so they can be reviewed and recalibrated

## Acceptance Criteria

- [ ] `calculateHealthScore` returns an overall score (0-100), a risk level (Healthy/Warning/Critical), and a breakdown of the four factor scores
- [ ] Weights applied are exactly Payment 40%, Engagement 30%, Contract 20%, Support 10%
- [ ] Risk level boundaries match spec: Critical 0-30, Warning 31-70, Healthy 71-100
- [ ] Each factor scoring function (`calculatePaymentScore`, `calculateEngagementScore`, `calculateContractScore`, `calculateSupportScore`) is independently exported and unit-testable
- [ ] Invalid or missing required input throws a typed validation error with a descriptive message
- [ ] New-customer/missing-history edge cases produce a documented default rather than a crash
- [ ] All functions in `healthCalculator.ts` are pure and have no side effects
- [ ] Unit tests cover boundary conditions (score exactly 30/31/70/71), realistic customer scenarios, and invalid-input handling
- [ ] `CustomerHealthDisplay` renders the overall score with correct color coding and an expandable factor breakdown
- [ ] `CustomerHealthDisplay` shows loading and error states consistent with other dashboard widgets
- [ ] Selecting a different customer in CustomerSelector updates the displayed health score
- [ ] All interfaces and functions pass TypeScript strict mode checks
- [ ] No console errors or warnings during normal operation
