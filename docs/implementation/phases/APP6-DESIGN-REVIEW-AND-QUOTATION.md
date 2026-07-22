# APP6 — Design Review, Approval and Quotation

## 1. Outcome

Turn an eligible request into versioned design review, secure customer approval, and an immutable/versioned quotation accepted or rejected by the customer.

## 2. Dependencies

APP4 secure grants/notifications and APP5 eligible requests complete.

## 3. Design policy

Expected `NEW/SUPPLEMENT` package for Admin review workbench, secure customer review, quotation editor/history and customer quote response. Review the complete journey as one APP6 design package.

Design, when required, is delivered as one complete phase package and is not split into coding checkpoints.

## 4. In scope

- Design case/version creation and current-version management.
- Review request and secure customer feedback.
- Customer approval bound to exact version.
- Approved snapshot immutability.
- Quotation draft/version, pricing breakdown, send/publish, expiry.
- Customer secure quotation view and accept/reject.
- Audit and notifications.

## 5. Out of scope

- Payment collection.
- Order creation.
- Production files/jobs.
- Arbitrary post-approval design mutation.
- Pricing rules not already approved by product/business sources.

## 6. Candidate engineering checkpoints

These are planning slices. Execute and review one at a time. Any backend slice remains subject to the maximum of five tightly related HTTP endpoints.

- **APP6-C01 — Design review Admin contract:** Define queue/detail, create version, set current version, and request customer review operations.
- **APP6-B01 — Design review backend:** Implement exact-version/current-pointer guards, request eligibility, audit and tests.
- **APP6-A01 — Admin design review workbench:** Implement request/design evidence, version history, current version and review action.
- **APP6-C02 — Customer review contract:** Define secure review read, feedback submission, approval, and rejection/change request operations.
- **APP6-B02 — Customer review backend:** Implement secure grant purpose/target checks, version eligibility, single/guarded approval and immutable snapshot.
- **APP6-S01 — Secure design review screen:** Implement exact-version preview, feedback, approve/change-request states and expired/invalid link behavior.
- **APP6-C03 — Quotation draft/version contract:** Define quotation list/detail, create version, update draft and pricing breakdown operations.
- **APP6-B03 — Quotation backend:** Implement exact money, version history, immutable sent facts and request/design eligibility.
- **APP6-A02 — Admin quotation editor/history:** Implement breakdown editing, validation, version history and readiness.
- **APP6-C04 — Quotation delivery/response contract:** Define send, secure read, accept and reject operations.
- **APP6-B04 — Quotation send/response backend:** Implement expiry, secure grants, acceptance guard, immutable accepted quotation and notifications.
- **APP6-S02 — Secure quotation screen:** Implement breakdown, validity, accept/reject, stale/expired and recovery states.
- **APP6-E01 — Review-to-quote E2E:** Admin creates exact design version → customer reviews/approves exact version → Admin sends quote → customer accepts → later edits cannot mutate approved/accepted snapshots.
- **APP6-X01 — Phase closure:** Close R3 Request and Quote Beta and hand accepted quotation to APP7.

## 7. Critical end-to-end journey

An eligible request receives a versioned design, the customer approves exactly that version through a secure grant, Admin creates/sends a versioned quotation, the customer accepts it, and both approved design and accepted quotation remain immutable.

## 8. Exit gate

- Exact-version eligibility and snapshot immutability pass.
- Money is exact and historical versions remain explainable.
- Secure links reject wrong target/version/purpose.
- E2E passes.

## 9. Handoff

APP7 creates deposit obligation/attempt and order conversion only from an eligible accepted quotation and approved design.
