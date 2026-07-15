# DB3 — Cancellation & Compensation Specification

**Date:** 2026-07-15 · **Git HEAD:** `0563866`
**Normative policy:** ADR-DB3-002 (stage matrix S1–S9). Cancellation là
**orchestration (saga)**, không phải một status write. Không distributed
transaction: mỗi bước là một tx trong context sở hữu, nối bằng outbox events,
resumable + idempotent (`order.cancel`/`request.cancel`).

## 1. Operation taxonomy (phân biệt bắt buộc)

| Operation | Target | Semantics |
|---|---|---|
| Cancel Request | Custom Request | case chết trước khi có order (S1–S3) hoặc song song order-cancel |
| Cancel Order | Order | fulfillment chết (S4–S8); order `CANCELLING→CANCELLED` |
| Void Quotation (version) | Quotation Version | version DRAFT→VOID / open SENT→SUPERSEDED-or-VOID theo saga |
| Void Design Version | Design Version | DRAFT→VOID (admin, never-sent only) — không thuộc saga tiền bạc |
| Release Reservation | Official Reservation | RESERVED→RELEASED + ledger (reasoned) |
| Cancel/Pause Production | Production Job | PLANNED/STARTED→CANCELLED (reason) ; pause = order ON_HOLD, không phải job state |
| Refund Payment | Refund Record | PENDING_REVIEW→APPROVED→EXECUTED (manual transfer recorded) |
| Mark Requires Review | Payment Attempt | contradiction/manual case escalation |

## 2. Saga shape

```text
Trigger (customer secure-flow ≥S5 cần step-up; admin console; reason bắt buộc)
→ GRD-020 stage check → [manual review nếu stage yêu cầu: cancellation
request APPROVED/DENIED bởi admin]
→ Order → CANCELLING (tx, audited, reason)
→ Step 1: Production halt   — job CANCELLED (nếu có) [PRD tx]
→ Step 2: Inventory         — release holds/reservations hoặc consume theo
  admin reasoned decision (S6/S7) [INV tx, ledger entries]
→ Step 3: Payments          — obligations CANCELLED; attempts reconciled;
  contradictions → REQUIRES_REVIEW [PAY tx]
→ Step 4: Refund records    — tạo PENDING_REVIEW cho mọi khoản trả lại
  (default theo stage config) [PAY tx]
→ Step 5: Terminal writes   — Order CANCELLED; Request CANCELLED; quotation
  header CANCELLED + open versions closed [ORD/QUO tx]
→ Step 6: Notify (SE-012) + grant disposition (auto-revoke sau grace window)
→ Audit xuyên suốt (SE-019 per step)
```

## 3. Per-stage execution table

(Disposition defaults per ADR-DB3-002; đây là execution detail.)

| Stage | Manual review? | Steps executed | Refund records | Idempotency | Terminal |
|---|---|---|---|---|---|
| S1/S2 | no | 5,6 | none | `request.cancel` | Request CANCELLED (+quote VOID ở S2) |
| S3 | no | 2(soft hold),5,6 | none | `request.cancel` | Request CANCELLED |
| S4 | no | 1(planned),2(soft hold),3,5,6 | none (nothing paid) | `order.cancel` | Order+Request CANCELLED |
| S5 | **yes** (customer-initiated) | 1(planned),2(release reservation),3,4,5,6 | deposit theo default: refundable − digitizing fee; admin quyết định số | `order.cancel` | CANCELLED + refund flow |
| S6 | **yes** | 1(job CANCELLED),2(release/consume per admin),3,4(nếu override),5,6 | default non-refundable; override reasoned | `order.cancel` | CANCELLED |
| S7 | **yes** | 2(consume),3,4(nếu thương lượng),5,6 | default non-refundable | `order.cancel` | CANCELLED |
| S8 | admin-only | 2(per decision),3,4(remaining refundable default),5,6 | remaining refund record | `order.cancel` | CANCELLED |
| S9 | — | **saga không chạy** | refund records ad hoc (manual ops) nếu admin cấp | n/a | order giữ DELIVERED/COMPLETED |

## 4. Failure & retry semantics

1. Mỗi step idempotent (namespace ở [`DB3_IDEMPOTENCY_SPECIFICATION.md`](./DB3_IDEMPOTENCY_SPECIFICATION.md));
   saga resumable từ step kế tiếp chưa hoàn thành (step results ghi nhận qua
   events + trạng thái các aggregate đích — không cần saga-state table riêng;
   DB4 có thể thêm nếu cần vận hành, không bắt buộc).
2. Step fail → retry bounded; exhausted → admin alert; order **ở lại
   CANCELLING** (không bao giờ nửa-CANCELLED); DB8 test compensation-retry.
3. Race với payment callback đang bay (CC-13/CC-09): callback áp dụng trước
   → saga step 3 nhìn thấy SATISFIED và tạo refund record tương ứng; saga
   commit trước → late callback không regress, contradiction →
   REQUIRES_REVIEW.
4. Race với production start (CC-12): order-row lock quyết định; start sau
   CANCELLING fail.
5. Mọi bước có audit (actor, reason, before/after refs); customer-visible
   reason tách khỏi internal reason (`06 §11`).

## 5. DB4 / DB7 / DB8 handoff

- DB4: reason fields (internal + customer-visible), refund record shape,
  cancellation-request record (manual review), CANCELLING state trong order
  CHECK set.
- DB7: reason-required constraints; terminal-state transition tests.
- DB8: CC-12, CC-13 (saga retry, callback race), refund-vs-callback (CC-09).
