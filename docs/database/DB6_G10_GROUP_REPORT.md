# DB6-G10 — Secure Grants, Inventory Soft Holds & Customer Merge Group Report

**Date:** 2026-07-19 · **Verdict:** `DB6-G10 PASS` · `OVERALL DB6 IN PROGRESS`

## A. DB6-C3 (deferred FK owner reconciliation)

| Field | Value |
|---|---|
| Root cause | `DB6_G06_GROUP_REPORT.md` §B and the schema manifest's G6 prose recorded `reservation_id`'s resolution owner as **G10**; `inventory_reservations` (TBL-021) is actually a **G15**-created table (manifest §3), and its required `orders` composition edge (REL-031) cannot exist before G15 either |
| Corrected owner map | `soft_hold_id` → **G10** · `grant_id` → **G10** · `reservation_id` → **G15** · `order_id` → **G15** · `converted_reservation_id` (REL-030, carried forward, not previously tracked) → **G15** |
| Files changed | `DB6_SCHEMA_IMPLEMENTATION_MANIFEST.md` (new §2.2.1 structured ledger + corrected G6 prose), `DB6_G06_GROUP_REPORT.md` (addendum, original text untouched), `DB4_DB6_HANDOFF.md` (implementation-order addendum), `DB6_DEVIATION_REGISTER.md` (new `DEV-DB6-011`) |
| Checker/tests | `tools/db-deferred-owner-check.mjs` (new, split out of `db-metric-check.mjs` to respect the 400-line cap) validates `resolution_owner_group == target_table_creation_group`, no-owner/two-owner edges, target-table existence, and the G10=4/G15=8 roll-up; 10 tamper tests in `tools/db-deferred-owner-check.test.mjs` all pass |
| Metrics unchanged | Logical edges **154**, physical FK target **152** — no edge added/removed/reinterpreted, only implementation-group scheduling corrected |
| Commit | `c2958fa chore(database): reconcile DB6 deferred FK ownership` |
| Verdict | **PASS** |

## B. Preflight G10

| Check | Result |
|---|---|
| Branch / HEAD | `production` / `c2958fa` (DB6-C3) |
| Working tree | clean before G10 work began |
| Migrations `0000`–`0013` | byte-identical (verified via `git diff --stat`, empty) |
| Journal | 14 entries pre-G10, 15 post-G10, append-only |
| Manifest + deferred-owner checker | PASS |
| Canonical metrics pre-G10 | 37 tables, 349 physical columns, 154/152 REL |
| G10 group | exactly 4 tables (checker-enforced) |
| G15 retains TBL-021 | confirmed, 8 tables |
| `soft_hold_id`/`grant_id`/`reservation_id`/`order_id` FKs | absent before G10 (confirmed) |
| Partial G10 attempt | none (`secure-access-grants.ts` et al. absent) |
| Push | not performed |

## C. G10 scope (exact 4 canonical tables)

