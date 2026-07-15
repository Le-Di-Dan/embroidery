# DB0 — Source Document Inventory

**Audit date:** 2026-07-15 · **Audited Git HEAD:** `223e4db` · **Branch:** `production`
**Scope:** DB0 discovery. This inventory classifies every document consulted; it does not change any of them.

---

## 1. How to read this file

Each source is classified by **kind** so later checkpoints know its authority:

- **Product requirement** — what the product must do.
- **Business rule** — locked business behavior.
- **Security rule** — security/abuse constraints.
- **Architecture convention** — system/repository architecture.
- **Backend convention** — persistence/module rules.
- **Operational requirement** — infra, deployment, backup, recovery.
- **Open decision** — recorded unresolved choice.
- **Design/UI (non-authoritative for persistence)** — governs UI only.

Precedence follows [`CLAUDE.md`](../../CLAUDE.md) §2.

## 2. Product & business documents (`docs/`)

| Path | Kind | Status | Governed domains | Key requirements extracted |
| ---- | ---- | ------ | ---------------- | -------------------------- |
| `docs/00-PROJECT-CHARTER.md` | Product requirement | Approved baseline (Locked) | Scope, roles, non-negotiables | One Admin; store + customer-owned products; no approved-design overwrite; production must match approved version; no duplicate webhook; price-list changes must not alter locked quotes/orders; self-hosting. |
| `docs/01-PRODUCT-REQUIREMENTS.md` | Product requirement | Approved baseline (Locked) | Catalog, customizer, secure flow, request, quotation, review, payment, inventory, shipping, admin, B2B readiness | Catalog fields, variant/SKU, embroidery areas, secure link, request contents, quotation versioning + 40/60 split, immutable approved snapshot, payment idempotency, inventory hold rules, B2B-readiness fields. |
| `docs/02-SCOPE-AND-BOUNDARIES.md` | Product requirement | Approved baseline (Locked) | In/out of scope | Customer-owned product flow; explicit out-of-scope list (no export, no multi-staff, no shipping API, deferred DB/tech). |
| `docs/03-USER-JOURNEYS.md` | Product requirement | Approved baseline (Locked) | End-to-end flows J1–J10 | Ordering sequence, revision loop, approval→deposit→reservation, abandonment/expiry, reopen-after-approval. |
| `docs/04-BUSINESS-RULES.md` | Business rule | Approved baseline (Locked) | Pricing, deposit, revisions, approval, immutability, inventory, identity, retention | BR-001…BR-020 (canonical business-rule IDs). |
| `docs/05-DESIGN-STUDIO-SPEC.md` | Product requirement | Approved baseline (Locked) | Design document, versioning, autosave, watermark, export policy | Design element properties, versioning snapshot fields, autosave concurrency, integrity hash, export prohibition. |
| `docs/06-ORDER-AND-DESIGN-LIFECYCLE.md` | Product requirement | Approved product baseline (Locked, state names provisional) | Session/request/version/quotation/payment/order lifecycles, approval snapshot, cancellation | Conceptual states, state-integrity rules, approval-snapshot contents, revision-after-approval, cancellation minimums. |
| `docs/07-ADMIN-OPERATIONS.md` | Product requirement | Approved product baseline (Locked) | Admin dashboard, catalog, gallery, request, design, quotation, payment, production, inventory, shipping, audit | Admin capabilities; audit action list; prevent-negative-stock; prevent production against unapproved version. |
| `docs/08-SEO-AND-CONTENT.md` | Product requirement | Approved product baseline (Locked) | SEO pages, gallery content, analytics readiness | Content model, on-page fields, gallery SEO fields, index/noindex, analytics events. |
| `docs/09-SECURITY-AND-ABUSE-PREVENTION.md` | Security rule | Product security baseline (Locked) | Customer/admin access, upload security, asset access, watermark, abuse, payment security, retention, backup | Secure-link rules, upload validation, private-by-default assets, payment verification, retention categories, backup security (encrypted, off-site, tested restore). |
| `docs/10-NON-FUNCTIONAL-REQUIREMENTS.md` | Operational requirement | Product quality baseline (Locked) | Availability, reliability, data integrity, observability, backup/DR, maintainability, privacy | Idempotent payments, transactional state changes, exact decimal money, immutable snapshots, referential integrity, migrations, automated DB backup + off-site + documented restore + periodic restore test + full-server-loss recovery. |
| `docs/11-DOMAIN-GLOSSARY.md` | Business rule (vocabulary) | Baseline vocabulary (Locked) | All domains | Canonical terms: Product, Variant, SKU, Customer-Owned Product, Embroidery Area, Product Side, Design Session/Document/Version, Approved Design, Approval Snapshot, Mockup, Digitizing, Production File, Custom Request, Quotation/Version, Deposit, Remaining Payment, Secure Link, Soft Hold, Official Reservation. |
| `docs/12-DECISION-LOG.md` | Business rule + Open decision | Active (D-001…D-036 Locked; O-001…O-012 open) | All | Locked decisions incl. D-025 PostgreSQL, D-034 envelope, D-035 Axios; open decisions incl. O-001 ORM, O-005 auth, O-006 payment, O-008 session retention, O-009 cancellation/refund, O-012 retention/privacy. |
| `docs/13-ACCEPTANCE-PRINCIPLES.md` | Operational requirement | Baseline for future delivery (Locked) | Delivery/quality gates, E2E journeys | E2E-01…E2E-10; migration testing and backup/restore verification as quality gates; migration evidence required. |

## 3. Architecture & backend conventions (`docs/architecture/`, `docs/development/`)

