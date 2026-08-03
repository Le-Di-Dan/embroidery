# APP3-G01 — Completion report

**Checkpoint:** `APP3-G01` — Product placement and side-media authority
**Verdict:** `COMPLETE — REVIEW_DELIVERED` · **Date:** 2026-08-03
**Branch:** `production` · **Entry HEAD:** `b8e343e6e615f62ffe4ab500073023780559dda7`

---

## A. Verdict

The first APP3 execution checkpoint. Seven Product Owner rulings are locked as
**IMP-D041**, the APP3 dependency map is reconciled, and a mechanical gate
(`pnpm check:app3-g01`) recomputes every ruled fact from the repository.

**No application source, schema, migration, OpenAPI operation, generated client,
Figma node or dependency was changed.** The gate asserts that absence rather than
assuming it.

## B. Entry state

| Fact | Value |
|---|---|
| Branch | `production` |
| Entry HEAD | `b8e343e6e615f62ffe4ab500073023780559dda7` — `docs(app2): record chronology guard closure` |
| `origin/production` | `8b5f3b0279b1920babd05b52014af3b853f526c0` (unchanged, nothing pushed) |
| Tracked/staged tree at entry | clean |
| Accepted APP2 closure commit | `8b5f3b0279b1920babd05b52014af3b853f526c0` |

Accepted entry authority held: `APP2 = COMPLETE — PASS_WITH_FOLLOW_UPS —
REVIEW_ACCEPTED`, `APP2-X01-C1` and `APP2-X01-C2` = `COMPLETE — REVIEW_ACCEPTED`,
`APP3-PRE-IMPLEMENTATION-AUDIT = COMPLETE — REVIEW_ACCEPTED_AFTER_CORRECTION`,
`APP3 = AUDITED — READY_FOR_FIRST_GATE`, `APP3-G01 = READY — NOT STARTED`.

Preflight: `check:app2-closure` PASS, 40/40 + 12/12 closure suites,
`check:figma-design-index` 96/96/13, `db:check:manifest` PASS,
`pnpm quality` `EXIT 0`.

## C. Repository evidence

Read-only inspection, exact paths and symbols:

| Evidence | Path / symbol | Finding |
|---|---|---|
| Side geometry | `packages/database/src/schema/catalog/product-sides.ts` | `background_asset_id` (`NOT NULL`, FK → `assets`), `image_width_px`, `image_height_px`, `physical_width_mm`, `physical_height_mm`, `px_per_mm`, `display_order`, `name` |
| Area geometry | `packages/database/src/schema/catalog/embroidery-areas.ts` | `bound_x_px`, `bound_y_px`, `bound_width_px`, `bound_height_px`, `max_width_mm`, `max_height_mm`, `display_order`, `name` |
| **Retirement authority** | both files | **absent** — no active/retired flag, no supersession pointer, no stable code, no lock column |
| Media roles | `packages/database/src/schema/catalog/product-media.ts` | `PRODUCT_MEDIA_ROLES = ['GALLERY','THUMBNAIL','DETAIL']` — no side-background role |
| Derivative kinds | `packages/database/src/schema/asset/asset-derivatives.ts` | `PREVIEW_WATERMARKED / MOCKUP / NORMALIZED / THUMBNAIL / CATALOG_PREVIEW` — none approved for side backgrounds |
| Session placement | `packages/database/src/schema/design/design-sessions.ts` | `product_side_id` and `embroidery_area_id` both `NOT NULL` |
| Template scope | `packages/database/src/schema/design/design-templates.ts` | scope is on the **header** (nullable); `design_template_versions` holds only the document |
| Approval scope | `packages/database/src/schema/design/approval-snapshots.ts` | references both ids `NOT NULL` |
| Placement writes | `apps/api/src/modules/catalog/infrastructure/persistence/drizzle-product.repository.ts` | inserts/reads sides and areas |
| Admin surface | `apps/api/src/modules/catalog/presentation/schemas/admin-product.request.ts` | **no** side or area field |
| Public surface | `packages/contracts/openapi/openapi.generated.json` | 16 paths, **zero** placement/side/embroidery/design operations |
| Route authority | `tools/check-storefront-route-authority.mjs`, `apps/storefront/src/app/` | `/kham-pha`, `/san-pham/[slug]`; no Studio route exists |

## D. The seven rulings

Recorded verbatim in `IMP-D041` and in the phase plan §6.4.2, summarised here.

**PO-01 — authoring owner.** Placement is **Product aggregate** authority, authored
only by authenticated **Admin** through **`APP3-A01`**, in the **Product/Catalog**
module. Design Template, Design Session and Storefront code may reference it and
may never create or mutate it.

