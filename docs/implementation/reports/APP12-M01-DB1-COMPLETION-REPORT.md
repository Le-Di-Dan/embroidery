# APP12-M01.DB1 — Product-media database invariants and the 20-image cap

`APP12-M01.DB1 = COMPLETE`

Internal work package inside the single `APP12-M01` checkpoint. Not a new APP12
checkpoint id. Nothing was pushed, nothing was deployed, no G03 data was created
and the shared development database was not written to.

---

## A. Verdict

`product_media` could not state which of its rows is the gallery's primary.
`APP12-M01.B1` made the four public surfaces agree about it by construction in
the read path; DB1 makes the rows incapable of the ambiguity, so the guarantee
no longer depends on every future writer remembering it.

Migration `0039` installs four constraints on the existing table:

```text
uq_product_media__product_asset          one Asset per Product
uq_product_media__product_display_order  one row per position
ck_product_media__display_order_bounded  0 <= display_order < 20
ck_product_media__primary_role_at_zero   THUMBNAIL if and only if position 0
```

The domain adds the count bound and keeps the two set-level rules no row CHECK
can express. `MAX_PRODUCT_MEDIA_ITEMS = 20` is one constant with four consumers.

No new table, column, index, trigger, HTTP path, operation or schema. The
OpenAPI diff is **one line**.

---

## B. B1 PO reconciliation

Nothing B1 established was reopened or weakened.

| B1 authority | State after DB1 |
|---|---|
| main stage → `CATALOG_PREVIEW`, strip → `THUMBNAIL` | unchanged; B1 smoke green |
| intrinsic dimensions = exact derivative truth | unchanged |
| effective primary: stored eligible primary wins, else first eligible ordered | unchanged — no read-path code was touched |
| public `GET`/SEO never mutates `product_media` | unchanged, and now additionally true because the read path has no writer to change |
| summary / detail / `og:image` / JSON-LD agree | unchanged; the six `public-media*` and publication suites are green |
| `FU-APP12-H05-03 = CLOSED_BY_APP12_M01_B1` | unchanged |

DB1 touched no file in the public read path. The B1 regression evidence is in
§M.

---

## C. Data preflight

Read-only, against the shared development database, before any schema work. All
nine checks the package specifies:

```text
duplicate (product_id, asset_id)                    0
duplicate (product_id, display_order)               0
display_order < 0                                   0
display_order >= 20                                 0
display_order = 0 with role <> THUMBNAIL            0
display_order > 0 with role = THUMBNAIL             0
Products with media but no position 0               0
Products with non-contiguous positions              0
Products with more than 20 media rows               0

total product_media rows                            3
products holding media                              3
```

`APP12-M01.A`'s expectation held: the corpus already satisfies the target
invariant, so `backfill = NONE`. Nothing was mutated and nothing was hidden;
the statement was a single `SELECT`.

The same checks run again inside the migration itself (§E, STEP 0), because an
audit is evidence about a moment and a precheck is evidence about the
transaction that is actually about to constrain the rows.

**A tightening worth naming.** The old key was `(product_id, asset_id, role)`,
so the same Asset was permitted twice in one Product under two roles.
`APP2-S02`'s completion report §S records a *test fixture* that deliberately
used exactly that — one real asset backing two media rows, because the
development store held only one image with a `READY` unwatermarked
`CATALOG_PREVIEW`. That shape is now refused. No production or development row
uses it (`duplicate (product_id, asset_id) = 0`), and no live test does; a
future fixture needing two images must use two Assets.

---

## D. Layered invariant model

The claim is layered, and it is stated as one rather than rounded up.

**The database guarantees**

```text
no duplicate Asset per Product
no duplicate position per Product
positions bounded to 0..19
THUMBNAIL only at position 0, and position 0 only THUMBNAIL
```

**The domain guarantees** (`ProductMediaSelection`)

```text
a non-empty selection contains position 0
positions are contiguous 0..N-1
count <= 20
```

