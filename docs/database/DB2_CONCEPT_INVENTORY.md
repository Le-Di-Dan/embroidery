# DB2 — Canonical Concept Inventory

**Checkpoint:** DB2 — Conceptual Domain Model & Aggregate Ownership
**Date:** 2026-07-15 · **Git HEAD:** `f90f78c` · **Branch:** `production`
**Nature:** Conceptual only. No table, column, SQL type, key, index, or Drizzle schema is defined here.

Normalizes every candidate concept from
[`DB0_REQUIREMENT_MATRIX.md`](./DB0_REQUIREMENT_MATRIX.md) into one canonical
concept list. Ownership detail: [`DB2_OWNERSHIP_MATRIX.md`](./DB2_OWNERSHIP_MATRIX.md);
DB0 trace/status: [`DB2_COMPLETENESS_MATRIX.md`](./DB2_COMPLETENESS_MATRIX.md).

## 1. Legend

- **Type:** `root` aggregate root · `entity` child entity · `vo` value object ·
  `snapshot` immutable snapshot · `append` append-only record · `temp`
  temporary · `derived` derived/read model · `infra` cross-cutting
  infrastructure concept.
- **Ctx:** context ID per [`DB2_BOUNDED_CONTEXT_MAP.md`](./DB2_BOUNDED_CONTEXT_MAP.md).
- **Agg:** owning aggregate per [`DB2_AGGREGATE_CATALOG.md`](./DB2_AGGREGATE_CATALOG.md) (`—` = module/infrastructure-owned record or shared VO type).
- **Class:** data classification (pub/int/cpriv/sec/fin/prod/mixed).
- **Mut:** mutable / immutable / append / temp / derived.
- **Ret:** retention class direction per ADR-DB1-011 (`trans`/`oper`/`comm`/`audit`/n-a).
- **Vis:** public / customer(-scoped) / internal.

## 2. Identity (CTX-IDN)

| ID | Concept | Aliases (DB0) | Type | Ctx | Agg | LC | REQ / INV | Class | Mut | Ret | Vis | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CON-001 | Admin Account | Admin Account | root | IDN | AGG-01 | LC-01 | REQ-IDN-001 | sec | mutable | comm | internal | Exactly one active; replaceable, not hard-coded. |
| CON-002 | Admin Credential Reference | Admin Credential | entity | IDN | AGG-01 | LC-01 | REQ-IDN-002 | sec | mutable | comm | internal | Auth/OTP provider abstract (O-005/DEC-29). |
| CON-003 | Admin Session | Admin Session | entity | IDN | AGG-01 | LC-01 | REQ-IDN-003 | sec | mutable | oper | internal | Revocable; login alerts via notification. |
| CON-004 | Login/Security Event | Login Event | append | IDN→AUD | — | LC-01 | REQ-IDN-003/004, INV-14 | int | append | audit | internal | **Merged into CON-150 Audit Event** (audit is the record; no separate login table concept). |

## 3. Customer (CTX-CUS)

| ID | Concept | Aliases | Type | Ctx | Agg | LC | REQ / INV | Class | Mut | Ret | Vis | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CON-010 | Customer | Customer | root | CUS | AGG-02 | LC-02* | REQ-CUST-001..003 | cpriv | mutable | comm+anonymize | customer | Created at verification per ADR-DB2-001; PII anonymizable, row retained while commercial history exists. |
| CON-011 | Contact Point | Contact | entity | CUS | AGG-02 | LC-02 | REQ-CUST-001/002, REQ-VERIF-001 | cpriv | mutable | comm+anonymize | customer | Email/phone; normalized; verified flag; one primary. |
| CON-012 | Business Profile | Business Profile (future) | entity | CUS | AGG-02 | — | REQ-CUST-003 | cpriv | mutable | comm | customer | Future-ready boundary only; no workflow now. |
| CON-013 | Verification Challenge | Contact Verification, OTP Challenge | root | CUS | AGG-03 | LC-02 | REQ-VERIF-001, INV-19 | sec | temp | trans | customer | Short-lived; idempotent issuance; secret never persisted in notifications. |
| CON-014 | Verification Attempt/Result | (part of challenge) | append | CUS | AGG-03 | LC-02 | REQ-VERIF-001 | sec | append | trans | internal | Attempt limits/cooldown params → DB3. |
| CON-015 | Secure Access Grant | Secure Access Grant, Token | root | CUS | AGG-04 | LC-03 | REQ-GRANT-001..004, INV-08 | sec | mutable | oper | customer | Grants access to one request scope; NOT customer identity (ADR-DB2-001). |
| CON-016 | Grant Scope | Grant Scope | vo | CUS | AGG-04 | LC-03 | REQ-GRANT-003 | sec | immutable | n-a | internal | Actions + request binding. |
| CON-017 | Masked Customer Identifier | Masked Identifier | vo | CUS | — | — | REQ-VERIF-002 | cpriv | derived | n-a | public(masked) | Used by watermark rendering. |
| CON-018 | Contact Snapshot | (implied by snapshots) | vo | CUS | — | — | REQ-APPR-001 | cpriv | immutable | comm | internal | Frozen contact copy for snapshots. |

