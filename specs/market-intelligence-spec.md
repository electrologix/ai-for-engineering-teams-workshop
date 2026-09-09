# Feature: Market Intelligence Widget

## Context
- Widget for the Customer Intelligence Dashboard that surfaces market sentiment and news for a customer's company
- Used by business analysts alongside the CustomerCard and Domain Health widgets to assess overall customer/account risk
- Demonstrates spec-driven, multi-layer component composition (API route → service → UI → dashboard) with consistent patterns across widgets
- Uses mock data only (no external API calls) so the demo is reliable and reproducible; mock generation already exists at `src/data/mock-market-intelligence.ts` (`generateMockMarketData`, `calculateMockSentiment`, `sentimentKeywords`)

## Requirements

### Functional Requirements
- API route `GET /api/market-intelligence/[company]` returns market intelligence for the given company
- Response JSON shape:
  ```ts
  {
    company: string;
    sentiment: { score: number; label: 'positive' | 'neutral' | 'negative'; confidence: number };
    articleCount: number;
    headlines: { title: string; source: string; publishedAt: string; url?: string }[]; // top 3
    lastUpdated: string; // ISO timestamp
  }
  ```
- Route builds on `generateMockMarketData(company)` and `calculateMockSentiment(headlines)` from `src/data/mock-market-intelligence.ts`
- Simulates realistic network latency (e.g. random 300–900ms delay) before responding
- `MarketIntelligenceService` (service layer) wraps mock data generation with:
  - In-memory cache keyed by normalized company name, 10-minute TTL
  - `MarketIntelligenceError` custom error class for centralized error handling
  - Pure functions (no hidden state beyond the cache) so behavior is deterministic and testable
- `MarketIntelligenceWidget` component:
  - Text input for company name with client-side validation (non-empty, reasonable length)
  - Submit triggers fetch to the API route
  - Displays sentiment with color-coded indicator (green = positive, yellow = neutral, red = negative)
  - Displays article count and "last updated" timestamp
  - Displays top 3 headlines with source and publication date
  - Loading state while fetching, error state on failure
- Dashboard integration:
  - Rendered in the main `Dashboard`/`page.tsx` alongside `CustomerCard` and other widgets
  - Receives `company` from the currently selected customer (`Customer.company`) as a prop rather than the widget's own input when embedded in the dashboard grid
  - Falls back to its own input field when no customer is selected (standalone use)

### User Interface Requirements
- Sentiment color coding (same system as customer health scores):
  - Green: positive sentiment
  - Yellow: neutral sentiment
  - Red: negative sentiment
- Loading and error states styled consistently with other dashboard widgets (e.g. `DashboardWidgetDemo` placeholder pattern in `src/app/page.tsx`)
- Responsive card layout matching `CustomerCard` sizing/spacing conventions
- Clear typography hierarchy: company name > sentiment indicator > article count/timestamp > headlines list

### Data Requirements
- Reuses `MockHeadline` and `MockMarketData` interfaces from `src/data/mock-market-intelligence.ts`
- Widget props interface `MarketIntelligenceWidgetProps`: `{ company?: string }`
- Service layer exposes `MarketIntelligenceService.getMarketIntelligence(company: string): Promise<MarketIntelligenceResponse>`

### Integration Requirements
- Company name flows from `Customer.company` (see `src/data/mock-customers.ts`) when a customer is selected on the dashboard
- API route follows the same file/folder conventions as other Next.js API routes in `src/app/api/`
- Widget composed into the dashboard grid using the same props-down, state-in-parent pattern as `CustomerCard`

## Constraints

### Technical Stack
- Next.js 15 App Router with Route Handlers (`src/app/api/market-intelligence/[company]/route.ts`)
- TypeScript with strict typing for all interfaces (no `any`)
- React 19 hooks (`useState`, `useEffect`) for widget data fetching and state
- Tailwind CSS for styling, matching existing widget color/spacing conventions

### Performance Requirements
- Simulated API delay capped at ~900ms so the workshop demo stays responsive
- Cached responses (within TTL) return without re-invoking mock data generation
- No unnecessary re-renders; fetch only on company change or explicit submit

### Design Constraints
- Match `CustomerCard`'s card styling: rounded corners, shadow, consistent padding
- Responsive breakpoints: mobile (320px+), tablet (768px+), desktop (1024px+)
- Fits within the existing dashboard grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`)

### File Structure and Naming
- API route: `src/app/api/market-intelligence/[company]/route.ts`
- Service: `src/services/MarketIntelligenceService.ts` (exports `MarketIntelligenceService`, `MarketIntelligenceError`)
- Component: `src/components/MarketIntelligenceWidget.tsx`
- Props interface: `MarketIntelligenceWidgetProps` exported from the component file
- Reuses existing mock data module: `src/data/mock-market-intelligence.ts`

### Security Considerations
- Validate and sanitize the `company` route/query parameter before use (reject empty, overly long, or non-printable input; no path traversal or injection via the dynamic segment)
- Sanitize company name before interpolating into generated headline strings
- Error responses contain generic messages only — no internal error details, stack traces, or cache internals leaked to the client
- All external-facing text (company name, headlines) rendered as plain text in React (no `dangerouslySetInnerHTML`), relying on JSX escaping for XSS prevention
- No real external API calls, so there is no external attack surface or API-key handling to secure

## Acceptance Criteria

- [ ] `GET /api/market-intelligence/[company]` returns the documented JSON shape with sentiment, article count, headlines, and timestamp
- [ ] Invalid/empty/overlong company parameter returns a 400 with a sanitized error message
- [ ] Route responds after a simulated delay (~300–900ms) to mimic a real API call
- [ ] `MarketIntelligenceService` caches results per company for 10 minutes and serves cached data without regenerating it within that window
- [ ] Service throws `MarketIntelligenceError` on invalid input, and the API route maps it to an appropriate HTTP status without leaking internals
- [ ] `MarketIntelligenceWidget` renders an input field, validates input, and fetches on submit
- [ ] Widget shows loading state while fetching and an error state on failure
- [ ] Sentiment indicator color matches label: green (positive), yellow (neutral), red (negative)
- [ ] Widget displays article count, last-updated timestamp, and up to 3 headlines with source + date
- [ ] Widget accepts an optional `company` prop and auto-fetches when it changes (dashboard-driven usage)
- [ ] Widget falls back to manual input when no `company` prop is provided (standalone usage)
- [ ] Integrated into the dashboard grid alongside other widgets with consistent spacing/layout
- [ ] All interfaces strictly typed; no TypeScript errors in strict mode
- [ ] No console errors or warnings during normal operation
- [ ] Follows existing project code style and file/naming conventions
