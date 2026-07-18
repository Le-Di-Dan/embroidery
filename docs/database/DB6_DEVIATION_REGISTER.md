# DB6 — Deviation Register

**Date:** 2026-07-18 · **Checkpoint:** DB6
**Rule:** no silent deviation. Every implementation choice that diverges from,
refines, or resolves a deferred DB0–DB5 decision is recorded here with
evidence. DB0–DB5 documents are **not edited**; deviations are additive.

**Status legend:** `open` · `closed` (implemented + evidenced) ·
`deferred` (owner named, non-blocking)

**Blocking count: 0.**

---

## DEV-DB6-001 — PostgreSQL image locale default is not the `C` baseline

| Field | Value |
|---|---|
| Source IDs | ADR-DB1-001 (`C` default rationale), `DB5_DB6_HANDOFF.md` §3 ("`C` default throughout"), DB5-A07 |
| Status | **closed** |

**Problem.** `postgres:16.14-alpine` initialises `datcollate = en_US.utf8`,
not `C`. DB1 chose a `C` default so technical fields get bytewise semantics
independent of the image's locale library, and DB5 designed all 134 indexes on
that assumption, declaring "Collation clauses: none — `C` default throughout".
Left alone, every text index would have been built under `en_US.utf8` while the
design documents said `C`. No error is raised at any point; only ordering and
comparison semantics differ.

**Evidence.** Stock image: `datcollate | datctype = en_US.utf8 | en_US.utf8`.
With initdb args: `C | C`, and `SELECT 'Z' < 'a'` → `t` (bytewise).
See `DB6_CAPABILITY_SPIKE_REPORT.md` §1.

**Selected implementation.** `POSTGRES_INITDB_ARGS=--locale=C --encoding=UTF8`
on the dev Compose service, plus a startup assertion that the connected
database reports `datcollate = C` so a mis-initialised volume fails loudly
instead of drifting.

**Behaviour impact.** None on product behaviour — this restores the documented
baseline rather than changing it. Vietnamese user-facing sort is unaffected: it
was never planned to rely on the database default, and ICU remains available
for an explicit `COLLATE "vi-x-icu"` clause when a later checkpoint needs it.

**Migration impact.** `initdb` runs once per volume. A volume created before
this setting keeps `en_US.utf8` and cannot be converted in place; the remedy is
volume disposal (ADR-DB1-013). No production data exists — DB6 is the first
physical schema — so the cost is a local dev reset only.

**Test impact.** DB6 smoke gate asserts encoding/collation/timezone. DB10 owns
collation-drift-on-restore if an ICU collation is ever adopted.

---

## DEV-DB6-002 — PostgreSQL patch bump 16.6 → 16.14

| Field | Value |
|---|---|
| Source IDs | ADR-DB1-001, DB5-A06 |
| Status | **closed** |

**Problem.** The repository pinned `postgres:16.6-alpine`, which ADR-DB1-001
already identified as stale repository state rather than an approved baseline.

**Evidence.** 16.14 released 2026-05-14 is the current 16.x. The gap carries 11
security fixes (four at CVSS 8.8), plus two correctness fixes that touch
mechanisms this schema depends on: incorrect results with nondeterministic
collations over unique indexes, and restored FK-trigger deferrability. Image
digest recorded in `DB6_VERSION_CAPABILITY_MATRIX.md` §1.

**Selected implementation.** Pin `postgres:16.14-alpine`, major 16 retained,
dev/test/CI parity, floating tags prohibited.

**Behaviour impact.** None expected; same major, no feature dependency changed.
**Migration impact.** None — combined with the DEV-DB6-001 volume reset.
**Test impact.** Fresh-install gate runs against the pinned tag.

---

## DEV-DB6-003 — PostgreSQL driver selected: `pg` 8.22.0

| Field | Value |
|---|---|
| Source IDs | ADR-DB1-002 §223 (explicitly deferred `pg` vs `postgres.js` to DB6), DB5-A05 |
| Status | **closed** |

**Problem.** DB1 locked the ORM family but left the driver open.

**Evidence.** All 14 lock/transaction spikes passed on `pg` 8.22.0, including
`SKIP LOCKED`, `NOWAIT` → `55P03`, savepoints and serializable isolation.
drizzle-kit itself applies migrations through `pg`.

**Selected implementation.** `pg@8.22.0` exact, `@types/pg@8.20.0`.
Rationale in `DB6_VERSION_CAPABILITY_MATRIX.md` §2.1 — one driver for both
migration and runtime paths, pool semantics that match explicit transaction
boundaries, direct SQLSTATE surfacing.

**Behaviour impact.** Confined to `infrastructure/persistence`; no domain code
imports the driver (ADR-DB1-002/009).
**Migration/test impact.** None beyond the pin.

---

## DEV-DB6-004 — UUIDv7 library selected: `uuidv7` 1.2.1

| Field | Value |
|---|---|
| Source IDs | ADR-DB1-007 (library deferred to DB6) |
| Status | **closed** |