\* Customer itself has guest→verified transition; challenge lifecycle is LC-02.

## 4. Catalog (CTX-CAT)

| ID | Concept | Aliases | Type | Ctx | Agg | LC | REQ / INV | Class | Mut | Ret | Vis | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CON-020 | Category | Category | root | CAT | AGG-05 | — | REQ-CAT-002 | pub | mutable | comm | public | SEO-capable. |
| CON-021 | Product | Product | root | CAT | AGG-06 | LC-04 | REQ-CAT-001/003..006 | pub(+fin base price) | mutable | comm(archive) | public | Publication/archive states; price changes never mutate history (INV-12 downstream). |
| CON-022 | Product Variant | Variant | entity | CAT | AGG-06 | — | REQ-VAR-001 | pub | mutable | comm | public | Color/size. |
| CON-023 | SKU | SKU | entity | CAT | AGG-06 | LC-05* | REQ-VAR-001/002 | pub | mutable | comm | public | Catalog owns SKU **definition**; Inventory owns stock state. |
| CON-024 | Product Side | Product Side | entity | CAT | AGG-06 | — | REQ-SIDE-001 | pub | mutable | comm | public | Background image (AssetId), safe area, mapping. |
| CON-025 | Embroidery Area | Embroidery Area | entity | CAT | AGG-06 | — | REQ-SIDE-002 | pub | mutable | comm | public | Placement region per side. |
| CON-026 | Product Media | Product Media | entity | CAT | AGG-06 | — | REQ-MEDIA-001 | pub | mutable | comm | public | Association to AssetId; never binary. |
| CON-027 | SEO Metadata | SEO Metadata | vo | CAT/CNT/GAL | — | — | REQ-CAT-005, REQ-SEO-002 | pub | mutable | comm | public | One VO type; embedded by each public aggregate (Product, Category, Gallery Entry, Content Page). |
| CON-028 | Physical Dimension | Physical Dimension (VO) | vo | CAT | — | — | REQ-SIDE-003 | pub | immutable | n-a | public | mm/cm, distinct from canvas coordinates. |
| CON-029 | Coordinate Mapping | Coordinate Mapping VO | vo | CAT | — | — | REQ-SIDE-003 | int | immutable | n-a | internal | Canvas↔image↔physical mapping. |

\* SKU availability (LC-05) = Inventory-driven projection + Catalog manual override display; owner split documented in AGG-06/AGG-07.

## 5. Inventory (CTX-INV)

| ID | Concept | Aliases | Type | Ctx | Agg | LC | REQ / INV | Class | Mut | Ret | Vis | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CON-030 | SKU Stock | Inventory Balance (root sense) | root | INV | AGG-07 | LC-05 | REQ-INV-001, INV-18 | int | mutable | comm | internal | One per SKU reference; consistency boundary for stock. |
| CON-031 | Inventory Ledger Entry | Inventory Ledger Entry | append | INV | AGG-07 | — | REQ-INV-002, INV-14 | int | append | comm | internal | Every movement, with reason. |
| CON-032 | Soft Hold | Soft Hold | entity | INV | AGG-07 | LC-17 | REQ-INV-003, ADR-DB1-018 | int | mutable | oper | internal | Distinct from official reservation; TTL config (deferred). |
| CON-033 | Official Reservation | Inventory Reservation | entity | INV | AGG-07 | LC-17 | REQ-INV-003/004/007, INV-05 | int | mutable | comm | internal | Only after approval + verified deposit; explicit `expires_at` semantics per ADR-DB1-018. |
| CON-034 | Inventory Balance | Inventory Balance | derived | INV | AGG-07 | — | REQ-INV-001 | int | derived | n-a | internal | Available/held/sold projection from ledger + holds. |
| CON-035 | Low-Stock Threshold | Low-Stock Threshold | vo | INV | AGG-07 | — | REQ-INV-006 | int | mutable | n-a | internal | Config value per stock item. |
| CON-036 | Adjustment Reason | (adjustment reason) | vo | INV | — | — | REQ-INV-002/005 | int | immutable | n-a | internal | Free-text + actor; not a status. |

