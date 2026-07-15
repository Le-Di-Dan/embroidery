# DB2 — Entity & Value Object Catalog

**Date:** 2026-07-15 · **Git HEAD:** `f90f78c`
**Nature:** Conceptual classification. No SQL types are chosen here (DB4).

## 1. Classification rules

- **Entity:** stable identity (typed ID per ADR-DB1-007), own lifecycle,
  mutation/history within its aggregate.
- **Value object:** no independent identity; compared by value; belongs to an
  aggregate/record; carries validation/invariants; replaced, never mutated in
  place.
- Immutable snapshots and append-only records are entity-shaped but with
  restricted mutation (see [`DB2_SNAPSHOT_AND_HISTORY_MODEL.md`](./DB2_SNAPSHOT_AND_HISTORY_MODEL.md)).

## 2. Entities (by aggregate)

| Entity | Aggregate | ID category (ADR-DB1-007) | Lifecycle/mutation notes |
|---|---|---|---|
| Admin Account, Credential Ref, Admin Session | AGG-01 | business UUIDv7 | sessions revocable; credential rotation |
| Customer | AGG-02 | business UUIDv7 | PII anonymizable; merge audited |
| Contact Point | AGG-02 | business UUIDv7 | verified flag; one primary per customer |
| Business Profile | AGG-02 | business UUIDv7 | dormant (B2B readiness) |
| Verification Challenge | AGG-03 | business UUIDv7 | short-lived; transient retention |
| Secure Access Grant | AGG-04 | business UUIDv7 (token separate secret) | revoke/expire |
| Category | AGG-05 | business UUIDv7 | archive state |
| Product / Variant / SKU / Product Side / Embroidery Area / Product Media | AGG-06 | business UUIDv7 | SKU = definition only; media = AssetId association |
| SKU Stock / Soft Hold / Official Reservation | AGG-07 | stock+holds: business UUIDv7 | reservation carries explicit expiry semantics |
| Inventory Ledger Entry | AGG-07 | **bigint identity** (append-only) | never updated |
| Asset / Asset Derivative | AGG-08 | business UUIDv7 | deletion = two-phase tombstone |
| Asset Inspection Result | AGG-08 | bigint identity | append-only |
| Design Session | AGG-09 | business UUIDv7 (+ session secret separate) | temporary |
| Design Case / Design Version | AGG-10 | business UUIDv7 | version immutable once sent |
| Review Decision | AGG-10 | bigint identity | append-only |
| Approval Snapshot | AGG-11 | business UUIDv7 (referenced cross-context) | immutable |
| Design Template | AGG-12 | business UUIDv7 | versioned; clone-on-use |
| Custom Request / Customer-Owned Product | AGG-13 | business UUIDv7 + Request Code | COP never a SKU |
| Moderation Note | AGG-13 | bigint identity | append-only |
| Quotation / Quotation Version | AGG-14 | business UUIDv7 | version immutable once sent |
| Acceptance Evidence | AGG-14 | bigint identity | append-only |
| Order / Order Item / Shipping Detail | AGG-15 | business UUIDv7 + Order Code | item immutable; shipping → immutable at dispatch |
| Order Transition Event | AGG-15 | bigint identity | append-only |
| Payment Obligation / Payment Attempt | AGG-16 | business UUIDv7 | attempt state guarded |
| Payment Callback Event / Reconciliation Record / Refund Record | PAY module records | bigint identity | append-only |
| Production Job / Production Artifact | AGG-17 | business UUIDv7 | artifact = AssetId association |
| Production Specification | AGG-17 | business UUIDv7 | immutable snapshot |
| Production Note | AGG-17 | bigint identity | append-only |
| Gallery Entry / Gallery Media Association | AGG-18 | business UUIDv7 | publication state |
| Content Page / Redirect Rule / Agreement / Agreement Version | AGG-19/20/21 | business UUIDv7 | agreement version immutable once published |
| Notification Intent | AGG-22 | business UUIDv7 | status mutable |
| Delivery Attempt | AGG-22 | bigint identity | append-only |
| Audit Event | AUD record | bigint identity | append-only |
| Outbox Event | PLT record | bigint identity | append + dispatch status |
| Idempotency Record | PLT record | composite scope key concept (shape → DB4) | state machine per ADR-DB1-017 |
| Job Attempt / Dead Letter | PLT record | bigint identity | append-only |
| Business Policy Configuration (+ versions) | AGG-23 | business UUIDv7 | versioned + audited |

