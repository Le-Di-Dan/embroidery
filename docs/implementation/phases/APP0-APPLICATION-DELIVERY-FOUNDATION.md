# APP0 — Application Delivery Foundation

## 1. Outcome

Create the engineering control plane required for all later phases: application module ownership, Swagger/OpenAPI, generated Axios client, global SCSS foundation, testing harness, request/audit context, and bounded technical spikes.

## 2. Dependencies

Completed database/persistence baseline, existing system architecture, repository structure, backend/frontend conventions, and approved design-system sources.

## 3. Design policy

Classification: `NONE` for product screen design. Verify the approved design tokens and Figma architecture only to create the SCSS foundation. The 2D editor spike is a technical feasibility artifact, not a production screen design package.

Design, when required, is delivered as one complete phase package and is not split into coding checkpoints.

## 4. In scope

- Application module ownership and dependency map.
- Swagger/OpenAPI bootstrap and generation command.
- API envelope and error mapping foundation.
- Generated TypeScript/Axios client package.
- Per-app `main.scss` entries and shared global SCSS package.
- Test database and API/frontend/E2E harness foundations.
- Request ID, actor context, structured logging and audit context foundation.
- Technical spike for selected 2D canvas/SVG approach.
- CI-quality commands and implementation documentation integration.

## 5. Out of scope

- Product feature APIs.
- Staff/customer production authentication flows.
- Full Design Studio implementation.
- New database schema unless an approved blocker change is created.
- New visual screen design.

## 6. Locked checkpoint map

This map is the canonical, locked APP0 checkpoint decomposition (refined after the APP0 pre-implementation audit and human review; see `../audits/APP0_PRE_IMPLEMENTATION_AUDIT.md`). These are planning slices: execute and review exactly one at a time and stop for human review. Any backend slice remains subject to the maximum of five tightly related HTTP endpoints. Decision (`DEC-*`) and spike (`R01`) checkpoints must resolve before their dependent build checkpoints; tool/path values must be explicit in the approved checkpoint spec before any code is written (see §10).

### 6.1 Documentation and architecture

- **APP0-C01 — Application module ownership reconciliation** *(documentation; no dependencies)* — **DONE** (canonical owner: `../../architecture/SYSTEM_ARCHITECTURE.md` §8 + `../../architecture/REPOSITORY_STRUCTURE.md` §11/§11a; report `../reports/APP0-C01-COMPLETION-REPORT.md`).
  - Goal: reconcile bounded-context ownership, public application services, repository ownership, allowed dependency direction, and no-cycle rules against existing on-disk modules.
  - Inputs to inspect first: `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/architecture/REPOSITORY_STRUCTURE.md`, database bounded-context/ownership handoffs, existing `apps/api/src/modules/**`, `../11-TRACEABILITY-AND-STATUS-MATRIX.md`.
  - Output rule: prefer updating an existing canonical architecture document; create a new file only if no canonical owner exists, and then only under `docs/architecture/`. `docs/implementation/` may link to it but must not duplicate its full contents. Do not create a competing module map under `docs/implementation/`.
  - Exclusions: no code, no tooling choice, no feature API, no duplicate canonical map. Stop for human review.

### 6.2 SCSS foundation

- **APP0-S01A — Shared SCSS package and token foundation** *(frontend foundation; dep: C01)* — **DONE** (package `@embroidery/styles` at `packages/styles`; decision `IMP-D017`; report `../reports/APP0-S01A-COMPLETION-REPORT.md`).
  - Goal: lock the reviewed shared style package path; define the shared Sass package structure; map approved tokens/scales; define `@use`/`@forward` boundaries.
  - Exclusions: no app screen styling; no app `main.scss` integration unless strictly required to validate package compilation; no component library implementation.
- **APP0-S01B — App SCSS entry integration and styling guardrails** *(frontend foundation; dep: S01A)* — **DONE** (one `main.scss` per app at `src/styles/main.scss`; `check:styles` guardrail wired into root `quality`; both apps build; report `../reports/APP0-S01B-COMPLETION-REPORT.md`).
  - Goal: one imported `main.scss` per Next.js app; integrate the shared package; add static checks against prohibited patterns; verify both apps compile.
  - Exclusions: no real screen redesign; no feature component styling.

### 6.3 Backend and OpenAPI foundation

- **APP0-B01 — Swagger/OpenAPI server foundation** *(backend foundation; dep: C01)*
  - Goal: configure NestJS Swagger/OpenAPI; lock the OpenAPI artifact path and generation command in the approved checkpoint spec; stable and unique operation IDs; reproducible schema generation; no feature endpoints. Excludes generated-client implementation.
- **APP0-B02 — Request context and effective request-ID propagation** *(backend foundation; dep: C01)*
  - Goal: consume the gateway effective `X-Request-ID` as an input; establish application request context; validate safe fallback only when the gateway header is absent; do not create a second, incompatible request-ID policy.
- **APP0-B03 — Global response envelope and safe exception mapping** *(backend foundation; dep: B02)*
  - Goal: wire the existing `packages/contracts` envelope contract globally; include request correlation from the established context; map exceptions safely; prevent raw internal errors from leaking.
