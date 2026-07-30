# APP2-B02-G01 — Product-Draft Required-Field Gate — Completion Report

**Checkpoint:** `APP2-B02-G01` — close the Product Draft required-field gate
without changing the canonical five-operation `APP2-B02` scope.
**Verdict:** `PASS`
**Status:** `COMPLETE — ENTRY_GATE_CLOSED`
**Date:** 2026-07-30
**Implementation commit (A):** `356d6e771602b3a4f76b6ca54c2f2ea3449f3ded`

---

## A. Preflight and excluded user evidence

`APP2_B02_G01_PREFLIGHT = PASS`.

| Requirement | Observed |
|---|---|
| Branch | `production` |
| Entry `HEAD` | `bb4ebb9d031cfb77a9baf81b897caed6e1d644d7` — `docs(app2): record Admin Assets secure-context correction`, the exact final A01/C1 evidence commit read from Git |
| Tracked-tree modification | none |
| Staged files | none |
| Implementation residue | none — the blocked B02 audit created no commit and changed no tracked file |
| `pnpm quality` | `EXIT=0` |
| `pnpm check:openapi` | up to date |
| `pnpm check:api-client` | up to date, `55de1cc1…` |
| `pnpm check:figma-design-index` | 70 registry IDs, 70 node rows |
| `node --test tools/check-figma-design-index.test.mjs` | 19 pass / 0 fail |
| `pnpm db:check:manifest` | all checks passed |
| `git diff --check` | clean |

**Excluded user-owned evidence.** `git status` reports one untracked directory,
`evidences/`, holding `images.jpg` (00:22), `bug_01.png` (00:26) and
`bug_2.png` (00:37) — the Product Owner's own screenshots from the `APP2-A01`
live test, all timestamped before this checkpoint began. It was **not deleted,
added, staged or absorbed**; every `git add` in this checkpoint used the
pathspec `-- ':!evidences'`. The tracked tree was clean at entry and is clean at
exit.

**Accepted chains verified from Git:** `APP2-B01` (`a1cb712`+`ac81a2a`),
`APP2-DB01` (`fc7f0a1`+`cdd7b86`), `APP2-I03` (`6252e4d`+`ae5e65a`),
`APP2-W01` (`7f01f94`+`6982e86`), `APP2-D02` (`59be440`+`f3619db`),
`APP2-A01` (`58164122df015b08393818db9a8309bc5863a851`+`6f12c4d`) and
`APP2-A01-C1` (`77691abcadae042646416f1f6171f107112fceee`+`bb4ebb9`).

---

## B. The proven `APP2-B02` block

Reproduced against the live schema before any edit.

`products` has **10 NOT NULL columns with no `DEFAULT`**. Four of them already
have a locked creation rule in delivered DB7 code
(`apps/api/src/modules/catalog/infrastructure/persistence/drizzle-product.repository.ts`):
`status: 'DRAFT'`, `currencyCode: 'VND'`, `isDisplayOutOfStock: false`,
`isIndexable: true`. Five mandatory values had **no rule at all**:

| Value | Constraint | Why it blocked |
|---|---|---|
| `category_id` | NOT NULL, FK `restrict` | **Unsatisfiable, not merely unlocked.** Zero category rows existed, the whole API exposes 7 paths and **none** of them is a category operation, there is no seed mechanism, and `APP2-B02` may not add a sixth operation — so `A02`/`A03` could never have created a draft. |
| `slug` | NOT NULL, globally unique | No slugify helper in the repository, no derive-vs-enter rule, no collision policy — and the slug is a public URL (`/api/public/products/{slug}` in B04). |
| `base_price_amount` | NOT NULL, `≥ 0`, VND integer scale | NOT NULL collides directly with "a draft may be incomplete". |
| `display_order` | NOT NULL | No rule for the initial value. |
| `product_media.role` | NOT NULL, closed set, part of the uniqueness key | Ordered media cannot be stored without deciding it. |

