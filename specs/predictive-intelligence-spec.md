# Feature: Predictive Intelligence (Alerts + Market Sentiment Integration)

## Context
- Integration feature for the Customer Intelligence Dashboard that connects the **Predictive Alerts** rules engine (`src/lib/alerts.ts`, see [customer-health-monitoring-spec.md](./customer-health-monitoring-spec.md)) with the **Market Intelligence** service (`src/services/MarketIntelligenceService.ts`, see [market-intelligence-spec.md](./market-intelligence-spec.md))
- Goal: correlate external market/news sentiment about a customer's company with internal health, engagement, payment, and support signals so early warnings account for outside-in risk (bad press, negative sentiment) as well as inside-out risk
- Used by business analysts / customer success managers who already monitor `PredictiveAlertsPanel` for internal risk and `MarketIntelligenceWidget` for external sentiment as separate views; this feature unifies them into one "Predictive Intelligence" section and adds a new alert rule driven by sentiment
- Builds on: `Alert`, `AlertPriority`, `CustomerHealthSnapshot`, and `evaluateAlerts` from the Predictive Alerts engine; `MarketIntelligenceService.getMarketIntelligence`, `MarketIntelligenceResponse`, and its sentiment shape (`{ score, label, confidence }`) from the Market Intelligence widget
- New in this feature: sentiment becomes a monitored **input** to the alert engine (not just a standalone display), sentiment history is tracked over time to detect sustained negative trends (vs. one-off dips), and alert detail panels can surface supporting headlines as evidence

## Requirements

### Market Sentiment as an Alert Signal
- New **Medium Priority** alert type: **Negative Market Sentiment Alert** — triggers when the customer's company has `sentiment.label === 'negative'` with `confidence` above a threshold (e.g. >0.6), sustained across at least two consecutive market intelligence fetches (avoids reacting to a single noisy headline)
- **Escalation rule**: if a Negative Market Sentiment Alert is active *and* the customer's current health score is <50 (existing internal risk), the combined alert is promoted to **High Priority** — external and internal risk compounding is treated as materially more urgent than either alone
- `checkMarketSentimentRisk(customer, marketData, priorMarketData?)` is added to `src/lib/alerts.ts` as a pure function alongside the existing five rule functions, and is included in `evaluateAlerts`'s rule fan-out
- Market data is fetched via `MarketIntelligenceService` (already cached, 10-minute TTL) and passed into `evaluateAlerts` as an additional optional input; `evaluateAlerts` itself performs no fetching — sentiment retrieval is orchestrated at the same non-pure boundary that already owns snapshot history (`alertStore.ts`)

### Data Monitoring
- Extends the existing data monitoring system with sentiment trend tracking: `alertStore.ts` retains the last N sentiment readings per company (mirroring how it retains health snapshots) to distinguish a sustained negative trend from a single dip
- Sentiment-driven re-evaluation cadence is bounded by `MarketIntelligenceService`'s existing 10-minute cache TTL — this feature does not poll market intelligence more frequently than that cache already refreshes

### Alert Generation and Management
- Deduplication and cooldown behavior for the new rule follows the same mechanism as existing rules (Medium Priority cooldown window, e.g. 72h), keyed on customer + rule
- `Alert` records produced by `checkMarketSentimentRisk` include an optional `supportingHeadlines` field (up to 3 headlines from the triggering `MarketIntelligenceResponse`) so the alert can show *why* — without embedding full raw market data or unrelated customer PII

### User Interface Components
- Combine `PredictiveAlertsPanel` and `MarketIntelligenceWidget` under one **Predictive Intelligence** dashboard section for the currently selected customer, driven by the same `CustomerSelector` selection
- Alert detail panels for a Negative Market Sentiment Alert (or an escalated combined alert) render the top relevant headline(s) inline as supporting evidence, using the same plain-text/no-`dangerouslySetInnerHTML` rendering rules as `MarketIntelligenceWidget`
- Priority color coding stays consistent across both widgets (red = High, yellow = Medium)
- Loading and error states are independent per sub-widget: a Market Intelligence fetch failure must not block or blank out the core (internally-sourced) alerts, and vice versa — the panel degrades gracefully to "sentiment data unavailable" rather than failing the whole section