| Item | Value |
|---|---|
| TBL / tables | TBL-008 `secure_access_grants` · TBL-020 `inventory_soft_holds` · TBL-009 `customer_merge_cases` · TBL-010 `customer_merge_events` |
| Column metrics | **27 logical IDs + 0 expansions = 27 business + 11 convention = 38 physical** (12/10/9/7) |
| REL → FK | REL-009, REL-010, REL-011 (grants) · REL-012 ×2, REL-013 (merge) · REL-029 ×2 (holds) = **8 native FKs**; + 2 owner-G10 deferred resolutions (`ledger.soft_hold_id`, `transitions.grant_id`) = **10 physical FKs added** |
| Deferred owner-G15 (unchanged by G10) | `ledger.reservation_id`, `ledger.order_id`, `soft_holds.converted_reservation_id` |
| No-FK evidence | `customer_merge_cases.requested_by_admin_id` (REL-105 enumeration doesn't list TBL-009 — same class as TBL-019/TBL-041) |
| CST | CST-001 ×4, CST-008 (IDX-007), CST-009 (IDX-008, LC-03), CST-010 (IDX-009), CST-015 (IDX-017, LC-17), CST-069 second instance, scope_kind/step_kind closed sets, quantity>0, 2 conditional-reason CHECKs |
| IDX | Constraint-created: 4 PK + IDX-007 (UQ) + IDX-008/009/017 (pUQ) = 8; Explicit perf: IDX-105/106/107/109/113 = 5; **13 total** |
| Security fields | `token_hash` (hash-only, no plaintext) |
| Quantity/state fields | Hold `quantity`/`status`/`expires_at`; Merge `status`/`reason` |
| Dependencies | G3 (customers), G6 (sku_stocks), G9 (custom_requests, custom_request_transitions) |

## D. Implementation

**Secure Access Grants** — hashed-token, scope-bound authorization evidence. No password/refresh-token/API-key/OTP column exists (structural scan confirms `token` column doesn't exist — only `token_hash`). `scope_kind` closed to `REQUEST_ACCESS` today. Revoke-vs-use race left as CST-116 TX/App (no CHECK can arbitrate a wall-clock race). Single active grant per (customer, request) is a partial-unique arbiter (IDX-008), not app-checked-then-write.

**Inventory Soft Holds** — temporary, TTL-mandatory pre-official allocation. **No Reservation object of any kind was created**: no table, no lifecycle constant, no constraint, no index — verified by a leakage scan and a live structural probe (`select * from inventory_reservations` → `relation does not exist`). `converted_reservation_id` exists nullable with no FK, correctly deferred to G15 per DEV-DB6-011. `sku_stocks.quantity_on_hand` remains the sole authoritative counter; no `available`/`reserved` column added anywhere.

**Customer Merge Cases** — explicit, admin-only, audited decision record; no trigger, no `ON CONFLICT`, no contact-equality auto-merge (static scan = 0 matches). CST-069's second instance (survivor ≠ loser) completes the rule whose first instance guards `customers.merged_into_customer_id` since G3.

**Customer Merge Events** — append-only evidence (CST-098 → S24, honestly not yet a database mechanism; smoke case 29 demonstrates the UPDATE currently succeeding, same documented-gap pattern as the ledger/transitions tables).

**Deferred FK resolutions** — `inventory_ledger_entries.soft_hold_id` and `custom_request_transitions.grant_id` both added as table-level `foreignKey()` in their *existing* schema files; migrations `0008`/`0012` were **not** modified — the new FK constraints ship in migration `0014` alongside the 4 new tables.

**Migration** `0014_create_secure_grants_soft_holds_and_customer_merge.sql` — generated, human-reviewed: 4 `CREATE TABLE` (4 PK, 1 UQ, 9 CK), 8 native FKs, 2 deferred-resolution FKs, 3 explicit partial-unique indexes, 3 explicit performance indexes. No custom SQL required (no FK cycle in this group). No deviation beyond the DB6-C3 correction already committed.

## E. Metrics after G10

```text
groups complete:                    10 / 19
tables implemented:                 41 / 78
logical COL IDs: 254 · expansions: 20 · business: 274 · convention: 113
physical columns:                  387 (live-anchored: pg_attribute agrees)
logical relationship edges:        154 · physical FKs implemented: 64 / 152
expanded constraint instances:     265 mapped
physical constraints implemented:  189 (41 PK + 64 FK + 24 UQ + 60 CK)
launch indexes implemented:         95 / 211
partial indexes implemented:        18 / 45 (G10 adds 3 pUQ; volatile = 0)
JSONB boundaries implemented:        5 / 9
state/type columns implemented:     23 (+status ×2, scope_kind, step_kind)
required documents complete:         7 / 15
```

## F. A01–A15 (G10 effect)

- **A03** — +3 partial unique (IDX-008/009/017), all stable-state predicates, no `now()`; running total **18/45**, volatile 0.
- **A08** — no money field in G10 (DB4 defines none for these tables); unchanged, partially closed.
- **A09** — +4 sets (grant LC-03, grant scope_kind, hold LC-17-hold-side, merge-case +5, merge-event step_kind) → **23** state/type columns, byte-identical parity confirmed against exported tuples.
- **A10** — grants: operational mutable security root. Holds: operational mutable temporary allocation. Merge cases: mutable audited saga root. Merge events: **append-only**, CST-098 → S24 target, honestly not claimed (smoke case 29).
- **A11** — launch-required only; grants carry PK+4 (IDX-007/008/106/107 required, IDX-105 required) — 5 indexes total incl. PK; holds carry PK+3 (IDX-017/109/113) — matches DB5 hot-table budget language for these tables.
- **A12** — deferred DB9; EXPLAIN/lock evidence here is structural only.
- **A15** — no speculative contact-match or merge-candidate index added; Q-20 unaffected.
- **Deferred owner map after G10**: `ledger.reservation_id` → G15, `ledger.order_id` → G15, `soft_holds.converted_reservation_id` → G15, `custom_requests.current_quotation_id` → G14, `design_cases.current_version_id` → G11 — all unchanged by this group, all checker-enforced via §2.2.1.

## G. Validation

| Gate | Result |
|---|---|
| Static (typecheck, lint, format, 63 tests, file-size, manifest + deferred-owner + column-metric checkers) | PASS |
| Reservation/auto-merge/plaintext-token leakage scans | 0 unauthorized objects (only doc-comment mentions of `inventory_reservations`/`converted_reservation_id`, which are allowed references) |
| Fresh: empty → 15 migrations (disposable `embroidery_fresh_g10`) | PASS; 41 tables; `inventory_reservations` absent; drift clean; dropped after use |
| Upgrade from G9 prefix (disposable `embroidery_upgrade_g10`, 14→15 migrations, seeded customer pair + ledger row with null soft_hold/reservation/order + transition row with null grant_id) | pre-existing rows survived untouched; both new FKs reject a dangling UUID written after the fact; `reservation_id`/`order_id` still silently accept a dangling UUID (deferred gap, matches ledger); drift clean; dropped after use |
| No-op reapply | PASS, no duplicate objects, journal unchanged |
| Drift/checksum | `drizzle-kit check` → "Everything's fine"; `0000`–`0013` unchanged |
| Physical parity | 41 tables; 41 PK + 64 FK + 24 UQ + 60 CK = 189 constraints; 95 indexes; 0 duplicate index names; 0 non-conforming constraint names |
| Behavioral smoke | **33/33** — grant valid/bogus-status/bogus-scope/dup-token/dup-active/revoke-without-reason/consume-UPDATE-1-then-0/dangling-customer/no-plaintext-column; hold valid/dangling-stock/non-positive-qty/bogus-state/dup-active/release-without-reason/converted-dangling-honest-gap/no-reservation-table; ledger dangling-soft-hold-rejected/valid-accepted; merge-case valid/self-merge/dangling-survivor/bogus-state/dup-open-pair/dangling-admin-honest-gap; merge-event valid/dangling-case/bogus-step/append-only-gap-honest; transitions dangling-grant-rejected/valid-accepted; restrict on customer and request with live children; rollback residue 0/0/0/0 |
| Lock smoke | stock row `FOR UPDATE` held in tx A, tx B `NOWAIT` → `could not obtain lock on row` (55P03), Hold inserted inside the locked shape, rollback released it; two-customer deterministic ascending-id lock order acquired without deadlock |
| Security/privacy | no plaintext token/secret column exists anywhere in the group; no PII beyond existing customer display names; no unscoped index |

## H. Commits

```text
c2958fa  chore(database): reconcile DB6 deferred FK ownership   (DB6-C3)
```

G10 implementation commit follows this report (see §I context) — one commit, tree clean, not pushed, no prior commit amended.

## I. Verdict

```text
DB6-C3       PASS
DB6-G10      PASS
OVERALL DB6  IN PROGRESS
```

Task board: `DB6-G01..G19` = **10/19** (open) · `DB6-S24..S28` open.
