# DB3 — Transition Guard Catalog

**Date:** 2026-07-15 · **Git HEAD:** `0563866`
**Nature:** Conceptual guard registry. Failure codes are stable machine codes
for the API envelope (BACKEND_CONVENTIONS §6); no SQL.

Columns: **Consistency** = where the facts must be read (`tx` = inside the
transition's transaction, `lock` = with row locking, `read` = plain read
acceptable); **Ext** = external verification involved; **AuditF** = audit on
failure required (all guards audit on success via their transition).

| ID | Name | Description / required facts | Owner ctx | Inputs | Failure code (concept) | Used by | Consistency | Ext | AuditF | DB4/DB8 handoff |
|---|---|---|---|---|---|---|---|---|---|---|
| GRD-001 | Verified customer before submission | just-verified contact links/creates Customer (ADR-DB2-001 r5) | CUS | challenge result, contact | `CUSTOMER_NOT_VERIFIED` | TR-LC02-02, TR-LC11-01 | tx | no | yes (abuse signal) | DB8 CC-17/18 |
| GRD-002 | Grant active + scope match | grant ACTIVE, not expired/revoked, scope covers action, request match (INV-08) | CUS | token, action, request | `GRANT_INVALID` | all customer secure actions | **tx** (revoke wins, CC-16) | no | yes | DB8 CC-16 |
| GRD-003 | Step-up re-verification valid | completed challenge within step-up window for sensitive set (ADR-DB3-004 r4) | CUS | challenge ref, window config | `REVERIFICATION_REQUIRED` | accept, approve, pay, contact/shipping change, reopen, cancel≥S5 | tx | no | yes | DB8 CC-16/17 |
| GRD-004 | Single active review | no other version of the case in SENT_FOR_REVIEW (INV-16) | DSN | case versions | `REVIEW_ALREADY_ACTIVE` | TR-LC08-02 | tx + **DB partial unique** | no | no | DB4 partial unique; DB8 CC-03 |
| GRD-005 | Quotation accepted before digitizing | request = QUOTE_ACCEPTED (ADR-DB3-001 r1) | ORD | request state | `QUOTE_NOT_ACCEPTED` | TR-LC11-07 | tx | no | no | DB7 transition test |
| GRD-006 | Acceptance binds exact current version | version SENT, is current, not expired/superseded (ADR-DB3-001 r4) | QUO | version id/state | `QUOTE_VERSION_STALE` | TR-LC12-03 | tx | no | yes | DB8 CC-05/06 |
| GRD-007 | Approval binds exact version + hash | version SENT_FOR_REVIEW; submitted (id, document hash) match stored (BR-010/INV-03 origin) | DSN | version id, hash | `APPROVAL_VERSION_MISMATCH` | TR-LC08-04 | tx | no | yes | DB7 hash link; DB8 CC-02/04 |
| GRD-008 | Effective agreement accepted | required agreement types have PUBLISHED+effective version; content hash matches; acceptance captured (GAP-09 DB3) | CNT→DSN | agreement version, hash | `TERMS_NOT_ACCEPTED` | TR-LC08-04 | tx (read effective set) | no | yes | DB4 snapshot fields |
| GRD-009 | Order creation gate | approval snapshot exists + current quotation version ACCEPTED + no existing order for request (INV-19) | ORD | approval, quotation, request | `ORDER_PRECONDITION_FAILED` / `ORDER_EXISTS` | TR-LC14-01 | tx + **DB unique (request→order)** | no | yes | DB4 unique; DB8 CC-11 |
| GRD-010 | Deposit payable post-approval | obligation exists via order (BR-005) | PAY | order/obligation | `DEPOSIT_NOT_PAYABLE` | TR-LC16-01 (deposit) | tx | no | no | DB7 |
| GRD-011 | Provider verification | signature, amount, currency, business reference verified server-side (REQ-PAY-006, INV-15) | PAY | callback payload | `PAYMENT_VERIFICATION_FAILED` | TR-LC16-03/04 | tx | **yes** | yes (REQUIRES_REVIEW path) | DB8 CC-07/08 |
| GRD-012 | Duplicate suppression (idempotency claim) | (namespace, scope key) claim per ADR-DB1-017; fingerprint check GRD-030 | PLT | key, fingerprint | `DUPLICATE_OPERATION` (replay) | all idempotent ops | tx + **DB unique** | no | no | DB4 unique; DB8 all races |
| GRD-013 | Official reservation gate | approval exists + deposit obligation SATISFIED (INV-05) | INV | order facts | `RESERVATION_NOT_ELIGIBLE` | TR-LC17-04 | tx | no | yes | DB8 CC-22 |
| GRD-014 | Sufficient stock | available ≥ requested under row lock; never negative (INV-18) | INV | stock row, qty | `INSUFFICIENT_STOCK` | TR-LC17-01/04 | **lock** | no | yes (alert) | DB4 check; DB8 CC-20 |
| GRD-015 | Production start gate | exact approval snapshot ref + deposit SATISFIED + reservation RESERVED + order DEPOSIT_PAID (INV-06) | PRD/ORD | order, job, reservation | `PRODUCTION_BLOCKED` | TR-LC18-02/TR-LC14-03 | tx (order row) | no | yes | DB8 CC-12 |
| GRD-016 | Final payment before dispatch | remaining obligation SATISFIED (BR-006) | ORD | obligation | `FINAL_PAYMENT_PENDING` | TR-LC14-06/07 | tx | no | no | DB8 CC-14 |
| GRD-017 | Shipping frozen at dispatch | shipping detail complete + frozen in dispatch tx (ADR-DB2-002) | ORD | shipping detail | `SHIPPING_NOT_READY` | TR-LC14-07 | tx | no | no | DB7 frozen immutability; DB8 CC-15 |
| GRD-018 | Delivery before completion | order DELIVERED (REQ-ORD-005) | ORD | order state | `NOT_DELIVERED` | TR-LC14-08 | tx | no | no | DB7 |
| GRD-019 | Transition legality (no backward) | (generic) only transitions in the LC spec are valid; server-side (REQ-ORD-003) | each owner | from/to states | `INVALID_TRANSITION` | every transition | tx | no | yes (attempted invalid = audited) | DB7 representation test |
| GRD-020 | Cancellation stage policy | stage matrix S1–S9 permits initiator+action (ADR-DB3-002) | ORD | order/request stage, initiator | `CANCELLATION_NOT_ALLOWED` | TR-LC11-11, TR-LC14-11, saga steps | tx | no | yes | DB8 CC-13 |
| GRD-021 | Refund approval | amount ≤ refundable per policy config; reconciled against attempts; reason present | PAY | refund record, attempts | `REFUND_INVALID` | TR-LC20-02 | tx | no | yes | DB7 reason req |
| GRD-022 | Revision hold clear | order not ON_HOLD/CANCELLING; resume gates met (ADR-DB3-003 r5) | ORD | order state, new approval/acceptance | `ORDER_ON_HOLD` | TR-LC14-03/10, TR-LC18-02 | tx (order row) | no | no | DB8 CC-12 |
| GRD-023 | Negative-stock override | explicit admin override + mandatory reason on stock adjustment only (`07 §10`) | INV | adjustment, reason | `OVERRIDE_REASON_REQUIRED` | stock adjustments | tx | no | yes | DB7 reason; DB4 check interplay |
| GRD-024 | Immutable-record mutation rejection | UPDATE/DELETE on immutable/append-only rejected (defense-in-depth, ADR-DB1-010) | all owners | — | `IMMUTABLE_RECORD` | (defense, not a transition) | **DB trigger + app** | no | yes (incident) | DB4 triggers; DB7 generic test |
| GRD-025 | Actor authorization | actor class (admin/customer-via-grant/system) allowed for the transition | each owner | actor, transition | `FORBIDDEN` | every transition | tx | no | yes | DB7 |
| GRD-026 | Challenge rate/attempt limits | issuance cooldown + attempt limits per config (ADR-DB3-004 r10) | CUS | counters, config | `RATE_LIMITED` | TR-LC02-01/02 | tx | no | yes (abuse) | DB8 CC-17 |
| GRD-027 | Session active | session ACTIVE, not expired; autosave revision marker current | DSN | session, marker | `SESSION_EXPIRED` / `STALE_WRITE` | TR-LC07-02/03 | tx | no | no | DB8 CC-01 |
| GRD-028 | Template published | clone source template PUBLISHED (GAP-08) | DSN | template state | `TEMPLATE_NOT_AVAILABLE` | session clone | read | no | no | DB7 clone independence |
| GRD-029 | Outbox exclusive claim | single relay claims an event (at-least-once downstream) | PLT | event row | (internal) | TR-LC22-02 | **lock** (skip-locked direction) | no | no | DB8 CC-25 |
| GRD-030 | Idempotency fingerprint match | same key + different fingerprint → conflict (ADR-DB1-017 r2) | PLT | fingerprint | `IDEMPOTENCY_CONFLICT` | all idempotent ops | tx | no | yes | DB8 fingerprint tests |

Notes: GRD-019/024/025 là generic guards áp cho mọi transition (đã khai báo
trong lifecycle master); failure codes là concept — final code set thuộc
backend contract checkpoint, không đổi ngữ nghĩa guard.
