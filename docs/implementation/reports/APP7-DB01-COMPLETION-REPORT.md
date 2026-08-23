# APP7-DB01 — Payment Transfer Evidence Association Schema

- Phase: APP7 — Deposit Payment and Order Creation
- Checkpoint: `APP7-DB01`
- Mode: `DATABASE / FORWARD MIGRATION / CTX-PAY`
- Authority: `PO-APP7-001`, `APP7-G01` §7 and §9, `ADR-DB4-003`
- HTTP operations: 0
- Date: 2026-08-23

## 1. Verdict

```text
APP7-DB01 = COMPLETE
CHECKPOINT_SCOPE = PAYMENT_TRANSFER_EVIDENCE_ASSOCIATION_SCHEMA

TABLE = payment_transfer_evidence
OWNER_CONTEXT = CTX-PAY

PRIMARY_KEY = pk_payment_transfer_evidence PRIMARY KEY (id) — uuid7, idColumn()
CONVENTION_COLUMNS = id (uuid, NOT NULL), created_at (timestamptz NOT NULL DEFAULT now())

PAYMENT_ATTEMPT_FK = fk_payment_transfer_evidence__payment_attempt_id / NOT NULL / ON DELETE RESTRICT
ASSET_FK           = fk_payment_transfer_evidence__asset_id / NOT NULL / ON DELETE RESTRICT

PAIR_UNIQUENESS = uq_payment_transfer_evidence__attempt_asset UNIQUE (payment_attempt_id, asset_id)
MAX_EVIDENCE_PER_ATTEMPT_DB_RULE = NONE

ROLE_COLUMN = NONE
CONVENIENCE_COLUMNS = NONE
JSONB = NONE

MIGRATION = packages/database/migrations/0037_add_app7_transfer_evidence_association.sql
MIGRATION_COUNT_BEFORE = 36
MIGRATION_COUNT_AFTER  = 37

TABLE_COUNT_BEFORE = 78
TABLE_COUNT_AFTER  = 79
FK_COUNT_DELTA = +2
OTHER_PHYSICAL_METRIC_DELTA = columns 849 -> 853 (+4); PK 78 -> 79 (+1);
  UNIQUE 52 -> 53 (+1); CHECK 204 -> 204 (0); triggers 34 -> 34 (0);
  physical indexes 215 -> 217 (+2, both constraint-created);
  partial indexes 48 -> 48 (0); REL rows 95 -> 96 (+1); REL edges 167 -> 169 (+2)

FRESH_APPLY = PASS
UPGRADE_FROM_PREVIOUS = PASS
NO_OP_DRIFT = PASS
FK_RESTRICT_PROOF = PASS
CARDINALITY_PROOF = PASS

OPENAPI_CHANGE = NONE
API_CLIENT_CHANGE = NONE
RUNTIME_CHANGE = NONE

BROAD_REGRESSION = NOT_RUN_BY_DESIGN

NEXT_CHECKPOINT = APP7-B05
```

## 2. Preflight — recomputed, not read from B03

| Fact | Value |
|---|---|
| Branch | `production` |
| Entry HEAD | `b5f7bf2` *docs(app7): record APP7-B03 and advance the roadmap* |
| Migration count at entry | **36**, highest `0036_add_app6_cop_design_context.sql` |
| Live tables at entry | **78** / 849 columns / 165 FK / 52 UNIQUE / 204 CHECK / 215 indexes / 34 triggers |
| Canonical fingerprint at entry | `3fd107f29426e72448eee04661aeb274396fbef3191374788cc345a960dd26f1` (APP6-DB01) |
| Next migration number | `0037` — derived from `ls migrations`, not from B03's report |

The working tree at entry carried no unrelated modification. Nothing was pushed.

## 3. The one authority divergence, stated rather than resolved silently

`APP7-G01` §9 proposed this column list:

```text
id, payment_attempt_id, asset_id, grant_id, step_up_challenge_id,
submitted_at, created_at, updated_at
```

The `APP7-DB01` directive §4 **forbids** `grant_id`, `step_up_challenge_id` and
a `submitted_at` alias by name, and §4's last line routes the submission instant
to the convention `created_at`. The directive is the later and more specific
Product Owner instruction, and it names precisely the columns G01 had listed —
a deliberate narrowing, not an oversight — so it was implemented and the
divergence is recorded here and in `IMP-D055` rather than blocking the
checkpoint.

