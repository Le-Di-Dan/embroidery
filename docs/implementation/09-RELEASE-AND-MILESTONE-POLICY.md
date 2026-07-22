# Release and Milestone Policy

## 1. Incremental releases

A release milestone is a coherent user/business capability, not a count of completed screens or endpoints.

## 2. Planned milestones

| Milestone | Required phases | Outcome |
|---|---|---|
| R0 — Engineering Ready | APP0–APP1 | Delivery foundation, Swagger/client, SCSS system, staff access, Admin/Storefront shells. |
| R1 — Catalog Alpha | APP2 | Admin can publish real catalog content and Storefront renders it. |
| R2 — Customization Alpha | APP3 | Templates and 2D Design Studio work end-to-end. |
| R3 — Request and Quote Beta | APP4–APP6 | Customer identity/secure links, request submission, review, approval, quotation. |
| R4 — Commerce MVP | APP7–APP9 | Deposit, order creation, production, remaining payment, fulfillment and completion. |
| R5 — Operational Beta | APP10–APP11 | Customer operations, notifications, public content/gallery/SEO. |
| R6 — Production Candidate | APP12 | Security, resilience, UAT, observability, runbooks and go-live gates. |

Each milestone is closed at the **last required phase** in its row, and only when every required phase has passed. Closure owners: R0 → APP1; R1 → APP2; R2 → APP3; R3 → APP6; R4 → APP9; R5 → APP11; R6 → APP12. A phase that contributes to a milestone but is not its closure owner (for example APP4/APP5 for R3) does not close it.

## 3. Release gate

A milestone may be released only when:

- Required phases are closed.
- Critical E2E journeys pass.
- Environment configuration is documented.
- Migrations/compatibility are safe.
- Monitoring/logging exists for new critical paths.
- Known limitations are explicit.
- No secret or PII leaks are present.
- Rollback/disable strategy exists for risky integrations.

## 4. Feature flags

Use feature flags only when they reduce rollout risk or allow incomplete external integration to remain disabled. Do not use flags to merge permanently unfinished production behavior.

## 5. Production claims

- Alpha: internal/incomplete operational readiness, bounded users.
- Beta: broader journey validation with known limitations.
- MVP: locked core commerce journey works.
- Production Candidate: all go-live gates passed in a production-like environment.
- Production: explicit deployment approval after APP12, not an automatic consequence of code completion.