The block code was `BLOCKED_BY_PRODUCT_DRAFT_FIELD_DECISION` and **not**
`BLOCKED_BY_PROVEN_CATALOG_DRAFT_SCHEMA_GAP`: the schema already represents
draft create/list/detail/update, ordered media, archive (`status='ARCHIVED'` +
`archived_at`) and `updated_at`-based concurrency. That distinction is why this
gate needed a **data** migration and no schema change.

---

## C. Existing schema and domain audit

Recorded from source and from the live catalog, not inferred.

| Fact | Value |
|---|---|
| Category table | `categories` (TBL-011), **flat — no parent column** (DB4 models it with no tree), so every row is a root by construction |
| Category status literals | `DRAFT` / `PUBLISHED` / `ARCHIVED` (`CATEGORY_STATES`, `ck_categories__status_allowed`) |
| Category NOT NULL, no default | `id`, `name`, `slug`, `display_order`, `status`, `is_indexable` |
| Category uniqueness | `uq_categories__slug` — global, publication-independent |
| Category timestamps | `created_at` / `updated_at`, both `default now()`; no audit actor column |
| Product slug column | `text` — **no length limit**; unique via `uq_products__slug` |
| Price type/scale | `numeric(14,2)`, `ck_products__base_price_non_negative`, `ck_products__currency_allowed` (VND only), `ck_products__currency_scale` (VND must be whole) |
| `display_order` | `integer`, NOT NULL, no CHECK |
| `product_media` roles | `GALLERY` / `THUMBNAIL` / `DETAIL`; `role` and `display_order` NOT NULL with no default; unique on `(product_id, asset_id, role)` |
| Migration convention | `NNNN_snake_case.sql` + `--> statement-breakpoint`, journal entry `{idx, version:'7', when, tag, breakpoints:true}`, one snapshot per migration |

The four locked category rows are representable with **no schema change**, so
`BLOCKED_BY_CATEGORY_REFERENCE_SCHEMA_GAP` does not apply.

---

## D. Category taxonomy decision (IMP-D032)

| Slug | Name | Display order | Deterministic id |
|---|---|---:|---|
| `thu-bong` | Thú bông | 10 | `019a0000-0000-7000-8000-000000000001` |
| `khan` | Khăn | 20 | `019a0000-0000-7000-8000-000000000002` |
| `quan-ao` | Quần áo | 30 | `019a0000-0000-7000-8000-000000000003` |
| `khac` | Khác | 90 | `019a0000-0000-7000-8000-000000000004` |

All four are `PUBLISHED` with `is_indexable = true`, `archived_at` null and no
description.

**One interpretation recorded explicitly.** The brief says the categories are
"active under the exact existing category status model", but the lifecycle has
no `ACTIVE` literal. "Active" is therefore mapped onto the existing closed set
as **`PUBLISHED`** — `ARCHIVED` is the delisted state and `DRAFT` is not yet
active, which is also what makes §4.1's "unknown/**inactive** slug →
`PRODUCT_CATEGORY_INVALID`" coherent. The mapping is asserted in code
(`APP2_CATEGORY_STATUS satisfies CategoryState`) and in tests, not left implicit.

**Rootness** needs no stored value: `categories` has no parent column.

**Wire contract.** `APP2-B02` accepts `categorySlug` and resolves it to
`category_id` inside the transaction; list/detail return `{ slug, name }` only.
The physical UUID is never exposed to make a form work. Unknown or inactive slug
→ `PRODUCT_CATEGORY_INVALID` (safe 400). **No category HTTP operation was
added** — the closed enum is sourced from `APP2_CATEGORY_TAXONOMY`, so A02/A03
render the four labels without fetching mutable category data.

Single source: `packages/database/src/schema/catalog/categories.ts` exports
`APP2_CATEGORY_TAXONOMY`, `APP2_CATEGORY_SLUGS`, `App2CategorySlug` and
`APP2_CATEGORY_STATUS`. No new package was introduced for four constants, and
the migration, the future OpenAPI enum, the repository lookup and the Admin
labels all derive from that one list.

---

