# APP1 — Staff Access and Application Shells

## 1. Outcome

Deliver secure staff authentication and permission-aware Admin shell while establishing a production Storefront shell. This phase enables controlled operational access for all later Admin capabilities.

## 2. Dependencies

APP0 complete. Authentication provider/session mechanism must be selected by approved ADR or existing repository decision.

## 3. Design policy

Audit existing Figma. Expected classification is `SUPPLEMENT` or `NEW` for Admin login/shell unless already approved; Storefront shell should reuse approved navigation/foundation where complete. All missing screens/states are designed as one APP1 package.

Design, when required, is delivered as one complete phase package and is not split into coding checkpoints.

## 4. In scope

- Staff login, logout, refresh/session renewal, current-staff context.
- Role/permission resolution and backend enforcement.
- Audit actor identity.
- Admin login, shell, permission-aware navigation, forbidden/session-expired states.
- Storefront root shell, global error/loading/not-found conventions.
- Security controls for cookies/tokens, CSRF/session fixation as applicable.

## 5. Out of scope

- Customer account registration/profile.
- Product/catalog features.
- Complex staff/user management screens unless explicitly required for initial role seeding.
- Feature-specific Admin navigation items before their phases.

## 6. Candidate engineering checkpoints

These are planning slices. Execute and review one at a time. Any backend slice remains subject to the maximum of five tightly related HTTP endpoints.

- **APP1-C01 — Staff session contract:** Define up to four tightly related operations: login, logout, refresh/renew, and current staff.
- **APP1-B01 — Staff authentication use cases:** Implement credential/session validation, safe errors, audit context, and integration tests.
- **APP1-B02 — Authorization foundation:** Implement permission resolver and endpoint policy enforcement with negative tests; no feature permissions beyond the planned matrix.
- **APP1-A01 — Admin login screen:** Implement the approved login screen with pending, invalid credential, locked/forbidden, and recoverable error states.
- **APP1-A02 — Admin application shell:** Implement layout, navigation, account menu, session expiry, forbidden route, and responsive behavior.
- **APP1-S01 — Storefront application shell:** Implement approved header/footer/root boundaries, metadata foundation, and SCSS integration.
- **APP1-E01 — Access E2E:** Prove valid login, invalid login, permission denial, session expiry/renewal, logout, and audit actor propagation.
- **APP1-X01 — Phase closure:** Audit security, contract, UI, logs, and hand off authenticated Admin capability to APP2.

## 7. Critical end-to-end journey

Staff logs in through the Admin UI, reaches only permitted navigation, calls a protected API through the generated client, receives a safe forbidden response for a missing permission, and logs out cleanly.

## 8. Exit gate

- No mock authentication.
- Backend, not only UI, enforces permission.
- Sensitive errors are redacted.
- Admin and Storefront shells use global SCSS only.
- Access E2E passes.

APP1 closure is the **owner of milestone R0** (Engineering Ready): R0 is closed here only if both APP0 and APP1 have passed. This is a closure-ownership rule; it does not mark R0 complete now. See `09-RELEASE-AND-MILESTONE-POLICY.md`.

## 9. Handoff

APP2 may add Catalog/Asset permission codes and Admin routes without changing the auth foundation.