**What is deliberately not claimed.** The database alone does *not* prove
"exactly one primary when media exists". Both remaining rules are statements
about a *set* of rows, which no row CHECK can read, and no trigger was added to
make the sentence true. A constraint trigger written for that purpose would fire
on every intermediate state of the Admin write, which legitimately deletes the
whole selection and re-inserts it inside one transaction — and `0030`'s guard
family exists to protect facts, not to re-implement an application's transaction
shape.

Both halves are written down where they are enforced: the four constraints in
`schema/catalog/product-media.ts` and in `0039`'s header, the three domain rules
in `product-media-selection.service.ts`, each with the reason the other layer
cannot hold it.

---

## E. Migration 0039

`packages/database/migrations/0039_add_app12_product_media_invariants.sql`

```text
migrations   38 -> 39
DB tables    79 -> 79
new table            0
new column           0
new index            0   (net physical indexes 219 -> 220, see §G)
new trigger          0
new function         0
backfill             NONE
```

Generated by `drizzle-kit generate` from the schema change, then extended by
hand with the STEP 0 precheck — the same shape as `0038`, and the same reason:
a migration that silently repaired a violating row would rewrite catalog
evidence unreviewed. If any of the four constraints would reject an existing
row, `0039` raises `23514` and changes nothing.

The precheck deliberately does **not** check contiguity, presence of position 0
or the 20-item count. The migration does not install those rules, so failing an
upgrade on them would block a database the result still would not enforce them
on.

**The drizzle-kit generation fault recurred, exactly as `0038` §"Generation
note" predicted.** The tool emitted a spurious `DROP CONSTRAINT` / re-`ADD` pair
for `ck_approval_snapshots__preview_hash_format`, with the re-add truncated at
`'^sha256:[0-9a-f]{64}` because the value contains the JavaScript replacement
pattern `$'`. Both statements were removed from the migration, and the same
corrupted value was repaired in `meta/0039_snapshot.json` to the value
`0038_snapshot.json` records — which is the constraint actually installed.
Nothing here alters it. The repaired snapshot differs from `0038_snapshot.json`
in exactly the four constraint entries this package adds and the one it replaces
(verified by diff); `drizzle-kit check` reports `Everything's fine`.

---

## F. Existing-row preservation

`app12-product-media-upgrade.integration.spec.ts` runs the upgrade rather than
describing it. It builds the real pre-DB1 baseline — migrations `0000–0038`
only, from the committed files with a trimmed journal, so the SQL under test is
byte-identical to what is committed — seeds a full 20-image gallery while the
new constraints do not yet exist, and only then applies `0039`.

```text
starts from the 0038 baseline, before the invariants exist          PASS
applied exactly one further migration (38 -> 39)                    PASS
installed the four constraints and retired the role-keyed one       PASS
left every existing media row exactly as it was                     PASS
added and removed no media row at all                               PASS
added no table (79 -> 79)                                           PASS
enforces the position bound on data that predates the constraint    PASS
enforces one row per position on data that predates the constraint  PASS
fails the migration rather than repairing violating rows            PASS
```

"Left every existing media row exactly as it was" compares `id`, `asset_id`,
`role` and `display_order` **row for row**, not a count — a count would pass on
a migration that rewrote every position to `0..N-1`.

The last case builds a *second* baseline seeded with two rows at position 0
(legal under `0038`, rejected by `0039`), applies the committed folder, and
asserts the migration rejects and the two rows survive untouched. That is the
difference between an upgrade that stops and one that silently repairs.

---

## G. DB bypass constraint evidence

`app12-product-media-invariants.integration.spec.ts`, against a real PostgreSQL,
issuing statements **directly** — bypassing the domain, which is the only way to
learn whether a constraint installed at all.

**Refused**

```text
same Asset twice in one Product (even under two roles)   23505  unique_violation
two rows at the same display position                    23505  unique_violation
display_order = -1                                       23514  check_violation
display_order = 20                                       23514  check_violation
THUMBNAIL at a position above 0                          23514  check_violation
GALLERY at position 0                                    23514  check_violation
DETAIL at position 0                                     23514  check_violation
```