## 6. Asset (CTX-AST)

| ID | Concept | Aliases | Type | Ctx | Agg | LC | REQ / INV | Class | Mut | Ret | Vis | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CON-040 | Asset | Asset, Template Asset, Production Asset | root | AST | AGG-08 | LC-06 | REQ-ASSET-001..007, INV-09/10 | mixed (cpriv/prod/pub by kind) | mutable | per category | scoped | Metadata only; binary in object storage; private-by-default; semantic association owned by consuming modules. |
| CON-041 | Asset Inspection Result | Asset Inspection Result | append | AST | AGG-08 | LC-06 | REQ-ASSET-002 | sec | append | oper | internal | Validation pipeline outcomes; idempotent callbacks. |
| CON-042 | Asset Derivative | Asset Derivative, Preview | entity | AST | AGG-08 | LC-06 | REQ-ASSET-003, INV-22 | mixed | mutable | per parent | scoped | Watermarked previews, mockups, normalized copies. CON-061 Preview merged here. |
| CON-043 | Object Storage Reference | Signed Access target | vo | AST | — | — | REQ-ASSET-001, INV-10 | int | immutable | n-a | internal | Stable internal ref; never public URL as authority. |
| CON-044 | Asset Access Scope | Access Scope | vo | AST | — | — | REQ-ASSET-004, INV-21 | sec | immutable | n-a | internal | Drives signed-URL authorization. |

## 7. Design (CTX-DSN)

| ID | Concept | Aliases | Type | Ctx | Agg | LC | REQ / INV | Class | Mut | Ret | Vis | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CON-050 | Design Session | Design Session, Autosave Snapshot | temp/root | DSN | AGG-09 | LC-07 | REQ-SESS-001..005 | cpriv | temp | trans | customer(session) | Guest-capable; not a Customer (ADR-DB2-001); autosave stale-write safety; never a design library. |
| CON-051 | Autosave Snapshot | Autosave Snapshot, Save State | temp | DSN | AGG-09 | LC-07 | REQ-SESS-002 | cpriv | temp | trans | internal | Bounded redundancy; merged conceptually into session (working copy + save state). |
| CON-052 | Design Document | Design Document | vo(doc) | DSN | — (type owned by `packages/design-document`) | — | REQ-SESS-003, REQ-INT-006, INV-32 | cpriv | mutable (in session) / frozen (in version) | follows holder | scoped | Opaque versioned payload + `document_schema_version` (ADR-DB1-012). |
| CON-053 | Design Case | (design thread per request) | root | DSN | AGG-10 | LC-08/09 | REQ-DVER-001..006, INV-16 | cpriv | mutable(header) | comm | scoped | Owns single-active-review invariant + version chain per request. |
| CON-054 | Design Version | Design Version, Design Version Snapshot, Version History | snapshot | DSN | AGG-10 | LC-08 | REQ-DVER-001..006, INV-01/17, REQ-APPR-002 | cpriv | immutable once sent/approved | comm | scoped | Parent-version chain; integrity hash; no version ever lost (D-011). |
| CON-055 | Review Decision | Review Decision, Revision Request | append | DSN | AGG-10 | LC-09 | REQ-REVIEW-001/002 | cpriv | append | comm | scoped | Approve / request-revision + feedback; revision request merged here. |
| CON-056 | Approval Snapshot | Approval Snapshot, Approval History | snapshot/root | DSN | AGG-11 | LC-10 | REQ-APPR-001..003, INV-01/03 | cpriv+fin | immutable | comm | scoped | Contents per `06 §9`; retained historically on reopen (J10). |
| CON-057 | Design Template | Design Template | root | DSN | AGG-12 | — | REQ-TMPL-001/002 | int(prod assets) | mutable(draft)+versioned | comm | public(listing)/internal(source) | Per [`DB2_DESIGN_TEMPLATE_DECISION.md`](./DB2_DESIGN_TEMPLATE_DECISION.md): Design-owned, clone-on-use. |
| CON-058 | Integrity Hash | Version Hash Link | vo | DSN | — | — | REQ-DVER-006, INV-32 | int | immutable | n-a | internal | `sha256:<hex>` per ADR-DB1-012. |
| CON-059 | Thread Color | Thread color | vo | DSN | — | — | `05 §4.1`, REQ-APPR-001 | pub | immutable | n-a | scoped | Palette selection captured in versions/snapshots. |
| CON-060 | Embroidery Placement | (side/area/dimension binding) | vo | DSN | — | — | REQ-DVER-002 | cpriv | immutable | n-a | scoped | Side + area + physical dims of a design. |
| CON-061 | Preview | Preview image | derived | DSN→AST | AGG-08 | LC-06 | REQ-DVER-002, INV-22 | cpriv | derived | per parent | scoped | **Merged into CON-042** (watermarked derivative) + reference from Design Version. |

