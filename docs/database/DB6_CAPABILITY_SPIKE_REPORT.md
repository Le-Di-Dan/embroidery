# DB6 — Capability Spike Report

**Date:** 2026-07-18 · **Slice:** DB6-S01
**Closes:** DB5-A03 (partial predicates), DB5-A04 (row lock / worker claim),
DB5-A07 (ICU), DB5-A08 (VND scale), DB5-A13 (identifier length),
DB5-A14 (exclusion/extension)
**Target:** `postgres:16.14-alpine` @ `sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777`
**Method:** disposable containers and a disposable package sandbox outside the
repository. All spike artifacts were deleted after evidence capture; nothing in
this report is carried into the repository as code.

> **Verdict: every required capability passed. No blocker. No ORM replacement
> considered. Raw SQL is required only for triggers/functions**, which no ORM
> declares and which ADR-DB1-002 already sanctions.

---

## 1. Engine, encoding, locale

```text
PostgreSQL 16.14 on x86_64-pc-linux-musl, compiled by gcc (Alpine 15.2.0), 64-bit
server_encoding  UTF8
TimeZone         UTC
max_identifier_length  63
```

**Stock image default (rejected):**

```text
datname | enc  | datcollate | datctype   | datlocprovider
spike   | UTF8 | en_US.utf8 | en_US.utf8 | c
```

**With `POSTGRES_INITDB_ARGS="--locale=C --encoding=UTF8"` (adopted):**

```text
datname | enc  | datcollate | datctype | datlocprovider
spike   | UTF8 | C          | C        | c

SELECT 'Z' < 'a' AS c_locale_bytewise;  →  t
```

This is DEV-DB6-001. Without it, every text index would have been built under
`en_US.utf8` while DB5 documented a `C` baseline — a divergence that produces
no error, only wrong ordering semantics.

## 2. ICU / Vietnamese collation (DB5-A07)

```text
icu_collations   908

collname    | collisdeterministic
vi-VN-x-icu | t
vi-x-icu    | t

collname  | collcollate | collversion
C         | C           | (null)
POSIX     | POSIX       | (null)
ucs_basic | C           | (null)

SELECT 'Đà Nẵng' COLLATE "vi-x-icu" < 'Hà Nội' COLLATE "vi-x-icu";  →  t
```

ICU is present on the musl/Alpine variant and survives a `C` database locale.
Both Vietnamese collations are **deterministic**, therefore B-tree- and
equality-compatible. No image variant change is needed; no silent fallback was
taken. No collated index is built at launch.

## 3. Constraints, types, VND scale (DB5-A08)

```sql
CREATE TABLE t_caps (
  id uuid PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  state text NOT NULL,
  amount numeric(14,2) NOT NULL,
  currency_code char(3) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_caps_state CHECK (state IN ('draft','active','done')),
  CONSTRAINT ck_caps_amount_nonneg CHECK (amount >= 0),
  CONSTRAINT ck_caps_vnd_scale CHECK (currency_code <> 'VND' OR amount = trunc(amount)),
  CONSTRAINT uq_caps_state_amount UNIQUE (state, amount)
);
```

| Case | Expected | Observed |
|---|---|---|
| `1000.00 VND` | accept | `INSERT 0 1` |
| **`1000.25 VND`** | **reject** | `ERROR: violates check constraint "ck_caps_vnd_scale"` |
| `1000.25 USD` | accept | `INSERT 0 1` |
| `state = 'bogus'` | reject | `ERROR: violates check constraint "ck_caps_state"` |

**DB5-A08 resolved.** The currency-scale rule is expressible as a per-row CHECK
that is *conditional on the currency code*, so it does not hard-code a rule for
every future currency and does not alter the `numeric(14,2) + currency_code`
storage model chosen by DB4/ADR-DB4-001. Recorded as DEV-DB6-005 (additive
implementation addendum; DB4 is not edited). DB7 owns the negative test.

`bigint GENERATED ALWAYS AS IDENTITY`, `jsonb`, `timestamptz` and
`numeric(14,2)` all behaved as DB4 assumes.

## 4. Partial indexes and volatile predicates (DB5-A03)

```sql
CREATE UNIQUE INDEX uq_caps_single_active ON t_caps (state) WHERE state = 'active';
-- second 'active' row:
ERROR:  duplicate key value violates unique constraint "uq_caps_single_active"
```

Single-active enforcement (the CST-022/INV-16 and CST-039 shape) works.

```sql
CREATE INDEX ix_caps_volatile ON t_caps (created_at) WHERE created_at > now();
ERROR:  functions in index predicate must be marked IMMUTABLE
```

**The DB5-A03 prohibition is engine-enforced, not merely a convention.** A
volatile time predicate cannot be created even by mistake. Expiry/cleanup
indexes therefore take the DB5-prescribed shape — predicate on non-terminal
state, key on `expires_at`/`retry_at` — with `now()` appearing only in the
runtime query.

## 5. Index shapes: `NULLS FIRST` and `DESC`