The narrowing is also substantively right, which is why it was not escalated:

- `payment_attempts.grant_id` and `payment_attempts.step_up_challenge_id`
  already exist (`0024_create_payment_tables.sql`, REL-085), and `APP7-G01` §7.5
  itself says the step-up is *"already recorded on
  `payment_attempts.step_up_challenge_id` and re-verified, not re-issued"*.
  Copying both onto the association would create a second source for a fact the
  parent row holds, and evidence never migrates between attempts (§7.2, LC-16),
  so the copy could never legitimately differ.
- `submitted_at` beside `created_at` is two names for one instant.
- `updated_at` on an append-only table is a column nothing can ever advance;
  the manifest checker's convention rule (`db-manifest-check.mjs` check 12)
  independently forbids it for an `append` mutability class.

Everything G01 locked as *binding* is unchanged: owner context, table name, both
`NOT NULL` `restrict` foreign keys, the ban on a generic `asset_links` table,
the ban on a `role` column, and `UNIQUE (payment_attempt_id, asset_id)`.

## 4. Schema authority audit

`ADR-DB4-003` prohibits a generic `asset_links` table and requires each
consuming context to own a typed association with `NOT NULL`, `restrict`
foreign keys on both ends. The seven delivered association tables were audited
before anything was written:

| Table | Owner | Reusable for payment evidence? |
|---|---|---|
| `product_media` | CTX-CAT | No — Catalog media, public |
| `design_template_assets` | CTX-DSN | No — template binaries |
| `design_session_assets` | CTX-DSN | No — pre-request session uploads |
| `design_version_assets` | CTX-DSN | No — frozen into a formal version |
| `gallery_entry_assets` | CTX-GAL | No — public gallery |
| `production_artifacts` | CTX-PRD | No — internal unwatermarked output |
| `custom_request_assets` | CTX-ORD | **Nearest, and still no** — its `role` is a closed CHECK (`COP_IMAGE`, `REFERENCE`, `ATTACHMENT`), so reuse needs a migration anyway; and it binds to the **request**, not the attempt, which would make a payment fact Ordering-owned and lose the attempt binding a retry depends on |

`payment_attempts` cannot carry a single `asset_id`: up to five images are
allowed per attempt and `ADR-DB4-003` reserves direct FK columns for
single-valued references. So the gap `APP7-G01` §9 identified is real and there
was exactly one correct answer.

### 4.1 Sibling comparison — the shape was copied, not invented

`design_version_assets` (TBL-029) is the closest structural sibling: an
association with **no role column**, a uuid7 surrogate id, a two-column UNIQUE,
`created_at` and no `updated_at`, and `restrict` on both edges.

| | `custom_request_assets` | `design_version_assets` | **`payment_transfer_evidence`** |
|---|---|---|---|
| PK | `id` uuid7 | `id` uuid7 | `id` uuid7 |
| Owner FK | `custom_request_id`, restrict | `design_version_id`, restrict | `payment_attempt_id`, restrict |
| Asset FK | `asset_id`, restrict | `asset_id`, restrict | `asset_id`, restrict |
| Role | `role` + CHECK | none | **none** |
| UNIQUE | (request, asset, role) | (version, asset) | **(attempt, asset)** |
| `created_at` | yes | yes | yes |
| `updated_at` | yes | no | **no** |
| Explicit index | none | none | **none** |

Nothing about the new table is a new style.

## 5. Exact SQL

```sql
CREATE TABLE "payment_transfer_evidence" (
	"id" uuid NOT NULL,
	"payment_attempt_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_payment_transfer_evidence" PRIMARY KEY("id"),
	CONSTRAINT "uq_payment_transfer_evidence__attempt_asset" UNIQUE("payment_attempt_id","asset_id")
);
--> statement-breakpoint
ALTER TABLE "payment_transfer_evidence" ADD CONSTRAINT "fk_payment_transfer_evidence__payment_attempt_id" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_transfer_evidence" ADD CONSTRAINT "fk_payment_transfer_evidence__asset_id" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;
```

Three statements. No `ALTER` of any delivered table, no seed data, no backfill,
no `UPDATE`, no `INSERT`, no `DROP` of anything this migration did not create.
The file's header comment carries the reasoning; the executable body is exactly
the three statements above.