**Problem.** PG16 has no native UUIDv7 generator; ADR-DB1-007 requires one
vetted RFC 9562 library honouring monotonicity guidance.

**Evidence.** 20,000 rapid generations per candidate: `uuidv7@1.2.1` and
`uuid@14.0.1` both strictly monotonic, unique, version nibble 7, lexicographic
order equal to generation order.

**Selected implementation.** `uuidv7@1.2.1` — purpose-built, documented
same-millisecond counter monotonicity, no unused API surface.

**Behaviour impact.** IDs are application-generated before insert
(ADR-DB1-007 category 1). Monotonicity keeps PK inserts appending at the
B-tree right edge instead of scattering page writes.
**Test impact.** DB6 smoke asserts version nibble and monotonicity.

---

## DEV-DB6-005 — VND integer-scale enforcement (additive to DB4)

| Field | Value |
|---|---|
| Source IDs | DB5-A08, ADR-DB4-001 (money), DB4 `numeric(14,2)` + `currency_code` |
| Status | **closed** (DB7 owns negative tests) |

**Problem.** `numeric(14,2)` is exact but permits `1000.25 VND`, which is not a
representable amount in a currency with no minor unit.

**Evidence.** Conditional CHECK verified: `1000.25 VND` rejected, `1000.25 USD`
accepted, `1000.00 VND` accepted (`DB6_CAPABILITY_SPIKE_REPORT.md` §3).

**Selected implementation.** Per-table CHECK of the form
`currency_code <> 'VND' OR amount = trunc(amount)`, applied to money-bearing
columns.

The rule is **conditional on the currency**, not global: it does not hard-code
scale for future currencies, and it does not change the money storage model.
DB4's `numeric(14,2)` + `currency_code` pair is untouched.

**Behaviour impact.** Fractional VND becomes a database-level error rather than
a silently stored value. No rounding is performed by the database.
**Migration impact.** Constraint ships with its table.
**Test impact.** **DB7** must test fractional-VND rejection and non-VND
fractional acceptance.

**Addendum required:** yes — this is an additive DB6 implementation addendum.
DB4 is not edited (DB5-A08 explicitly permits this route where DB4 carries no
specific `CST-*`).

---

## DEV-DB6-006 — Inline drizzle key shorthands prohibited (naming)

| Field | Value |
|---|---|
| Source IDs | ADR-DB1-006, `DB5_DB6_HANDOFF.md` §9 ("do not accept tool-generated index names") |
| Status | **closed** (binding convention for G01–G19) |

**Problem.** Drizzle's inline `.primaryKey()` / `.references()` shorthands emit
PostgreSQL-generated names (`design_cases_spike_pkey`), which violate the
required `pk_<table>` / `fk_<table>__<column>` patterns. The names appear only
in the database, not in review of the TypeScript schema — so this would be easy
to ship unnoticed across 78 tables.

**Evidence.** Inline form → `design_cases_spike_pkey`. Table-level form →
`CONSTRAINT "pk_parents_spike" PRIMARY KEY("id")` and
`CONSTRAINT "fk_children_spike__parent_id" FOREIGN KEY ...`
(`DB6_CAPABILITY_SPIKE_REPORT.md` §7.1).

**Selected implementation.** Every table uses table-level
`primaryKey({ name })`, `foreignKey({ name })`, `unique(name)`. Inline
shorthands are prohibited in schema files. The fresh-install gate asserts that
no constraint name matches the tool-generated `%_pkey` / `%_fkey` patterns, so
a lapse fails a gate rather than surviving review.

**Behaviour impact.** None — naming only. Error messages and
`pg_stat_user_indexes` stay readable, which is why ADR-DB1-006 required it.

---

## Deviations considered and **not** taken

| Candidate | Why rejected |
|---|---|
| Replace Drizzle with another ORM | No capability failed. ADR-DB1-002 requires blocker-level evidence plus a superseding ADR; neither exists. |
| Raw-SQL adapter for row locking | Unnecessary — all lock modes verified through the typed builder (DB5-A04). The adapter still exists for triggers and DB8 fallbacks, but is not load-bearing for concurrency. |
| Install `btree_gist` for IDX-056 | Not required at launch; the publish-transaction guard remains primary. Would need an extension request (ADR-DB5-002 R7). |
| Add an index for Q-20 / Q-33 / QX-08 | DB5-A15: no-index decisions stand. No activation threshold reached, no implementation evidence against them. |
| Blanket update-rejecting triggers on outbox/idempotency/attempt tables | DB5-A10: these tables have legitimately mutable operational metadata. Conditional `WHEN` scoping is used instead. |
| Weaken a partial-unique predicate to make it matchable | Explicitly forbidden (`DB5_DB6_HANDOFF.md` §9, OBS-01). |
| Alpine → Debian image variant for ICU | Unnecessary — ICU verified present on Alpine with 908 collations including both Vietnamese ones. |
| Change `numeric(14,2)` storage for VND | Would alter DB4's money model; a conditional CHECK achieves the goal additively. |