```text
ix_caps_claim | CREATE INDEX ... USING btree (claimed_at NULLS FIRST, seq) WHERE (state <> 'done'::text)
ix_caps_desc  | CREATE INDEX ... USING btree (created_at DESC, seq DESC)
```

Both survive round-trip through `pg_indexes`. Expressible natively in drizzle
(§7), so **IDX-088 needs no raw SQL** — DB5 had listed it as a fallback
candidate.

## 6. Identifier length and extensions

```text
max_identifier_length  63

name       | default_version | installed_version
btree_gist | 1.7             | (null)
pg_trgm    | 1.6             | (null)
```

DB5's name map is already ≤63 bytes throughout, so no abbreviation or hash
suffix is needed (DB5-A13 closes with no deviation). Neither extension is
installed; IDX-056 stays conditional (DB5-A14).

---

## 7. Drizzle schema expressiveness

Generated from a drizzle schema, unedited:

```sql
CREATE TABLE "design_cases_spike" (
	"id" uuid PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_design_cases_spike__state" CHECK ("design_cases_spike"."state" in ('draft','active','approved'))
);
CREATE UNIQUE INDEX "uq_design_cases_spike__single_active" ON "design_cases_spike" USING btree ("state") WHERE "design_cases_spike"."state" = 'active';
CREATE INDEX "ix_design_cases_spike__created_desc" ON "design_cases_spike" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
CREATE INDEX "ix_outbox_events_spike__claim" ON "outbox_events_spike" USING btree ("claimed_at" NULLS FIRST,"id") WHERE "outbox_events_spike"."state" = 'pending';
```

Named CHECK, partial unique with predicate, explicit `DESC`, explicit
`NULLS FIRST` — all declarable in the schema source of truth, all with
DB5-catalog names.

### 7.1. Explicit constraint naming — DEV-DB6-006

Drizzle's **inline** `.primaryKey()` shorthand emits a PostgreSQL-generated
name:

```text
design_cases_spike_pkey        ← tool-generated, violates ADR-DB1-006
```

The **table-level** builders emit the required names:

```sql
CONSTRAINT "pk_parents_spike" PRIMARY KEY("id")
CONSTRAINT "uq_parents_spike__code" UNIQUE("code")
ALTER TABLE "children_spike" ADD CONSTRAINT "fk_children_spike__parent_id"
  FOREIGN KEY ("parent_id") REFERENCES "public"."parents_spike"("id")
  ON DELETE restrict ON UPDATE no action;
```

**Binding rule for G01–G19:** every table uses table-level
`primaryKey({ name })`, `foreignKey({ name })` and `unique(name)`. The inline
`.primaryKey()` / `.references()` shorthands are prohibited, because they
silently produce `<table>_pkey` / `<table>_<col>_fkey` names that
`DB5_DB6_HANDOFF.md` §9 forbids accepting.

## 8. Migration lifecycle

```text
$ drizzle-kit generate --name=spike_initial   → drizzle/0000_spike_initial.sql
$ drizzle-kit migrate                          → migrations applied successfully

 id | hash                                                             | created_at
  1 | 4a9cfcbfdaa10736d5f2c8b1f172ddd6651d558333bee0bd5fcdd64bb0f55dc2 | 1784378521813
```

Migration history lives in `drizzle.__drizzle_migrations` with a **per-file
checksum**, which is the mechanism the DB6 drift check builds on: an edited
shared migration changes its hash and is detectable rather than silent.

## 9. Custom SQL migration — triggers and functions

`drizzle-kit generate --custom` produces an empty, hand-authored migration.
Applied content:

```sql
CREATE OR REPLACE FUNCTION public.fn_reject_mutation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'row is immutable (table %)', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER tg_design_cases_spike__reject_mutation
BEFORE UPDATE OR DELETE ON public.design_cases_spike
FOR EACH ROW WHEN (OLD.state = 'approved')
EXECUTE FUNCTION public.fn_reject_mutation();
```

| Case | Expected | Observed |
|---|---|---|
| `UPDATE` a row with `state='approved'` | reject | `ERROR: row is immutable (table design_cases_spike)` |
| `UPDATE` a row with `state='draft'` | allow | `UPDATE 1` |

Two results that matter beyond "triggers work":

1. `SET search_path = pg_catalog, public` on the function is accepted, so the
   §23 search-path safety requirement is satisfiable.
2. The `WHEN (...)` clause makes immutability **conditional**. This is the
   mechanism for DB5-A10: a blanket update-rejecting trigger is *not* needed and
   *must not* be used where DB4 permits mutable operational metadata. Row-state
   scoping (and, where required, `WHEN (OLD.col IS DISTINCT FROM NEW.col)`
   column scoping) lets immutable payload and mutable claim/retry metadata live
   in one table — exactly the outbox/idempotency/attempt case DB5-A10 raises.

Naming matched ADR-DB1-006 (`tg_<table>__<purpose>`, `fn_<purpose>`) exactly.