## 8. Ordering (CTX-ORD — Custom Request + Order + Shipping)

| ID | Concept | Aliases | Type | Ctx | Agg | LC | REQ / INV | Class | Mut | Ret | Vis | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CON-070 | Custom Request | Custom Request | root | ORD | AGG-13 | LC-11 | REQ-REQ-001..005 | cpriv | mutable | comm | scoped | Central case aggregate; current pointers to design case/quotation by ID. |
| CON-071 | Customer-Owned Product | Customer-Owned Product | entity | ORD | AGG-13 | — | REQ-COP-001/002, INV-13 | cpriv | mutable | comm | scoped | Never a store SKU; images via AssetId. |
| CON-072 | Moderation Note | Request Moderation | append | ORD | AGG-13 | LC-11 | REQ-REQ-003 | int | append | comm | internal | Spam/reject/pause/clarify actions (+ audit). |
| CON-073 | Request Code | Request Code | vo | ORD | AGG-13 | — | REQ-REQ-005 | int | immutable | n-a | scoped | Human code, not PK, not authz (ADR-DB1-007). |
| CON-074 | Quantity Breakdown | (qty by variant/size) | vo | ORD | AGG-13 | — | REQ-REQ-001, REQ-CUST-003 | cpriv | mutable until quoted | n-a | scoped | Covers B2B multi-size/qty without item explosion. |
| CON-075 | Request Item | (not in DB0; considered) | — | ORD | — | — | — | — | — | — | — | **Rejected as separate MVP concept** — single design subject + CON-074; readiness note in AGG-13. |
| CON-076 | Order | Order | root | ORD | AGG-15 | LC-14 | REQ-ORD-001..005 | fin | mutable(header) | comm | scoped | Created from accepted commercial state; guards → DB3. |
| CON-077 | Order Item | Order Item | snapshot | ORD | AGG-15 | — | REQ-ORD-002, INV-12 | fin | immutable | comm | scoped | Per-SKU line frozen at order creation; references ApprovalSnapshotId. |
| CON-078 | Shipping Detail | Shipping Detail, Shipping Address | entity→snapshot | ORD | AGG-15 | LC-19 | REQ-SHIP-001..004 | cpriv+fin | mutable → immutable at dispatch | comm+anonymize | scoped | Per ADR-DB2-002; no address book in MVP. |
| CON-079 | Recipient | (recipient details) | vo | ORD | — | — | REQ-SHIP-001 | cpriv | immutable | comm+anonymize | scoped | May differ from customer. |
| CON-080 | Shipping Address | Shipping Address | vo | ORD | — | — | REQ-SHIP-003 | cpriv | immutable | comm+anonymize | scoped | VO inside Shipping Detail. |
| CON-081 | Order Transition Event | Transition Log, Delivery State | append | ORD | AGG-15 | LC-14/19 | REQ-ORD-003, REQ-SHIP-004, INV-14 | int | append | comm | internal | Actor/timestamp/reason; delivery events merged here. |
| CON-082 | Order Code | Order code | vo | ORD | AGG-15 | — | ADR-DB1-007 | int | immutable | n-a | scoped | |

