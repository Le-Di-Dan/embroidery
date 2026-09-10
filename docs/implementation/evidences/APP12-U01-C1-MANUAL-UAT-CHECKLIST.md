# APP12-U01-C1 — Manual Role-Based Business UAT Checklist

**For:** the Human Product Owner, acting as the **customer** and as the **operator**.
**World:** disposable, `embroidery_db7_u01_266328a6599` (a clone of the G03 world). It is
dropped whole after you finish. Nothing you do here reaches the shared development data.

This checklist is the acceptance. Claude prepared the world and does **not** run any
step below. A step passes only when **you** did it and saw it.

---

## 0. Before you start

| | |
|---|---|
| Storefront | <http://embroidery.local:8090> |
| Admin | <http://admin.embroidery.local:8090/login> |
| Operator login | the operator account the clone carries (`d***@gmail.com`), with the password you already know. Claude does not have it and does not need it. |
| Your customer email | a **real** inbox you control. The OTP and the order link are sent there over real SMTP. |
| Subject Product | **Nón lưỡi trai thêu logo** — `/san-pham/uat-non-luoi-trai-theu-logo` |
| Suggested SKU | **Đen / S**, `UAT-G03-NON-DEN-S`, **210.000 ₫**, stock **30** |

- Both addresses resolve only on **this machine** (hosts file). Open every link, including
  the one in the email, in a browser on this machine.
- The world has to stay running. If the machine sleeps or restarts, tell Claude before
  you continue.
- The QR's bank is **synthetic** (BIN `970000`, no real acquirer). **Do not make a real
  bank transfer.** None is needed, and none is authorised.

### Never paste these into chat, a screenshot or a report

```text
the OTP code                     the ORDER_ACCESS link or any token in it
the SMTP password                the operator password
real bank / card details         a screenshot that shows any of the above
```

A masked email (`d***@…`), statuses, amounts and your judgements are all Claude needs.

---

## 1. Customer — choose the Product

1. Open the Storefront, find **Nón lưỡi trai thêu logo**, open Product Detail.
2. Pick **Đen**, then size **S**, quantity **1** (or 2).
3. Check the Product name, variant, price and availability shown.
4. Click **Mua ngay**.

**Expected:** checkout opens for the SKU you chose; the price is the server's (210.000 ₫
for Đen / S); no custom-request, deposit or remaining-payment wording anywhere.

## 2. Customer — email verification

1. Enter your real email; request the code.
2. Open your inbox, find the **Nét Thêu** email, read the code.
3. Type the code into the Storefront.

**Expected:** email is the only verification route (no phone / SMS option); the card shows
the email-specific verified state.

## 3. Customer — delivery and contact

Enter realistic UAT delivery details. A phone number here is a **delivery contact only**.

**Expected:** no step asks you to verify the phone.

## 4. Customer — place the Ready-Made order

Place the order.

**Expected:** the order is created and is waiting for a shipping fee; you are not asked to
pay yet. (Behind the screen: `READY_MADE`, `AWAITING_SHIPPING_FEE`, your SKU × quantity and
unit price frozen, one active reservation, no payment obligation yet.)

## 5. Customer — ORDER_ACCESS

Open the order link from the email Nét Thêu sends you.

**Expected:** it lands on `/truy-cap/don-hang` for **this order only**; the token leaves the
address bar after it is claimed; status reads *waiting for shipping fee*; **no QR yet**.
Do not copy the link anywhere.

---

## 6. Operator — find the same order

Sign in to Admin → **Orders** (`/orders`) → the new Ready-Made order → detail.

**Check:** Product, variant/SKU, unit price, quantity, subtotal, delivery facts, origin
Ready-Made, status *awaiting shipping fee*. No quotation or design workflow presented as if
this were a custom order.

## 7. Operator — set the shipping fee

Enter a plausible UAT shipping fee and confirm.

**Expected:** status moves to *awaiting payment*; exactly one **FULL** payment amount =
subtotal + shipping fee, in VND; no deposit / remaining-payment wording.

---

## 8. Customer — FULL-payment instruction

Return to the secure order page (reload, or reopen from the email).

**Expected:** *awaiting payment*; the exact final amount; a QR and a transfer reference;
FULL-payment wording only. You may view or download the QR. **Do not pay it.**

## 9. Customer — payment evidence (optional)

Only if you want to exercise it: upload a harmless image (not a real banking screenshot).

**Expected:** Admin can see it; the order stays *awaiting payment*; uploading never claims
the payment succeeded.

## 10. Operator — UAT payment verification

In Admin, use the real payment verification action for this order. This stands in for
reconciliation, because no money moved.

**Expected:** payment satisfied; order *ready for delivery*; reservation consumed; stock
reduced exactly once (Đen / S 30 → 29 for quantity 1).

## 11. Customer — ready for delivery

**Expected:** the same secure page shows *ready for delivery* and payment satisfied; no
second payment action.

## 12. Operator — dispatch

Move the order to **delivered**.

**Expected:** shipping snapshot frozen once; no second reservation or payment. The customer
page shows *delivered*.

## 13. Operator — complete

Move the order to **completed**.

**Expected:** the customer page shows *completed*.

---

## 14. At every milestone, judge the business language

Only material problems block U01, not cosmetic preference.

- Is the next action obvious?
- Is the screen telling the business truth?
- Is the Ready-Made terminology right, with no custom, deposit or remaining-payment wording?
- Would anything mislead a normal customer or operator enough to stop them?
- Does any step need database knowledge?

---

## 15. Your result — reply with this block

```text
MANUAL_ROLE_UAT                 = PASS | FAIL

REAL_EMAIL_OTP                  = PASS | FAIL
READY_MADE_ORDER_CREATE         = PASS | FAIL
ORDER_ACCESS                    = PASS | FAIL
ADMIN_ORDER_READ                = PASS | FAIL
SHIPPING_FEE                    = PASS | FAIL
FULL_PAYMENT_INSTRUCTION        = PASS | FAIL
PAYMENT_EVIDENCE (optional)     = PASS | FAIL | NOT_EXERCISED
ADMIN_UAT_PAYMENT_VERIFICATION  = PASS | FAIL
READY_FOR_DELIVERY              = PASS | FAIL
DISPATCH                        = PASS | FAIL
COMPLETION                      = PASS | FAIL
CUSTOMER_SECURE_STATUS          = PASS | FAIL

REAL_BANK_TRANSFER_SUBMITTED    = false
REAL_PAYMENT_SUBMITTED          = false
PHONE_SMS_VERIFICATION_PRESENT  = true | false

Business-language findings (step · what you saw · why it matters):
-
```

For a FAIL, name the step and what you saw. Claude routes it as the exact failing business
seam. There is no U01-C2.

After you reply, Claude reads the disposable world once to reconcile the final commercial
facts (one order, one satisfied FULL obligation, one consumed reservation, one shipping
snapshot, one DELIVERED and one COMPLETED transition), proves the shared world unchanged,
and drops the world.
