# Feature: DashboardOrchestrator Component

## Context
- Top-level container that assembles the Customer Intelligence Dashboard from previously built widgets (CustomerSelector, CustomerCard, Domain Health, Market Intelligence, Predictive Alerts) into a single production-ready application shell
- Owns cross-cutting concerns that individual widgets should not each reimplement: error isolation, performance, accessibility, and export
- Used by business analysts as the entry point to the dashboard; must keep working (in degraded form) even when one or more widgets or backing services fail
- Transforms the dashboard from a prototype composition of components into an enterprise-grade application shell

## Requirements

### Functional Requirements
- Render the dashboard layout and mount all registered widgets (CustomerSelector, Domain Health, Market Intelligence, Predictive Alerts) as independent, isolated regions
- Provide a two-level error boundary system:
  - `DashboardErrorBoundary` wraps the entire orchestrator; catches errors that escape widget boundaries and renders a full-dashboard fallback with a retry action
  - `WidgetErrorBoundary` wraps each individual widget; catches widget-level failures without unmounting sibling widgets, rendering a per-widget fallback with retry
- Support graceful degradation: if a widget fails or its data source times out, the rest of the dashboard remains fully interactive
- Provide a global data export entry point that delegates to widget-specific export handlers (CSV/JSON) for customer data, health score reports, alert history, and market intelligence summaries, with shared date-range and customer-segment filter controls
- Surface a global loading state (Suspense-based) while widgets code-split and lazily load, distinct from per-widget loading states
- Expose a retry mechanism with a bounded retry count per error boundary; after the limit is reached, show a persistent fallback with a "reload dashboard" action

### User Interface Requirements
- Fallback UI for a failed widget must preserve layout space (no collapsing grid) and clearly identify which widget failed
- Fallback UI for a full dashboard crash must offer a retry button and a link/action to reload
- Loading skeletons for lazily-loaded widgets that match final widget dimensions to avoid layout shift
- Export controls (format, date range, filters) presented in a single accessible toolbar, not duplicated per widget
- Live region announcement when a widget transitions to an error or recovered state (for screen reader users)

### Data Requirements
- Consumes the same customer/domain/health-score/alert/market-intelligence data sources already used by individual widgets; the orchestrator does not introduce new data shapes, only coordinates fetching/error state at the composition level
- Tracks per-widget status (`loading | ready | error`) and last-error metadata (message, timestamp, retry count) for error reporting and the audit/export log
- Export requests carry: format (`csv | json`), date range, customer segment filter, and requesting widget/source, all validated before being handed to `ExportUtils`

### Integration Requirements
- Wraps existing widgets without requiring changes to their public props/interfaces; boundaries are applied at the composition layer (`WidgetErrorBoundary` as a wrapper, not a widget-internal change)
- Delegates format-specific export logic to an `ExportUtils` module rather than implementing export logic itself
- Emits error and performance events to a monitoring/logging integration point (console/log sink in development, pluggable reporter in production) without leaking sensitive customer data into logs
- Consistent error-handling and loading patterns applied uniformly across all mounted widgets

## Constraints

### Technical Stack
- Next.js 15 (App Router)
- React 19 (Suspense, error boundaries via class components since React has no hook-based error boundary)
- TypeScript with strict mode
- Tailwind CSS for styling

### Performance Requirements
- Widgets are code-split via `React.lazy`/dynamic import and mounted inside `Suspense` boundaries so a slow widget does not block others from rendering
- Orchestrator-level re-renders must not cascade into unaffected widgets: use `React.memo`, `useMemo`, and `useCallback` for widget props and callbacks passed down
- Initial dashboard shell (layout + loading skeletons) must be interactive within the Time to Interactive budget defined in requirements (TTI < 3.5s); individual widget data may still be loading
- No widget error or retry loop may cause unbounded re-renders or memory growth (verify via retry-limit enforcement)

### Design Constraints
- Responsive grid layout consistent with existing widget breakpoints (mobile 320px+, tablet 768px+, desktop 1024px+)
- Fallback and skeleton components reserve the same width/height as their corresponding widget to satisfy CLS < 0.1
- Error and export UI follow WCAG 2.1 AA: proper landmarks/headings, keyboard-operable retry/export controls, visible focus indicators, ARIA live regions for status changes

### File Structure and Naming
- Container component: `components/DashboardOrchestrator.tsx`
- Error boundaries: `components/errors/DashboardErrorBoundary.tsx`, `components/errors/WidgetErrorBoundary.tsx`
- Shared error types: `lib/errors.ts` (custom error classes with category/context)
- Export coordination: `lib/export/ExportUtils.ts` (format handlers), invoked by the orchestrator's export toolbar
- Props interface: `DashboardOrchestratorProps` exported from the component file
- Follow project naming conventions (PascalCase for components, camelCase for utilities)

### Security Considerations
- Error fallback UI must never render raw error messages, stack traces, or internal identifiers in production mode; show a generic message and log details server-side/to the reporter instead
- All export requests validate and sanitize filter inputs (date range, segment) before dispatch; reject malformed input rather than passing it through to `ExportUtils`
- No customer PII written to client-side console logs, even in error paths
- Export and retry actions are rate-limited client-side to prevent runaway requests to backing services

## Acceptance Criteria

- [ ] `DashboardErrorBoundary` catches an unhandled error from any widget and renders a full-dashboard fallback with a working retry action, without crashing the whole app
- [ ] `WidgetErrorBoundary` isolates a single widget failure: the failing widget shows its own fallback while sibling widgets remain fully rendered and interactive
- [ ] Retry action re-mounts only the failed widget (or the whole dashboard, for the top-level boundary) and respects a bounded retry count before switching to a persistent fallback
- [ ] All widgets are lazily loaded behind `Suspense`, with skeletons matching final widget dimensions (no visible layout shift)
- [ ] Export toolbar produces CSV and JSON exports for customer data, health score reports, and alert/audit history, filtered by date range and customer segment
- [ ] Export requests with invalid filters are rejected client-side with a user-facing message; no request reaches `ExportUtils` with unvalidated input
- [ ] Production build never displays raw error messages/stack traces in fallback UI; development mode may show verbose diagnostics
- [ ] Screen reader users receive a live-region announcement when a widget errors or recovers
- [ ] Keyboard users can reach and operate every retry and export control via Tab order alone, with visible focus indicators
- [ ] Passes TypeScript strict mode checks with no new widget prop/interface changes required
- [ ] No console errors/warnings in normal operation; no customer PII present in any logged error output