## 9. Quotation (CTX-QUO)

| ID | Concept | Aliases | Type | Ctx | Agg | LC | REQ / INV | Class | Mut | Ret | Vis | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CON-090 | Quotation | Quotation (header) | root | QUO | AGG-14 | LC-12 | REQ-QUOT-001..006 | fin | mutable(header) | comm | scoped | Header + current-version pointer. |
| CON-091 | Quotation Version | Quotation Version | snapshot | QUO | AGG-14 | LC-13 | REQ-QUOT-002/004, INV-02/12 | fin | immutable once sent | comm | scoped | Never overwritten; new version supersedes. |
| CON-092 | Quotation Line Item | Quotation Line Item | vo | QUO | AGG-14 | — | REQ-QUOT-001 | fin | immutable (in version) | comm | scoped | Inside version snapshot. |
| CON-093 | Pricing Inputs | (dimensions/colors/stitch/qty) | vo | QUO | — | — | REQ-QUOT-001, BR-004, GAP-10 | fin | immutable (in version) | comm | internal | Stitch count = admin-entered manual input (GAP-10 note; physical shape → DB4). |
| CON-094 | Manual Adjustment | Manual adjustment | vo | QUO | — | — | REQ-QUOT-001 | fin | immutable (in version) | comm | internal | |
| CON-095 | Validity Window | Quotation validity | vo | QUO | — | — | REQ-QUOT-003 | fin | immutable (in version) | comm | scoped | Uses Time Range VO (CON-166). |
| CON-096 | Acceptance Evidence | Quotation Acceptance | append | QUO | AGG-14 | LC-12 | REQ-QUOT-006 | fin | append | comm | scoped | Secure-flow acceptance record; ordering vs approval → DB3 (GAP-03). |

## 10. Payment (CTX-PAY)

| ID | Concept | Aliases | Type | Ctx | Agg | LC | REQ / INV | Class | Mut | Ret | Vis | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CON-100 | Payment Obligation | Payment/Deposit/Remaining Obligation | root | PAY | AGG-16 | LC-15 | REQ-PAY-001..003, INV-04 | fin | mutable | comm | scoped | Deposit and remaining are two instances, independent. |
| CON-101 | Payment Attempt | Payment Attempt | entity | PAY | AGG-16 | LC-16 | REQ-PAY-004..006, INV-07/15 | fin | mutable(state) | comm | scoped | Provider-agnostic; states provisional → DB3. |
| CON-102 | Payment Callback Event | Payment Callback Event | append | PAY | — (module record) | LC-16 | REQ-PAY-005/006, INV-07 | fin+sec | append | comm | internal | Raw verified event evidence (redacted); keyed by provider ref. |
| CON-103 | Provider Reference | Provider Reference | vo | PAY | — | — | REQ-PAY-007 | sec | immutable | comm | internal | Reconciliation key. |
| CON-104 | Reconciliation Record | Reconciliation Record | append | PAY | — (module record) | — | REQ-PAY-008 | fin | append | comm | internal | Manual bank-transfer review evidence; idempotent. |
| CON-105 | Refund Record | Refund Record | append | PAY | — (module record) | LC-20 | REQ-PAY-009 | fin | append | comm | internal | Placeholder; policy → DB3 (O-009). |
| CON-106 | Payment Allocation | (attempt→obligation link) | vo | PAY | — | — | REQ-PAY-001 | fin | immutable | comm | internal | Which obligation an attempt satisfies. |

## 11. Production (CTX-PRD)

