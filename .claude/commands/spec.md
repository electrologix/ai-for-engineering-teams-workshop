---
description: Generate a component spec from its requirements doc
argument-hint: [component-name]
---

Generate a structured specification for the component named `$1` (e.g. "CustomerCard").

Steps:
1. Look for a requirements file at `requirements/$1.md` (match case-insensitively / with kebab-case if the exact PascalCase filename isn't found, e.g. `CustomerCard` -> `customer-card.md`). Read it fully.
   - If no requirements file exists, say so explicitly, then proceed using only the component name and any relevant context you can find in the codebase (existing components, similar specs in `specs/`, mock data shapes in `data/` or `src/data/`) — do not invent requirements that aren't grounded in something you found.
2. Look at 1-2 existing files in `specs/` (e.g. `specs/customer-card-spec.md`) to match this project's spec structure, tone, and level of detail. Do not copy their content — only mirror the format.
3. Produce a spec as markdown with exactly these top-level sections, in this order:
   - `# Feature: $1 Component`
   - `## Context` — why this component exists, who uses it, where it fits in the app
   - `## Requirements` — break into `### Functional Requirements`, `### User Interface Requirements` (if applicable), `### Data Requirements`, `### Integration Requirements` as relevant to the component
   - `## Constraints` — technical stack, performance, design/file-structure/naming conventions, security considerations, matching what's actually used in this repo (check `package.json` / existing components rather than assuming)
   - `## Acceptance Criteria` — a checklist (`- [ ]`) of concrete, testable criteria derived from the requirements above
4. Save the result to `specs/$1-spec.md` (kebab-case the filename, e.g. `CustomerCard` -> `specs/customer-card-spec.md`), overwriting only after confirming with the user if the file already exists and has different content.
5. Report back concisely: which requirements file was used (or that none was found), and the path of the spec written.
