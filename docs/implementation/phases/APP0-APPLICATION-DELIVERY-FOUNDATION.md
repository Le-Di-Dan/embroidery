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
- **APP0-S01B — App SCSS entry integration and styling guardrails** *(frontend foundation; dep: S01A)* — **DONE** (one `main.scss` per app at `src/styles/main.scss`; `check:styles` guardrail wired into root `quality`; both apps build; report `../reports/APP0-S01B-COMPLETION-REPORT.md`). Corrected by **APP0-S01B-C1** — the consumer Sass load path (a required Next 16 + Turbopack integration constraint) is resolved from the `@embroidery/styles` package name instead of a hard-coded monorepo path; report `../reports/APP0-S01B-C1-CORRECTION-REPORT.md`.
  - Goal: one imported `main.scss` per Next.js app; integrate the shared package; add static checks against prohibited patterns; verify both apps compile.
  - Exclusions: no real screen redesign; no feature component styling.

### 6.3 Backend and OpenAPI foundation

- **APP0-B01 — Swagger/OpenAPI server foundation** *(backend foundation; dep: C01)* — **DONE** (artifact `packages/contracts/openapi/openapi.generated.json`; commands `pnpm openapi:generate` / `pnpm check:openapi`; decision `IMP-D019`; report `../reports/APP0-B01-COMPLETION-REPORT.md`).
  - Goal: configure NestJS Swagger/OpenAPI; lock the OpenAPI artifact path and generation command in the approved checkpoint spec; stable and unique operation IDs; reproducible schema generation; no feature endpoints. Excludes generated-client implementation.
  - Delivered: shared bootstrap (`createApiApplication`) reused by the runtime and the generator; deterministic serializer; `<domain>_<method>` operation-ID policy with uniqueness validation; drift check wired into root `quality`; health liveness/readiness documented under the real `/api` prefix. Generation needs neither PostgreSQL nor a bound port.
- **APP0-B02 — Request context and effective request-ID propagation** *(backend foundation; dep: C01)* — **DONE** (context at `apps/api/src/platform/request-context/`; decision `IMP-D020`; report `../reports/APP0-B02-COMPLETION-REPORT.md`).
  - Goal: consume the gateway effective `X-Request-ID` as an input; establish application request context; validate safe fallback only when the gateway header is absent; do not create a second, incompatible request-ID policy.
  - Delivered: Node built-in `AsyncLocalStorage` behind a singleton `RequestContextService` (no third-party CLS, no request-scoped provider cascade); `RequestIdMiddleware` applied to every route; the gateway allowlist `^[A-Za-z0-9._-]{1,64}$` held in one API constant and asserted against the Nginx templates by a drift test; `X-Request-ID` documented as a request parameter and response header on every OpenAPI operation. The context carries only `requestId` — actor (B04) and logging fields (B05) stay out.
  - Response-header ownership: the **gateway** remains the sole owner (`add_header X-Request-ID $effective_request_id always`); the API deliberately does not emit the header, which would send it twice. Body-level correlation is B03's envelope.
- **APP0-B03 — Global response envelope and safe exception mapping** *(backend foundation; dep: B02)* — **DONE** (platform code at `apps/api/src/platform/http-response/`; report `../reports/APP0-B03-COMPLETION-REPORT.md`).
  - Goal: wire the existing `packages/contracts` envelope contract globally; include request correlation from the established context; map exceptions safely; prevent raw internal errors from leaking.
  - Delivered: global `APP_INTERCEPTOR` wrapping success responses in the canonical D-034 envelope and a global `@Catch()` `APP_FILTER` mapping every throwable to the canonical safe error envelope; `meta.requestId` read from the APP0-B02 context (never regenerated); allowlist-based exception sanitisation so 5xx always carry one generic message and no stack, cause, SQL, connection string or provider payload; `@SkipApiEnvelope()` route metadata for the operational exceptions in `../../development/BACKEND_CONVENTIONS.md` §6, applied to the health controller so its body is unchanged; reusable `ApiSuccessResponse` / `ApiErrorResponse` / `ApiResponseMeta` / `ApiFieldError` / `ApiPaginationMeta` OpenAPI components plus a documented 500 error response on every operation.
  - Contracts boundary: the canonical shape stays owned by `packages/contracts` and is consumed by the API through `import type` only, because that package still resolves to TypeScript source and is not Node-loadable under IMP-D018. A test asserts the compiled `dist` never requires it. Runtime integration of the package remains APP0-C02's.
