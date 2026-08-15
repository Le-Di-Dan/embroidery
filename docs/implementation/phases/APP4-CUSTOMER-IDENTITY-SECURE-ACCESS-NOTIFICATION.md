# APP4 — Customer Identity, Verification, Secure Access and Notification Core

## 1. Outcome

Provide the secure customer/contact foundation needed for request follow-up, design approval, quotation, and payment links, plus reliable notification intent/attempt delivery.

## 2. Dependencies

APP1 auth foundation and APP0 worker/contract foundations complete. Provider choices must be isolated behind ports; exact providers require ADR/configuration.

## 3. Design policy

Audit customer verification and secure-link screens. Use `NONE` for pure backend/worker slices and `SUPPLEMENT/NEW` only where customer/Admin screens are missing. Complete all APP4 UI design in one package.

Design, when required, is delivered as one complete phase package and is not split into coding checkpoints.

## 4. In scope

- Customer profile/contact point creation and lookup required by later journeys.
- Contact verification challenge and attempt behavior.
- Secure access grants with purpose, scope, expiry, consumption and revocation.
- Notification intent/attempt worker foundation.
- Safe secure-link resolution and non-enumeration behavior.
- Admin visibility needed to support failed verification/delivery.

## 5. Out of scope

- Full customer account portal.
- Customer merge workflow.
- Marketing notification campaigns.
- Complex chatbot behavior.
- Review/quotation/payment business actions themselves.

## 6. Candidate engineering checkpoints

These are planning slices, not an execution batch. This phase spans several bounded contexts (customer/contact, verification, secure access, notification core); each must be re-sliced into its own small checkpoint at phase entry. Do not merge identity, verification, and secure-access into one large checkpoint. Any backend slice remains subject to the maximum of five tightly related HTTP endpoints.

- **APP4-C01 — Customer/contact contract:** Define bounded customer/contact create/read/update operations required by requests.
- **APP4-B01 — Customer/contact backend:** Implement normalization, uniqueness/guard behavior, ownership and safe search/read semantics.
- **APP4-C02 — Verification contract:** Define challenge creation, verification attempt, status, and resend/rate-limit behavior; maximum four endpoints.
- **APP4-B02 — Contact verification backend:** Implement opaque code handling, expiry, attempt/rate rules, idempotency and tests.
- **APP4-S01 — Verification UI:** Implement contact entry, code verification, resend/rate-limit, expired and success states.
- **APP4-C03 — Secure grant contract:** Define resolve, consume/action handoff, revoke/Admin detail, and status operations as appropriate.
- **APP4-B03 — Secure grant backend:** Implement purpose/scope/target/version eligibility, expiry, revocation, opaque token storage and non-enumerating errors.
- **APP4-C04 — Notification core contract:** Define only operational status/retry endpoints needed by Admin; delivery itself remains worker-driven.
- **APP4-W01 — Notification intent/attempt worker:** Implement provider-neutral intent processing, bounded retry, attempt records, duplicate safety and terminal failure.
- **APP4-A01 — Admin delivery/support view:** Implement customer/contact verification and notification failure visibility/retry where authorized.
- **APP4-E01 — Secure contact E2E:** Create customer/contact → verify → issue secure grant → deliver notification → resolve valid link → reject expired/revoked/wrong-purpose link.
- **APP4-X01 — Phase closure:** Hand secure customer and delivery foundations to APP5/APP6/APP7.

## 7. Critical end-to-end journey

A contact is verified, a purpose-bound secure link is issued and delivered through the notification core, the customer resolves it successfully, and invalid, expired, replayed, revoked, or wrong-purpose usage is safely rejected.

## 8. Exit gate

- Tokens/codes are opaque and never logged in plaintext.
- Rate and expiry behavior pass.
- Notification retries are observable and idempotent.
- Secure grants enforce target/purpose/scope.
- E2E passes.

## 9. Handoff

APP5 uses verified customer/contact ownership; APP6 and APP7 use secure grants/notifications for review, quotation and payment actions.

---

## Closure reconciliation (`APP4-X01`, 2026-08-15)

APP4 is closed: **`COMPLETE — PASS_WITH_FOLLOW_UPS — DELIVERED_FOR_REVIEW`**. The
canonical closure record is
[`reports/APP4-CLOSURE-MATRIX.md`](../reports/APP4-CLOSURE-MATRIX.md); this section
reconciles only the planning prose above that execution superseded. The original
entry findings are left as written — they are history.

| Planned above | **Delivered** |
| --- | --- |
| Backend split `APP4-C01…C04` | `APP4-B02…B08` |
| 10 feature endpoints | **11** (the A01 authority unblock added `POST /api/admin/customers/resolve`) |
| Admin manual transport `/retry` | **`POST /api/admin/notification-intents/{intentId}/replay`** |
| B07 surface | 4 endpoints, under the backend cap of 5 |
| Notification→Customer binding | `B05` server-resolved Contact Point → `B01 recipientContactPointId` → `notification_intents.recipient_contact_point_id` (`APP4-A01-C1`) |
| Cross-layer acceptance | `APP4-E01 = PASS_AFTER_R01_C1` — replan `H01`/`H02`/`R01` + one correction |

Frozen artifacts: OpenAPI 48 paths / 53 operations / 101 schemas
(`sha256 02bd969c17aa3899209ed563d51c0add30142874fb64ee96294b1009528e8d7b`),
generated client `ee7ea2af2eb79f2ffc00b6a477167628f32d7995b50ab4e415bffc7bb9c2f90f`,
**`NO_APP4_MIGRATION`** (34 migrations, latest `0034` is APP3-owned), 48 APP4 Figma
rows (30 + 18 amended under the A01 authority unblock).
