# Documentation Compatibility and Conflict Audit

**Type:** Independent, evidence-based, audit-only.
**Author role:** Principal Software Architect + Documentation Governance Auditor.
**Scope:** All root/`docs/**` documentation, the new `docs/implementation/` set, and targeted verification against repository truth.
**No files were modified except the creation of this report. No commit was made.**

---

## A. Executive summary

**Overall verdict: `CONDITIONAL_PASS`.**

The new `docs/implementation/` set is internally coherent, dependency-ordered, correctly subordinated to higher-level product/database/design sources, and it does not reopen any locked product scope. Its removed-scope claims (no 3D, no customer export/download, no carrier tracking, simple Zalo/Messenger) all trace to authoritative product decisions. There are **no blockers** to *planning*.

However, several **MAJOR** integration/authority defects must be corrected **before APP0 engineering begins**, because they concern the exact surfaces APP0 touches (styling authority, source-of-truth routing, database status, roadmap references).

**Conflict counts:**

| Severity | Count |
|---|---|
| BLOCKER | 0 |
| MAJOR | 4 |
| MINOR | 5 |
| INFO | 4 |

**May APP0 start?** **Planning yes; engineering no — not yet.** A single documentation-reconciliation batch (Batch 1 below) must close DOC-CONF-001, 002, 003, 004 first. In particular, APP0-S01 (Global SCSS foundation) must not run while `FRONTEND_CONVENTIONS.md` still declares styling "not yet locked" and outranks the implementation SCSS standard in the declared precedence order.

**Top risks:**

1. **Styling authority is self-contradicting** (DOC-CONF-001). The SCSS lock lives only in the low-precedence implementation set, while the higher-precedence `FRONTEND_CONVENTIONS.md` still says styling is *not locked*. Under both the implementation set's own ordering and `CLAUDE.md`, the "not locked" statement currently wins.
2. **The implementation set is an orphan** (DOC-CONF-002). Neither `CLAUDE.md` nor `README.md` reference it. An agent following `CLAUDE.md` will never route to it and will not know the SCSS/Swagger/checkpoint rules exist.
3. **Database status front-door is stale** (DOC-CONF-003). `docs/database/README.md` still says "DB5 completed, next DB6," while `DB_ROADMAP.md` and Git show DB0–DB10 all complete.
4. **Dangling `ROADMAP.md` references** (DOC-CONF-004). Two implementation docs treat a root `ROADMAP.md` as required reading and as an update target, but no such file exists.
5. **Locked-but-unimplemented tech baseline** (informational risk). Swagger/OpenAPI, SCSS/Sass, `packages/styles`, and the generated client are mandated by the docs but absent from the codebase. This is expected (they are APP0 scope), but must not be mistaken for "already in place."

---

## B. Preflight evidence

- **Branch:** `production`
- **HEAD:** `1e64353d5060ca4418c0f650d6fd98ee9c3880f1` (`docs(database): stamp DB10 closure-correction commit lineage`)
- **Working tree (`git status --short`):** one untracked entry only — `?? docs/implementation/`. No tracked file is modified. The new implementation set is present but untracked, consistent with a recent user copy. It was audited in place; nothing was reverted.
- **Recent history:** last 10 commits are all DB10 closure/persistence work; no application-implementation commits exist yet.

**Scope audited:** root `README.md`, `CLAUDE.md`; `docs/*.md` (00–13); `docs/architecture`, `docs/development`, `docs/design`, `docs/adr/database` (inventory + targeted reads); `docs/database` (roadmap, README, handoff naming — inventory-level, not every file); the entire `docs/implementation/` set (every governance file, all 13 phase plans, phases README, all 5 templates); and targeted repository verification (`package.json` files, `apps/*/src`, `apps/api/src/modules`, styling/SCSS presence, ORM, test tooling).

**Checks/commands executed:** see Appendix L.

**Structural notes:** no symlinks or generated docs distort inventory. `docs/implementation/` is a plain directory tree of 34 Markdown files. No archive/generated documentation folders were found in scope.

---

## C. Documentation inventory summary

