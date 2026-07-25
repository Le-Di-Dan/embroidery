# Application Implementation — Documentation Index

**Status:** Integrated, conflict-reconciled, version-controlled baseline\
**Scope:** Design governance, backend, admin, storefront, worker, integration, release readiness\
**Location:** `docs/implementation/`\
**Reconciliation evidence:** [`audits/DOCUMENTATION_RECONCILIATION_REPORT.md`](./audits/DOCUMENTATION_RECONCILIATION_REPORT.md)

**Delivery status:** **APP0 — Application Delivery Foundation is COMPLETE** (closure evidence: [`reports/APP0-X01-COMPLETION-REPORT.md`](./reports/APP0-X01-COMPLETION-REPORT.md)). The next phase is **APP1 — Staff Access and Application Shells**, `READY, NOT STARTED` — pre-implementation audit and the `APP1-DEC-AUTH` staff-authentication decision complete (IMP-D027 / [`ADR-APP1-001`](../adr/backend/ADR-APP1-001-STAFF-AUTHENTICATION-AND-SESSIONS.md), [`reports/APP1-DEC-AUTH-COMPLETION-REPORT.md`](./reports/APP1-DEC-AUTH-COMPLETION-REPORT.md)); the `APP1-D01` design package is `DELIVERED_FOR_HUMAN_REVIEW` ([`reports/APP1-D01-COMPLETION-REPORT.md`](./reports/APP1-D01-COMPLETION-REPORT.md), canonical Figma registry [`../design/FIGMA_DESIGN_INDEX.md`](../design/FIGMA_DESIGN_INDEX.md)); `APP1-B01` (staff session authentication) is `COMPLETE — CORRECTED` ([`reports/APP1-B01-COMPLETION-REPORT.md`](./reports/APP1-B01-COMPLETION-REPORT.md); validation corrected to the canonical Zod pipeline by `APP1-B01-C1`, [`reports/APP1-B01-C1-CORRECTION-REPORT.md`](./reports/APP1-B01-C1-CORRECTION-REPORT.md)); `APP1-B02` is `READY` and `APP1-A01/A02/S01` are `BLOCKED_BY_DESIGN_APPROVAL`. Phase status is owned by [`10-MASTER-APPLICATION-ROADMAP.md`](./10-MASTER-APPLICATION-ROADMAP.md) §6 and the phase plans; do not duplicate it elsewhere.

## 1. Purpose

This document set governs the new implementation stage after the database architecture and persistence work. It does not replace product, business, lifecycle, architecture, design-system, database, or security sources of truth.

The implementation stage uses a hybrid delivery model:

- Design is delivered waterfall-style as a complete package at phase level when design work is required.
- Backend, frontend, worker, and integration work are delivered through small reviewable checkpoints.
- A backend checkpoint normally contains one to three HTTP endpoints and may contain at most five tightly related endpoints.
- A frontend checkpoint normally implements one screen or one bounded capability of a complex screen.
- One checkpoint is one human-review boundary. Work must stop after the checkpoint until it is reviewed and accepted.

## 2. Source-of-truth relationship

When implementation documents conflict with higher-level documents, the higher-level document wins. Use this order:

1. Product charter and product requirements.
2. Business rules and lifecycle specifications.
3. Security and non-functional requirements.
4. System architecture and repository structure.
5. Database canonical documents and completed handoffs.
6. Design vision, design system, Figma architecture, and approved screen packages for UI concerns.
7. Backend and frontend conventions.
8. This implementation document set.
9. Phase-specific execution specifications and completion reports.

Do not use a wireframe to override product behavior, database semantics, lifecycle rules, or approved design tokens.

## 3. Document map

### Governance

