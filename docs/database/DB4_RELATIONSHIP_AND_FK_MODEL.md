# DB4 — Relationship & FK Model

**Date:** 2026-07-15 · **Git HEAD:** `a79f523`
**Nature:** Logical FK/reference semantics — no DDL. Diagrams:
[`DB4_LOGICAL_RELATIONAL_DIAGRAMS.md`](./DB4_LOGICAL_RELATIONAL_DIAGRAMS.md).

## 1. Legend & global rules

- **Card:** child→parent cardinality. **Req:** FK column NOT NULL?
- **Own:** `comp` composition · `ref` identity reference · `snap` snapshot
  reference (immutable historical linkage) · `assoc` association.
- **Del (on-delete direction):** `restrict` (default — **no physical
  cascade anywhere**; parents use archive/anonymize/tombstone semantics per
  ADR-DB1-011) · `cascade-temp` (allowed only for owned temporary children
  of hard-deleted temp parents) · `set-null-cand` (nullable operational
  pointer may be cleared).
- **Hist:** relationship must survive historically (rows retained).
- Cross-context (XCtx) references are **ID references or snapshots only**
  (DB2 global rule 1); no module reads another's persistence (ADR-DB1-009).
- Header "current" pointers (design case/quotation/agreement/config current
  version; order current approval) are mutable `ref` columns whose
  consistency is TX-owned (pointer must reference a child of the same
  root — trigger candidate at DB6, App primary).

## 2. Identity & Customer

| REL | Source → Target | Card | Req | Own | XCtx | Del | Hist | Notes |
|---|---|---|---|---|---|---|---|---|
| REL-001 | admin_credentials → admin_accounts | N–1 | yes | comp | no | restrict | yes | |
| REL-002 | admin_sessions → admin_accounts | N–1 | yes | comp | no | restrict | no | oper cleanup hard-deletes sessions |
| REL-003 | admin_accounts → admin_accounts (replaced_by) | 0..1 | no | ref | no | restrict | yes | successor chain (LC-01) |
| REL-004 | business_profiles → customers | 1–1 | yes | comp | no | restrict | no | dormant |
| REL-005 | customer_contact_points → customers | N–1 | yes | comp | no | restrict | yes | anonymize fields, keep rows |
| REL-006 | contact_verification_challenges → customer_contact_points | N–0..1 | no | ref | no | restrict | no | nullable pre-customer targets; TTL hard delete of challenge |
| REL-007 | contact_verification_challenges → design_sessions | N–0..1 | no | ref | yes (→DSN) | set-null-cand | no | submission binding |
| REL-008 | contact_verification_attempts → contact_verification_challenges | N–1 | yes | comp | no | cascade-temp | no | transient family deleted together |
| REL-009 | secure_access_grants → customers | N–1 | yes | ref | no | restrict | yes | grant ≠ identity (ADR-DB2-001) |
| REL-010 | secure_access_grants → custom_requests | N–1 | yes | ref | yes (→ORD) | restrict | yes | scope binding INV-08; GRD-002 |
| REL-011 | secure_access_grants → secure_access_grants (superseded_by) | 0..1 | no | ref | no | restrict | yes | reissue chain (TR-LC03-01) |
| REL-012 | customer_merge_cases → customers (survivor, loser) | N–1 ×2 | yes | ref | no | restrict | yes | CC-27 ordered locks |
| REL-013 | customer_merge_events → customer_merge_cases | N–1 | yes | comp | no | restrict | yes | append-only evidence |
| REL-014 | customers → customers (merged_into) | 0..1 | no | ref | no | restrict | yes | tombstone pointer; snapshots never rewritten |

## 3. Catalog, Inventory & Asset

