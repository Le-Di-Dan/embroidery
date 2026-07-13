# 04 — Business Rules

**Status:** Approved baseline  
**Version:** 0.1.0

## BR-001 — Primary market

The primary market is Vietnam.

## BR-002 — Business mix

Target mix is 70% B2C and 30% B2B. B2C is the current delivery priority.

## BR-003 — Product ownership

The system supports:

- Store-owned base products.
- Customer-owned products submitted for embroidery.

## BR-004 — Pricing

Quotation is manual.

Pricing inputs may include:

- Physical dimensions.
- Number of colors.
- Estimated stitch count.
- Quantity.
- Base product price.
- Digitizing fee.
- Shipping.
- Manual adjustment.

## BR-005 — Deposit timing

Deposit is paid only after:

1. Digitizing.
2. Customer review.
3. Customer approval.

Deposit amount is 40% of accepted total.

## BR-006 — Remaining payment

Remaining 60% must be paid before delivery.

## BR-007 — Revision count

There is no hard system limit on revision count.

Admin retains the right to:

- Refuse abusive requests.
- Pause processing.
- Cancel spam.
- Request clarification.
- Apply additional terms manually where appropriate.

## BR-008 — Approval authority

Only explicit approval through the secure customer flow is authoritative.

Zalo or Messenger messages are not the system of record for design approval.

## BR-009 — Approved design immutability

An approved design version cannot be edited.

Any post-approval change creates a new version and requires new approval.

## BR-010 — Production version integrity

Production must reference the exact approved version or a production artifact cryptographically linked to it.

## BR-011 — Customer export prohibition

Customers cannot export or download:

- Scene document.
- High-resolution preview.
- Store-owned artwork.
- Production file.
- Digitized embroidery file.

## BR-012 — Watermark

Customer-visible previews must contain watermark.

Internal production artifacts must not contain customer-facing watermark.

## BR-013 — Temporary save

Unsaved designs are stored as temporary sessions and expire after a configurable period.

## BR-014 — Customer identity

Customer may start as guest but must verify email or phone before submitting a request.

## BR-015 — Inventory reservation

Inventory is not officially reserved at draft or request submission.

Official reservation occurs after approval and successful deposit.

## BR-016 — One Admin

The current system has one Admin account and no role hierarchy.

## BR-017 — Shipping

Shipping fee is manually confirmed by Admin.

No shipping API or customer shipment tracking is required.

## BR-018 — Communication

Zalo and Messenger are simple external contact channels.

The platform does not own or synchronize the conversation history.

## BR-019 — SEO

SEO is a core product requirement.

Blog functionality is not required.

## BR-020 — Self-hosting

Production is hosted on infrastructure physically located at or controlled from the store.

External backup and uptime monitoring remain mandatory operational requirements.
