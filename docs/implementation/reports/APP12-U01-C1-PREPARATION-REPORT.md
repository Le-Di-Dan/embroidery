# APP12-U01-C1 — Manual Role-Based Business UAT Recovery — Stage-1 Preparation Report

**Checkpoint** `APP12-U01-C1`, the single authorised correction of `APP12-U01` (1/1, no C2)
**Date** 2026-09-10 · **Branch** `feat/app11-s04-seo-infrastructure` (not pushed)

---

## A. Verdict

```text
APP12-U01-C1 = UAT_EXECUTED_PO_ASSISTED — AWAITING_PO_REVIEW   (see §P)
STAGE_2_MODE = CLAUDE_DRIVEN_PLAYWRIGHT_WITH_PO_SUPPLIED_OTP_AND_LOGIN
               (Human-PO override of §1, 2026-09-10)
JOURNEY = END_TO_END_COMPLETED (READY_MADE → COMPLETED)
FINDINGS = 3 business-truth findings for PO routing (§P.3)

REAL_BANK_TRANSFER_SUBMITTED = false
APP12-E01 = NOT_AUTHORIZED
APP12-R01 = NOT_AUTHORIZED

NEXT = PO_REVIEW_REQUIRED

PRODUCTION_DEPLOYED = false
PUSHED = false
```

Stage 1 is done. A disposable, production-like world derived from the G03 catalog is
running. Its worker delivers through real SMTP, its four apps run from builds made after
HEAD, and the read-only preflight passes on every check. The manual checklist is written.

No customer or operator step was executed. This report claims **no** U01 journey result.

## B. N01 / N02 blocker closure reconciliation

| Base-U01 blocker | Owner | State taken as given |
|---|---|---|
| No channel reaches a customer (`FU-APP12-U01-NOTIFICATION-PROVIDER`) | `APP12-N01` | COMPLETE — PO CLOSED; `REAL_INBOX_MANUAL = PASS` |
| Operator cannot make a Product sellable (`FU-APP12-U01-VARIANT-AUTHORING`, `-READINESS-FALSE-CLAIM`) | `APP12-N02` | COMPLETE — PO CLOSED (`N02.E01` J1–J10 live) |

Neither was reopened. The N02.E01 work is committed as `69d27557`, ahead of this
checkpoint.

## C. Human-PO manual-UAT authority

The world was rebuilt to make the forbidden paths structurally impossible, not merely
unused:

- **Removed:** `tools/uat-app12-u01-control.mjs`, the loopback seam whose
  `GET /verification-code` returned the OTP from the recording adapter.
- **Removed:** the in-process API and worker contexts (`createApp4E01Runtime`). No process
  in this world holds a `RecordingNotificationChannelAdapter` the harness could read.
- **Added:** the worker is the built `apps/worker/dist/main.js` in its own process, with
  `NOTIFICATION_TRANSPORT=SMTP` and its own poll loop. The OTP and the `ORDER_ACCESS` link
  leave only through SMTP, to the inbox the Human PO types.

No synthetic customer was created, no code was requested, and no email address was
invented.

## D. Disposable-world topology

```text
ephemeral PostgreSQL (tmpfs) :5544   embroidery_db7_u01_266328a6599
ephemeral MinIO      (tmpfs) :9500   e2e-originals / e2e-derivatives
real API process             :4400   apps/api/dist/main.js
real worker process                  apps/worker/dist/main.js · SMTP · pid-checked alive
Storefront (next start)      :4310   production build
Admin      (next start)      :4311   production build
real Nginx gateway           :8090   embroidery.local · admin.embroidery.local
```

The shared development stack (`embroidery-dev-*`) stayed up on its own ports and was only
read, by `pg_dump`, the object-store lister and the read-only integrity probe.
`assertDisposableTarget` refuses any database not named `embroidery_db7_u01_*`.

## E. G03 / catalog derivation

