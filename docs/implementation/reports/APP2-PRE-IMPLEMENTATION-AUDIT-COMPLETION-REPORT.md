# APP2 — Pre-Implementation Audit — Completion Report

Paired evidence for the APP2 pre-implementation audit. **Audit Commit A:
`8643431b420d28b6eb8458bb3a87c936ca803280`** (`docs(app2): audit assets and
catalog publication entry`). Branch `production`; initial HEAD before the audit
`6fab243f59aafce1c5e4fc87263e6de1409abb55` (APP1 closure evidence). **Nothing
pushed.** Verdict **`PASS_WITH_REQUIRED_DECISIONS`**; APP2 product engineering
not started.

## A. Preflight

| Check | Result |
|---|---|
| `git branch --show-current` | `production` |
| Initial HEAD | `6fab243f59aafce1c5e4fc87263e6de1409abb55` |
| Working tree at start | clean |
| APP1 closure Commit A | `036043c1b1a4861c14977f6184d1841d8f9fc220` (`docs(app1): close staff access and shared shells`) |
| APP1 closure Commit B | `6fab243f59aafce1c5e4fc87263e6de1409abb55` (`docs(app1): record APP1 closure evidence`) |
| APP1 reports present | `reports/APP1-COMPLETION-REPORT.md`, `reports/APP1-CLOSURE-EVIDENCE.md` |
| APP2 phase file present | `phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md` |
| APP2 engineering started | no |
| Unrelated changes | none |

`APP2_PRE_AUDIT_PREFLIGHT = PASS` — `pnpm quality`, `check:openapi`,
`check:api-client`, `check:figma-design-index`, `db:check:manifest`, and
`git diff --check` all exited 0 from the clean initial tree.

## B. Sources inspected

Governance/plan: `CLAUDE.md`, `README.md`, `docs/implementation/README.md`,
`10-MASTER-APPLICATION-ROADMAP.md`, `11-TRACEABILITY-AND-STATUS-MATRIX.md`,
`13-PHASE-SOURCE-MAP.md`, `14-IMPLEMENTATION-DECISION-REGISTER.md`,
`phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md`, APP0/APP1 completion +
closure reports. Architecture/design: `SYSTEM_ARCHITECTURE.md`,
`docs/design/FIGMA_DESIGN_INDEX.md`, `ADR-DB5-003`, ADR index. Code/config:
`apps/api/src/modules/asset/**`, `.../catalog/**`, `.../inventory/**`,
`apps/worker/src/**`, `packages/database/src/schema/{asset,catalog,platform}/**`,
`packages/persistence/**`, `packages/api-client/**`, `infrastructure/compose/**`,
`infrastructure/nginx/**`, `.env.example`, root manifests.

## C. Repository inventory (findings)

- **Controllers:** only `identity` (staff session/self) + `health`. No
  asset/catalog/publication controller exists.
- **Asset + catalog modules:** persistence `SCAFFOLD` only — domain repository
  interface + Drizzle repository + integration spec; no use case, OpenAPI
  operation, generated client operation, Admin/Storefront UI, or worker handler.
- **Worker:** `apps/worker/src/bootstrap/` lifecycle only — no claim loop, job
  handler, object-storage access, or concurrency config.
- **Object storage:** no adapter package, no MinIO/S3 compose service, no
  storage config in `.env.example`. `SYSTEM_ARCHITECTURE.md` §10 lists the
  concrete product as ADR-pending. → `IMP-O002 = ADR_REQUIRED`.
- **Job runtime:** DB-backed claim path fully pre-designed (`ADR-DB5-003`;
  `outbox_events` `FOR UPDATE SKIP LOCKED`; `background_job_attempts`;
  `idempotency_records`) but no runtime ADR; `.env.example` marks it "open
  decision". → `IMP-O003 = ADR_REQUIRED`.
- **Database:** all APP2 tables present (assets, asset_derivatives,
  asset_inspections, products, categories, product_media, product_variants,
  skus, product_sides, embroidery_areas, background_job_attempts, outbox_events,
  idempotency_records); lifecycle sets locked in schema; repositories expose the
  needed verbs. → **`NO_APP2_MIGRATION`**.
- **Figma:** approved today = APP1-D01 (13) + APP1-D02 (7) + DS catalog. No
  approved product-list/detail or Admin asset/catalog node; Homepage/Discover/
  Collections are DRAFT/REFERENCE_ONLY. → Admin `NEW`, Storefront list/detail
  `SUPPLEMENT`; one `APP2-D01` design package required.

## D. Decision / design / database findings

| Item | Classification | Evidence | Checkpoint |
|---|---|---|---|
| IMP-O002 object storage | `ADR_REQUIRED` | absence in arch §10, compose, env, packages | `APP2-DEC-STORAGE` (first) |
| IMP-O003 job runtime | `ADR_REQUIRED` | DB path pre-designed (ADR-DB5-003); no runtime ADR | `APP2-DEC-JOBS` |
| Worker logging/correlation (FU-A07) | narrow prerequisite | worker has no request context; IMP-D022 API-local | folded into `APP2-DEC-JOBS`, realized in `APP2-W01` |
| Database migration | `NO_APP2_MIGRATION` | all tables + lifecycle + repos present | none (optional `APP2-DB01` only if a proven gap) |
| Design | Admin `NEW` + Storefront list/detail `SUPPLEMENT`; shell/404 `REUSE` | registry query | `APP2-D01` (one package) |

