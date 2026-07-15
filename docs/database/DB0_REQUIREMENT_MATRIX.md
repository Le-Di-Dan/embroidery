# DB0 — Requirement-to-Data Matrix

**Audit date:** 2026-07-15 · **Audited Git HEAD:** `223e4db`
**Nature:** DB0 discovery. Candidate concepts are **not** finalized tables/columns. No schema is defined here.

---

## 1. How to read this matrix

Each row is a requirement with a stable ID `REQ-<DOMAIN>-<nnn>`. Columns are
compacted for reviewability; the boolean relevance attributes required by DB0
are encoded in the **Flags** column using this legend:

| Flag | Meaning (relevance) |
| ---- | ------------------- |
| `L` | Lifecycle relevance — participates in a state machine (see DB3 inventory). |
| `A` | Audit requirement — sensitive action/change must be auditable. |
| `R` | Retention relevance — subject to a retention/deletion policy. |
| `T` | Transaction relevance — needs an explicit transaction boundary. |
| `C` | Concurrency relevance — races/contention must be handled. |
| `I` | Idempotency relevance — duplicate/retry safety required. |
| `X` | Cross-machine / recovery relevance — affects portability, migration, backup or restore. |

**Status** ∈ `LOCKED`, `OPEN_DECISION`, `AMBIGUOUS`, `CONFLICT`,
`MISSING_REQUIREMENT`.
**Class** (data classification) ∈ `public`, `internal`, `customer-private`,
`security-sensitive`, `financial`, `production-sensitive`.
**Mut** (mutability) ∈ `mutable`, `append-only`, `immutable-snapshot`,
`derived`, `temporary`.
**CP** = planned checkpoint (DB1–DB10). Sources are cited as `file §heading`.

Legend for owner column: candidate **aggregate owner / module** (conceptual,
per `SYSTEM_ARCHITECTURE §8`). Not a final decision.

---

## 2. Identity & admin session

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-IDN-001 | Exactly one active Admin account; no role matrix, but not an unreplaceable hard-coded identity. | `07 §1`, `04 BR-016`, `12 D-018` | LOCKED | Admin Account | Identity | security-sensitive | mutable | A,X | DB2 | Account must be replaceable/recoverable across machines. |
| REQ-IDN-002 | Admin auth: strong password, MFA recommended, rate limiting, session revocation, recovery, no hard-coded creds. | `09 §3` | LOCKED (provider OPEN) | Admin Credential, Admin Session | Identity | security-sensitive | mutable | L,A | DB2 | OTP/auth provider open (O-005 → DEC). |
| REQ-IDN-003 | Admin sessions must support secure handling, revocation, and login alerts where practical. | `09 §3` | LOCKED | Admin Session, Login Event | Identity | security-sensitive | append-only (events) | L,A | DB3 | Session lifecycle at DB3. |
| REQ-IDN-004 | Login is a sensitive auditable action. | `07 §12` | LOCKED | Audit Event | Audit | internal | append-only | A | DB3 | Feeds audit domain. |

## 3. Customer identity & contact verification

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-CUST-001 | Customer may start as guest; must verify email or phone before submitting a request. | `01 §4`, `04 BR-014`, `09 §2` | LOCKED | Customer, Contact | Customer | customer-private | mutable | L,A,R | DB3 | Guest→verified lifecycle (LC). |
| REQ-CUST-002 | Custom request stores customer information (contact details). | `01 §5` | LOCKED | Customer, Contact | Customer | customer-private | mutable | R | DB2 | Collect only necessary data (`10 §12`). |
| REQ-CUST-003 | B2B future readiness: business name, tax code, contact person, invoice need, multi-size/qty, reorder. | `01 §13`, `04 BR-002` | LOCKED (model readiness only) | Business Profile (future) | Customer | customer-private | mutable | R | DB2 | Model should not preclude; do not build workflow now. |
| REQ-VERIF-001 | Verification of email/phone required at submission; sensitive actions may require re-verification. | `01 §4`, `09 §2` | LOCKED (provider OPEN) | Contact Verification, OTP Challenge | Customer/Identity | security-sensitive | append-only | L,A,R,C,I | DB3 | Idempotent challenge issuance; expiry. |
| REQ-VERIF-002 | Customer identifiers must not be exposed in public assets; masked in watermark. | `10 §12`, `09 §6` | LOCKED | Masked Identifier | Customer | customer-private | derived | — | DB4 | Watermark uses masked ref. |

## 4. Secure access link / grant

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-GRANT-001 | System issues a secure link on submission granting view request/quotation/versions, request edits, approve, pay. | `01 §4`, `03 J2` | LOCKED | Secure Access Grant | Customer | security-sensitive | mutable | L,A | DB3 | Grant scopes actions. |
| REQ-GRANT-002 | Secure links must be unguessable, revocable or expiring, and scoped to one customer/request. | `09 §2`, `01 §4`, `SYSTEM_ARCHITECTURE §12` | LOCKED (exact expiry/revocation OPEN) | Secure Access Grant, Token | Customer | security-sensitive | mutable | L,A,X | DB3 | Expiry/revocation policy O-005 → DEC. |
| REQ-GRANT-003 | Secure access must access only the owning customer's request (authorization scope). | `09 §2`, `SYSTEM_ARCHITECTURE §12` | LOCKED | Grant Scope | Customer | security-sensitive | immutable-snapshot | A | DB4 | INV enforced. |
| REQ-GRANT-004 | Secure link lookup must be fast and secure (token→grant resolution). | `07 §5`, `SYSTEM_ARCHITECTURE §5.3` | LOCKED | Grant Token Index | Customer | security-sensitive | derived | — | DB5 | Query catalog Q. |