## E. Product slug decision

Server-owned; the client supplies none, and `PATCH name` never silently
rewrites it — the slug is **immutable in APP2-B02**.

Derivation: `đ/Đ → d/D` → NFD → drop combining marks → lowercase → non-`[a-z0-9]`
runs to `-` → collapse/trim `-` → `san-pham` when empty → cap the base.
On unique conflict, retry **once** as `{base}-{first 8 lowercase hex of the
compact product UUID}`; a second conflict is `PRODUCT_SLUG_CONFLICT`. No
timestamp-only or random-only slug, and no operator slug field.

**Recorded interpretation.** Step 8 of the brief says "truncate the base safely
to the real column limit". The real limit is **none** — `slug` is `text`. An
unbounded slug is still a hazard for the `uq_products__slug` B-tree, so the cap
is **policy, set at 80 characters**, and is stated as such rather than presented
as a column fact.

The `đ` fold must precede NFD: Unicode does not decompose the Vietnamese stroke,
so a plain NFD pass would drop `đ` entirely rather than fold it to `d`.

The vectors are frozen and **executed** — the spec carries a reference
implementation, so the written policy is proven unambiguous rather than merely
asserted:

| Input | Base slug |
|---|---|
| `Thú bông` | `thu-bong` |
| `Khăn tắm` | `khan-tam` |
| `Quần áo` | `quan-ao` |
| `Áo dài đỏ` | `ao-dai-do` |
| `ĐỒ CHƠI` | `do-choi` |
| `Gấu bông ❤ 2026!` | `gau-bong-2026` |
| `Khăn   tắm  ` | `khan-tam` |
| `Áo  --  Thun` | `ao-thun` |
| `---` / `!!!` / `   ` / `` | `san-pham` |

Collision example: product `019a1234-5678-7abc-8def-0123456789ab` →
`thu-bong-019a1234`.

Ownership stays with the future Catalog capability: `APP2-B02` implements the
function and must reproduce this table. G01 adds **no production slug helper**,
because the only place it could have lived is `apps/api` production source,
which §11 forbids.

---

## F. Draft price decision

Create writes `base_price_amount = 0`, `currency_code = VND`.

`0` under `status = DRAFT` means **"price not completed"** — a deliberate
sentinel, never a sale price. `PATCH` may set a non-negative VND integer amount
within the existing scale. Recorded handoffs: **`APP2-B03` publication must
require `> 0`** and must never publish a zero-price product; **`APP2-A03` must
render it as `Chưa đặt giá`**, not as `0 ₫`.

The constant is `PRODUCT_DRAFT_BASE_PRICE_AMOUNT = '0'` — a **string**, because
money never becomes a JavaScript number (CLAUDE.md §5), and the test asserts the
type as well as the value.

---

## G. Product display-order decision

Create writes `display_order = 0`, meaning "no curated public order yet".
`APP2-B02` computes **no `max+1`** and no per-category ordering; public ordering
belongs to `APP2-B03`/`B04`. `APP2-B02` exposes `displayOrder` as an editable
field only if its own source audit proves the approved draft form owns it.

---

## H. Product-media role decision

For a complete ordered selection: the **first** Asset is the single `THUMBNAIL`
at `display_order = 0`; every following Asset is `GALLERY` at its zero-based
request position. Request order is authoritative, Asset ids are distinct, and
**`DETAIL` is excluded from APP2-B02** — the physical closed set is unchanged,
B02 simply never writes it. An empty media selection is allowed for an
incomplete draft. Removing media removes only `product_media` links and never
deletes or mutates an Asset, a derivative or a stored object.

---

## I. Migration and deterministic ids

One migration, generated through the canonical tool
(`drizzle-kit generate --custom`) so the journal entry and snapshot follow the
repository convention:

```text
packages/database/migrations/0033_provision_catalog_draft_categories.sql
packages/database/migrations/meta/0033_snapshot.json
packages/database/migrations/meta/_journal.json   (idx 33, version 7)
packages/database/tools/migration-checksums.json  (sha256 a53236e9…)
```

