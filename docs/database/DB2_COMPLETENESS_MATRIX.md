# DB2 — Conceptual Model Completeness Matrix

**Date:** 2026-07-15 · **Git HEAD:** `f90f78c`
**Purpose:** Prove every DB0 candidate concept, requirement, domain,
lifecycle, invariant and query is represented in the DB2 model (or explicitly
merged/rejected/deferred with rationale). Statuses: `mapped` · `merged` ·
`rejected-duplicate` (with canonical replacement) · `deferred` · `unresolved`.

## A. Concept status roll-up

All 75 canonical concepts in
[`DB2_CONCEPT_INVENTORY.md`](./DB2_CONCEPT_INVENTORY.md) are `mapped` with a
single owner, **except** the explicitly documented resolutions (inventory
§15):

| DB0/DB2 concept | Status | Canonical replacement / rationale |
|---|---|---|
| Login Event (CON-004) | merged | CON-150 Audit Event |
| Autosave Snapshot (CON-051) | merged | CON-050 Design Session (working copy + save state) |
| Revision Request (CON-054 alias) | merged | CON-055 Review Decision |
| Preview (CON-061) | merged | CON-042 Asset Derivative (+ hash frozen in version/approval) |
| Request Item (CON-075) | rejected-duplicate (MVP) | CON-074 Quantity Breakdown + CON-077 Order Item; additive later (B2B readiness note in AGG-13) |
| Delivery Event | merged | CON-081 Order Transition Event |
| Template Asset / Production Asset | merged | CON-040 Asset (classification kinds) |
| SKU Availability (stored) | rejected-duplicate | projection of CON-034 + catalog override (LC-05 precedence → DB3) |
| Analytics Event (stored) | rejected (decision) | CON-180 emission-only per [`DB2_ANALYTICS_STORAGE_DECISION.md`](./DB2_ANALYTICS_STORAGE_DECISION.md) |

**Unresolved: 0.**

## B. Requirement coverage (129 REQ → concepts)

| DB0 section (REQ range) | Canonical concepts | Owner ctx |
|---|---|---|
| REQ-IDN-001..004 | CON-001..003 (+CON-150 audit) | IDN/AUD |
| REQ-CUST-001..003 | CON-010..012 | CUS |
| REQ-VERIF-001..002 | CON-013/014; CON-017 | CUS |
| REQ-GRANT-001..004 | CON-015/016 (+read path Q-08) | CUS |
| REQ-CAT-001..006 | CON-020/021/026/027; CON-160 (money) | CAT |
| REQ-VAR-001..002 | CON-022/023 (+CON-034 projection) | CAT/INV |
| REQ-SIDE-001..003 | CON-024/025/028/029 | CAT |
| REQ-TMPL-001..002 | CON-057 (+CON-040 assets) — GAP-08 resolved | DSN/AST |
| REQ-MEDIA-001 | CON-026→CON-040 | CAT/AST |
| REQ-INV-001..007 | CON-030..036 | INV |
| REQ-ASSET-001..007 | CON-040..044 (+backup coordination ADR-DB1-014) | AST |
| REQ-SESS-001..005 | CON-050..052 | DSN |
| REQ-DVER-001..006 | CON-053/054/058 | DSN |
| REQ-REVIEW-001..002 | CON-055 (+BR-008 authority rule) | DSN |
| REQ-APPR-001..003 | CON-056/018/129 | DSN |
| REQ-COP-001..002 | CON-071 (INV-13) | ORD |
| REQ-REQ-001..005 | CON-070/072/073/074 | ORD |
| REQ-QUOT-001..006 | CON-090..096 | QUO |
| REQ-ORD-001..005 | CON-076/077/081/082 | ORD |
| REQ-PAY-001..010 | CON-100..106 (provider open, modeled generically) | PAY |
| REQ-PROD-001..004 | CON-110..113 | PRD |
| REQ-SHIP-001..004 | CON-078..080 (+CON-081) — GAP-05 resolved | ORD |
| REQ-GAL-001..002 | CON-120/121/027 | GAL |
| REQ-SEO-001..004 | CON-125/126/027 (+CON-175 sitemap) | CNT |
| REQ-NOTIF-001..002 | CON-130..133 — GAP-06 resolved | NTF |
| REQ-AUDIT-001..003 | CON-150 | AUD |
| REQ-OUTBOX-001..002 | CON-140/143 | PLT |
| REQ-IDEM-001..002 | CON-141/142 | PLT |
| REQ-RETEN-001..002 | CON-144 + per-concept retention columns in inventory/classification map | PLT + owners |
| REQ-OPS-001..013 | operational (DB1-owned architecture; DB2 model conforms — no new concepts needed beyond CON-144) | — |
| REQ-INT-001..006 | CON-160 (money), FK direction rules (relationship model), CON-165/ID model, status rule (ADR-DB1-008), CON-052/058 (document+hash) | shared |

