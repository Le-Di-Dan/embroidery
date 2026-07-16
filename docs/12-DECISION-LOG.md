# 12 — Decision Log

**Status:** Active  
**Version:** 0.1.0

## D-001 — Business focus

**Decision:** B2C first, target mix 70% B2C / 30% B2B.  
**Status:** Locked.

## D-002 — Product types

**Decision:** Primary products are teddy bears, towels and clothing.  
**Status:** Locked.

## D-003 — Product ownership

**Decision:** Support store products and customer-owned products.  
**Status:** Locked.

## D-004 — Editor level

**Decision:** Advanced Product Customizer, not a general design suite.  
**Status:** Locked.

## D-005 — Preview

**Decision:** 2D product image composition only. No 3D.  
**Status:** Locked.

## D-006 — Customer save behavior

**Decision:** Temporary autosave is allowed. No customer design library.  
**Status:** Locked.

## D-007 — Customer export

**Decision:** No download/export of design or high-resolution preview.  
**Status:** Locked.

## D-008 — Watermark

**Decision:** Dynamic repeated watermark on customer-facing preview.  
**Status:** Locked.

## D-009 — Screenshot limitation

**Decision:** The system cannot guarantee prevention of OS screenshots or external photography. The target is deterrence and value reduction.  
**Status:** Locked.

## D-010 — Digitizing

**Decision:** Manual digitizing.  
**Status:** Locked.

## D-011 — Revisions

**Decision:** No hard revision limit. Historical versions must remain.  
**Status:** Locked.

## D-012 — Approval

**Decision:** Approval through secure link; messaging apps are not the source of truth.  
**Status:** Locked.

## D-013 — Deposit

**Decision:** 40% deposit after design approval.  
**Status:** Locked.

## D-014 — Final payment

**Decision:** Remaining 60% before delivery.  
**Status:** Locked.

## D-015 — Chat

**Decision:** Zalo and Messenger links only. No chatbot or message synchronization.  
**Status:** Locked.

## D-016 — Inventory

**Decision:** Inventory by SKU, color and size. Official reservation after approval and deposit.  
**Status:** Locked.

## D-017 — Shipping

**Decision:** Manual shipping fee and internal shipping data. No shipping API, adapter or customer tracking.  
**Status:** Locked.

## D-018 — Admin model

**Decision:** One Admin, one operator, no role hierarchy.  
**Status:** Locked.

## D-019 — SEO

**Decision:** Strong SEO, gallery, landing pages, no blog system.  
**Status:** Locked.

## D-020 — Hosting

**Decision:** Self-host on store-controlled infrastructure located at the store.  
**Status:** Locked, with operational risk controls required.

## D-021 — Scale

**Decision:** 20–100 products, under 100 orders/month, under 10 concurrent editor users.  
**Status:** Locked.

## D-022 — Monorepo tooling

**Decision:** pnpm workspaces with Turborepo.  
**Status:** Locked.

## D-023 — Frontend architecture

**Decision:** Separate Next.js App Router applications for storefront and admin, using server-first hybrid rendering.  
**Status:** Locked.

## D-024 — Backend architecture

**Decision:** NestJS modular monolith plus a separate asynchronous worker application.  
**Status:** Locked.

## D-025 — Database

**Decision:** PostgreSQL is the system-of-record database.  
**Status:** Locked.

## D-026 — Deployment

**Decision:** Docker and Docker Compose for development; Kubernetes for production.  
**Status:** Locked. Production topology remains open.

## D-027 — Object storage

**Decision:** Depend on an S3-compatible object-storage abstraction; the concrete product remains open.  
**Status:** Architecture locked; product open.

## D-028 — Frontend state

**Decision:** TanStack Query owns server state; Zustand owns browser-only interaction and editor state.  
**Status:** Locked.

## D-029 — Repository organization

**Decision:** Feature-first/module-first with responsibility-based subfolders inside every feature/module.  
**Status:** Locked.

## D-030 — React component organization

**Decision:** One production React component per file.  
**Status:** Locked.

## D-031 — Code quality

**Decision:** Prettier, ESLint, strict TypeScript, automated tests, and SonarQube quality gates.  
**Status:** Locked.

## D-032 — File size

**Decision:** Source/logic files have a 400-line hard limit; test files have a 600-line hard limit, with controlled generated-file exceptions.  
**Status:** Locked.

## D-033 — Hard-coded values

**Decision:** Magic numbers, magic strings, duplicated business values, URLs, statuses, limits, timeouts, and user-facing copy must be centralized at the narrowest valid scope. Obvious syntax-only literals need not be converted into meaningless constants.  
**Status:** Locked.

## D-034 — Standard API envelope

**Decision:** All internal JSON business APIs use one standard success/error envelope with stable machine-readable codes, human-readable messages, payload data or structured errors, request metadata, and correct HTTP status semantics. Binary streams, health endpoints, redirects, and third-party protocol responses are controlled exceptions.  
**Status:** Locked.

## D-035 — Frontend HTTP client

