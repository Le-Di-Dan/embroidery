# APP3-B01 — Completion Report

**Checkpoint:** `APP3-B01` — Product placement authoring and public manifest backend
**Date:** 2026-08-04
**Branch:** `production`
**Entry HEAD:** `fb1dcbd` (`docs(app3): record APP3-P02 correction evidence`)
**Commit A:** `093be571f35109ad1c903e77dfa8e6e9c4c3f078`
**Directive:** CLAUDE EXECUTION PROMPT — APP3-B01

---

## 1. Accepted entry

```text
APP3-G01/G02/G03/G04 = COMPLETE — REVIEW_ACCEPTED
APP3-DB01 = COMPLETE — REVIEW_ACCEPTED
APP3-F01 = COMPLETE — REVIEW_ACCEPTED
APP3-P01 = COMPLETE — REVIEW_ACCEPTED
APP3-G05/G05-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-P02/P02-C1 = COMPLETE — REVIEW_ACCEPTED
APP3-B01 = READY — NOT STARTED
```

Branch `production`, clean tree at entry, and `check-app3-g01`,
`check-app3-db01`, `check-app3-g04`, `check-app3-p02`, `pnpm format:check` and
`pnpm lint` all PASS before any edit. `IMP-D041`…`IMP-D045`, `ADR-APP0-001` and
`ADR-DB1-012` are preserved and unmodified.

## 2. Approved narrow-scope deviation

```text
APPROVED_NARROW_SCOPE_DEVIATION = API_WORKSPACE_DEPENDENCY_WIRING
```

§3 requires reusing `@embroidery/design-engine`; §7 forbids `dependencies`,
`apps/api/package.json` and `pnpm-lock.yaml`. `apps/api` could not resolve the
package, so the two instructions could not both hold. The conflict was raised
before any code was written and resolved by explicit authorisation to add the
workspace link only.

| Proof | Result |
|---|---|
| New external package | none — one `link:` importer entry |
| New `resolution:` entry | none |
| Version upgrade | none |
| Unrelated importer change | none |
| Root `package.json` change | none |
| Lockfile delta | **+3 lines**, updated only through `pnpm install` |

```diff
       '@embroidery/database':
         specifier: workspace:*
         version: link:../../packages/database
+      '@embroidery/design-engine':
+        specifier: workspace:*
+        version: link:../../packages/design-engine
```

## 3. Preflight measurements

Read-only, against the persistent development database. Nothing was mutated.

| Measurement | Value |
|---|---|
| `products` | 29 |
| `products` PUBLISHED | 0 |
| `product_sides` | 0 |
| `embroidery_areas` | 0 |
| products with ≥1 side | 0 |
| `assets` CATALOG_MEDIA/ACCEPTED | 0 |
| `asset_derivatives` total / NORMALIZED | 2 / 0 |
| `design_templates` / `design_sessions` / `approval_snapshots` | 0 / 0 / 0 |

**Finding — the development database is one migration behind.** 33 of 34
migrations are applied; `0034_add_app3_placement_and_derivative_authority`
(APP3-DB01) is **not**, so `product_sides` still carries no `code`, `retired_at`
or `superseded_by_id`. This is a local operator action, not a code defect —
applying it would mutate the persistent database, which §2 forbids — and it does
not affect this checkpoint's evidence: every integration suite provisions a
**disposable** database and applies all 34 migrations. It is recorded so the
operator runs `pnpm db:migrate` before exercising placement locally.

**Finding — the API did not typecheck at entry.** `APP3-DB01` made
`product_sides.code` and `embroidery_areas.code` `NOT NULL`, but the DB7 seam
`drizzle-product.repository.ts` still inserted without them; `tsc --noEmit`
failed with two `TS2769` errors on the commit this checkpoint started from
(confirmed by stashing this work and re-running). Both files are inside
`apps/api/src/modules/catalog/**` and are the placement authoring seam this
checkpoint owns, so `code` was added to `AddSideInput`/`AddAreaInput`, the two
inserts and the DB7 integration fixture. Without it nothing here could compile.