### 5.1 Generation note — the drizzle-kit `$'` defect, exactly as APP6-DB01 predicted

`APP6-DB01` §3.1 recorded that `drizzle-kit generate` emits a spurious
`DROP CONSTRAINT` / re-`ADD` pair for
`ck_approval_snapshots__preview_hash_format`, with the re-add truncated at
`'^sha256:[0-9a-f]{64}` because the constraint's value contains `$'` — the
JavaScript `String.prototype.replace` substitution pattern meaning "the text
after the match" — and it told the next database-change checkpoint to expect the
same pair and trim it the same way.

It recurred verbatim. Both statements were removed from the SQL, and the same
corrupted value in `meta/0037_snapshot.json` was repaired to the value
`0036_snapshot.json` records — which is the constraint actually installed, since
nothing in this migration touches it. After the repair, `meta/0037_snapshot.json`
differs from `meta/0036_snapshot.json` **only** by `id`, `prevId` and the new
table's block.

The defect bit once more during the repair itself: a `perl -0pi -e "s/…/…\$'…/"`
replacement expanded `$'` as Perl's POSTMATCH variable and inflated the snapshot
from ~348 KB to ~491 KB. That attempt was discarded, the 0037 artifacts deleted,
the journal restored from git, and the migration regenerated from scratch; the
repair was then done with a plain `String.split`/`join` in Node, which has no
substitution grammar. **The same trap applies to any tool that treats a
replacement string as a pattern — the next checkpoint should repair this value
with a literal split/join, not a regex replacement.**

## 6. Indexes and rationale

| Index | Origin | Why |
|---|---|---|
| `pk_payment_transfer_evidence` | constraint-created (PK) | row identity |
| `uq_payment_transfer_evidence__attempt_asset` | constraint-created (UNIQUE) | the CST-043 duplicate-association arbiter; leads on `payment_attempt_id`, so one attempt's evidence rows are one contiguous range |
| — | **no explicit index added** | both derived access paths are already served |

Derived access paths, and why each needs nothing more:

- **APP7-B05, list/count evidence by `payment_attempt_id`** — the UNIQUE's
  leading column is exactly that prefix.
- **APP7-B05, bind the exact `(payment_attempt_id, asset_id)`** — the UNIQUE is
  that key, and it is also the conflict arbiter.
- **APP7-B06, resolve one association before delivery** — the same two-column
  key.

No `created_at` index, no customer/order index, no status index, no GIN, no
partial index. Per the index manifest's application-era rule, **no `IDX-*` slot
is allocated**: the DB5 register is the launch access-path catalog.

Live proof: `pg_index` on the table returns exactly the two constraint-created
indexes and nothing else (`adds no explicit index beyond the two
constraint-created ones`).

## 7. Uniqueness — source and rationale

`UNIQUE (payment_attempt_id, asset_id)` is the **CST-043** family rule
(`DB4_KEYS_AND_CONSTRAINTS.md`), stated for `design_version_assets` as
`(owner, asset)` and for `custom_request_assets` as `(owner, asset, role)`.
This table has no role, so `(owner, asset)` is the whole key — the narrowest
rule consistent with ADR-DB4-003 and the siblings.

Two uniqueness shapes were explicitly **rejected**:

- `asset_id` globally UNIQUE — no Asset authority requires a binary to belong to
  exactly one consuming association globally, and no sibling asserts it. Proved
  not to hold: one asset binds to two different attempts.
- `payment_attempt_id` UNIQUE — would cap evidence at one image and contradict
  `APP7-G01` §7.2. Proved not to hold, twice: a second distinct asset binds to
  the same attempt, and a live `pg_index` scan finds **no** single-column unique
  index on either column.

## 8. Retention and delete policy — proved in real PostgreSQL

Both edges are `ON DELETE RESTRICT`, asserted from `pg_constraint.confdeltype =
'r'` rather than read off the TypeScript:

| Case | Result |
|---|---|
| valid attempt + valid asset → insert | **succeeds** |
| unknown `payment_attempt_id` | refused, `23503` |
| unknown `asset_id` | refused, `23503` |
| `NULL` on either edge | refused, `23502` |
| `DELETE` a payment attempt that has evidence | refused, `23503`; the association row is still there afterwards |
| `DELETE` an asset that is bound as evidence | refused, `23503`; the association row is still there afterwards |