**Data only.** No table, column, constraint, index, trigger or function is
touched, and no existing migration was modified.

Per slug the migration is idempotent and non-destructive:

1. absent → insert the canonical row;
2. present and exactly canonical (id, name, display order, status, indexable,
   not archived) → accept, so re-runs and restores stay clean;
3. present but contradictory → `RAISE EXCEPTION` naming the slug and the stored
   values, because silently rewriting a category's name or status would change
   what every product filed under it means.

Nothing is ever deleted or renamed, and no sample product or media row is added.

**Ids are fixed, hand-authored UUIDv7-shaped literals**, not generated. Reference
rows must be byte-identical on every machine and in every restored backup; a
migration that generated them would give the same logical category a different
id per environment. The timestamp prefix is a deliberate constant sentinel —
determinism outranks the time-ordering `newId()` provides for rows created at
runtime. Shape is asserted (`…-7xxx-[89ab]xxx-…`).

---

## J. Fresh, upgrade and conflict tests

**Fresh** (`catalog-draft-categories.integration.spec.ts`, 7 tests): the full
33-migration chain applies; exactly the four canonical rows exist with exact id,
name, slug, order, `PUBLISHED`, `is_indexable`, null `archived_at` and null
description; no fifth row; `products`, `product_media`, `product_variants` and
`skus` are all empty; re-applying the provisioning statements changes nothing;
all 78 tables exist; and `verifySchemaBaseline` — the six DB6 live-catalog
checkers plus the fingerprint gate — passes.

**Upgrade** (`catalog-draft-categories-upgrade.integration.spec.ts`, 4 tests):
the baseline is the committed files minus `0033` with a trimmed journal, so the
SQL under test is byte-identical to what is committed. Three databases differ
only in what `categories` already held:

| Case | Result |
|---|---|
| baseline probe | 32 migrations applied, `categories` empty |
| empty | 33 applied; all four rows inserted with the exact ids and order |
| already-canonical row pre-seeded | 33 applied; four rows; the pre-existing row appears **once** and is byte-identical — accepted, not rewritten |
| conflicting row (same slug, foreign id/name/status/order) | `runMigrations` **rejects** with `APP2-B02-G01`; the conflicting row is untouched and the migration is **not** recorded (still 32) |

**One defect found and fixed in my own test.** Under the full `pnpm quality`
run every package's integration suite competes for one PostgreSQL server, and
this suite's `afterAll` — which drops four databases — exceeded the default 120 s
hook budget. All 232 assertions had passed; only teardown timed out. It now
carries the same explicit 240 s budget as its setup.

---

## K. New database metrics and fingerprint

| Metric | Before | After |
|---|---|---|
| Migrations | 32 | **33** |
| Tables | 78 | 78 |
| Columns | 833 | 833 |
| CHECK constraints | 190 | 190 |
| Fingerprint | `82864268c990990e4597c74cfc69b7b5a91b1bc5a2adbde098ab9ad43aed58cf` | **unchanged** |

The fingerprint was not assumed. A fresh database was built from all 33
migrations and hashed directly:

```text
node packages/database/tools/db-schema-fingerprint.mjs <fresh 33-migration db>
  82864268c990990e4597c74cfc69b7b5a91b1bc5a2adbde098ab9ad43aed58cf
packages/database/tools/canonical-fingerprint.txt
  82864268c990990e4597c74cfc69b7b5a91b1bc5a2adbde098ab9ad43aed58cf
```

Identical, as a data-only migration requires: the fingerprint normalizes the
catalog (tables, columns, constraints, indexes, functions, triggers) and never
hashes row contents. The same database reported 33 applied migrations, 78 tables
and the four categories, and was dropped afterwards.

`node packages/database/tools/db-migration-checksum-check.mjs` →
`all 33 migration files match the frozen manifest`.

