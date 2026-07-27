# APP2-DB01 — Catalog Derivative Schema & Lifecycle Alignment — Completion Report

- **Checkpoint:** `APP2-DB01` — add the non-watermarked catalog preview
  derivative kind and align the catalog-media processing lifecycle for
  `APP2-W01`
- **Date:** 2026-07-27
- **Branch:** `production` (nothing pushed)
- **Verdict:** **`PASS`**
- **Decision:** IMP-D030 (`14-IMPLEMENTATION-DECISION-REGISTER.md`);
  ADR pointer in
  [`ADR-APP2-001`](../../adr/backend/ADR-APP2-001-OBJECT-STORAGE-AND-ASSET-INTAKE.md)
  (schema-change note, §4.7, §5, §8, §9)

---

## A. Preflight and exact HEAD history

`APP2_DB01_PREFLIGHT = PASS`

| Command | Result |
|---|---|
| `git branch --show-current` | `production` |
| `git rev-parse HEAD` | `ac81a2afc7879825722dfb03723b35aa22209056` |
| `git status --short` | empty (clean tree) |
| `git log -28 --oneline` | `ac81a2a` at HEAD, `a1cb712` beneath it; **no `APP2-W01` implementation commit exists** |
| `pnpm quality` | `EXIT=0` |
| `pnpm check:openapi` | up to date |
| `pnpm check:api-client` | tree hash `55de1cc158cf5ab112dae8e8c63f45fe5fee9de1d36aedbb222f0fcec0a6216b` |
| `pnpm check:figma-design-index` | 69 registry IDs, 69 node rows |
| `pnpm db:check:manifest` | all checks passed (78 tables / 833 columns / 31 migrations) |
| `git diff --check` | clean |

### The `adba51d` → `ac81a2a` amend relationship (verified, not assumed)

The `APP2-W01` audit recorded entry HEAD as `ac81a2a…`. Read from Git:

```text
adba51d58377613c19c92711d15617ed1b120c9f  docs(app2): record asset-intake API evidence
ac81a2afc7879825722dfb03723b35aa22209056  docs(app2): record asset-intake API evidence
```

`git merge-base --is-ancestor adba51d HEAD` → **false**: `adba51d` is not
reachable from `production`. `git cat-file -p ac81a2a` shows
`parent a1cb712eaa6f8c6e50539e721001d83f94f3efd4` — the accepted B01 Commit A —
and `git diff adba51d ac81a2a` is exactly two files:

```text
infrastructure/compose/docker-compose.dev.yml | 19 +
infrastructure/docker/api.Dockerfile          | 13 +-
```

So `ac81a2a` **is** the B01 evidence Commit B, amended to carry a development
image fix (the API dev image never built `@embroidery/object-storage` to `dist`,
so `nest build` failed inside the container with TS2307, and the Compose
services that build `AppModule` were missing the `OBJECT_STORAGE_*` variables).
`adba51d` is the amended-away object. Both abbreviated hashes in the prompt were
resolved to full hashes from Git rather than trusted as written.

---

## B. The proven `APP2-W01` blocker

Reproduced from source, not quoted from the audit.

`packages/database/src/schema/asset/asset-derivatives.ts` (pre-change) and
`migrations/0006_create_asset_tables.sql`:

```sql
CONSTRAINT "ck_asset_derivatives__kind_allowed"
  CHECK (kind in ('PREVIEW_WATERMARKED', 'MOCKUP', 'NORMALIZED', 'THUMBNAIL'))
```

`APP2-W01` must produce two **non-watermarked** outputs: a bounded thumbnail and
a bounded catalog display image. `THUMBNAIL` maps uniquely. The second had no
valid home:

| Candidate | Why it was rejected |
|---|---|
| `PREVIEW_WATERMARKED` + `is_watermarked=false` | The kind's identity **is** the watermark: `DB0` INV-22, `04 BR-012` ("customer-visible previews must contain watermark"), `DB4` COL-TBL024-06, and `DB4_INVARIANT_SCHEMA_TRACEABILITY` which represents INV-22 as the pair `is_watermarked + kind`. `ADR-APP2-001` §4.7 additionally resolves *this* key on the public read path, so an unwatermarked row would later be served under a watermarked identity. |
| `NORMALIZED` | DB2 CON-042 merged CON-061 "Preview" into the **watermarked** derivative; calling a normalized artwork copy "the catalog preview" silently redefines a locked domain concept, and nothing anywhere defines its bounds, format or purpose. |
| `MOCKUP` | Unrelated (a rendered product mockup). |

Two defensible candidates with opposite semantics ⇒ the map is not unique ⇒ the
gate blocked correctly. Root cause: the kind vocabulary was designed for the
design/artwork pipeline; nobody modelled an unwatermarked **catalog** display
derivative. For `CATALOG_MEDIA` — store-owned marketing media — unwatermarked is
the business-correct outcome, so the missing thing is the kind, not the policy.

The same audit produced three secondary findings, all addressed below or routed:
LC-06 says derivatives start at `PENDING` (§F), LC-06 read as "derivatives only
after `ACCEPTED`" (§F), and `ensurePrivateBuckets` has no production caller
(§M — routed to `APP2-I03`, deliberately **not** bundled here).

---

## C. Existing schema / constraint audit

Read before editing: the three asset schema files, `0006_create_asset_tables.sql`,
`0030_add_integrity_triggers.sql`, the manifest and fingerprint tooling, DB0/DB2/
DB3/DB4/DB6 canonical documents, DB7 harness and repositories, both APP2 ADRs,
the phase plan, decision register, roadmap and traceability matrix.

| Item | Exact current value |
|---|---|
| Derivative kind CHECK | `ck_asset_derivatives__kind_allowed` |
| Derivative state CHECK | `ck_asset_derivatives__status_allowed` — `PENDING`, `PROCESSING`, `READY`, `FAILED` |
| Watermark CHECK | **none existed** — `is_watermarked` was a bare `boolean NOT NULL` (see §E) |
| Partial uniqueness | `uq_asset_derivatives__asset_kind__not_failed` on `(asset_id, kind) where status <> 'FAILED'` (CST-018 / IDX-020) |
| Derivative storage-key uniqueness | `uq_asset_derivatives__storage_key__set` where `storage_key is not null` (IDX-064) |
| READY storage-key CHECK | `ck_asset_derivatives__ready_has_storage_key` — `status <> 'READY' or storage_key is not null` |
| Checksum CHECK | `ck_asset_derivatives__checksum_format` — `^sha256:[0-9a-f]{64}$` |
| Asset states | `UPLOADED`, `INSPECTING`, `ACCEPTED`, `REJECTED`, `DELETION_PENDING`, `DELETED` |
| Inspection outcomes / detail | `ACCEPTED`, `REJECTED`; `detail` is `text` (nullable) |
| Inspection append-only trigger | `trg_asset_inspections__reject_mutation`, `BEFORE UPDATE OR DELETE`, mode `always`, delete policy `retention_exempt` (migration 0030) |
| Migration numbering | zero-padded four digits + snake-case tag, journal `meta/_journal.json`, snapshot `meta/NNNN_snapshot.json`, frozen SHA-256 in `tools/migration-checksums.json` |
| Schema-source tuple export | `ASSET_DERIVATIVE_KINDS` / `ASSET_DERIVATIVE_STATES` `as const` tuples; the CHECK, the partial-index predicate and the TS union all derive from them (DB5-A09) |

---

## D. The `CATALOG_PREVIEW` domain decision

```ts
export const ASSET_DERIVATIVE_KINDS = [
  'PREVIEW_WATERMARKED',
  'MOCKUP',
  'NORMALIZED',
  'THUMBNAIL',
  'CATALOG_PREVIEW',
] as const;
```

