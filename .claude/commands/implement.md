---
description: Implement a component from a spec file, iterating until acceptance criteria pass
argument-hint: [spec-file-path]
---

Implement the component described by the spec at `$1` (e.g. `@specs/customer-card-spec.md`).

Steps:
1. Read the spec file at `$1` in full. If it doesn't exist, say so and stop.
   - Extract the component name from the `# Feature: <Name> Component` heading.
   - Extract the target file path from the spec's `### File Structure and Naming` section (or equivalent). If the spec doesn't specify one, default to `src/components/<ComponentName>.tsx`, matching this project's existing convention (check `src/components/` for siblings first).
   - Extract the full `## Acceptance Criteria` checklist — this is the definition of done.
2. Look at 1-2 existing components in the same directory (e.g. `src/components/CustomerCard.tsx`) to match this project's code style, TypeScript conventions, and Tailwind usage patterns. Also check any files referenced by the spec (e.g. other components it should integrate with or refactor).
3. Generate the component at the target path per the spec's Requirements, Constraints, and Integration Requirements. If the spec requires refactoring another file (e.g. an existing component to consume the new one), make that edit too.
4. Verify the implementation against every item in the Acceptance Criteria checklist, one by one:
   - Run relevant checks where possible: TypeScript compilation (`npx tsc --noEmit` or the project's existing typecheck script), lint, and any existing test suite.
   - For criteria that aren't mechanically checkable (e.g. "no visual regression", "follows project code style"), reason through the code directly against the spec text.
   - Report each criterion as met or not met, with a one-line reason.
5. If any criterion is not met, fix the implementation and re-verify. Repeat step 4-5 until all criteria pass or you hit a genuine blocker (e.g. missing dependency, ambiguous requirement) — if blocked, stop and ask rather than guessing.
6. Report back concisely: component path written, files modified, and the final acceptance criteria checklist with pass/fail status for each item.
