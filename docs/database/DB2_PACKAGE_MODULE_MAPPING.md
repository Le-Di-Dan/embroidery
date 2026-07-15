# DB2 — Package / Module Ownership Mapping

**Date:** 2026-07-15 · **Git HEAD:** `f90f78c`
**Nature:** Documentation-level mapping of conceptual contexts to the locked
repository architecture (`REPOSITORY_STRUCTURE §7/§8/§11`). No package or code
is created.

## 1. Context → backend module

| Context | Backend module (`apps/api/src/modules/`) | Status vs locked module list |
|---|---|---|
| CTX-IDN Identity | `identity/` | listed ✔ |
| CTX-CUS Customer | `customer/` | listed ✔ |
| CTX-CAT Catalog | `catalog/` | listed ✔ |
| CTX-INV Inventory | `inventory/` | listed ✔ |
| CTX-AST Asset | `asset/` | listed ✔ |
| CTX-DSN Design (sessions, cases/versions, approvals, templates) | `design/` | listed ✔ |
| CTX-ORD Ordering (Custom Request + Order + Shipping) | `order/` | listed ✔ — Request is an aggregate inside the `order` module (context decision §1 of the context map) |
| CTX-QUO Quotation | `quotation/` | listed ✔ |
| CTX-PAY Payment | `payment/` | listed ✔ |
| CTX-PRD Production | `production/` | listed ✔ |
| CTX-GAL Gallery | `gallery/` | listed ✔ |
| CTX-CNT Content (pages, redirects, agreements/terms) | **`content/` (new module)** | list in `REPOSITORY_STRUCTURE §7` is explicitly "include" (non-exhaustive); REQ-SEO-001..004 and GAP-09 need an owner. Recorded here as the DB2 mapping decision; module is created by its owning implementation checkpoint. |
| CTX-NTF Notification | `notification/` | listed ✔ |
| CTX-AUD Audit | `audit/` | listed ✔ |
| CTX-PLT Platform (outbox, idempotency, job records, policy config) | `apps/api/src/shared/` **platform-infrastructure area** (narrow, infrastructure-only) + worker consumption | Not a business module by design. This is NOT a "shared business logic" module (prohibited by BACKEND_CONVENTIONS §22): it owns only delivery/duplication/config mechanics with no domain rules. Exact folder shape → DB6. |

Worker (`apps/worker/src/jobs/`) consumes application contracts of the owning
modules (session-cleanup → design; notification-delivery → notification;
payment-reconciliation → payment; asset-processing → asset; expiry sweeps →
inventory/platform). The worker owns **no** persistence concepts
(`SYSTEM_ARCHITECTURE §4`).

## 2. Shared packages

| Package | Owns (types only) | Explicitly NOT there |
|---|---|---|
| `packages/domain-types` | Stable cross-application primitives: branded ID types (ADR-DB1-007), Money, Quantity, Percentage, Email, Phone, Human-Readable Code, Time Range, status constant types where genuinely cross-app | Backend entities, aggregates, repository types, module-private VOs (per `REPOSITORY_STRUCTURE §11`: "Do not move backend entities here") |
| `packages/design-document` | Design Document types, validation, canonical serialization + hashing (ADR-DB1-012), `document_schema_version`, document migrations | Persistence of documents (Design module stores payloads); template curation logic |
| `packages/design-engine` | Geometry/transformation logic (canvas math) | Any persistence concept |
| `packages/contracts` | Transport contracts/API envelope schemas | Domain model |
| `packages/api-client` | Frontend client boundary | Domain model |

## 3. Rules (locked at DB2)

1. **Shared type ≠ shared persistence ownership.** A VO type in
   `packages/domain-types` never moves table ownership: values are persisted
   by the owning module's aggregate only.
2. **Module-private concepts stay module-private:** aggregates, child
   entities, module VOs (Grant Scope, Pricing Inputs, Adjustment Reason, …)
   live in their module's `domain/`, never in shared packages.
3. **Design Document payload:** type/validation/hash owned by
   `packages/design-document`; storage rows owned by the `design` module;
   no other module parses document internals (opaque payload rule,
   ADR-DB1-012).
4. **Cross-module communication** uses the BACKEND_CONVENTIONS §10 mechanisms;
   the platform-infrastructure area must not become a service locator
   (ADR-DB1-009 rule 10).
5. **Contexts are 1:1 with modules** except CTX-ORD (two aggregates, one
   module) and CTX-PLT (infrastructure area) — both documented above.

## 4. Handoff

- DB4 names tables per module ownership (single `public` schema,
  ADR-DB1-005 ownership map = this file + ownership matrix).
- DB6 materializes module schema files under each module's
  `infrastructure/persistence/` (ADR-DB1-003) and the platform area shape.
- The `content` module addition is reported to governance via the Decision
  Log entry for DB2.
