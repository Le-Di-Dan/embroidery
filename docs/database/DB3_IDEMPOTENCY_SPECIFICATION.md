# DB3 — Idempotency Specification

**Date:** 2026-07-15 · **Git HEAD:** `0563866`
**Model:** ADR-DB1-017 — DB-arbitrated record, unique `(namespace, scope
key)`, fingerprint (canonical-hash of business-relevant payload, GRD-030),
states `IN_PROGRESS → COMPLETED → cleaned`. Chung cho mọi hàng:
**In-progress behavior** = deterministic retryable "in progress" response;
**Conflict** = same key + khác fingerprint → `IDEMPOTENCY_CONFLICT` (audited);
**Cleanup** = worker sweep theo TTL class (transient retention, audited
counts); **DB4** = uniqueness handoff on `(namespace, scope_key)` (+ các
natural uniques ghi riêng). TTL class values = policy config (deferred,
CON-144).

| Operation | Namespace | Key source | Fingerprint over | Duplicate (post-complete) | Result replay | TTL class | DB8 race |
|---|---|---|---|---|---|---|---|
| Request submission | `request.submit` | server-issued submission key (session-bound) | subject, qty breakdown, design document hash | replay created request ref | request id + code | medium (`submission`) | CC-18 |
| Challenge issuance | `verification.issue` | (contact, purpose) natural | purpose | reuse open challenge | challenge ref | short (`transient-auth`) | CC-17 |
| Verification completion | `verification.verify` | (challenge) | submitted-code result only (no code stored) | replay VERIFIED | verified fact | short | CC-17 |
| Grant issuance | `grant.issue` | (request, trigger event) | scope set | replay active grant ref | grant ref | short | CC-16 |
| Quotation acceptance | `quotation.accept` | (quotation version) | version id + accepted total | replay acceptance evidence | evidence ref | case-long (`commercial-consent`) | CC-05/06 |
| Design approval | `design.approve` | (design version) | version id + document hash + terms version | replay approval snapshot | snapshot ref | case-long | CC-02/04 |
| Order creation | `order.create` | (request, approval snapshot) | accepted quotation version | replay order ref | order id/code | case-long | CC-11 |
| Payment initiation | `payment.initiate` | (obligation, client attempt key server-validated) | amount, method | replay attempt ref | attempt ref | medium | — |
| **Payment callback** | `payment.callback` | **provider event id (server-side; never client-only)** | amount, currency, business ref, status | replay applied result; contradictory content → REQUIRES_REVIEW | application outcome | **long (`payment-evidence` — ≥ dispute window)** | **CC-07/08 (critical)** |
| Manual reconciliation | `payment.reconcile` | (attempt, admin action id) | resolved state + amounts | replay reconciliation record | record ref | long | CC-09 |
| Official reservation | `inventory.reserve` | (order) | sku/qty set | replay reservation refs | reservation ids | case-long | CC-20/22 |
| Reservation release/consume | `inventory.release` / `inventory.consume` | (reservation, action) | reason class | replay ledger outcome | ledger ref | case-long | CC-21 |
| Soft hold | `inventory.hold` | (request, sku) | qty | replay hold ref | hold ref | short | CC-23 |
| Production start / complete | `production.start` / `production.complete` | (job) | approval snapshot ref | replay state | job state | case-long | CC-12 |
| Order hold / resume | `order.hold` / `order.resume` | (order, revision round) | reason / new approval ref | replay state | order state | case-long | CC-12 |
| Cancellation | `order.cancel` / `request.cancel` | (case) | stage + initiator + reason class | resume/replay saga outcome | terminal state + step results | case-long | CC-13 |
| Refund request / execute | `refund.request` / `refund.execute` | (attempt, cancellation) / (refund record) | amount | replay record/state | record ref | long | CC-09 |
| Obligation recalculation | `obligation.recalc` | (order, revision round) | old/new totals | replay recalatuion set | obligation refs | case-long | — |
| Notification intent | `notification.intent` | (source event, recipient, template) | template version + redacted params hash | collapse to one intent | intent ref | operational | CC-26 |
| Asset processing callback | `asset.inspect` / derivative jobs | (asset, job kind, attempt) | result digest | replay recorded result | result ref | operational | CC-19 |
| Outbox consumer | per consumer namespace | (outbox event id, consumer) | payload hash | skip (already consumed) | consumed marker | transient (with outbox cleanup) | CC-25 |
| Background jobs | `job.<kind>` | job id (async port) | job args hash | replay attempt outcome | attempt record | operational | CC-19/26 |

## Rules bổ sung (locked)

1. **Server-side keys cho provider callbacks** — không bao giờ chỉ dựa
   client-supplied idempotency (ADR-DB1-017 r5).
2. **Stuck IN_PROGRESS:** timeout class per namespace (config); sau timeout,
   worker/retry path được phép re-claim theo operation retry rules; mọi
   re-claim audited. Không auto-"repair" thành COMPLETED.
3. **Result payload tối thiểu** (refs + status), redacted (`§13/§18`).
4. Cross-op consistency: `payment.callback` và `payment.reconcile` chia sẻ
   kiểm tra chéo trên attempt (CC-09) — hai namespace, một aggregate row
   serialize.
5. **DB4 handoff:** unique `(namespace, scope_key)`; unique provider event
   ref; unique (request→order); unique acceptance-per-version; unique
   approval-per-version. **DB8:** mọi CC-xx ở cột cuối +
   fingerprint-conflict tests.