Both delete tests delete the parent **for real** and assert the SQLSTATE,
because a `cascade` would delete the evidence row and report success — the
failure mode is silent, so inspecting the schema would not have caught it.

No delete route, runtime delete behaviour or tombstone change is introduced.
Disposal continues through the delivered G4 asset tombstone flow, which now
sees this association.

## 9. Cardinality proof

| Case | Result |
|---|---|
| attempt + asset A | succeeds |
| attempt + asset A again | refused, `23505` |
| attempt + asset B | succeeds (count = 2) |
| **six** rows on one attempt | **all six succeed** |
| one asset bound to two different attempts | succeeds |

The sixth row is the load-bearing assertion. `MAX_EVIDENCE_PER_ATTEMPT = 5` is
an application guard under the payment-attempt row lock (`APP7-G01` §7.2); if
the database refused a sixth row, the bound would have been encoded in the wrong
layer and `APP7-B05` would be enforcing it twice. The table is also proved to
carry **zero** CHECK constraints and **zero** triggers, so no count trigger,
delete-prevention trigger or append-only trigger family was invented.

## 10. Collateral — proved unchanged

| Claim | How |
|---|---|
| No new asset kind or classification | `ck_assets__kind_allowed` / `ck_assets__classification_allowed` read live: contain `CUSTOMER_UPLOAD` and `CUSTOMER_PRIVATE`, and contain none of `PAYMENT_EVIDENCE`, `BANK_TRANSFER_RECEIPT`, `PAYMENT_PRIVATE` |
| `payment_attempts` gains no `asset_id` | `information_schema.columns` returns no such column |
| No generic `asset_links` table | `information_schema.tables` returns no such table |
| No CHECK added anywhere | live CHECK count 204 → 204 |
| No trigger added anywhere | live trigger count 34 → 34, one S24 function, APP3-DB01's 4 intact |
| No payment/order state change | no migration statement touches any delivered table |
| `ck_approval_snapshots__preview_hash_format` survives with its `$` anchor | asserted after the real 0036 → 0037 upgrade (`{64}$` present) |

## 11. Upgrade proof — run as an upgrade, not described as one

`app7-transfer-evidence-upgrade.integration.spec.ts` builds the real
pre-APP7-DB01 baseline by copying the **committed** migration files into a
temporary folder with a trimmed journal (0000–0036 only), so the SQL under test
is byte-identical to what is committed. It then seeds a complete payment chain —
customer → contact → request → grant → challenge → quotation → version → design
case → design version → approval snapshot → order → DEPOSIT obligation →
`PENDING` attempt — plus a `CUSTOMER_UPLOAD` / `CUSTOMER_PRIVATE` asset, all
while `payment_transfer_evidence` does not yet exist, and only afterwards applies
0037 from the committed folder.

| Assertion | Result |
|---|---|
| baseline records exactly 36 migrations, table absent | PASS |
| after 0037: exactly 37 migrations, table present | PASS |
| new table is **empty** while `payment_attempts` and `assets` are non-empty | PASS |
| the pre-existing attempt is field-for-field unchanged (`status`, `amount`, `method`) | PASS |
| the pre-existing asset is field-for-field unchanged (`kind`, `classification`, `status`) | PASS |
| that pre-existing attempt and asset bind once the table exists | PASS |
| catalog after upgrade: 79 tables / 167 FK / 53 UNIQUE | PASS |

```text
backfill = none
```

No backfill is possible or needed: `APP7-B05` has not shipped, so no
transfer-evidence association can exist, and the migration contains no `UPDATE`
and no `INSERT`.

## 12. Live baselines — measured on disposable databases

Three databases were created independently and migrated through the real
`src/cli/migrate.ts` runner. All six DB6-S26 checkers ran against the first:

| Figure | After `0036` | After `0037` | Checker result |
|---|---|---|---|
| Tables | 78 | **79** | `79 / 79` |
| Columns | 849 | **853** | `853 / 853` |
| PK constraints | 78 | **79** | `79 / 79` |
| FK constraints | 165 | **167** | `167 / 167` |
| UNIQUE constraints | 52 | **53** | `53 / 53` |
| CHECK constraints | 204 | **204** | `204 / 204` |
| Physical indexes | 215 (48 partial) | **217 (48 partial)** | `217 / 217`, partial `48 / 48` |
| Triggers | 34 | **34** | `34 / 34` |