### Integration Requirements
- `alertStore.ts` (the existing non-pure layer that owns snapshot history, cooldowns, and audit trail) takes on responsibility for calling `MarketIntelligenceService.getMarketIntelligence(customer.company)`, storing sentiment history, and passing current + prior sentiment into `evaluateAlerts`
- Reuses `MarketIntelligenceResponse`'s sentiment shape verbatim — no duplicate sentiment scoring/labeling logic is introduced in `alerts.ts`
- Both widgets read `Customer.company` from the same selected-customer context established by `CustomerSelector`; no separate/duplicate company input state between the two widgets when embedded together

## Constraints

### Technical Stack
- Next.js 15 (App Router), React 19
- TypeScript with strict mode for all interfaces and functions
- Tailwind CSS for styling, consistent with existing components

### Architecture
- `checkMarketSentimentRisk` remains pure: it operates only on already-fetched `MarketIntelligenceResponse` data (current and, optionally, prior) plus the customer's health snapshot — no I/O, no direct calls to `MarketIntelligenceService`
- `alertStore.ts` gains the responsibility of orchestrating the `MarketIntelligenceService` call alongside its existing snapshot/cooldown/audit responsibilities; this keeps `alerts.ts` free of network and service-layer dependencies
- `Alert` interface (from the Predictive Alerts spec) gains an optional `supportingHeadlines?: { title: string; source: string; publishedAt: string }[]` field, reusing `MarketIntelligenceResponse['headlines']`'s shape rather than defining a new one
- No new error class is introduced for this feature; sentiment-fetch failures are handled as "rule does not trigger this cycle," while genuine input-validation failures continue to use the existing `AlertValidationError`

### Security
- Headlines surfaced in alert detail panels are rendered as plain text (JSX escaping only), matching `MarketIntelligenceWidget`'s XSS-prevention approach
- No raw/full market intelligence payloads or unrelated customer PII are embedded in alert messages — only the minimal supporting headlines needed to justify the alert
- `MarketIntelligenceService` failures (timeout, error) degrade gracefully — the sentiment rule simply does not trigger (or falls back to the last cached reading within TTL) rather than throwing and blocking evaluation of the other four alert rules
- Existing audit trail captures Negative Market Sentiment / escalated alerts the same way as all other alert types

### Performance
- Sentiment-based rule evaluation reuses `MarketIntelligenceService`'s existing 10-minute cache; this feature adds no redundant fetches beyond what that service already performs
- Sentiment history storage is bounded (last N readings per company, not unbounded growth), consistent with the rolling-window approach already used for health snapshots

## Integration Architecture

### Component Interaction
```
CustomerSelector (selection)
        │
        ▼
  selected Customer (company) ─────────────┐
        │                                  │
        ▼                                  ▼
healthCalculator.ts               MarketIntelligenceService
 calculateHealthScore()            getMarketIntelligence(company)
        │                                  │
        ▼                                  ▼
CustomerHealthSnapshot ──────►     alertStore.ts
        │                    (snapshot history, sentiment history,
        │                     cooldowns, audit trail)
        │                                  │
        └──────────────┬───────────────────┘
                        ▼
                    alerts.ts
         evaluateAlerts(customer, history, marketData)
                        │
                        ▼
              Alert[] (prioritized, deduped,
           some with supportingHeadlines)
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
CustomerHealthDisplay          Predictive Intelligence panel
                         (PredictiveAlertsPanel + MarketIntelligenceWidget)
```

