# APP12-U01-C1 — Completion Report (continuation: F1 · F2 · F3 · F4)

Qualifier: `APP12-U01-C1-CONTINUATION`. This report does not create a new correction id,
a new checkpoint, or a U01-C2.

## A. Verdict

```text
APP12-U01-C1 = COMPLETE — AWAITING_PO_REVIEW
APP12-U01    = COMPLETE_AFTER_C1 — AWAITING_PO_REVIEW

F1 = PASS    F2 = PASS    F3 = PASS    F4 = PASS

APP12-E01 = NEXT — NOT_EXECUTED       APP12-R01 = NOT_AUTHORIZED
NO_U01_C2 = true    PRODUCTION_DEPLOYED = false    PUSHED = false
```

No client money recomputation, no lifecycle regression, no `ORDER_ACCESS` security
regression, no invented notification, no API/migration/route drift, shared dev unchanged,
disposable teardown clean.

## B. Existing U01 lifecycle evidence reconciliation

The Human PO accepted the PO-assisted journey recorded in
`APP12-U01-C1-PREPARATION-REPORT.md` §P as passed evidence:

```text
READY_MADE → COMPLETED        PASS    real email OTP           PASS
ORDER_ACCESS                  PASS    shipping fee             PASS
FULL payment instruction      PASS    Admin UAT verification   PASS
reservation consumed once     PASS    dispatch / completion    PASS
REAL_BANK_TRANSFER_SUBMITTED = false   REAL_PAYMENT_SUBMITTED = false
PHONE_SMS_VERIFICATION_PRESENT = false
```

This continuation changes presentation and copy only. It touches no lifecycle, fee,
obligation, reservation, verification, inventory, dispatch or completion code, so that
evidence remains valid. §H shows the file list, and it contains no API, worker, database
or generated-client file.

## C. Human-PO continuation authority

On 2026-09-10 the PO ruled that live-UAT defects found while C1 is open are fixed inside
C1:

```text
APP12-U01-C1 = CONTINUATION_AUTHORIZED    U01_CORRECTION_USED = 1/1    NO_U01_C2 = true
```

| Finding | PO severity | Disposition |
|---|---|---|
| F1 | BLOCKING_BUSINESS_TRUTH | must fix |
| F2 | BLOCKING_BUSINESS_TRUTH | must fix |
| F3 | BUSINESS_TRUTH_COPY | fix the copy; do not invent a notification |
| F4 | MINOR_BUT_REAL_BUSINESS_COPY | must fix |

## D. F1 Admin merchandise correction

**Defect.** `ready-made-order-columns.tsx` passed `order.totalAmount` as
`merchandiseAmount`. Once the fee is confirmed, that total includes shipping, so
"Tiền hàng (đã chốt)" showed 240.000 against a frozen goods figure of 210.000.

**Fix.**
- A new file, `model/ready-made-merchandise.ts`, adds `readyMadeMerchandiseOf(order)`. It
  returns the single line's `lineTotalAmount`. The Admin detail already publishes that
  value as "the accepted line total, transported exactly as stored".
- An order that does not have exactly one line gets `undefined`, which renders `—`.
- There is no `totalAmount − fee`, no `unitPrice × quantity`, no sum over lines, and no
  `Number`/`parseFloat`.