The relationship ceiling now reports
`167 / 167 (160 DEV-DB6-017 + 2 APP3-DB01 + 1 APP5-DB01 + 2 APP6-DB01 + 2 APP7-DB01)`.
JSONB (9 columns, 0 GIN/GiST/BRIN) and money checkers pass unchanged.

**Fingerprint:**

```text
56294cd801e12981aa6d5a84d56c339cea234545f9cc7e151c9ed17cf67376af
```

Reproduced byte-for-byte on a second independently built database, and
`db-fingerprint-gate.mjs` then reported `match` against a **third** freshly
migrated database. `canonical-fingerprint.txt` is rebased from APP6-DB01's
`3fd107f2…` to this value.

## 13. No-op / drift proof

- `drizzle-kit check` — `Everything's fine` before and after the journal was
  restored.
- A throwaway `drizzle-kit generate` round-trip produced a migration containing
  **only** the known spurious `ck_approval_snapshots__preview_hash_format` pair
  — proof that every hand-edit round-trips exactly and that the new table is
  fully captured in `meta/0037_snapshot.json`. The throwaway migration and
  snapshot were deleted and the journal entry removed; `_journal.json` ends at
  `idx: 37`.
- `db-migration-checksum-check.mjs` — `all 37 migration files match the frozen
  manifest`. Migrations `0000`–`0036` are byte-identical to HEAD.

## 14. Manifest, deviation and metric reconciliation