**Allowed**

```text
position 0 THUMBNAIL + GALLERY at 1..19 (a full 20-image gallery)   PASS
  positions = 0..19, exactly one THUMBNAIL
DETAIL above position 0                                            PASS
the same Asset in two different Products                           PASS
a Product with no media at all                                     PASS
```

The `DETAIL` cases are both present on purpose. The role rule is about the
*primary role*, not about one tuple: a CHECK naming `GALLERY` alone would pass a
`GALLERY`-only matrix while permitting `DETAIL` at position 0. The
same-Asset-in-two-Products case guards against the tightened key becoming
collateral damage for a legitimately shared catalog image.

Installed-DDL assertions in the same suite: the four constraints exist by name,
`uq_product_media__product_asset_role` no longer does, and
`pg_get_constraintdef` contains `< 20` and **not** `$1` — the placeholder a
bound parameter would have installed.

Physical inventory moved as expected and the frozen baselines were updated to
match:

```text
CHECK constraints              209 -> 211   (+ bounded, + primary_role_at_zero)
UNIQUE constraints              53 ->  54   (one replaced in place, one added)
UNIQUE backing (non-partial)    53 ->  54
total physical indexes         219 -> 220
PK / FK counts                       unchanged (79 / 168)
schema fingerprint  0bb3a11c… -> 48133df3fec5a81010170c38707169589662e4eda2ce93dfbd687d5aecb726be
```

---

## H. Canonical 20-image authority

One constant, declared beside the role tuple the migration already derives from:

```text
packages/database/src/schema/catalog/product-media.ts
  export const MAX_PRODUCT_MEDIA_ITEMS = 20;
```

Re-exported through `@embroidery/database` and through
`catalog/domain/product-draft.policy.ts` exactly as the media roles are — never
re-declared, because a second copy in the API is how one bound silently becomes
two. Consumers: the `display_order` bound `drizzle-kit` renders into `0039`, the
domain cap, the `maxItems` the Admin request contract publishes, and the tests
of all three. No runtime endpoint was added for it.

`admin-product-media-cap.contract.spec.ts` is the parity check, and it reads the
**published artifacts** rather than re-deriving the number:

```text
OpenAPI UpdateProductBody.mediaAssetIds.maxItems === MAX_PRODUCT_MEDIA_ITEMS  PASS
generated client carries `@maxItems 20`                                       PASS
migration 0039 bounds display_order by the same number                        PASS
migration rendered a literal, never `$1`                                      PASS
migration installs no table, column, index, trigger or function               PASS
migration adds exactly the four constraints and retires exactly one           PASS
migration refuses rather than repairs (RAISE, no UPDATE/DELETE on the table)  PASS
write shape is still an ordered array of Asset ids                            PASS
```

A later edit that hard-coded `20` in any one place would still pass every
functional test in the repository; this file is what catches it.

---

## I. Domain / service enforcement

The cap is checked at `ProductMediaSelection.resolve` — the one boundary every
Admin media write passes through — **before** the locking Asset read, so a
21-image selection never becomes a query, a lock or a row:

```text
0   accepted, writes nothing
1   accepted, primary at position 0
20  accepted, positions 0..19, exactly one THUMBNAIL
21  refused, PRODUCT_MEDIA_TOO_MANY, lockScopedByIds never called
100 refused, same stable code
duplicate Asset            refused, PRODUCT_MEDIA_DUPLICATE
ordering                   operator order is the only input to position
```

`PRODUCT_MEDIA_TOO_MANY` joins the existing `ProductDraftError` vocabulary and
maps to **400** — a count bound on the request, not a conflict with the
product's state. Its message is the only one in that contract built from a
value, and it reads the value from the canonical constant so the sentence and
the bound cannot drift apart. It is still written once, in the same file as its
ten siblings. The exhaustive status-map spec caught the addition at compile
time, as designed.

No silent truncation and no partial write: validation is all-or-nothing and
completes before a single link is stored, and the replacement runs in the
caller's transaction.