| Family | Location | Count (approx.) | Declared status | Freshness vs repo |
|---|---|---|---|---|
| Product / business | `docs/00`–`13`*.md (charter, PRD, scope, journeys, business rules, studio spec, lifecycle, admin ops, SEO, security, NFR, glossary, decision log, acceptance) | 14 | "Product baseline established" | Current; authoritative. Removed-scope decisions confirmed in `02-SCOPE-AND-BOUNDARIES.md` and `12-DECISION-LOG.md`. |
| Architecture / security / NFR | `docs/architecture/*` (2), `docs/09`, `docs/10` | 4 | Baseline | Current; envelope + module structure match code. |
| Development conventions | `docs/development/*` (BACKEND, FRONTEND, LOCAL_DEVELOPMENT) | 3 | Baseline | **FRONTEND styling section stale/conflicting** (see DOC-CONF-001); backend envelope current; Swagger not mentioned. |
| Design / Figma | `docs/design/*` (VISION, SYSTEM_FOUNDATION, FIGMA_ARCHITECTURE, USER_FLOW) | 4 | `DESIGN_SYSTEM_FOUNDATION` = "Approved Foundation" | Tokens approved in-repo. Hi-fi screen approvals live in external Figma → `UNVERIFIED_EXTERNAL_EVIDENCE`. |
| Database | `docs/database/*` (~140), `docs/adr/database/*` (34) | ~174 | `DB_ROADMAP` = "DB0–DB10 all COMPLETE" | Roadmap + ADRs current; **`docs/database/README.md` stale** (DOC-CONF-003). |
| Implementation (new) | `docs/implementation/**` | 34 | "Proposed locked baseline" | Content-current and repo-consistent, but **orphaned/unlinked** (DOC-CONF-002). |
| Roadmap / status / closure | `DB_ROADMAP.md`, DB completion/closure reports, `docs/implementation/10`,`11` | many | Mixed | App roadmap consistent internally; **no root `ROADMAP.md`** (DOC-CONF-004). |

---

## D. Source-of-truth hierarchy assessment

**Two precedence declarations exist:**

- `CLAUDE.md` §2 lists a 10-item order ending at "Relevant ADRs and task-specific documents." It does **not** mention `docs/implementation/` at all.
- `docs/implementation/README.md` §2 declares its own 9-item order, explicitly placing "Backend and frontend conventions" (item 7) **above** "This implementation document set" (item 8).

**Proposed hierarchy to retain** (consistent with both, once reconciled): Product charter/PRD → Business rules & lifecycle → Security & NFR → System architecture & repository structure → Database canonical docs & handoffs → Design vision/system/Figma & approved screens → Backend/frontend conventions → Implementation set → phase execution specs/reports.

**Authority conflicts / gaps:**

- **AUTHORITY_AMBIGUITY (styling):** Because conventions outrank the implementation set in *both* declarations, the implementation SCSS lock cannot override `FRONTEND_CONVENTIONS.md §13` ("not yet locked") until that section is itself updated. The implementation set (12-REPOSITORY-INTEGRATION-NOTES §2) acknowledges this and asks for a reviewed update — but that update has not been made. This is the root of DOC-CONF-001.
- **Canonical owners per domain (recommended, once reconciled):**
  - Styling → `05-FRONTEND-AND-SCSS-STANDARD.md` (after `FRONTEND_CONVENTIONS.md §13` is superseded).
  - API contract mechanism → `04`/`06` (after a pointer is added to `BACKEND_CONVENTIONS.md`).
  - Database status → `DB_ROADMAP.md` + `DB10_PERSISTENCE_FINAL_CLOSURE.md` (README must stop competing).
  - Application roadmap → `10-MASTER-APPLICATION-ROADMAP.md` (must be surfaced from a root entry point).
- No document other than the intended canonical ones claims to be "the" source of truth for its domain; there is **no** multi-canonical fight beyond the styling and DB-status cases above.

---

## E. Conflict register

