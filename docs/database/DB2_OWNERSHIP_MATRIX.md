# DB2 — Ownership Matrix

**Date:** 2026-07-15 · **Git HEAD:** `f90f78c`
**Rule set:** exactly one owner (context + aggregate/infrastructure owner) per
concept; shared read ≠ shared write; cross-module read never grants direct
persistence mutation (ADR-DB1-009). "Readable by" means via public
contracts/read composition, never another module's persistence.

Legend: contexts per [`DB2_BOUNDED_CONTEXT_MAP.md`](./DB2_BOUNDED_CONTEXT_MAP.md);
`(rec)` = module-owned record without aggregate root; `snap→` = consumes an
immutable snapshot of it. Retention owner = module responsible for the
retention-class binding and cleanup coordination (worker executes).

| Concept (CON) | Owner ctx | Owner aggregate | Readable by | Mutable by | Referenced by | Snapshot consumed by | Audit owner | Retention owner | Notes |
|---|---|---|---|---|---|---|---|---|---|
| CON-001..003 Admin Account/Cred/Session | IDN | AGG-01 | IDN | IDN | AUD (actor) | — | AUD | IDN | |
| CON-010 Customer | CUS | AGG-02 | ORD, QUO, PAY, DSN, NTF (contracts) | **CUS only** | ORD, QUO, PAY, DSN, AGG-04 | AGG-11, AGG-15 (contact snapshot) | AUD | CUS | Not duplicated by Request/Order ✔ |
| CON-011 Contact Point | CUS | AGG-02 | CUS, NTF (delivery address via contract) | CUS | AGG-03 | snapshots | AUD | CUS | |
| CON-012 Business Profile | CUS | AGG-02 | CUS | CUS | — | — | AUD | CUS | dormant |
| CON-013/014 Verification Challenge/Attempt | CUS | AGG-03 | CUS | CUS | — | — | AUD | CUS (transient) | |
| CON-015/016 Secure Grant/Scope | CUS | AGG-04 | request-scoped flows (validation service) | CUS | ORD (scope target) | — | AUD | CUS | token ≠ identity |
| CON-017/018 Masked Id / Contact Snapshot | CUS | — (VO) | consumers | n/a (VO) | — | — | — | — | |
| CON-020 Category | CAT | AGG-05 | public read | CAT | AGG-06 | — | AUD | CAT | |
| CON-021..026 Product/Variant/SKU/Side/Area/Media | CAT | AGG-06 | public read; DSN, INV, ORD, QUO (contracts) | **CAT only** | DSN, INV (SKUId), ORD, QUO | QUO/ORD (display snapshots) | AUD | CAT | Inventory does NOT own SKU definition ✔ |
| CON-027..029 SEO/Dimension/Mapping VOs | CAT (VO types shared) | — | consumers | owning aggregate | — | — | — | — | values owned per aggregate |
| CON-030..036 SKU Stock/Ledger/Hold/Reservation/Balance/Threshold/Reason | INV | AGG-07 | CAT (availability projection), ORD, admin reads | **INV only** | ORD (ReservationId) | — | AUD | INV | Catalog does NOT mutate stock ✔ |
| CON-040..044 Asset + children/VOs | AST | AGG-08 | consumers via signed-access service | **AST only** (worker via AST contracts) | CAT, DSN, ORD(COP uploads), PRD, GAL | — | AUD (security-relevant) | AST (coordinated two-phase) | No duplicate asset ownership by Catalog/Design/Production ✔ — they own only their semantic association rows |
| CON-050..052 Design Session/Autosave/Document | DSN | AGG-09 | session holder (guest/customer) | DSN | AGG-13 (submission handover) | — | — (privacy-tracked cleanup) | DSN (transient) | |
| CON-053..055 Design Case/Version/Review | DSN | AGG-10 | ORD, admin, customer (secure) | **DSN only** | AGG-11, AGG-13 (pointer) | — | AUD | DSN | |
| CON-056 Approval Snapshot | DSN | AGG-11 | ORD, PAY, PRD (read contracts) | **nobody after creation** | AGG-15, AGG-16 (gate), AGG-17 | ORD, PRD | AUD | DSN | immutable |
| CON-057 Design Template | DSN | AGG-12 | public listing; sessions clone | DSN | AGG-09 (clone origin) | sessions receive independent copy | AUD | DSN | GAP-08 |
| CON-058..060/167 design VOs | DSN / design-document pkg | — | consumers | n/a | — | — | — | — | |
| CON-070..074 Custom Request + children/VOs | ORD | AGG-13 | admin; customer via grant; QUO, DSN (RequestId) | **ORD only** | AGG-04, AGG-10, AGG-14, AGG-15 | — | AUD | ORD | |
| CON-076..082 Order + Items/Shipping/Transitions | ORD | AGG-15 | admin; customer via grant; PAY, PRD, INV (OrderId) | **ORD only** | AGG-16, AGG-17, CON-033 | — | AUD | ORD | Shipping = Order-owned (ADR-DB2-002) ✔ |
| CON-090..096 Quotation + versions/VOs | QUO | AGG-14 | admin; customer via grant; ORD, PAY | **QUO only** | AGG-15 (accepted version), AGG-16 (amounts) | ORD (commercial terms) | AUD | QUO | Order does NOT own quotation pricing ✔ |
| CON-100/101/106 Obligation/Attempt/Allocation | PAY | AGG-16 | ORD (satisfaction facts), admin | **PAY only** | AGG-15 | — | AUD | PAY | Order does NOT own payment truth ✔ |
| CON-102 Callback Event | PAY | (rec) | PAY, admin | append-only via PAY | AGG-16 | — | AUD | PAY | |
| CON-104 Reconciliation Record | PAY | (rec) | PAY, admin | append via PAY | attempts/obligations | — | AUD | PAY | |
| CON-105 Refund Record | PAY | (rec) | PAY, admin, ORD (facts) | append via PAY | attempts | — | AUD | PAY | policy DB3 |
| CON-110..113 Production Job/Spec/Note/Artifact | PRD | AGG-17 | ORD (completion facts), admin | **PRD only** | AGG-15 | spec from AGG-11 | AUD | PRD | |
| CON-120/121 Gallery Entry/Media | GAL | AGG-18 | public read | GAL | AST (AssetId) | — | AUD | GAL | |
| CON-125/126 Content Page / Redirect | CNT | AGG-19/20 | public read | CNT | — | — | AUD | CNT | |
| CON-127/128 Agreement / Version | CNT | AGG-21 | public read; DSN (reference at approval) | **CNT only**; versions immutable once published | AGG-11 | AGG-11 (ref + hash) | AUD | CNT | GAP-09 |
| CON-129 Terms Acceptance Reference | CNT (VO type) / value held by DSN snapshot | — | consumers | n/a | — | — | — | — | |
| CON-130..133 Notification Intent/Attempt/VOs | NTF | AGG-22 | admin/ops | **NTF only** | outbox event (origin) | — | AUD (evidence link) | NTF (operational) | Notification ≠ Outbox ✔ |
| CON-150 Audit Event | AUD | (rec) | admin | append via AUD service only | all contexts emit | — | AUD | AUD (audit class) | never substitutes domain history ✔ |
| CON-140 Outbox Event | PLT | (rec) | relay/worker | append in owning tx; dispatch status by relay | all contexts enqueue | — | — (operational) | PLT | not a business aggregate ✔ |
| CON-141/142 Idempotency Record/Fingerprint | PLT | (rec) | operation owners via service | claim/complete via PLT service | PAY, ORD, NTF, worker | — | — | PLT (transient) | |
| CON-143 Job Attempt / Dead Letter | PLT | (rec) | ops/admin | worker via PLT | — | — | — | PLT (operational) | |
| CON-144 Business Policy Configuration | PLT | AGG-23 | all contexts (read) | **PLT only** (admin-audited) | retention/TTL consumers | — | AUD | PLT | values deferred to DB3/business |
| CON-160..166 shared VOs | `packages/domain-types` (type ownership) | — | all | n/a | — | — | — | — | shared type ≠ shared persistence |
| CON-170..176 read models | composing module (read-only) | — (derived) | admin/public per model | none (recomputed) | — | — | — | — | ADR-DB1-009 rule 14 |
| CON-180 Analytics emission | PLT (emission boundary) | — | external tool (future) | none (not persisted) | — | — | — | — | GAP-11 decision |

## Validation results

- **Two-owner check:** no concept appears with two owner contexts. The three
  historically ambiguous DB0 rows are resolved: Product Media → CAT (asset
  binary → AST); Approval Snapshot → DSN (Order consumes snapshot); SKU
  definition → CAT vs stock state → INV.
- **No-owner check:** every CON-ID from
  [`DB2_CONCEPT_INVENTORY.md`](./DB2_CONCEPT_INVENTORY.md) appears above
  (merged/rejected concepts covered by their canonical replacement).
- **Asset ownership not duplicated** by Catalog/Design/Production ✔ (they own
  association entities referencing AssetId only).
- **Customer ownership not duplicated** by Request/Order ✔ (CustomerId refs +
  frozen contact snapshots only).
- **Payment ownership not duplicated** by Order ✔ (Order consumes
  verified-payment facts/events).
- **Inventory ownership not duplicated** by Catalog ✔ (availability is a
  projection read).
- **Audit** owns evidence only; domain history (versions, ledger, transitions,
  callbacks) stays with domain owners ✔.
- **Outbox/Notification distinct:** outbox = transactional dispatch record
  (PLT); notification intent/attempt = NTF domain records ✔.