| ID | Concept | Aliases | Type | Ctx | Agg | LC | REQ / INV | Class | Mut | Ret | Vis | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CON-110 | Production Job | Production Job | root | PRD | AGG-17 | LC-18 | REQ-PROD-001/002/004, INV-03/06 | prod | mutable | comm | internal | Guarded start; references exact ApprovalSnapshotId. |
| CON-111 | Production Specification | (spec at job creation) | snapshot | PRD | AGG-17 | — | REQ-PROD-001, INV-03 | prod | immutable | comm | internal | Frozen from approval snapshot at job creation. |
| CON-112 | Production Note | Production notes | append | PRD | AGG-17 | LC-18 | REQ-PROD-004 | prod | append | comm | internal | |
| CON-113 | Production Artifact | Production Artifact, Production/Digitized File | entity | PRD | AGG-17 | — | REQ-PROD-003, REQ-ASSET-005, INV-21/22 | prod | mutable | comm | internal | AssetId reference; strictly internal, unwatermarked. |

## 12. Gallery (CTX-GAL) & Content (CTX-CNT)

| ID | Concept | Aliases | Type | Ctx | Agg | LC | REQ / INV | Class | Mut | Ret | Vis | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CON-120 | Gallery Entry | Gallery Entry | root | GAL | AGG-18 | pub-state | REQ-GAL-001/002 | pub | mutable | comm(archive) | public | Publish/unpublish, ordering, SEO VO. |
| CON-121 | Gallery Media Association | (gallery images) | entity | GAL | AGG-18 | — | REQ-GAL-001 | pub | mutable | comm | public | AssetId references. |
| CON-125 | Content Page | Content Page | root | CNT | AGG-19 | pub-state | REQ-SEO-001..003 | pub | mutable | comm(archive) | public | Home/service/FAQ/local/landing/policy pages. |
| CON-126 | Redirect Rule | Redirect Rule | root | CNT | AGG-20 | — | REQ-SEO-004 | pub | mutable | comm | public | |
| CON-127 | Agreement | (terms container) | root | CNT | AGG-21 | pub-state | GAP-09, REQ-APPR-001 | pub | mutable(header) | comm | public | Per policy type; per [`DB2_TERMS_VERSION_DECISION.md`](./DB2_TERMS_VERSION_DECISION.md). |
| CON-128 | Agreement Version | Terms version | snapshot | CNT | AGG-21 | pub-state | GAP-09 | pub | immutable once published | comm | public | Published/effective/superseded semantics. |
| CON-129 | Terms Acceptance Reference | Terms version accepted | vo | CNT→DSN | — | — | REQ-APPR-001 | cpriv | immutable | comm | internal | AgreementVersionId + content hash captured in Approval Snapshot. |

## 13. Notification (CTX-NTF), Audit (CTX-AUD), Platform (CTX-PLT)

| ID | Concept | Aliases | Type | Ctx | Agg | LC | REQ / INV | Class | Mut | Ret | Vis | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CON-130 | Notification Intent | Notification | root | NTF | AGG-22 | — | REQ-NOTIF-001/002 | cpriv(min) | mutable(status) | oper | internal | Per ADR-DB2-003; template ref + redacted params; no secrets. |
| CON-131 | Delivery Attempt | Notification Log | append | NTF | AGG-22 | — | REQ-NOTIF-001 | int | append | oper | internal | Channel result, retries, dead-letter linkage. |
| CON-132 | Template Reference | (template id+version) | vo | NTF | — | — | ADR-DB2-003 | int | immutable | n-a | internal | |
| CON-133 | Redacted Parameter Snapshot | (params) | vo | NTF | — | — | ADR-DB2-003 | cpriv | immutable | oper | internal | Secrets/tokens/OTP excluded by construction. |
| CON-150 | Audit Event | Audit Event (+Detail) | append/infra | AUD | — (module record) | — | REQ-AUDIT-001..003, INV-14 | int | append | audit | internal | Actor/action/target/metadata/timestamp/reason; never replaces domain history (§8.6). |
| CON-140 | Outbox Event | Outbox Event | infra/append | PLT | — | LC-22 | REQ-OUTBOX-001, INV-23 | int | append(+dispatch status) | trans(processed) | internal | Written in business tx; relay dispatches post-commit. |
| CON-141 | Idempotency Record | Idempotency Record/Key | infra | PLT | — | LC-23 | REQ-IDEM-001/002, INV-19/24 | int | mutable(state) | trans | internal | (namespace, scope key) unique + fingerprint per ADR-DB1-017. |
| CON-142 | Idempotency Fingerprint | Request fingerprint | vo | PLT | — | — | ADR-DB1-017 | int | immutable | n-a | internal | Canonical-hash based. |
| CON-143 | Job Attempt / Dead Letter | Job Attempt, Dead Letter | infra/append | PLT | — | — | REQ-OUTBOX-002 | int | append | oper | internal | Worker operational record; broker abstract (DEC-28). |
| CON-144 | Business Policy Configuration | Retention Class config, TTL config | root/infra | PLT | AGG-23 | — | ADR-DB1-011/017/018, BACKEND_CONVENTIONS §16 | int | mutable+versioned | comm | internal | Versioned, audited config for retention/TTL/policy values (numbers deferred to DB3/business). |

