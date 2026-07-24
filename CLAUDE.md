# CLAUDE.md

## 1. Purpose

This file is the entry point for Claude when working in this repository.

Do not treat this file as the complete specification. Read the relevant source documents before planning or changing code.

## 2. Source-of-truth order

When documents conflict, follow this order:

1. `docs/00-PROJECT-CHARTER.md`
2. `docs/01-PRODUCT-REQUIREMENTS.md`
3. `docs/04-BUSINESS-RULES.md`
4. `docs/05-DESIGN-STUDIO-SPEC.md`
5. `docs/06-ORDER-AND-DESIGN-LIFECYCLE.md`
6. `docs/architecture/SYSTEM_ARCHITECTURE.md`
7. `docs/architecture/REPOSITORY_STRUCTURE.md`
8. `docs/development/FRONTEND_CONVENTIONS.md`
9. `docs/development/BACKEND_CONVENTIONS.md`
10. `docs/implementation/README.md` and the canonical implementation standards it indexes (delivery governance, backend API, SCSS, OpenAPI/client, database change, phase/checkpoint model).
11. Relevant ADRs and task-specific documents.

Authority notes:

- Locked product, business, database, and design decisions keep their authority; the implementation set does not reopen them.
- The implementation set is canonical for *how* delivery and implementation happen (checkpoint sizing, review boundaries, SCSS, OpenAPI/client, database-change control).
- Where a conventions document has delegated a topic to a canonical implementation standard (for example, styling → `docs/implementation/05-FRONTEND-AND-SCSS-STANDARD.md`), follow that canonical standard.

Do not silently resolve contradictions. Report them before implementation.

## 3. Required reading by task

### Application implementation (any APP phase or checkpoint)

Read:

- `docs/implementation/README.md`
- `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md`
- The current phase plan in `docs/implementation/phases/`
- The canonical standard(s) for the work type below

Then follow the phase/checkpoint governance in `docs/implementation/01-DELIVERY-GOVERNANCE.md` and `docs/implementation/02-PHASE-AND-CHECKPOINT-MODEL.md`. A phase plan is planning input, not a prompt to implement a whole phase; execute one checkpoint and stop for human review.

### Product or business behavior

Read:

- `docs/01-PRODUCT-REQUIREMENTS.md`
- `docs/03-USER-JOURNEYS.md`
- `docs/04-BUSINESS-RULES.md`
- `docs/06-ORDER-AND-DESIGN-LIFECYCLE.md`

### Design Studio

Read:

- `docs/05-DESIGN-STUDIO-SPEC.md`
- `docs/09-SECURITY-AND-ABUSE-PREVENTION.md`
- `docs/architecture/SYSTEM_ARCHITECTURE.md`
- `docs/development/FRONTEND_CONVENTIONS.md`

### Frontend

Read:

- `docs/architecture/REPOSITORY_STRUCTURE.md`
- `docs/development/FRONTEND_CONVENTIONS.md`
- `docs/implementation/05-FRONTEND-AND-SCSS-STANDARD.md` (canonical for styling/SCSS and frontend checkpoint delivery)
- `docs/implementation/06-OPENAPI-AND-CLIENT-CONTRACT.md` (generated types/Axios client; handwritten TanStack Query hooks)
- `docs/design/FIGMA_DESIGN_INDEX.md` (canonical Figma registry — see below)
- Relevant product requirements

### Figma design registry (every design or frontend UI checkpoint)

`docs/design/FIGMA_DESIGN_INDEX.md` is the canonical registry of every Figma artifact and its approval status. Do not duplicate its schema here; follow it.

Before any **design** checkpoint:

- read `FIGMA_DESIGN_INDEX.md`; audit existing canonical/missing entries;
- create or modify Figma in the approved page/section;
- update the index in the **same** checkpoint with exact node IDs and deep links (new frames enter `REVIEW_REQUIRED`).

Before any **frontend UI** checkpoint:

- read `FIGMA_DESIGN_INDEX.md`; resolve the exact approved screen/state/viewport entry;
- open that exact Figma node and read its design-system references;
- **block** implementation when the entry is missing, stale, superseded, or not `APPROVED_FOR_IMPLEMENTATION`;
- record the registry IDs used in the completion report.

The gate `pnpm check:figma-design-index` (in `pnpm quality`) enforces registry integrity.

### Backend

Read:

- `docs/architecture/SYSTEM_ARCHITECTURE.md`
- `docs/architecture/REPOSITORY_STRUCTURE.md`
- `docs/development/BACKEND_CONVENTIONS.md`
- `docs/implementation/04-BACKEND-API-DELIVERY-STANDARD.md` (canonical for NestJS Swagger/OpenAPI, API checkpoint endpoint limit)
- `docs/implementation/06-OPENAPI-AND-CLIENT-CONTRACT.md`
- `docs/implementation/08-DATABASE-CHANGE-CONTROL.md` when a persistence change is involved (forward-only; dedicated database-change checkpoint)
- Relevant business rules and lifecycle documents