Order of checks is deliberate — count first, then duplicates — because the count
is decided without touching a row. A selection that is both too long and
repetitive gets the coarser answer; that is asserted rather than left to
chance.

**Residual, not fixed here.** `ProductRepository.attachMedia` writes
`display_order: 0` with a caller-supplied `role`. It has **no callers anywhere
in the repository** (port declaration and adapter only, no test usage), so DB1
changes no behaviour, but under `ck_product_media__primary_role_at_zero` it can
now only succeed with `THUMBNAIL`. Removing or narrowing it is a change to a
different module's public port and is out of DB1's scope; recorded here rather
than left implicit.

---

## J. Existing Product write-contract change

The `mediaAssetIds[]` shape is unchanged. The only change is the published
bound:

```json
"mediaAssetIds": { "items": { … }, "maxItems": 20, "type": "array" }
```

The whole OpenAPI diff is that one line.

```text
NEW HTTP PATHS       0
NEW HTTP OPERATIONS  0
NEW SCHEMAS          0
```

No reorder endpoint, no set-primary endpoint, no media-only write authority.

**Which refusal a browser actually receives, measured rather than assumed.**
Over HTTP the Zod bound is reached before the service, so a 21-image patch
returns the platform's canonical validation envelope:

```json
{ "success": false, "code": "BAD_REQUEST",
  "errors": [{ "field": "mediaAssetIds", "code": "TOO_LONG" }] }
```

The domain's `PRODUCT_MEDIA_TOO_MANY` is the backstop behind it, for any caller
that does not pass through this DTO. Both are asserted — the wire shape in the
API suite, the domain code in the unit suite — and neither is inferred from the
other. The DTO check is not redundant with the domain check: the DTO exists so a
client reading the schema learns the limit before it sends, the domain check
exists so the limit holds regardless of transport.

---

## K. Concurrency regression

`expectedUpdatedAt` remains the only concurrency authority; DB1 added no token,
no lock and no write path.

```text
winner patches media with a fresh token           200
loser replays the same, now-stale token           409  PRODUCT_VERSION_CONFLICT
stored selection afterwards                       exactly what the winner wrote
```

And the refusal is atomic against a *populated* gallery, which is the case that
matters — the Admin write replaces the whole selection, so a partial application
would delete real media and store nothing:

```text
product holding 3 images, then a 21-image patch   400
stored selection afterwards                       the same 3 rows, unchanged
```

---

## L. OpenAPI / generated client

```text
paths       126   (unchanged)
operations  139   (unchanged)
schemas     278   (unchanged)
```

Regenerated, never hand-edited. Both drift gates re-run clean:

```text
pnpm --filter @embroidery/api openapi:check           artifact is up to date
pnpm --filter @embroidery/api-client check:generated  tree hash 06b4606d…e0da
```

Generated-client diff: 4 insertions, 1 deletion — the `@maxItems 20` JSDoc tag
on `UpdateProductBody.mediaAssetIds`. The TypeScript type is still
`mediaAssetIds?: string[]`.

---

## M. B1 smoke regression

```text
public-media-visibility / public-media-effective-primary /
public-media-dimensions / product-publication (×3) / product-unpublish
                                                        6 suites,  97 tests  PASS
catalog-draft (api / concurrency / integration)         3 suites,  56 tests  PASS
```

Nothing in the public read path was modified. Admin media-management UI
unchanged, Figma unchanged, no `{n}/20` counter, no set-primary control, no
published-Product media editing.

---

## N. Files changed

**Schema and migration**

```text
A packages/database/migrations/0039_add_app12_product_media_invariants.sql
A packages/database/migrations/meta/0039_snapshot.json
M packages/database/migrations/meta/_journal.json
M packages/database/src/schema/catalog/product-media.ts
M packages/database/src/index.ts
```

**Frozen physical baselines the schema change moves**