## 5. Catalog: category, product, media

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-CAT-001 | Product has name, code, description, category, images, material, base price, stock status, reference lead time, display order. | `01 §2.2`, `07 §3`, `11 Product` | LOCKED | Product, Category | Catalog | public | mutable | L,A | DB2 | Base price is `financial` within product. |
| REQ-CAT-002 | Product supports categorization; category pages are SEO-capable. | `01 §2.2`, `08 §2` | LOCKED | Category | Catalog | public | mutable | — | DB2 | |
| REQ-CAT-003 | Product publication/archival is an admin operation (create/edit/archive, out-of-stock, display order). | `07 §3` | LOCKED | Product Publication State | Catalog | public | mutable | L,A | DB3 | Publication lifecycle. |
| REQ-CAT-004 | Product changes are auditable. | `07 §12` | LOCKED | Audit Event | Audit | internal | append-only | A | DB3 | |
| REQ-MEDIA-001 | Product has images per side/area; media metadata in DB, binaries in object storage. | `01 §2.2`, `05 §5`, `SYSTEM_ARCHITECTURE §9` | LOCKED | Product Media, Asset | Catalog/Asset | public | mutable | X | DB4 | DB refs object by internal ID, not public URL. |
| REQ-CAT-005 | Product has SEO metadata (title, description, canonical, social image, alt, index/noindex). | `07 §3`, `08 §4` | LOCKED | SEO Metadata | Catalog/Content | public | mutable | — | DB2 | |
| REQ-CAT-006 | Base product price must not be floating point; money is exact decimal. | `10 §5`, `BACKEND_CONVENTIONS §9` | LOCKED | Money (VO) | Catalog | financial | mutable | — | DB4 | Applies to all money fields. |

## 6. Variants, SKU, product side, embroidery area

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-VAR-001 | Product supports color and size variants, each with an SKU. | `01 §2.2`, `01 §9`, `11 Variant/SKU`, `12 D-016` | LOCKED | Variant, SKU | Catalog | public | mutable | L | DB2 | SKU is inventory key. |
| REQ-VAR-002 | SKU availability (available/out-of-stock) is displayed and admin-managed. | `01 §2.2`, `07 §3`, `07 §10` | LOCKED | SKU Availability | Catalog/Inventory | public | mutable | L,A | DB3 | Availability lifecycle. |
| REQ-SIDE-001 | Product defines configurable sides (front/back/sleeve) each with background image, name, safe area, physical dimensions, coordinate mapping, optional mask, preview config. | `05 §5`, `01 §2.2`, `07 §3`, `11 Product Side` | LOCKED | Product Side | Catalog | public | mutable | — | DB2 | Preview geometry. |
| REQ-SIDE-002 | Each side defines embroidery areas (allowed placement regions). | `01 §2.2`, `11 Embroidery Area`, `07 §3` | LOCKED | Embroidery Area | Catalog | public | mutable | — | DB2 | Used for over-area warnings. |
| REQ-SIDE-003 | Physical measurement config (mm/cm) distinct from canvas/image coordinates. | `05 §6` | LOCKED | Physical Dimension (VO) | Catalog | public | mutable | — | DB4 | Coordinate mapping VO. |

## 7. Design templates

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-TMPL-001 | Products may offer design template suggestions ("gợi ý mẫu thiết kế"). | `01 §2.2` | AMBIGUOUS | Design Template | Design/Catalog | internal | mutable | — | DB2 | Ownership (catalog vs design) & structure undefined → GAP. |
| REQ-TMPL-002 | Original store-owned templates/artwork are not public by default; not exportable by customer. | `09 §5`, `04 BR-011`, `00 §8` | LOCKED | Template Asset | Asset | production-sensitive | mutable | A,X | DB4 | Private-by-default. |

## 8. Inventory

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-INV-001 | Track per SKU: available qty, held/reserved qty, sold qty (by color/size). | `01 §9`, `12 D-016` | LOCKED | Inventory Balance | Inventory | internal | mutable | C,T | DB4 | Balance is derived from ledger (candidate). |
| REQ-INV-002 | Inventory changes recorded with adjustment reason (append-only ledger). | `07 §10` | LOCKED | Inventory Ledger Entry | Inventory | internal | append-only | A,T | DB4 | Auditable stock movement. |
| REQ-INV-003 | No official reservation at draft/request; soft hold possible at quotation; official reservation after approval + successful deposit. | `01 §9`, `04 BR-015`, `03 J6`, `06 §8` | LOCKED | Inventory Reservation | Inventory | internal | mutable | L,T,C,I | DB3 | Reservation lifecycle + expiry (O-open). |
| REQ-INV-004 | Reservation can be released (with reason); released on cancellation. | `07 §10`, `06 §11` | LOCKED | Reservation Release | Inventory | internal | append-only | L,A,T | DB3 | |
| REQ-INV-005 | Prevent negative stock unless explicitly overridden with audit reason. | `07 §10` | LOCKED | Stock Constraint | Inventory | internal | mutable | A,T,C | DB7 | DB-enforceable constraint. |
| REQ-INV-006 | Low-stock identification for admin dashboard. | `07 §2`, `07 §10` | LOCKED | Low-Stock Threshold | Inventory | internal | derived | — | DB5 | Query catalog Q. |
| REQ-INV-007 | Reservation expiration period is an open decision. | `04 BR-015`, `12 O-008`-adjacent | OPEN_DECISION | Reservation Expiry | Inventory | internal | mutable | L,X | DB1 | → DEC. Affects reservation lifecycle. |

