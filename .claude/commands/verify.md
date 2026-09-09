---
description: Verify a component's types, rendering with mock data, and responsive behavior
argument-hint: [component-file-path]
---

Verify the component at `$1` (e.g. `src/components/CustomerCard.tsx`). Run all checks below, don't stop at the first failure — collect every issue, then report a single pass/fail summary at the end.

Steps:

1. **Resolve the target.** If `$1` doesn't exist, try resolving it relative to `src/components/` (e.g. `CustomerCard.tsx` -> `src/components/CustomerCard.tsx`). If still not found, say so and stop.

2. **Type check.**
   - Run the project's typecheck script (`npm run type-check`, i.e. `tsc --noEmit`).
   - Filter the output for errors referencing the target file (and any file it exports types to/from). Report exact error messages and line numbers.
   - Also run `npx eslint <target file>` and report any errors/warnings scoped to this file.

3. **Render with mock data.**
   - Read `src/data/mock-customers.ts` (or wherever the project's mock data lives — check `@/data/mock-customers` import alias) to find realistic prop values, including edge cases already present in the mock data (e.g. missing optional fields, boundary health scores).
   - Read the component's props interface to determine what data shape it needs. If it takes a full domain object (e.g. `Customer`), pull actual entries from the mock data; if it takes primitive props (e.g. `healthScore: number`), derive representative values (typical, boundary, and invalid/out-of-range) from the mock data's observed range.
   - Write a small throwaway script (e.g. in `/tmp`) that imports the component and calls `react-dom/server`'s `renderToStaticMarkup` for each case (normal entry, an edge-case entry, and any boundary values from its own logic like health score 0/30/31/70/71/100/out-of-range). Run it with `npx tsx` (or `ts-node` if that's what's available — check `devDependencies` first, and install `tsx` as a transient dev dependency only if neither is present and the user hasn't objected).
   - Report which cases rendered successfully and which threw, with the error message.
   - Delete the throwaway script when done.

4. **Responsive behavior.**
   - Statically inspect the component's className strings for Tailwind responsive modifiers (`sm:`, `md:`, `lg:`, `xl:`, `2xl:`) and layout primitives (flex/grid) that would reflow at different widths, and note what breakpoints (if any) the component itself defines versus inherits from its parent.
   - If a live check is possible (the project's dev server can be started and the component is reachable from a page), use the `run` skill to launch the app and view it at common breakpoints (375px mobile, 768px tablet, 1280px desktop) via browser resize, checking for layout breaks, overflow, or truncation issues. If the component isn't mounted on any reachable page, skip the live check and say so explicitly rather than guessing.
   - Report findings per breakpoint if live-checked; otherwise report the static analysis and flag that visual verification is unconfirmed.

5. **Summary.** Output a concise pass/fail table:
   - Type check: PASS/FAIL (+ issues)
   - Lint: PASS/FAIL (+ issues)
   - Renders with mock data: PASS/FAIL (+ which cases failed and why)
   - Responsive design: PASS/FAIL/UNCONFIRMED (+ issues or what wasn't checked)
   - Overall: PASS only if every category is PASS; otherwise FAIL, listing the specific blocking issues.