**Five existing suites asserted the old chain length** and now assert 33:
`harness.integration.spec.ts` (×2), `catalog-preview-derivative.integration.spec.ts`,
`api-integration-context.integration.spec.ts` and
`db10-cp2-logical-restore.integration.spec.ts`. The last two live under
`apps/api/**` **test** paths — they are baseline assertions, not API production
source, and updating a migration count is the direct consequence of adding a
migration.

One further correction was required rather than a renumber: the pre-APP2-DB01
upgrade suite rebuilt its baseline by withholding **only** `0032`, so `0033`
would have been applied into a folder that is supposed to represent the chain
*before* APP2-DB01. It now withholds every migration from `0032` onward, and its
counts are explicit (`BASELINE_MIGRATION_COUNT = 31`, `FULL_MIGRATION_COUNT = 33`).

---

## L. Canonical `APP2-B02` handoff

`APP2-B02` remains exactly five operations; **no sixth was added**:

```text
GET   /api/admin/products
GET   /api/admin/products/:productId
POST  /api/admin/products
PATCH /api/admin/products/:productId
POST  /api/admin/products/:productId/archive
```

What B02 can now rely on: a guaranteed non-empty category table addressed by
`categorySlug` as a closed enum; a server-owned slug policy with frozen vectors;
`base_price_amount = 0` and `display_order = 0` as create-time sentinels; and
the first-`THUMBNAIL`/rest-`GALLERY` media rule with `DETAIL` excluded.

Still B02's own to decide, unchanged by this gate: the `updated_at`-based
concurrency semantics (§10 of the B02 brief sanctions it — `products` has no
`version` column), the list filter set, and the safe error taxonomy.

---

## M. Deferred follow-ups

```text
FU-APP2-CATEGORY-MANAGEMENT-01 = DEFERRED_BEYOND_CATALOG_ALPHA
FU-APP2-THUMBNAIL-01           = ROUTED_TO_APP2-T01
```

Mutable category management (create/rename/reorder/archive, API and Admin UI) is
deliberately out of APP2 and **nonblocking** for `B02`/`A02`/`A03`; the fixed
taxonomy is what those checkpoints consume. The thumbnail follow-up is untouched
by this checkpoint and stays routed to `APP2-T01`
(`ROUTED — NOT PLANNED_FOR_EXECUTION`); neither was implemented, neither was
marked complete, and neither is a predecessor of B02/A02/A03.

---

## N. Commit A evidence

```text
356d6e771602b3a4f76b6ca54c2f2ea3449f3ded
feat(db): provision catalog draft categories
20 files changed, 12216 insertions(+), 20 deletions(-)
```

New: `packages/database/migrations/0033_provision_catalog_draft_categories.sql`;
`packages/database/migrations/meta/0033_snapshot.json`;
`packages/database/src/schema/catalog-draft-categories.spec.ts`;
`packages/database/src/schema/catalog-draft-categories.integration.spec.ts`;
`packages/database/src/schema/catalog-draft-categories-upgrade.integration.spec.ts`.

Modified: `packages/database/migrations/meta/_journal.json`;
`packages/database/tools/migration-checksums.json`;
`packages/database/src/schema/catalog/{categories,products,product-media}.ts`;
`packages/database/src/testing/harness.integration.spec.ts`;
`packages/database/src/schema/catalog-preview-{derivative,upgrade}.integration.spec.ts`;
`apps/api/test/integration/api-integration-context.integration.spec.ts`;
`apps/api/src/tests/durability/db10-cp2-logical-restore.integration.spec.ts`;
`docs/database/DB6_FINAL_PHYSICAL_INVENTORY.md`;
`docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md`;
`docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md`;
`docs/implementation/10-MASTER-APPLICATION-ROADMAP.md`;
`docs/implementation/11-TRACEABILITY-AND-STATUS-MATRIX.md`.

The 11,426-line snapshot is the tool's own artifact from
`drizzle-kit generate --custom`, not hand-written content.

---