## 9. Assets, derivatives, inspection

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-ASSET-001 | Store metadata in PostgreSQL, binaries in object storage; reference by stable internal ID, never permanent public URL as authority. | `SYSTEM_ARCHITECTURE §9,§10`, `BACKEND_CONVENTIONS §9,§14`, `00 §8` | LOCKED | Asset | Asset | internal | mutable | X | DB4 | Core storage rule; binary never in PG. |
| REQ-ASSET-002 | Uploads validated by size, MIME, signature, extension consistency, image decode, SVG sanitization, pixel-dimension limit, processing timeout, storage isolation. | `09 §4`, `BACKEND_CONVENTIONS §14` | LOCKED | Asset Inspection Result | Asset | security-sensitive | append-only | L,A,I | DB3 | Inspection lifecycle; idempotent callbacks. |
| REQ-ASSET-003 | Asset processing (normalize, background removal, watermark, mockup) produces derivatives. | `SYSTEM_ARCHITECTURE §5.4`, `05 §4.2` | LOCKED | Asset Derivative | Asset | internal | derived | L,I,X | DB3 | Worker jobs; idempotent. |
| REQ-ASSET-004 | Private assets require authorization; expiring signed URLs; direct storage listing prohibited; customer previews are lower-value derivatives. | `09 §5`, `SYSTEM_ARCHITECTURE §10,§12` | LOCKED | Signed Access, Access Scope | Asset | security-sensitive | derived | A | DB4 | No public listing. |
| REQ-ASSET-005 | Production/digitized files are strictly internal and never public. | `09 §5`, `04 BR-011`, `SYSTEM_ARCHITECTURE §10` | LOCKED | Production Asset | Asset/Production | production-sensitive | mutable | A,X | DB4 | |
| REQ-ASSET-006 | Customer uploads and production assets are private-by-default and subject to retention. | `09 §5,§10`, `10 §12` | LOCKED | Asset Retention Class | Asset | customer-private/production-sensitive | mutable | R,X | DB1 | Retention periods open. |
| REQ-ASSET-007 | Asset backup/replication required alongside database backup. | `10 §9`, `09 §11` | LOCKED | Asset Backup | Asset/Ops | internal | append-only | X | DB1 | Object-storage recovery distinct from DB recovery. |

## 10. Design session & autosave

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-SESS-001 | Unsaved designs stored as temporary sessions that expire after a configurable period. | `04 BR-013`, `05 §8`, `03 J9`, `12 O-008` | LOCKED (period OPEN) | Design Session | Design | customer-private | temporary | L,R,X | DB3 | Session lifecycle ACTIVE/EXPIRED/... |
| REQ-SESS-002 | Autosave: transparent, non-blocking, survives refresh, handles concurrent/stale updates safely, avoids unlimited redundant versions, indicates save state. | `05 §8`, `01 §3` | LOCKED | Autosave Snapshot, Save State | Design | customer-private | temporary | C,I,X | DB3 | Concurrency/stale-write handling. |
| REQ-SESS-003 | Design document is structured data (elements, layers, positions, properties). | `05 §2,§3`, `11 Design Document` | LOCKED (JSON structure OPEN) | Design Document | Design | customer-private | mutable | — | DB2 | JSON structure open → DEC. |
| REQ-SESS-004 | Session is not exposed as a customer-visible design library. | `01 §4`, `05 §8`, `04 BR-013`, `12 D-006` | LOCKED | (constraint) | Design | customer-private | temporary | — | DB4 | No library query surface. |
| REQ-SESS-005 | Abandoned sessions expire and are deleted or anonymized per retention policy. | `03 J9`, `09 §7,§10` | LOCKED (policy OPEN) | Session Retention | Design | customer-private | temporary | L,R,X | DB1 | Cleanup job. |

## 11. Formal design versions

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-DVER-001 | Versioning begins at submission or when Admin creates a formal revision; each revision is a new version. | `05 §9`, `01 §7`, `03 J5` | LOCKED | Design Version | Design | customer-private | immutable-snapshot | L,A | DB3 | Version lifecycle. |
| REQ-DVER-002 | A version captures: design-document snapshot, product, variant, side, area, physical dimensions, preview image, watermark state, author, timestamp, parent version, revision note, integrity hash. | `05 §9`, `06 §4` | LOCKED | Design Version Snapshot | Design | customer-private | immutable-snapshot | A,X | DB4 | Integrity hash canonical → DEC. |
| REQ-DVER-003 | Only one version actively awaiting customer review at a time. | `06 §4` | LOCKED | Active Review Pointer | Design | customer-private | mutable | L,C | DB3 | Concurrency guard. |
| REQ-DVER-004 | A new version may supersede an older unapproved version; approved cannot return to draft. | `06 §4`, `01 §7` | LOCKED | Version Transition | Design | customer-private | immutable-snapshot | L | DB3 | |
| REQ-DVER-005 | No design version may be lost; historical versions must remain. | `10 §4`, `12 D-011`, `04 BR-007` | LOCKED | Version History | Design | customer-private | append-only | A,X | DB4 | No hard revision limit. |
| REQ-DVER-006 | Approval references an exact version identifier and integrity hash. | `06 §4`, `04 BR-010` | LOCKED | Version Hash Link | Design | customer-private | immutable-snapshot | A | DB4 | |

