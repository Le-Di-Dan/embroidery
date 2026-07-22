# APP5 — Custom Requests and Customer-Owned Products

## 1. Outcome

Allow customers to submit embroidery requests for store products or customer-owned products and give Admin a controlled moderation/triage workflow.

## 2. Dependencies

APP2 catalog/assets, APP3 design sessions, and APP4 customer/contact foundations complete.

## 3. Design policy

Audit request and Admin operation flows. If incomplete, produce one APP5 design package covering customer request creation/status and Admin queue/detail/moderation. Reuse APP3 Studio patterns where a design session is attached.

Design, when required, is delivered as one complete phase package and is not split into coding checkpoints.

## 4. In scope

- Customer-owned product create/read/update/archive within allowed lifecycle.
- Request draft/create/edit/asset attachment/submit.
- Request list/detail/status for customer where in scope.
- Admin request queue/detail.
- Moderation notes and request transitions.
- Duplicate-submit protection and audit.

## 5. Out of scope

- Design review/approval.
- Quotation pricing/versioning.
- Deposit/payment/order.
- Production scheduling.
- General CRM behavior.

## 6. Candidate engineering checkpoints

These are planning slices. Execute and review one at a time. Any backend slice remains subject to the maximum of five tightly related HTTP endpoints.

- **APP5-C01 — Customer-owned product contract:** Define create, list, detail, update, and archive operations.
- **APP5-B01 — Customer-owned product backend:** Implement ownership, asset references, lifecycle and validation.
- **APP5-S01 — Customer-owned product UI:** Implement bounded registration/list/detail capability if exposed in the approved journey.
- **APP5-C02 — Request draft contract:** Define create, list, detail, update, and asset/design attachment behavior, re-sliced if five endpoint limit requires.
- **APP5-B02 — Request draft backend:** Implement request ownership, snapshots/references, validation and duplicate safety.
- **APP5-S02 — Request creation screen:** Implement product/design/contact/details entry with recovery and validation.
- **APP5-S03 — Request confirmation/status:** Implement submitted state and bounded customer status view.
- **APP5-C03 — Request submission/transition contract:** Define submit and any customer cancellation-before-review operation separately from Admin moderation.
- **APP5-B03 — Request submission backend:** Implement submission transaction, idempotency, immutable submission facts and notification consequence.
- **APP5-C04 — Admin request operations contract:** Define queue, detail, add moderation note, and allowed moderation transitions.
- **APP5-B04 — Admin request operations backend:** Implement filters/queries, transition guards, notes, audit and tests.
- **APP5-A01 — Admin request queue:** Implement filters, pagination, status and error/empty states.
- **APP5-A02 — Admin request detail/moderation:** Implement evidence/design/assets, notes and guarded transitions.
- **APP5-E01 — Request E2E:** Verified customer creates or selects product context, attaches design/assets, submits once despite retry, and Admin triages it through an allowed transition.
- **APP5-X01 — Phase closure:** Hand accepted requests to APP6 review and quotation.

## 7. Critical end-to-end journey

A verified customer submits a request with a valid product/design or customer-owned product, retry does not duplicate it, Admin sees the request and performs only allowed moderation transitions with audit evidence.

## 8. Exit gate

- Ownership and duplicate protection pass.
- Submitted facts are stable.
- Admin transitions obey lifecycle guards.
- Notifications do not break transaction correctness.
- E2E passes.

## 9. Handoff

APP6 creates versioned design review and quotation only from eligible request states.