All 129 requirement rows trace to at least one canonical concept or to the
DB1 operational architecture (REQ-OPS set). No requirement is orphaned.

## C. Lifecycle ownership (23)

| LC | Owner aggregate/context | LC | Owner |
|---|---|---|---|
| LC-01 Admin account | AGG-01 / IDN | LC-13 Quotation version | AGG-14 / QUO |
| LC-02 Verification | AGG-03 / CUS | LC-14 Order | AGG-15 / ORD |
| LC-03 Secure grant | AGG-04 / CUS | LC-15 Payment obligation | AGG-16 / PAY |
| LC-04 Product publication | AGG-06 / CAT | LC-16 Payment attempt | AGG-16 / PAY |
| LC-05 SKU availability | AGG-07 (stock truth) + AGG-06 (display override; precedence → DB3) | LC-17 Reservation | AGG-07 / INV |
| LC-06 Asset processing | AGG-08 / AST | LC-18 Production job | AGG-17 / PRD |
| LC-07 Design session | AGG-09 / DSN | LC-19 Delivery | AGG-15 (transition events) / ORD |
| LC-08 Design version | AGG-10 / DSN | LC-20 Refund | PAY records (CON-105) — policy DB3 |
| LC-09 Customer review | AGG-10 / DSN | LC-21 Cancellation | ORD orchestrates (AGG-13/15) + PAY/INV via events — policy DB3 |
| LC-10 Approval | AGG-10→AGG-11 / DSN | LC-22 Outbox | CON-140 / PLT |
| LC-11 Custom request | AGG-13 / ORD | LC-23 Idempotency | CON-141 / PLT |
| LC-12 Quotation | AGG-14 / QUO | | |

All 23 lifecycles have exactly one owning aggregate/context (LC-05 and LC-21
are explicitly split/orchestrated with the coordinating owner named).

## D. Invariant ownership (35)

| INV | Owner (enforcement handoff) | INV | Owner |
|---|---|---|---|
| INV-01 approved immutable | AGG-10/11 (DB3/DB4/DB7) | INV-19 no dup order/payment/lost version | AGG-15/AGG-16/AGG-10 + CON-141 (DB8) |
| INV-02 quotation version immutable | AGG-14 (DB7) | INV-20 approval via secure flow only | AGG-10 + AGG-04 (DB3) |
| INV-03 production ↔ approved version | AGG-17→AGG-11 (DB8) | INV-21 no export | classification map + AST access scope (DB8/E2E-09) |
| INV-04 two obligations | AGG-16 (DB4) | INV-22 watermark rule | CON-042 derivative rules (DB4) |
| INV-05 reservation gate | AGG-07 + W4 (DB8) | INV-23 outbox | CON-140 + tx candidates (DB8) |
| INV-06 ordering preconditions | AGG-15 guards (DB3/DB8) | INV-24 idempotency scoped/expired | CON-141/144 (DB4/DB8) |
| INV-07 callback idempotency | AGG-16 + CON-141 (DB8) | INV-25 referential integrity | relationship model → DB4 FKs (DB7) |
| INV-08 grant scope | AGG-04 (DB8) | INV-26..31 migration/portability | DB1 architecture (DB6/DB7/DB10) — no DB2 concept needed |
| INV-09 private assets | AGG-08 (DB4) | INV-32 hash reproducibility | CON-052/058 + ADR-DB1-012 (DB7) |
| INV-10 no binaries in PG | AGG-08/CON-043 (DB4) | INV-33 backup security | ADR-DB1-014 (DB10) |
| INV-11 exact money | CON-160 (DB4/DB7) | INV-34 restore compatibility | ADR-DB1-014 (DB10) |
| INV-12 historical snapshots | snapshot model §2 (DB7) | INV-35 volume reuse | ADR-DB1-013 (DB6/DB10) |
| INV-13 COP ≠ SKU | AGG-13/CON-071 (DB4) | | |
| INV-14 audited transitions | CON-150 + per-aggregate events (DB3/DB7) | | |
| INV-15 no redirect success | AGG-16 rules (DB8) | | |
| INV-16 single active review | AGG-10 (DB4 partial unique, DB8) | | |
| INV-17 approved terminal | AGG-10 (DB7) | | |
| INV-18 non-negative stock | AGG-07 (DB7) | | |

