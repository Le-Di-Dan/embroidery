# DB3 — Notification Lifecycle Specification

**Date:** 2026-07-15 · **Git HEAD:** `0563866`
**Baseline:** ADR-DB2-003 (intent + attempts; template ref + redacted params;
no secrets/bodies). Provider/channels vẫn open (O-005) — spec này
provider-agnostic.

## 1. Notification Intent — final states

`PENDING` (initial, tạo từ outbox event với intent-key dedup) → `PROCESSING`
(worker claimed) → `SATISFIED` (terminal) | `FAILED` (terminal, dead-letter
visible + audited) | `CANCELLED` (terminal — source event voided trước khi
gửi, ví dụ saga hủy). Diagram #17.

| TR | From→To | Actor | Guards | Effects | Idem |
|---|---|---|---|---|---|
| TR-NTF-01 | (create)→PENDING | NTF consumer (outbox) | intent-key dedup (GRD-012 `notification.intent`) | intent row (template ref + redacted params) | intent key |
| TR-NTF-02 | PENDING→PROCESSING | worker | claim | attempt spawned | job id |
| TR-NTF-03 | PROCESSING→SATISFIED | worker | attempt DELIVERED | — | attempt id |
| TR-NTF-04 | PROCESSING→PENDING | worker | attempt FAILED_RETRYABLE + retry budget còn | backoff schedule | attempt id |
| TR-NTF-05 | PROCESSING→FAILED | worker | FAILED_TERMINAL hoặc budget hết | dead-letter + admin visibility + **audit (terminal failure)** | attempt id |
| TR-NTF-06 | PENDING→CANCELLED | system | source voided | — | yes |

## 2. Delivery Attempt — append-only records

Outcome values: `DELIVERED` | `FAILED_RETRYABLE` | `FAILED_TERMINAL`. Mỗi
attempt ghi: channel, provider message ref (opaque), error class, timestamps.
Không bao giờ update attempt — retry = attempt mới (CC-26: một active attempt
per channel per intent; duplicates collapse).

## 3. Rules (locked)

1. **Completion rule:** MVP single-channel per intent → SATISFIED khi attempt
   DELIVERED. Multi-channel tương lai = all-required-channels (additive).
2. **Retry limit:** config class per intent kind (values deferred); exhausted
   → FAILED + dead-letter; manual resend = **new intent** (audited), không
   reopen intent cũ.
3. **Redaction:** params là typed references (ChallengeId, GrantId, OrderId,
   amounts hiển thị được phép); **cấm OTP/token/secure-link URL/provider
   payload** trong intent/attempt. DB7 assert không có secret-shaped fields.
4. **Audit vs operational:** intent/attempt là operational records
   (operational retention); **audit events** chỉ cho: terminal failure
   (TR-NTF-05) và các business events đã audit ở transition nguồn — không
   nhân đôi delivery log vào audit.
5. **Outbox relation:** outbox event = trigger transport (xóa sau processed);
   intent = notification domain record. Duplicate outbox delivery → một
   intent (idempotency).
6. **Retention:** operational class, duration = config (deferred); cleanup
   sweep audited (counts).

## 4. Handoff

- **DB4:** intent/attempt shapes; intent-key uniqueness; no-secret param
  structure.
- **DB7:** no-secret assertions; append-only attempts.
- **DB8:** CC-26 (duplicate delivery/retry overlap); duplicate outbox →
  single intent.
