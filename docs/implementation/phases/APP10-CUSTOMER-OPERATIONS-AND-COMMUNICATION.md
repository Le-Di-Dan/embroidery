# APP10 — Customer Operations and Communication

## 1. Outcome

Provide maintainable customer operations: profiles/contact points, merge governance, agreements, notification delivery visibility, and simple Zalo/Messenger handoff within approved scope.

## 2. Dependencies

APP4 core customer/contact/notification behavior and R4 commerce MVP complete.

## 3. Design policy

Audit Admin customer operations and any customer profile/preferences screens. If needed, complete one APP10 package. Zalo/Messenger design remains a simple contact/handoff experience, not a chatbot platform.

Design, when required, is delivered as one complete phase package and is not split into coding checkpoints.

## 4. In scope

- Customer profile/contact maintenance.
- Verification status/support operations.
- Customer merge case/events with guardrails.
- Agreement version/acceptance where required.
- Notification intent/attempt operational search/retry.
- Simple Zalo/Messenger contact/handoff links or adapters.
- Privacy/authorization controls.

## 5. Out of scope

- AI chatbot.
- Automated sales conversation orchestration.
- Marketing campaign suite.
- Cross-customer data exposure.
- Silent destructive merge.

## 6. Candidate engineering checkpoints

These are planning slices, not an execution batch. This phase spans several bounded contexts (profile operations, merge, agreements, notification operations, Zalo/Messenger handoff); each must be re-sliced into its own small checkpoint at phase entry. Do not merge merge-governance, notification operations, and Zalo/Messenger handoff into one large checkpoint. Any backend slice remains subject to the maximum of five tightly related HTTP endpoints.

- **APP10-C01 — Customer profile operations contract:** Define Admin list/detail and bounded update/contact operations.
- **APP10-B01 — Customer profile operations backend:** Implement authorized search/read/update, masking and audit.
- **APP10-A01 — Admin customer list/detail:** Implement safe search, contact verification status and related operational context.
- **APP10-C02 — Customer merge contract:** Define create case, detail, evaluate/preview, execute and cancel operations.
- **APP10-B02 — Customer merge backend:** Implement canonical winner/loser rules, same-root guards, event history, transaction and tests.
- **APP10-A02 — Admin customer merge workflow:** Implement comparison, consequences, confirmation, forbidden/conflict and audit states.
- **APP10-C03 — Agreement contract:** Define active agreement read and acceptance/history operations required by product policy.
- **APP10-B03 — Agreement backend:** Implement versioned agreement and immutable acceptance evidence.
- **APP10-C04 — Notification operations contract:** Define Admin list/detail/retry/cancel-if-allowed operations for delivery intents/attempts.
- **APP10-B04 — Notification operations backend:** Implement safe search, retry eligibility, redaction and audit.
- **APP10-A03 — Admin notification operations:** Implement attempt history, failure reason category and authorized retry.
- **APP10-S01 — Customer profile/contact preferences:** Implement only approved self-service behavior, if in scope.
- **APP10-I01 — Zalo/Messenger simple handoff:** Implement approved links/adapters with no complex bot orchestration.
- **APP10-E01 — Customer operations E2E:** Admin safely manages customer/contact, performs a guarded merge, and retries a failed notification without exposing private data or duplicating consequences.
- **APP10-X01 — Phase closure:** Hand operationally stable customer/notification capability to public-content phase and hardening.

## 7. Critical end-to-end journey

An authorized staff member finds a masked customer profile, performs a fully previewed guarded merge with immutable event history, and inspects/retries a failed notification. Unauthorized staff cannot access or merge customer data.

## 8. Exit gate

- Merge integrity and audit pass.
- Notification retry is duplicate-safe.
- PII masking/authorization pass.
- Zalo/Messenger remain simple handoff only.
- E2E passes.

## 9. Handoff

APP11 may use stable customer-safe public interactions; APP12 hardens privacy, retention, observability and provider operations.