---

## 10. Locking and worker claim (DB5-A04) — 14/14 passed

Executed against the pinned image through `drizzle-orm@0.45.2` + `pg@8.22.0`.

```text
PASS  SQL gen: FOR UPDATE SKIP LOCKED :: ... limit $2 for update skip locked
PASS  SQL gen: FOR UPDATE NOWAIT      :: ... "state" = $1 for update nowait
PASS  SQL gen: FOR UPDATE
PASS  SQL gen: parameterized (no inlining) :: "state" = $1
PASS  SKIP LOCKED: 3 workers claim disjoint batches :: w1=1,2,3 w2=4,5,6 w3=7,8,9
PASS  SKIP LOCKED: empty batch returns 0 rows
PASS  NOWAIT: raises 55P03 under contention :: sqlstate=55P03
PASS  TX: rollback reverts and releases :: attempts=0
PASS  TX: commit persists
PASS  TX: typed builder lock executes :: ids=1,2
PASS  TX: isolationLevel serializable applied :: level=serializable
PASS  TX: nested savepoint rollback keeps outer :: attempts=100
PASS  Raw SQL: sql`` template parameterized :: n=10
PASS  lock_timeout: raises 55P03 on wait :: sqlstate=55P03

== 14/14 passed ==
```

Point by point against the DB5-A04 checklist:

| DB5-A04 item | Result |
|---|---|
| `FOR UPDATE` | works, typed builder |
| `FOR UPDATE NOWAIT` | works; `55P03` on contention |
| `FOR UPDATE SKIP LOCKED` | works; **the CC-25 outbox claim is safe** |
| Lock inside a Drizzle transaction | works (typed builder inside `db.transaction`) |
| Generated SQL assertion | asserted on the emitted string, not just behaviour |
| Multi-worker claim | 3 concurrent workers, **disjoint** batches, no overlap |
| Stable ordering | `ORDER BY claimed_at NULLS FIRST, id` honoured under lock |
| Empty batch | returns 0 rows, no error, no hang |
| Contended batch | covered by the 3-worker case above |
| Rollback releases locks | verified; value reverted to 0 |
| Deadlock / lock-timeout behaviour | `lock_timeout` surfaces `55P03` |
| Raw SQL fallback through the driver | `sql` template parameterises to `$1` |

**Conclusion: no raw-SQL persistence adapter is required for locking.** The ORM
expresses every lock mode DB3/DB5 specify, including the highest-risk one
(`SKIP LOCKED`). The historically-reported `noWait` defect (ADR-DB1-002,
drizzle #3554) is confirmed fixed in 0.45.2 — it was verified by SQLSTATE, not
by trusting the changelog. The sanctioned raw-SQL adapter is still built (it is
needed for triggers and for DB8's fallbacks) but it is not load-bearing for
concurrency.

Serializable isolation and savepoints both work, which matters for the
compensation/merge paths (CC-27) where an inner failure must not discard the
outer transaction.

## 11. Partial-index usage under EXPLAIN — DB5 spike 4

DB5 called this "the one most likely to reveal a real defect: a partial index
that is silently unused looks exactly like a partial index that works." Tested
with 50,000 rows and fresh `ANALYZE`:

```text
-- query predicate matches the index predicate exactly
EXPLAIN SELECT id FROM outbox_events_spike
WHERE state = 'pending' ORDER BY claimed_at NULLS FIRST, id LIMIT 10;

 Limit
   ->  Index Only Scan using ix_outbox_events_spike__claim on outbox_events_spike

-- deliberately non-matching predicate (control)
WHERE state = 'dispatched' ...

 Limit
   ->  Sort
         Sort Key: claimed_at NULLS FIRST, id
         ->  Seq Scan on outbox_events_spike
               Filter: (state = 'dispatched'::text)
```

The matching query uses the partial index as an **Index Only Scan**; the
control correctly does not. This also confirms that drizzle's table-qualified
predicate text (`"outbox_events_spike"."state" = 'pending'`) normalises in the
catalog to `(state = 'pending'::text)` and still matches an unqualified query
predicate — the specific failure mode DB5 warned about.

This is a **structural** confirmation on synthetic data. It does **not**
discharge DB9's measured `EXPLAIN` validation on representative data
(DB5-A12); no launch performance claim is made here.

---

## 12. Spike artifact disposal

| Artifact | Location | Disposal |
|---|---|---|
| `db6spike` / `db6spike2` containers | Docker, loopback `55433` | removed after capture |
| package sandbox (drizzle/pg/uuid) | scratchpad, outside repo | not committed |
| spike SQL + `lock-spike.mjs` | scratchpad, outside repo | not committed |
| spike tables/triggers | disposable container only | destroyed with container |

No spike artifact enters the repository. The permanent equivalents are the
DB6-owned smoke gates (`DB6_TEST_HANDOFF.md`), which re-prove the load-bearing
subset — `SKIP LOCKED`, partial predicates, config validation, migration
apply — against the real schema on every run.
