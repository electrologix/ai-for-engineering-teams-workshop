# Feature: Customer Health Monitoring (Integration)

## Context
- Integration feature for the Customer Intelligence Dashboard that connects the **Health Score Calculator** (`src/lib/healthCalculator.ts`, see [health-score-calculator-spec.md](./health-score-calculator-spec.md)) with a new **Predictive Alerts** rules engine (`src/lib/alerts.ts`)
- Goal: turn a point-in-time health score into ongoing, proactive risk monitoring — detecting meaningful changes and surfacing prioritized alerts before a customer churns
- Used by business analysts / customer success managers who already rely on `CustomerSelector` and `CustomerHealthDisplay` to assess a single customer, and now need system-wide, always-on monitoring across all customers
- Builds on the existing `Customer` shape in `src/data/mock-customers.ts` and the factor-input data model defined in the Health Score Calculator spec (payment, engagement, contract, support)
- New in this feature: customer **state history** (prior health scores and factor snapshots over time) is required as an input, since several alert rules are trend-based (e.g. "health score drops >20 points in 7 days"); this is not part of the base calculator spec and must be introduced here

## Requirements

### Data Monitoring & Change Detection
- A `CustomerHealthSnapshot` is recorded each time `calculateHealthScore` runs for a customer (score, risk level, factor breakdown, raw factor inputs, timestamp)
- Snapshot history is retained per customer for at least a rolling 30-day window (in-memory store for the workshop; interface designed so a real persistence layer could be swapped in)
- Change detection compares the latest snapshot against prior snapshots to compute:
  - Health score delta over a given window (e.g. 7-day drop)
  - Login frequency delta vs. a 30-day rolling average
  - Payment delay/overdue changes
  - Support ticket count/escalation changes within a window
  - Feature usage recency (days since any new feature adoption)

### Alert Rules Engine
- Pure function implementation in `src/lib/alerts.ts`; a single `evaluateAlerts(customer, history)` (or `alertEngine`) function evaluates all rules against a customer's current data + snapshot history and returns the set of currently-triggered alerts
- Each rule is its own pure, independently testable function (e.g. `checkPaymentRiskAlert`, `checkEngagementCliffAlert`, `checkContractExpirationRisk`, `checkSupportTicketSpike`, `checkFeatureAdoptionStall`)
- Two-tier priority system:
  - **High Priority**
    - Payment Risk: payment overdue >30 days OR health score drops >20 points within 7 days
    - Engagement Cliff: login frequency drops >50% vs. the 30-day average
    - Contract Expiration Risk: contract expires in <90 days AND health score <50
  - **Medium Priority**
    - Support Ticket Spike: >3 support tickets in 7 days OR any escalated ticket
    - Feature Adoption Stall: no new feature usage in 30 days for accounts flagged as "growing" (e.g. recent upgrade or premium/enterprise tier)
- Alert prioritization/ranking within a tier considers customer ARR/contract value and how recently the triggering condition appeared (more recent + higher value ranks first)
- Deduplication: the same customer + same rule does not produce a new alert while an equivalent alert is already active (see cooldowns)
- Cooldown periods per rule (e.g. 24h for High Priority, 72h for Medium Priority) prevent re-triggering the same alert repeatedly from noisy/flapping data
- Alert history/audit trail: every triggered alert (including ones later dismissed or superseded) is retained with timestamps for later effectiveness analysis

### Data Input Requirements (extends Health Score Calculator inputs)
- Reuses the payment, engagement, contract, and support input shapes from the Health Score Calculator spec
- Adds: prior snapshots (score + inputs + timestamp) needed for trend rules, and a rolling 30-day login-frequency average per customer

### User Interface Components
- `PredictiveAlertsPanel` widget integrated into the main dashboard (alongside `CustomerHealthDisplay`), showing alerts for the currently selected customer and/or a dashboard-wide alert feed
- Priority color coding consistent with dashboard conventions: red = High Priority, yellow = Medium Priority
- Each alert item shows: alert type, priority, triggering condition in plain language, recommended action, and time triggered
- Alert dismissal/acknowledgement action, tracked in the audit trail (who/when dismissed — mock/local for the workshop)
- Historical alerts view filterable by customer, priority, and rule type
- Loading and error states consistent with other dashboard widgets
- Re-evaluates and re-renders when `CustomerSelector`'s selection changes or new snapshot data arrives

### Integration Requirements
- `alertEngine` consumes the output of `calculateHealthScore` (score, risk level, breakdown) plus the raw factor inputs — it does not recompute health scoring logic itself
- Integrates with `CustomerSelector` for customer context and with `CustomerHealthDisplay` for score context (alerts panel and health display render side-by-side, driven by the same selected customer)
- No direct network or storage calls from the pure rule functions — history and current data are passed in; any persistence/store lives in a thin service layer outside `lib/alerts.ts`

## Constraints

### Technical Stack
- Next.js 15 (App Router), React 19
- TypeScript with strict mode for all interfaces and functions
- Tailwind CSS for styling, consistent with existing components

