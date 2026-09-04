# RB-06 — Payment reconciliation

Settling one Ready-Made bank transfer against funds actually received, and
recovering when the two do not agree.

This is the most consequential procedure in Wave 1. Read section 0 before you
touch anything.

Authority: `POST /api/admin/payment-attempts/{attemptId}/verify`,
`POST /api/admin/payment-attempts/{attemptId}/review`,
`GET /api/admin/orders/{orderId}/payments`,
`docs/implementation/reports/APP12-H04-COMPLETION-REPORT.md` section Q.

## 0. The five facts this runbook rests on

1. **Verification is the only operation that can move money state.** There is no
   force-paid endpoint, no override, no "mark as settled". If money must move,
   it moves through `Xác nhận`.
2. **`REQUIRES_REVIEW` is a durable business decision, not a failure.** The
   server answers `200`. The attempt, the reason and the reconciliation are
   committed. The Admin screen says so explicitly: *"Máy chủ đã ghi nhận thành
   công. Đây là một kết quả nghiệp vụ, KHÔNG phải lỗi hệ thống."*
3. **There is no separate "resolve review" operation, and none is needed.**
   `REQUIRES_REVIEW` is a *verifiable-from* status. You resolve it by using the
   **same** `Xác nhận` action again with the correct observed facts. The system
   records the difference for you: a verification that resolves an open review is
   written as `RESOLVE_REVIEW`, any other manual decision as `MANUAL_MATCH`.
4. **The comparison is exact.** No tolerance, no rounding, no floating point.
   The amount must equal the obligation's own frozen amount and the reference
   must equal the derived memo, character for character.
5. **Evidence is never a precondition and never a payment fact.** A correct
   payment with no screenshots verifies normally; an approved screenshot does not
   mean money arrived. The UI states this: *"Ảnh chuyển khoản là tài liệu hỗ
   trợ. Ảnh được duyệt không có nghĩa là tiền đã về."*

## Trigger