## 4. Delivered HTTP surface

| Method and path | Generated operation id | Auth |
|---|---|---|
| `GET /api/admin/products/{productId}/placement` | `adminProductPlacement_get` | `adminSession` |
| `PUT /api/admin/products/{productId}/placement` | `adminProductPlacement_replace` | `adminSession` + `StaffOriginGuard`, `StaffJsonBodyGuard` |
| `GET /api/public/products/{slug}/placement` | `publicProductPlacement_get` | anonymous (no `security`) |

The ids are **derived**, not declared: `createOperationId` builds
`<controller minus Controller, lower-cased>_<method>`, so the class and method
names are the contract. All three match the expected logical ids exactly.

No individual side or area operation, no media stream, no presign, no asset
upload, no Template operation and no Session operation exists.

## 5. Architecture

| Layer | File |
|---|---|
| Module | `catalog-placement.module.ts` |
| Policy | `domain/product-placement.policy.ts` |
| Errors | `domain/product-placement.errors.ts` |
| Repository port | `domain/repositories/product-placement.repository.ts` |
| Drizzle adapter | `infrastructure/persistence/drizzle-product-placement.repository.ts` |
| Row mapper | `infrastructure/persistence/product-placement-row.mapper.ts` |
| Plan (pure) | `application/product-placement.plan.ts` |
| Geometry seam | `application/product-placement-geometry.ts` |
| Service | `application/product-placement.service.ts` |
| Query | `application/product-placement.query.ts` |
| Projection | `application/product-placement.projection.ts` |
| Controllers | `presentation/admin-product-placement.controller.ts`, `presentation/public-product-placement.controller.ts` |
| Schemas | `presentation/schemas/admin-product-placement.request.ts`, `presentation/schemas/product-placement.response.ts` |

Placement is Catalog's (IMP-D041 PO-01): no Design module is imported, and the
module graph is acyclic by construction rather than by care. The background
**association** is validated through the Asset module's public repository port
(`lockScopedByIds`, a `FOR SHARE` read so an asset cannot leave `ACCEPTED`
between validation and commit). The public **eligibility** predicate is the one
SQL exception, for the reason `drizzle-public-product.repository.ts` already
established: it must be a correlated `EXISTS` inside the side query or a Product
with six sides becomes seven round trips, and it selects a boolean rather than
any asset fact. No Drizzle type crosses the port.

## 6. Replace semantics and concurrency

A row carrying an `id` is retained and updated; one without an `id` is created;
one that is **omitted is retired**, never deleted. A new row may name the row it
replaces through `supersedesId`, within the same parent only, and that row is
retired with `superseded_by_id` pointing at it. An empty `sides` list retires the
whole placement — legitimate, because publication never required placement
(PO-06).

Only the columns whose value actually **differs** are written, and numerics are
compared by value: `5.0` and `5` are the same scale, and treating them as a
change would make an untouched referenced side fail the protection guard on
every save.

**Concurrency.** The repository was inspected: `product_sides` and
`embroidery_areas` carry no revision token of their own, but the parent
`products.updated_at` is the existing one `APP2-B02`/`B03` already use. The
replace opens with

```sql
UPDATE products SET updated_at = now()
 WHERE id = $1 AND updated_at = $2 RETURNING …
```

which in one statement proves the caller's token is current, takes the row lock
that serialises a second replace of the same Product for the rest of the
transaction, and advances the token so a stale write arriving later is refused.
No schema column was added. The live race test asserts that of two concurrent
replaces exactly one commits and the other is **refused**, never applied on top
of a state it never read — so the stop condition did not fire.

**DB01 protection.** A referenced row's identity and geometry are refused by
`tg_*__protected_guard`; display copy and ordering are allowed; a hard delete is
rejected by the database whatever asked for it. The `23000` SQLSTATE is
translated into `PLACEMENT_REFERENCED_IMMUTABLE` and the driver's own message —
which names the table and the offending columns — is discarded. Nothing catches
a guard and retries by deleting and re-inserting; there is no `delete` in the
placement repository at all.