**PO-02 — public read contract.** One **read-only manifest** for a publicly
visible Product: id/slug, `studioEligible`, ordered active sides (id, stable
code/name, display order, image px, physical mm, `px_per_mm`, a dedicated
background-delivery reference) with ordered active areas (id, stable code/name,
display order, origin, extent, physical maxima when present). No private original
URL, no storage key, no customer-private data, no mutation field. IDs are opaque,
never authorization tokens. Incomplete placement → **`studioEligible = false`**,
never fabricated geometry. Owner **`APP3-B01`**.

**PO-03 — background association and delivery.** Canonical association is
**`product_sides.background_asset_id`**; side backgrounds are **not** duplicated
into `product_media`. One dedicated public delivery operation owned by
**`APP3-B02`**: published Product + active Side + `background_asset_id` →
approved browser-safe derivative. Originals never delivered; the side must belong
to the addressed Product; archived/unpublished Products and retired sides are not
deliverable. **The derivative kind stays owned by `APP3-G04`**, so `APP3-B02` is
blocked by **both** gates and `CATALOG_PREVIEW` / `NORMALIZED` /
`PREVIEW_WATERMARKED` remain unapproved for this purpose.

**PO-04 — customer selection.** One active side auto-selects; multiple are
customer-selected; same for areas on the selected side. Deterministic initial
choice is the first active row by `display_order` with a stable tie-breaker. The
chosen ids persist on the Design Session, and a customer may never submit ids
outside the validated Product → Side → Area chain.

**PO-05 — canonical Studio route.** **`/san-pham/[slug]/thiet-ke`**, extending
`/san-pham/[slug]` (IMP-D039). Side/area ids are **not** path authority. Server
shell + lazy client-only Studio. `/studio`, `/editor`, `/thiet-ke/[id]` rejected.
The existing route-authority mechanism is extended, not duplicated by a competing
checker.

**PO-06 — publication versus Studio eligibility.** Global publication **does not**
require placement and **no publication guard requiring it may be added**. Studio
eligibility is separately derived: published Product + ≥1 active Side + that side
has ≥1 active Area + an eligible approved background. Detail stays public while
the Studio CTA is absent; existing catalogs need **no grandfathering**.

**PO-07 — referenced mutability.** Mutable only before first reference. Once
referenced by a Design Template version or a non-terminal Design Session, the
parent relationship, stable code, background asset, pixel and physical
dimensions, `px_per_mm`, area origin, extent and maxima become **immutable**, and
the row can **never be hard-deleted**. Change = **replacement row**; the old row
is retired from selection and retained for history. Display text and ordering may
change only where identity, geometry and historical rendering are unaffected.

> **Schema fact refining PO-07 (recorded, ruling unchanged).** Template scope
> lives on the `design_templates` **header**, not on `design_template_versions`,
> so a template reference is a header reference. `approval_snapshots` also
> references both ids `NOT NULL` — a third reason a referenced row can never be
> hard-deleted.

## E. Existing-data measurement

Re-run read-only against the migrated development database
(`embroidery-dev-postgres-1`, PostgreSQL 16.14, 33 migrations). **No insert,
update, delete or backfill.**

```sql
select
  (select count(*) from products)                                   as products_total,
  (select count(*) from products where status = 'PUBLISHED')        as published,
  (select count(*) from products where status = 'DRAFT')            as draft,
  (select count(*) from products where status = 'ARCHIVED')         as archived,
  (select count(*) from products p where p.status = 'PUBLISHED'
     and not exists (select 1 from product_sides s
                      where s.product_id = p.id))                   as published_zero_sides,
  (select count(*) from product_sides)                              as sides_total,
  (select count(*) from product_sides s
     where not exists (select 1 from embroidery_areas a
                        where a.product_side_id = s.id))            as sides_zero_areas,
  (select count(*) from embroidery_areas)                           as areas_total,
  (select count(*) from design_templates)                           as templates_total,
  (select count(*) from design_template_versions)                   as template_versions_total,
  (select count(*) from design_sessions)                            as sessions_total,
  (select count(*) from design_sessions
     where status not in ('DELETED','EXPIRED'))                     as nonterminal_sessions;
```

| Metric | Value |
|---|---|
| products total | 29 (`PUBLISHED` 0, `DRAFT` 26, `ARCHIVED` 3) |
| published products with zero sides | 0 |
| `product_sides` | **0** |
| sides with zero areas | 0 |
| `embroidery_areas` | **0** |
| `design_templates` / `design_template_versions` | 0 / 0 |
| `design_sessions` / non-terminal | 0 / 0 |
| template-version references to sides/areas | 0 (scope is on the header) |
| non-terminal session references to sides/areas | 0 |