## 12. Customer review & approval snapshot

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-REVIEW-001 | Customer reviews a version via secure link and either approves or requests revision; feedback recorded. | `03 J5`, `07 §6`, `01 §7` | LOCKED | Review Decision, Revision Request | Design | customer-private | append-only | L,A | DB3 | Review lifecycle. |
| REQ-REVIEW-002 | Only explicit approval through secure flow is authoritative; messaging apps are not the record. | `04 BR-008`, `12 D-012`, `00 §8` | LOCKED | Approval Authority | Design | customer-private | immutable-snapshot | A | DB3 | INV. |
| REQ-APPR-001 | Approval creates an immutable snapshot containing: approved version ID, design-document hash, preview hash, product, variant, side, area, physical dimensions, thread colors, quantity, approval timestamp, customer identity ref, terms version accepted. | `06 §9`, `05 §9`, `01 §7` | LOCKED | Approval Snapshot | Design/Order | customer-private | immutable-snapshot | L,A,T,X | DB3 | Transactional creation. |
| REQ-APPR-002 | An approved design version cannot be edited; any post-approval change creates a new version + new approval. | `04 BR-009`, `01 §7`, `06 §10`, `00 §8` | LOCKED | Immutability Constraint | Design | customer-private | immutable-snapshot | A | DB7 | DB + application enforced. |
| REQ-APPR-003 | On reopen-after-approval, existing approval remains valid historically; new version + possibly new quotation; production references latest valid approval. | `06 §10`, `03 J10` | LOCKED (deposit handling OPEN) | Approval History | Design/Order | customer-private | append-only | L,A | DB3 | Deposit reuse policy O-009 → DEC. |

## 13. Customer-owned product & custom request

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-COP-001 | Support customer-owned products: uploaded product images, dimensions, notes, marked embroidery location; manual admin review. | `02 §3`, `03 J3`, `04 BR-003`, `11 Customer-Owned Product` | LOCKED | Customer-Owned Product | Customer/Catalog | customer-private | mutable | A | DB2 | Must not be faked as a store SKU (INV). |
| REQ-COP-002 | Customer-owned products are not store inventory SKUs and must not be reserved as store stock. | `04 BR-003`, `01 §9` | LOCKED | (constraint) | Inventory | internal | — | T | DB4 | Distinct from store catalog. |
| REQ-REQ-001 | A custom request contains: customer info, store-or-customer product, variant, quantity, submitted design, embroidery area, desired dimensions, expected color count, notes, uploaded assets, processing status, version history, quotation, payment info, shipping info. | `01 §5`, `03 J2/J3` | LOCKED | Custom Request | Order/Request | customer-private | mutable | L,A,R | DB2 | Central aggregate. |
| REQ-REQ-002 | Request has a lifecycle: NEW, NEEDS_CLARIFICATION, UNDER_REVIEW, REJECTED, QUOTED, DIGITIZING, DESIGN_REVIEW, APPROVED, CANCELLED (names provisional). | `06 §3` | LOCKED (names PROVISIONAL) | Request State | Order/Request | customer-private | mutable | L,A | DB3 | Final names DB3. |
| REQ-REQ-003 | Admin may mark spam / reject / pause / request clarification. | `04 BR-007`, `07 §5` | LOCKED | Request Moderation | Order/Request | internal | append-only | A | DB3 | Abuse handling. |
| REQ-REQ-004 | Duplicate request submissions must be detected/idempotent. | `09 §7`, `BACKEND_CONVENTIONS §12` | LOCKED | Submission Idempotency Key | Order/Request | internal | append-only | I,C | DB3 | Idempotency store. |
| REQ-REQ-005 | Request carries a code that may be attached to Zalo/Messenger opening text. | `01 §11`, `11 Custom Request` | LOCKED | Request Code | Order/Request | internal | immutable-snapshot | — | DB4 | Human-referable code. |

## 14. Quotation

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-QUOT-001 | Manual quotation from inputs: dimensions, color count, stitch count, quantity, base price, digitizing fee, shipping, manual adjustment. | `01 §6`, `04 BR-004`, `03 J4` | LOCKED | Quotation, Quotation Line Item | Quotation | financial | immutable-snapshot | L,A,T | DB2 | |
| REQ-QUOT-002 | Quotation is versioned; a revised quotation creates a new version, never overwriting historical values. | `01 §6`, `06 §5`, `10 §5` | LOCKED | Quotation Version | Quotation | financial | immutable-snapshot | L,A,T,X | DB3 | Sent version never overwritten (INV). |
| REQ-QUOT-003 | Quotation has validity/expiry, breakdown, total, 40% deposit, 60% remaining. | `01 §6`, `04 BR-005/006`, `03 J4`, `12 D-013/014` | LOCKED | Quotation Totals, Deposit/Remaining split | Quotation | financial | immutable-snapshot | L | DB4 | Split derived from accepted total. |
| REQ-QUOT-004 | Quotation values are not changed by future price-list changes. | `01 §6`, `00 §8`, `10 §5` | LOCKED | Frozen Pricing | Quotation | financial | immutable-snapshot | X | DB4 | Historical immutability (INV). |
| REQ-QUOT-005 | Quotation lifecycle: DRAFT, SENT, ACCEPTED, EXPIRED, REVISED, REJECTED, CANCELLED (provisional). | `06 §5` | LOCKED (names PROVISIONAL) | Quotation State | Quotation | financial | mutable(header)/immutable(version) | L,A | DB3 | Expiring quotations dashboard. |
| REQ-QUOT-006 | Customer accepts a quotation via secure flow. | `03 J4/J6`, `07 §7` | LOCKED (acceptance sequence vs approval order AMBIGUOUS) | Quotation Acceptance | Quotation | financial | immutable-snapshot | L,A,T | DB3 | Order vs design approval sequence → GAP/DEC. |