| Document / register | Change |
|---|---|
| `DB4_RELATIONSHIP_AND_FK_MODEL.md` | **+REL-109** (`payment_transfer_evidence → payment_attempts / assets`, `N–1 ×2`, restrict ×2), marked `APP7-DB01`, appended in the same forward-additive style as REL-106/107/108. No historical row edited |
| `DB4_KEYS_AND_CONSTRAINTS.md` | CST-043's table list gains `payment_transfer_evidence (APP7-DB01)`. **No new CST ID** — the rule is the existing association family, not a new constraint concept |
| `DB6_SCHEMA_IMPLEMENTATION_MANIFEST.md` | REL range → REL-001..109; documented REL rows 95 → 96; expanded edges 167 → **169**; multiplicity table ×2 row 20 → 21 (40 → 42 edges), total 96 rows / 169; G16 register gains **TBL-079** `payment_transfer_evidence` (`uuid7`, `assoc, append`, implemented); group roll-up G16 5 → 6 with G17–G19 cumulatives restated (76/78/**79**); §4.1 group row G16 `6 / 48 / 8 / 56 / 15 / 71` and Total `79 / 537 / 111 / 648 / 205 / 853`; §4.1 prose records APP7-DB01 as the fourth application-era addition and the first to add a table |
| `DB6_INDEX_IMPLEMENTATION_MANIFEST.md` | Post-launch note extended: two constraint-created indexes, live total **217**, partial split unchanged at 48, **no `IDX-*` slot allocated**, and why no explicit index was added. The frozen launch formula (128 + 83 = 211) is deliberately **not** rewritten |
| `14-IMPLEMENTATION-DECISION-REGISTER.md` | **+IMP-D055** — the table, its exact shape, every column deliberately absent, the non-physical five-per-attempt bound, and the recorded narrowing of G01 §9 |
| `column-metrics.ts` | `['payment_transfer_evidence', 'G16', 0, 2, 2, 4]` — no DB4 `COL-*` IDs (the table postdates the register), so both business columns count as expansions |

**The new table and both edges are inside the parity metrics, not exempted
from them.** Historical DB4 counts are not rewritten: DB6's launch figures stay
78 tables / 833 columns / 211 indexes, and every application-era addition is a
named addend beside them.

Checker constants updated so the gates measure the new truth rather than being
told to ignore it:

| Checker | Change |
|---|---|
| `tools/db-manifest-check.mjs` | `LAUNCH_TABLES = 78` (the TBL-001..078 coverage sweep) split from `TOTAL_TABLES = 79`; a new assertion requires the manifest to carry exactly 79 TBL rows |
| `tools/db-metric-check.mjs` | `EXPECTED_REL_ROWS` 95 → 96, `EXPECTED_FK_EDGES` 167 → 169 |
| `db-live-tables-check.mjs` | 78 → 79 tables, 849 → 853 columns |
| `db-live-constraints-check.mjs` | `{ p: 79, f: 167, u: 53, c: 204 }`; new `APP7_DB01_EDGES = 2` addend in the relationship ceiling |
| `db-live-indexes-check.mjs` | total 215 → 217, PK backing 78 → 79, UNIQUE backing 52 → 53; partial counts untouched |
| `canonical-fingerprint.txt` | rebased to `56294cd8…` |
| `migration-checksums.json` | `0037_add_app7_transfer_evidence_association.sql` → `4bd4fa795eb27022ffaf04c03a291a3752807ff80349afc0b50efd65c1086390` |

## 15. Changed files

**New**

| File | Lines |
|---|---|
| `packages/database/src/schema/payment/payment-transfer-evidence.ts` | 83 |
| `packages/database/migrations/0037_add_app7_transfer_evidence_association.sql` | 101 (98 comment, 3 statements) |
| `packages/database/migrations/meta/0037_snapshot.json` | generated |
| `packages/database/src/schema/app7-transfer-evidence-fixture.ts` | 183 |
| `packages/database/src/schema/app7-transfer-evidence.integration.spec.ts` | 371 |
| `packages/database/src/schema/app7-transfer-evidence-upgrade.integration.spec.ts` | 233 |
| `docs/implementation/reports/APP7-DB01-COMPLETION-REPORT.md` | this file |

**Modified**

| File | Change |
|---|---|
| `packages/database/src/schema/index.ts` | one G16 export, marked application-era |
| `packages/database/src/schema/column-metrics.ts` | one register row |
| `packages/database/migrations/meta/_journal.json` | one entry, `idx: 37` |
| `packages/database/tools/canonical-fingerprint.txt` | rebased |
| `packages/database/tools/migration-checksums.json` | one entry |
| `packages/database/tools/db-live-tables-check.mjs` | counts |
| `packages/database/tools/db-live-constraints-check.mjs` | counts + addend |
| `packages/database/tools/db-live-indexes-check.mjs` | counts |
| `tools/db-manifest-check.mjs` | launch/total table split + row-count assertion |
| `tools/db-metric-check.mjs` | REL row/edge constants |
| `docs/database/DB4_RELATIONSHIP_AND_FK_MODEL.md` | +REL-109 |
| `docs/database/DB4_KEYS_AND_CONSTRAINTS.md` | CST-043 table list |
| `docs/database/DB6_SCHEMA_IMPLEMENTATION_MANIFEST.md` | TBL-079, counts, §4.1 |
| `docs/database/DB6_INDEX_IMPLEMENTATION_MANIFEST.md` | post-launch note |
| `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` | +IMP-D055 |
| `docs/implementation/phases/APP7-DEPOSIT-PAYMENT-AND-ORDER-CREATION.md` | status table |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | APP7 row |

`packages/database/src/schema/app7-transfer-evidence-fixture.ts` is a test-only
seed helper, not a catch-all: it has one responsibility (build the nine-table
chain a payment attempt requires) and both APP7-DB01 suites consume it. It lives
beside the specs at `src/schema/`, outside the context subdirectories the
manifest checker scans, and is not exported from the package entrypoint.

## 16. Disposable-database method

Every database was created and dropped per run. The shared development database
was never migrated, mutated or read for evidence.

- The two Jest suites use the delivered DB7 harness (`createDisposableDatabase`
  / a per-suite `CREATE DATABASE` + `DROP … WITH (FORCE)`).
- The live checkers were driven by a scratchpad harness that creates the
  database, migrates it through `src/cli/migrate.ts`, and then spawns each
  checker with the password **stripped** from the connection string, passing it
  through `PGPASSWORD` in the child's environment. No credential was echoed,
  logged, committed or passed as a command-line argument.
- `DATABASE_URL` was read from `.env` by tooling, file → process, and never
  printed. **No write to `.env` was made and no credential was rotated.**
- All three checker databases (`app7db01_live_a/b/c`) were dropped at the end.

## 17. Command ledger

| Command | Acceptance criteria proved | Result | Reruns | Why scoped |
|---|---|---|---:|---|
| `pnpm --filter @embroidery/database typecheck` | 34 | **PASS** | 2 (after the schema file, after the specs) | package-scoped |
| `pnpm db:generate` (drizzle-kit) | 21, 22, 24 | **generated once** | 1 (the discarded corrupted attempt — §5.1) | canonical generation |
| `pnpm --filter @embroidery/database test -- src/schema/app7-transfer-evidence.integration.spec.ts` | 1–17, 19, 20, 29 | **PASS 19/19** | 2 (first run red — missing `product_sides.code`; once after Prettier) | the association's physical rules |
| `pnpm --filter @embroidery/database test -- src/schema/app7-transfer-evidence-upgrade.integration.spec.ts` | 21, 23, 25 | **PASS 7/7** | 0 | the real 0036 → 0037 upgrade |
| `pnpm --filter @embroidery/database test -- src/schema/column-metrics.spec.ts` | 27 | **PASS 83/83** | 0 | the only suite owning the column register |
| `node tools/db-manifest-check.mjs` | 27, 28 | **PASS** (all 11 notes) | 1 (once red before the register/doc edits) | `CMD-DB-MANIFEST-CHECK` |
| `db-live-tables-check.mjs` | 1, 27 | **PASS** `79 / 853` | 0 | live catalog baseline |
| `db-live-constraints-check.mjs` | 3–6, 15, 17 | **PASS** `79/167/53/204` + ceiling | 0 | live constraint baseline |
| `db-live-indexes-check.mjs` | 27 | **PASS** `217`, partial `48` | 0 | proves only two constraint indexes were added |
| `db-live-triggers-check.mjs` | 17, 18 | **PASS** `34 / 34` | 0 | proves no trigger family was invented |
| `db-live-jsonb-check.mjs`, `db-live-money-check.mjs` | 11 | **PASS** | 0 | same harness pass |
| `db-schema-fingerprint.mjs` ×2 | 26 | **PASS**, identical on two independent databases | 0 | reproducibility |
| `db-fingerprint-gate.mjs` | 26 | **PASS**, `match` on a third fresh database | 0 | DB6-S27 gate |
| `node packages/database/tools/db-migration-checksum-check.mjs` | 22, 23 | **PASS** `37/37` | 1 (after adding the new entry) | migration-bytes gate |
| `npx drizzle-kit check` | 26 | **PASS** `Everything's fine` | 1 (after the throwaway round-trip was reverted) | drift |
| `pnpm --filter @embroidery/database lint` | 35 | **PASS** | 0 | package-scoped |
| `npx prettier --check <changed files>` | 35 | **PASS** | 1 (after one `--write` on two files) | changed files only |
| `pnpm --filter @embroidery/database build` + `pnpm --filter @embroidery/api typecheck` | 34 | **PASS** | 0 | the API typechecked against the **rebuilt** database `dist` |
| `node tools/check-file-size.mjs` | file-size governance | **PASS for this checkpoint's files** (repo-wide red at HEAD, 79 pre-existing violations, none in this checkpoint) | 0 | repository gate |
| `git diff --check` | 35 | **PASS** | 0 | whitespace |

**No broad regression was run.** No `pnpm quality` (GOV-Q01 deleted it), no full
API/worker/Admin/Storefront suite, no Playwright, no SonarQube, no Figma gate, no
OpenAPI or generated-client generation, no historical DB7/DB8 sweep, no Payment
or Asset runtime suite, no B03 API tests, no W01 worker tests. No successful
check was rerun on unchanged input; every rerun above followed a real input
change and is counted.

### 17.1 What the focused suites caught

The association suite's first execution failed all 19 tests in `beforeAll`:
`product_sides.code` and `embroidery_areas.code` became `NOT NULL` in APP3-DB01
(migration 0034) and the seed chain, modelled on an older fixture, omitted both.
This is the same class of staleness `APP7-R00` recorded as
`APP7_ORDER_AGGREGATE_ENTRY_STATUS = STALE_TEST_EXPECTATIONS` and `APP7-W01`
closed for the AGG-15 fixtures — a fixture defect, not a runtime one. The new
fixture supplies both codes and no shipped code was changed.

## 18. What DB01 deliberately did **not** do

```text
AssetIntakeLane / PAYMENT_EVIDENCE_INTAKE_LANE  = not implemented
evidence upload endpoint                         = not implemented
five-per-attempt application guard               = not implemented (APP7-B05)
association binder / use case                    = not implemented
customer evidence read                           = not implemented
Admin evidence metadata / preview / delivery     = not implemented
payment verification                             = not implemented
```

No Nest controller, module, use case, repository or provider was added or
changed. No file under `apps/` or `packages/persistence/` was touched.

```text
OPENAPI = unchanged 79 paths / 86 operations / 180 schemas
```

Verified by construction — no controller, DTO, decorator or route file was
touched, so no generation was run and none was needed. `openapi:generate` and
the api-client generator were **not** executed.

Figma: `NO CHANGE`. Runtime API/worker: `NO CHANGE`.

## 19. Acceptance criteria

| # | Criterion | Evidence |
|---:|---|---|
| 1 | Exactly one new CTX-PAY association table | live tables 78 → 79; §12 |
| 2 | Binds payment attempt to asset | §5 |
| 3 | `payment_attempt_id` NOT NULL | live `is_nullable = NO`; §8 |
| 4 | `asset_id` NOT NULL | live `is_nullable = NO`; §8 |
| 5 | Payment-attempt FK RESTRICT | `confdeltype = 'r'` + real delete refusal; §8 |
| 6 | Asset FK RESTRICT | `confdeltype = 'r'` + real delete refusal; §8 |
| 7 | No generic `asset_links` | live `information_schema.tables`; §10 |
| 8 | No `role` column | live column list; §10 |
| 9 | No convenience order/request/customer/obligation/grant fields | 24-name forbidden-column assertion; §10 |
| 10 | No media/storage metadata duplicated | same assertion |
| 11 | No JSONB | live `data_type` scan |
| 12 | No payment state field | same assertion (`status` forbidden) |
| 13 | No new asset kind/classification | live CHECK definitions; §10 |
| 14 | No existing payment table gains `asset_id` | live column query; §10 |
| 15 | Duplicate attempt+asset refused | `23505`; §9 |
| 16 | More than one asset per attempt | count = 2, and six accepted; §9 |
| 17 | No max-five CHECK/trigger | 0 CHECKs, 0 triggers on the table; §9 |
| 18 | No new trigger family | live trigger total 34 → 34; §12 |
| 19 | Both FK delete restrictions proven in real PostgreSQL | §8 |
| 20 | Schema belongs to Payment | `src/schema/payment/`, G16 |
| 21 | Forward-only | §13, checksum gate |
| 22 | Exactly one new migration | 36 → 37 |
| 23 | Existing migrations untouched | `37/37` checksum match |
| 24 | Disposable fresh apply passes | §12 |
| 25 | Upgrade from prior baseline passes | §11 |
| 26 | No-op/drift/parity pass | §13 |
| 27 | New table/edges in canonical metrics | §14 |
| 28 | Historical DB4 docs not rewritten | §14 |
| 29 | No runtime upload/delivery code | §18 |
| 30 | No HTTP operation added | §18 |
| 31 | OpenAPI/client unchanged | §18 |
| 32 | No B05 code started | §18 |
| 33 | Focused DB tests pass | 19 + 7 + 83 |
| 34 | Affected typecheck/build passes | §17 |
| 35 | Changed files lint/format clean | §17 |
| 36 | No broad regression | §17 |
| 37 | No PASS rerun on unchanged input | §17 |
| 38 | Nothing pushed | §20 |
| 39 | Completion report exists | this file |
| 40 | Roadmap marks DB01 COMPLETE | §20 |
| 41 | Exactly one Next = `APP7-B05` | §20 |

## 20. Commits and push status

| Commit | Contents |
|---|---|
| A | DB01 schema + migration + snapshot/journal + manifest/deviation/checker reconciliation + focused physical tests |
| B | DB01 completion report + APP7 roadmap and phase-plan evidence |

```text
push status = NOT_PUSHED
```

No predecessor commit was amended and no unrelated user change was mixed in.

## 21. Next

```text
APP7-DB01 = COMPLETE
NEXT_CHECKPOINT = APP7-B05 — Customer transfer-evidence upload + own-evidence read
```

`APP7-B05` owns the intake lane, the attempt row lock, the five-per-attempt
count, the append-only customer behaviour and the association binder.
`APP7-B04` and `APP7-B06` own the later Admin behaviour. **STOP** — none of them
is started here.