- **APP0-B04 — Actor context and audit metadata foundation** *(backend foundation; dep: B02)* — **DONE** (platform code at `apps/api/src/platform/actor-context/` and `apps/api/src/platform/audit-context/`; report `../reports/APP0-B04-COMPLETION-REPORT.md`).
  - Goal: provider-neutral actor abstraction; anonymous/system/staff-compatible context shape; audit metadata plumbing. No authentication provider implementation.
  - Delivered: a discriminated-union request actor whose authenticated kinds are the canonical audit actor kinds (`ADMIN`/`CUSTOMER`/`SYSTEM`, verified against `audit_events` CST-072 and the audit module's `AuditActor` write contract) plus a request-only `ANONYMOUS` fallback that carries no identifier or privilege; frozen factories that reject empty or non-string references; one-time `bindActor()` on the existing APP0-B02 `AsyncLocalStorage` store — no second store, no request-scoped cascade — which rebuilds the actor through its factory so credential/PII fields are dropped and post-bind caller mutation cannot change it, and which fails loudly on a rebind; `getActor()`/`getBoundActor()`/`requireActor()`/`requireAuthenticatedActor()` accessors; and an `AuditMetadataFactory` producing a frozen `{ requestId, actor, occurredAt }` snapshot from the context and an injected `AuditClock`, which persists, emits and logs nothing and fails outside a request rather than inventing correlation.
  - Boundary: `requestId` and every APP0-B02/B03 behaviour are unchanged (`get()` now returns a frozen projection so the actor slot is unreachable); the OpenAPI artifact is byte-identical — actor state is internal and no security scheme, header or envelope field was added; the only actor-binding call sites are the service itself and tests, asserted by a source scan. Authentication, authorization, audit persistence and logging remain out of scope.
- **APP0-B05 — Structured logging and redaction foundation** *(backend foundation; dep: B02, B04)* — **DONE** (platform code at `apps/api/src/platform/logging/`; report `../reports/APP0-B05-COMPLETION-REPORT.md`).
  - Goal: structured application logs; request/actor correlation; redaction tests; observability package foundation. No full production monitoring, no feature-specific audit events.
  - Delivered: one-line JSON records on a fixed platform schema; levels `debug`/`info`/`warn`/`error`; platform event taxonomy (`application.log`, `http.request.completed`, `platform.error`); request/actor correlation read from B02/B04; a single `http.request.completed` record per request (final status + monotonic duration, via a response-`finish` interceptor that restores the async context so a late-bound actor is captured); one redacted `platform.error` per unknown 5xx from the B03 filter, with the public envelope byte-for-byte unchanged; allowlist/denylist redaction **before** serialization with bounded depth/size and circular/throwing-value safety; stdout/stderr sink; `LOG_LEVEL`/`LOG_STACK_ENABLED` config (production-safe defaults). Nest framework/startup logs routed through the same JSON via `app.useLogger`. IMP-D021 (B04 sync) and IMP-D022 recorded.
  - Boundary: no third-party logger, no remote/file transport, no tracing/OpenTelemetry, no audit persistence, no auth/authorization, no feature events, no OpenAPI change. The shared `@embroidery/observability` package stays empty (its `main` still resolves to unbuilt TS source — IMP-D018); the runtime is API-local until that package is made runtime-loadable. Query string, request/response body and raw headers/cookies are never logged.

### 6.4 Contract generation

- **APP0-DEC-CODEGEN — Generated-client tool decision** *(decision/ADR; dep: B01)* — **DONE** (decision `IMP-D023`, resolves `IMP-O011`; report `../reports/APP0-DEC-CODEGEN-COMPLETION-REPORT.md`).
  - Goal: compare viable OpenAPI→TypeScript/Axios tools; define generated-vs-handwritten boundaries; preserve the existing Axios instance and error-normalization layer where compatible; record ADR (IMP-O011).
  - Decided: **Orval `8.22.0`** (MIT), `axios-functions` mode with a `mutator` injecting the repo's existing Axios instance. Offline committed artifact input; generated types + thin per-operation functions under `packages/api-client/src/generated/` (never hand-edited); no generated TanStack/React hooks. Rejected OpenAPI Generator `typescript-axios` (Java runtime) and Hey API `@hey-api/openapi-ts` (vendored runtime fails the repo-locked `exactOptionalPropertyTypes`). Both finalists were spiked on the real artifact in an OS-temp directory (deterministic two-run, strict compile); no tool, dependency, lockfile or generated client was added to the repository. Drift-check design and the full C02 handoff are locked in the report.
- **APP0-C02 — OpenAPI export and generated client** *(contract generation; dep: B01, DEC-CODEGEN)* — **DONE** (client at `packages/api-client/src/generated/`; report `../reports/APP0-C02-COMPLETION-REPORT.md`).
  - Goal: reproducible export; generated code in an isolated generated directory; no manual edits in generated output; drift check; compile against admin and storefront. No TanStack Query feature hooks.
  - Delivered: Orval `8.22.0` `axios-functions` generation from the committed artifact into `src/generated` (never hand-edited), driven by a single `orval.config.ts`; a repository-owned `apiRequest` mutator routes every operation through a caller-supplied Axios instance (no new singleton, no client `X-Request-ID`), preserving the handwritten base-URL/interceptor/error-normalization runtime; deterministic two-run tree hash; a non-mutating drift gate (`check:api-client`, temp-mirror generation + tree-hash compare) wired into root `quality` after `check:openapi`; Jest + node:test coverage (36 tests). Generated types + operation functions only — no TanStack hooks (IMP-D009/IMP-D023).
  - Boundary: no frontend app integration, no auth/token/request-id generation, no API/OpenAPI-artifact change, no worker/database/Nginx change.

### 6.5 Testing foundation

- **APP0-T01 — Application integration harness adapter** *(testing foundation; dep: C01)* — **DONE** (adapter at `apps/api/src/tests/support/`; shared `CleanupStack` in `@embroidery/test-utils`; report `../reports/APP0-T01-COMPLETION-REPORT.md`).
  - Goal: **reuse and adapt the existing canonical database (DB7/database-era) test harness** for application/API integration; provide a minimal API/application integration adapter or shared facade only where a real gap exists; preserve all passing DB tests; prove disposable and isolated execution.
  - Rule: do not create a parallel independent database harness, do not mass-migrate existing fixtures, and do not duplicate database lifecycle/migration/cleanup. A minimal shared implementation may be proposed only if repository evidence proves no reusable canonical harness exists.
  - Delivered: reuses `@embroidery/database/testing` (DB7) for the whole disposable-database lifecycle; adds only a package-neutral `CleanupStack` (`@embroidery/test-utils`) and an `apps/api` test-support adapter that boots the real `AppModule` (shared `GLOBAL_ROUTE_PREFIX`) against a disposable database with the log sink captured and Supertest driving it. Proves real `GET /api/health/readiness`, envelope opt-out, structured completion logging, success/failure-path cleanup, sequential isolation, and persistent-database safety; caps Jest `maxWorkers` so the shared dev container is not oversaturated. No schema/migration/OpenAPI/generated-client change.
- **APP0-DEC-COMPONENT-TEST — Component testing tool decision** *(decision/ADR; separate ADR; IMP-O005a)* — **READY, NOT STARTED**.
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