`CATALOG_PREVIEW` = a non-watermarked, display-oriented derivative generated
from a `CATALOG_MEDIA` asset for catalog / Admin / Storefront presentation. It
is **not** a customer design preview. `APP2-W01` will produce exactly
`THUMBNAIL` + `CATALOG_PREVIEW`, both `is_watermarked = false`.

Appended, not inserted: the four existing kinds keep their values **and their
positions**. The static spec asserts the first four by slice rather than as a
set, because appending is compatible and reordering is not. No generic `PREVIEW`
alias exists — that ambiguity is the whole reason the gate blocked.

---

## E. Watermark invariant

**Finding.** The `PREVIEW_WATERMARKED → is_watermarked = true` implication did
**not** exist physically. `0006_create_asset_tables.sql` declares only
`"is_watermarked" boolean NOT NULL`; `DB0_INVARIANT_INVENTORY` classes INV-22 as
`APP`-enforced and `DB3_INVARIANT_ENFORCEMENT_PLAN` as "**APP** (derivative
rules)". A watermarked-preview row asserting it carried no watermark was a
perfectly writable row before this checkpoint. This is recorded, not silently
fixed — per §6 it is the case that calls for one canonical CHECK enforcing both
implications:

```sql
CONSTRAINT ck_asset_derivatives__watermark_by_kind CHECK (
      (kind <> 'PREVIEW_WATERMARKED' or is_watermarked = true)
  and (kind <> 'CATALOG_PREVIEW'     or is_watermarked = false)
)
```

Registered as **CST-126** in `DB4_KEYS_AND_CONSTRAINTS.md` §4. `MOCKUP`,
`NORMALIZED` and `THUMBNAIL` are deliberately **unconstrained**: no existing
invariant fixes their watermark value, and forcing one would be a new rule
smuggled in under a schema change. No existing constraint was weakened; the
kind CHECK was replaced in place with a strictly wider allowed set.

The constraint is a row rule, so it holds on `UPDATE` as well as `INSERT` —
tested in both directions (§I).

---

## F. Catalog lifecycle alignment (DB3 LC-06)

Both contradictions the W01 gate reported are resolved as **authority**, with no
handler code written.

### F.1 Derivative entry state

The canonical lifecycle `PENDING → PROCESSING → READY | FAILED` is unchanged and
now binding on W01: a catalog derivative row is **never inserted directly as
`PROCESSING`**. For each of the two rows, inside the short preparation
transaction that runs before any object-store work:

1. insert-or-recover at `PENDING`;
2. guarded `PENDING → PROCESSING` — an `UPDATE … WHERE status = 'PENDING'` whose
   predicate names the expected current state;
3. a recovered `PROCESSING` row is a retry/replay and does **not** move backwards
   through `PENDING`.

No state and no migration was added for this rule.

**Stated precisely:** PostgreSQL enforces the *value* set, not the *transition*.
There is no derivative transition trigger and this checkpoint did not invent
one. The ordering rule is carried by the guarded predicate, and the tests assert
what that actually buys: the first claim affects one row, a second claim affects
**zero** (so at-least-once delivery cannot double-start), and an out-of-set
state is rejected with `23514`.

### F.2 Catalog-media timing

LC-06's single "SE-013 derivative jobs after `ACCEPTED`" reading was over-broad
and is superseded by two lanes:

| Lane | Timing |
|---|---|
| **Catalog media** (`CATALOG_MEDIA`, owner `APP2-W01`) | derivative generation **is** the inspection: prepare both rows while the asset is `INSPECTING`, generate, then one terminal transaction — both rows `READY` + exactly one `ACCEPTED` inspection + asset `INSPECTING → ACCEPTED` (or both `FAILED` + one `REJECTED` inspection + asset `REJECTED`, original retained) |
| **Design / artwork** (`PREVIEW_WATERMARKED`, `NORMALIZED`, `MOCKUP`) | unchanged — existing after-`ACCEPTED` SE-013 job timing and publication/design rules |