- **APP0-B04 — Actor context and audit metadata foundation** *(backend foundation; dep: B02)*
  - Goal: provider-neutral actor abstraction; anonymous/system/staff-compatible context shape; audit metadata plumbing. No authentication provider implementation.
- **APP0-B05 — Structured logging and redaction foundation** *(backend foundation; dep: B02, B04)*
  - Goal: structured application logs; request/actor correlation; redaction tests; observability package foundation. No full production monitoring, no feature-specific audit events.

### 6.4 Contract generation

- **APP0-DEC-CODEGEN — Generated-client tool decision** *(decision/ADR; dep: B01)*
  - Goal: compare viable OpenAPI→TypeScript/Axios tools; define generated-vs-handwritten boundaries; preserve the existing Axios instance and error-normalization layer where compatible; record ADR (IMP-O011).
- **APP0-C02 — OpenAPI export and generated client** *(contract generation; dep: B01, DEC-CODEGEN)*
  - Goal: reproducible export; generated code in an isolated generated directory; no manual edits in generated output; drift check; compile against admin and storefront. No TanStack Query feature hooks.

### 6.5 Testing foundation

- **APP0-T01 — Application integration harness adapter** *(testing foundation; dep: C01)*
  - Goal: **reuse and adapt the existing canonical database (DB7/database-era) test harness** for application/API integration; provide a minimal API/application integration adapter or shared facade only where a real gap exists; preserve all passing DB tests; prove disposable and isolated execution.
  - Rule: do not create a parallel independent database harness, do not mass-migrate existing fixtures, and do not duplicate database lifecycle/migration/cleanup. A minimal shared implementation may be proposed only if repository evidence proves no reusable canonical harness exists.
- **APP0-DEC-COMPONENT-TEST — Component testing tool decision** *(decision/ADR; separate ADR; IMP-O005a)*
- **APP0-T02A — Frontend component and accessibility harness** *(testing foundation; dep: DEC-COMPONENT-TEST, S01B)*
  - Goal: component harness; network-boundary mocking convention; baseline accessibility assertion. No browser E2E.
- **APP0-DEC-E2E — Browser E2E tool decision** *(decision/ADR; separate ADR; IMP-O005b)*
- **APP0-T02B — Browser E2E harness** *(testing foundation; dep: DEC-E2E, S01B, B03)*
  - Goal: run through the real gateway; disposable environment; one foundation smoke journey. No product feature journey.

### 6.6 2D editor spike

- **APP0-R01 — 2D canvas/SVG feasibility spike** *(technical spike; dep: S01B optional)*
  - Goal: test text/image layers, transforms, mobile pointer behavior, serialization, watermark behavior, and a performance budget; produce an ADR (IMP-O004) or a precise blocker. No Design Studio production implementation.
  - Blocks APP3, and blocks APP0 closure if the exit gate still requires the selection.

### 6.7 Closure

- **APP0-X01 — APP0 foundation closure** *(closure; dep: all above)*
  - Requires: all APP0 checkpoint evidence; all APP0-owned decisions recorded; explicit queue/broker defer owner chosen by earliest consumer (see §8); no feature scope leakage; no database change; handoff to APP1; R0 status handled per `../09-RELEASE-AND-MILESTONE-POLICY.md`.

Total: 17 checkpoints (12 build, 3 decisions, 1 spike, 1 closure).

**Dependency order (text):**

```text
APP0-C01
 ├─ APP0-S01A ─ APP0-S01B ─┬─ APP0-T02A (after DEC-COMPONENT-TEST)
 │                         └─ APP0-T02B (after DEC-E2E, needs B03)
 ├─ APP0-B01 ─ APP0-DEC-CODEGEN ─ APP0-C02
 ├─ APP0-B02 ─ APP0-B03
 │        └─ APP0-B04 ─ APP0-B05
 └─ APP0-T01
APP0-R01 (parallel spike; blocks APP3 and closure gate)
→ APP0-X01 (closure)
```

## 7. Critical end-to-end journey

A minimal diagnostic route is represented in generated OpenAPI, consumed through the generated Axios client in both app test harnesses, and correlated end-to-end through the gateway effective `X-Request-ID` into the application request context and structured logs. The SCSS entries compile with no CSS Modules or inline styling.

## 8. Exit gate

- All commands are reproducible from a clean checkout.
- Swagger generation and client generation pass.
- SCSS architecture compiles for both apps.
- Testing harnesses run and existing database-era tests still pass.
- Request correlation flows from the gateway `X-Request-ID` through request context, envelope, actor/audit, and logs (no second request-ID policy).
- Editor spike ends in a documented selection (ADR) or a precise blocker.
- Queue/broker owner is explicitly assigned to the earliest consuming phase, after verifying whether APP2 asset/derivative processing requires a real job queue (see IMP-O003). APP0 implements no real queue unless a verified APP0 requirement appears.
- No product feature is falsely claimed complete; no database schema change occurred.

## 9. Handoff

APP1 receives stable actor abstractions, request-context/request-ID conventions, API/error envelope conventions, client generation, SCSS structure, and reused/adapted test harnesses.
