# Implementation Charter

**Status:** Locked planning baseline  
**Stage:** Application implementation after database completion

## 1. Mission

Build the embroidery platform as a sequence of usable, testable vertical capabilities while preserving human review control. The stage must turn the approved product, database, architecture, and design work into production-quality backend, admin, storefront, worker, and operational behavior.

## 2. Primary objectives

1. Deliver working business journeys rather than disconnected technical layers.
2. Keep every coding change small enough for a human to understand and review.
3. Preserve database, lifecycle, authorization, money, inventory, approval, and privacy guarantees.
4. Make the API contract explicit through NestJS Swagger/OpenAPI.
5. Build Admin capabilities slightly before the Storefront behavior that consumes them, without completing all Admin work first.
6. Use the approved Figma/design-system work where sufficient and create new phase-level design packages only where gaps exist.
7. Make each release increment deployable, observable, and reversible at the application level.

## 3. Locked delivery model

### 3.1 Design

Design uses waterfall delivery at phase level.

- Design is not divided into coding-style checkpoints.
- A phase may have no design work.
- When design is needed, the whole phase design package is produced, reviewed as one coherent experience, corrected, and marked `PASS` before frontend coding for that phase.
- Existing approved design must be reused rather than recreated.

### 3.2 Engineering

Backend, frontend, worker, and integration work use small checkpoints.

- One checkpoint owns one coherent capability.
- One backend checkpoint contains at most five tightly related HTTP endpoints.
- One frontend checkpoint normally owns one screen or one bounded capability of a complex screen.
- One checkpoint ends at a human review boundary.
- Work belonging to the next checkpoint must not be started early.

### 3.3 Vertical sequencing

The default sequence inside a business phase is:

```text
Requirement and lifecycle audit
→ Phase design audit
→ Whole phase design package, only when required
→ API contract slice
→ Backend capability
→ Admin screen/capability
→ Storefront screen/capability
→ Worker or integration behavior
→ End-to-end closure
```

Backend and Admin may lead Storefront by one capability, but not by multiple business modules.

## 4. Locked technical decisions for this stage

- Backend: NestJS modular monolith plus separate worker.
- Persistence: existing PostgreSQL and Drizzle baseline; completed database migrations remain immutable.
- API documentation: NestJS Swagger producing OpenAPI is mandatory.
- API response: existing standard response envelope remains mandatory.
- Frontend: Next.js App Router, TypeScript strict, server-first rendering.
- HTTP: Axios only for application API calls.
- Server state: TanStack Query.
- Browser interaction state: Zustand only where appropriate.
- Styling: global SCSS architecture only.
- Next.js imports only the app `main.scss` entry.
- No React CSS Modules.
- No inline `style` prop or inline CSS.
- No Tailwind utility styling.
- No shadcn/ui styling baseline.
- Shared primitives may use headless behavior libraries only when approved; all visual styling remains project SCSS.
- Public catalog/content pages remain SEO-first and server-rendered where possible.
- Design Studio remains 2D; no 3D scope and no customer design download/export.

## 5. Human review is a product requirement

The project failed previously when an AI agent was allowed to change too much before review. Therefore reviewability is not a convenience; it is a mandatory quality attribute.

A change is invalid even when tests pass if:

- The scope is too broad for meaningful review.
- Unrelated refactors are mixed in.
- The agent implements later checkpoints.
- The result cannot be traced to requirements, design, contract, and tests.
- The agent hides important decisions in implementation details.

## 6. Scope boundaries

This stage includes:

- Application architecture completion.
- Swagger/OpenAPI and generated frontend client.
- Staff access and Admin shell.
- Catalog, assets, templates, Design Studio, request, review, quotation, payment, order, production, fulfillment, customer operations, content, and hardening.
- Admin and Storefront implementation.
- Worker and provider integration.
- UAT and production readiness.

This stage does not silently reopen:

- Product scope.
- Database migrations already closed.
- Approved business lifecycle.
- Design tokens derived from approved design-system sources.
- Removed 3D functionality.
- Removed customer download/export functionality.
- Removed carrier-style tracking scope.
- Complex Zalo/Messenger chatbot automation.

## 7. Completion claim policy

Use bounded claims:

- `Checkpoint complete` means only the checkpoint scope and gates passed.
- `Phase complete` means all planned phase checkpoints and integration gates passed.
- `MVP complete` means the defined commerce journey passes end-to-end.
- `Production ready` is allowed only after APP12 closure.

Do not equate database completion, API completion, screen completion, or design completion with application completion.