**Decision:** Axios is the only approved frontend HTTP client for internal application APIs. Direct use of `fetch` is prohibited. Axios access is centralized through browser/server clients and feature services.  
**Status:** Locked.

## D-036 — Development edge gateway and production routing contract

**Decision:**

- Development: Nginx Open Source runs as the default edge gateway of the Docker
  Compose stack and is the primary browser entrypoint. Storefront, Admin and
  API are routed by hostname and path (`STOREFRONT_HOST`/`ADMIN_HOST`,
  `/api/*` → API). Worker, PostgreSQL and the SonarQube database are never
  routed through the gateway. Direct application ports are exposed only
  through the documented debug overlay. The gateway is a reverse proxy/router
  only — with one replica per application it is not a load balancer.
- Routing contract: the browser-visible API path is `/api/*`; the NestJS API
  uses global prefix `api` (health endpoint: `GET /api/health`); Next.js
  applications expose their own health at `/healthz`, never under `/api/*`.
- Production: Kubernetes will use the Gateway API and Kubernetes Services.
  `ingress-nginx` will not be used. The concrete Gateway API controller,
  production TLS and topology remain open decisions. The development Nginx
  gateway is not production topology.

**Status:** Locked (development contract); production controller open.

## D-037 — Persistence architecture baseline (DB1)

**Decision:** The persistence foundation is locked by the DB1 ADR set under
`docs/adr/database/` (ADR-DB1-001 … ADR-DB1-018): PostgreSQL 16 (exact-tag
pin, UTF8/collation C/UTC baseline); Drizzle ORM with drizzle-kit migrations
(generated-then-reviewed SQL, immutable shared migrations, forward-only/
forward-fix, no `down` recovery path); single `public` schema with a
documented module ownership map; snake_case naming conventions; UUIDv7
application-generated IDs for business entities, bigint identity for
append-only records, human-readable codes separate from PKs; statuses as
text + CHECK constraints; immutability via app guards + versioned records +
DB reject-mutation triggers; delete/archive category framework with named
retention classes (durations remain business decisions — O-008/O-012);
design-document canonicalization per RFC 8785 JCS + SHA-256 owned by
`packages/design-document`; DB-arbitrated idempotency records; explicit
timestamp-based, configurable reservation expiry; `pg_dump -Fc` backups with
version/migration manifest and restore-then-forward-migrate compatibility;
one Docker volume per repository with a mandatory schema-mismatch check;
three-tier idempotent seeds; real-PostgreSQL test databases (template per
worker). This resolves the ORM and migration portions of O-001; the
queue/broker, canvas, UI-system, image-processing and test-runner portions of
O-001 remain open.
**Status:** Locked (architecture); deferred parameters tracked in
`docs/database/DB1_IMPLEMENTATION_HANDOFF.md` §9.

## D-038 — DB1-C1 correction of persistence evidence and PostgreSQL baseline

**Decision:** Correction checkpoint DB1-C1 (2026-07-15) amends D-037's
baseline without changing selected technologies: (1) PostgreSQL policy is
restated as **major 16 locked + governed reviewed patch pin** — the
repository's `postgres:16.6-alpine` tag is stale state, the official current
16.x baseline at correction date is **16.14**, and DB6 must update the
development image to `postgres:16.14-alpine` or a newer reviewed 16.x;
patch upgrades are controlled maintenance changes with release-note review
and migration/smoke gates. (2) The ORM comparison evidence is refreshed
against current official documentation — Prisma, TypeORM and MikroORM can
all express partial indexes and CHECK constraints (Prisma behind the
`partialIndexes` Preview feature); **Drizzle remains selected** on
overall-fit grounds, with an added exact-version pin/compatibility-spike
policy and a mandatory DB6 row-locking spike. (3) The collation rationale is
narrowed: `C` remains the database default for technical deterministic
ordering only; user-facing Vietnamese sorting/search receives explicit
ICU/locale-aware design at DB4/DB5; canonical hashing is independent of
database collation; backup manifests record exact server version and
locale/collation configuration. Full record:
`docs/database/DB1_CORRECTION_REPORT.md`.
**Status:** Locked (correction applied; DB1 verdict remains PASS WITH
DEFERRED PARAMETERS).

## D-039 — Conceptual domain model and aggregate ownership (DB2)

**Decision:** Checkpoint DB2 locks the conceptual domain model documented
under `docs/database/DB2_*` and `docs/adr/database/ADR-DB2-*`: 15 bounded
contexts mapped onto the modular-monolith module set (Custom Request and
Order are separate aggregates inside the `order` module; Content — SEO
pages, redirects, terms/agreements — maps to a new `content` module, allowed
by the non-exhaustive module list; outbox/idempotency/policy configuration
are platform infrastructure, not business modules); 23 aggregates with
exactly one owner per concept; snapshot-versus-reference boundaries
(quotation versions, approval snapshots, order items, shipping-at-dispatch,
production specifications, agreement versions are immutable snapshots).
B2 decisions resolved: customer identity created only at verified submission
(no password accounts, no raw-contact auto-merge, grants are not identity —
ADR-DB2-001); per-order shipping detail frozen at dispatch, no MVP address
book (ADR-DB2-002); notifications persist intent + delivery attempts with
redacted parameters, never rendered bodies or secrets (ADR-DB2-003). Design
templates are Design-owned, clone-on-use documents; agreement/terms versions
are Content-owned immutable versions referenced by approval snapshots with a
content hash; analytics events are not stored in the application database
(external tool authoritative; tool still open). B3 items (cancellation/
refund, approval-vs-acceptance ordering, production rework, secure-link
expiry) remain open for DB3.
**Status:** Locked (conceptual model); lifecycle finalization at DB3.

