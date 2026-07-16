# DB4 — Completeness Matrix

**Date:** 2026-07-15 · **Git HEAD:** `a79f523`
**Statuses:** `C` complete · `C-DP` complete with deferred **physical**
mechanism (trigger/partial-unique/exclusion DDL → DB6; index → DB5; config
durations → business) · no row is `unresolved`.

## 1. DB2 canonical concepts (75 = 68 modeled + 7 merged/rejected)

| CON | Concept(s) | Logical table(s) / canonical replacement | Status |
|---|---|---|---|
| CON-001..003 | Admin account/credential/session | TBL-001/002/003 | C |
| CON-004 | Login/Security event | → CON-150 (audit_events TBL-072) — merged at DB2 | C (replacement) |
| CON-010..012 | Customer, Contact Point, Business Profile | TBL-004/005/078 | C |
| CON-013/014 | Challenge + Attempt | TBL-006/007 | C |
| CON-015/016 | Grant + Scope | TBL-008 (scope_kind + NN request binding) | C |
| CON-017 | Masked identifier | derived at render (VO; no storage) | C |
| CON-018 | Contact snapshot | columns on TBL-031 (+TBL-048 recipient) | C |
| CON-020..026 | Category…Product Media | TBL-011..017 | C |
| CON-027..029 | SEO / Dimension / Mapping VOs | columns on owning tables (seo_*, *_mm, px_per_mm) | C |
| CON-030..036 | SKU Stock family | TBL-018..021 + reason/actor columns | C-DP (locks/triggers → DB6) |
| CON-040..044 | Asset family + VOs | TBL-022..024 (storage_key, classification) | C |
| CON-050..052 | Session, Autosave, Design Document | TBL-025 (autosave merged per DB2) + jsonb #1/#2 | C |
| CON-053..056 | Case, Version, Review, Approval Snapshot | TBL-027..033 | C-DP (partial unique/triggers → DB6) |
| CON-057 | Template | TBL-034..036 | C |
| CON-058..060 | Hash / Thread color / Placement VOs | hash columns; TBL-032; placement columns on TBL-028/031 | C |
| CON-061 | Preview | → CON-042 (asset_derivatives) + preview refs/hashes | C (replacement) |
| CON-070..074 | Request, COP, Moderation, Code, Breakdown | TBL-037..041 | C |
| CON-075 | Request Item | **stays rejected** — TBL-039 is VO storage, documented | C (replacement) |
| CON-076..082 | Order, Item, Shipping, Recipient/Address VOs, Transition, Code | TBL-043..049 | C-DP (freeze trigger → DB6) |
| CON-090..096 | Quotation family | TBL-050..053 | C-DP (send-freeze trigger → DB6) |
| CON-100..106 | Payment family | TBL-054..058; CON-106 allocation = attempt FK (documented) | C |
| CON-110..113 | Production family | TBL-059..062 (+TBL-063 history) | C |
| CON-120/121 | Gallery | TBL-064/065 | C |
| CON-125..129 | Content, Redirect, Agreement(+Version), Terms Acceptance | TBL-066..069 + TBL-033 | C-DP (exclusion candidate → DB6) |
| CON-130..133 | Notification family | TBL-070/071 | C |
| CON-140..144 | Outbox, Idempotency(+fingerprint), Job Attempt, Policy Config | TBL-073/074/075/076/077 | C |
| CON-150 | Audit Event | TBL-072 | C |
| CON-160..167 | Shared VOs (Money…Doc schema version) | column conventions per ADR-DB4-001 + dictionary | C |
| CON-170..176 | Read models | **not tables** (catalog §3) — query compositions | C (by design) |
| CON-180 | Analytics emission | not persisted (GAP-11 decision); SE-018 via outbox | C (by design) |

## 2. Aggregates (23/23)

AGG-01→TBL-001..003 · AGG-02→TBL-004/005/078(+009/010 workflow) ·
AGG-03→TBL-006/007 · AGG-04→TBL-008 · AGG-05→TBL-011 · AGG-06→TBL-012..017 ·
AGG-07→TBL-018..021 · AGG-08→TBL-022..024 · AGG-09→TBL-025/026 ·
AGG-10→TBL-027..030 · AGG-11→TBL-031..033 · AGG-12→TBL-034..036 ·
AGG-13→TBL-037..042 · AGG-14→TBL-050..053 · AGG-15→TBL-043..049 ·
AGG-16→TBL-054..058 · AGG-17→TBL-059..063 · AGG-18→TBL-064/065 ·
AGG-19→TBL-066 · AGG-20→TBL-067 · AGG-21→TBL-068/069 · AGG-22→TBL-070/071 ·
AGG-23→TBL-076/077. **No orphan table; no duplicate owner** (every TBL has
exactly one Agg/module owner in the catalog). Status: 23× C.