## O. Validation

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/database lint` | clean |
| `pnpm --filter @embroidery/database typecheck` | clean |
| `pnpm --filter @embroidery/database test` | **232 passed / 12 suites** |
| `pnpm check:openapi` | up to date — artifact unchanged |
| `pnpm check:api-client` | up to date, `55de1cc1…` — unchanged |
| `pnpm check:figma-design-index` | 70 registry IDs — unchanged |
| `node --test tools/check-figma-design-index.test.mjs` | 19 pass / 0 fail |
| `pnpm db:check:manifest` | all checks passed (78 tables, 833 columns) |
| `node packages/database/tools/db-migration-checksum-check.mjs` | 33/33 match |
| `node packages/database/tools/db-schema-fingerprint.mjs` | `82864268…` = canonical |
| `node tools/check-file-size.mjs` | passed |
| `pnpm quality` | **`EXIT=0`** (api 92 suites/1136, worker 24/283, persistence 9/112, database 12/232, admin 30/222, storefront 11/53) |
| `git diff --check` | clean |

**Script substitutions recorded.** The brief lists `pnpm db:migrate:fresh`,
`pnpm db:test:upgrade`, `pnpm db:check:drift`, `pnpm db:test:guards` and
`pnpm db:test:repositories`; **none of these scripts exists** in this
repository. No new script was invented for them. The equivalent canonical
coverage used instead:

| Brief command | Actual equivalent |
|---|---|
| `db:migrate:fresh` | `catalog-draft-categories.integration.spec.ts` (disposable database, full chain) |
| `db:test:upgrade` | `catalog-draft-categories-upgrade.integration.spec.ts` (real 32→33 upgrade + conflict) |
| `db:check:drift` | `pnpm db:check:manifest` + `db-migration-checksum-check.mjs` + `db-schema-fingerprint.mjs` |
| `db:test:guards` | `verifySchemaBaseline` (six DB6 live-catalog checkers + fingerprint gate) inside the fresh suite |
| `db:test:repositories` | `pnpm --filter @embroidery/persistence test` (112) and `@embroidery/api` (1136) inside `pnpm quality` |

**Environment.** No disposable database created by this checkpoint survived —
every `app2b02g01-*` database was dropped by its suite, as was the ad-hoc
fingerprint database. The final sweep found **5** leaked databases, all from
*other* packages' suites (`cp3_asset`, `cp3_customer_secure`, `cp4_inventory`,
`cp4_production`, `t01_catalog`) during the parallel `pnpm quality` run; none
was mine, and all were dropped so the environment ends clean at **0**. No
container was started or stopped; only the pre-existing dev stack runs.

---

## P. Acceptance

All 48 criteria are met. The ones carrying a note:

| # | Criterion | Note |
|---|---|---|
| 2 | user-owned `evidences/` untouched | every stage used `-- ':!evidences'` (§A) |
| 8 | root/active/order semantics | "active" → `PUBLISHED`, stated explicitly because the lifecycle has no `ACTIVE` literal; rootness is structural (§D) |
| 14 | no schema/table/column change | fingerprint measured, not assumed (§K) |
| 16–17 | slug normalization and fallback exact | frozen vectors are executed against a reference implementation (§E) |
| 35 | new migration count/fingerprint recorded | 32 → 33; fingerprint unchanged (§K) |
| 39 | no application source | the two `apps/api` edits are **test** baselines, disclosed in §K |

---

## Q. Scope closure

Delivered: the five locked decisions (IMP-D032), one data migration provisioning
the fixed taxonomy, canonical constants as the single source, and static,
fresh, upgrade and conflict tests.

Not done, deliberately: no `APP2-B02` operation, no category endpoint, no
thumbnail delivery, no publication, no Admin/Storefront/worker/object-storage
change, no OpenAPI or generated-client change, no schema change, no dependency.

```text
APP2-B02-G01 = COMPLETE — ENTRY_GATE_CLOSED
APP2-B02     = READY — NOT STARTED
APP2-A02     = BLOCKED_BY_APP2-B02
APP2-A03     = BLOCKED_BY_APP2-B02
APP2-T01     = ROUTED — NOT PLANNED_FOR_EXECUTION
```