### Architecture
- `src/lib/alerts.ts`: pure functions only (rule checks + `evaluateAlerts`), no React, no I/O, fully unit-testable in isolation — mirrors the pure-function architecture of `healthCalculator.ts`
- Custom error classes (e.g. `AlertValidationError`) extending base `Error` for invalid inputs
- A separate, non-pure service module (e.g. `src/lib/alertStore.ts` or similar) owns snapshot history, cooldown state, and audit trail persistence — kept out of `alerts.ts` to preserve its purity
- TypeScript interfaces for `Alert`, `AlertRule`, `AlertPriority`, `CustomerHealthSnapshot`, and the `evaluateAlerts` input/output shapes
- Detailed JSDoc on each rule function explaining the business condition and why the threshold was chosen

### Security
- Input validation on all customer data and rule parameters before evaluation
- Alert messages surface only what's needed to act (e.g. "payment overdue 34 days") — no raw sensitive customer data (full payment records, PII beyond what's already shown elsewhere in the dashboard) embedded in alert text
- Rate limiting / cooldowns double as abuse prevention against alert flooding from noisy or malicious input data
- All triggered alerts and dismissal actions are captured in the audit trail

### Performance
- Rule evaluation must run efficiently across hundreds of customers without blocking the UI (e.g. batched/async evaluation outside the render path)
- Snapshot history lookups and rolling averages use data structures sized for O(customers × window size), not full-history scans on every render
- Memoize/cache evaluated alerts per customer keyed on the latest snapshot id, invalidated only when new data arrives

## Integration Architecture

### Component Interaction
```
CustomerSelector (selection)
        │
        ▼
  selected Customer ──────────────┐
        │                         │
        ▼                         ▼
healthCalculator.ts        alertStore.ts (history, cooldowns, audit trail)
 calculateHealthScore()          │
        │                        │
        ▼                        ▼
CustomerHealthSnapshot ──────► alerts.ts
 (score, breakdown,          evaluateAlerts(customer, history)
  raw inputs, timestamp)          │
        │                         ▼
        │                 Alert[] (prioritized, deduped)
        ▼                         │
CustomerHealthDisplay      PredictiveAlertsPanel
   (score widget)             (alerts widget)
```

### Data Flow
1. `CustomerSelector` selection change (or a periodic/manual refresh) provides the current `Customer` + latest factor inputs.
2. `calculateHealthScore` (pure, from the Health Score Calculator feature) runs and produces a `CustomerHealthSnapshot`.
3. The snapshot is appended to that customer's history in `alertStore.ts` (non-pure, owns state/persistence).
4. `evaluateAlerts` (pure, in `alerts.ts`) is called with the current data and the retrieved history; it returns the current set of triggered `Alert`s, already deduplicated against active cooldowns.
5. `alertStore.ts` persists newly triggered alerts to the audit trail and applies cooldown windows for those rules.
6. `CustomerHealthDisplay` renders the snapshot; `PredictiveAlertsPanel` renders the returned alerts — both keyed off the same selected customer, updating together on selection change.

### Key Integration Points
- **Health score → alerts**: `alerts.ts` never recomputes scoring; it only consumes `calculateHealthScore`'s output plus raw inputs, keeping the health-scoring business logic single-sourced.
- **History boundary**: all stateful concerns (snapshot storage, cooldowns, audit trail) are isolated in `alertStore.ts` so `alerts.ts` remains pure and independently testable, matching the constraint already established for `healthCalculator.ts`.
- **Shared selection context**: both widgets subscribe to the same selected-customer state from `CustomerSelector`, avoiding duplicate selection logic.

### Dependencies on Previously Created Specs
- Depends on [health-score-calculator-spec.md](./health-score-calculator-spec.md) for `calculateHealthScore`, its factor-input types, and the `Customer` data shape it consumes.
- Depends on [customer-selector-spec.md](./customer-selector-spec.md) for the selected-customer context both widgets render against.

## Acceptance Criteria

- [ ] `evaluateAlerts` returns a prioritized, deduplicated list of currently-active alerts for a given customer and history
- [ ] All five alert rules (Payment Risk, Engagement Cliff, Contract Expiration Risk, Support Ticket Spike, Feature Adoption Stall) are implemented as independent, pure, unit-testable functions
- [ ] High Priority and Medium Priority thresholds exactly match spec (30-day overdue / 20-point 7-day drop, 50% login drop, <90 days + <50 score, >3 tickets in 7 days or escalation, 30-day no-adoption for growing accounts)
- [ ] Alert prioritization ranks by customer value and recency within a tier
- [ ] Cooldown logic prevents duplicate alerts for the same customer/rule within the cooldown window
- [ ] Snapshot history is recorded on each health score calculation and retained for at least 30 days
- [ ] Invalid or missing required input throws a typed validation error with a descriptive message
- [ ] `alerts.ts` functions are pure with no side effects; all stateful logic lives outside it
- [ ] Unit tests cover each rule's boundary conditions, deduplication/cooldown behavior, and invalid-input handling
- [ ] `PredictiveAlertsPanel` renders alerts with correct priority color coding, recommended actions, and timestamps
- [ ] `PredictiveAlertsPanel` and `CustomerHealthDisplay` update together when `CustomerSelector`'s selection changes
- [ ] Dismissing an alert records the action in the audit trail and removes it from the active view
- [ ] No sensitive customer data is exposed in alert messages or client-side logs
- [ ] All interfaces and functions pass TypeScript strict mode checks
- [ ] No console errors or warnings during normal operation