## E. Query/use-case ownership (33)

| Q | Conceptual owner / read composition | Q | Owner |
|---|---|---|---|
| Q-01/02 product listing/detail | CAT read | Q-18 pending final payment | CON-173 (ORD+PAY compose) |
| Q-03 SKU availability | INV projection via CAT display | Q-19 production queue | CON-172 (PRD+ORD) |
| Q-04 gallery | GAL read | Q-20 low stock | CON-171 (INV) |
| Q-05 content page | CNT read | Q-21 request listing | ORD read |
| Q-06 sitemap | CON-175 (CNT+CAT+GAL) | Q-22 dashboard | CON-170 (multi, read-only) |
| Q-07 redirect | CNT read | Q-23 failed payments | CON-173 (PAY) |
| Q-08 secure link lookup | CUS (grant service) | Q-24 expiring quotations | CON-174 (QUO) |
| Q-09 request detail (customer) | CON-176 (ORD+DSN+QUO+PAY compose) | Q-25 session cleanup | DSN + worker |
| Q-10 version history | DSN read | Q-26 asset queue | AST + worker |
| Q-11 current review version | DSN (INV-16 adjacent) | Q-27 outbox scan | PLT relay |
| Q-12/13 quotation history/current | QUO read | Q-28 idempotency check | PLT service |
| Q-14 approval lookup | DSN read (ORD/PRD consumers) | Q-29 audit lookup | AUD read |
| Q-15 order lookup | ORD read | Q-30 signed asset access | AST service |
| Q-16 payment reconciliation | PAY read | Q-31 verification lookup | CUS |
| Q-17 pending deposit | CON-173 (ORD+PAY) | Q-32 reservation-eligible | INV (locked read) |
| — | | Q-33 analytics readiness | CON-180 emission (external tool) |

## F. Domain coverage (58 DOM)

All DOM-01..58 map into the model: DOM-01..04 → IDN/CUS; DOM-05..13 →
CAT/DSN(template); DOM-14..16 → INV; DOM-17..19 → AST; DOM-20..24 → DSN;
DOM-25..27 → ORD; DOM-28..31 → QUO; DOM-32..34 → ORD; DOM-35..39 → PAY;
DOM-40..41 → PRD; DOM-42 → ORD(shipping); DOM-43 → GAL; DOM-44 → CNT;
DOM-45 → NTF; DOM-46 → AUD; DOM-47..48 → PLT; DOM-49..58 → DB1 operational
architecture (retention config = CON-144; backup/restore/migration/
versioning/seed/multi-machine/Docker/secrets are DB1-owned, conformed to,
and require no DB2 concepts). **Explicitly excluded from the conceptual
model with rationale:** none — every domain either has concepts or is
operational architecture.

## G. Exit-gate check

- Unresolved concepts: **0** (§A).
- Two-owner concepts: **0** (ownership matrix validation).
- Orphan requirements/lifecycles/invariants/queries: **0** (§B–§E).
- Merged/rejected items: **9**, each with canonical replacement + rationale (§A).
- Deferred items: carried in [`DB2_IMPLEMENTATION_HANDOFF.md`](./DB2_IMPLEMENTATION_HANDOFF.md) with owners.