## 3. Value objects

| VO | Used by | Validation/invariant (conceptual) | Notes |
|---|---|---|---|
| Money (CON-160) | Catalog, Quotation, Order, Payment, Shipping fee | exact decimal semantics, non-negative where required (INV-11) | currency handling + precision → DB4 |
| Currency | Money | single-currency MVP (VND), no multi-currency (`02 §2`) | explicit anyway — no implicit assumptions |
| Quantity (CON-161) | Request, Quotation, Order, Inventory | positive integer | |
| Percentage/Rate (CON-162) | deposit/remaining derivation | 0–100; 40/60 values come from configuration (D-013/014) | |
| Email Address (CON-163) | Contact Point | syntactic validation + lowercase normalization | ADR-DB2-001 |
| Phone Number (CON-164) | Contact Point | normalized canonical form (E.164-style direction) | ADR-DB2-001 |
| Physical Dimension (CON-028) | Product Side, Design placement, COP | mm/cm units; positive | distinct from canvas px (`05 §6`) |
| Coordinate Mapping (CON-029) | Product Side | canvas↔image↔physical consistency | |
| Embroidery Placement (CON-060) | Design Version, Approval Snapshot | side+area belong to referenced product | |
| Thread Color (CON-059) | Design Version, Approval Snapshot | from configured palette guidance | |
| Address (CON-080) | Shipping Detail | required fields per shipping entry; PII | anonymizable |
| Recipient (CON-079) | Shipping Detail | may differ from customer | PII |
| Contact Snapshot (CON-018) | Approval Snapshot, Order | frozen copy, never live reference | |
| Product/Variant Display Snapshot | Quotation Version, Order Item | frozen name/variant/base-price at commercial boundary (INV-12) | snapshot policy in history model |
| Integrity Hash (CON-058) | Design Version, Approval Snapshot, Production Spec | `sha256:<hex>` format (ADR-DB1-012) | |
| Object Storage Reference (CON-043) | Asset | internal stable ref; never public URL (INV-10) | |
| Human-Readable Code (CON-165) | Request/Order/Quotation | unique display code; not authorization (ADR-DB1-007) | format → DB3/DB4 |
| Terms Acceptance Reference (CON-129) | Approval Snapshot | AgreementVersionId + content hash | GAP-09 decision |
| Time Range (CON-166) | Quotation validity, holds | start < end; UTC instants | |
| Idempotency Fingerprint (CON-142) | Idempotency Record | canonical-JSON hash of business payload | ADR-DB1-017/012 |
| Grant Scope (CON-016) | Secure Access Grant | request binding + allowed actions | |
| SEO Metadata (CON-027) | Product, Category, Gallery Entry, Content Page | title/description/canonical/social/index flags | one shared VO type; each aggregate owns its values |
| Quantity Breakdown (CON-074) | Custom Request | per-variant/size quantities; sums to total | B2B multi-size readiness |
| Template Reference (CON-132) | Notification Intent | template id + version | |
| Redacted Parameter Snapshot (CON-133) | Notification Intent | secrets structurally excluded | |
| Document Schema Version (CON-167) | Design Document holders | integer version, backward-read | ADR-DB1-012 |
| Masked Customer Identifier (CON-017) | watermark rendering | derived, non-reversible display | |
| Adjustment Reason (CON-036) | Inventory Ledger | non-empty reason + actor | |
| Provider Reference (CON-103) | Payment records | provider-scoped opaque ref | redaction rules apply |
| Payment Allocation (CON-106) | Payment Attempt | attempt targets exactly one obligation | multi-allocation not in MVP |

## 4. Explicit non-VOs / non-entities

- **Status values** — typed constants + text CHECK (ADR-DB1-008), not VOs with
  behavior; final names DB3.
- **Read models** (CON-170..176) — query compositions, no identity ownership.
- **Analytics events** (CON-180) — emissions, not persisted concepts (GAP-11
  decision).
