# DB6 — Deviation Register

**Date:** 2026-07-18 · **Checkpoint:** DB6
**Rule:** no silent deviation. Every implementation choice that diverges from,
refines, or resolves a deferred DB0–DB5 decision is recorded here with
evidence. DB0–DB5 documents are **not edited**; deviations are additive.

**Status legend:** `open` · `closed` (implemented + evidenced) ·
`deferred` (owner named, non-blocking)

**Blocking count: 0.** Deviations recorded: DEV-DB6-001 … DEV-DB6-015.

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

**Evidence.** 16.14, released 2026-05-14, is the current 16.x. The release
family announcement lists **11 security issues**; **nine affect PostgreSQL
16**, four of those at CVSS 8.8. The release also carries two correctness fixes
touching mechanisms this schema depends on: incorrect results with
nondeterministic collations over unique indexes, and restored FK-trigger
deferrability. Image digest and the full nine-issue list are recorded in
`DB6_VERSION_CAPABILITY_MATRIX.md` §1.

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

**DB6-C5 correction (2026-07-19).** "Closed" above was accurate only for
`products.base_price_amount`/`skus.price_override_amount` (G5, the only two
columns using it at the time). It was never re-applied when nine further
tables (TBL-043/044/047/048/049/051/052/053) and, at G16, five more
(TBL-054..058) added their own money columns G6–G16 — each of those columns
shipped with only the non-negative/positive and `= 'VND'` CHECKs, never the
scale CHECK. DB6-G16's review caught this as a live defect (fractional VND
accepted on `payment_reconciliations.amount`), and DB6-C5 closed it for real:
`0026_enforce_vnd_currency_scale.sql` adds one `currencyScaleCheck()`-based
CHECK per affected amount column across all thirteen tables (twenty-one
CHECKs total), using the same helper this entry already specified — no new
deviation ID, no change to the selected implementation, no denominator
change. Full column-by-column detail: `DB6_MONEY_SCALE_AUDIT.md`. Status
remains **closed**, now actually true for every money column implemented
G1–G16, not only G5's two.

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

## DEV-DB6-007 — DB4 `REL-*`/`CST-*` ID ranges are not object counts

| Field | Value |
|---|---|
| Source IDs | DB4 completion report ("REL-001..105", "CST-001..125"), DB5-A01 (same trap, index side) |
| Nature | **counting/traceability interpretation correction** — not a logical schema change; no relationship or constraint is added, removed, or altered |
| Status | **closed** (documentation correction; no schema change) |

**Problem.** DB4 reports "105 relationships" and "125 constraints". Those are
**ID ranges**, not object counts. 13 `REL-*` and 31 `CST-*` IDs appear in no
DB4 document:

```text
REL-015..019  REL-034..039  REL-059  REL-089
CST-052..059  CST-075..079  CST-081..089  CST-101..109
```

Read as counts, they would make DB6 look permanently incomplete — 92 of 105
relationships — or, worse, invite invention of 13 relationships that do not
exist.

**Evidence.** Exhaustive scan of all `DB4_*.md`: the listed IDs occur nowhere.
The cause is visible in the surviving rows: DB4 collapsed multi-target
relationships into one ID with a `×N` marker (`REL-033 ×2`, `REL-058 ×3`,
`REL-063 ×5`, `REL-078 ×5`) and left neighbouring allocated IDs unused. DB5 hit
the same pattern on the index side and documented its four retired IDs
explicitly; DB4 did not.

**Selected implementation.** Record the true figures in the schema manifest:
**92 `REL-*` rows → 129 physical FK edges**, **94 `CST-*` IDs defined**. The
parity gate counts FK edges, not `REL-*` rows.

**Behaviour impact.** None — no table, column, FK or constraint is missing.
**Physical implementation impact.** Prevents invented objects: without this
correction, a later checkpoint chasing "105 relationships" could fabricate 13
edges that DB4 never modelled.
**Historical documents.** Unchanged — DB4 is not edited to fill the gaps.
**Canonical implementation baseline.** The DB6 manifests; the checker
re-derives the expansion from the DB4 source document on every run, so the
manifests cannot drift from DB4 silently.
**Test/audit impact.** DB7/DB8 size their coverage from expanded object counts
(129 FK edges, 265 constraint instances), not ID-range maxima. **DB10 audits
must do the same** — an audit that reconciles `pg_constraint` against "125"
would report a permanent false deficit.