## 3. Lifecycles (29/29) & transitions (~90)

All 29 lifecycles mapped to authoritative state columns + history tiers in
[`DB4_STATE_AND_TRANSITION_STORAGE.md`](./DB4_STATE_AND_TRANSITION_STORAGE.md).
Every TR-* group has storage support: Tier A tables record LC-11/14/18/19/21
transitions row-per-change; Tier B lifecycles' transitions are materialized
by their immutable/append structures (versions, acceptances, provider
events, reconciliations, refunds, ledger, attempts, inspections, reviews,
merge events); Tier C transitions persist as state timestamps + audit.
Official names appear verbatim in CHECK sets (CST-060), including
QUOTE_ACCEPTED, ON_HOLD, CANCELLING. Derived states not authoritative
(§ state doc 4). Status: 29× C (transition-table DDL → C-DP/DB6).

## 4. Guards (30/30) & invariants (35/35)

Per [`DB4_GUARD_SCHEMA_TRACEABILITY.md`](./DB4_GUARD_SCHEMA_TRACEABILITY.md)
(30/30 with supplying columns + consistency/locks) and
[`DB4_INVARIANT_SCHEMA_TRACEABILITY.md`](./DB4_INVARIANT_SCHEMA_TRACEABILITY.md)
(35/35; primary-DB invariants have named CSTs; TX/APP invariants have named
fact tables; PROC invariants remain DB1-owned). Status: C (DB-mechanism DDL
→ C-DP/DB6).

## 5. Queries (Q-01..33) & concurrency (CC-01..28)

All 33 queries + 11 DB3 operational paths handed to DB5
([`DB4_DB5_HANDOFF.md`](./DB4_DB5_HANDOFF.md)) with tables/joins/filters/
uniqueness/consistency — status C (index design deferred to DB5 by
definition). All 28 CC scenarios map to structures in
[`DB4_TEST_HANDOFF.md`](./DB4_TEST_HANDOFF.md) §2 (D8-01..25 cover CC-01..28
with the DB3-documented merges). Status: C.

## 6. Side effects & snapshot/history categories

SE-001..020: outbox payload/dispatch model (TBL-073, CST-099) carries all
after-commit intents; SE-019 audit in-tx (TBL-072); SE-015 sweeps have
explicit timestamp columns to scan; SE-018 analytics = emission only.
Snapshot/history categories: all §1/§2/§3 rows of
[`DB2_SNAPSHOT_AND_HISTORY_MODEL.md`](./DB2_SNAPSHOT_AND_HISTORY_MODEL.md)
have structures in [`DB4_SNAPSHOT_AND_VERSIONING_MODEL.md`](./DB4_SNAPSHOT_AND_VERSIONING_MODEL.md).
Status: C.

## 7. GAP-10

Closed — stitch count locked as admin-entered quotation pricing input
(`quotation_versions.stitch_count`; see
[`DB4_MONEY_QUANTITY_MEASUREMENT_MODEL.md`](./DB4_MONEY_QUANTITY_MEASUREMENT_MODEL.md) §3);
register updated append-only. Status: C.

## 8. Exit-gate roll-up

| Dimension | Count | Unresolved |
|---|---|---|
| Concepts | 75/75 | 0 |
| Aggregates | 23/23 | 0 |
| Lifecycles / transitions | 29/29 · ~90 TR with storage | 0 |
| Invariants | 35/35 | 0 |
| Guards | 30/30 | 0 |
| Queries | 33 + 11 operational | 0 |
| Concurrency scenarios | 28/28 | 0 |
| Tables / constraints / relationships | 78 / CST-001..125 (+ blankets) / REL-001..105 | 0 |

**Deferred items (all owned):** trigger/partial-unique/exclusion DDL +
locking spikes → DB6; index/access-path design → DB5; configuration values
(TTLs, retention durations, retry budgets, refund defaults, deposit
percent, agreement type set, code formats, size limits) → business via
CON-144 (unchanged from DB1/DB3 register); provider-specific mappings →
O-005/O-006 ADRs. **No unresolved critical row.**
