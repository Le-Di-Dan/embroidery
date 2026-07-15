# DB3 — Customer Verification & Merge Specification

**Date:** 2026-07-15 · **Git HEAD:** `0563866`
**Baseline:** ADR-DB2-001 (Option A) + ADR-DB3-004 (step-up). No unique
constraint design here (DB4).

## 1. Verification challenge lifecycle

Per LC-02 (final states ISSUED/VERIFIED/FAILED/EXPIRED/CANCELLED):

- **Purposes:** `submission` (tạo/link Customer) và `step-up` (sensitive
  actions). Một open challenge per (contact, purpose); challenge mới
  CANCELLED challenge cũ.
- **Attempt limits/cooldown:** config classes (values deferred — CON-144);
  vượt limit → FAILED + lockout window + abuse signal (`09 §7`), audited.
- **Expiry:** explicit expires_at (config); sweep marks EXPIRED.
- **Secrets:** code/OTP chỉ tồn tại trong challenge store (hashed/opaque
  direction — DB4 security design); không bao giờ trong notification records
  (ADR-DB2-003) hay logs.

## 2. Successful verification → Customer creation/link (locked recap)

Trong TR-LC02-02 (purpose=submission): normalize contact (CON-163/164) → nếu
tồn tại **active verified link** cho contact đó → attach vào Customer hiện
hữu; ngược lại tạo Customer mới + Contact Point verified. Mọi link/create
audited. Race CC-17: contact-link row lock → một link duy nhất.

## 3. Duplicate candidate detection (không auto-merge)

- Hệ thống **được phép** flag "possible duplicate" (heuristic trên
  normalized contacts/tên) như **admin-visible signal** — không bao giờ tự
  merge (ADR-DB2-001 r5/8).
- Signal là operational read; không ảnh hưởng lifecycle nào.

## 4. Admin merge — exceptional workflow (final)

**Process states:** `REQUESTED → EXECUTED | REJECTED` (admin-only, reason
bắt buộc cả hai nhánh).

- **Preconditions (GRD-025 + merge-specific):** hai Customer phân biệt;
  admin xác nhận cùng một người thật (evidence ghi trong reason); không
  merge đang chạy cho một trong hai (CC-27 lock ordered).
- **Execution semantics (một orchestrated use case, từng bước audited):**
  1. Chọn **survivor** (admin); loser đánh dấu merged-into (tombstone
     pointer, không xóa row — lịch sử giữ).
  2. **Ownership transfer:** requests/orders/design cases/quotations/
     obligations đang tham chiếu loser CustomerId → repoint sang survivor
     (identity reference move; **snapshots bất biến giữ nguyên contact
     snapshot cũ** — evidence không viết lại).
  3. **Contacts:** verified contacts của loser chuyển sang survivor (unique
     active-link giữ vững); conflicts (cùng contact ở cả hai) resolve về một
     link, audited.
  4. **Secure grants:** mọi grant ACTIVE của loser → REVOKED (reason:
     merge); reissue cho survivor per request cần thiết (SE-002).
  5. **Merge record:** append-only (survivor, loser, actor, reason,
     before/after refs) — DB4 shape "customer merge history".
- **Conflict handling:** nếu bước transfer gặp case đang trong tx khác
  (CC-27), merge tx lock ordered cả hai customer rows — serialize; in-flight
  actions sau merge đọc mapping mới.
- **Idempotency:** `customer.merge` per (survivor, loser); replay trả merge
  record.

## 5. Anonymization/retention interplay (locked direction)

- Anonymization scrubs **live PII** (Customer/Contact/Shipping mutable
  holders) theo retention class; **immutable snapshots giữ contact snapshot**
  làm commercial evidence — quy tắc privacy: snapshot fields được phép
  redact-in-place **chỉ** qua break-glass privacy procedure (ADR-DB1-010
  break-glass, audited) khi có yêu cầu pháp lý thực tế; mặc định giữ.
  (Đây là điểm còn business/privacy input — deferred #16 DB2 handoff, có
  owner; default-safe = giữ evidence.)
- Merged-loser row bị anonymize theo cùng lịch survivor (không sớm hơn).

## 6. Re-verification triggers (GAP-12 — resolved)

Sensitive set final (ADR-DB3-004 r4): submission (inherent), quotation
acceptance, design approval, payment initiation, contact change, shipping
change request, reopen approved design, customer cancellation ≥S5. Step-up
window + limits = config values (deferred).

## 7. Handoff

- **DB4:** merge history record, merged-into pointer, one-open-challenge và
  one-active-verified-link uniqueness candidates, challenge attempt counters.
- **DB7:** no-plaintext secrets; link uniqueness.
- **DB8:** CC-17 (concurrent verify), CC-27 (merge race), CC-16 (grants).
