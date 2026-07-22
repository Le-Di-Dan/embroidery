# APP0 Pre-Implementation Audit

**Type:** Audit-only. No implementation performed. No code/config/schema/migration changed.
**Author role:** Principal Software Architect · Senior NestJS/Next.js Platform Engineer · Repository Auditor · Implementation Governance Reviewer.
**Subject:** APP0 — Application Delivery Foundation (`docs/implementation/phases/APP0-APPLICATION-DELIVERY-FOUNDATION.md`).

---

## A. Executive summary

**Verdict: `CONDITIONAL_PASS`** (human-reviewed: **ACCEPTED WITH REQUIRED CORRECTIONS**, applied in this revision).

Condition, stated accurately:

- APP0 planning is complete enough to lock the checkpoint map (done — see §H and the canonical APP0 phase file §6).
- A small documentation-only pre-entry correction was required before any code checkpoint: close DOC-CONF-014, correct this audit, and freeze the refined APP0 checkpoint map. This correction is **not** APP0 engineering.
- Tool-dependent checkpoints remain gated by their explicit decisions or spikes.
- The existence of an expected APP0 implementation gap is not itself a blocker.

Readiness:

- **APP0 planning:** PASS.
- **APP0 implementation:** READY TO BEGIN WITH `APP0-C01` AFTER HUMAN APPROVAL (once this documentation correction is committed). Tool-dependent checkpoints stay gated by their `DEC-*`/spike decisions.
- **APP0 engineering performed by this task:** NONE.
- **Recommended first checkpoint:** `APP0-C01 — Application module ownership reconciliation` (documentation/architecture; zero dependencies, no blocking decision, de-risks every later slice). First *code* checkpoint eligible immediately after: `APP0-S01A/S01B` (SCSS foundation) or `APP0-B01` (Swagger server foundation).
- **Top risks:** (1) handwritten `packages/api-client` diverging from a future generated client; (2) picking codegen/component/E2E/canvas tools implicitly inside a code checkpoint instead of a reviewed decision; (3) oversizing a "foundation" checkpoint by merging SCSS + OpenAPI + client + tests.

**Findings:** BLOCKER 0 · MAJOR 3 · MINOR 5 · INFO 3 · TOTAL 11.

**Corrected checkpoint count:** 17 (12 build, 3 decisions, 1 spike, 1 closure). Ordered map in §H; canonical owner is the APP0 phase file §6.

---

## B. Preflight evidence

- **Branch:** `production`
- **HEAD:** `14fb21be3a1f2e9eef12afee3aab0e8b1acd9263`
- **Working tree:** clean (`git status --short` empty) before this report was written.
- **Reconciliation commits present in history:** `270a5dd` (reconcile/integrate baseline) and `14fb21b` (closure evidence) — both confirmed at HEAD~1/HEAD. The hashes named in the task prompt are historical; current HEAD is `14fb21b`.
- **No out-of-scope user changes** were present; audit reliability is not degraded.

**Documents read (this session + carried context):** `CLAUDE.md`; `README.md`; all `docs/implementation/**` governance files (`README`, `00`–`14`), `phases/README.md`, `phases/APP0-APPLICATION-DELIVERY-FOUNDATION.md` and all APP1–APP12 phase files; templates; both prior audit reports; `docs/development/{FRONTEND,BACKEND}_CONVENTIONS.md`; `docs/database/{README,DB_ROADMAP}.md` and DB10 closure references; `docs/design/DESIGN_SYSTEM_FOUNDATION.md` (status = "Approved Foundation").