| Path | Kind | Status | Governed domains | Key requirements extracted |
| ---- | ---- | ------ | ---------------- | -------------------------- |
| `docs/architecture/SYSTEM_ARCHITECTURE.md` | Architecture convention | Approved technical baseline v0.2.0 (Locked; several open items) | Module boundaries, data ownership, object storage, transactions, security | PostgreSQL as system-of-record for listed record types; object storage authoritative for binaries; DB references objects by internal IDs not public URLs; explicit transaction boundaries; outbox for external side effects; module isolation (no cross-module ORM/repo). ORM/queue/auth/object-storage product remain open. |
| `docs/architecture/REPOSITORY_STRUCTURE.md` | Architecture convention | Approved technical baseline v0.2.0 (Locked) | Repo layout, module structure, packages | Backend module list; `packages/design-document` (types/validation/serialization/migrations), `packages/domain-types` (stable primitives); migrations are versioned. |
| `docs/development/BACKEND_CONVENTIONS.md` | Backend convention | Approved technical baseline v0.2.0 (Locked; ORM/validation open) | Persistence, transactions, idempotency, payment, asset, worker, config, audit | Repositories domain-oriented; explicit transactions; DB constraints reinforce invariants; immutable historical quotation & approved design; no float money; no permanent public asset URL as authority; idempotency mandatory list; outbox; audit-log fields. |
| `docs/development/FRONTEND_CONVENTIONS.md` | Architecture convention | Approved technical baseline (Locked) | Frontend state/HTTP | Not persistence-authoritative; TanStack Query owns server state, Zustand browser-only; Axios only. (Consulted for completeness; minimal DB impact.) |
| `docs/development/LOCAL_DEVELOPMENT.md` | Operational requirement | Active | Dev workflow, Docker, env, ports | `.env` git-ignored; `.env.example` documented; Postgres loopback-only; `POSTGRES_PORT` override for conflicts; volumes kept on `down`; `docker:clean:volumes` destroys local DB; ORM/migrations explicitly NOT selected (do not install without ADR). |

## 4. Infrastructure & operations assets (`infrastructure/`)

| Path | Kind | Status | Notes for DB phase |
| ---- | ---- | ------ | ------------------ |
| `infrastructure/compose/docker-compose.dev.yml` | Operational requirement | Active | `postgres:16.6-alpine`, named volume `embroidery_postgres_data`, loopback-only port, healthcheck `pg_isready`. Only real persistence config present. **Audited read-only; not modified.** |
| `infrastructure/compose/docker-compose.debug.yml` | Operational requirement | Active | Direct-port debug overlay. Not persistence-specific. |
| `.env.example` (repo root) | Operational requirement | Active | Postgres dev credentials & port; no secrets; production credentials provisioned separately. |
| `infrastructure/backup/README.md` | Operational requirement | **Reserved stub** | "Backup/restore procedures arrive with the operations checkpoint." No runbook yet → DB10 gap. |
| `infrastructure/kubernetes/README.md` | Operational requirement | Reserved stub | Production topology open (ADR). |
| `infrastructure/monitoring/README.md` | Operational requirement | Reserved stub | Observability tooling open. |
| `infrastructure/scripts/README.md` | Operational requirement | Reserved stub | Operational scripts (backup/restore/migrate) not yet present. |

## 5. Existing package boundaries (persistence-relevant, empty)

| Path | Status | Notes |
| ---- | ------ | ----- |
| `packages/domain-types/src/index.ts` | Empty approved stub | "Real content arrives with its owning checkpoint." No domain primitives yet. |
| `packages/design-document/src/index.ts` | Empty approved stub | Will own design-document types/validation/serialization/**migrations** (document-level, distinct from DB migrations). |
| `packages/design-engine/src/index.ts` | Empty approved stub | Geometry only; no persistence. |
| `packages/contracts/src/api-envelope/*` | Implemented | API envelope types/guards only; not persistence. |

## 6. Design/UI documents — non-authoritative for persistence

Per [`CLAUDE.md`](../../CLAUDE.md) §2 precedence and the WF06 architecture-only
scope, the following govern **UI/component architecture only** and must not be
treated as sources for business rules or data:

| Path | Kind | Status | Note |
| ---- | ---- | ------ | ---- |
| `docs/design/DESIGN_VISION.md` | Design/UI | Draft/active | Visual direction only. |
| `docs/design/DESIGN_SYSTEM_FOUNDATION.md` | Design/UI | Draft/active | Tokens/components (HF01 concern). |
| `docs/design/FIGMA_ARCHITECTURE.md` | Design/UI | Draft/active | Figma file structure. |
| `docs/design/USER_FLOW_ARCHITECTURE.md` | Design/UI | Draft/active | WF06 component architecture only; flows mirror `03-USER-JOURNEYS.md`, which remains the authoritative flow source. |

**Do not** derive data fields, colors, or UI details into the data model unless
a product document requires them.

## 7. Conflicts observed at inventory time

Details and IDs are in [`DB0_CONFLICTS_AND_GAPS.md`](./DB0_CONFLICTS_AND_GAPS.md).
Summary of documents in tension:

- Provisional lifecycle state names (`06`) vs "final names decided in technical
  design" → naming not yet locked (→ DB3).
- `postgres:16.6-alpine` pinned in Compose vs D-025 which locks only
  "PostgreSQL" (no version) → version pin not documented as locked (→ DB1).
- Backup/restore mandated (`09`, `10`, `13`) vs `infrastructure/backup` being a
  reserved stub → operational gap (→ DB1 strategy, DB10 runbooks).
- Deposit handling on reopen-after-approval "follows business policy configured
  for the case" (`03` J10, `06` §10/§11) but that policy is undefined (O-009).