### Infrastructure or deployment

Read:

- `docs/10-NON-FUNCTIONAL-REQUIREMENTS.md`
- `docs/architecture/SYSTEM_ARCHITECTURE.md`
- Relevant ADRs

### Security, uploads, payments, or private assets

Read:

- `docs/09-SECURITY-AND-ABUSE-PREVENTION.md`
- `docs/10-NON-FUNCTIONAL-REQUIREMENTS.md`
- Relevant business rules

## 4. Locked technical baseline

- Monorepo.
- pnpm workspaces.
- Turborepo.
- TypeScript strict mode.
- Next.js App Router for storefront and admin.
- Server-first hybrid rendering.
- NestJS modular monolith for the API.
- PostgreSQL.
- Separate worker application for asynchronous jobs.
- Docker and Docker Compose for development.
- Kubernetes for production.
- S3-compatible object-storage abstraction.
- TanStack Query for server state.
- Zustand for editor and browser-only interaction state.
- Axios is the only frontend HTTP client for application API calls.
- Internal backend APIs use the standard response envelope defined in backend conventions.
- Prettier, ESLint, TypeScript checks, tests, and SonarQube.
- Feature-first/module-first structure with responsibility-based subfolders.
- One React component per file.

Do not introduce an alternative framework or architecture without an approved ADR.

## 5. Mandatory code rules

- Keep business logic out of React components, route files, controllers, and persistence adapters.
- Do not create flat feature/module directories containing unrelated file types at one level.
- Place code at the narrowest valid scope: component → feature/module → app shared → workspace package.
- Do not use `helpers.ts`, `common.ts`, `misc.ts`, or equivalent catch-all files.
- Do not duplicate server state in Zustand.
- Do not call application APIs with `fetch`; use the approved Axios clients and feature services.
- Do not return ad hoc controller response shapes; use the standard API envelope.
- Do not access another backend module's persistence internals.
- Do not hard-code business values, statuses, URLs, limits, timeouts, or user-facing copy.
- Do not create abstractions only for hypothetical future reuse.
- Do not edit generated files manually.
- Do not bypass validation, authorization, audit, or state-transition rules.

## 6. File-size limits

- Logic/source files: hard maximum 400 lines.
- Test files: hard maximum 600 lines.
- Generated files, lockfiles, generated migrations, snapshots, and pure data fixtures may be excluded by repository configuration.
- Treat 300 lines for source and 500 lines for tests as review thresholds.
- Split by responsibility, not by arbitrary line ranges.

## 7. Change discipline

Before coding:

1. Identify the affected feature/module.
2. Read the required documents.
3. Inspect existing conventions and public boundaries.
4. State assumptions and unresolved decisions.
5. Define acceptance criteria and tests.
6. Keep the change within a reviewable slice.

During coding:

- Make the smallest coherent change.
- Preserve module boundaries.
- Add or update tests with the implementation.
- Update documentation when behavior or architecture changes.
- Do not perform unrelated refactoring.

After coding:

- Run formatting, linting, type checking, relevant tests, and file-size checks.
- Report changed files, evidence, risks, and remaining limitations.
- Never claim success without executable evidence.

## 8. Open decisions

Do not invent answers for unresolved items such as:

- Queue/broker implementation (owner APP2 — the earliest phase with real asynchronous work, IMP-O003).
- UI component library.
- Authentication and OTP provider.
- Exact payment-provider integration.
- Kubernetes distribution and topology.
- Object-storage product.

Already locked (not open): ORM is Drizzle (`docs/adr/database/ADR-DB1-002-ORM-QUERY-LAYER.md`, implemented); Jest is the unit/integration test runner (`docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` IMP-D016). Closed by APP0 — do not treat these as open:

- Generated-client codegen tool — Orval (IMP-D023).
- Frontend component test stack — Jest + `next/jest` + jsdom + React Testing Library (IMP-D024).
- Browser E2E stack — Playwright Test (IMP-D025).
- Canvas/SVG rendering architecture — native SVG rendered by React, no rendering-engine dependency, behind an engine-neutral document + renderer adapter (IMP-D026, `docs/adr/frontend/ADR-APP0-001-2D-RENDERING-ARCHITECTURE.md`).

See `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` for the authoritative locked/open implementation decisions.

Create or request an ADR before locking a consequential choice.

## 9. Prohibited shortcuts

- No broad “implement the whole feature” change without task decomposition.
- No placeholder production logic.
- No disabled tests to make a gate pass.
- No `any` used to bypass type design.
- No inline secrets.
- No public access to production files or private originals.
- No mutation of an approved design snapshot.
- No payment success based only on browser redirect.
- No direct coupling to vendor-specific object-storage administration APIs.

## 10. Completion standard

A change is complete only when:

- Requirements are satisfied.
- Tests and quality gates pass.
- Error and edge cases are handled.
- Security and authorization remain intact.
- Documentation is current.
- The result is reviewable by a human.