| REL | Source → Target | Card | Req | Own | XCtx | Del | Hist | Notes |
|---|---|---|---|---|---|---|---|---|
| REL-020 | products → categories | N–1 | yes | ref | no | restrict | no | archive category only delists |
| REL-021 | product_variants → products | N–1 | yes | comp | no | restrict | yes | history via snapshots |
| REL-022 | skus → product_variants | N–1 | yes | comp | no | restrict | yes | definition only |
| REL-023 | product_sides → products · embroidery_areas → product_sides | N–1 ×2 | yes | comp | no | restrict | yes | designer geometry |
| REL-024 | product_sides → assets (background) | N–1 | yes | ref | yes (→AST) | restrict | yes | tombstone coordination |
| REL-025 | product_media → products / assets | N–1 ×2 | yes | assoc | AST side | restrict | yes | ADR-DB4-003 |
| REL-026 | sku_stocks → skus | 1–1 | yes | ref | yes (→CAT) | restrict | yes | inventory truth split |
| REL-027 | inventory_ledger_entries → sku_stocks | N–1 | yes | comp | no | restrict | yes | append-only |
| REL-028 | inventory_ledger_entries → soft_holds / reservations / orders | N–0..1 ×3 | no | ref | ORD side | restrict | yes | movement correlation |
| REL-029 | inventory_soft_holds → sku_stocks / custom_requests | N–1 ×2 | yes | comp / ref | ORD side | restrict | yes (terminal rows) | GRD-014 |
| REL-030 | inventory_soft_holds → inventory_reservations (converted) | 0..1 | no | ref | no | restrict | yes | TR-LC17-02 |
| REL-031 | inventory_reservations → sku_stocks / orders | N–1 ×2 | yes | comp / ref | ORD side | restrict | yes | INV-05; GRD-013 (gate = TX) |
| REL-032 | asset_inspections / asset_derivatives → assets | N–1 ×2 | yes | comp | no | restrict (tombstone two-phase) | yes | LC-06 |
| REL-033 | assets → customers (uploaded_by) / design_sessions (uploaded_via) | N–0..1 ×2 | no | ref | yes | set-null-cand | no | provenance only |

## 4. Design

| REL | Source → Target | Card | Req | Own | XCtx | Del | Hist | Notes |
|---|---|---|---|---|---|---|---|---|
| REL-040 | design_sessions → products/variants/sides/areas | N–1 (variant 0..1) | mixed | ref | yes (→CAT) | restrict | no | session hard-deleted after TTL |
| REL-041 | design_sessions → design_templates (+version) | N–0..1 | no | ref | no | restrict | no | clone origin provenance; no live link (GRD-028 at clone) |
| REL-042 | design_session_assets → design_sessions / assets | N–1 ×2 | yes | assoc | AST side | cascade-temp (session) / restrict (asset) | no | temp family |
| REL-043 | design_cases → custom_requests | 1–1 | yes | ref | yes (DSN↔ORD) | restrict | yes | CST-020 |
| REL-044 | design_cases → design_versions (current pointer) | 0..1 | no | ref | no | restrict | no | header pointer; TX consistency |
| REL-045 | design_versions → design_cases | N–1 | yes | comp | no | restrict | yes | versions never deleted |
| REL-046 | design_versions → design_versions (parent) | N–0..1 | no | ref | no | restrict | yes | chain (REQ-DVER-005) |
| REL-047 | design_versions → asset_derivatives (preview) | N–0..1 | no | ref | yes (→AST) | restrict | yes | preview_hash frozen at send |
| REL-048 | design_version_assets → design_versions / assets | N–1 ×2 | yes | assoc | AST side | restrict | yes | frozen with version |
| REL-049 | design_reviews → design_versions | N–1 | yes | comp | no | restrict | yes | append-only (LC-09) |
| REL-050 | design_reviews → customers / grants / challenges | N–1/0..1 | mixed | ref | yes (→CUS) | restrict | yes | actor evidence |
| REL-051 | approval_snapshots → design_versions | 1–1 | yes | snap | no | restrict | yes | INV-01/03; created in approval tx (TR-LC08-04) |
| REL-052 | approval_snapshots → design_cases / custom_requests / customers | N–1 ×3 | yes | snap | yes | restrict | yes | anchors + contact snapshot copies |
| REL-053 | approval_snapshots → grants / challenges (step-up) | N–1 ×2 | yes | snap | yes (→CUS) | restrict | yes | INV-20 evidence |
| REL-054 | approval_snapshot_thread_colors → approval_snapshots | N–1 | yes | comp (snap) | no | restrict | yes | immutable child |
| REL-055 | approval_snapshot_agreement_acceptances → approval_snapshots / agreement_versions | N–1 ×2 | yes | snap | yes (→CNT) | restrict | yes | GRD-008 ref + hash (CON-129) |
| REL-056 | design_template_versions → design_templates | N–1 | yes | comp | no | restrict | yes | CST-025 |
| REL-057 | design_templates → asset_derivatives (preview) · design_template_assets → templates/assets | mixed | mixed | ref / assoc | AST side | restrict | no | private originals (REQ-TMPL-002) |
| REL-058 | design_templates → products/sides/areas (scope) | N–0..1 ×3 | no | ref | yes (→CAT) | set-null-cand | no | optional scoping (GAP-08) |

## 5. Ordering, Quotation & Payment