## 7. Geometry, delegated

`product-placement-geometry.ts` is the only file that touches geometry, and it
computes none. `validateProductSideScaleConsistency`, `containsBounds` and
`rectToBounds` come from `@embroidery/design-engine`; the temptation removed is a
two-line `width / mm` check written inline "because it is obvious". It is
obvious and it is also a second authority: the engine reports **both** axes
rather than averaging them, compares exactly on the quantized grid rather than
with a tolerance, and treats a boundary-flush area as contained. The gate refuses
a px/mm expression anywhere else in the feature.

## 8. Public manifest and `studioEligible`

Anonymous, keyed by Product slug, reusing the catalogue's own visibility
predicate — an unknown slug, a draft, an archived product and one in a non-public
category all collapse to the same `PUBLIC_PRODUCT_NOT_FOUND`, so nothing can be
enumerated. Retired sides and areas are excluded **in the SQL**.

`studioEligible` is derived and true only when one side has:

- at least one active Embroidery Area, **and**
- a `background_asset_id` resolving to an `ACCEPTED`, un-tombstoned
  `CATALOG_MEDIA` asset with a `READY` `NORMALIZED` unwatermarked derivative
  carrying a storage key **and** all four of `width_px`, `height_px`,
  `media_type`, `byte_size`.

Areas on one side and a usable background on another give `false`, because
nothing could actually be designed. Incomplete or unprocessed placement gives
`false` and never fabricated geometry. Dimensions come from `asset_derivatives`;
**no object-storage call exists** anywhere in the feature.

The manifest carries no `backgroundAssetId`, `retiredAt`, `supersededById`,
storage key, checksum, original or derivative URL, inspection detail or mutation
field — asserted against the committed OpenAPI document, the runtime projection
and a live response. A background is addressed by
`{ productSlug, sideCode }` and by **no URL**: `APP3-B02` owns that route and has
not been built, so composing an address here would publish one that does not
resolve.

`APP3-B01` streams and presigns nothing and does **not** close
`FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01`, which stays `OPEN — FINAL_OWNER_APP3-B02`.

## 9. OpenAPI and generated client

| Metric | Before | After |
|---|---|---|
| Paths | 16 | 18 |
| Operations | 19 | 22 |
| Schemas | 34 | 42 |
| OpenAPI SHA-256 | `c2c3b874ba6a3a77680e373a67c288b43580e549090c3fbc6075efbd66b84ee8` | `7720c2d68f413502028c40513562345dc1d1b632a3da3b2b9f1d3f6394e574cd` |
| Client tree hash | `63ba3fe4d793085582157a8ecd8866a955947381` (git tree) | `595bed36ea8fbedc9cdc8052f5fa58f185d7a95b3ebe249af8494f0122f7e000` |

Exactly three operations and eight bounded schemas
(`AdminProductPlacementResponse`, `AdminPlacementSideResponse`,
`AdminPlacementAreaResponse`, `PublicProductPlacementResponse`,
`PublicPlacementSideResponse`, `PublicPlacementAreaResponse`,
`PublicPlacementBackgroundResponse`, `ReplaceProductPlacementBody`). Both
artifacts were regenerated by their canonical commands and never hand-edited;
`openapi:check` and `check:generated` both report up to date.

## 10. Tests

| Suite | Count |
|---|---|
| `product-placement.policy.spec.ts` | 8 |
| `product-placement.plan.spec.ts` | 26 |
| `product-placement.projection.spec.ts` | 12 |
| `product-placement.contract.spec.ts` | 13 |
| `product-placement.integration.spec.ts` (live PostgreSQL) | 22 |
| `product-placement-manifest.integration.spec.ts` (live PostgreSQL) | 17 |
| `tools/check-app3-b01.test.mjs` | 27 |
| **Placement total** | **125** (98 in the API, 27 in the gate) |
| Whole catalog module (19 suites) | 279 |