| ID | Severity | Type | Files/sections | Conflict | Repository evidence | Canonical winner / proposed resolution | Impacted phases |
|---|---|---|---|---|---|---|---|
| DOC-CONF-001 | MAJOR | DIRECT_CONTRADICTION / AUTHORITY_AMBIGUITY / DUPLICATE_SOURCE_OF_TRUTH | `docs/development/FRONTEND_CONVENTIONS.md §13` vs `docs/implementation/05-FRONTEND-AND-SCSS-STANDARD.md §2` and `14 …/DECISION-REGISTER IMP-D010/D011` | Conventions say "The UI styling system is not yet locked"; implementation says styling is **locked to global SCSS**, no CSS Modules/inline/Tailwind/CSS-in-JS/shadcn. Under declared precedence, conventions win, so the lock is currently unenforceable. | `FRONTEND_CONVENTIONS.md:234` = "The UI styling system is not yet locked." No `sass` dependency, no `*.scss`, no `packages/styles` in repo. | Supersede `FRONTEND_CONVENTIONS.md §13` with a pointer to `05-…SCSS-STANDARD.md` (implementation set becomes canonical for styling). Do it before APP0-S01. | APP0 (S01), all frontend phases APP1–APP12 |
| DOC-CONF-002 | MAJOR | MISSING_INTEGRATION | Root `CLAUDE.md` §2/§3, root `README.md` vs entire `docs/implementation/` | The implementation set is not referenced by `CLAUDE.md` (neither source-of-truth order nor required reading) nor by `README.md`. An agent following `CLAUDE.md` will not discover the SCSS/Swagger/checkpoint governance. | `grep` of `CLAUDE.md` for `implementation|APP0|scss|swagger` → no substantive hit; `README.md` links only product docs. | Add `docs/implementation/README.md` + current phase plan to `CLAUDE.md` required reading and precedence (below conventions); add an "Application implementation stage" section to `README.md`. Matches `12-…INTEGRATION-NOTES §2`. | APP0 and every later phase (routing) |
| DOC-CONF-003 | MAJOR | STALE_STATUS / INTERNAL_INCONSISTENCY | `docs/database/README.md` header vs `docs/database/DB_ROADMAP.md` banner + Git | README says "Current checkpoint: DB5 … COMPLETED", "Next allowed checkpoint: DB6", "No migration, no ORM install …". Roadmap + Git show DB0–DB10 complete, 31 migrations, Drizzle installed. | `DB_ROADMAP.md:8` "DB0–DB10 are all COMPLETE"; `packages/database/migrations/` exists; `drizzle-orm@0.45.2` installed; Git log shows DB10 closure commits. | `DB_ROADMAP.md` + `DB10_PERSISTENCE_FINAL_CLOSURE.md` win. Update `docs/database/README.md` status header. Does **not** block APP0 (implementation docs resolve DB status from repo truth), but must be corrected to avoid misrouting. | APP0 preflight, any DB-touching phase |
| DOC-CONF-004 | MAJOR | BROKEN_REFERENCE | `docs/implementation/12-…INTEGRATION-NOTES §2` ("Main `ROADMAP.md`") and `13-PHASE-SOURCE-MAP §1` ("current `ROADMAP.md`" as required reading each phase) | Both treat a root/main `ROADMAP.md` as existing (read it every phase; add APP0–APP12 to it). No such file exists anywhere in the repo. | `find -iname ROADMAP*.md` (excl. node_modules) → only `docs/database/DB_ROADMAP.md`; **no** root `ROADMAP.md`. | Either create a thin root `ROADMAP.md` pointing to `DB_ROADMAP.md` + `10-MASTER-APPLICATION-ROADMAP.md`, or amend 12/13 to name the actual roadmap files. | APP0 preflight; all phases (required reading) |
| DOC-CONF-005 | MINOR | MISSING_INTEGRATION | `docs/development/BACKEND_CONVENTIONS.md` vs `04`/`06` + `IMP-D008` | Backend conventions never mention the now-mandatory NestJS Swagger/OpenAPI + generated client. | `grep swagger/openapi` in `BACKEND_CONVENTIONS.md` → none; `@nestjs/swagger` absent from `apps/api/package.json`. | Add a short pointer in `BACKEND_CONVENTIONS.md` to `04`/`06` (per `12-…NOTES`). Swagger install itself is legitimate APP0 work. | APP0 (B01/C02) |
| DOC-CONF-006 | MINOR | STALE_STATUS | Root `README.md` | "Status: Product baseline established"; no mention that DB0–DB10 are complete or that an implementation stage exists. | `README.md:4`; DB completion in `DB_ROADMAP.md`. | Update README stage/status once implementation set is integrated (folds into DOC-CONF-002 batch). | Governance only |
| DOC-CONF-007 | MINOR | UNSUPPORTED_ASSERTION (partial) | `14-…DECISION-REGISTER IMP-O005` | Lists "frontend/component/E2E testing tools not already selected" as open, implying no test tool chosen. Jest v30 is already the selected unit/integration runner repo-wide. | `apps/api/package.json` + `packages/database/package.json`: `"jest": "^30.4.2"`, `"test": "jest"`. | Narrow IMP-O005 to component/E2E tools only; record Jest as already selected. | APP0 (T01/T02) |
| DOC-CONF-008 | MINOR | SCOPE_DRIFT (size risk) | `10-…ROADMAP` + `phases/APP4`, `phases/APP10` | APP4 bundles customer identity + verification + secure access + notification core; APP10 bundles profile + merge + agreements + notification ops + Zalo. Each spans several bounded contexts in one phase. | Phase files list 10–14 candidate checkpoints each. | Acceptable because checkpoint-decomposed, but flag for extra scrutiny at phase entry to avoid oversized checkpoints. No re-order required. | APP4, APP10 |
| DOC-CONF-009 | INFO | ROADMAP_CONFLICT (cosmetic) | `phases/APP1-X01` vs `09-…MILESTONE R0` | R0 spans APP0–APP1, but no phase closure explicitly "closes R0" (other milestones are explicitly closed at their last phase). | `09 §2`; `APP1` §6 has no "close R0". | Add an explicit R0 closure note at APP1-X01 for symmetry. | APP1 |
| DOC-CONF-010 | INFO | Endpoint-limit vigilance | Multiple `phases/APP*` contract checkpoints | Some checkpoints enumerate up to 5 operations plus "attachment"/"resend" behavior that could exceed 5 endpoints. | e.g., `APP5-C02`, `APP4-C02`. | Already self-guarded ("re-sliced if five-endpoint limit requires"). No change; verify at contract audit. | APP4, APP5, others |
| DOC-CONF-011 | INFO | Terminology (benign) | `11 …MATRIX` "R3 foundation" vs `09` "R3" | APP4 tagged "R3 foundation" while R3 is closed at APP6. | `11 §2`; `09 §2`. | Semantics consistent; optional wording tidy-up. | — |
| DOC-CONF-012 | INFO | UNVERIFIED_EXTERNAL_EVIDENCE | Design `REUSE` assumptions in `phases/APP2,3,11` | Reliance on "approved high-fidelity screens" whose approval state lives in Figma, not the repo. | Only `docs/design/*` prose + `DESIGN_SYSTEM_FOUNDATION` = Approved. Screen approvals external. | Implementation docs already require recording exact Figma refs before `REUSE` (13 §4) — correct guardrail. No conflict; note evidence gap. | APP2, APP3, APP11 |