| REL | Source → Target | Card | Req | Own | XCtx | Del | Hist | Notes |
|---|---|---|---|---|---|---|---|---|
| REL-060 | custom_requests → customers | N–1 | yes | ref | yes (→CUS) | restrict | yes | PII via customer anonymization |
| REL-061 | custom_requests → products/variants (subject) | N–0..1 ×2 | no | ref | yes (→CAT) | restrict | yes | XOR with COP (CST-121) |
| REL-062 | custom_requests → design_cases / quotations (current pointers) | 0..1 ×2 | no | ref | yes | restrict | no | TX-consistent pointers |
| REL-063 | customer_owned_products / quantity_breakdowns / request_assets / moderation_notes / request_transitions → custom_requests | N–1 ×5 | yes | comp | no | restrict | yes | COP has **no** SKU/stock FK (INV-13 absent-FK rule) |
| REL-064 | custom_request_quantity_breakdowns → product_variants | N–0..1 | no | ref | yes (→CAT) | restrict | yes | NULL for COP lines |
| REL-065 | quotations → custom_requests | 1–1 | yes | ref | yes (→ORD) | restrict | yes | CST-035 |
| REL-066 | quotation_versions → quotations · line_items → versions | N–1 ×2 | yes | comp | no | restrict | yes | frozen at send (INV-02) |
| REL-067 | quotation_versions → quotation_versions (parent) | N–0..1 | no | ref | no | restrict | yes | supersede chain |
| REL-068 | quotations → quotation_versions (current pointer) | 0..1 | no | ref | no | restrict | no | TX consistency |
| REL-069 | quotation_line_items → skus | N–0..1 | no | ref | yes (→CAT) | restrict | yes | display ref; values snapshotted (INV-12) |
| REL-070 | quotation_acceptances → quotation_versions / customers / grants / challenges | N–1 ×4 | yes | comp / ref | CUS side | restrict | yes | GRD-006 evidence |
| REL-071 | orders → custom_requests | 1–1 | yes | ref | no | restrict | yes | CST-030 (INV-19) |
| REL-072 | orders → customers | N–1 | yes | ref | yes (→CUS) | restrict | yes | |
| REL-073 | orders → quotation_versions (accepted) | N–1 | yes | snap | yes (→QUO) | restrict | yes | commercial basis; items copy values |
| REL-074 | orders → approval_snapshots (current pointer) | N–1 | yes | ref | yes (→DSN) | restrict | yes | audited pointer move (ADR-DB3-003 r4); history via order_transitions POINTER_MOVE |
| REL-075 | order_items → orders | N–1 | yes | comp (snap) | no | restrict | yes | immutable |
| REL-076 | order_items → skus / customer_owned_products | N–0..1 ×2 | no (CK one) | ref | CAT side | restrict | yes | CST-067 |
| REL-077 | order_items → approval_snapshots | N–1 | yes | snap | yes (→DSN) | restrict | yes | production integrity chain (D7-07) |
| REL-078 | order_transitions / cancellation_requests / shipping_details / shipping_snapshots / fee_acknowledgements → orders | N–1 ×5 | yes | comp | no | restrict | yes | CON-081 family |
| REL-079 | shipping_snapshots → shipping_details | 1–1 | yes | snap | no | restrict | yes | dispatch freeze (GRD-017) |
| REL-080 | order_cancellation_requests → grants / challenges | N–0..1 ×2 | no | ref | yes (→CUS) | restrict | yes | ≥S5 step-up evidence |
| REL-081 | payment_obligations → orders | N–1 (2 live typical) | yes | ref | yes (PAY→ORD) | restrict | yes | INV-04 |
| REL-082 | payment_obligations → quotation_versions (source) | N–1 | yes | snap | yes (→QUO) | restrict | yes | amount derivation evidence |
| REL-083 | payment_obligations → payment_obligations (superseded_by) · → payment_attempts (satisfied_by) | 0..1 ×2 | no | ref | no | restrict | yes | recalculation chain (ADR-DB3-003 r7); exactly-once application (CC-10) |
| REL-084 | payment_attempts → payment_obligations | N–1 | yes | comp | no | restrict | yes | allocation = this FK (CON-106) |
| REL-085 | payment_attempts → grants / challenges | N–0..1 ×2 | no | ref | yes (→CUS) | restrict | yes | initiation evidence |
| REL-086 | payment_provider_events → payment_attempts | N–0..1 | no | ref | no | restrict | yes | unmatched events await reconciliation |
| REL-087 | payment_reconciliations → attempts / obligations | N–0..1 ×2 | no (CK ≥1) | ref | no | restrict | yes | CC-09 |
| REL-088 | refunds → payment_attempts / orders / cancellation_requests | N–1/1/0..1 | mixed | ref | ORD side | restrict | yes | LC-20; never overwrites attempt |

## 6. Production, Content & Platform