- A customer says they have paid and the order has not moved.
- An attempt is sitting at `REQUIRES_REVIEW`.
- `EmbroideryFullVerificationSystemErrors` fired
  ([RB-15 section 5](RB-15-ALERT-RESPONSE.md#5-runbook-h07-payment-verify)).
- Routine reconciliation of the bank statement against open orders.

## Preconditions

1. You have the **bank statement**, open, in front of you. Every observed value
   you type is copied from it. The observed fields are deliberately left blank
   by the UI: *"Không tự điền sẵn giá trị kỳ vọng vào đây — nếu điền sẵn, nhân
   viên chỉ còn xác nhận lại kỳ vọng của hệ thống thay vì chép lại thứ ngân
   hàng thực sự ghi nhận."*
2. You have an Admin session.
3. You are looking at the right order. A Ready-Made order carries exactly **one**
   `FULL` obligation — no deposit, no remaining balance, no 40/60 split.

## Safe observations

Everything here is read-only.

**In the Admin UI**: `https://<admin-host>/orders/<orderId>`, the *Thanh toán*
panel. It shows the obligation amount (`Số tiền phải trả`), the obligation
status (`Trạng thái nghĩa vụ`), the expected transfer memo (`Nội dung chuyển
khoản`), the current attempt and its status, any customer-supplied evidence, and
the reconciliation history (`Xem lịch sử đối chiếu`).

**Through the API**, the same facts:

```sh
curl -sS --cookie <admin session> \
  https://<admin-host>/api/admin/orders/<orderId>/payments
```

**The expected memo is derived, never stored**, so nothing can disagree with it:

```text
order code        ORD-XXXXXXXXXX
Ready-Made FULL   ORDXXXXXXXXXXFL     15 characters, fixed
custom deposit    ORDXXXXXXXXXXDC
custom balance    ORDXXXXXXXXXXRM
```

`FL` is the one to expect in Wave 1. It stays the **same across a shipping-fee
correction** — the memo names the order, not the obligation — which is exactly
what lets you reconcile a transfer that was sent before a fee was corrected.

**In the database**, if you need to be certain of the committed truth (read-only):

```sql
SELECT o.code, o.status, o.origin,
       ob.kind, ob.amount, ob.status AS obligation_status, ob.superseded_by,
       a.id AS attempt_id, a.status AS attempt_status, a.created_at
  FROM orders o
  JOIN payment_obligations ob ON ob.order_id = o.id
  LEFT JOIN payment_attempts a ON a.payment_obligation_id = ob.id
 WHERE o.code = 'ORD-XXXXXXXXXX'
 ORDER BY a.created_at DESC;
```

## Actions

### Decide which case you are in

| What you see on the statement | Case |
| --- | --- |
| Amount and memo both match exactly | **A — verify** |
| Amount or memo differs | **B — verify anyway, and let the server route it** |
| No transfer found at all, or you cannot read the memo, or there are two transfers | **C — review** |
| The attempt is already `SUCCEEDED` | **D — nothing to do** |
| The obligation is `SUPERSEDED` | **E — a fee correction happened** |

### Case A — the transfer matches

`Đối chiếu và xác nhận` → the `Xác nhận` dialog. Type, from the statement:

- `Số tiền thực nhận` — digits only, up to 12 integer and 2 decimal digits.
- `Nội dung/ghi chú chuyển khoản thực nhận` — copied exactly. No upper-casing,
  no stripping punctuation, no truncating. The value is sent exactly as typed.
- `Ghi chú của nhân viên` — mandatory, up to 2000 characters. Say what you
  matched against.

Submit. The server does the comparison, not the screen.

Equivalent API call:

```sh
curl -sS -X POST --cookie <admin session> \
  -H 'content-type: application/json' \
  -d '{"observedAmount":"<from the statement>","observedTransferReference":"<from the statement>","note":"<what you matched>"}' \
  https://<admin-host>/api/admin/payment-attempts/<attemptId>/verify
```

On a match, **all of this happens atomically or none of it does**:

```text
attempt      -> SUCCEEDED
obligation   -> SATISFIED, by that exact attempt
order        AWAITING_PAYMENT -> READY_FOR_DELIVERY
reservation  -> CONSUMED, permanently and exactly once (stock can no longer lapse)
reconciliation appended (MANUAL_MATCH, or RESOLVE_REVIEW if it resolved a review)
payment.verified emitted once
```

There is deliberately **no `PAID` order state**. "This is paid" is the
obligation's `SATISFIED`, never a second copy on the order.

### Case B — the transfer does not match

Do the same thing. Enter what the bank actually shows and submit.

The server compares and routes it to `REQUIRES_REVIEW` with your reason. You
will get `200` and a screen that says `CẦN ĐỐI CHIẾU`. Nothing was satisfied,
the order did not move, and the reservation was not consumed:

```text
attempt      -> REQUIRES_REVIEW, review_reason recorded
obligation   -> PENDING          (NOT satisfied)
order        -> AWAITING_PAYMENT (did NOT advance)
reservation  -> not consumed
reconciliation appended (MANUAL_MATCH)
```

That is a correct, committed outcome. Do not retry it hoping for a different
answer, and do not go looking for a way to force it through. Go and find out
what actually happened at the bank.

**When you have found out, resolve it with the same `Xác nhận` action** and the
correct observed facts. The dialog's own note says so: *"Khi đã đối soát xong,
mở lại đúng biểu mẫu Xác nhận, nhập số tiền và nội dung thực nhận, rồi xác
nhận."* The result:

```text
attempt      -> SUCCEEDED
obligation   -> SATISFIED
order        -> READY_FOR_DELIVERY
reconciliationAction -> RESOLVE_REVIEW   (distinguished from MANUAL_MATCH)
succeeded 1 · reservations consumed 1 · reconciliations 2 · ledger 2
```

Two reconciliations, one success, one consumed reservation. That is the shape of
a correctly recovered mismatch.

### Case C — you cannot compare yet

Use `Đưa vào cần đối chiếu` instead. This is for what the comparison cannot see:
an unreadable memo, two transfers, a statement that disagrees with the customer.

- `Lý do đưa vào đối chiếu` — mandatory.
- The two observed fields are **optional**. Leave them blank if you have not
  found a transaction: *"Bỏ trống hai ô dưới sẽ không ghi lại gì cả, thay vì ghi
  một con số bịa ra."* Never invent a zero.

There is no branch in this operation that could settle a payment. The obligation
is not satisfied, the order does not move, and no `payment.verified` is emitted.

Then resolve it later through Case B's resolution path.

### Case D — the attempt is already settled

Nothing to do. If you submit anyway you will get one of:

| Response | Meaning |
| --- | --- |
| `200` with `replayed: true` | Your earlier call **did** commit and its response was lost. The committed truth is returned and **nothing was written a second time.** |
| `409 PAYMENT_ATTEMPT_ALREADY_SETTLED` | The attempt is terminal. |
| `409 PAYMENT_OBLIGATION_NOT_PAYABLE` | Another attempt already satisfied it, or it is cancelled. |
| `409 PAYMENT_ORDER_NOT_AWAITING_PAYMENT` | The order has not reached the step this obligation is collected at. |
| `409 PAYMENT_ATTEMPT_NOT_VERIFIABLE` | Not a bank transfer, or an obligation kind this operation cannot settle. |

**Nothing changed in any of the 409 cases.** A `409` is the system protecting
the invariant, not an error to work around.

**One detail to know about a replay response, so you do not mis-record it.** A
replay returns `reconciliationAction` computed from the attempt's state *now*,
not the action that was actually written. Measured in the `APP12-H07`
rehearsal: a verification that resolved a review recorded `RESOLVE_REVIEW`, and
replaying that same call afterwards answered `MANUAL_MATCH` — while writing
nothing, and while the stored history still correctly read
`MANUAL_MATCH, RESOLVE_REVIEW`. **The reconciliation history is the record; a
replayed response is not.** Read the history when you need to know what was
recorded.

If the Admin screen showed you `PHẢN HỒI KHÔNG CHẮC CHẮN` ("Không nhận được
phản hồi cuối cùng"), that is the lost-response case: *"Máy chủ có thể đã ghi
nhận thành công rồi mới mất kết nối. Không thể kết luận là thất bại."* Reload
the order and read the committed state before doing anything else. Do **not**
assume it failed and re-verify blindly — although if you do, the replay path
protects you.

### Case E — the obligation is `SUPERSEDED`

A shipping-fee correction replaced it. Exactly one successor exists and carries
the new amount:

```text
429000.00  SUPERSEDED  -> superseded_by <successor id>
454000.00  PENDING     (exactly one successor)
order AWAITING_PAYMENT · satisfied 0 · pending 1 · consumed 0
```

Verify against the **successor**, using the amount the customer actually owes
now. The memo is unchanged. A verification against the superseded obligation is
refused with `409 PAYMENT_OBLIGATION_NOT_PAYABLE` — correctly.

## Expected state

After a correct settlement, all five must hold, and they are the invariant this
runbook is judged by:

```text
FULL obligation SATISFIED         exactly once
payment attempt SUCCEEDED         exactly once
reservation     CONSUMED          exactly once
stock decremented                 exactly once
order           READY_FOR_DELIVERY
```

Verify them together, not one at a time:

```sql
SELECT
  (SELECT count(*) FROM payment_obligations WHERE order_id = o.id AND status = 'SATISFIED') AS satisfied,
  (SELECT count(*) FROM payment_attempts a JOIN payment_obligations ob ON ob.id = a.payment_obligation_id
    WHERE ob.order_id = o.id AND a.status = 'SUCCEEDED') AS succeeded,
  (SELECT count(*) FROM inventory_reservations WHERE order_id = o.id AND status = 'CONSUMED') AS consumed,
  o.status
FROM orders o WHERE o.code = 'ORD-XXXXXXXXXX';
```

Expect `1 · 1 · 1 · READY_FOR_DELIVERY`.

## Abort condition

Stop and escalate rather than continuing if:

- The five invariants above do not hold after a `200 SUCCEEDED` — for example
  two satisfied obligations, or a satisfied obligation with no consumed
  reservation.
- Verification returns `500`. That is a `system_error`, not a refusal; the
  alert exists for exactly this. Do not retry in a loop — go to
  [RB-15 section 5](RB-15-ALERT-RESPONSE.md#5-runbook-h07-payment-verify).
- The expected memo shown by the Admin screen does not match the derived pattern
  `^ORD[A-Z0-9]{10}FL$`.
- The customer's evidence, the statement and the obligation amount describe
  three different transactions.

## Escalation condition

- Money may have been taken and cannot be settled through `Xác nhận` at all
  (every path answers `409`, and the invariants say nothing is satisfied). That
  is a genuine gap; record it and escalate. **Do not open psql.**
- A duplicate payment: the customer transferred twice. There is no refund
  operation in Wave 1. This is a business decision, made outside the system, and
  recorded in the reconciliation note.
- Verification succeeded but the reservation was not consumed. That combination
  should be impossible — they commit in one transaction. Preserve evidence and
  escalate ([RB-12](RB-12-INCIDENT-RESPONSE.md)).

## Verification

1. The Admin order screen shows `Đã xác nhận thanh toán` and the fulfilment
   panel is unlocked.
2. `GET /api/admin/orders/{orderId}/payments` reports the obligation `SATISFIED`.
3. The five-invariant query above returns `1 · 1 · 1 · READY_FOR_DELIVERY`.
4. The reconciliation history shows the full sequence, including the
   `REQUIRES_REVIEW` step if there was one. That history is the audit record;
   it is append-only and is never tidied up.
5. On the dashboard, *Are payment verifications throwing system errors?* shows
   the outcome as `success` or `refused` — never `system_error`.

## Recovery / rollback

There is none, and that is deliberate. A verification is a committed financial
fact: the ledger is append-only, `payment_reconciliations` is append-only, and
`payment.verified` has been emitted. Nothing un-verifies a payment.

A *wrong* verification is corrected the way the business corrects it — outside
the system, with a refund or an adjustment — and the reason is recorded in the
reconciliation note of the next action on that order.

## Forbidden actions

- `UPDATE payment_attempts`, `payment_obligations`, `orders` or
  `inventory_reservations` in SQL. Under any circumstances.
- Deleting a reconciliation, a ledger entry, an attempt or an evidence row.
  These are immutable commercial and audit records.
- Pre-filling the observed fields with the expected values. That converts a
  reconciliation into a rubber stamp, which is precisely the failure the blank
  fields prevent.
- Treating `REQUIRES_REVIEW` as a failure, telling the customer their payment
  failed, or retrying it hoping for a different result.
- Verifying from a screenshot. Evidence is supporting material; the bank
  statement is the fact.
- Rounding, or "close enough". The comparison is exact by design.
- Verifying an amount you have not seen on a statement.