Not one placement row has ever been created, because no code path can create one.
This is a **development** database with zero published products and is not an
authoritative production catalog. Under PO-06 that costs nothing: absent placement
never required a publication backfill, and `APP3-B01` will re-measure against
whatever environment is authoritative at implementation time.

## F. Decision and authority

Next free register ID computed from `14-IMPLEMENTATION-DECISION-REGISTER.md`
(highest existing `IMP-D040`) → **`IMP-D041`**, `LOCKED`, carrying all seven
rulings, their consequences and the supersession rule.

```text
G01_DB_DISPOSITION = REQUIRES_APP3_DB01
```

Measured, not asserted. Of the four candidate migration paths the pre-audit
listed for `G01`, **three were not taken**: the association stays on
`product_sides.background_asset_id` rather than a new `product_media.role`; the
background derivative kind is deferred to `APP3-G04`; and PO-02 makes the
manifest a **public** read, so no anonymous-session grant is needed and
`secure_access_grants` is untouched. The fourth is binding — PO-02 needs *active*
rows and a *stable code*, PO-07 needs retirement-without-deletion, and neither
placement table carries an active/retired flag, supersession pointer, stable code
or lock column.

`APP3-G01` implements no migration. `APP3-DB01` stays conditional in **scope**,
not in existence: it runs as one combined forward-only migration once `APP3-G02`
and `APP3-G04` add or withhold their contributions. The collective disposition
**cannot** terminate `NOT_REQUIRED — GATE_RESOLVED` unless PO-07 is explicitly
superseded by later human authority. Audit §H and phase §6.1 are reconciled to
say exactly this.

## G. Dependency reconciliation

| Checkpoint | Status |
|---|---|
| `APP3-G01` | `COMPLETE — REVIEW_DELIVERED` |
| `APP3-G02` | `READY — NOT STARTED` |
| `APP3-G03` | `NOT STARTED` |
| `APP3-G04` | `NOT STARTED` |
| `APP3-P02` | `READY` for geometry foundation work not requiring `APP3-G04` |
| `APP3-B01` | `READY — NOT STARTED` |
| `APP3-B02` | `BLOCKED_BY_APP3_G04` |
| `APP3-A01` | `PLANNED — BLOCKED_BY_APP3_D01_AND_APP3_B01` |
| `APP3-D01` placement portion | `UNBLOCKED_BY_G01`, checkpoint not started |
| `APP3-DB01` | `CONDITIONAL — AWAITING_G02_AND_G04_CONTRIBUTIONS` |

No implementation checkpoint is marked complete.

## H. Changed files

Commit A — `1e037b45dd7187876daa85bcba32f66bf5e3b66a`, 9 files:

```text
docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md   IMP-D041
docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md  §6.4 ruling + facts +
                                                             dependencies; §6.1 and §10 reconciled
docs/implementation/audits/APP3_PRE_IMPLEMENTATION_AUDIT.md  §H and §P answered by the ruling
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md         APP3 status row
docs/implementation/11-TRACEABILITY-AND-STATUS-MATRIX.md     APP3-G01 pointer
docs/implementation/13-PHASE-SOURCE-MAP.md                   IMP-D041 as an APP3 source
tools/check-app3-g01.mjs                                     NEW — 399 lines
tools/check-app3-g01.test.mjs                                NEW — 278 lines
package.json                                                 check:app3-g01 registration
```

No `apps/`, `packages/`, `spikes/`, `infrastructure/`, `docs/design/`, schema,
migration, OpenAPI artifact, generated client, lockfile or dependency change.

**Disclosed:** `package.json` also adds `check:app3-g01` to the `quality` chain,
the same way every sibling authority gate (`check:app2-closure`,
`check:storefront-route-authority`, `check:pagination-authority`) is registered. A
gate outside the chain never runs and rots; this is registration, not new scope.

## I. Checker behaviour

`tools/check-app3-g01.mjs` recomputes rather than reads. It parses the phase
plan's bounded fact and dependency tables, the decision register row, the real
Drizzle schema sources, the APP2 route authority and the committed OpenAPI
artifact, and reuses `checkNextPhaseChronology` instead of re-implementing it.
Read-only, no network, no database.

Sixteen invariants: decision present/unique/`LOCKED` with all seven rulings;
20 ruled facts exact; canonical Studio route and its extension of the detail
route; publication and Studio eligibility separate; `background_asset_id`
canonical; no prose or schema role promoting `product_media`; derivative kind
still `APP3-G04`'s; Admin authoring via `APP3-A01`; selection rules complete;
immutability and no-hard-delete recorded; `REQUIRES_APP3_DB01`; the 8 dependency
rows; no implementation claimed; **placement schema fields still present**;
**no APP3 placement OpenAPI operation exists**; APP2 chronology still valid.