### Detailed narrative for MAJOR findings

**DOC-CONF-001 — Styling authority is self-undermining.**
`FRONTEND_CONVENTIONS.md:232-241` still contains a live "Styling" section stating "The UI styling system is not yet locked." The implementation set (`05 §2`, `IMP-D010`, `IMP-D011`) locks styling to global SCSS and prohibits CSS Modules/inline/Tailwind/CSS-in-JS/shadcn. Both precedence declarations (`CLAUDE.md §2`, `implementation/README §2`) rank conventions **above** the implementation set, so a strict reader must currently obey "not locked." The implementation authors foresaw this (`12-…NOTES §2` explicitly says to replace the conventions styling statement "through a reviewed documentation checkpoint"), but the replacement has not happened. Repository state is neutral (no styling system implemented yet: no `sass`, no `.scss`, no `packages/styles`), so there is no *code* conflict — only a documentation-authority conflict that must be resolved before APP0-S01 creates the SCSS foundation. **This is the single most important pre-APP0 correction.**

**DOC-CONF-002 — The implementation set is orphaned.**
`CLAUDE.md` is the operative entry point ("This file is the entry point for Claude"). It neither lists `docs/implementation/` in its source-of-truth order (§2) nor in required reading by task (§3), and `README.md` links only product docs. Consequently an agent that faithfully follows `CLAUDE.md` will never load the charter, checkpoint model, SCSS/Swagger locks, or roadmap. The implementation set can be internally perfect and still be bypassed. Integration is prescribed by `12-…NOTES §2` but not yet performed (the whole set is still untracked).