| File | Purpose |
|---|---|
| [`00-IMPLEMENTATION-CHARTER.md`](./00-IMPLEMENTATION-CHARTER.md) | Goals, scope, delivery principles, non-negotiable decisions. |
| [`01-DELIVERY-GOVERNANCE.md`](./01-DELIVERY-GOVERNANCE.md) | Human review boundaries, checkpoint sizing, change discipline, completion rules. |
| [`02-PHASE-AND-CHECKPOINT-MODEL.md`](./02-PHASE-AND-CHECKPOINT-MODEL.md) | Canonical phase structure and checkpoint taxonomy. |
| [`03-DESIGN-DELIVERY-POLICY.md`](./03-DESIGN-DELIVERY-POLICY.md) | Waterfall design packages, design audit, pass criteria, design-to-code handoff. |
| [`04-BACKEND-API-DELIVERY-STANDARD.md`](./04-BACKEND-API-DELIVERY-STANDARD.md) | API grouping, NestJS layering, Swagger/OpenAPI, endpoint limits. |
| [`05-FRONTEND-AND-SCSS-STANDARD.md`](./05-FRONTEND-AND-SCSS-STANDARD.md) | Next.js delivery, global SCSS architecture, naming, prohibited styling patterns. |
| [`06-OPENAPI-AND-CLIENT-CONTRACT.md`](./06-OPENAPI-AND-CLIENT-CONTRACT.md) | Contract lifecycle and generated Axios client policy. |
| [`07-TESTING-AND-ACCEPTANCE-GATES.md`](./07-TESTING-AND-ACCEPTANCE-GATES.md) | Required evidence by checkpoint and phase. |
| [`08-DATABASE-CHANGE-CONTROL.md`](./08-DATABASE-CHANGE-CONTROL.md) | Forward-only application-era schema change process. |
| [`09-RELEASE-AND-MILESTONE-POLICY.md`](./09-RELEASE-AND-MILESTONE-POLICY.md) | Release increments, release gates, production candidate rules. |
| [`10-MASTER-APPLICATION-ROADMAP.md`](./10-MASTER-APPLICATION-ROADMAP.md) | Ordered APP0–APP12 plan and dependencies. |
| [`11-TRACEABILITY-AND-STATUS-MATRIX.md`](./11-TRACEABILITY-AND-STATUS-MATRIX.md) | Phase ownership, surfaces, design expectation, milestone mapping. |
| [`12-REPOSITORY-INTEGRATION-NOTES.md`](./12-REPOSITORY-INTEGRATION-NOTES.md) | Safe integration into existing README, CLAUDE and roadmap sources. |
| [`13-PHASE-SOURCE-MAP.md`](./13-PHASE-SOURCE-MAP.md) | Minimum product, architecture, database and design sources per phase. |
| [`14-IMPLEMENTATION-DECISION-REGISTER.md`](./14-IMPLEMENTATION-DECISION-REGISTER.md) | Locked implementation decisions and phase-owned open decisions. |

### Detailed phase plans

See [`phases/README.md`](./phases/README.md) for APP0–APP12.

### Templates

Templates are governance aids, not ready-to-send prompts:

- [`templates/PHASE-PLAN-TEMPLATE.md`](./templates/PHASE-PLAN-TEMPLATE.md)
- [`templates/DESIGN-PACKAGE-TEMPLATE.md`](./templates/DESIGN-PACKAGE-TEMPLATE.md)
- [`templates/CHECKPOINT-SPEC-TEMPLATE.md`](./templates/CHECKPOINT-SPEC-TEMPLATE.md)
- [`templates/CHECKPOINT-REVIEW-TEMPLATE.md`](./templates/CHECKPOINT-REVIEW-TEMPLATE.md)
- [`templates/PHASE-COMPLETION-REPORT-TEMPLATE.md`](./templates/PHASE-COMPLETION-REPORT-TEMPLATE.md)

## 4. How to use this set

Before starting a phase:

1. Read the phase plan and its higher-level sources.
2. Audit existing Figma/design coverage.
3. Classify design work as `NONE`, `REUSE`, `SUPPLEMENT`, or `NEW`.
4. If design work is required, complete and approve the whole phase design package before frontend implementation.
5. Freeze the phase scope and checkpoint map.
6. Execute one checkpoint at a time.
7. Review and accept each checkpoint before beginning the next one.
8. Close the phase only after integration evidence passes.

No file in this document set is permission to implement a whole phase autonomously.
