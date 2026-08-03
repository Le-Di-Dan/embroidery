# DB3 → DB4 Handoff

**Date:** 2026-07-15 · **Git HEAD:** `0563866`
**Rule:** DB4 thiết kế logical schema từ spec này; DB3 không physical
implementation. Baselines giữ nguyên: single `public` schema, naming
(ADR-DB1-006), text + CHECK statuses (ADR-DB1-008), IDs (ADR-DB1-007), no
binary (INV-10), exact money (INV-11).

## 1. Final state sets (per CHECK constraints — ADR-DB1-008)

| Lifecycle | Final states |
|---|---|
| Admin Account / Session | ACTIVE, LOCKED, DISABLED / ACTIVE, EXPIRED, REVOKED |
| Verification Challenge | ISSUED, VERIFIED, FAILED, EXPIRED, CANCELLED |
| Secure Grant | ACTIVE, EXPIRED, REVOKED |
| Product/Category/Gallery/Content/Template publication | DRAFT, PUBLISHED, ARCHIVED |
| Asset / Derivative | UPLOADED, INSPECTING, ACCEPTED, REJECTED, DELETION_PENDING, DELETED / PENDING, PROCESSING, READY, FAILED |
| Design Session | ACTIVE, SUBMITTED, EXPIRED, DELETED |
| Design Version | DRAFT, SENT_FOR_REVIEW, REVISION_REQUESTED, APPROVED, SUPERSEDED, VOID |
| Custom Request | NEW, UNDER_REVIEW, NEEDS_CLARIFICATION, QUOTED, QUOTE_ACCEPTED, DIGITIZING, DESIGN_REVIEW, APPROVED, REJECTED, CANCELLED |
| Quotation header | DRAFT, SENT, ACCEPTED, EXPIRED, REJECTED, CANCELLED |
| Quotation version | DRAFT, SENT, ACCEPTED, SUPERSEDED, EXPIRED, REJECTED, VOID |
| Order | AWAITING_DEPOSIT, DEPOSIT_PAID, IN_PRODUCTION, PRODUCTION_COMPLETED, AWAITING_FINAL_PAYMENT, READY_FOR_DELIVERY, DELIVERED, COMPLETED, ON_HOLD, CANCELLING, CANCELLED |
| Payment Obligation | PENDING, SATISFIED, CANCELLED, SUPERSEDED |
| Payment Attempt | PENDING, PROCESSING, SUCCEEDED, FAILED, EXPIRED, REFUNDED, PARTIALLY_REFUNDED, REQUIRES_REVIEW |
| Soft Hold / Reservation | HELD, CONVERTED, RELEASED, EXPIRED / RESERVED, CONSUMED, RELEASED, EXPIRED |
| Production Job | PLANNED, STARTED, COMPLETED, CANCELLED |
| Shipping Detail | EDITABLE, FROZEN |
| Refund Record | PENDING_REVIEW, APPROVED, EXECUTED, REJECTED |
| Outbox Event | PENDING, DISPATCHED, FAILED, DEAD_LETTER |
| Idempotency Record | IN_PROGRESS, COMPLETED |
| Notification Intent / Attempt outcome | PENDING, PROCESSING, SATISFIED, FAILED, CANCELLED / DELIVERED, FAILED_RETRYABLE, FAILED_TERMINAL |
| Agreement Version | DRAFT, PUBLISHED, SUPERSEDED, WITHDRAWN |
| Customer Merge process | REQUESTED, EXECUTED, REJECTED |
| Review Decision outcome | APPROVE, REQUEST_REVISION |

Transition IDs (TR-*) là legality reference cho DB7 tests; DB4 không encode
transition legality vào CHECK (chỉ value sets).

## 2. Candidate DB constraints (design at DB4)

**Uniqueness:** (namespace, scope_key) idempotency; provider event ref;
request→order; acceptance-per-quotation-version; approval-per-design-version;
partial-unique single-active-review per design case; one active verified
link per contact point; one open challenge per (contact, purpose); one
active grant per (customer, request); one SKU Stock per SKU; reservation per
order (per SKU line); one effective Agreement Version per agreement; human
codes (request/order/quotation); hashed grant token.

**Checks:** non-negative stock quantities; positive money/quantity where
required; status value sets (§1); percentage bounds.

**Immutable/append-only categories (reject-mutation triggers per
ADR-DB1-010):** design versions (once sent/approved), approval snapshots,
quotation versions (once sent), order items, frozen shipping details,
production specifications, agreement versions (once published); append-only:
inventory ledger, audit events, payment callback/reconciliation/refund
records, order transition events, review decisions, moderation/production
notes, delivery attempts, verification attempts, job attempts, merge
history. Column-scoped exceptions: outbox dispatch metadata; idempotency
record state; notification intent status.

## 3. Required fields per spec

- **References:** order→(customer, request, accepted quotation version,
  current approval snapshot, reservations, obligations, production jobs);
  production job→(order, approval snapshot + hash); approval snapshot→
  (version, hashes, terms refs per type, contact snapshot); attempts→
  obligation (allocation); refunds→attempt; merge history→(survivor, loser).
- **Timestamps:** created/updated per ADR-DB1-006; expiry timestamps
  (challenge, grant, session, quotation validity, holds, reservations,
  idempotency, step-up window); freeze timestamp (shipping); state-change
  timestamps qua transition events.
- **Reason fields:** required-with-R per audit spec (cancel, hold, void,
  withdraw, override, release, reconcile, refund decisions, merge) — nullable
  columns + app-enforced R (+ DB check candidates where always-required).
- **Actor refs:** admin id / customer id + grant id / system job id trên
  transition events + audit.
- **Hash linkage:** document/preview hashes (`sha256:<hex>`), agreement
  content hash, production spec hash link.
- **Fingerprints:** idempotency fingerprint field.
- **Money exactness:** numeric only; obligations carry amounts + kind
  (deposit/remaining); recalculation chains (SUPERSEDED refs).
- **Shipping freeze:** EDITABLE/FROZEN + frozen-at + trigger on frozen form;
  fee-change acknowledgement evidence record.
- **Cancellation/refund:** cancellation-request record (manual review),
  internal + customer-visible reasons, refund records per LC-20.
- **Outbox:** immutable payload vs mutable dispatch metadata tách bạch.
- **Merge history:** append-only record + merged-into pointer.

## 4. Explicit non-goals for DB4

Không encode transition matrices vào DB; không FK từ COP sang SKU/stock
(INV-13); không analytics tables (GAP-11); không notification body storage;
saga-state table optional (spec không yêu cầu).

---

## Forward note — `APP3-G02` (IMP-D042, 2026-08-03)

**LC-24 needs no new column.** The delivered `design_templates` header
already carries `status` (CHECK `DRAFT|PUBLISHED|ARCHIVED`),
`current_version`, `archived_at` and the nullable scope FKs, and
`design_template_versions` already carries `version` plus a **nullable**
`published_at` — exactly the shape `TR-LC24-02` sets once and
`TR-LC24-03` must never clear. **`G02_DB_CONTRIBUTION = NONE`**: no
many-to-many template↔product relation is added, because APP3 publishes
area-scoped Templates only and compares scope by exact triple equality.

**LC-04 `TR-LC04-06`** likewise needs no column — `status` and
`archived_at` already exist and `APP2-B02` already writes them from
`DRAFT`.

`APP3-DB01` still runs, but only because `APP3-G01` requires it
(`G01_DB_DISPOSITION = REQUIRES_APP3_DB01`, placement retirement authority).