```text
M packages/database/tools/db-live-constraints-check.mjs      u 53->54, c 209->211
M packages/database/tools/db-live-indexes-check.mjs          total 219->220, uq 53->54
M packages/database/tools/canonical-fingerprint.txt          new fingerprint
M packages/database/tools/migration-checksums.json           0039 entry
```

**API**

```text
M apps/api/src/modules/catalog/domain/product-draft.policy.ts
M apps/api/src/modules/catalog/domain/product-draft.errors.ts
M apps/api/src/modules/catalog/application/product-media-selection.service.ts
M apps/api/src/modules/catalog/presentation/schemas/admin-product.request.ts
M packages/contracts/openapi/openapi.generated.json           (generated)
M packages/api-client/src/generated/embroidery-api.schemas.ts (generated)
```

**Tests**

```text
A packages/database/src/schema/app12-product-media-fixture.ts
A packages/database/src/schema/app12-product-media-invariants.integration.spec.ts
A packages/database/src/schema/app12-product-media-upgrade.integration.spec.ts
A apps/api/src/modules/catalog/application/product-media-selection.service.spec.ts
A apps/api/src/modules/catalog/presentation/admin-product-media-cap.contract.spec.ts
A apps/api/test/integration/product-media-cap.integration.spec.ts
M apps/api/src/modules/catalog/domain/product-draft.errors.spec.ts
M apps/api/src/modules/catalog/presentation/schemas/admin-product.request.spec.ts
```

**Sibling suites a 39th migration necessarily moves** (§P)

```text
M packages/database/src/testing/harness.integration.spec.ts
M packages/database/src/schema/app12-ready-made-upgrade.integration.spec.ts
M packages/database/src/schema/app6-cop-design-context-upgrade.integration.spec.ts
M packages/database/src/schema/app7-transfer-evidence-upgrade.integration.spec.ts
M packages/database/src/schema/catalog-preview-upgrade.integration.spec.ts
```

**Documentation**

```text
M docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md
A docs/implementation/reports/APP12-M01-DB1-COMPLETION-REPORT.md
```

---

## O. File-size

Scoped mode over all 21 source and test files the package owns:

```text
node tools/check-file-size.mjs --paths <21 files>
Scoped file-size check passed (21 file(s), 0 above the review threshold).
```

Not one file reaches even the 300/500 review threshold.

---

## P. Validation

Change-impact only. Every command below was run; none is a repository-wide
aggregate.

```text
git diff --check                                             clean
drizzle-kit check                                            Everything's fine
node packages/database/tools/db-migration-checksum-check.mjs all 39 match
node tools/check-file-size.mjs --paths <21>                  PASS
node tools/check-report-secrets.mjs                          PASS (679 docs, 5363 files)
node --test tools/check-release-config.test.mjs              13/13 PASS

pnpm --filter @embroidery/database typecheck                 PASS
pnpm --filter @embroidery/database lint                      PASS
pnpm --filter @embroidery/api typecheck                      PASS
pnpm --filter @embroidery/api lint                           PASS

pnpm --filter @embroidery/api openapi:generate               126/139/278
pnpm --filter @embroidery/api openapi:check                  up to date
pnpm --filter @embroidery/api-client generate                2 files
pnpm --filter @embroidery/api-client check:generated         up to date

@embroidery/database  app12-product-media* + the five moved suites
                                                             7 suites, 66 tests PASS
@embroidery/api       media cap / selection / parity / request / errors
                      + catalog-draft + public-media + publication + unpublish
                                                            14 suites, 212 tests PASS
```

`pnpm format:check` — the three DB1 files it flagged were formatted and it now
reports only `packages/e2e-testing/support/app12/v02-c1-login-reflow.mjs`, which
was committed unformatted at `APP12-V02-C1` (`cc606908`) and is untouched by
DB1. Left alone rather than swept into this package; see §Q.

### Pre-existing failures in `@embroidery/database`, measured not assumed

The full package suite reports **22 failures across 9 suites**. All 22 were
already red at entry HEAD. That was established by parking `0039` (removing the
`.sql`, the snapshot and the journal entry), re-running, and comparing:

```text
red at HEAD, still red, untouched by DB1 (22 tests, 9 suites)
  app3-derivative-metadata            table count
  app3-placement-authority            "all 34 migrations onto the 78-table schema"
  app3-placement-upgrade              6 cases
  app5-intake-provenance              "all 35 migrations onto the 78-table schema"
  app5-intake-provenance-upgrade      5 cases
  app6-cop-design-context             "all 36 migrations onto the 78-table schema"
  catalog-draft-categories            fresh + upgrade
  catalog-preview-derivative          "all 34 migrations onto the 78-table schema"

green at HEAD, broken by 0039, repaired in this package (5 suites)
  harness.integration                 chain length 38 -> 39, fingerprint, comment
  app12-ready-made-upgrade            gained TRAILING_TAGS + a target folder
  app6-cop-design-context-upgrade     0039 joins TRAILING_TAGS
  app7-transfer-evidence-upgrade      0039 joins TRAILING_TAGS
  catalog-preview-upgrade             0039 joins POST_BASELINE_TAGS, FULL 38 -> 39
```

Each of the 22 asserts a migration or table count frozen at its own
checkpoint's era (34/78, 35/78, 36/78) that the checkpoints in between never
updated — they could not have passed at HEAD, which stood at 38 migrations and
79 tables. Repairing seven unrelated suites is not DB1's change; it is recorded
here as a standing debt, and it is the same maintenance obligation the five
repaired suites carry.

---

## Q. Hygiene

```text
shared_dev_mutations   0
G03_data_created       false
production_deployed    false
pushed                 false
```

The shared development database was read once (§C) and never written. Verified
afterwards: still **38** applied migrations, **3** `product_media` rows, **79**
tables and the original **5** `product_media` constraints — `0039` has not been
applied to it. Every mutating test ran on a disposable database; **0** leftover
disposable databases remain.

No `.env` was read or written and no credential was used.

**i18n.** No new human-facing copy was created. `PRODUCT_MEDIA_TOO_MANY`'s
message lives in the API's safe-error contract beside its ten siblings, which is
where every product-draft refusal message has lived since `APP2-B02`; the API
consumes no locale bundle and the Vietnamese copy for these refusals is mapped
from the *code* by the Admin frontend. DB1 does no Admin UI work (§16 of the
package), so no locale entry was added — adding one now would create a second
authority with no consumer. When `M01.A1` builds the media-management UI, that
package owns the Vietnamese string for this code.

**One pre-existing format failure left in place**
(`v02-c1-login-reflow.mjs`, §P) rather than swept in as an unrelated change.

---

## R. Baseline

```text
OpenAPI              126 / 139 / 278   unchanged
public operations    49                unchanged (0 operations added; 1-line diff)
migrations           38 -> 39
DB tables            79                unchanged
Admin routes         26                unchanged
Storefront routes    20                unchanged
Figma                unchanged
ROADMAP_CHECKPOINTS  39                unchanged
```

---

## S. M01 internal roadmap

```text
APP12-M01.A   COMPLETE — PO PASS
APP12-M01.B1  COMPLETE — PO PASS
APP12-M01.DB1 COMPLETE
APP12-M01     IMPLEMENTATION_IN_PROGRESS

INTERNAL_NEXT = M01.B2   (not executed)
M01.B2 / M01.D1 / M01.A1 / M01.S1 / M01.E1   NOT_AUTHORIZED
APP12-G03                                    NOT_AUTHORIZED
```

Not executed here, and explicitly still owned by later packages: published-Product
media editing, media-only write authority, the Admin compact media grid, the
set-primary control, the visible Product Detail counter, drag-and-drop, per-SKU
imagery and order image snapshotting.

Two items for the PO's attention when sequencing the next package:

1. `ProductRepository.attachMedia` is now `THUMBNAIL`-only in practice and has
   no callers (§I).
2. Seven `@embroidery/database` suites carry stale per-era migration/table
   baselines and are red independently of DB1 (§P).
