# DB3 — Core Workflow Orchestration (Request/Design/Quotation/Order/Payment)

**Date:** 2026-07-15 · **Git HEAD:** `0563866`
**Normative inputs:** ADR-DB3-001 (ordering), ADR-DB3-002 (cancellation),
ADR-DB3-003 (revision), ADR-DB3-004 (grants). Transitions/guards/side effects
reference [`DB3_LIFECYCLE_SPECIFICATIONS.md`](./DB3_LIFECYCLE_SPECIFICATIONS.md),
[`DB3_TRANSITION_GUARD_CATALOG.md`](./DB3_TRANSITION_GUARD_CATALOG.md),
[`DB3_SIDE_EFFECT_OUTBOX_CATALOG.md`](./DB3_SIDE_EFFECT_OUTBOX_CATALOG.md).

Per-phase fields: **Auth state** = authoritative aggregate states; **Proj** =
projection/derived; **Tx** = transaction boundary; **Events** = outbox;
**Idem** = idempotency namespace; **DB8** = race cases (CC-xx).

## Phase 1 — Guest and submission (W1)

```text
Session ACTIVE → challenge ISSUED→VERIFIED → Customer created/linked
→ Request NEW (+Design Case, version DRAFT from session content)
→ Grant ACTIVE issued
```

- **Auth state:** Session (LC-07), Challenge (LC-02), Customer link, Request
  `NEW` (LC-11), Grant `ACTIVE` (LC-03).
- **Guards:** GRD-026/027 → GRD-001 → (W1 tx) GRD-002 issuance rules.
- **Tx:** TR-LC02-02 (verify+link) rồi TR-LC11-01 (request + design case +
  grant + session `SUBMITTED` + outbox) — hai transaction nối bằng verified
  fact; submission tx là atomic unit (DB2 tx candidate #1).
- **Events:** SE-002 (secure link), SE-003 (admin alert + confirmation).
- **Idem:** `verification.issue`, `request.submit`. **Audit:** verification
  result, request created. **DB8:** CC-17, CC-18.

## Phase 2 — Review and quote (W2)

```text
Request NEW→UNDER_REVIEW (→NEEDS_CLARIFICATION loop) ; Quotation DRAFT
→ version frozen+SENT → Request QUOTED
```

- **Auth:** Request (LC-11), Quotation header/version (LC-12/13).
- **Tx:** TR-LC12-02 (freeze version + header pointer + request QUOTED +
  outbox). **Events:** SE-004 quotation notification. **Idem:** resend
  replays. **Audit:** quotation sent. **DB8:** CC-28 concurrent version
  creation.

## Phase 3 — Commercial/design path (locked order, ADR-DB3-001)

```text
Customer ACCEPTS current version (step-up) → Request QUOTE_ACCEPTED
→ Admin DIGITIZING (GRD-005) → version SENT_FOR_REVIEW (GRD-004)
→ review loop (REVISION_REQUESTED → new version supersedes)
→ Customer APPROVES exact version+hash (GRD-007/008, step-up)
→ Approval Snapshot created → Order created AWAITING_DEPOSIT
   + deposit & remaining obligations (GRD-009)
```

- **Auth:** Quotation version `ACCEPTED`; Request states; Design Version
  states; Approval Snapshot exists; Order `AWAITING_DEPOSIT`; Obligations
  `PENDING` ×2.
- **Proj:** "awaiting customer" dashboard buckets (derived).
- **Tx:** acceptance tx (TR-LC12-03); send-review tx (TR-LC08-02); approval
  tx (TR-LC08-04 + snapshot); **order-creation tx (TR-LC14-01) là
  transaction riêng trong Ordering, trigger bởi approval event** — không
  distributed tx.
- **Events:** SE-004/005/006. **Idem:** `quotation.accept`,
  `design.approve`, `order.create`. **Audit:** acceptance, approval
  (critical), order creation. **DB8:** CC-02..05, CC-11.

## Phase 4 — Deposit and reservation (W4)

```text
Attempt PENDING → verified callback → deposit SATISFIED
→ Order DEPOSIT_PAID → Official Reservation RESERVED (soft hold CONVERTED)
→ production readiness (derived)
```

- **Tx:** callback tx (TR-LC16-03: attempt + callback event + obligation +
  idempotency + outbox); reservation tx (TR-LC17-04, row-locked) — **hai tx
  nối bằng deposit-verified event**.
- **Insufficient stock:** reservation không tạo; order giữ DEPOSIT_PAID với
  production blocked (GRD-015 fail); admin alert; resolve = restock hoặc
  cancel S5.
- **Events:** SE-007, reservation events. **Idem:** `payment.callback`
  (provider event id — server-side), `inventory.reserve`. **DB8:**
  CC-07/08/10, CC-20/22/23.

## Phase 5 — Production (W5)

```text
Job PLANNED (spec frozen từ exact approval) → STARTED (GRD-015/022)
→ Order IN_PRODUCTION → COMPLETED → Order PRODUCTION_COMPLETED
→ Admin issues final request → AWAITING_FINAL_PAYMENT (remaining payable)
```

- **Tx:** start tx contends on order row (CC-12); completion tx + outbox.
- **Events:** SE-009/010. **Idem:** `production.start/complete`. **Audit:**
  start/complete. **DB8:** CC-12, CC-21.

## Phase 6 — Final payment and delivery (W6)

```text
Remaining SATISFIED (GRD-016) → READY_FOR_DELIVERY
→ shipping finalized → FROZEN tại dispatch (GRD-017) → DELIVERED
→ COMPLETED (GRD-018)
```

- **Tx:** callback tx; dispatch tx (freeze + DELIVERED atomic — TR-LC14-07);
  completion tx.
- **Events:** SE-007/011; analytics emission (completed). **DB8:** CC-14/15.

## Phase 7 — Revision & cancellation

**Revision before approval:** review loop nội bộ Phase 3 — new version
supersedes (TR-LC08-05), không đụng order (chưa tồn tại).

**Revision after approval (ADR-DB3-003):**

```text
Reopen accepted → Order ON_HOLD (planned job CANCELLED)
→ new version → (new quotation version + re-acceptance nếu giá đổi)
→ new Approval Snapshot → pointer repoint + obligations recalc
  (paid deposit carried, reconciliation) + reservation recalc
→ Order resume (GRD-022 cleared)
```

**Cancellation:** stage matrix S1–S9 (ADR-DB3-002) qua saga
[`DB3_CANCELLATION_COMPENSATION_SPEC.md`](./DB3_CANCELLATION_COMPENSATION_SPEC.md):
production halt → inventory → payments → refund records → terminal states →
notify; order `CANCELLING→CANCELLED`; idempotent `order.cancel`. **DB8:**
CC-12/13, compensation retry.

## Cross-phase consistency assertions (checked at DB3)

1. Deposit math luôn có accepted total (acceptance trước digitizing).
2. Hai obligations độc lập, tạo cùng order-creation tx (INV-04).
3. Official reservation chỉ sau approval + deposit verified (INV-05).
4. Production chỉ chạy trên exact approval snapshot (INV-03) và bị chặn bởi
   ON_HOLD/CANCELLING (GRD-022).
5. Dispatch cần remaining verified + shipping frozen; completion cần
   delivered (INV-06 chain).
6. Mọi joint cross-context là event qua outbox — không distributed tx.