| REL | Source → Target | Card | Req | Own | XCtx | Del | Hist | Notes |
|---|---|---|---|---|---|---|---|---|
| REL-090 | production_jobs → orders | N–1 (1 active; rework = new job) | yes | ref | yes (→ORD) | restrict | yes | CC-12 order-row contention |
| REL-091 | production_jobs → approval_snapshots | N–1 | yes | snap | yes (→DSN) | restrict | yes | exact approval (INV-03); CST-041 |
| REL-092 | production_jobs → production_jobs (reworked_from) | N–0..1 | no | ref | no | restrict | yes | ADR-DB3-003 r3 lineage |
| REL-093 | production_specifications → production_jobs / approval_snapshots | 1–1 / N–1 | yes | comp (snap) | DSN side | restrict | yes | frozen at creation |
| REL-094 | production_artifacts → jobs / assets · production_notes / job_transitions → jobs | N–1 | yes | assoc / comp | AST side | restrict | yes | internal-only artifacts (INV-21/22) |
| REL-095 | gallery_entry_assets → gallery_entries / assets | N–1 ×2 | yes | assoc | AST side | restrict | yes | public derivatives only |
| REL-096 | gallery_entries → products (linked) | N–0..1 | no | ref | yes (→CAT) | set-null-cand | no | SEO link |
| REL-097 | agreement_versions → agreements | N–1 | yes | comp | no | restrict | yes | immutable once published |
| REL-098 | agreements → agreement_versions (current pointer) | 0..1 | no | ref | no | restrict | no | TX consistency |
| REL-099 | notification_intents → customer_contact_points | N–0..1 | no | ref | yes (→CUS) | restrict | no | recipient ref + masked copy |
| REL-100 | notification_delivery_attempts → notification_intents | N–1 | yes | comp | no | restrict (oper cleanup deletes family) | no | append-only |
| REL-101 | notification_intents → outbox_events (source) | N–0..1 | no | ref | yes (→PLT) | set-null-cand | no | outbox rows cleaned; nullable by design (NTF ≠ outbox) |
| REL-102 | policy_configuration_versions → policy_configurations (+ current pointer back; created_by → admin_accounts) | N–1 / 0..1 / N–1 | yes/no/yes | comp / ref / ref | IDN side | restrict | yes | versioned config (CON-144) |
| REL-103 | audit_events → (target_kind, target_id) | N–1 logical | yes | ref (polymorphic, justified) | all | n/a (no FK) | yes | audit-target exception (task §8.3); no physical FK by design |
| REL-104 | outbox_events → (aggregate_kind, aggregate_id) | N–1 logical | yes | ref (polymorphic, justified) | all | n/a (no FK) | no | outbox aggregate-ref exception |
| REL-105 | transition tables (TBL-042/045/063) + audit actor refs → admin_accounts / customers / grants | N–0..1 | no | ref | yes | restrict | yes | actor evidence columns |
| REL-106 | assets → contact_verification_challenges (uploaded_via_challenge) | N–0..1 | no | ref | yes | set-null (parent is hard-TTL `temp`) | yes | **APP5-DB01**; challenge-scoped intake provenance for `APP5-G01 D13`. `restrict` would block the challenge TTL sweep; `cascade` would delete an asset row whose binary still exists (INV-10). `intake_expires_at` deliberately survives the clear |
| REL-107 | design_versions → customer_owned_products (customer_owned_product) | N–0..1 | no | ref | yes | restrict | yes | **APP6-DB01**; the COP branch of CST-129. `restrict` matches every other edge on this table and `order_items`' own COP edge — a formal version is evidence, and evidence never loses its subject |
| REL-108 | approval_snapshots → customer_owned_products (customer_owned_product) | N–0..1 | no | ref | yes | restrict | yes | **APP6-DB01**; the COP branch of CST-131, and the edge APP7 converts into an `order_items` COP line without inventing Catalog identity |

## 7. Cross-context reference rules (verification against DB2)

- Customer owned by CUS; ORD/QUO/PAY/DSN reference `customer_id` only
  (REL-052/060/070/072) — no customer data duplication outside frozen
  contact snapshots. ✔
- Catalog owns SKU definition (REL-022); Inventory owns stock
  (REL-026..031); COP has no SKU/stock FK (REL-063). ✔
- Asset owns assets; consumers own associations/direct refs
  (ADR-DB4-003). ✔
- Payment owns obligations/attempts/events/reconciliations/refunds; Order
  references payment **facts** via events + `satisfied_by` evidence — no
  Order-side mutation path into PAY tables. ✔
- Design owns versions/approvals; Production references the exact immutable
  snapshot (REL-091/093). ✔
- Content owns agreement versions; approval snapshot stores exact
  version + hash (REL-055). ✔
- Notification owns intents/attempts; Outbox never owns notification
  lifecycle (REL-101 nullable one-way ref). ✔
- No physical cascade crosses into commercial/audit history (only
  cascade-temp on transient design-session/challenge families). ✔