Bound rules: the asset does not reach `ACCEPTED` until both required derivatives
are `READY` **in the same transaction**, and a catalog derivative must never
become `READY` for an asset already `REJECTED`. `CATALOG_PREVIEW` changes no
customer-design preview semantics.

---

## G. `ASSET_PROCESSING` job-kind proof

`BACKGROUND_JOB_KINDS` (`packages/persistence`) already contains
`ASSET_PROCESSING`; the I02 runtime never hard-codes a kind. Verified in source:

- `JobHandler.jobKind: BackgroundJobKind` — declared by the handler;
- `JobHandlerRegistry.registeredTypes()` returns `{ eventType, jobKind }` pairs
  straight from the handlers;
- `JobExecutionService` passes `handler.jobKind` into every completion and into
  the correlation id — five call sites, no literal;
- `WorkerJobQueueRepository.claimRegisteredBatch` validates each registered pair
  with `assertKnownJobKind(registered.jobKind)` and writes expired-lease evidence
  as `job_kind: registered.jobKind`, so the reclaim path files
  `WORKER_LEASE_EXPIRED` under the **handler's** kind.

The only `OUTBOX_DISPATCH` occurrences in production source are the enum member
itself and test doubles. Therefore
`APP2-DB01 = BLOCKED_BY_WORKER_RUNTIME_JOB_KIND_DEFECT` does **not** apply, and
no worker runtime file was modified. The mapping is locked in documentation only
(ADR §8, IMP-D030, phase plan) plus a static spec.

---

## H. Migration

`packages/database/migrations/0032_add_catalog_preview_derivative_kind.sql` —
one new migration, next repository identifier, canonical descriptive tag.

Generated by `drizzle-kit generate` from the schema change (so the snapshot and
the DDL agree), then extended by hand with the two required preflight guards —
the same class as `0026` (CHECK DDL) and `0030` (triggers), which are also
hand-reviewed. Statement order:

1. **Preflight 1** — `DO $$` fails with a named error listing any stored `kind`
   outside the new allowed set. Without it, such a row survives the `DROP` and
   dies on the `ADD` with a bare `23514` naming no value.
2. **Preflight 2** — `DO $$` fails with counts if any `PREVIEW_WATERMARKED` row
   lacks a watermark or any `CATALOG_PREVIEW` row carries one. This is the first
   moment the data has ever been checked against INV-22 (§E).
3. `DROP CONSTRAINT ck_asset_derivatives__kind_allowed`
4. `ADD CONSTRAINT ck_asset_derivatives__watermark_by_kind`
5. `ADD CONSTRAINT ck_asset_derivatives__kind_allowed` (five values)

Properties: forward-only; canonical constraint names; existing kinds preserved;
derivative states, both uniqueness indexes and the READY/storage-key CHECK
untouched; **no table rewrite** (adding a CHECK validates with a scan, it does
not rewrite); no seed data; no existing migration file modified. The runner
applies each migration exactly once inside a transaction, so the window where
the kind CHECK is absent is invisible to other sessions — and the first `ALTER`
already holds `ACCESS EXCLUSIVE`.

Registered artifacts: journal entry `idx 32`, snapshot `meta/0032_snapshot.json`,
frozen checksum
`1ea3dc3e01479e362f574b2b751685720ac93ebcfb472d871ee7ef814111a495` in
`tools/migration-checksums.json` (`[migration-checksum] all 32 migration files
match the frozen manifest`).

---

## I. Fresh and upgrade tests

### I.1 Fresh install — `catalog-preview-derivative.integration.spec.ts` (18 cases)

All migrations applied from zero to a disposable database.