- The settled-stage card (`BR-028`) used to show only the frozen fee. It now shows three
  server figures side by side: goods (line total), fee (stored fee), and total (the
  `FULL` obligation's `expectedAmount`).

`BLOCKED_CONTRACT_GAP_F1` does not apply, because the frozen value was already delivered.

## E. F2 customer terminal amount correction

**Defect.** The amount card fell back to "Có sau khi xưởng xác nhận phí giao hàng" whenever
the payment block was off screen. That included `READY_FOR_DELIVERY` and `DELIVERED`, after
payment. At `COMPLETED` the block was empty.

**Fix.** A new pure function, `amountHighlightOf` (`model/order-access-state.ts`), picks
what the highlight shows:

```text
PAYABLE      showsTotal && full present   → full.fullPaymentAmount (live obligation, copy button)
SETTLED      order.payment.status = SATISFIED → order.payment.payableTotal, "Tổng đã thanh toán"
PENDING_FEE  status = AWAITING_SHIPPING_FEE   → the pending sentence (its one true state)
NONE         anything else (cancelled, expired, the instant before the FULL read lands)
```

- Whenever the card is not asking for money, its title changes from "Số tiền cần thanh
  toán" to "Số tiền đơn hàng".
- A settled total has no copy button, because there is nothing to transfer.
- Two keys were added to `orders.json`: `amount.summaryTitle` and `amount.settledLabel`.

**Money authority.** The amount comes from `publicReadyMadeOrder_current`, the first
choice in the PO's order of preference. See §H.

`BLOCKED_CONTRACT_GAP_F2` does not apply. No query enablement changed: the FULL read,
the QR and initiation stay confined to `AWAITING_PAYMENT`.

## F. F3 payment-link copy reconciliation

**Canonical check.**
- `docs/0*.md`, `architecture/`, `adr/`, `design/` and the APP12 phase plan were searched
  for any requirement that fee confirmation notify the customer or mint a link.
- Patterns: notification/thông báo/email/link near shipping fee/phí giao, Ready-Made or
  `AWAITING_PAYMENT`.
- Result: **no match**. `BLOCKED_CANONICAL_NOTIFICATION_GAP` does not apply.

**Fix (copy only, `admin-orders.json`):**

| Key | Before | After |
|---|---|---|
| `shipping.confirmNote` | "… đặt lại hạn giữ hàng thành 24 giờ và gửi khách liên kết thanh toán." | "… và đặt lại hạn giữ hàng thành 24 giờ. Khách có thể tiếp tục thanh toán trên liên kết đơn hàng đã nhận." |
| `shipping.correctWarning` | "… Liên kết thanh toán cũ không còn dùng được và khách cần dùng liên kết mới." | "… Khách sẽ thấy số tiền mới trên liên kết đơn hàng đã nhận." |

The correction warning made the same false promise, and U01 found no new grant on that
path either, so it is corrected with the confirm note. Guarantees:
- no event, grant or notification was added;
- the delivered `ORDER_ACCESS` link remains the durable customer surface.

## G. F4 secure-link reload copy correction

`orders.json` `secureLink.unavailable.alertBody`:

```text
before  Liên kết có thể đã hết hạn, đã được thay bằng liên kết mới, hoặc không dành cho
        thiết bị này. Hãy dùng liên kết mới nhất trong tin nhắn của bạn.
after   Không thể tiếp tục từ trang này với thông tin truy cập bảo mật hiện có. Hãy mở lại
        liên kết từ email {brand} gần nhất của bạn.
```

The new wording names no cause and claims no replacement link. It reads the same for a
missing, malformed, unknown or revoked credential.

## H. Money-authority proof

| Figure | Source | Arithmetic in browser |
|---|---|---|
| Admin "Tiền hàng" | `AdminOrderItemResponse.lineTotalAmount` (single line) | none |
| Admin "Tổng khách phải trả" | `payments.currentObligation.expectedAmount` (unchanged) | none |
| Customer payable highlight | `CustomerFullPaymentResponse.fullPaymentAmount` (unchanged) | none |
| Customer settled highlight | `ReadyMadeOrderAccessResponse.payment.payableTotal` | none |

Server side, `read-ready-made-order.query.ts` sets `payableTotal: obligation.amount` from
`findLiveForOrder(order.id, 'FULL')`. "Live" is the predicate of
`uq_payment_obligations__order_kind__live` (`status in ('PENDING','SATISFIED')`, migration
0024), so the satisfied obligation's own frozen amount is what reaches the customer.

Guards:
- `secure-ready-made-order-source.test.ts` still forbids `Number(`, `parseFloat(`,
  `toFixed(` and any `amount/total/fee/subtotal +`.
- It now pins `payableTotal` to exactly one read in `order-amount-card.tsx`, requires the
  copy button to carry only `full.fullPaymentAmount`, forbids `totalAmount`, and requires
  the SETTLED branch to be gated on `ObligationStatus.SATISFIED`.

## I. ORDER_ACCESS security preservation

- No file in `secure-link-access/` changed except copy (`orders.json`). The fragment
  bootstrap, the strip-before-request, retention, the single carrier and the resolver chain
  are untouched, and every existing guard in both boundary suites passes.
- The unavailable card is still one indistinguishable state.
- A new component test drives the missing-fragment path. It makes **no request**, renders
  the cause-neutral body, and contains none of "hết hạn liên kết / thu hồi / sai đơn / không
  hợp lệ" and none of "đã được thay / thay bằng liên kết / liên kết mới nhất".
- The existing malformed-fragment and refused-token tests pass unchanged.
- Live, a reload of the bare path shows the card. The original delivered link, reopened
  in a fresh tab, re-claims the order (§K).

## J. Focused Admin browser evidence

`pnpm --filter @embroidery/e2e-testing e2e:app12:a02` — **6/6 passed (18.2s)**, against the
fresh Admin build served by `next start` (BUILD_ID `33KDm-iEbYTKmHZAugv42`), Desktop 1440,
on this run's disposable database. Every order is created through the delivered customer
checkout and every operator write goes through a control on the delivered Admin screen.

The subject order is priced so the three figures cannot coincide:

```text
frozen goods (one line)   399.000        first fee    35.000   → FULL 434.000
corrected fee             45.000         → FULL       444.000  (journey C)
```

| Proved live | Journey |
|---|---|
| **F1** `Tiền hàng` renders the frozen line total and **not** the fee-inclusive total, while `Tổng khách phải trả` carries the obligation's own figure | B, after the first fee |
| **F1** the goods figure is byte-identical before and after the fee — the fee moved the total, not the goods | B (`expectGoods` compares against the pre-fee reading) |
| **F1** after verification the settled card shows all three apart: goods, frozen fee 45.000, total 444.000 | D |
| **F3** the fee card carries no "gửi khách liên kết / liên kết mới / gửi liên kết" before the fee **or** while correcting, and does say payment continues on "liên kết đơn hàng đã nhận" | B, before and after |
| Fee edit refused once `SATISFIED`; verification control gone, not disabled | D, unchanged |
| Queue, origin filter, correction/supersede, dispatch, completion and the terminal negative matrix | A, C, E, F, unchanged |

## K. Focused Storefront browser evidence

`pnpm --filter @embroidery/e2e-testing e2e:app12:s03` — **8/8 passed (6.4m)**, against the
fresh Storefront build served by `next start` (BUILD_ID `DnScWAsCW_KLDytjs5wnG`), on this
run's disposable database. Each viewport walks one real order from `AWAITING_SHIPPING_FEE`
to `COMPLETED` through the real API, the real worker, real operator writes and a real
Chromium.

All three approved viewports passed, 1024 included:

```text
order_1440 ORD-YF4CFRPMA4 · order_1024 ORD-WHM77NRE4E · order_390 ORD-D62AXCAHCB
step_up_1440/1024/390 = true             lifecycle_1440/1024/390 = true
reload_then_reopen_1440/1024/390 = true
```

| Proved live, at every viewport | Assertion |
|---|---|
| `AWAITING_SHIPPING_FEE` still shows the pending sentence, no total, no QR, no fee row | unchanged |
| `AWAITING_PAYMENT` shows the obligation's exact figure, compared against the committed row | unchanged |
| **F2** `READY_FOR_DELIVERY`, `DELIVERED` and `COMPLETED` each show `Tổng đã thanh toán` carrying **the same figure the customer paid**, under the heading `Số tiền đơn hàng` | `assertSettled`, new |
| **F2** the pending-fee sentence and the `Số tiền cần thanh toán` title are absent in all three | `assertSettled`, new |
| No payment action survives settlement: no initiation control, no QR | unchanged |
| **F4** a reload without the fragment shows the cause-neutral card, and the page carries none of "đã được thay / thay bằng liên kết / liên kết mới nhất" | new |
| **F4** the original delivered link, reopened in a fresh tab, re-claims the order and shows `Hoàn tất` | new |
| No horizontal overflow; exactly one `h1` | unchanged |

The five other S03 journeys — expiry, fee correction, evidence upload, cross-order
isolation and grant revocation — passed unchanged, which is the regression evidence §I
relies on.

## L. Accessibility

axe-core at the WCAG 2.2 AA tag set (`wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa`),
gated on **serious and critical**, with `color-contrast` disabled for the reason
`APP12-H08` recorded and `PO-APP12-004` assigned (three locked shared tokens owned by
`APP12-V02`). Nothing else is disabled.

| Surface | Label | serious+critical | horizontal overflow |
|---|---|---|---|
| Storefront `COMPLETED` (settled total) | `s03-1440-completed` | 0 | false |
| Storefront reload-unavailable card | `s03-1440-reload-unavailable` | 0 | false |
| Storefront `COMPLETED` | `s03-1024-completed` | 0 | false |
| Storefront reload-unavailable card | `s03-1024-reload-unavailable` | 0 | false |
| Storefront `COMPLETED` | `s03-390-completed` | 0 | false |
| Storefront reload-unavailable card | `s03-390-reload-unavailable` | 0 | false |
| Admin fee card after the fee (1440) | `a02-u01c1-after-fee` | 0 | false |
| Admin settled card (1440) | `a02-u01c1-settled` | 0 | false |

Required viewports covered: Admin 1440 and Storefront 390, plus 1024 and 1440 on the
Storefront because the S03 lifecycle runs all three.

## M. Files changed

```text
runtime
M apps/admin/src/features/order-detail/components/ready-made-order-columns.tsx       F1
M apps/admin/src/features/order-detail/components/ready-made-shipping-fee-card.tsx    F1 (+ F3 doc)
A apps/admin/src/features/order-detail/model/ready-made-merchandise.ts                F1
M apps/storefront/src/features/secure-ready-made-order/ui/order-amount-card.tsx       F2
M apps/storefront/src/features/secure-ready-made-order/model/order-access-state.ts    F2
M apps/storefront/src/features/secure-ready-made-order/model/order-access-copy.ts     F2
M packages/i18n/messages/vi/orders.json                                               F2 · F4
M packages/i18n/messages/vi/admin-orders.json                                         F3

tests
M apps/admin/test/components/order-ready-made-branch.test.tsx                         F1 · F3
A apps/storefront/test/components/secure-ready-made-order-settled.test.tsx            F2 · F4
M apps/storefront/test/boundary/secure-ready-made-order-source.test.ts                F2 money guard
M packages/e2e-testing/specs/app12/s03-lifecycle.acceptance.spec.ts                   F2 · F4 live
M packages/e2e-testing/specs/app12/a02-admin-order-branch.acceptance.spec.ts          F1 · F3 live
M packages/e2e-testing/specs/app12/support/s03-world.ts                               stale labels

docs
A docs/implementation/reports/APP12-U01-C1-COMPLETION-REPORT.md
M docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md
```

The Stage-1 files from the preparation run are uncommitted beside these: the three
`tools/uat-app12-u01-*` changes, the checklist, the preparation report and the command
index row.

**Harness corrections.** These were stale expectations the live runs hit before they
reached any F1–F4 step. Each was true of an earlier UI, and none changes product
behaviour:

1. `s03-world.ts` `accessExpiryPrefix` / `deadlinePrefix` still said "Liên kết này hết hạn
   lúc" / "Xưởng giữ hàng cho bạn tới". They are now the canonical `deadlines.*` labels,
   with zero line change.
2. `getByText(pill)` also matched the state-aware `h1` from APP12-V02 ("Đơn hàng đã giao"),
   so the Delivered/Completed waits now use the existing exact `statusPill`.
3. A02 asserted the `order-detail-omitted` sentence that `V01-UX-004` removed. It now
   asserts its absence, as the unit test does.
4. A02 clicked the origin/status checkboxes that V02 clips, where the chip label intercepts
   the pointer. It now clicks the wrapping `<label>`, which is what an operator presses.
5. Reopening the link after the F4 reload now opens a fresh tab. A `goto` on the same page
   only changes the fragment, a same-document navigation that claims nothing. This matches
   the U01 note.

## N. File-size

`node tools/check-file-size.mjs --paths <12 changed code/test files>` passes: **0
over-limit**. Five files sit above the review threshold and under the hard limit:

```text
order-access-copy.ts                        369   source threshold 300, limit 400
order-access-state.ts                       301   source threshold 300, limit 400
secure-ready-made-order.test.tsx            585   test threshold 500, limit 600
order-ready-made-branch.test.tsx            546   test threshold 500, limit 600
a02-admin-order-branch.acceptance.spec.ts   510   test threshold 500, limit 600
```

The new customer cases went into `secure-ready-made-order-settled.test.tsx` (129 lines)
rather than the existing suite, which adding them would have pushed to 630 — over the
hard limit.

`support/s03-world.ts` was already **426 lines at HEAD**, over the 400-line source limit.
This work leaves its size unchanged: the two copy constants it first gained were moved
into the spec, and only two stale string values were corrected in place. It is recorded
as an existing finding for the owner of the e2e harness and was not refactored here.

## O. Validation

| Control | Command | Result |
|---|---|---|
| Storefront components + boundary | `pnpm --filter @embroidery/storefront exec jest test/components/secure test/boundary/secure test/unit/secure` | 18 suites, 418 tests pass |
| Storefront focused | `… exec jest test/components/secure-ready-made-order test/boundary/secure-ready-made-order-source.test.ts test/components/custom-request-status.test.tsx test/boundary/shared-money-source.test.ts` | pass |
| Admin order suites | `pnpm --filter @embroidery/admin exec jest test/components/order` | 12 suites, 134 tests pass |
| Typecheck | `pnpm --filter @embroidery/{storefront,admin,e2e-testing} exec tsc --noEmit` | clean |
| Lint | `eslint` on the touched feature dirs, tests and specs | clean |
| Prettier | `prettier --check/--write` on every touched file | clean |
| i18n | `node tools/check-i18n-message-keys.mjs` · `node tools/check-i18n-static-text.mjs` · `pnpm --filter @embroidery/i18n test` | OK · OK · 28 pass |
| Figma registry | `node tools/check-figma-design-index.mjs` | pass (613 ids) |
| Whitespace | `git diff --check` | clean |
| Fresh build | `pnpm --filter @embroidery/admin build` · `pnpm --filter @embroidery/storefront build` | BUILD_ID `33KDm-iEbYTKmHZAugv42` · `DnScWAsCW_KLDytjs5wnG` |
| Live | `pnpm --filter @embroidery/e2e-testing e2e:app12:s03` · `e2e:app12:a02` | 8/8 pass (3 viewports) · 6/6 pass |

**Figma.**
- The Desktop MCP was unreachable (ConnectionRefused), and the remote plugin exposes only
  an authentication call, so no frame text could be read.
- The affected registry rows are all `APPROVED_FOR_IMPLEMENTATION`:
  `FIG-APP12-A03-ORDER-DETAIL-DESKTOP` `913:337`,
  `FIG-APP12-A03-WORKBENCH-PANELS` `914:361`,
  `FIG-APP12-S03-ORDER-ACCESS-DESKTOP/-MOBILE/-STATES` `910:258` · `911:366` · `911:305`, and
  `FIG-SECURELINK-DESKTOP/MOBILE-UNAVAILABLE` `629:37` · `629:87`.
- These are truth corrections, not a redesign: no layout, token or component changed, and
  no Figma node was touched.
- If any of those frames literally carries the superseded sentences, the runtime now
  deliberately differs from it. Aligning the frame text is a follow-up for the design
  owner, and no historical node is to be altered.

Not run: E01 (`NOT_AUTHORIZED`), the full APP12 suite (change-impact only), and any
production deploy.

## P. Shared-dev integrity

`node --env-file=.env tools/uat-app12-u01-integrity.mjs exit-c1-continuation`:

```text
orders 0 · order_items 0 · payment_obligations 0 · payment_attempts 0 · reservations 0
censusDigest 559a15c48495dba39d52e2c33ac3a82a63ebc425a7b0cf85b1a91019cef8e343   = entry
G03 rows: categories 4 · products 7 · variants 14 · skus 14 · media 47          unchanged
```

`shared_dev_mutations = 0`. Every live run in this continuation used the harness's own
disposable database.

## Q. Disposable teardown

The U01 world `embroidery_db7_u01_266328a6599` was already dropped at the end of the
preparation run, and its final commercial truth is recorded in that report §P.2.

This continuation used the e2e harness's own disposable worlds, which the orchestrator
drops in its `finally`. Verified after the last run:

```text
select datname from pg_database
 where datname like 'embroidery_db7_e2e%' or datname like 'embroidery_db7_u01%'   → 0 rows
listening harness ports (3100-3102, 4100, 4200, 8090, 9100)                       → none
docker ps                                     only the 7 shared dev containers, untouched
```

No object-store namespace of this run's own remains, and no immutable commercial row was
deleted individually anywhere.

## R. Final baseline

```text
API / worker / database / api-client / contracts files changed = 0
OpenAPI paths 129 · operations 143 · schemas 284 · public 49      unchanged
migrations 39 · tables 79 (integrity snapshot: tables 79)         no 0040
Admin routes 26 · Storefront routes 20                            no route file added
readiness criteria 10 · roadmap checkpoints 41
```

## S. U01 final status

```text
APP12-U01-C1 = COMPLETE — AWAITING_PO_REVIEW
APP12-U01    = COMPLETE_AFTER_C1 — AWAITING_PO_REVIEW
U01_CORRECTION_USED = 1/1        NO_U01_C2 = true

APP12-E01 = NEXT — NOT_EXECUTED
APP12-R01 = NOT_AUTHORIZED
PRODUCTION_DEPLOYED = false      PUSHED = false
```

`APP12-E01` was not executed. Nothing was deployed and nothing was pushed. The changes
sit uncommitted for PO review, beside the Stage-1 files from the preparation run.

**For the PO, two things this checkpoint could not settle:**
1. Whether any approved Figma frame literally carries the superseded sentences. Figma was
   unreachable this session (§O), so aligning the frame text is a follow-up for the design
   owner.
2. `packages/e2e-testing/specs/app12/support/s03-world.ts` was already 426 lines at HEAD,
   over the 400-line limit (§N). It was left unchanged in size and is recorded for the
   owner of the e2e harness.