## 14. Cross-cutting value objects & read models

| ID | Concept | Type | Ctx | REQ / INV | Notes |
|---|---|---|---|---|---|
| CON-160 | Money | vo | shared (`packages/domain-types`) | REQ-INT-001, INV-11 | Exact decimal semantics; SQL shape → DB4. |
| CON-161 | Quantity | vo | shared | REQ-REQ-001 | Positive integer semantics. |
| CON-162 | Percentage/Rate | vo | shared | REQ-QUOT-003 (40/60) | Derivation rule, values from config/business. |
| CON-163 | Email Address | vo | shared | REQ-VERIF-001 | Normalization (lowercase) per ADR-DB2-001. |
| CON-164 | Phone Number | vo | shared | REQ-VERIF-001 | Normalization direction (E.164-style) per ADR-DB2-001. |
| CON-165 | Human-Readable Code | vo | shared | ADR-DB1-007 | Request/order/quotation code type; format → DB3/DB4. |
| CON-166 | Time Range | vo | shared | REQ-QUOT-003 | Validity windows, holds. |
| CON-167 | Document Schema Version | vo | `packages/design-document` | ADR-DB1-012 | |
| CON-170 | Admin Dashboard Composition | derived | read (multi) | Q-22 | Read composition only — never an owning aggregate (ADR-DB1-009 rule 14). |
| CON-171 | Low-Stock View | derived | read (INV) | Q-20, REQ-INV-006 | |
| CON-172 | Production Queue View | derived | read (PRD/ORD) | Q-19 | |
| CON-173 | Pending Payment Lists | derived | read (ORD/PAY) | Q-17/Q-18/Q-23 | |
| CON-174 | Expiring Quotations View | derived | read (QUO) | Q-24 | |
| CON-175 | Sitemap / Indexable Set | derived | read (CNT/CAT/GAL) | Q-06, REQ-SEO-001 | |
| CON-176 | Request Detail Composition | derived | read (ORD/DSN/QUO/PAY) | Q-09 | Customer secure view; read-only composition. |
| CON-180 | Analytics Event Emission | non-persistent | PLT boundary | `08 §8`, GAP-11 | **Not stored in application PostgreSQL** per [`DB2_ANALYTICS_STORAGE_DECISION.md`](./DB2_ANALYTICS_STORAGE_DECISION.md). |

## 15. Duplicate / overlap resolutions

| Resolution | Detail |
|---|---|
| CON-004 Login Event → CON-150 | Audit Event is the single security-action record; no parallel login log concept. |
| CON-051 Autosave Snapshot ⊂ CON-050 | Autosave is the session's working-copy mechanism, not an independent concept for DB4. |
| CON-055 absorbs "Revision Request" | One review-decision record with outcome approve/revision + feedback. |
| CON-061 Preview → CON-042 | Preview is an Asset Derivative; Design Version holds the reference + preview hash. |
| CON-075 Request Item | Rejected for MVP: single design subject per request + Quantity Breakdown VO (CON-074); Order Items (CON-077) are the per-SKU commercial lines. B2B readiness preserved (breakdown covers multi-size/qty; a future item entity would be additive). |
| CON-081 absorbs Delivery State events | Delivery marked/completed are order transition events, not a separate aggregate. |
| "Template Asset"/"Production Asset" → CON-040 kinds | One Asset concept with classification kinds; semantic link owned by consumer module. |
| SKU Availability | Not a stored concept: projection of CON-034 + catalog manual override (documented in AGG-06/07). |

Total canonical concepts: **75** (68 modeled + 7 merged/rejected with canonical replacements noted above).