```text
pg_dump embroidery (read-only)   482 102 bytes → embroidery_db7_u01_266328a6599
shared  censusDigest  559a15c48495dba39d52e2c33ac3a82a63ebc425a7b0cf85b1a91019cef8e343
clone   censusDigest  559a15c48495dba39d52e2c33ac3a82a63ebc425a7b0cf85b1a91019cef8e343  identical
clone tables          79
```

The digest also equals base U01's, so the G03 catalog has not moved since 2026-09-09.

## F. Sellable Product readiness

No `product_variants`, `skus` or `sku_stocks` row was written. The G03 catalog is sellable
as persisted:

```text
PUBLISHED uat- Products with an order-eligible, in-stock, VND-priced SKU   6
order-eligible in-stock SKUs                                               10

subject   Nón lưỡi trai thêu logo    uat-non-luoi-trai-theu-logo
SKU       Đen / S   UAT-G03-NON-DEN-S   210 000.00 VND   stock 30
public variants read  (via gateway)   200
Product Detail        (via gateway)   200
```

"Order-eligible" uses the readiness rule itself: `skus.is_active` under an active variant
(`product-publication.readiness.ts` `orderEligibleSkus`). The ten-criterion Admin readiness
view needs a staff session that Claude does not hold. The Human PO sees it as the operator.

## G. SMTP / worker readiness

```text
NOTIFICATION_TRANSPORT = SMTP (set explicitly on the worker)       true
factory line "NOTIFICATION_TRANSPORT=SMTP via" (the branch that
  returns SmtpNotificationChannelAdapter)                          true
RECORDING-transport warning in the worker log                      false
"Worker readiness: ready"                                          true
worker process alive at preflight                                  true
SMTP_HOST/PORT/USERNAME/PASSWORD, EMAIL_FROM_* present             true   (presence only)
NOTIFICATION_DELIVERY_ENVELOPE_KEY configured                      true   (per-run, shared by API + worker)
worker image dependencies current                                  n/a — host process on node_modules at HEAD
undispatched notification.delivery events in the clone at start    0
```

That last row guards a real risk. The clone inherits the shared outbox, so a still-due
notification would be mailed to a real person by this run's worker. The world refuses to
start while any is undispatched. The shared outbox holds 3 `notification.delivery.requested`
events, all DISPATCHED. The only PENDING events are `category.published` and
`product.published`, which send no mail.

No SMTP value was read, printed or stored. `node --env-file=.env` hands the values file →
process → child (`CLAUDE.md` §8a).

## H. Admin / Storefront / gateway freshness

```text
HEAD 69d27557  2026-09-10 15:35:00 +0700
pnpm turbo run build --force  (api, worker, storefront, admin + deps)  12/12, 0 cached
apps/api/dist/main.js          15:38:27   after HEAD, sources clean
apps/worker/dist/main.js       15:38:16   after HEAD, sources clean
apps/storefront/.next/BUILD_ID 15:38:25   after HEAD, sources clean
apps/admin/.next/BUILD_ID      15:38:29   after HEAD, sources clean

served Storefront HTML contains the current BUILD_ID   true
served Admin /login HTML contains the current BUILD_ID true
gateway self-health                                    200
API readiness through the gateway                      200 {status: ready}
```

The HTML check is the one that matters. `FU-APP12-H08-04` found that `next start` serves
whatever `.next` it finds, so the preflight proves which build is being *served*, not
just which one exists.

## I. Object-store isolation

```text
endpoint http://localhost:9500 (the run's own MinIO; the shared MinIO publishes no host port)
e2e-originals    101 objects   = copied count
e2e-derivatives  172 objects   = copied count
shared bridge container removed after the copy
```

Payment evidence uploaded during UAT lands only in this MinIO and dies with it.

## J. Manual checklist created

[`evidences/APP12-U01-C1-MANUAL-UAT-CHECKLIST.md`](../evidences/APP12-U01-C1-MANUAL-UAT-CHECKLIST.md)
covers customer steps 1–5, operator steps 6–7, and the FULL-payment, optional evidence,
UAT verification, ready-for-delivery, dispatch and completion steps (§8–§13). It also
carries the business-language review questions and the PASS block for the reply. It names
the data that must never be pasted, and records that the QR's bank is synthetic
(BIN `970000`).