### Data Flow
1. `CustomerSelector` selection (or periodic refresh) provides the current `Customer`.
2. `calculateHealthScore` produces a `CustomerHealthSnapshot`, as in the base Predictive Alerts feature.
3. `alertStore.ts` calls `MarketIntelligenceService.getMarketIntelligence(customer.company)` (served from cache when within its 10-minute TTL) and appends the reading to that company's sentiment history.
4. `alertStore.ts` passes the current snapshot, snapshot history, current market data, and prior market data into `evaluateAlerts`.
5. `evaluateAlerts` runs all six rules (five original + `checkMarketSentimentRisk`), applying the escalation rule when both a negative-sentiment condition and health score <50 are present, and returns deduplicated, cooldown-respecting alerts, some annotated with `supportingHeadlines`.
6. `alertStore.ts` persists newly triggered alerts to the audit trail and applies cooldowns.
7. The Predictive Intelligence panel renders `PredictiveAlertsPanel` (now including sentiment-driven alerts with inline headlines) alongside `MarketIntelligenceWidget`, both keyed off the same selected customer.

### Key Integration Points
- **Sentiment → alerts, one-way**: `alerts.ts` only consumes `MarketIntelligenceService`'s output shape; it never recomputes sentiment scoring, keeping that logic single-sourced in the Market Intelligence feature.
- **History boundary preserved**: sentiment history joins snapshot history, cooldowns, and audit trail as stateful concerns owned by `alertStore.ts`, keeping `alerts.ts` pure and independently testable.
- **Independent failure domains**: a `MarketIntelligenceService` outage affects only sentiment-driven alerts and the market intelligence sub-widget — internal-signal alerts and the rest of the dashboard continue to function.

### Dependencies on Previously Created Specs
- Depends on [customer-health-monitoring-spec.md](./customer-health-monitoring-spec.md) for `evaluateAlerts`, `alerts.ts`, `alertStore.ts`, `Alert`/`AlertPriority`/`CustomerHealthSnapshot` types, and the four original alert rules.
- Depends on [market-intelligence-spec.md](./market-intelligence-spec.md) for `MarketIntelligenceService`, `MarketIntelligenceResponse`, and the sentiment/headline shapes.
- Depends on [health-score-calculator-spec.md](./health-score-calculator-spec.md) transitively via `calculateHealthScore`'s output used in the escalation rule.
- Depends on [customer-selector-spec.md](./customer-selector-spec.md) for the shared selected-customer context.

## Acceptance Criteria

- [ ] `checkMarketSentimentRisk` is implemented as an independent, pure, unit-testable function in `src/lib/alerts.ts`
- [ ] Negative Market Sentiment Alert triggers only when sentiment is negative with confidence above threshold across two consecutive readings, not on a single reading
- [ ] Escalation rule promotes the alert to High Priority when combined with health score <50, and this is covered by a unit test
- [ ] `evaluateAlerts` accepts market data (current + prior) as an additional optional input without requiring changes to its existing five-rule behavior when market data is absent
- [ ] Alerts produced by the sentiment rule include up to 3 `supportingHeadlines`, sourced from the triggering `MarketIntelligenceResponse`, with no extraneous data attached
- [ ] Deduplication and cooldown behavior for the new rule matches the existing Medium Priority cooldown mechanism
- [ ] `alertStore.ts` orchestrates the `MarketIntelligenceService` call and sentiment history storage; `alerts.ts` performs no I/O
- [ ] A `MarketIntelligenceService` failure does not throw out of `evaluateAlerts` or block the other four/five internal alert rules from evaluating
- [ ] Predictive Intelligence panel renders `PredictiveAlertsPanel` and `MarketIntelligenceWidget` together, both driven by the same selected customer
- [ ] Alert detail view shows supporting headlines as plain text (no `dangerouslySetInnerHTML`) for sentiment-driven alerts
- [ ] Loading/error state in one sub-widget does not blank or break the other sub-widget
- [ ] No sensitive customer data or unrelated raw market payloads appear in alert messages or client-side logs
- [ ] All interfaces and functions pass TypeScript strict mode checks
- [ ] No console errors or warnings during normal operation