**DOC-CONF-003 — Database README contradicts the database roadmap.**
Within the *same* `docs/database/` family, `DB_ROADMAP.md:8` declares "DB0–DB10 are all COMPLETE … 31 migrations," whereas `README.md` (the family's overview/front door) still reads "Current checkpoint: DB5 — COMPLETED," "Next allowed checkpoint: DB6," and "No migration, no ORM install, no physical table … has been created." Git and repo state confirm the roadmap: `packages/database/migrations/` exists, `drizzle-orm@0.45.2` is installed, and HEAD is a DB10 closure commit. The canonical winner is `DB_ROADMAP.md`/`DB10_PERSISTENCE_FINAL_CLOSURE.md`. APP0 is **not blocked** (implementation docs mandate resolving DB status from repo truth, and the roadmap is correct), but the stale README is a real misdirection hazard.

**DOC-CONF-004 — Required reading points to a nonexistent roadmap.**
`13-PHASE-SOURCE-MAP §1` states every phase also reads "Root `README.md` and current `ROADMAP.md`," and `12-…NOTES §2` instructs adding APP0–APP12 to "Main `ROADMAP.md`." No root/main `ROADMAP.md` exists. This is a dangling required-reading reference that every phase preflight would trip over. Fix by creating a thin root `ROADMAP.md` (linking `DB_ROADMAP.md` and `10-MASTER-APPLICATION-ROADMAP.md`) or by renaming the references to the files that do exist.

---

## F. `docs/implementation/` compatibility matrix

| File | Status | Conflicts | Missing evidence | Required action |
|---|---|---|---|---|
| `README.md` | COMPATIBLE_WITH_INTEGRATION | DOC-CONF-002 | — | Link from `CLAUDE.md`/`README.md`. |
| `00-IMPLEMENTATION-CHARTER.md` | COMPATIBLE | — | — | None. Removed-scope claims verified against product docs. Does not reopen closed decisions. |
| `01-DELIVERY-GOVERNANCE.md` | COMPATIBLE | — | — | Consistent with `CLAUDE.md` file-size/commit governance and 5-endpoint rule. |
| `02-PHASE-AND-CHECKPOINT-MODEL.md` | COMPATIBLE | — | — | Design waterfall + engineering checkpoints preserved. |
| `03-DESIGN-DELIVERY-POLICY.md` | COMPATIBLE | DOC-CONF-012 (info) | External Figma approval | Keep the "record Figma refs before REUSE" guardrail. |
| `04-BACKEND-API-DELIVERY-STANDARD.md` | COMPATIBLE_WITH_INTEGRATION | DOC-CONF-005 | — | Add Swagger pointer to `BACKEND_CONVENTIONS.md`. Envelope/repository-ownership match repo. |
| `05-FRONTEND-AND-SCSS-STANDARD.md` | NEEDS_CORRECTION (of the *other* doc) | DOC-CONF-001 | — | Supersede `FRONTEND_CONVENTIONS.md §13` so this becomes canonical. `packages/styles` path is "recommended," not yet created (OK). |
| `06-OPENAPI-AND-CLIENT-CONTRACT.md` | COMPATIBLE | — | — | `packages/contracts` + `packages/api-client` already exist; no duplicate handwritten OpenAPI. Consistent with envelope. |
| `07-TESTING-AND-ACCEPTANCE-GATES.md` | COMPATIBLE | DOC-CONF-007 (info) | — | Jest already selected; component/E2E tools still open (APP0). |
| `08-DATABASE-CHANGE-CONTROL.md` | COMPATIBLE | — | — | Correctly protects immutable migrations and forward-only change; matches DB10 closure + ADR-DB1-003/010. |
| `09-RELEASE-AND-MILESTONE-POLICY.md` | COMPATIBLE | DOC-CONF-009 (info) | — | R0–R6 mapping internally consistent with roadmap/matrix. |
| `10-MASTER-APPLICATION-ROADMAP.md` | COMPATIBLE_WITH_INTEGRATION | DOC-CONF-004 | — | Surface from a root roadmap/README. Phase order valid (see §G). |
| `11-TRACEABILITY-AND-STATUS-MATRIX.md` | COMPATIBLE | DOC-CONF-011 (info) | — | Module/milestone mapping matches phases and existing `apps/api` module names. |
| `12-REPOSITORY-INTEGRATION-NOTES.md` | NEEDS_CORRECTION | DOC-CONF-003, 004 | — | Its own instructions must be executed; DB status is already resolved (complete), and the `ROADMAP.md` target must be created or renamed. |
| `13-PHASE-SOURCE-MAP.md` | NEEDS_CORRECTION | DOC-CONF-004 | — | Fix "current `ROADMAP.md`" required-reading reference. |
| `14-IMPLEMENTATION-DECISION-REGISTER.md` | COMPATIBLE | DOC-CONF-007 (info) | — | Locked/open split is sound. Narrow IMP-O005 (Jest selected). Open items (auth, storage, queue, canvas, payment) genuinely unresolved — no ADRs exist outside `docs/adr/database/`. |
| `phases/README.md` | COMPATIBLE | — | — | Links to all 13 phase files resolve. |
| `phases/APP0` | COMPATIBLE | DOC-CONF-001 (gates S01) | — | Scope valid; must wait for Batch 1 before S01. |
| `phases/APP1` | COMPATIBLE | DOC-CONF-009 (info) | Auth provider (IMP-O001) | Auth ADR required before B01. |
| `phases/APP2`–`APP12` | COMPATIBLE | see §G | Phase-specific open decisions | Convert to per-checkpoint specs at phase entry. |
| `templates/*` (5) | COMPATIBLE | — | — | Governance-safe: each stresses "one checkpoint, stop for review," ≤5 endpoints, no next-checkpoint work. They do **not** encourage whole-phase prompts or overclaim. |

---

## G. APP0–APP12 roadmap assessment

| Phase | Scope validity | Dependency validity | Design evidence | Size/reviewability risk | Main corrections |
|---|---|---|---|---|---|
| APP0 | Valid (foundation only; feature APIs excluded) | Root; depends on DB baseline (complete) | `NONE` (token/SCSS verification only) — correct | Low, if S01 waits for Batch 1 | Resolve DOC-CONF-001 before S01; record canvas (IMP-O004) + E2E tool (IMP-O005) selections |
| APP1 | Valid (auth + shells) | Needs APP0; needs auth ADR (IMP-O001) | `SUPPLEMENT/NEW` plausible; external Figma | Moderate | Lock auth provider before B01 |
| APP2 | Valid (first vertical slice) | Needs APP1; storage adapter (IMP-O002) | Public `REUSE/SUPPLEMENT`; Admin `NEW` | Moderate (16 checkpoints, but well-sliced) | Lock object-storage adapter; record Figma refs before REUSE |
| APP3 | Valid (2D studio; no 3D/download — matches product) | Needs APP2 + APP0 spike | `REUSE/SUPPLEMENT` | Higher (studio) — mitigated by capability slicing | Confirm design-document/design-engine ownership; canvas decision from APP0 |
| APP4 | Valid but broad (identity+verification+secure+notify) | Needs APP1/APP0 | Mixed `NONE`/`SUPPLEMENT` | **Elevated (DOC-CONF-008)** | Extra scrutiny to keep checkpoints small; provider ports only |
| APP5 | Valid (requests) | Needs APP2/APP3/APP4 | `SUPPLEMENT/NEW` | Moderate | Watch endpoint counts (DOC-CONF-010) |
| APP6 | Valid (review/approval/quotation; immutability preserved) | Needs APP4/APP5 | `NEW/SUPPLEMENT` | Moderate–high | None structural |
| APP7 | Valid (deposit + order; no redirect-only success — matches D-rules) | Needs APP6; payment ADR (IMP-O007) | Provider-UX-dependent | Moderate | Lock payment provider before implementation |
| APP8 | Valid (inventory/production; concurrency preserved) | Needs APP7; queue ADR (IMP-O003) | Mostly Admin | Moderate | Preserve DB7/DB8 lock-order guarantees |
| APP9 | Valid (remaining payment/fulfillment; no carrier tracking — matches D-rules) | Needs APP8; refund policy (IMP-O008) | `SUPPLEMENT` | Moderate | Lock cancellation/refund params before C03/B04 |
| APP10 | Valid but broad (profile+merge+agreements+notify ops+Zalo) | Needs APP4 + R4 | `SUPPLEMENT` | **Elevated (DOC-CONF-008)** | Keep merge/notification/Zalo as separate checkpoints |
| APP11 | Valid (gallery/content/SEO) | Needs APP2 + stable commerce | `REUSE/SUPPLEMENT` | Moderate | Do not redesign approved public identity |
| APP12 | Valid (hardening/UAT) | Needs APP0–APP11 | `NONE` | Low (audit) | Claims bounded to measured evidence |

**No missing mandatory product capability was detected**, and no removed capability reappears (3D/download/carrier-tracking/chatbot are consistently excluded and match `02-SCOPE-AND-BOUNDARIES.md` / `12-DECISION-LOG.md`). Exit gates are evidence-based (E2E + negative tests), not vague. Phase order matches business/database dependency.

---

## H. Technical compatibility findings

| Area | In code | Locked in docs, not implemented | Undecided | Conflict |
|---|---|---|---|---|
| Package manager / monorepo | pnpm@11.5.2 workspaces + Turbo 2 (`package.json`, `pnpm-workspace.yaml`) | — | — | None (matches `CLAUDE.md §4`) |
| Apps | `apps/{admin,api,storefront,worker}` present | — | — | None (names match `11-…MATRIX`) |
| Next.js App Router | `apps/storefront`, `apps/admin` scaffolds (`app/` router, layout/page/healthz) | — | — | None |
| NestJS monolith + worker | `apps/api` (Nest 11) + `apps/worker`; only `health.controller.ts` exists | Feature controllers/endpoints (APP1+) | — | None — existing `apps/api/src/modules/*` are DB-era **repositories/domain/mappers/integration tests**, not feature endpoints. Consistent with "APP0 excludes feature APIs." |
| ORM | Drizzle `drizzle-orm@0.45.2` (api, database, persistence); `drizzle.config.ts` | — | — | None (matches ADR-DB1-002) |
| PostgreSQL | `postgres:16.6-alpine` (compose); 31 migrations | — | — | None (ADR-DB1-001) |
| Axios / TanStack Query / Zustand | Present in both `admin` + `storefront` (`axios@1.18`, `@tanstack/react-query@5.101`, `zustand@5`) | — | — | None (matches charter §4) |
| SCSS / Sass | **Absent** (no `sass` dep, no `.scss`, no `main.scss`, no `packages/styles`) | Global SCSS system, per-app `main.scss`, shared Sass package (APP0-S01) | — | **Doc-authority conflict** DOC-CONF-001 (not a code conflict) |
| Tailwind / CSS Modules / CSS-in-JS | **Absent** | Prohibited by docs | — | None — clean slate; nothing to remove |
| Swagger / OpenAPI / client gen | **Absent** (`@nestjs/swagger` not installed) | Mandatory NestJS Swagger + generated Axios client (APP0-B01/C02); `packages/contracts` + `packages/api-client` exist as homes | — | None as code; DOC-CONF-005 (conventions pointer missing) |
| Test tooling | Jest v30 across api/packages; `jest.bench.config.mjs` in api | — | Component/E2E runner (Playwright?) | DOC-CONF-007 (register overstates openness) |
| Object storage | Abstraction referenced; adapter not locked | — | IMP-O002 (APP2) | None (correctly open) |
| Queue / broker | — | — | IMP-O003 (APP0/APP4) | None (correctly open) |
| Payment provider | `ZaloPay` appears as a candidate in `01-PRODUCT-REQUIREMENTS`; no payment ADR | — | IMP-O007 (APP7) | None material — provider genuinely unlocked; no ADR in `docs/adr/` outside database |
| Notification provider | Ports referenced | — | IMP-O006 (APP4) | None (correctly open) |
| Canvas / SVG library | — | — | IMP-O004 (APP0 spike) | None (correctly open) |

---

## I. Link and structural integrity

- **Internal implementation links:** all relative links in `docs/implementation/**` resolve (verified by extracting every `](...)` target; the 13 `APP*.md` links from `phases/README.md` and the 5 governance/template links all exist).
- **Broken references:** DOC-CONF-004 — `ROADMAP.md` (root/main) referenced by `12`/`13` does not exist. No other broken file references found in the implementation set.
- **Missing indexes / orphans:** the entire `docs/implementation/` tree is orphaned from root entry points (`CLAUDE.md`, `README.md`) — DOC-CONF-002. Conversely, no file listed in `docs/implementation/README.md` or `phases/README.md` is missing.
- **Case-sensitivity/path issues:** none observed; implementation set uses consistent uppercase phase filenames and lowercase governance/template conventions matching the on-disk names.
- **Duplicate filename/title confusion:** `docs/database/DB_ROADMAP.md` vs the not-yet-existing root `ROADMAP.md` vs `10-MASTER-APPLICATION-ROADMAP.md` — three "roadmap" concepts. Low risk if the root `ROADMAP.md` is created as an index (see Batch 1).
- **`infra` vs `infrastructure`:** repository uses `infrastructure/` (not `infra/`); implementation docs do not reference an `infra/` path, so no mismatch — noted only because the conditional-scope section of the audit brief mentioned `infra/**`.

---

## J. Correction plan — proposed, NOT executed

All batches are documentation-only. No code, schema, migration, or test change is involved. Each batch stops for human review.

| Batch | Goal | Allowed files | Conflict IDs | Acceptance criteria | Dependency |
|---|---|---|---|---|---|
| 1 | Make the implementation set discoverable and resolve styling authority | `CLAUDE.md`, `README.md`, `docs/development/FRONTEND_CONVENTIONS.md` | DOC-CONF-001, 002 | `CLAUDE.md` references implementation set in precedence + required reading; `README.md` has an implementation-stage section; `FRONTEND_CONVENTIONS §13` superseded by a pointer to `05-…SCSS-STANDARD.md`; no duplicate styling authority remains | None (do first) |
| 2 | Fix stale database status front-door | `docs/database/README.md` | DOC-CONF-003 | README status header matches `DB_ROADMAP.md` (DB0–DB10 complete, migrations/ORM present) | Independent of Batch 1 |
| 3 | Resolve the roadmap reference gap | new root `ROADMAP.md` **or** `docs/implementation/12`,`13` | DOC-CONF-004 | Either a root `ROADMAP.md` index exists (links `DB_ROADMAP.md` + `10-…ROADMAP.md`) or 12/13 name the real files; no dangling required-reading reference | After Batch 1 (so root links are coherent) |
| 4 | Close minor integration/precision gaps | `docs/development/BACKEND_CONVENTIONS.md`, `docs/implementation/14-…DECISION-REGISTER.md` | DOC-CONF-005, 007 | Backend conventions point to Swagger/OpenAPI standard; IMP-O005 narrowed (Jest recorded as selected) | After Batch 1 |
| 5 (optional) | Cosmetic consistency | `docs/implementation/09`, `11`, `phases/APP1` | DOC-CONF-006, 009, 011 | Root README status refreshed; R0 closure note added; "R3 foundation" wording tidied | Last; non-blocking |

No execution prompts are written here (per audit brief).

---

## K. Final recommendation

- **Verdict: `CONDITIONAL_PASS`.** The implementation documentation is architecturally sound, dependency-correct, and faithful to locked product/database/design decisions. It is safe to *finalize planning* but not to *begin APP0 engineering* until Batch 1 (and ideally Batches 2–4) are executed.
- **Documentation correction is required before APP0-S01**, specifically DOC-CONF-001 (styling authority) and DOC-CONF-002 (routing/discoverability). DOC-CONF-003 and 004 should be closed in the same reconciliation pass.
- **Human decisions still required before their owning phases** (not blockers to the doc set, but real gates): auth provider (APP1), object storage (APP2), queue/broker (APP0/APP4), canvas library (APP0), payment provider (APP7), refund policy (APP9), notification providers (APP4). None have ADRs outside `docs/adr/database/`.
- **External evidence to supply:** exact Figma file/page/section/node references and approval status for any phase intending `REUSE`/`SUPPLEMENT` design — currently `UNVERIFIED_EXTERNAL_EVIDENCE`.

---

## L. Appendix — evidence

### Commands executed (read-only)

- `git branch --show-current`; `git rev-parse HEAD`; `git status --short`; `git log -10 --oneline`
- Inventory: `ls`/`find` over root, `docs/`, `docs/implementation/**`, `docs/adr/database`, `docs/database`, `docs/design`, `docs/development`, `apps/*`, `packages/*`
- `cat package.json`, `pnpm-workspace.yaml`
- `grep` for dependencies: `sass`, `@nestjs/swagger`, `axios`, `@tanstack/react-query`, `zustand`, `tailwindcss`, `styled-components`, `@emotion`, `drizzle-orm`, `jest` across `apps/*/package.json`, `packages/*/package.json`
- `find` for `*.scss`, `packages/styles`, `tailwind*`/`postcss*` configs, `ROADMAP*.md`
- `find`/`grep` over `apps/api/src/modules/*` (module file counts; `@Controller` occurrences)
- `grep` styling/envelope/swagger sections of `FRONTEND_CONVENTIONS.md` / `BACKEND_CONVENTIONS.md`
- `grep` removed-scope terms (3D/download/export/carrier/tracking/Zalo/Messenger) across `02-SCOPE-AND-BOUNDARIES.md`, `12-DECISION-LOG.md`, `05-DESIGN-STUDIO-SPEC.md`, `01-PRODUCT-REQUIREMENTS.md`
- Extraction of all Markdown link targets in `docs/implementation/**`

### Files read in full

`CLAUDE.md`; root `package.json`; `pnpm-workspace.yaml`; every file in `docs/implementation/` (README, 00–14, `phases/README.md`, `phases/APP0`–`APP12`, all 5 templates). Head/section reads: `docs/database/README.md`, `docs/database/DB_ROADMAP.md`, `docs/design/DESIGN_SYSTEM_FOUNDATION.md`, `docs/development/FRONTEND_CONVENTIONS.md §13`, `docs/development/BACKEND_CONVENTIONS.md §6`, root `README.md`, and targeted `apps/api/src/modules/{order,payment}` listings.

### Limitations / not verified

- The ~174 `docs/database/**` and `docs/adr/database/**` files were audited at inventory + roadmap/README/handoff-naming level, not line-by-line. Deep DB-internal consistency was out of scope for this documentation-compatibility audit; the database roadmap's own "complete" banner and Git history were treated as authoritative.
- Figma artifacts (hi-fi screen approvals, node IDs) are external and could not be opened → `UNVERIFIED_EXTERNAL_EVIDENCE`.
- No build/test/generation commands were run (audit-only); "locked but not implemented" states were confirmed by dependency/file presence, not by executing generators.