| Proof | Result |
|---|---|
| migration count / table count | 32 / 78 |
| the five derivative CHECK constraints exist under canonical names | asserted as an exact ordered list |
| `CATALOG_PREVIEW` + `is_watermarked=false` | accepted |
| `CATALOG_PREVIEW` + `is_watermarked=true` | `23514` |
| `UPDATE` watermarking an existing catalog preview | `23514` (the rule holds after arrival, not only on insert) |
| `PREVIEW_WATERMARKED` + `true` | accepted |
| `PREVIEW_WATERMARKED` + `false` | `23514` — the exact mapping the W01 gate rejected, now unwritable |
| `MOCKUP` / `NORMALIZED` / `THUMBNAIL` × both watermark values | all six accepted (freedom preserved) |
| unknown kind (`'PREVIEW'`) | `23514` |
| second non-FAILED `(asset, kind)` | `23505`; a replacement beside a `FAILED` row is accepted |
| `READY` without `storage_key` | `23514` |
| `asset_inspections` `UPDATE` / `DELETE` | `23000` both — trigger unchanged |

### I.2 Upgrade — `catalog-preview-upgrade.integration.spec.ts` (7 cases)

Run as a real upgrade, not described as one. The suite copies the **committed**
migration files into a temporary folder with a trimmed journal (bytes identical,
so the migrator's own hashes match), migrates to the exact pre-APP2-DB01
baseline, seeds one representative row per pre-existing kind with realistic
states and keys, and only then applies `0032` from the committed folder.

| Proof | Result |
|---|---|
| baseline is genuinely pre-change | 31 applied migrations; `ck_asset_derivatives__watermark_by_kind` absent |
| exactly one migration applied on upgrade | 31 → 32 |
| every seeded row preserved | full-row snapshot compared before/after — ids, asset ids, kinds, states, storage keys, checksums, watermark flags all identical |
| no historical kind rewritten | distinct kinds still exactly the four seeded |
| new kind accepted afterwards | `CATALOG_PREVIEW` insert succeeds |
| new watermark rule enforced afterwards | un-watermarking a `PREVIEW_WATERMARKED` row → `23514` |
| upgraded schema == fresh schema | the committed `db-fingerprint-gate.mjs` passes against the upgraded database |

That last row is the important one: an upgraded database and a fresh install are
proven to be the *same* schema by the canonical gate, not by two hand-written
comparisons.

---

## J. Lifecycle / guard tests

`catalog-derivative-lifecycle.integration.spec.ts` (8 cases) proves the §F lane
is representable with **zero** W01 runtime code and no Sharp:

- both catalog kinds coexist for one asset, at `PENDING`;
- guarded `PENDING → PROCESSING` affects one row for each;
- a second claim of the same row affects **zero** rows (replay-safe) and leaves
  it `PROCESSING`;
- an out-of-set state (`'GENERATING'`) is rejected `23514`;
- **accepted terminal tuple written atomically** — both rows `READY` with keys
  and checksums, exactly one `ACCEPTED` inspection, asset `ACCEPTED`;
- **rollback is atomic** — when the last statement of that transaction fails,
  zero inspections remain and both derivatives are still `PROCESSING`, so an
  asset can never be `ACCEPTED` with a half-written derivative set;
- **rejected terminal tuple written atomically** — both rows `FAILED`, one
  `REJECTED` inspection, asset `REJECTED`;
- the original asset row (key, checksum, size) is retained after rejection.

Static tuple spec `asset-derivatives.spec.ts` (7 cases): `CATALOG_PREVIEW`
present exactly once, first four kinds unchanged **in order**, no `PREVIEW`
alias, no duplicates, derivative state tuple unchanged with `PENDING` first.

Job-kind spec `asset-processing-job-kind.spec.ts` (5 cases, persistence):
`ASSET_PROCESSING` is a canonical kind, passes `assertKnownJobKind`, types a
`RegisteredJobType` for `asset.inspection.requested` (compile-time proof),
`OUTBOX_DISPATCH` still recognised, unknown kind rejected.

---

## K. Regression and manifest

| Suite | Result |
|---|---|
| `@embroidery/database` lint / typecheck | clean |
| `@embroidery/database` test | **9 suites / 192 tests passed** |
| `@embroidery/persistence` test | **9 suites / 112 tests passed** (107 + 5 new) |
| `@embroidery/api` test | **90 suites / 1112 tests passed** |
| `@embroidery/worker` test | 130 passed |
| `pnpm db:check:manifest` | all checks passed |
| `db-migration-checksum-check.mjs` | 32/32 match |
| DB6 live checkers (fresh disposable install) | tables, constraints, indexes, jsonb, money, triggers — all passed |

Two existing baseline assertions had to move with the schema and are listed as a
scope exception in §Q: `harness.integration.spec.ts` (fingerprint + migration
count) and the two API integration tests. Both are **test** files asserting
exactly the values this checkpoint changes.

---

## L. New database metrics and fingerprint

| Metric | Before | After |
|---|---|---|
| Migrations | 31 | **32** |
| Tables | 78 | **78** |
| Columns | 833 | **833** |
| FK / PK / UNIQUE | 160 / 78 / 50 | **160 / 78 / 50** |
| CHECK | 189 | **190** |
| Triggers | 30 | **30** |
| Fingerprint | `4ca56a5967730d257edb34e72d6c40373156704cab7c87e3a684803c8321672f` | **`82864268c990990e4597c74cfc69b7b5a91b1bc5a2adbde098ab9ad43aed58cf`** |

Recorded in the executable baselines — `packages/database/tools/canonical-fingerprint.txt`
and `db-live-constraints-check.mjs` (`c: 189 → 190`) — and pointed at from
`DB6_FINAL_PHYSICAL_INVENTORY.md`, whose DB6-era figures are kept as the
historical record rather than rewritten.

Unchanged, verified by their own gates: OpenAPI
`e19c2f76a800b9382d3e013e34759df5b9cd9090de021b5f3b2be7a5cfbf5c8f`, API-client
`55de1cc158cf5ab112dae8e8c63f45fe5fee9de1d36aedbb222f0fcec0a6216b`, Figma
**69** registry IDs. No dependency or lockfile change.

---

## M. `APP2-I03` routing

The W01 audit's third finding — `ensurePrivateBuckets` exists in
`packages/object-storage` but has **no production composition caller**, only
tests — is a runtime-foundation gap, not a database gap, and was deliberately
**not** bundled here. Routed as:

```text
APP2-I03 — Wire idempotent private-bucket bootstrap into API and worker
           composition roots
```

Required sequencing: **`APP2-DB01` → `APP2-I03` → `APP2-W01`**. `APP2-W01` is
therefore **not** `READY` after this checkpoint. No MinIO exposure and no new
SDK are implied.

---

## N. Commit A evidence

```text
fc7f0a11d87d3be5c803fe294d39bc38451ebe8a
feat(db): add catalog preview derivative kind
31 files changed, 12553 insertions(+), 33 deletions(-)
```

| Area | Files |
|---|---|
| Schema tuple + constraint | `packages/database/src/schema/asset/asset-derivatives.ts` |
| Migration | `migrations/0032_add_catalog_preview_derivative_kind.sql`, `migrations/meta/0032_snapshot.json`, `migrations/meta/_journal.json` |
| Baselines | `tools/canonical-fingerprint.txt`, `tools/db-live-constraints-check.mjs`, `tools/migration-checksums.json` |
| New tests | `src/schema/asset-derivatives.spec.ts`, `src/schema/catalog-preview-derivative.integration.spec.ts`, `src/schema/catalog-derivative-lifecycle.integration.spec.ts`, `src/schema/catalog-preview-upgrade.integration.spec.ts`, `packages/persistence/src/platform/asset-processing-job-kind.spec.ts` |
| Moved baseline assertions | `packages/database/src/testing/harness.integration.spec.ts`, `packages/database/jest.config.mjs`, `packages/persistence/src/platform/worker-job-queue-claim.integration.spec.ts`, `apps/api/test/integration/api-integration-context.integration.spec.ts`, `apps/api/src/tests/durability/db10-cp2-logical-restore.integration.spec.ts` |
| Canonical DB docs | `DB0_INVARIANT_INVENTORY.md`, `DB2_CONCEPT_INVENTORY.md`, `DB3_INVARIANT_ENFORCEMENT_PLAN.md`, `DB3_LIFECYCLE_SPECIFICATIONS.md`, `DB4_COLUMN_DICTIONARY.md`, `DB4_INVARIANT_SCHEMA_TRACEABILITY.md`, `DB4_KEYS_AND_CONSTRAINTS.md`, `DB4_TABLE_CATALOG.md`, `DB6_FINAL_PHYSICAL_INVENTORY.md` |
| APP2 authority | `ADR-APP2-001…md`, `phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md`, `14-IMPLEMENTATION-DECISION-REGISTER.md`, `10-MASTER-APPLICATION-ROADMAP.md`, `11-TRACEABILITY-AND-STATUS-MATRIX.md` |

Note: the snapshot file is 11 426 lines of drizzle-kit output — a generated
artifact, never hand-edited.

---

## O. Validation

Actual repository command names; the prompt's `db:migrate:fresh`,
`db:test:upgrade`, `db:check:drift`, `db:test:guards` and `db:test:repositories`
do not exist and were substituted as recorded.

| Prompt command | Actual command run | Result |
|---|---|---|
| `pnpm --filter @embroidery/database lint` | same | pass |
| `pnpm --filter @embroidery/database typecheck` | same | pass |
| `pnpm --filter @embroidery/database test` | same | 9 suites / **192** tests |
| `pnpm db:migrate:fresh` | `createDisposableDatabase` in `catalog-preview-derivative.integration.spec.ts` + a direct fresh-install run of all six DB6 live checkers | 32 migrations, 78/833, all checkers pass |
| `pnpm db:test:upgrade` | `catalog-preview-upgrade.integration.spec.ts` (real 0000-0031 baseline → 0032) | 7/7 |
| `pnpm db:check:manifest` | same | all checks passed |
| `pnpm db:check:drift` | `drizzle-kit generate` produced the migration from the schema (snapshot in sync) + `db-migration-checksum-check.mjs` + the fingerprint gate inside the upgrade suite | no drift |
| `pnpm db:test:guards` | `catalog-preview-derivative` + `catalog-derivative-lifecycle` integration suites + `db-live-triggers-check.mjs` | 26 cases, 30 triggers unchanged |
| `pnpm db:test:repositories` | `pnpm --filter @embroidery/persistence test` | 9 suites / **112** tests |
| `pnpm check:openapi` | same | up to date, unchanged |
| `pnpm check:api-client` | same | `55de1cc1…`, unchanged |
| `pnpm check:figma-design-index` | same | 69 IDs, unchanged |
| `node --test tools/check-figma-design-index.test.mjs` | same | pass |
| `node tools/check-file-size.mjs` | same | pass (16 files above the review threshold, none new) |
| `pnpm quality` | same | **`EXIT=0`** — 21/21 turbo tasks; API 90 suites / 1112 tests |
| `git diff --check` | same | clean |

**Residue:** `select … from pg_database where datname like 'embroidery_%' and
datname <> 'embroidery'` → **NONE**. No test container was left running; the
persistent `embroidery` database was never migrated or mutated by this
checkpoint.

**One honest failure worth recording.** The first full `pnpm quality` after the
schema change **failed**: two API integration suites assert the frozen DB
fingerprint and migration count. That is exactly the signal those assertions
exist to produce. They were updated to the new baseline (values only, with the
reason in a comment) rather than relaxed, and the rerun passed at `EXIT=0`.

---

## P. Acceptance

| # | Criterion | Evidence |
|---|---|---|
| 1 | Exact clean preflight | §A |
| 2 | W01 blocker reproduced from source | §B |
| 3 | No W01 code existed or was added | `git log` shows no W01 commit; no `apps/worker` file in Commit A |
| 4 | `CATALOG_PREVIEW` added exactly once | §D + static spec |
| 5 | Existing four kinds unchanged | §D, upgrade suite |
| 6 | No generic `PREVIEW` alias | static spec asserts absence; live insert of `'PREVIEW'` → `23514` |
| 7 | `PREVIEW_WATERMARKED → true` | §E, `23514` on `false` |
| 8 | `CATALOG_PREVIEW → false` | §E, `23514` on `true` |
| 9 | No unrelated watermark semantics changed | MOCKUP/NORMALIZED/THUMBNAIL accept both values (6 cases) |
| 10 | One new migration only | `0032` |
| 11 | Existing migrations untouched | checksum manifest 32/32 |
| 12 | No table added/removed | 78 live |
| 13 | No column added/removed | 833 live |
| 14 | Partial uniqueness unchanged | `23505` case + fingerprint |
| 15 | READY storage-key CHECK unchanged | `23514` case |
| 16 | Inspection append-only trigger unchanged | `23000` on UPDATE and DELETE; 30 triggers |
| 17 | Fresh migration path passes | §I.1 |
| 18 | Upgrade preserves all rows | §I.2 full-row snapshot equality |
| 19 | Unknown kind rejected | §I.1 |
| 20 | `PENDING → PROCESSING` documented and tested | §F.1, §J |
| 21 | Direct `PROCESSING` insert removed from W01 authority | DB3 LC-06 lane table, ADR §8, IMP-D030, phase plan |
| 22 | Catalog processing before `ACCEPTED` authorized | DB3 LC-06 catalog lane |
| 23 | Design/artwork lane preserved | DB3 LC-06 second lane; CON-042 note |
| 24 | Accepted tuple atomic | §J |
| 25 | Rejected tuple atomic | §J |
| 26 | W01 job kind locked to `ASSET_PROCESSING` | §G |
| 27 | I02 can represent it | §G source trace + spec |
| 28 | No worker runtime modification | no `apps/worker` file in Commit A |
| 29 | Width/height/media columns not added | 833 columns unchanged |
| 30 | Inspection detail remains the measurement home | ADR §5 and DB3 lane table |
| 31 | `APP2-I03` routed separately | §M |
| 32 | W01 remains blocked pending I03 | §M, phase plan, roadmap |
| 33 | No Sharp or dependency change | lockfile untouched |
| 34-36 | OpenAPI / client / Figma unchanged | §L |
| 37 | Full database/regression quality passes | §O, `EXIT=0` |
| 38 | New migration count and fingerprint recorded | §L |
| 39 | Commit A implementation/authority only | §N |
| 40 | Commit B evidence only | this report + status pointers |
| 41 | Exactly two commits | `fc7f0a1` + this one |
| 42 | Complete report, no arbitrary compression | this document |
| 43 | Clean final tree | verified after Commit B |
| 44 | Nothing pushed | `origin/production` still at `8775734` |
| 45 | I03 / W01 / frontend not started | no such files exist |

---

## Q. Scope and evidence closure

**Deliberate scope exception.** §13 forbids modifying `apps/api`. Two files
there were changed:
`apps/api/test/integration/api-integration-context.integration.spec.ts` and
`apps/api/src/tests/durability/db10-cp2-logical-restore.integration.spec.ts`.
Both are **tests** that assert the canonical database fingerprint and migration
count — precisely the two values this checkpoint moves — and both failed the
full quality gate until updated. No API production source, controller, module,
contract or configuration was touched. This is the "demonstrated
accepted-baseline defect" case §13 allows, and it is reported rather than
buried.

**Not done, on purpose:** no bucket bootstrap wiring (`APP2-I03`), no Sharp, no
W01 handler, no derivative measurement columns, no Nginx/Compose/Figma/OpenAPI
change, no rewrite of historical DB6/DB10 completion reports (superseding
pointers only), and no correction prompt.

**Final state**

```text
APP2-DB01 = COMPLETE — DELIVERED_FOR_REVIEW
APP2-I03  = READY — NOT STARTED
APP2-W01  = BLOCKED_BY_APP2-I03
APP2-A01  = BLOCKED_BY_APP2-W01
```