## 15. Order & lifecycle

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-ORD-001 | Order lifecycle: AWAITING_DEPOSIT, DEPOSIT_PAID, IN_PRODUCTION, PRODUCTION_COMPLETED, AWAITING_FINAL_PAYMENT, READY_FOR_DELIVERY, DELIVERED, COMPLETED, CANCELLED (provisional). | `06 §7` | LOCKED (names PROVISIONAL) | Order, Order State | Order | financial | mutable | L,A | DB3 | |
| REQ-ORD-002 | Order item references product/variant/SKU or customer-owned product, quantity, and the approved design. | `01 §5`, `06 §9`, `04 BR-010` | LOCKED | Order Item | Order | financial | immutable-snapshot | A | DB4 | Snapshot of accepted terms. |
| REQ-ORD-003 | State transitions validated server-side; invalid backward transitions rejected; sensitive transitions record actor, timestamp, reason. | `06 §8`, `SYSTEM_ARCHITECTURE §11` | LOCKED | Transition Guard, Transition Log | Order | internal | append-only | L,A,T,C | DB3 | |
| REQ-ORD-004 | No duplicate order creation; order completion is transactional. | `10 §4`, `SYSTEM_ARCHITECTURE §11` | LOCKED | Order Creation Idempotency | Order | financial | mutable | T,C,I | DB8 | |
| REQ-ORD-005 | Completion cannot occur before delivery; delivery cannot start without verified remaining payment; production cannot start without approved design + verified deposit + reservation where applicable. | `06 §8`, `04 BR-005/006`, `BACKEND_CONVENTIONS §13` | LOCKED | Transition Preconditions | Order | financial | mutable | L,T | DB3 | Core ordering invariants. |

## 16. Payment obligations, attempts, callbacks, refund

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-PAY-001 | Deposit (40%) and remaining (60%) are two independent payment obligations. | `06 §6`, `01 §8`, `BACKEND_CONVENTIONS §13`, `12 D-013/014` | LOCKED | Payment Obligation | Payment | financial | mutable | L,A,T | DB2 | Distinct obligations (INV). |
| REQ-PAY-002 | Deposit paid only after digitizing → review → approval; 40% of accepted total. | `04 BR-005`, `03 J6` | LOCKED | Deposit Obligation | Payment | financial | mutable | L,T | DB3 | Precondition guard. |
| REQ-PAY-003 | Remaining 60% must be paid before delivery. | `04 BR-006`, `03 J7` | LOCKED | Remaining Obligation | Payment | financial | mutable | L,T | DB3 | |
| REQ-PAY-004 | Payment attempts tracked with states: PENDING, PROCESSING, SUCCEEDED, FAILED, EXPIRED, REFUNDED, PARTIALLY_REFUNDED, REQUIRES_REVIEW (provisional). | `06 §6` | LOCKED (names PROVISIONAL) | Payment Attempt | Payment | financial | append-only | L,A,T | DB3 | |
| REQ-PAY-005 | Payment callbacks/webhooks must be idempotent; handle duplicate and out-of-order callbacks. | `01 §8`, `09 §8`, `10 §4`, `BACKEND_CONVENTIONS §12,§13`, `00 §8` | LOCKED | Payment Callback Event, Idempotency Key | Payment | financial | append-only | A,T,C,I,X | DB8 | Callback event store. |
| REQ-PAY-006 | Never mark success from client redirect; verify provider signature, amount, currency, order reference server-side. | `01 §8`, `09 §8`, `BACKEND_CONVENTIONS §13`, `00 §8` | LOCKED | Verification Result | Payment | financial | append-only | A,T | DB8 | |
| REQ-PAY-007 | Preserve provider references for reconciliation; sensitive payloads redacted/never fully logged. | `09 §8`, `07 §8`, `BACKEND_CONVENTIONS §13,§18` | LOCKED | Provider Reference | Payment | security-sensitive | append-only | A,R | DB4 | |
| REQ-PAY-008 | Admin can manually reconcile payments and record manual bank-transfer review. | `01 §8`, `07 §8` | LOCKED | Reconciliation Record | Payment | financial | append-only | A,T,I | DB3 | Idempotent. |
| REQ-PAY-009 | Refund/cancellation support: record refund metadata; payment reconciliation on cancellation. | `06 §11`, `07 §8` | LOCKED (refund policy OPEN) | Refund Record | Payment | financial | append-only | L,A,T | DB3 | Policy O-009 → DEC. |
| REQ-PAY-010 | Payment method set (bank transfer, MoMo, ZaloPay) desired; provider integration open. | `01 §8`, `12 O-006` | OPEN_DECISION | Payment Method | Payment | financial | mutable | — | DB1 | Provider/webhook contract open. |