## K. Shared-dev integrity

Entry snapshot (`node --env-file=.env tools/uat-app12-u01-integrity.mjs entry`), repeated
by the preflight:

```text
censusDigest  559a15c4…e343   unchanged
customers 4 · customer_contact_points 6 · orders 0 · order_items 0 · payment_obligations 0
payment_attempts 0 · inventory_reservations 0 · inventory_ledger_entries 10
shipping_snapshots 0 · secure_access_grants 4 · contact_verification_challenges 4
notification_intents 3 · notification_delivery_attempts 3
shared_dev_mutations = 0
```

The exit snapshot is taken at teardown, after the Human UAT.

## L. Files / tooling changed

```text
M tools/uat-app12-u01-world.mjs       real SMTP worker process; in-process runtime and
                                      control seam removed; outbox-due guard; status file
A tools/uat-app12-u01-preflight.mjs   read-only Stage-1 preflight
D tools/uat-app12-u01-control.mjs     the OTP-reading seam
M tools/uat-app12-u01-infra.mjs       docstring only
A docs/implementation/evidences/APP12-U01-C1-MANUAL-UAT-CHECKLIST.md
A docs/implementation/reports/APP12-U01-C1-PREPARATION-REPORT.md
M docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md   status
M docs/implementation/SCOPED_COMMAND_INDEX.md                               CMD-UAT-APP12-U01-C1
```

```text
runtime source changes = 0      API/OpenAPI changes = 0     generated client = 0
DB schema/migrations   = 0      Figma = 0
```

Baseline is unchanged: OpenAPI 129 / 143 / 284, public 49, migrations 39, tables 79
(shared and clone), Admin 26 and Storefront 20 routes, 10 readiness criteria, 41
checkpoints.

**Harness fault found and fixed, in the harness:** the first preflight reported
`gatewayHealthy = false`. It had asked the Storefront vhost for `/gateway/healthz`, which
only the gateway's default server answers (`infra gateway` got 200 on `localhost`). It
also picked the stock-1 SKU `Be / L` as the subject. Both were fixed in the preflight. No
application response was wrong.

## M. Validation

Change-impact only (`VALIDATION_GOVERNANCE.md` §3). Tooling and docs changed; no runtime,
so no app test, lint or typecheck suite is justified.

