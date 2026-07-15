# DB2 — Snapshot & Historical Model

**Date:** 2026-07-15 · **Git HEAD:** `f90f78c`
**Baseline:** immutability classes and enforcement direction per ADR-DB1-010
(app guards + versioned records + DB reject-mutation triggers, per-table
mapping at DB3/DB4); deletion semantics per ADR-DB1-011.

## 1. Mutable root + immutable versions

| Concept | Source of truth | Mutation rule | Correction rule | Supersede/void | Referential direction | Retention | Handoff |
|---|---|---|---|---|---|---|---|
| Design Case → Design Versions (CON-053/054) | version rows (frozen once sent/approved); case header = pointers/state | header mutable; versions frozen at send | new version; never edit | unapproved may be SUPERSEDED/VOID (who may void → DB3); approved is terminal (INV-17) | versions → parent version; approval → exact version | commercial (never delete versions) | DB3 LC-08; DB4 partial-unique single-active-review; DB7 immutability tests |
| Quotation → Quotation Versions (CON-090/091) | version rows | header (current pointer, state) mutable; version frozen at send (INV-02) | revise = new version | REVISED supersedes; sent never overwritten | header → current version; order → accepted version | commercial | DB3 LC-12/13; DB7 |
| Agreement → Agreement Versions (CON-127/128) | published version rows | draft mutable; published frozen | new version | published/effective/superseded semantics | approval snapshot → version + content hash | commercial (retained while referenced) | DB3 approval guard; DB4 |
| Design Template (CON-057) | template + version counter | draft edits allowed; publishing bumps version | new version | clones keep their origin version; never retro-mutated | session → (templateId, version) clone origin | archive | DB4 |
| Content Page (CON-125) | current page | mutable; **no version history requirement in MVP** (none mandated by `08`) | edit in place; audit records change | archive state | — | archive | explicit non-goal note; revisit only if business asks |
| Business Policy Configuration (CON-144) | config versions | new version per change, audited | new version | prior versions retained | consumers read effective version | commercial (config history) | DB6 config plumbing |

## 2. Immutable snapshots

| Snapshot | Created at | Contents principle | Correction rule | Consumers | Retention |
|---|---|---|---|---|---|
| Approval Snapshot (CON-056) | approval transaction | per `06 §9`: version ref + document/preview hashes + product/variant/side/area + dimensions + thread colors + quantity + timestamp + contact snapshot + Terms Acceptance Reference | supersede with a **new approval**; historical approvals retained (J10); void = state on referencing flows, never edit | Order, Production (exact ref, INV-03), Payment gate | commercial |
| Accepted commercial snapshot / Order Items (CON-077) | order creation | per-SKU lines frozen from accepted quotation version + approval refs + display snapshot (product name/variant) | corrective order amendment = DB3 policy; never rewrite items | fulfillment, accounting reads | commercial |
| Quotation Version (CON-091) | send | full pricing breakdown, inputs, validity — no live price references (INV-12; price-list changes never mutate history) | new version | customer view, order creation | commercial |
| Shipping snapshot (CON-078 final form) | dispatch (delivery start) | recipient + address + fee + carrier + internal tracking frozen | post-dispatch fix = corrective note/transition event, not edit (DB3) | delivery/completion flow | commercial + PII anonymization after retention |
| Product/variant display snapshot (VO) | inside quotation version / order item | name/variant/base-price display copy | n/a (part of parent snapshot) | history readers | with parent |
| Terms acceptance (CON-129) | approval | AgreementVersionId + content hash | new approval if terms change | approval evidence | with approval snapshot |
| Production Specification (CON-111) | production job creation | frozen from approval snapshot + production parameters | new job/spec per DB3 rework policy | production execution | commercial |
| Contact snapshot (CON-018) | approval/order creation | frozen contact identity evidence | n/a | evidence readers | with parent (privacy interplay → DB3/business) |

## 3. Append-only records

| Record | Owner | Mutation rule | Correction rule | Retention |
|---|---|---|---|---|
| Inventory Ledger Entry (CON-031) | INV | insert only | compensating entry with reason | commercial |
| Audit Event (CON-150) | AUD | insert only | never; corrections are new events | audit class |
| Payment Callback Event (CON-102) | PAY | insert only (redacted payload) | never | commercial |
| Reconciliation / Refund Records (CON-104/105) | PAY | insert only | superseding record | commercial |
| Order Transition Event (CON-081) | ORD | insert only | compensating transition (guarded) | commercial |
| Review Decision (CON-055) | DSN | insert only | new decision | commercial |
| Moderation Note (CON-072) | ORD | insert only | new note | commercial |
| Production Note (CON-112) | PRD | insert only | new note | commercial |
| Notification Delivery Attempt (CON-131) | NTF | insert only | retry = new attempt | operational |
| Outbox Event (CON-140) | PLT | insert in business tx; **narrow dispatch-status columns mutable by relay** (documented column-scoped exception per ADR-DB1-010) | never edit payload | transient after processed |
| Verification Attempt (CON-014) | CUS | insert only | new challenge | transient |
| Job Attempt / Dead Letter (CON-143) | PLT | insert only | requeue = new attempt | operational |
| Asset Inspection Result (CON-041) | AST | insert only | re-inspection = new result | operational |

## 4. Mutable operational records

| Record | Mutability boundary | Notes |
|---|---|---|
| Custom Request header (CON-070) | state + current pointers (design case, quotation) | guarded transitions, audited |
| Order header (CON-076) | state machine only; commercial terms live in immutable items | |
| Payment Obligation satisfaction (CON-100) | state derived from verified applications; idempotent | DB8-tested |
| Inventory Balance projection (CON-034) | recomputable from ledger + holds | derived — ledger is truth |
| Active Secure Grant (CON-015) | revoke/expire | |
| Current Design Session (CON-050) | autosave working copy | transient |
| SKU availability display | projection + catalog manual override | precedence rule → DB3 (LC-05) |

## 5. Derived projections / read models

CON-170..176 (dashboard, low-stock, production queue, pending payments,
expiring quotations, sitemap, request detail composition): recomputable,
never sources of truth, read-only composition per ADR-DB1-009 rule 14.

## 6. Global correction rules (inherited from DB1, applied per class)

1. Never overwrite: corrections are superseding versions, void states,
   compensating entries, or correction records — per class above.
2. DB defense-in-depth (reject-mutation triggers) applies to §2 and §3
   classes; column-scoped exceptions (outbox dispatch status) are explicitly
   listed for DB4.
3. Template updates never mutate cloned sessions or historical versions
   (GAP-08 decision).
4. Product price/catalog changes never reach quotation/order history (INV-12)
   — enforced by snapshot-not-reference at the commercial boundaries in §2.
5. Anonymization (retention) is field-level scrubbing on mutable PII holders;
   its interaction with immutable snapshots (contact snapshot in approvals)
   is a DB3/business privacy rule — flagged in the handoff, not silently
   decided here.