## 17. Production

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-PROD-001 | Production job references the exact approved version (or artifact cryptographically linked to it). | `04 BR-010`, `06 §8`, `07 §9`, `00 §8` | LOCKED | Production Job | Production | production-sensitive | mutable | L,A,T | DB3 | INV: production uses approved design. |
| REQ-PROD-002 | Production cannot start against an unapproved version; blocked without approved design + deposit + reservation. | `07 §9`, `06 §8` | LOCKED | Production Guard | Production | production-sensitive | mutable | L,T | DB3 | |
| REQ-PROD-003 | Production artifacts (digitized/production files) are internal, not customer-watermarked. | `04 BR-012`, `09 §5`, `07 §6` | LOCKED | Production Artifact | Production | production-sensitive | mutable | A,X | DB4 | |
| REQ-PROD-004 | Production lifecycle: started → notes → completed → move to final payment; transitions auditable. | `07 §9`, `06 §7` | LOCKED | Production State | Production | production-sensitive | append-only | L,A,T | DB3 | |

## 18. Shipping & delivery

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-SHIP-001 | Admin enters shipping fee, recipient details, carrier name, internal tracking code; marks delivered. | `01 §10`, `07 §11`, `04 BR-017`, `12 D-017` | LOCKED | Shipping Detail | Order | customer-private | mutable | A | DB4 | Fee is `financial`. |
| REQ-SHIP-002 | No shipping API, adapter, or customer shipment tracking. | `02 §2`, `04 BR-017`, `12 D-017` | LOCKED | (constraint) | Order | — | — | — | DB4 | Out of scope. |
| REQ-SHIP-003 | Shipping address/history model shape is not fully specified. | `01 §10`, `07 §11` | AMBIGUOUS | Shipping Address | Order | customer-private | mutable | R | DB2 | Address history model → DEC. |
| REQ-SHIP-004 | Delivery marked; then order completed; delivery gated on verified final payment. | `03 J8`, `06 §8` | LOCKED | Delivery State | Order | internal | append-only | L,A,T | DB3 | |

## 19. Gallery

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-GAL-001 | Gallery entries: real product images, grouping by type/style/need, short description, links to product/service, alt text, publication status, ordering. | `01 §2.3`, `07 §4`, `08 §6`, `11 Gallery` | LOCKED | Gallery Entry | Gallery | public | mutable | L | DB2 | Publish/unpublish lifecycle. |
| REQ-GAL-002 | Gallery entries carry SEO text context (not image-only). | `08 §6` | LOCKED | Gallery SEO Fields | Gallery/Content | public | mutable | — | DB2 | |

## 20. SEO & content pages

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-SEO-001 | SEO-capable page types: home, service, category, product, gallery, FAQ, local/store, landing, policies. | `08 §2`, `01 §2.1` | LOCKED | Content Page | Content | public | mutable | L | DB2 | Publication state. |
| REQ-SEO-002 | On-page fields: SEO title, meta description, canonical URL, social image, headings, alt, internal links, breadcrumb, structured data, index/noindex. | `08 §4` | LOCKED | SEO Metadata | Content | public | mutable | — | DB2 | Reused by catalog/gallery. |
| REQ-SEO-003 | Product/gallery metadata must exist outside image assets (not only in canvas). | `08 §5` | LOCKED | Text Metadata | Content | public | mutable | — | DB4 | Indexable text in DB. |
| REQ-SEO-004 | Redirect management / canonicalization support. | `08 §5` | LOCKED | Redirect Rule | Content | public | mutable | — | DB2 | |

## 21. Notifications

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-NOTIF-001 | System delivers notifications (verification, secure-link, review, payment) via a Notification module/worker. | `SYSTEM_ARCHITECTURE §5.4,§8`, `03 J4/J5` | LOCKED (channels/provider OPEN) | Notification | Notification | internal | append-only | L,I | DB3 | Idempotent delivery where duplicates matter. |
| REQ-NOTIF-002 | Notification persistence depth (log all vs transient) is not specified. | `SYSTEM_ARCHITECTURE §5.4` | MISSING_REQUIREMENT | Notification Log | Notification | internal | append-only | R | DB2 | → DEC. |

## 22. Audit events

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-AUDIT-001 | Sensitive actions logged: login, product/stock/quotation changes, design-version creation, approval, payment state changes, order transition, cancellation, refund, security-config changes. | `07 §12`, `SYSTEM_ARCHITECTURE §8`, `BACKEND_CONVENTIONS §18` | LOCKED | Audit Event | Audit | internal | append-only | A,R,X | DB3 | Immutable retention. |
| REQ-AUDIT-002 | Audit record fields: actor, action, target, before/after or relevant metadata, timestamp, reason where required. | `BACKEND_CONVENTIONS §18`, `06 §8` | LOCKED | Audit Event Detail | Audit | internal | append-only | A | DB4 | |
| REQ-AUDIT-003 | Audit logs are immutable and have a retention policy (period open). | `BACKEND_CONVENTIONS §18`, `09 §10`, `12 O-012` | LOCKED (period OPEN) | Audit Retention | Audit | internal | append-only | R,X | DB1 | Retention → DEC. |

