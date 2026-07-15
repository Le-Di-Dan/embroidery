# DB3 — Shipping Fee & Freeze Specification

**Date:** 2026-07-15 · **Git HEAD:** `0563866`
**Baseline:** ADR-DB2-002 (Order-owned detail, mutable → frozen at dispatch;
no MVP address book; recipient may differ from customer). No columns here.

## 1. Fee lifecycle (locked)

1. **Quoted fee:** shipping fee là một pricing input trong Quotation Version
   (BR-004), frozen trong version khi SENT (INV-02). Accepted total (gồm fee)
   là cơ sở 40/60.
2. **Adjusted fee before dispatch:** admin có thể sửa fee trên Shipping
   Detail khi còn `EDITABLE`.
   - **Fee tăng so với accepted quotation:** yêu cầu **customer
     acknowledgement qua secure flow** = quotation revision (new version) +
     re-acceptance (ADR-DB3-001 r4) **hoặc**, nếu chỉ fee đổi sau khi order
     tồn tại, một acknowledgement record tương đương gắn order (evidence
     append-only) — chọn lối quotation-revision khi trước order; lối
     order-acknowledgement khi order đã tồn tại. Remaining obligation được
     **recalculated** (`obligation.recalc`, SUPERSEDED + new) theo chênh lệch.
   - **Fee giảm:** admin ghi nhận (audited); remaining recalculated; không
     cần acknowledgement (có lợi cho khách) nhưng vẫn notify.
3. **Final fee frozen** trong Shipping Snapshot tại dispatch; hai snapshot
   (quotation version, shipping) tồn tại song song by design; nếu lệch, giá
   trị thanh toán = obligations hiện hành (đã recalculated + acknowledged) —
   không bao giờ đọc lại live fee.

## 2. Freeze mechanics (locked)

- **Freeze point:** trong dispatch tx (TR-LC14-07): validate GRD-016 (final
  payment) + shipping detail đầy đủ → detail `EDITABLE→FROZEN` + order
  `DELIVERED` atomic. GRD-017.
- **Editors before freeze:** admin only (`07 §11`); customer change requests
  = sensitive action (ADR-DB3-004) do admin apply; mọi edit audited
  (before/after summary).
- **After freeze:** mọi UPDATE bị reject (GRD-024, DB trigger tại DB4/DB6).
  Corrections = compensating transition event/note trên order (audited,
  reason) — địa chỉ sai sau dispatch là sự kiện vận hành, không phải data
  edit.
- **Cancellation relationship:** S8 cancel trước dispatch → detail chưa
  frozen, saga xử lý bình thường; S9 (sau dispatch) không cancel — freeze là
  ranh giới đó.
- **No address book MVP** (tái khẳng định); pickup/no-shipping: detail
  optional, fulfillment-method note (DB2), không state machine riêng.

## 3. Handoff

- **DB4:** fee fields (numeric, `_amount`), frozen-form structure +
  trigger, acknowledgement evidence record, edit-audit before/after shape.
- **DB7:** frozen mutation rejection; fee-recalc reason/evidence constraints.
- **DB8:** CC-15 freeze-vs-edit; CC-14 dispatch-vs-payment.