| Control | Command | Result |
|---|---|---|
| Fresh build | `pnpm turbo run build --force --filter=@embroidery/{api,worker,storefront,admin}` | 12/12, 0 cached |
| Syntax | `node --check` on the three changed tools | pass |
| Prettier | `npx prettier --check` on the 3 tools, checklist and report | pass (after `--write` on 2 tools) |
| File size | `node tools/check-file-size.mjs --paths <2 tools>` | pass. `uat-app12-u01-world.mjs` is 333 lines, above the 300 review threshold and under the 400 limit, because of one linear lifecycle. Preflight is 220 lines |
| Whitespace | `git diff --check` | clean |
| Secret disclosure | `node tools/check-report-secrets.mjs` | passed |
| Shared integrity | `node --env-file=.env tools/uat-app12-u01-integrity.mjs entry` | digest `559a15c4…e343` |
| World preflight | `U01_RUN_FILE=… node --env-file=.env tools/uat-app12-u01-preflight.mjs` | `pass: true`, every check green (run 2; run 1's harness fault is in §L) |

Not run: E01 regression (`NOT_AUTHORIZED`), the Figma index gate (not a design or frontend
checkpoint), and any customer or operator journey (Human-owned, §18).

## N. Teardown plan

Run after the Human PO reports, in this order:

```text
1. read-only reconciliation of the clone (one order, one satisfied FULL obligation,
   one consumed reservation, one shipping snapshot, DELIVERED + COMPLETED transitions)
2. node --env-file=.env tools/uat-app12-u01-integrity.mjs exit   → digest + counts = entry
3. delete the U01_STOP_FILE             → world stops api, worker, storefront, admin
4. U01_RUN_FILE=… node --env-file=.env tools/uat-app12-u01-infra.mjs down
   → drop embroidery_db7_u01_266328a6599 (whole), compose down -v (postgres, minio,
     gateway and their volumes)
5. ports 5544/4400/4310/4311/8090/9500 closed; residual containers []
```

No immutable row is deleted individually.

## O. Awaiting-human state

```text
APP12-U01-C1 = AWAITING_HUMAN_ROLE_UAT
MANUAL_ROLE_UAT = REQUIRED
NEXT = HUMAN_PRODUCT_OWNER_MANUAL_UAT
APP12-E01 = NOT_AUTHORIZED
```

The world stays up until the Human PO reports. Only an explicit Human PO PASS may move
authority to `APP12-U01-C1 = COMPLETE — PO PASS`, `APP12-U01 = COMPLETE_AFTER_C1`, and
`APP12-E01 = AUTHORIZED NEXT`.

---

## P. Stage 2 — executed journey (Human-PO override)

### P.1 How it was run, and what that means for the evidence

The Human PO changed the execution model mid-checkpoint: stop waiting for a manual run,
drive the journey with Playwright, and the PO supplies whatever only a human can. So:

- Claude drove a real Chromium through the real gateway, Storefront and Admin in the
  disposable world `embroidery_db7_u01_266328a6599`.
- Customer email: `d***@gmail.com`, a real inbox the PO controls. **Both OTPs came
  through real SMTP to that inbox. The PO read them there and supplied them.** No code
  was read from memory, a recording adapter or the database.
- `ORDER_ACCESS`: the PO copied the token from the real email. Operator login: the PO
  supplied the credential for this run.
- The PO chose to put the OTPs, the access token and the operator credential in the
  session transcript. **None of them appears in this report, a file, a log or argv.**
  Rotating that operator credential is the PO's decision (`CLAUDE.md` §8a); Claude did
  not rotate it.

This is **not** `HUMAN_OPERATED` in the §1 sense. It is PO-assisted, and whether it
satisfies U01 is the PO's call.

### P.2 Journey results

| Step | Result | Observed |
|---|---|---|
| Customer 1: Product selection | PASS | Đen / S, server price 210.000 VND, "Còn 30 sản phẩm", `Mua ngay` carries the chosen SKU |
| Customer 2: Email verification | PASS | real SMTP OTP; "✓ Email đã được xác minh"; email only |
| Customer 3: Delivery/contact | PASS | phone is a delivery field only; no phone OTP path |
| Customer 4: Create order | PASS | `READY_MADE` · `AWAITING_SHIPPING_FEE` · 1 item 1 × 210 000 frozen · 1 reservation `RESERVED` · 0 obligations |
| Customer 5: ORDER_ACCESS | PASS | `/truy-cap/don-hang`, fragment token claimed and stripped, "Đang chờ phí giao hàng", no QR |
| Operator 1: Admin order read | PASS | queue row "Bán sẵn · Chờ báo phí"; detail snapshot, SKU, price, delivery facts; no custom workflow |
| Operator 2: Shipping fee | PASS, finding F1 | 30 000 → `AWAITING_PAYMENT`, exactly one `FULL` obligation 240 000 VND `PENDING`, hold reset to 24 h |
| Customer: FULL-payment instruction | PASS, findings F3/F4 | 240.000 = 210.000 + 30.000, QR, synthetic bank, reference, FULL wording, "chuyển tiền chưa có nghĩa là đã thanh toán" |
| Customer: step-up before transfer details | PASS | `403` → re-verification dialog → second real SMTP OTP → attempt `PENDING` 240 000; "Đang đối chiếu thanh toán" |
| Payment evidence (optional) | NOT_EXERCISED | panel present, "Không bắt buộc", "Ảnh đã nhận không có nghĩa là đã thanh toán" |
| Operator: UAT payment verification | PASS | observed fields blank by design; → attempt `SUCCEEDED`, obligation `SATISFIED`, order `READY_FOR_DELIVERY`, reservation `CONSUMED`, stock 30 → 29, ledger 11 → 12 (once) |
| Customer: READY_FOR_DELIVERY | PASS, finding F2 | "Đã thanh toán · chuẩn bị giao"; no second payment action |
| Operator: Dispatch | PASS | → `DELIVERED`, 1 shipping snapshot, fee locked, no second reservation or payment |
| Operator: Completion | PASS | → `COMPLETED` ("Hoàn tất") |
| Customer: secure status | PASS, finding F2 | "Đã giao", then "Đơn hàng hoàn tất" |

Final commercial truth, read only from the clone:

```text
orders                 1   READY_MADE · COMPLETED
order_items            1   quantity 1 · unit 210 000.00
payment_obligations    1   FULL · SATISFIED · 240 000.00
payment_attempts       1   SUCCEEDED
inventory_reservations 1   CONSUMED
shipping_snapshots     1
order_transitions      AWAITING_SHIPPING_FEE→AWAITING_PAYMENT → READY_FOR_DELIVERY
                       → DELIVERED (SHIPPING_FREEZE) → COMPLETED
stock UAT-G03-NON-DEN-S 30 → 29      ledger +1
custom_requests / quotations / design_versions created   0 / 0 / 0

REAL_BANK_TRANSFER_SUBMITTED = false     REAL_PAYMENT_SUBMITTED = false
ADMIN_UAT_PAYMENT_VERIFICATION = executed (note records "không có chuyển khoản thật")
PHONE_SMS_VERIFICATION_PRESENT = false
```

### P.3 Findings for PO routing (not patched: runtime changes are out of U01-C1 scope)

- **F1: Admin misstates the goods amount after the fee is set.** The shipping-fee card
  shows "Tiền hàng (đã chốt)" as **240.000 VND**, the goods-plus-shipping total, while the
  frozen goods amount is 210.000. Cause:
  `apps/admin/src/features/order-detail/components/ready-made-order-columns.tsx:99`
  passes `order.totalAmount` as `merchandiseAmount`, and `totalAmount` includes the fee
  once it is confirmed. Business truth on an operator screen.
- **F2: The customer amount block contradicts a paid order.** At `READY_FOR_DELIVERY` and
  `DELIVERED`, "Số tiền cần thanh toán · Tổng thanh toán" reads "Có sau khi xưởng xác
  nhận phí giao hàng" although the fee was confirmed and paid. At `COMPLETED` the block
  renders empty. Business truth on the customer screen.
- **F3: The customer is not told that payment is open.** The Admin copy says confirming
  the fee "gửi khách liên kết thanh toán". The clone holds exactly one
  `secure_access.link` intent (order creation) and no new grant or notification after the
  fee was set. A customer who does not reopen the link on their own never learns they can
  pay. To confirm from the inbox: did a second Nét Thêu link email arrive after the fee?
- **F4 (minor, copy):** reloading `/truy-cap/don-hang` without the fragment shows "Liên
  kết không sử dụng được … đã được thay bằng liên kết mới". The link was valid and
  reopening it from the email worked. The copy names a cause that did not happen.

Recommended routing: F1–F3 are business-truth defects, and U01 §17 lets the PO block on
them. No U01-C2 exists, so they route to a later checkpoint by PO decision.

**PO disposition (2026-09-10):** fix F1–F4 inside this same C1, as
`APP12-U01-C1-CONTINUATION`; there is no U01-C2. The fixes and their evidence are in
[`APP12-U01-C1-COMPLETION-REPORT.md`](APP12-U01-C1-COMPLETION-REPORT.md). F3 was
resolved as copy only: no canonical requirement for a fee-confirmation notification
exists.