## 23. Outbox / reliable async side effects

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-OUTBOX-001 | External side effects must not be part of a DB transaction; use outbox or equivalent reliable-delivery when a committed transaction must trigger async work. | `SYSTEM_ARCHITECTURE §11`, `BACKEND_CONVENTIONS §11` | LOCKED | Outbox Event | (cross-cutting) | internal | append-only | T,C,I,X | DB4 | Outbox table + relay. |
| REQ-OUTBOX-002 | Recoverable background jobs; record attempts and terminal failures; bounded retries; dead-letter/manual review; no exactly-once assumption. | `10 §4`, `BACKEND_CONVENTIONS §15` | LOCKED | Job Attempt, Dead Letter | (worker) | internal | append-only | I,C,X | DB8 | |

## 24. Idempotency

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-IDEM-001 | Idempotency mandatory for: payment callbacks, payment reconciliation, retried jobs, customer submission, asset-processing callbacks, notification jobs. | `BACKEND_CONVENTIONS §12`, `10 §4` | LOCKED | Idempotency Record | (cross-cutting) | internal | append-only | I,C,T,X | DB4 | Keys scoped + expired intentionally. |
| REQ-IDEM-002 | Idempotency keys and result storage must be scoped and expired intentionally. | `BACKEND_CONVENTIONS §12` | LOCKED (expiry policy OPEN) | Idempotency Expiry | (cross-cutting) | internal | temporary | R,I | DB1 | Expiry policy → DEC. |

## 25. Data retention

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-RETEN-001 | Retention policy must distinguish: temporary session, submitted request, customer upload, approved design, production file, payment record, audit log, backup. | `09 §10`, `10 §12` | LOCKED (periods OPEN) | Retention Class | (cross-cutting) | mixed | mixed | R,X | DB1 | Periods O-012 → DEC. |
| REQ-RETEN-002 | Define deletion/anonymization process for personal data. | `10 §12`, `03 J9` | LOCKED (process OPEN) | Deletion Process | (cross-cutting) | customer-private | mutable | R,X | DB1 | Soft-delete/archive policy → DEC. |

## 26. Operational: backup, restore, migration, versioning, Docker, secrets, multi-machine

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-OPS-001 | Migrations are versioned and tested; DB constraints reinforce important invariants. | `10 §10`, `BACKEND_CONVENTIONS §9,§19`, `13 §4` | LOCKED (framework OPEN) | Migration, Migration History | Ops/DB | internal | append-only | X | DB1 | Framework O-001 → DEC. |
| REQ-OPS-002 | Automated database backup; off-site backup; asset backup/replication; documented restore; periodic restore test; recovery for complete server loss. | `10 §9`, `09 §11`, `13 §4` | LOCKED (tooling OPEN) | Backup, Restore Runbook | Ops | internal | append-only | X | DB1 | Backup tool/format → DEC; runbooks DB10. |
| REQ-OPS-003 | Backups encrypted or access-controlled, stored outside the primary server; restore tested; deletion policy documented. | `09 §11` | LOCKED | Backup Security Policy | Ops | security-sensitive | append-only | R,X | DB1 | |
| REQ-OPS-004 | Reproducible Docker database setup; a clean clone must reach the correct schema version deterministically. | `SYSTEM_ARCHITECTURE §13`, `LOCAL_DEVELOPMENT §5,§6`, `10 §10` | LOCKED | Docker DB Setup | Ops | internal | mutable | X | DB6 | Postgres 16.6-alpine in Compose. |
| REQ-OPS-005 | Git is source of truth for schema/migration/seed/runbook/checkpoint history; volumes/secrets/local state are not. | DB0 task §2, `SYSTEM_ARCHITECTURE §9` | LOCKED | Git-tracked DB Artifacts | Ops | internal | append-only | X | DB1 | Governance principle. |
| REQ-OPS-006 | Shared/merged migrations are immutable; new changes create new migrations; no undocumented manual DB changes. | `BACKEND_CONVENTIONS §9`, DB0 task §4 Task F | LOCKED | Migration Immutability | Ops | internal | append-only | X | DB1 | INV (migration). |
| REQ-OPS-007 | Fresh DB must run all migrations in order; existing DB must upgrade from a supported version; Git state maps to schema state. | DB0 task §2, `10 §10` | LOCKED | Migration Ordering, Version Map | Ops | internal | append-only | X | DB6 | Verified DB7. |
| REQ-OPS-008 | Branch switching may present different migration states; incompatible local volume reuse must be avoided; failed-migration and rollback-vs-forward-fix policy required. | DB0 task Task H | OPEN_DECISION | Branch/Volume Policy, Rollback Policy | Ops | internal | mutable | X | DB1 | Forward-only vs rollback → DEC. |
| REQ-OPS-009 | `.env` git-ignored; `.env.example` documents all vars; no secrets committed; stable Docker service names/ports where practical; machine-specific overrides supported. | `LOCAL_DEVELOPMENT §3`, `.env.example`, `BACKEND_CONVENTIONS §16` | LOCKED | Env Config, Secret Policy | Ops | security-sensitive | mutable | X | DB1 | Postgres port override documented. |
| REQ-OPS-010 | All environment configuration validated at startup; production fails fast on missing mandatory config; no silent fallback for security-critical settings. | `BACKEND_CONVENTIONS §16` | LOCKED | Config Validation | Ops | security-sensitive | mutable | X | DB6 | |
| REQ-OPS-011 | Deterministic seed/fixture workflow reproducible across machines; test vs dev data separated. | `13 §4`, `BACKEND_CONVENTIONS §19` | LOCKED (strategy OPEN) | Seed, Fixture | Ops | internal | append-only | X | DB9 | Seed strategy → DEC. |
| REQ-OPS-012 | Test database strategy (isolation, teardown) for constraint/transaction tests. | `BACKEND_CONVENTIONS §19`, `13 §4` | OPEN_DECISION | Test DB Strategy | Ops | internal | temporary | X | DB1 | Testing stack open (O-001). |
| REQ-OPS-013 | PostgreSQL is the system-of-record database (version pin 16.6 present in Compose but not documented as locked). | `12 D-025`, `docker-compose.dev.yml` | CONFLICT | Postgres Version | Ops/DB | internal | mutable | X | DB1 | D-025 locks product only; version → DEC/GAP. |