Commit A's message says "99 tests (34 unit, 26 projection/contract, 39
live-database)"; the measured split is **59 unit/contract + 39 live-database =
98**. The table above and the roadmap carry the corrected figures. The commit was
not amended, because amending is forbidden and the message is not authority.

Every item in §6 of the directive is covered. The cases worth naming:

- **the same code on two different sides is accepted** — identity is per parent,
  and a global rule would make `front` unusable after the first product;
- **an area flush with the canvas edge is accepted** — rejecting it would make
  the last usable column of pixels unreachable;
- **a numerically equal measurement plans no update** — otherwise a referenced
  side fails the protection guard on a save that changed nothing;
- **under one claiming group the element fits and under the other it does not** —
  the containment case that makes the eligibility split matter;
- **a hard delete of a referenced side is rejected by the database itself**,
  asserted with raw SQL rather than through the API;
- **two concurrent replaces**: exactly one `fulfilled`, one `rejected`, one row.

## 11. Gate

`node tools/check-app3-b01.mjs` (371 lines) with 27 regressions (369 lines). It
asserts, against the **committed** artifact rather than one rebuilt in process:
exactly three operations at the ruled paths with the ruled ids; the Admin/public
authentication split in both directions; no private field in any public schema;
the retired-row filters as expressions; Catalog ownership with no Design import
and no object-storage or decoder token; `background_asset_id` still `NOT NULL`;
every clause of the eligibility predicate including all four quartet columns, the
unwatermarked requirement and the tombstone check; `NORMALIZED` as the
editor-safe kind and SVG as the refused source; the design-engine delegation and
the absence of a local px/mm expression; the `23000` translation and the absence
of any `delete`; the regenerated client; the three indexed commands; and the root
script count still **30**. It chains `check-app3-p02`, which chains G05 → P01 →
F01/DB01 → G04 → G03 → G02 → G01.

## 12. Scoped validation

```text
pnpm --filter @embroidery/api exec tsc --noEmit           → PASS
pnpm --filter @embroidery/api build                       → PASS
pnpm --filter @embroidery/api openapi:generate            → 18 paths / 22 operations / 42 schemas
pnpm --filter @embroidery/api openapi:check               → up to date
pnpm --filter @embroidery/api-client generate             → 2 files, tree 595bed36…
pnpm --filter @embroidery/api-client check:generated      → up to date
pnpm --filter @embroidery/api-client typecheck            → PASS
pnpm --filter @embroidery/api-client test                 → 44 + 7
pnpm --filter @embroidery/api exec jest src/modules/catalog → 279/279, 19 suites
pnpm --filter @embroidery/api exec jest --runInBand test/integration/product-placement*.integration.spec.ts → 39/39
pnpm --filter @embroidery/design-engine typecheck         → PASS
node tools/check-app3-b01.mjs                             → PASS
node --test tools/check-app3-b01.test.mjs                 → 27/27
node tools/check-app3-p02.mjs                             → PASS
node --test tools/check-app3-p02.test.mjs                 → 38/38
node tools/check-app3-g01.mjs                             → PASS
node --test tools/check-app3-g01.test.mjs                 → 27/27
node tools/check-app3-db01.mjs                            → PASS
node --test tools/check-app3-db01.test.mjs                → 39/39
node tools/check-app3-g04.mjs                             → PASS
pnpm format:check                                         → PASS
pnpm lint                                                 → PASS (23 tasks)
git diff --check                                          → clean
```

`pnpm quality` was not run. No root test, E2E, worker suite, full database suite,
Figma, benchmark or full-regression command was run, and no command was
backgrounded.

## 13. Changed files

**New — 21 files.** Twelve placement source files, four specs, two live-database
suites, one test fixture, and the gate plus its tests. Largest source file: the
Drizzle adapter at 363 lines; largest test file: the authoring integration suite
at 457. Every file is within the 400/600 limits.

**Modified — 20 files.**

