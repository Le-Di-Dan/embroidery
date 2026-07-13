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
10. Relevant ADRs and task-specific documents

Do not silently resolve contradictions. Report them before implementation.

## 3. Required reading by task

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
- Relevant product requirements

### Backend

Read:

- `docs/architecture/SYSTEM_ARCHITECTURE.md`
- `docs/architecture/REPOSITORY_STRUCTURE.md`
- `docs/development/BACKEND_CONVENTIONS.md`
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

- ORM.
- Queue/broker implementation.
- Canvas library.
- UI component library.
- Authentication and OTP provider.
- Exact payment-provider integration.
- Kubernetes distribution and topology.
- Object-storage product.
- Testing tools not yet selected.

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