## D-040 — Lifecycle and invariant specification (DB3)

**Decision:** Checkpoint DB3 locks the platform's state machines and
enforcement plan (`docs/database/DB3_*`, `docs/adr/database/ADR-DB3-*`):
final lifecycle state names for all 23 DB0 lifecycles plus the DB2 additions
(new order states ON_HOLD/CANCELLING; request state QUOTE_ACCEPTED; synonym
states ABANDONED and REVISED eliminated); the commercial ordering is locked
as quotation acceptance → digitizing → design review → approval → order
creation with both payment obligations, deposit computed from the accepted
total, price changes requiring re-acceptance (ADR-DB3-001, resolves O-009's
ordering sibling GAP-03); cancellation/refund is a stage-matrix (S1–S9)
compensation saga with reviewed refund records and manual execution —
refund-amount defaults are business configuration (ADR-DB3-002, resolves
O-009 baseline); post-approval revision uses hold-and-supersede with
deposit carry-over and obligation recalculation (ADR-DB3-003); secure links
use one reusable request-access grant with token rotation and mandatory
step-up re-verification for a locked sensitive-action set (ADR-DB3-004,
answers the O-005 policy portion; provider still open). All 35 invariants
are mapped to DB/TX/APP/EXT/PROC enforcement layers with DB4 constraint and
DB7/DB8 test handoffs. Remaining deferrals are configuration values only
(TTLs, retention durations, retry counts, provider-specific mappings).
**Status:** Locked (lifecycle baseline); relational schema at DB4.

## D-041 — Logical relational schema (DB4)

**Decision:** Checkpoint DB4 locks the logical relational schema
(`docs/database/DB4_*`, `docs/adr/database/ADR-DB4-*`): 78 logical tables
in the single `public` schema covering all 75 DB2 concepts and 23
aggregates, with column dictionary, keys/uniqueness/check semantics,
FK/reference directions and delete/archive behavior. DB4-owned modeling
decisions: money is exact `numeric(14,2)` plus an explicit ISO-4217
currency-code column ('VND' MVP), percentages `numeric(5,2)` 0–100,
rounding owned by the application Money VO at one derivation point, and
the deposit/remaining split is CHECK-verified to sum to the frozen total
(ADR-DB4-001); transition history is a hybrid — dedicated append-only
transition tables for request/order/production, structural history
(immutable versions and append-only records) for design/quotation/payment/
inventory and the other historized lifecycles, state timestamps plus audit
for administrative publication lifecycles, and audit never substitutes for
business history (ADR-DB4-002); asset associations use context-owned
association tables and direct FK columns — no generic polymorphic
`asset_links` (ADR-DB4-003); JSONB is restricted to a closed nine-column
set (design documents, outbox payload, idempotency result, redacted
provider events, audit summary, redacted notification params, versioned
policy config), each with a schema-version key and owner — all
invariant-bearing facts stay relational (ADR-DB4-004). GAP-10 is resolved:
stitch count is an admin-entered quotation pricing input stored in the
immutable quotation version, never derived. Deferred: trigger/
partial-unique/exclusion DDL and locking spikes (DB6), index design (DB5),
configuration values (business, CON-144).
**Status:** Locked (logical schema); access-path/index design at DB5.

# Open Decisions

The following are intentionally unresolved:

## O-001 — Remaining technology selections

ORM, queue/broker, canvas library, UI system, testing stack and image-processing implementation.

## O-003 — Git hosting and source governance

GitHub/GitLab/self-hosted Git, branch model, review rules and release policy.

## O-004 — Claude development workflow

Prompt granularity, task templates, checkpoint model, review gate and evidence format.

## O-005 — Authentication implementation

OTP method, email/phone verification provider, secure link duration and revocation.

## O-006 — Payment implementation

Provider onboarding, webhook contract, bank transfer reconciliation and refund flow.

## O-007 — Self-host topology

Hardware, reverse proxy, public connectivity, backup, monitoring and external dependency placement.

## O-008 — Temporary session retention

Exact expiration period.

## O-009 — Cancellation and refund policy

Detailed business rules before and after deposit or production.

## O-010 — Performance budgets

Concrete web performance and editor responsiveness targets.

## O-011 — Browser support matrix

Exact minimum versions.

## O-012 — Data retention and privacy

Detailed retention periods and deletion process.