## E. Corrected checkpoint map

17 checkpoints (was ~18 candidate; contract `C0x` merged into backend per
IMP-D019, prerequisites added). Acyclic; Admin leads Storefront; worker after
decisions; no frontend before `APP2-D01`; no backend checkpoint >5 endpoints
(B01=5, B02=5, B03=3, B04=2):

`APP2-PRE-AUDIT → DEC-STORAGE → DEC-JOBS → D01 → B01 → W01 → A01 → B02 →
A02 → A03 → B03 → A04 → B04 → S01 → S02 → E01 → X01`.

Full scope/predecessor table: audit §O and phase plan §6.1.

## F. First checkpoint recommendation

**`APP2-DEC-STORAGE`** — the deepest blocker: the asset intake API shape
(`APP2-B01`) and every asset/worker/publication/public-media path depend on the
storage contract. It resolves IMP-O002 (product/adapter, upload strategy, key
format, access/validation/size/checksum policy, MinIO parity, prod boundary).
It leaves `APP2-DEC-JOBS` (parallelizable), `APP2-D01`, and all B/A/S code
blocked. Allowed output: an ADR + status updates (no asset code; the compose
service + env keys land only in a later ADR-authorized implementation
checkpoint). Its execution prompt is not written (IMP-D014).

## G. Commit A evidence

| Field | Value |
|---|---|
| Commit A hash | `8643431b420d28b6eb8458bb3a87c936ca803280` |
| Subject | `docs(app2): audit assets and catalog publication entry` |
| Files changed | 6 (`+407 / -5`) |
| New | `docs/implementation/audits/APP2_PRE_IMPLEMENTATION_AUDIT.md` (360 lines) |
| Modified | `phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md`, `10-MASTER-APPLICATION-ROADMAP.md`, `11-TRACEABILITY-AND-STATUS-MATRIX.md`, `14-IMPLEMENTATION-DECISION-REGISTER.md`, `README.md` |
| Nature | docs/governance only — no source/schema/migration/Figma/generated/dependency |

## H. Validation matrix

Run from the audited tree before Commit A (all exit 0):

| Command | Exit | Result |
|---|---|---|
| `pnpm quality` | 0 | format/lint/typecheck/tests/file-size/styles/figma/boundaries/openapi/api-client/db-manifest |
| `pnpm check:openapi` | 0 | artifact up to date (unchanged) |
| `pnpm check:api-client` | 0 | generated tree up to date (`89c1aace…`) |
| `pnpm check:figma-design-index` | 0 | 39 registry IDs, 39 node rows, 6 tables |
| `node --test tools/check-figma-design-index.test.mjs` | 0 | 75/75 pass |
| `pnpm db:check:manifest` | 0 | all checks passed |
| `node tools/check-file-size.mjs` | 0 | pass (only pre-existing review-threshold notes) |
| `git diff --check` | 0 | clean |

Documentation validation: audit ≤360 lines (360); all proposed checkpoint IDs
unique; dependency graph acyclic; endpoint counts compliant (≤5); frontend
scopes bounded (one screen/capability); both open decisions have owners +
blocking points; no APP2 code or migration changed. Frozen baselines unchanged:
OpenAPI `ae015dd6…`, API-client `89c1aace…`, DB 31 migrations / 78 tables /
833 columns / `4ca56a59…`.

## I. Acceptance matrix

All 30 §29 criteria satisfied. Highlights: APP1 closure chain verified; APP2
plan read fully; asset/catalog/worker/storage inventory complete; DB readiness
mapped per behavior with explicit `NO_APP2_MIGRATION`; IMP-O002 and IMP-O003
classified `ADR_REQUIRED` with evidence; worker/FU-A07 readiness classified;
asset-security parameters identified without invention (routed to
`APP2-DEC-STORAGE`); lifecycle transitions mapped to DB authority; API
checkpoint counts ≤5; Admin/Storefront scopes bounded; design classification
evidence-based with no DRAFT promoted; APP1 follow-ups reconciled; testing
reuses canonical harnesses; corrected graph acyclic; Admin leads Storefront by
≤1 capability; first checkpoint exact (`APP2-DEC-STORAGE`); no implementation
prompt embedded; no source/schema/migration/Figma/dependency change; quality +
artifact checks pass; Commit A docs-only; this report evidence-only; exactly two
commits; APP2 product engineering not started.

## J. Scope confirmation

The audit and this report changed no implementation source, test, Figma
artifact, schema, migration, generated file, or dependency. Commit A added the
audit + corrected checkpoint map and reconciled decision-register/roadmap/
traceability/README status. This Commit B adds only this evidence report.

## K. Evidence closure

**`APP2-PRE-AUDIT` = `COMPLETE — PASS_WITH_REQUIRED_DECISIONS`.** APP2 =
`NOT_STARTED` (engineering); first checkpoint `APP2-DEC-STORAGE`. Two ADR
decisions (`APP2-DEC-STORAGE`, `APP2-DEC-JOBS`) + one design package
(`APP2-D01`) gate all APP2 code; `NO_APP2_MIGRATION`. Working tree clean after
Commit A; not pushed.