Two checker defects the tests caught and I fixed before delivery, both worth
recording because both would have made the gate lie:

1. **Claim detection ran per line.** Markdown hard-wraps, so
   `…rather than a new` / `` `product_media.role` `` split across a line break and
   the second half read as a claim. It now reads **sentences**.
2. **Emphasis stripping removed underscores**, turning `product_media` into
   `productmedia` — which silently disabled the very check that hunts for it.
   Underscores are now kept; only `*` and backticks are stripped.

## J. Test matrix

`node --test tools/check-app3-g01.test.mjs` — **25/25 pass**, 278 lines (one file;
the pre-authorized second file was not needed).

| Group | Cases |
|---|---|
| Baseline | repository passes; 20 facts and 8 dependency rows parse; a wrapped denial is read as a denial; real Drizzle columns parse |
| Ruling dropped or altered | ruling missing from the decision row; decision id missing; decision id duplicated; wrong Studio route; Studio route not extending the detail route; publication made placement-dependent; Studio-eligibility requirement dropped; `product_media` made the canonical association; prose promoting `product_media`; a derivative kind selected by G01; incomplete selection rules; referenced placement left mutable; hard delete allowed; DB disposition not required; dependency overclaimed; ruling table removed |
| Repository facts move | a relied-upon placement column removed; **an APP3 placement OpenAPI operation appearing**; a `SIDE_BACKGROUND` media role appearing; the accepted detail route lost from APP2 authority; APP2 chronology failure propagating |

## K. Validation

Every command run on `production`.

| Command | Result |
|---|---|
| `pnpm check:app3-g01` | **PASS** — `IMP-D041; 20 facts, 8 dependency rows; Studio route /san-pham/[slug]/thiet-ke; REQUIRES_APP3_DB01; no APP3 placement operation exists` |
| `node --test tools/check-app3-g01.test.mjs` | **25/25 pass** |
| `pnpm check:app2-closure` | PASS — `APP3 chronology valid` |
| `node --test tools/check-app2-closure.test.mjs` | 40/40 pass |
| `node --test tools/check-app2-closure-chronology.test.mjs` | 12/12 pass |
| `pnpm check:secrets` | PASS — 372 documents, 1824 tracked files |
| `pnpm check:lifecycle` | PASS |
| `pnpm check:openapi` | PASS — artifact up to date |
| `pnpm check:api-client` | PASS — tree hash `7524fc91…8ecf5a2` |
| `pnpm check:figma-design-index` | PASS — 96 / 96 / 13 |
| `node --test tools/check-figma-design-index.test.mjs` | 31/31 pass |
| `pnpm db:check:manifest` | PASS — 78 tables / 833 columns / 211 indexes |
| `pnpm check:spike-boundaries` | PASS |
| `pnpm spike:editor:check` | PASS |
| `node tools/check-file-size.mjs` | PASS — 0 hard-limit violations (399 / 278) |
| `pnpm quality` | **`EXIT 0`** |
| `git diff --check` | clean |

## L. Commits

```text
Commit A: 1e037b45dd7187876daa85bcba32f66bf5e3b66a
          docs(app3): lock product placement authority

Commit B: docs(app3): record APP3-G01 evidence
```

Commit B's own hash is not recorded here — this report ships inside it. Resolve
it with `git log -1 --format=%H`. No prior commit was amended, squashed, rebased
or rewritten.

## M. Final statuses

```text
APP3-G01 = COMPLETE — REVIEW_DELIVERED
APP3     = IN PROGRESS — FIRST GATE DELIVERED_FOR_REVIEW
APP3-G02 = READY — NOT STARTED
```

`APP3-G01` is **not** marked `REVIEW_ACCEPTED` — human review owns that
transition.

## N. Scope confirmation

Working tree clean after Commit B. `evidences/` is git-ignored and untouched.
**Nothing was pushed** — `origin/production` remains at `8b5f3b0…`.

**No application source, database schema, migration, API operation,
OpenAPI artifact, generated client, Figma node, spike, infrastructure, lockfile
or dependency was created or modified.** The only non-documentation files are the
new gate, its tests, and the `package.json` line that registers them.

`APP3-G02`, `APP3-P02`, `APP3-B01`, `APP3-D01`, `APP3-A01` and `APP3-DB01` were
**not** started, and no execution prompt was written for any of them.