## 27. Cross-cutting integrity & money

| ID | Requirement | Source | Status | Candidate concepts | Owner | Class | Mut | Flags | CP | Notes |
| -- | ----------- | ------ | ------ | ------------------ | ----- | ----- | --- | ----- | -- | ----- |
| REQ-INT-001 | Monetary values use exact decimal; no floating-point storage. | `10 §5`, `BACKEND_CONVENTIONS §5,§9` | LOCKED | Money (VO) | (cross-cutting) | financial | immutable-snapshot | — | DB4 | INV (DB-enforceable type). |
| REQ-INT-002 | Referential integrity enforced; DB constraints reinforce invariants. | `10 §5`, `BACKEND_CONVENTIONS §9` | LOCKED | FK/Constraint | (cross-cutting) | internal | — | T | DB4 | |
| REQ-INT-003 | Timestamps use a consistent UTC strategy. | `BACKEND_CONVENTIONS §5` | LOCKED | Timestamp Convention | (cross-cutting) | internal | — | X | DB1 | |
| REQ-INT-004 | IDs use stable typed conventions selected by ADR (UUID strategy open). | `BACKEND_CONVENTIONS §5` | OPEN_DECISION | ID Strategy | (cross-cutting) | internal | — | X | DB1 | UUID strategy → DEC. |
| REQ-INT-005 | Enum/status modeling: no bare strings when a defined type/enum exists; enum strategy open (DB enum vs lookup). | `BACKEND_CONVENTIONS §5,§20` | OPEN_DECISION | Enum Strategy | (cross-cutting) | internal | — | X | DB1 | Enum strategy → DEC. |
| REQ-INT-006 | Design-document JSON structure and canonical hashing strategy for integrity hashes. | `05 §3,§9`, `06 §4/§9` | OPEN_DECISION | Design Document Schema, Canonical Hash | Design | customer-private | immutable-snapshot | X | DB1 | Hash must be reproducible across machines → DEC. |

---

## 28. Status roll-up

| Status | Count |
| ------ | ----- |
| LOCKED | 118 |
| OPEN_DECISION | 7 |
| AMBIGUOUS | 2 |
| CONFLICT | 1 |
| MISSING_REQUIREMENT | 1 |
| **Total requirements** | **129** |

> Counts are the primary status of each row (`^\| REQ-` data rows). A number of
> `LOCKED` rows carry a parenthetical sub-parameter that is still open (e.g.
> "LOCKED (provider OPEN)", "LOCKED (names PROVISIONAL)"); those sub-parameters
> are additionally tracked in [`DB0_OPEN_DECISIONS.md`](./DB0_OPEN_DECISIONS.md)
> and, for provisional lifecycle names, resolved at DB3.

> Some LOCKED rows carry a parenthetical "(… OPEN)" where the requirement
> itself is locked but a sub-parameter (period, provider, expiry) is deferred;
> those sub-parameters are tracked individually in
> [`DB0_OPEN_DECISIONS.md`](./DB0_OPEN_DECISIONS.md).

## 29. Multi-machine requirements present in this matrix

Rows flagged `X` (cross-machine/recovery) include the operational set
REQ-OPS-001…013, plus REQ-ASSET-001/006/007, REQ-AUDIT-001/003, REQ-QUOT-002/004,
REQ-DVER-002/005, REQ-INT-003/004/005/006, REQ-PAY-005, REQ-OUTBOX-001/002,
REQ-IDEM-001, REQ-RETEN-001/002, REQ-SESS-001/005, REQ-GRANT-002. These are
carried into [`DB0_PORTABILITY_RECOVERY_REQUIREMENTS.md`](./DB0_PORTABILITY_RECOVERY_REQUIREMENTS.md).

## 30. Cross-references

- Domains proven covered: [`DB0_DOMAIN_COVERAGE.md`](./DB0_DOMAIN_COVERAGE.md)
- Lifecycles (`L`): [`DB0_LIFECYCLE_INVENTORY.md`](./DB0_LIFECYCLE_INVENTORY.md)
- Invariants: [`DB0_INVARIANT_INVENTORY.md`](./DB0_INVARIANT_INVENTORY.md)
- Queries: [`DB0_QUERY_CATALOG.md`](./DB0_QUERY_CATALOG.md)
- Open decisions: [`DB0_OPEN_DECISIONS.md`](./DB0_OPEN_DECISIONS.md)
- Conflicts/gaps: [`DB0_CONFLICTS_AND_GAPS.md`](./DB0_CONFLICTS_AND_GAPS.md)