**Repository areas inspected:** `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `sonar-project.properties`, `tools/`, `apps/{admin,storefront,api,worker}/**`, `packages/**`, `infrastructure/**`. Targeted checks: dependency presence (Swagger, sass, axios, TanStack Query, Zustand, drizzle, jest, queue/broker, canvas), `apps/api` bootstrap/prefix/envelope/health, `packages/contracts` + `packages/api-client` contents, codegen tooling, observability/test-utils stubs.

**Audit limitations:** No web access used (not required). Figma screen-approval status remains external → `UNVERIFIED_EXTERNAL_EVIDENCE`, but APP0 is `NONE` for screen design so this does not affect APP0. Deep per-file review of the ~140 DB docs was not repeated; DB completion was taken from `DB_ROADMAP.md` + repository migration/ORM presence.

---

## C. APP0 canonical scope

**Goals (from APP0 phase file §1, §4):** create the engineering control plane for all later phases — application module ownership, Swagger/OpenAPI, generated Axios client, global SCSS foundation, testing harness, request/actor/audit context and structured logging, and bounded technical spikes.

**Included capabilities:**
- Application module ownership + dependency map (no circular deps).
- Swagger/OpenAPI bootstrap and generation command (no feature endpoints).
- Standard API envelope + safe error mapping + correlation metadata.
- Generated TypeScript/Axios client package (no handwritten DTO duplication).
- Per-app `main.scss` entries + shared global SCSS package; static checks for prohibited styling patterns.
- Backend disposable-PostgreSQL/API integration harness; frontend component/network/accessibility/E2E foundations.
- Request-ID propagation, actor abstraction, structured logging, audit metadata plumbing.
- 2D canvas/SVG technical spike (feasibility artifact, not a production screen).
- CI/quality commands and implementation-doc integration.

**Explicit exclusions (§5):** product feature APIs; staff/customer production authentication flows; full Design Studio; new database schema (unless an approved blocker database-change checkpoint is created); new visual screen design.

**Inputs/dependencies (§2):** completed DB/persistence baseline (DB0–DB10 ✔), system architecture, repository structure, backend/frontend conventions, approved design-system sources.

**Exit gates (§8) — all evidence-measurable:** commands reproducible from clean checkout; Swagger + client generation pass; SCSS compiles for both apps; test harnesses run; editor spike ends in a documented selection or a precise blocker; no product feature falsely claimed complete.

**Design classification: `NONE`.** APP0 creates no screens/user flows. The SCSS foundation is *design-token-to-code verification* against the already-approved Design System Foundation ("Approved Foundation" / "Approved Scale"), which is explicitly distinct from new screen design. No Figma artifact must be created or modified. A light visual/token sanity check after `APP0-S01` is verification, not design work.

**Database impact classification: `NONE`.** No schema change is in scope. Migrations remain immutable; any genuine gap must stop and open a dedicated database-change checkpoint (`08-DATABASE-CHANGE-CONTROL.md`).

---

## D. Repository readiness matrix

| Area | Required by APP0 | Current repository state | Gap | Conflict | Action owner |
|---|---|---|---|---|---|
| Monorepo/toolchain | Yes | pnpm@11.5.2, Turbo 2, TS strict, ESLint/Prettier, SonarQube props | None | None | — (ready) |
| Admin app | Shell only | `apps/admin` Next.js App Router scaffold (`layout.tsx`, `page.tsx`, `healthz/route.ts`) | Needs SCSS entry | None | APP0-S01B |
| Storefront app | Shell only | `apps/storefront` same scaffold | Needs SCSS entry | None | APP0-S01B |
| API | Bootstrap only | `apps/api` NestJS 11, `/api` global prefix, config, health module; DB-era modules are repositories/domain only (only `health.controller.ts` exists) | No Swagger, no global envelope wiring, no request context | None | APP0-B01/B02/B03/B04/B05 |
| Worker | Foundation only | `apps/worker` bootstrap lifecycle + persistence integration + module + main | No real jobs/queue (correct for APP0) | None | later phases |
| SCSS/styling | Yes | **Absent** — no `sass` dep, no `*.scss`, no `main.scss`, no `packages/styles` | Full SCSS foundation | None (clean slate; nothing to remove) | APP0-S01A/S01B |
| Design tokens | Verify only | `DESIGN_SYSTEM_FOUNDATION.md` = Approved (tokens/scale approved) | Token→SCSS implementation | None | APP0-S01A |
| Swagger/OpenAPI | Yes | **Absent** — `@nestjs/swagger` not installed | Install + configure, stable operation IDs | None | APP0-B01 |
| Contracts (envelope) | Yes | `packages/contracts` implements api-envelope types+guards+tests | Wire into API globally (after request context); add OpenAPI artifact | None | APP0-B03/C02 |
| Generated Axios client | Yes | `packages/api-client` handwritten (axios instance, browser/server clients, error normalization) — **no `src/generated/`, no codegen tooling** | Codegen tool + pipeline; reconcile handwritten client | Potential (divergence) | APP0-C02 |
| TanStack Query | Yes (manual hooks) | `@tanstack/react-query@5` in admin+storefront | None (hooks come per feature) | None | later phases |
| Zustand | Browser state only | `zustand@5` in admin+storefront | None | None | later phases |
| Jest | Yes | `jest@30` across apps/packages; `test` scripts wired | None | None | — (ready) |
| Component testing | Yes | No component test tool | Choose + configure | Undecided | APP0-DEC-COMPONENT-TEST → APP0-T02A (needs ADR) |
| Browser E2E | Yes | No E2E tool | Choose + configure | Undecided | APP0-DEC-E2E → APP0-T02B (needs ADR) |
| Backend integration harness | Yes | Per-module PG integration specs exist (e.g. `order/tests/integration/order-fixture.ts`); `packages/test-utils` is a stub (`index.ts`) | Reuse/adapt the existing canonical DB (DB7/database-era) harness; add an application/API integration adapter only where a real gap exists | None | APP0-T01 |
| Queue/broker | Not in APP0 | **Absent** (no bullmq/pg-boss/amqp/kafka) | n/a for APP0 | None | `MAY_DEFER_TO_EARLIEST_CONSUMING_PHASE` — verify APP2 asset-processing need first |
| Canvas/SVG | Spike only | **Absent** (no konva/fabric/paper/pixi) | Spike + ADR | Undecided | APP0-R01 (needs ADR before APP3) |
| CI/quality gates | Extend | `pnpm quality` = format+lint+typecheck+test+file-size+db manifest; `tools/check-file-size.mjs` present | Add swagger/client-drift + SCSS-lint gates | None | APP0-B01/C02/S01A/S01B |
| Docker/local dev | Constraint | `infrastructure/{compose,docker,nginx,...}`; Nginx dev gateway (D-036); Windows/pnpm host | None (respect port 5433, `--env-file`) | None | — (constraint) |
| Observability | Yes | `packages/observability` stub (`index.ts`) | Structured logging/correlation foundation | None | APP0-B05 |

---

## E. Decision readiness register

| Decision | Current status | APP0 necessity | Classification | Blocking checkpoint | Required evidence | ADR/spike |
|---|---|---|---|---|---|---|
| ORM (Drizzle) | Locked (ADR-DB1-002; `drizzle-orm@0.45.2` installed; 31 migrations) | Consumed, not chosen | `ALREADY_LOCKED` | none | ADR + installed dep | none |
| Unit/integration test runner (Jest) | Locked (IMP-D016; `jest@30` installed) | Consumed | `ALREADY_LOCKED` | none | register + dep | none |
| API response envelope | Locked (`packages/contracts/api-envelope`) | Wire globally (after request context) | `ALREADY_LOCKED` (implementation partial) | APP0-B03 | contracts package + tests | none |
| Frontend component test tool | Open (IMP-O005a) | Needed to close APP0 test foundation | `MUST_LOCK_IN_APP0` | APP0-DEC-COMPONENT-TEST → APP0-T02A | comparison vs SCSS/Next/Jest constraints; config runs | ADR |
| Browser E2E tool | Open (IMP-O005b) | Needed to close APP0 E2E foundation | `MUST_LOCK_IN_APP0` | APP0-DEC-E2E → APP0-T02B | E2E runs against disposable env; SSR/gateway compatible | ADR (separate from component) |
| Generated-client codegen tool (OpenAPI→TS/Axios) | Open (IMP-O011; `06` gives only "recommended" paths) | Needed for APP0-C02 | `MUST_LOCK_IN_APP0` | APP0-DEC-CODEGEN → APP0-C02 | tool choice; generated-vs-handwritten boundary; reproducible generate command; no manual edits in generated dir | ADR |
| OpenAPI artifact path + generation command | Partially specified (`06` "recommended" `packages/contracts/openapi/openapi.generated.json`) | Needed for APP0-B01/C02 | `MUST_LOCK_IN_APP0` | APP0-B01/C02 | committed artifact + CI drift check | small decision — explicit in approved B01 spec |
| Shared SCSS package architecture (name/location) | Partially specified (`05` "recommended" `packages/styles/**`; not created; `packages/ui` exists) | Needed for APP0-S01A | `MUST_LOCK_IN_APP0` | APP0-S01A | package created + both apps import one `main.scss` + `@use`/`@forward` | small decision — explicit in approved S01A spec |
| Canvas/SVG rendering library | Open (IMP-O004; owner APP0) | Spike only in APP0; decision blocks APP3 | `MUST_LOCK_IN_APP0` (via spike) | APP0-R01 (blocks APP3) | spike report: text/image layers, transforms, mobile pointer, serialization, watermark, performance | ADR |
| Queue/broker | Open (IMP-O003; owner = earliest consuming phase) | Not needed for APP0 (worker foundation exists; no real jobs) | `MAY_DEFER_TO_EARLIEST_CONSUMING_PHASE` | none in APP0 | APP0 verifies whether APP2 asset/derivative processing needs a real queue → owner = APP2 if yes, else earliest later async phase, APP4 only if APP2/APP3 don't need it; worker port abstraction preserved | ADR at owning phase |
| Storybook | Open (IMP-O010) | Optional; not a stage blocker | `NOT_REQUIRED` (APP0) | none | — | optional |

No provider/library is selected in this audit; the table records *necessity, owner, and evidence* only.

---

## F. Findings register

**APP0-AUD-001 — INFO — expected-gap.** Swagger/OpenAPI absent (`@nestjs/swagger` not installed). *Evidence:* `apps/api/package.json`. *Impact:* none — it is APP0-B01 scope. *Resolution:* implement in APP0-B01. *Owner:* APP0-B01. Blocks planning? No. Blocks implementation? No (it *is* the work). Blocks checkpoint: n/a.

**APP0-AUD-002 — INFO — expected-gap.** SCSS system absent (no `sass`, no `.scss`, no shared styles package). *Evidence:* repo grep/find. *Impact:* none — APP0-S01 scope; clean slate (no Tailwind/CSS Modules to remove). *Owner:* APP0-S01.

**APP0-AUD-003 — MAJOR — rework-risk / undecided-tooling.** `packages/api-client` is a handwritten client (axios instance, browser/server clients, error normalization) with **no codegen pipeline and no `src/generated/`**, while `06` mandates generated types/client. *Evidence:* `packages/api-client/src/**`; no orval/openapi tooling in any `package.json`. *Impact:* if a codegen tool is later introduced without reconciling the handwritten layer, DTOs/operations may diverge or be duplicated. *Resolution:* `APP0-DEC-CODEGEN` locks the codegen tool via ADR (IMP-O011) and defines the boundary between generated code and the existing handwritten axios/error layer (the handwritten instance/error normalization is compatible with `06 §5` and should be preserved; generated code should be additive under `src/generated/`); `APP0-C02` then implements. *Owner:* APP0-DEC-CODEGEN → APP0-C02. Blocks planning? No. Blocks implementation? Blocks **APP0-C02** only.

**APP0-AUD-004 — MAJOR — undecided-decision (spike).** Canvas/SVG library undecided (IMP-O004). *Evidence:* no canvas dep; APP0 §6 `APP0-R01`. *Impact:* APP3 engineering cannot start without it; an implicit choice inside code would bypass review. *Resolution:* APP0-R01 spike → ADR. *Owner:* APP0-R01. Blocks planning? No. Blocks implementation? Blocks **APP3** (and closure gate for the spike); does not block other APP0 foundation checkpoints.

**APP0-AUD-005 — MAJOR — undecided-tooling.** Frontend component + browser-E2E tools undecided (IMP-O005a/b). *Evidence:* no component/E2E tool in any `package.json`. *Impact:* APP0 test foundation cannot close; risk of picking two mismatched toolchains. *Resolution:* two separate decisions/ADRs — `APP0-DEC-COMPONENT-TEST` and `APP0-DEC-E2E` — then configure `APP0-T02A` and `APP0-T02B` respectively. *Owner:* APP0-DEC-COMPONENT-TEST/APP0-DEC-E2E → APP0-T02A/T02B. Blocks implementation? Blocks **APP0-T02A/T02B** and phase closure `APP0-X01`.

**APP0-AUD-006 — MINOR — documentation-inconsistency (DOC-CONF-014).** `CLAUDE.md §8` listed "ORM" and "Testing tools not yet selected" as open; `README.md §6` listed "ORM và migration framework" as open — though Drizzle (ADR-DB1-002) and Jest (IMP-D016) are locked. *Impact:* a reader of the entry-point docs could wrongly treat ORM/test-runner as open. *Resolution:* **CLOSED in this documentation correction** — `CLAUDE.md §8` and `README.md §6` now remove ORM from open decisions, state Drizzle+Jest locked, and scope the remaining open testing decisions to the frontend component tool and browser E2E tool. *Owner:* this correction commit. Blocks planning? No. Blocks implementation? No. See §G.

**APP0-AUD-007 — MINOR — partial-foundation / ordering.** The API envelope exists in `packages/contracts` but is **not wired as a global interceptor** in `apps/api` (only `health.controller.ts` references it). *Evidence:* grep `envelope|interceptor` in `apps/api/src` → health only. *Impact:* envelope correlation must not precede application request context. *Resolution:* `APP0-B02` first establishes request context / effective `X-Request-ID` propagation; `APP0-B03` then wires the global envelope interceptor + safe exception mapping using the established correlation. *Owner:* APP0-B02 → APP0-B03.

**APP0-AUD-008 — MINOR — stub-packages.** `packages/observability` and `packages/test-utils` are stubs (`index.ts` only). *Evidence:* `find … src`. *Impact:* APP0-B05 (structured logging/correlation) and APP0-T01 (harness adapter) must fill them; not a defect. *Owner:* APP0-B05 / APP0-T01.

**APP0-AUD-009 — MINOR — architecture-decision.** Shared SCSS package location is "recommended" in `05` (`packages/styles/**`) but does not exist; `packages/ui` exists and could be a candidate home. *Impact:* APP0-S01A must lock the exact package boundary to avoid later moves. *Resolution:* the shared-styles package path is an explicit decision in the approved APP0-S01A checkpoint spec (recommend a dedicated styles package rather than mixing into `packages/ui`). *Owner:* APP0-S01A.

**APP0-AUD-010 — INFO — favorable.** The existing handwritten axios instance + error normalization in `packages/api-client` already matches `06 §5` (single configured instance, normalized errors). *Impact:* reduces APP0-C02 scope; keep it, layer generated code on top.

**APP0-AUD-011 — MINOR — harness-reuse.** Backend PG integration tests already exist with **per-module fixtures** (e.g. `order/tests/integration/order-fixture.ts`) over the DB-era harness, while `packages/test-utils` is empty. *Impact:* APP0-T01 must **reuse and adapt the existing canonical database (DB7/database-era) test harness** for application/API integration, add a minimal adapter/facade only where a real gap exists, preserve all passing DB tests, and avoid a parallel database harness or mass fixture migration. A minimal shared implementation may be proposed only if evidence proves no reusable canonical harness exists. *Owner:* APP0-T01.

---

## G. DOC-CONF-014 verification

- **`CLAUDE.md` still says ORM/testing open:** YES — §8 line 178 (`- ORM.`) and line 186 (`- Testing tools not yet selected.`).
- **`README.md` still says ORM open:** YES — §6 line 104 (`- ORM và migration framework.`).
- **Drizzle locked:** YES — `docs/adr/database/ADR-DB1-002-ORM-QUERY-LAYER.md`; `drizzle-orm@0.45.2` installed; 31 migrations exist.
- **Jest locked:** YES — `14-IMPLEMENTATION-DECISION-REGISTER.md` IMP-D016; `jest@30` installed.

**Status at audit time: `PARTIALLY_CLOSED`** — authoritative sources (the DB ADR and the implementation decision register) locked both Drizzle and Jest, but the two entry-point documents still listed them as open.

**Final status: `CLOSED`** — fixed in this documentation correction:

- `CLAUDE.md §8` no longer lists ORM; it states ORM is Drizzle (locked, ADR-DB1-002) and Jest is the locked unit/integration runner (IMP-D016), and scopes remaining open testing to the frontend component tool + browser E2E tool, with a pointer to `14-IMPLEMENTATION-DECISION-REGISTER.md`.
- `README.md §6` no longer lists ORM/migration framework as open; it states Drizzle ORM + migration foundation are locked and implemented, Jest is locked, and only the frontend component tool and browser E2E tool remain open for APP0.

**Impact:** Did not block APP0 planning or any implementation checkpoint; now fully reconciled across canonical sources and entry-point documents.

---

## H. APP0 checkpoint decomposition

Decision/spike checkpoints are separated from build checkpoints so each is independently reviewable. No forbidden merges (SCSS≠OpenAPI; Swagger server≠client generation; component≠E2E; canvas decision≠Studio impl; queue≠notification; not one giant checkpoint).

This mirrors the canonical locked map in the APP0 phase file §6 (17 checkpoints: 12 build, 3 decisions, 1 spike, 1 closure). Order is a valid topological order; several items run in parallel (see graph).

| Order | Checkpoint ID | Name | Type | Goal | Dependencies | Explicit exclusions | Acceptance evidence | Human decision |
|---|---|---|---|---|---|---|---|---|
| 1 | APP0-C01 | Application module ownership reconciliation | documentation | Reconcile/lock bounded-context ownership, public services, repository ownership, allowed dependency direction, no-cycle rule vs on-disk modules | none | no code, no tooling choice, no feature API, no duplicate map | reviewed reconciliation (prefer updating existing architecture doc); matches `apps/api/src/modules/*` | No |
| 2 | APP0-S01A | Shared SCSS package + token foundation | frontend foundation | Lock styles-package path; shared Sass package structure; token/scale mapping; `@use`/`@forward` boundaries | C01 | no app screen styling; no `main.scss` app integration unless needed to validate compile; no component library | package compiles; tokens mapped; path recorded in approved spec | Yes (styles package path) |
| 3 | APP0-S01B | App SCSS entry + styling guardrails | frontend foundation | One imported `main.scss` per app; integrate shared package; static checks vs prohibited patterns; both apps compile | S01A | no screen redesign; no feature component styling | both apps build; lint blocks CSS Modules/inline/Tailwind/CSS-in-JS | No |
| 4 | APP0-B01 | Swagger/OpenAPI server foundation | backend foundation | Configure NestJS Swagger; lock artifact path/command in spec; stable/unique operation IDs; no feature endpoints | C01 | no generated client; no feature APIs | OpenAPI doc generates in CI; operation-id uniqueness | Yes (artifact path/command) |
| 5 | APP0-B02 | Request context + effective request-ID propagation | backend foundation | Consume gateway `X-Request-ID`; establish request context; safe fallback only if header absent; no second request-ID policy | C01 | no auth provider; no feature logic | request context present; consumes gateway ID; fallback test | No |
| 6 | APP0-B03 | Global response envelope + safe exception mapping | backend foundation | Wire existing envelope contract globally with correlation from B02; map exceptions safely | B02 | no per-feature errors | envelope integration tests; correlation present; raw errors never leak | No |
| 7 | APP0-B04 | Actor context + audit metadata foundation | backend foundation | Provider-neutral actor abstraction (anonymous/system/staff shape); audit metadata plumbing | B02 | no authentication provider; no feature audit events | actor context resolves; audit metadata attached | No |
| 8 | APP0-B05 | Structured logging + redaction foundation | backend foundation | Structured logs; request/actor correlation; redaction; observability package foundation | B02, B04 | no full production monitoring; no feature audit | correlated logs; redaction test passes | No |
| 9 | APP0-DEC-CODEGEN | Generated-client tool decision | decision (ADR) | Choose OpenAPI→TS/Axios tool; define generated/handwritten boundary (IMP-O011) preserving existing axios/error layer | B01 | no implementation | ADR recorded; reproducible command specified | Yes |
| 10 | APP0-C02 | OpenAPI export + generated client | contract generation | Reproducible export; generated code isolated; no manual edits; drift check; compiles in both apps | B01, DEC-CODEGEN | no TanStack hooks; no feature DTOs | generate reproducible; drift check; client compiles | No (tool already chosen) |
| 11 | APP0-T01 | Application integration harness adapter | testing foundation | Reuse/adapt existing canonical DB (DB7) harness for application/API integration; minimal adapter only where gap exists | C01 | no parallel DB harness; no mass fixture migration; no frontend/E2E | reuse evidence; sample API integration test; existing DB tests still pass; disposable/isolated | No |
| 12 | APP0-DEC-COMPONENT-TEST | Component testing tool decision | decision (ADR) | Choose frontend component test tool (IMP-O005a) | none | no implementation | ADR recorded | Yes |
| 13 | APP0-T02A | Frontend component + a11y harness | testing foundation | Component harness; network-boundary mocking convention; baseline a11y assertion | DEC-COMPONENT-TEST, S01B | no browser E2E | sample component test + a11y check pass | No |
| 14 | APP0-DEC-E2E | Browser E2E tool decision | decision (ADR) | Choose browser E2E tool (IMP-O005b) | none | no implementation | ADR recorded | Yes |
| 15 | APP0-T02B | Browser E2E harness | testing foundation | E2E through the real gateway; disposable env; one foundation smoke journey | DEC-E2E, S01B, B03 | no feature journeys | sample E2E passes through gateway | No |
| 16 | APP0-R01 | 2D canvas/SVG feasibility spike | technical spike | Text/image layers, transforms, mobile pointer, serialization, watermark, performance → ADR (IMP-O004) or precise blocker | S01B (optional) | no Design Studio implementation | spike report + ADR or precise blocker | Yes (library) |
| 17 | APP0-X01 | APP0 foundation closure | closure | All gates; all APP0 decisions recorded; explicit queue owner (earliest consumer); no feature/schema leakage; hand off APP1; R0 per release policy | all above | no new feature scope | all APP0 exit-gate evidence green | No |

**Dependency graph (text):**
```
APP0-C01
 ├─ APP0-S01A ─ APP0-S01B ─┬─ APP0-T02A (after DEC-COMPONENT-TEST)
 │                         └─ APP0-T02B (after DEC-E2E, needs B03)
 ├─ APP0-B01 ─ APP0-DEC-CODEGEN ─ APP0-C02
 ├─ APP0-B02 ─ APP0-B03
 │        └─ APP0-B04 ─ APP0-B05
 └─ APP0-T01
APP0-R01 (spike; parallel; blocks APP3 and the closure gate) 
→ APP0-X01 (closure)
```
Decision checkpoints (`DEC-CODEGEN`, `DEC-COMPONENT-TEST`, `DEC-E2E`) and the `R01` spike may proceed in parallel with build checkpoints; each requires a human decision before its dependent build checkpoint. Every checkpoint stops for human review before the next begins.

---

## I. First checkpoint recommendation

**Recommended first: `APP0-C01 — Application module ownership reconciliation`** (documentation/architecture), eligible for human-approved execution once this documentation correction is committed.

- **Goal (corrected):** *reconcile and lock application module ownership and dependency direction* — not "create another module map." C01 must first inspect existing canonical sources: `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/architecture/REPOSITORY_STRUCTURE.md`, the database bounded-context/ownership handoffs, existing `apps/api/src/modules/**`, and `../11-TRACEABILITY-AND-STATUS-MATRIX.md`.
- **Output rule:** (1) prefer updating an existing canonical architecture document; (2) create a new architecture document only if no canonical owner exists; (3) if a new file is necessary it must live under `docs/architecture/`, not as a competing implementation-governance map; (4) `docs/implementation/` may link to the canonical artifact but must not duplicate its full contents.
- **Rationale:** zero dependencies, no undecided tooling, lowest risk; it reconciles the plan with the existing DB-era `apps/api/src/modules/*` structure before any code is added.
- **Why not others first:** `APP0-C02`, `APP0-T02A/T02B` are gated by undecided ADRs (AUD-003/005/IMP-O011); `APP0-R01` needs the canvas ADR; `APP0-S01A`/`APP0-B01` are excellent *code* first-steps but each carries one small explicit decision (styles-package path; OpenAPI artifact path) that must be fixed in their approved specs.
- **Immediately-eligible code alternative:** `APP0-S01A` (shared SCSS package + tokens) or `APP0-B01` (Swagger server) — each self-contained, with its one small path/command decision recorded in the approved checkpoint spec.
- **Expected file categories for C01:** documentation only — an update to a canonical architecture doc under `docs/architecture/` (or, if none exists, a new file there), optionally linked from `docs/implementation/`. No app/package code.
- **Explicitly prohibited in C01:** any code, dependency install, schema/migration change, feature API, tooling selection, or a duplicate module map under `docs/implementation/`.
- **Minimum acceptance gates:** ownership + dependency direction reconciled against all bounded contexts and on-disk modules; no-cycle rule stated; canonical owner identified (updated or newly created under `docs/architecture/`); reviewed and accepted by a human.
- **Risks:** low; main risk is scope creep into tooling decisions or creating a competing map — both explicitly excluded.
- **Human review questions:** Does the reconciled ownership match intended module boundaries? Which canonical architecture doc owns it? Are cross-module dependency rules acceptable? Are the styles-package path (S01A) and OpenAPI artifact path (B01) agreed for the next code checkpoints?

*(No implementation prompt is written here.)*

---

## J. APP0 phase entry gate checklist

- Documentation baseline: ✔ reconciled, integrated, version-controlled (commits `270a5dd`, `14fb21b`).
- Repository clean state: ✔ working tree clean at HEAD `14fb21b`.
- Open decisions: ◐ codegen tool (IMP-O011), component tool (IMP-O005a), E2E tool (IMP-O005b), canvas library (IMP-O004), styles-package path, OpenAPI artifact path — each assigned to a decision/spike checkpoint or an explicit approved-spec value; none block the first checkpoint.
- Design classification: ✔ `NONE` (token verification only; no Figma work).
- Database classification: ✔ `NONE` (immutable migrations; no schema change).
- Dependency readiness: ✔ DB0–DB10 complete; Nest/Next/worker scaffolds, envelope contract, axios client, Jest present.
- Tooling readiness: ◐ Swagger/SCSS/codegen/E2E to be added within APP0; CI/file-size gates present and extendable.
- Pre-entry documentation correction (this task): ✔ DOC-CONF-014 closed; audit corrected; refined APP0 checkpoint map frozen in the phase file §6.
- Report review: ☐ this corrected audit awaits human PASS.
- Human approval: ☐ required before any checkpoint executes.

---

## K. Final recommendation

1. **APP0 planning PASS?** Yes.
2. **APP0 implementation may begin?** Ready to begin with `APP0-C01` after human approval, once this documentation correction is committed. Then the first code checkpoints are `APP0-S01A`/`APP0-B01`. Do not start `APP0-C02`/`APP0-T02A`/`APP0-T02B`/`APP3` until their ADRs/spike land.
3. **First checkpoint:** `APP0-C01 — Application module ownership reconciliation` (code alternative: `APP0-S01A` or `APP0-B01`).
4. **Corrections required first?** Yes — the small documentation-only pre-entry correction in this task (close DOC-CONF-014, correct this audit, freeze the checkpoint map). No APP0 engineering is involved. After this commits, `APP0-C01` is eligible.
5. **Decisions to lock before their dependent checkpoints:** generated-client codegen tool (before C02, IMP-O011), component test tool + browser E2E tool as **separate** decisions (before T02A/T02B, IMP-O005a/b), canvas/SVG library (before APP3, IMP-O004), plus two small explicit approved-spec decisions (styles-package path for S01A; OpenAPI artifact path for B01/C02). None may be chosen implicitly inside a code checkpoint.
6. **Technical spike before foundation work?** The `APP0-R01` canvas spike is required before **APP3** (and the closure gate), not before APP0 foundation; it can run in parallel. No spike is required before the first APP0 checkpoint.
7. **Queue/broker ownership:** not auto-assigned to APP4 — `MAY_DEFER_TO_EARLIEST_CONSUMING_PHASE`; APP0 verifies whether APP2 asset/derivative processing needs a real queue and assigns the owner accordingly at closure.
8. **Harness:** APP0-T01 reuses/adapts the existing canonical DB (DB7) test harness; no parallel harness without evidence.
9. **Request-ID:** APP0-B02 consumes the gateway effective `X-Request-ID`; envelope correlation (B03) depends on it — no second request-ID policy.

---

## L. Appendix — evidence

**Commands run (read-only):** `git branch --show-current`, `git rev-parse HEAD`, `git status --short`, `git log -10 --oneline`; `ls`/`find` over `docs/implementation/phases`, `docs/implementation/audits`, `apps/*/src`, `packages/*/src`, `tools/`, `infrastructure/`; `cat turbo.json`, `apps/api/src/main.ts` (head); `grep` for `@nestjs/swagger`, `sass`, `orval|openapi|codegen`, queue/broker deps, canvas deps, `envelope|interceptor`, `request-id|actor|AsyncLocalStorage`, DOC-CONF-014 lines in `CLAUDE.md`/`README.md`.

**Files read:** listed in §B.

**Key search evidence:** no `@nestjs/swagger`; no `sass`/`.scss`/`packages/styles`; `packages/api-client` has no `src/generated/` and no codegen dep; `packages/contracts/src/api-envelope/*` present; only `health.controller.ts` references envelope in `apps/api`; no queue/broker or canvas deps; `jest@30`, `axios@1.18`, `@tanstack/react-query@5`, `zustand@5`, `drizzle-orm@0.45.2` present; `CLAUDE.md:178/186` and `README.md:104` still list ORM/testing as open.

**Limitations:** external Figma approvals unverified (irrelevant to APP0 `NONE`); DB corpus not re-audited line-by-line (completion taken from roadmap + migration/ORM presence); no web access used.

**No-change confirmation (original audit session):** the audit itself changed no code/config/schema/migration and installed nothing.

**Revision note:** This report was revised under a subsequent documentation-only correction (human verdict: ACCEPTED WITH REQUIRED CORRECTIONS). That correction edits only Markdown governance files — `CLAUDE.md`, `README.md`, this report, `docs/implementation/phases/APP0-APPLICATION-DELIVERY-FOUNDATION.md`, and `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` — with no code, config, dependency, schema, or migration change. See `git log` for the correction commit.
