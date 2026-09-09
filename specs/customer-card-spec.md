# Feature: CustomerCard Component

## Context
- Individual customer display component for the Customer Intelligence Dashboard
- Part of a grid layout showing multiple customers with their health scores
- Displays customer health scores and alerts for business analysts
- Used by business analysts to monitor customer status
- Foundation component for domain health monitoring

## Requirements

### Functional Requirements
- Display customer name, company name, and health score (0-100)
- Show customer domains (websites) for health monitoring context
- Visual health indicator with color coding based on score
- Clickable card to view detailed customer profile
- Clean, card-based responsive design

### User Interface Requirements
- Color-coded health indicators:
  - Red: 0-30 (critical)
  - Yellow: 31-70 (warning)
  - Green: 71-100 (healthy)
- Responsive design for mobile and desktop
- Clear typography hierarchy (name > company > details)
- Visual hover state to indicate clickability

### Data Requirements
- Accepts customer object via props
- Customer interface: name, email, company, health score, domains array
- Uses mock data structure from `data/mock-customers.ts`

### Integration Requirements
- Used within CustomerSelector container component
- Props-based data flow from parent component
- Properly typed TypeScript interfaces

## Constraints

### Technical Stack
- Next.js 15 (App Router)
- React 19
- TypeScript with strict mode
- Tailwind CSS for styling

### Performance Requirements
- Fast rendering (< 16ms per card for 60fps)
- Efficient re-renders (React.memo if needed)
- No layout shift during load

### Design Constraints
- Responsive breakpoints: mobile (320px+), tablet (768px+), desktop (1024px+)
- Maximum card width: 400px
- Minimum card height: 120px
- Consistent spacing using Tailwind spacing scale

### File Structure and Naming
- Component file: `components/CustomerCard.tsx`
- Props interface: `CustomerCardProps` exported from component file
- Follow project naming conventions (PascalCase for components)

### Security Considerations
- Sanitize customer name and company displays (XSS prevention)
- No sensitive customer data exposed in client-side logs
- Proper TypeScript types to prevent data injection

## Acceptance Criteria

- [ ] Displays customer name, email, company, and health score correctly
- [ ] Shows customer domains with proper count
- [ ] Health score colors match specification: red (0-30), yellow (31-70), green (71-100)
- [ ] Responsive design works on mobile (320px+), tablet (768px+), and desktop (1024px+)
- [ ] Proper TypeScript interfaces defined and exported
- [ ] Card is clickable with visible hover state
- [ ] Component accepts typed props from parent
- [ ] No console errors or warnings
- [ ] Passes TypeScript strict mode checks
- [ ] Follows project code style and conventions