**Scope guard.** This deviation covers only the counting interpretation. If a
later group discovers that DB4 actually *omitted* a needed edge or constraint
(a modelling gap, as REL-003's omission from G1 was an implementation gap), a
**separate** deviation is opened; nothing is folded into this one.

---

## DEV-DB6-008 — REL-003 omitted from the first G1 implementation

| Field | Value |
|---|---|
| Source IDs | REL-003 (`admin_accounts → admin_accounts` replaced_by), LC-01 |
| Status | **closed** (corrected by forward migration `0001`) |

**Problem.** `admin_accounts.replaced_by_admin_account_id` was created with the
correct type and nullability but **no foreign key**. The LC-01 successor chain
had no referential integrity: a replaced account could have been deleted out
from under a successor pointer.

**Evidence.** `pg_constraint` showed 2 FKs where DB4 requires 3. Found by the
DB6-C0 retro-validation, not by any tool — the column existed, typechecked, and
passed naming checks vacuously (an `fk_` name check cannot fail when no FK
exists).

**Selected implementation.**
`0001_add_admin_accounts_successor_fk.sql`, adding
`fk_admin_accounts__replaced_by_admin_account_id` with `ON DELETE RESTRICT`.
Migration `0000` was **not** edited (ADR-DB1-003 forward-fix).

**Root cause.** The `idReference()` primitive produces a correctly-typed `uuid`
column but does not create a constraint, so a reference column looks complete
in review while carrying no FK.

**Generalisation.** From G2 onward a group's gate fails if any `uuid` column
named `*_id` has no matching `fk_` constraint, and FK edges are counted against
the 129-edge expansion rather than the 92 `REL-*` rows.

**Test impact.** DB7 adds REL-003 negative cases (orphan successor pointer;
delete of a still-referenced predecessor).

---

## DEV-DB6-009 — Eight REL rows carry implied multiplicity without ×N markers

| Field | Value |
|---|---|
| Source IDs | REL-040, REL-050, REL-057, REL-088, REL-093, REL-094, REL-102, REL-105; DEV-DB6-007 (scope guard: separate deviation required) |
| Nature | **counting/traceability interpretation correction** — no relationship is added, removed or altered; DB4 is not edited |
| Status | **closed** |

**Problem.** The 129-edge expansion accepted at DB6-C1 derived edge counts
from explicit `×N` markers only. G7 scope derivation found REL-040
(`design_sessions → products/variants/sides/areas`) listing four targets with
**no marker** — and a full scan found eight such rows using slash lists,
`·`-joined statements, or parenthetical extra edges. Counted as 1 each, the
physical FK layer would eventually exceed its own "expanded" baseline: G2 had
already implemented 3 FKs for REL-102 against a baseline that counted it
as 1.

**Evidence.** Programmatic scan of all 92 rows for multi-target descriptions
without markers, cross-checked against the column dictionary for the actor
rows: REL-040 → 4, REL-050 → 3, REL-057 → 3, REL-088 → 3, REL-093 → 2,
REL-094 → 4, REL-102 → 3, REL-105 → 10 (TBL-042: 3, TBL-045: 3, TBL-063: 1,
TBL-072: 3). Extra edges: **+24**.

**Selected implementation.** Corrected totals: **153 expanded logical
edges**, **151 physical FK target** (excluding REL-103/REL-104, no-FK by
design). The checker derives edges from `×N` markers **plus** a curated
implied-multiplicity map, fails if a row ever carries both, and re-verifies
against the DB4 source on every run. Manifest §2.2 records the corrected
distribution.

**Behaviour impact.** None. **Physical impact.** Prevents both invented and
silently-missing FKs at G9/G11/G16/G17/G19 where the implied rows land.
**Historical documents.** DB4 unchanged; DB6-C1's 129 superseded by this
register entry, not rewritten. **Audit impact.** DB7–DB10 size FK coverage
from 153/151, not 129/128.

---

## DEV-DB6-010 — One mandated FK edge absent from the REL model

| Field | Value |
|---|---|
| Source IDs | ADR-DB4-003 (context-specific asset associations), CST-043 / IDX-051, REL-063, TBL-040 |
| Nature | **genuinely missing edge** in the REL model — a separate deviation per DEV-DB6-009's scope guard, not a counting reinterpretation |
| Status | **closed** (edge implemented in G9) |

**Problem.** `custom_request_assets` needs two FK edges like every other
asset-association table, but the REL model gives it only one. Every sibling
association has an explicit ×2 (or curated) row covering both edges —
REL-025 (product_media), REL-042 (session assets), REL-048 (version
assets), REL-057 (template assets), REL-095 (gallery assets). TBL-040 was
instead bundled into REL-063's five `→ custom_requests` composition edges,
and its `→ assets` edge appears nowhere. Without it, an association row
could reference a deleted asset — exactly the dangling-evidence failure the
tombstone flow exists to prevent.

**Evidence.** Full-text REL-063 row lists only `→ custom_requests`; no other
REL row mentions `custom_request_assets`; ADR-DB4-003 and CST-043
(`(request, asset, role)` unique) both presuppose the asset reference.

**Selected implementation.** `fk_custom_request_assets__asset_id`
(restrict, matching every sibling association) implemented in G9 migration
`0012`. Checker counts it as a **documented addition** on top of the derived
expansion: totals move **153 → 154 logical edges, 151 → 152 physical FK
target**, and the checker fails if the addition constant and manifest ever
disagree.

**Behaviour impact.** None — the edge was always semantically mandated.
**Historical documents.** DB4 unchanged. **Audit impact.** DB7–DB10 use
154/152 from this point; the review-locked 153/151 is superseded by this
register entry under the standing scope-guard clause ("a genuinely missing
edge gets its own deviation").

---

## DEV-DB6-011 — Deferred FK owner reconciliation for Reservation-bound references

| Field | Value |
|---|---|
| Source IDs | DB6_G06_GROUP_REPORT.md §B (deferred-edge row), DB6_SCHEMA_IMPLEMENTATION_MANIFEST.md (G10 wording), REL-028, REL-030, REL-031, TBL-020, TBL-021 |
| Nature | **traceability / implementation-order correction** — not a logical schema deviation; no relationship added, removed, or altered |
| Status | **closed** (documentation + checker correction; no schema/migration change) |

**Problem.** Before G10 scope derivation, the deferred-FK ownership records for
`inventory_ledger_entries.reservation_id`/`.order_id` and
`inventory_soft_holds.converted_reservation_id` were wrong or ambiguous:

- `DB6_G06_GROUP_REPORT.md` §B stated *"soft_hold_id/reservation_id → owner
  G10, order_id → owner G15"* — `reservation_id`'s owner was wrong.
- `DB6_SCHEMA_IMPLEMENTATION_MANIFEST.md`'s prose ("FKs land with owner
  groups G10 (soft_hold_id, reservation_id target tables created there) and
  G15 (order_id)") reads as if both target tables are created in G10, which
  contradicts §3 of the same manifest where `TBL-021 inventory_reservations`
  is unambiguously assigned to G15.
- The REL-030 edge (`inventory_soft_holds.converted_reservation_id →
  inventory_reservations`) — created in G10, resolved in G15 — was never
  carried into the G6/G10 handoff at all.

Left uncorrected, this would have caused G10 to attempt creating
`inventory_reservations` (TBL-021) one group early, out of canonical order
and without its required `orders` composition target (REL-031, `orders`
does not exist until G15).

**Evidence.** `inventory_reservations` (TBL-021) is listed under G15 in
`DB6_SCHEMA_IMPLEMENTATION_MANIFEST.md` §3 with G15's roll-up at 8 tables
(dòng 518, 566). `DB4_TABLE_CATALOG.md:71` defines TBL-021's business
identity as *"one official reservation of quantity for an order"* with
arbiter `(order, sku) active partial`. `DB4_RELATIONSHIP_AND_FK_MODEL.md:59`
(REL-031) requires `inventory_reservations → sku_stocks / orders`, both
edges **required** (`yes`) — the `orders` edge cannot exist before G15.

**Selected implementation.** Corrected owner map, checker-enforced from this
point forward:

```text
inventory_ledger_entries.soft_hold_id          source G6  → owner G10
custom_request_transitions.grant_id            source G9  → owner G10
inventory_ledger_entries.reservation_id         source G6  → owner G15
inventory_ledger_entries.order_id               source G6  → owner G15
inventory_soft_holds.converted_reservation_id   source G10 → owner G15
```

Rule going forward: a deferred FK's resolution owner group must be the
target table's creation group (`resolution_owner_group ==
target_table_creation_group`), enforced by `db-manifest-check.mjs` against a
structured deferred-edge ledger. No exception exists for this checkpoint.

**Behaviour impact.** None. **Physical schema impact.** None — no table,
column, or migration changes; this closes purely as a scheduling/wording
correction ahead of G10. **Migration impact.** None. **Historical
documents.** `DB6_G06_GROUP_REPORT.md`'s original text is not rewritten; a
dated addendum is appended per this deviation. **Relationship denominator.**
Unaffected at the time of this deviation — remained **154 logical edges /
152 physical FK targets** (no edge added, removed, or reinterpreted here;
this deviation only reassigns which group implements an already-counted
edge). DEV-DB6-012 later moves the denominator to 158/156 for an unrelated
reason (a second missing-edge family); that change does not revisit this
entry's reasoning.

**Test/audit impact.** The manifest checker's deferred-owner validation
(added under this deviation) fails the run if any future deferred edge names
an owner group that precedes its target table's creation group, if a target
table is absent from both the owner group and all groups before it, if an
edge has two owners or none, if a deferred column exists with no ledger row,
or if group roll-up counts (G10 = 4, G15 = 8, total = 78) drift from the
approved manifest.

---

## DEV-DB6-012 — A second mandated FK edge family absent from the REL model

| Field | Value |
|---|---|
| Source IDs | DB4_COLUMN_DICTIONARY.md COL-TBL028-10, DB4_COMPLETENESS_MATRIX.md CON-058..060, ADR-DB4-003; DEV-DB6-009's scope guard, DEV-DB6-010 (same class of gap) |
| Nature | **genuinely missing edge family** in the REL model — a separate deviation per DEV-DB6-009's scope guard, not a counting reinterpretation |
| Status | **closed** (edges implemented in G11) |

**Problem.** `design_versions` freezes four placement references at send —
`product_id`, `product_variant_id`, `product_side_id`, `embroidery_area_id`
(COL-TBL028-10) — the same shape as `design_sessions`' placement columns,
which the REL model covers explicitly as REL-040 (curated ×4 implied
multiplicity, DEV-DB6-009). No equivalent row, marker, or implied-multiplicity
entry exists for `design_versions`: REL-044 through REL-051 (the Design
section's full set of rows mentioning `design_versions`) stop at the
case/parent/preview/version-asset/review/approval edges. Without these four
FKs, a formal, hash-frozen design version could point at a deleted product,
variant, side, or embroidery area — an invariant the column dictionary and
CON-058..060 both presuppose is enforced.

**Evidence.** Full-text scan of `DB4_RELATIONSHIP_AND_FK_MODEL.md` §4
(Design) and the manifest's §2.2 implied-multiplicity map: neither mentions
`product_id`/`product_variant_id`/`product_side_id`/`embroidery_area_id` on
`design_versions` anywhere. `DB4_COLUMN_DICTIONARY.md` COL-TBL028-10 and
`DB4_COMPLETENESS_MATRIX.md` CON-058..060 both mandate the four columns as
placement facts frozen at send, with a single non-nullable `N?` cell for the
whole group (unlike `design_sessions`' COL-TBL025-02, which explicitly marks
the variant column nullable — `no/yes/no/no` — confirming the two rows are
deliberately different: by formal-send time, all four placement facts are
resolved).

**Selected implementation.** Four `foreignKey()` FKs
(`fk_design_versions__product_id`, `__product_variant_id`, `__product_side_id`,
`__embroidery_area_id`, all `restrict`) implemented in G11 migration `0015`.
Checker counts them as **documented additions** on top of the derived
expansion and DEV-DB6-010's prior addition: totals move **154 → 158 logical
edges, 152 → 156 physical FK target**, and the checker fails if the addition
constant and manifest ever disagree.

**Behaviour impact.** None — the edges were always semantically mandated.
**Historical documents.** DB4 unchanged. **Audit impact.** DB7–DB10 use
158/156 from this point; the 154/152 figure established through DEV-DB6-010
is superseded by this register entry under the standing scope-guard clause.

---

## DEV-DB6-013 — A third mandated FK edge family absent from the REL model (pre-G13 finding, DB6-C4)

| Field | Value |
|---|---|
| Source IDs | DB4_COLUMN_DICTIONARY.md COL-TBL031-05a..05d, DB4_COMPLETENESS_MATRIX.md CON-058..060 (explicitly names TBL-031 alongside TBL-028); DEV-DB6-009's scope guard; DEV-DB6-012 (identical class of gap, same CON-058..060 source, different table) |
| Nature | **genuinely missing edge family** in the REL model, found by DB6-C4's pre-G12 relationship-coverage audit — a separate deviation per DEV-DB6-009's scope guard |
| Status | **closed — implemented in G13** (migration `0020_create_approval_snapshot_tables.sql`; all four FKs live, physical FK target count now includes these four) |

**Problem.** `approval_snapshots` (TBL-031) freezes four placement references
— `product_id`, `product_variant_id`, `product_side_id`, `embroidery_area_id`
(COL-TBL031-05, dictionary note: `"refs (4 columns -05a..-05d)"`) — the same
placement-VO shape DEV-DB6-012 already resolved for `design_versions`
(TBL-028). No REL row, `×N` marker, or implied-multiplicity entry covers
this quartet for TBL-031: `DB4_RELATIONSHIP_AND_FK_MODEL.md`'s Design
section (REL-044..055) stops at REL-051 (`approval_snapshots.design_version_id`)
and REL-052/053 (case/request/customer/grant/challenge edges) — none of
these three rows mention the catalog placement columns.

**Evidence.** `DB4_COMPLETENESS_MATRIX.md` line 26 (`CON-058..060 | Hash /
Thread color / Placement VOs | hash columns; TBL-032; placement columns on
TBL-028/031 | C`) names **TBL-031 by ID**, confirming the placement VO is
mandated on `approval_snapshots` and not merely inferred from column-name
similarity. Full-text scan of the REL model and the manifest's §2.2 implied
map found no covering entry.

**Selected implementation (implemented, G13).** Four `foreignKey()` FKs to
`products`/`product_variants`/`product_sides`/`embroidery_areas` (all
already implemented since G5), `restrict`, following the exact
DEV-DB6-012/`design_versions` pattern. No deferred-owner ledger row is
needed — all four target tables already exist before G13 runs, so this is a
plain native FK set, not a header/child cycle. Denominator moves **158 → 162
logical edges, 156 → 160 physical FK target** as of this register entry;
checker-enforced (`tools/db-metric-check.mjs`, `ADDITIONAL_EDGES`).

**Behaviour impact.** None yet — no physical schema exists for TBL-031
before G13. **Historical documents.** DB4 unchanged. **Audit impact.** DB7+
must use 162/160 once G13 lands; G13's own execution prompt/report must
implement these four FKs and mark this entry `closed`.

---

## DEV-DB6-014 — A fourth mandated FK edge, one sibling short of full REL-050/053/070/080/085 coverage (pre-G15 finding, DB6-C4)

| Field | Value |
|---|---|
| Source IDs | DB4_COLUMN_DICTIONARY.md COL-TBL049-04a/04b; sibling REL rows REL-050 (design_reviews), REL-053 (approval_snapshots), REL-070 (quotation_acceptances), REL-080 (order_cancellation_requests), REL-085 (payment_attempts) |
| Nature | **genuinely missing edge**, found by DB6-C4's pre-G12 relationship-coverage audit — the one secure-flow evidence table whose sibling pattern breaks |
| Status | **closed — implemented in G15** (migration `0023_create_order_reservation_shipping_tables.sql`; both FKs live, physical FK target count now includes these two) |

**Problem.** Every customer step-up-evidence table in the model carries an
explicit `grant_id` + `step_up_challenge_id` pair with its own REL row:
`design_reviews` (REL-050), `approval_snapshots` (REL-053),
`quotation_acceptances` (REL-070), `order_cancellation_requests` (REL-080),
`payment_attempts` (REL-085). `shipping_fee_acknowledgements`
(COL-TBL049-04a/04b, dictionary note: `"secure-flow acknowledgement
evidence"`) is structurally identical to these five — a customer
acknowledgement gated by an active grant plus a completed step-up challenge
— but no REL row names it.

**Evidence.** Full-text scan of `DB4_RELATIONSHIP_AND_FK_MODEL.md` for
`shipping_fee_acknowledgements`: only the `order_id` edge is covered, as one
of REL-078's five-way composition list (`order_transitions` /
`cancellation_requests` / `shipping_details` / `shipping_snapshots` /
`fee_acknowledgements` → `orders`). No row extends to the grant/challenge
pair, unlike its five structural siblings above.

**Selected implementation (implemented, G15).** Two `foreignKey()` FKs to
`secure_access_grants` and `contact_verification_challenges` (both already
implemented since G10/G8), `restrict`, mirroring the five sibling tables'
treatment. No deferred-owner ledger row needed — both targets predate G15.
Denominator moves **162 → 164 logical edges, 160 → 162 physical FK target**
(stacking on DEV-DB6-013 above); checker-enforced.

**Behaviour impact.** None yet — no physical schema exists for TBL-049
before G15. **Historical documents.** DB4 unchanged. **Audit impact.** DB7+
must use 164/162 once G15 lands; G15's execution prompt/report must
implement these two FKs and mark this entry `closed`.

---

## DEV-DB6-015 — Formalizing the bare admin-actor-evidence no-FK pattern (pre-G14..G17 finding, DB6-C4)

| Field | Value |
|---|---|
| Source IDs | `request_moderation_notes.admin_id` (G9, see file-level note in `request-moderation-notes.ts`); `customer_merge_cases.requested_by_admin_id` (G10); REL-105's closed enumeration (TBL-042/045/063/072 only) |
| Nature | **documentation formalization, not a new relationship** — generalizes an already-applied, twice-precedented classification so it does not have to be re-litigated per table |
| Status | **closed** (rule stated; no schema change; no denominator change) |

**Problem.** DB6-C4's pre-G12 audit found four forward `admin_id`-shaped
columns with no per-table no-FK rationale written anywhere yet:
`order_cancellation_requests.decided_by_admin_id` (G15, COL-TBL046-08),
`payment_reconciliations.admin_id` (G16, COL-TBL057-07),
`refunds.approved_by_admin_id`/`executed_by_admin_id` (G16, COL-TBL058-10),
`production_notes.admin_id` (G17, COL-TBL062-03). Each is the same bare
actor-evidence shape already resolved twice for TBL-041 and TBL-009: a
column with a dictionary arrow toward `admin_accounts` but no REL row,
because DB4's REL-105 only FKs actor references on the four tables it
explicitly enumerates (TBL-042/045/063/072).

**Evidence.** `request-moderation-notes.ts` and `customer-merge-cases.ts`'s
existing file-level comments state the rule per-column
("...exactly like the G6 ledger actor refs the review accepted..."), but no
DB4 or DB6 document states it as a *general* rule applicable to any table
outside REL-105's list. The four columns above are outside that list, same
as TBL-041/TBL-009 were.

**Selected implementation.** No schema change (targets not yet
implemented). This entry states the general rule explicitly so G14–G17 do
not need to re-derive it column-by-column: **any bare `admin_id`-shaped
actor-evidence column on a table not named in REL-105 stays a no-FK evidence
reference (Class B), unless a future DB4 document explicitly adds it to
REL-105 or a dedicated REL row.** The four forward columns above are
prospectively Class B under this rule. No FK is added retroactively or
prospectively by this entry; G14–G17 implement them exactly as written
(evidence column, no `foreignKey()`), same as TBL-041/TBL-009.

**Behaviour impact.** None. **Historical documents.** DB4 unchanged.
**Audit impact.** None — no edge count changes; this closes a
classification ambiguity, not a missing edge.

**G16 implementation (2026-07-19):** `payment_reconciliations.admin_id`
(COL-TBL057-07) and `refunds.approved_by_admin_id`/`executed_by_admin_id`
(COL-TBL058-10) are now implemented exactly as prescribed — bare uuid
columns, no `foreignKey()` declared, outside REL-105's enumeration. No
denominator change.

**G17 implementation (2026-07-19):** `production_notes.admin_id`
(COL-TBL062-03) — the fourth and last of this entry's four forward
columns — is now implemented exactly as prescribed: bare uuid column, no
`foreignKey()` declared. All four forward columns this entry named are now
closed. **Not applied** to `production_job_transitions.admin_id`
(TBL-063, COL-TBL063-03): TBL-063 is one of REL-105's four explicitly
enumerated tables, so its actor column gets a real `foreignKey()` to
`admin_accounts` instead — the two tables are not interchangeable under
this rule, and no denominator change resulted from either.

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
