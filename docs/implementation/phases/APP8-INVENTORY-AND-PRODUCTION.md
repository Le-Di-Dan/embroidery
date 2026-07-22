# APP8 — Inventory Reservation and Production Operations

## 1. Outcome

Reserve inventory without oversubscription and operate the embroidery production lifecycle through an auditable Admin workflow and reliable worker behavior.

## 2. Dependencies

APP7 eligible order exists; database concurrency/lock guarantees and production lifecycle are inherited.

## 3. Design policy

Mostly Admin design. Audit existing operations design; create one APP8 package if inventory/production board, detail, error/manual-review and transition states are missing. Storefront design is limited to bounded status updates.

Design, when required, is delivered as one complete phase package and is not split into coding checkpoints.

## 4. In scope

- Inventory availability/adjustment visibility required by operations.
- Soft holds and official reservations according to approved lifecycle.
- Reservation release/expiry/conversion.
- Production job creation, queue, detail, start, progress/transition, completion/failure.
- Job attempts, worker claims, retry/manual review.
- Admin inventory and production screens.
- Bounded customer order status.

## 5. Out of scope

- Remaining payment and fulfillment completion.
- Carrier tracking.
- General warehouse management beyond approved inventory scope.
- Changing concurrency guarantees for convenience.

## 6. Candidate engineering checkpoints

These are planning slices. Execute and review one at a time. Any backend slice remains subject to the maximum of five tightly related HTTP endpoints.

- **APP8-C01 — Inventory operations contract:** Define availability/list/detail and authorized adjustment operations, no more than five endpoints.
- **APP8-B01 — Inventory operations backend:** Implement exact quantities, authorization, audit and repository queries.
- **APP8-A01 — Admin inventory screen:** Implement availability, adjustment, reservation visibility and conflict states.
- **APP8-B02 — Reservation use cases:** Implement hold/reservation conversion/release/expiry with existing lock order and concurrency guarantees.
- **APP8-C02 — Reservation operational contract:** Expose only necessary Admin order/reservation status/actions within five endpoints.
- **APP8-C03 — Production job contract:** Define production queue, detail, create, start and allowed next-transition operations.
- **APP8-B03 — Production backend:** Implement eligibility, approved-design linkage, lifecycle guards, audit and outbox.
- **APP8-A02 — Admin production queue:** Implement filters/priorities/status and loading/error/empty states.
- **APP8-A03 — Admin production detail:** Implement approved design evidence, reservation, job attempts and guarded transitions.
- **APP8-W01 — Production worker claims/attempts:** Implement deterministic claim, bounded retry, duplicate safety and terminal/manual review.
- **APP8-C04 — Customer order status contract:** Define bounded customer-safe status read operation(s).
- **APP8-S01 — Customer production status:** Implement customer-safe progress without internal notes or carrier tracking.
- **APP8-E01 — Order-to-production E2E:** Two competing orders cannot oversubscribe inventory; eligible order reserves stock, creates production job, progresses through allowed states, and records retry/failure safely.
- **APP8-X01 — Phase closure:** Hand completed production and reserved order to APP9.

## 7. Critical end-to-end journey

Competing reservation attempts preserve stock limits. An eligible order links to the approved design, receives a production job, transitions through allowed states, and worker retry does not duplicate irreversible work.

## 8. Exit gate

- Concurrency race suite remains passing.
- Production never uses a non-approved design version.
- Internal notes are not customer-visible.
- Worker retry/manual review is observable.
- E2E passes.

## 9. Handoff

APP9 creates remaining payment/fulfillment actions only from eligible production/order states.