| File | Change |
|---|---|
| `apps/api/package.json` | the approved workspace link only |
| `pnpm-lock.yaml` | +3 lines, one importer entry |
| `apps/api/src/bootstrap/app.module.ts` | composes `CatalogPlacementModule` |
| `…/domain/repositories/product.repository.ts` | `code` on `AddSideInput`/`AddAreaInput` (§3 finding) |
| `…/persistence/drizzle-product.repository.ts` | writes `code` on both inserts |
| `…/tests/integration/catalog-persistence.integration.spec.ts` | supplies `code` |
| `packages/contracts/openapi/openapi.generated.json` | regenerated |
| `packages/api-client/src/generated/*` | regenerated |
| `tools/check-app3-g01.mjs` + `.test.mjs` | mode-aware (below) |
| `tools/check-app3-db01.mjs` + `.test.mjs` | mode-aware (below) |
| `docs/implementation/**` | phase §6.14, roadmap, source map, command index |

`11-TRACEABILITY-AND-STATUS-MATRIX.md` was inspected and **not** changed: it
records current status once, in the roadmap, and deliberately does not duplicate
per-checkpoint values.

## 14. Disclosed deviation — two gates became mode-aware

`tools/check-app3-g01.mjs` and `tools/check-app3-db01.mjs` (and their tests) are
outside §7's allowed list and had to change. Both asserted that **no APP3
placement operation exists** — true while each was the frontier, and false the
moment this checkpoint carried out G01's own PO-02 ruling. The mandated
`node tools/check-app3-g01.mjs` and `node tools/check-app3-db01.mjs` would
otherwise have failed.

Neither absence was weakened. Each now accepts exactly **two consistent worlds**
and refuses every mixture:

- **before B01** — no placement path, and the phase plan does not record
  `APP3-B01 = COMPLETE`;
- **after B01** — only the two ruled paths, and the plan records it.

A path with the wrong id, a third placement path, a delivered checkpoint whose
operation has since disappeared, or either half without the other all fail. Three
new regressions in the G01 suite and two in the DB01 suite prove each branch
fires. This is the same correction `APP3-F01` needed at P01 and `APP3-G05` needed
at P02; it is now a recorded pattern rather than a surprise.

## 15. What did not change

- **No database schema and no migration.** Migration 0034 is used, not modified.
- `packages/design-document` and `packages/design-engine` source — untouched.
- No worker, Admin app, Storefront, infrastructure, spike, Figma or
  `docs/design/**` change; no new external dependency; no root `package.json`
  change (still **30** scripts).
- `IMP-D041`…`IMP-D045`, `ADR-APP0-001` and `ADR-DB1-012` are unmodified, and no
  new decision id was created.
- No side-background byte is streamed or presigned;
  `FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01` is not closed.

## 16. Status

```text
APP3-B01 = COMPLETE — REVIEW_DELIVERED
APP3 = IN PROGRESS — PLACEMENT BACKEND DELIVERED_FOR_REVIEW
APP3-P02 = COMPLETE — REVIEW_ACCEPTED
APP3-B02 = BLOCKED_BY_APP3-B06
APP3-A01 = BACKEND_READY_BY_APP3-B01 — BLOCKED_BY_APP3-D01
APP3-D01 placement portion = BACKEND_CONTRACT_AVAILABLE_BY_APP3-B01
FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 = OPEN — FINAL_OWNER_APP3-B02
```

Human review owns:

```text
APP3-B01 = COMPLETE — REVIEW_ACCEPTED
```

**Commit B carries one file beyond the report.** §8 prefers the report alone;
the roadmap's test count was corrected from `99` to the measured `98` in the same
commit rather than left wrong, because the roadmap is the durable status record
and Commit A may not be amended.

The working tree is clean and nothing has been pushed; `origin/production`
remains at `8b5f3b0`. No `APP3-B02`, `APP3-B06`, `APP3-W01`, `APP3-D01`,
`APP3-A01` or Studio work was started.
