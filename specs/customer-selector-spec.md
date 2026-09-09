# Feature: CustomerSelector Component

## Context
- Main customer selection interface for the Customer Intelligence Dashboard
- Container component that renders a searchable, filterable grid of `CustomerCard` components
- Users need to quickly find and select a customer from a potentially large list
- Must remain efficient and responsive with 100+ customers
- Selected customer drives the rest of the dashboard (e.g. domain health widgets)

## Requirements

### Functional Requirements
- Display customer cards with name, company, and health score
- Search/filter customers by name or company (case-insensitive, partial match)
- Visual selection state that highlights the currently selected customer
- Persist the selected customer across page interactions (e.g. filtering, re-renders, navigation within the session)
- Empty state when no customers match the search/filter

### User Interface Requirements
- Search input above the customer grid, filtering the list as the user types
- Selected customer card visually distinct (e.g. border/background highlight) from unselected cards
- Grid layout that reflows responsively across screen sizes
- Loading and empty states clearly communicated to the user

### Data Requirements
- Consumes the `Customer[]` list from `data/mock-customers.ts`
- Filtering operates on `name` and `company` fields
- Selection state tracks a single `Customer.id` (or `null` when nothing is selected)

### Integration Requirements
- Renders one `CustomerCard` per filtered customer, passing customer data and selection state via props
- Exposes the selected customer (or its id) to parent/page components, e.g. via callback prop (`onSelectCustomer`) or lifted state
- Properly typed TypeScript interfaces shared with `CustomerCard`

## Constraints

### Technical Stack
- Next.js 15 (App Router)
- React 19
- TypeScript with strict mode
- Tailwind CSS for styling

### Performance Requirements
- Efficient handling of 100+ customers without noticeable input lag while typing in search
- Avoid unnecessary re-renders of unaffected `CustomerCard` instances (e.g. memoization keyed on selection/customer identity)
- Debounce or otherwise minimize redundant filtering work on rapid keystrokes if needed

### Design Constraints
- Responsive breakpoints: mobile (320px+), tablet (768px+), desktop (1024px+)
- Grid spacing and card sizing consistent with `CustomerCard`'s constraints (max width 400px, min height 120px)
- Consistent spacing using Tailwind spacing scale

### File Structure and Naming
- Component file: `components/CustomerSelector.tsx`
- Props interface: `CustomerSelectorProps` exported from component file
- Follow project naming conventions (PascalCase for components)

### Security Considerations
- Sanitize/escape search input before use (no raw HTML injection)
- No sensitive customer data exposed in client-side logs
- Proper TypeScript types to prevent data injection

## Acceptance Criteria

- [ ] Renders a `CustomerCard` for every customer in the provided list
- [ ] Search input filters customers by name or company, case-insensitively, as the user types
- [ ] Selecting a customer card visually highlights it and deselects any previously selected card
- [ ] Selected customer persists when the search/filter text changes (unless the selected customer is filtered out)
- [ ] Displays an empty state when no customers match the current search
- [ ] Performs smoothly with 100+ customers (no visible input lag or jank)
- [ ] Responsive design works on mobile (320px+), tablet (768px+), and desktop (1024px+)
- [ ] Proper TypeScript interfaces defined and exported
- [ ] No console errors or warnings
- [ ] Passes TypeScript strict mode checks
- [ ] Follows project code style and conventions
