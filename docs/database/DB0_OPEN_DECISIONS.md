# DB0 — Open-Decision Register

**Audit date:** 2026-07-15 · **Audited Git HEAD:** `223e4db`
**Rule:** DB0 records and classifies open decisions. It does **not** choose any final option. Candidate options are listed only where a document already mentions them.

> **DB1 update (2026-07-15, HEAD `563d986`):** all 19 B1 decisions are resolved
> by ADR — see §5 below. The original register (§2–§4) is preserved unchanged
> as history; IDs are not renumbered. B2/B3/NB decisions remain open.

---

## 1. Blocker levels

- **B1** — blocking DB1 (must be decided before the Persistence ADR is complete).
- **B2** — blocking DB2 (conceptual model).
- **B3** — blocking DB3 (lifecycle/invariant spec).
- **NB** — non-blocking until a later checkpoint.

Cross-links: `O-xxx` = Decision Log open item in `docs/12-DECISION-LOG.md`.

## 2. Register

| ID | Question | Why it matters | Affected domains | Evidence / candidates | Risk of delaying | Decide by | Blocker |
| -- | -------- | -------------- | ---------------- | --------------------- | ---------------- | --------- | ------- |
| DEC-01 | Which ORM (or query builder / raw SQL)? | Shapes repository adapters, migration tooling, entity mapping, transaction API. | All persistence | Open (O-001); `BACKEND_CONVENTIONS §9` "ORM is an open decision"; no ORM installed. | Blocks concrete schema/repository work. | DB1 | **B1** |
| DEC-02 | Which migration framework? | Defines migration history, ordering, immutability enforcement, fresh/upgrade workflows. | Migration, versioning, multi-machine | Open (O-001); often tied to ORM choice. | Blocks DB6 migration foundation & multi-machine story. | DB1 | **B1** |
| DEC-03 | Lock a PostgreSQL version. | Compose pins `16.6-alpine` but D-025 locks only "PostgreSQL" (no version). All machines must match. | Docker, versioning, all | `docker-compose.dev.yml` `postgres:16.6-alpine`; `12 D-025`. Candidate: 16.x. | Version drift across machines; feature/compat surprises. | DB1 | **B1** |
| DEC-04 | UUID / ID strategy (UUIDv4 vs v7 vs ULID vs bigint identity; where generated). | Affects PK design, index locality, cross-machine ID generation, integrity. | All | `BACKEND_CONVENTIONS §5` "IDs use stable typed conventions selected by ADR". | Rework of every table/relationship. | DB1 | **B1** |
| DEC-05 | Enum strategy (native PG enum vs lookup table vs check constraint vs app-only). | Status columns are pervasive; migration cost of enums differs. | All lifecycle domains | `BACKEND_CONVENTIONS §5,§20`; provisional states in `06`. | Costly migrations if changed later. | DB1 | **B1** |
| DEC-06 | Design-document JSON structure **and** canonical hashing strategy. | Integrity hash must be reproducible across machines; snapshot & approval depend on it. | Design version, approval, assets | `05 §3,§9`; `06 §4/§9`; `packages/design-document` empty stub. | Blocks version/approval modeling; non-reproducible hashes. | DB1 | **B1** |
| DEC-07 | Database naming conventions (tables/columns/constraints/indexes). | Consistency across modules; migration readability. | All | `BACKEND_CONVENTIONS`, `REPOSITORY_STRUCTURE §14` (code naming only). | Inconsistent schema; churn. | DB1 | **B1** |
| DEC-08 | Schema organization (single schema vs per-module PG schemas vs prefixes). | Module isolation vs one DB; affects access control. | All modules | `SYSTEM_ARCHITECTURE §8` module isolation; no DB-level decision. | Refactor of every object. | DB1 | **B1** |
| DEC-09 | Immutability enforcement approach (revoked privileges / triggers / append-only / app-guard). | Enforces INV-01/02/12/17 for approved designs & sent quotations. | Design, quotation, approval | `04 BR-009`, `06 §4/§5`, `10 §5`. | Weak immutability guarantees. | DB1 | **B1** |
| DEC-10 | Soft-delete / archive policy (hard delete vs soft delete vs archive tables). | Interacts with retention, audit, referential integrity. | All, retention | `07 §3` archive; `10 §12`; not specified. | Inconsistent deletion semantics. | DB1 | **B1** |
| DEC-11 | Backup tool/format. | Determines restore procedure, off-site format, schema-version tagging. | Backup, recovery, multi-machine | REQ-OPS-002; `10 §9`; `09 §11`; backup dir is a stub. Candidates: `pg_dump` logical, physical/base backup. | No recoverability guarantee. | DB1 | **B1** |
| DEC-12 | Restore compatibility strategy (schema-version tagging, forward/back compat). | Safe restore across schema versions; separates schema vs data recovery. | Restore, recovery | INV-34; `10 §9`; DB0 Task H. | Unsafe restores. | DB1 | **B1** |
| DEC-13 | Retention periods (session, request, upload, approved design, production file, payment, audit, backup). | Drives deletion jobs, partitioning, audit/asset lifespan. | Retention, session, audit, asset, payment | Open (O-008 session, O-012 retention); `09 §10`; `10 §12`. | Privacy exposure; unbounded growth. | DB1 | **B1** |
| DEC-14 | Inventory reservation expiration period (and soft-hold duration). | Affects reservation lifecycle (LC-17) and stock accuracy. | Inventory | `04 BR-015`; not specified. | Stuck holds or premature release. | DB1 | **B1** (reservation model) |
| DEC-15 | Idempotency key scope + expiry policy per operation. | Correct duplicate-suppression window for payments/jobs/submissions. | Payment, outbox, request, asset, notification | `BACKEND_CONVENTIONS §12`. | Replay or premature key reuse. | DB1 | **B1** |
| DEC-16 | Design-approval vs quotation-acceptance ordering (which gates which). | Determines request/order/quotation state transitions and preconditions. | Request, quotation, order, payment | `03 J4` (quote reviewed early) vs `03 J6`/`04 BR-005` (deposit after design approval); `06 §5/§8`. | Contradictory lifecycle design. | DB3 | **B3** |
| DEC-17 | Local Docker volume strategy + cross-machine data transfer + branch-divergence handling. | Prevents incompatible volume reuse; enables safe machine switching. | Docker, multi-machine, versioning | DB0 Task H; `LOCAL_DEVELOPMENT §11`; named volume `embroidery_postgres_data`. | Silent corruption on branch switch. | DB1 | **B1** |
| DEC-18 | Migration rollback policy vs forward-only migration policy. | Governs failed-migration recovery and shared-migration immutability. | Migration, versioning, recovery | DB0 Task H; `BACKEND_CONVENTIONS §9`. Candidate: forward-only. | Ad-hoc recovery; broken history. | DB1 | **B1** |
| DEC-19 | Seed strategy (idempotent seeds, dev vs test datasets, deterministic ordering). | Reproducible baseline across machines; test fixtures. | Seed, multi-machine, testing | `13 §4`; `BACKEND_CONVENTIONS §19`. | Non-reproducible environments. | DB1 (direction), DB9 (detail) | **B1** (direction) |
| DEC-20 | Test database strategy (isolation, teardown, transactional tests). | Enables DB7/DB8 constraint & concurrency tests. | Testing, all | `BACKEND_CONVENTIONS §19`; testing stack open (O-001). | Blocks DB7/DB8 test design. | DB1 | **B1** |
| DEC-21 | Customer identity model (guest→verified consolidation, dedup by email/phone, B2B profile linkage). | Determines Customer aggregate shape and uniqueness. | Customer, verification, B2B | `04 BR-014`; `01 §4,§13`. | Rework of customer relationships. | DB2 | **B2** |
| DEC-22 | Cancellation & refund policy (before/after deposit/production; deposit reuse on re-approval). | Determines cancellation/refund transitions and money handling. | Order, payment, refund, inventory | Open (O-009); `06 §10/§11`; `03 J10`. | Incomplete order/refund lifecycle. | DB3 | **B3** |
| DEC-23 | Production revision handling after approval (rework state, new production job vs amend). | Determines production lifecycle completeness. | Production, design, order | `06 §10`; `07 §9`. | Ambiguous production state machine. | DB3 | **B3** |
| DEC-24 | Shipping address / history model. | Determines shipping data shape and retention. | Shipping, order, retention | `01 §10`; `07 §11`; under-specified. | Rework of order shipping fields. | DB2 | **B2** |
| DEC-25 | Notification persistence depth (persist all vs transient; delivery log). | Determines whether a Notification table/log exists and its retention. | Notification, audit, retention | `SYSTEM_ARCHITECTURE §5.4`; not specified. | Under/over-persisting notifications. | DB2 | **B2** |
| DEC-26 | Secure-link expiry & revocation policy (duration, re-issue, per-action re-verification). | Determines grant lifecycle (LC-03) and security posture. | Secure grant, verification | Open (O-005); `01 §4`; `09 §2`. | Weak/over-strict access control. | DB3 | **B3** |
| DEC-27 | Object-storage product (S3-compatible concrete choice). | Affects asset metadata fields, signed-URL semantics, backup of assets. | Asset, backup | Open (O-001, D-027 architecture locked / product open). | Asset backup & access design blocked partially. | DB1 (interface impact) / later | NB (interface is abstract) |
| DEC-28 | Queue/broker implementation. | Affects outbox relay, worker jobs, idempotency of async work. | Outbox, worker, asset, notification | Open (O-001); `SYSTEM_ARCHITECTURE §5.4`. | Async delivery design deferred. | DB4 (outbox table is broker-agnostic) | NB for schema; port stays abstract |
| DEC-29 | Auth / OTP provider. | Affects admin credential/session tables & verification records. | Identity, verification | Open (O-005). | Identity persistence detail deferred. | DB2/DB3 | NB (model abstractly) |
| DEC-30 | Payment provider implementation & webhook contract. | Affects payment attempt/callback fields & reconciliation. | Payment | Open (O-006). | Provider-specific fields deferred; model generically. | DB3 | NB (model provider-agnostically) |

## 3. Blocker roll-up

| Blocker | IDs | Count |
| ------- | --- | ----- |
| **B1 — blocking DB1** | DEC-01..DEC-15, DEC-17, DEC-18, DEC-19, DEC-20 | 19 |
| **B2 — blocking DB2** | DEC-21, DEC-24, DEC-25 | 3 |
| **B3 — blocking DB3** | DEC-16, DEC-22, DEC-23, DEC-26 | 4 |
| **NB — non-blocking (abstract until later)** | DEC-27, DEC-28, DEC-29, DEC-30 | 4 |
| **Total open decisions** | DEC-01 … DEC-30 | **30** |

## 4. Notes

- The B1 set defines the **DB1 exit gate**: DB1 is complete only when each B1
  decision is resolved by an approved ADR (see [`DB_ROADMAP.md`](./DB_ROADMAP.md)).
- NB decisions (DEC-27..DEC-30) are non-blocking because the architecture
  mandates abstract ports (object storage, async job, payment/verification
  adapters) — persistence can be modeled provider-agnostically until those ADRs
  land.
- No option is selected in DB0. Selection happens via ADRs at the target
  checkpoints.

## 5. DB1 resolution status (added 2026-07-15, Git HEAD `563d986`)

All B1 decisions were resolved at checkpoint **DB1 — Persistence Architecture
& ADR Lockdown**. Statuses: `Accepted` or `Accepted with Deferred Parameters`
(AwDP — architecture locked; parameter owner listed). Full detail:
[`DB1_DECISION_MATRIX.md`](./DB1_DECISION_MATRIX.md) and
[`DB1_IMPLEMENTATION_HANDOFF.md`](./DB1_IMPLEMENTATION_HANDOFF.md) §9.

| ID | Resolution (2026-07-15) | ADR | Status | Deferred parameter → owner |
| -- | ----------------------- | --- | ------ | -------------------------- |
| DEC-01 | Drizzle ORM (+ sanctioned raw SQL in module adapters); rationale refreshed at DB1-C1 (overall fit, not capability exclusivity) | [ADR-DB1-002](../adr/database/ADR-DB1-002-ORM-QUERY-LAYER.md) | Accepted (evidence refreshed DB1-C1) | exact pins + compatibility/row-lock spike → DB6 |
| DEC-02 | drizzle-kit; generated-then-reviewed SQL; immutable shared migrations | [ADR-DB1-003](../adr/database/ADR-DB1-003-MIGRATION-STRATEGY.md) | Accepted | dir/commands → DB6 |
| DEC-03 | PostgreSQL major 16 + governed reviewed patch pin (16.x baseline 16.14 at DB1-C1; DB6 applies tag); UTF8/UTC; `C` default scoped to technical ordering | [ADR-DB1-001](../adr/database/ADR-DB1-001-POSTGRESQL-VERSION.md) | Accepted (amended DB1-C1) | exact tag + collation verification → DB6; ICU collation design → DB4/DB5; prod image variant → deployment ADR |
| DEC-04 | UUIDv7 app-generated (business) / bigint identity (append-only) / separate codes | [ADR-DB1-007](../adr/database/ADR-DB1-007-ID-STRATEGY.md) | Accepted | library → DB6; code formats → DB3/DB4 |
| DEC-05 | text + CHECK constraint; TS constants as source; PG enums prohibited | [ADR-DB1-008](../adr/database/ADR-DB1-008-STATUS-REPRESENTATION.md) | Accepted | final state names → DB3 (GAP-01) |
| DEC-06 | `packages/design-document` owner; RFC 8785 JCS + SHA-256; versioned opaque payload | [ADR-DB1-012](../adr/database/ADR-DB1-012-DESIGN-DOCUMENT-CANONICALIZATION.md) | AwDP | document schema/implementation → DB2/DB4 + package CP |
| DEC-07 | snake_case, plural tables, explicit constraint names, `_at` timestamptz UTC | [ADR-DB1-006](../adr/database/ADR-DB1-006-NAMING-CONVENTIONS.md) | Accepted | money precision → DB4 |
| DEC-08 | Single schema `public` + documented module ownership map | [ADR-DB1-005](../adr/database/ADR-DB1-005-DATABASE-SCHEMA-ORGANIZATION.md) | Accepted | ownership map → DB2/DB4 |
| DEC-09 | Defense-in-depth: app guards + versioned records + reject-mutation triggers | [ADR-DB1-010](../adr/database/ADR-DB1-010-IMMUTABILITY-ENFORCEMENT.md) | AwDP | per-table map → DB3/DB4; role hardening → DB6/DB10 |
| DEC-10 | Category framework (archive / hard delete / anonymize / immutable / tombstone) | [ADR-DB1-011](../adr/database/ADR-DB1-011-DELETE-ARCHIVE-RETENTION.md) | Accepted | — |
| DEC-11 | `pg_dump -Fc` + manifest (versions, migration set, commit, SHA-256), off-site | [ADR-DB1-014](../adr/database/ADR-DB1-014-BACKUP-AND-RESTORE.md) | Accepted | cadence/off-site target → DB10 + O-007 |
| DEC-12 | Same-major restore; restore-then-forward-migrate; manifest-gated compatibility | [ADR-DB1-014](../adr/database/ADR-DB1-014-BACKUP-AND-RESTORE.md) | Accepted | restore-test cadence → DB10 |
| DEC-13 | Retention classes + configured durations + audited worker cleanup; default-safe | [ADR-DB1-011](../adr/database/ADR-DB1-011-DELETE-ARCHIVE-RETENTION.md) | AwDP | durations (O-008/O-012) → DB3 + business |
| DEC-14 | Explicit `expires_at`, configurable audited policy, idempotent sweep, no negative stock | [ADR-DB1-018](../adr/database/ADR-DB1-018-INVENTORY-RESERVATION-EXPIRY.md) | AwDP | TTLs + insufficient-stock behavior → DB3 |
| DEC-15 | DB-arbitrated idempotency records: (namespace, key) unique + fingerprint + TTL classes | [ADR-DB1-017](../adr/database/ADR-DB1-017-IDEMPOTENCY-POLICY.md) | AwDP | per-operation TTLs → DB3/DB4 |
| DEC-17 | One volume per repo/machine + mandatory schema-mismatch check; dev data disposable | [ADR-DB1-013](../adr/database/ADR-DB1-013-MULTI-MACHINE-AND-DOCKER-VOLUMES.md) | Accepted | command wiring → DB6; runbooks → DB10 |
| DEC-18 | Forward-only/forward-fix; no `down` recovery path; backup before destructive | [ADR-DB1-003](../adr/database/ADR-DB1-003-MIGRATION-STRATEGY.md) | Accepted | runbook RB-06 → DB10 |
| DEC-19 | 3 seed tiers, idempotent upsert, deterministic IDs, never inside migrations | [ADR-DB1-015](../adr/database/ADR-DB1-015-SEED-STRATEGY.md) | Accepted | datasets → DB9 |
| DEC-20 | Real pinned PostgreSQL, template-DB-per-worker, rollback + truncate modes | [ADR-DB1-016](../adr/database/ADR-DB1-016-TEST-DATABASE-STRATEGY.md) | Accepted | test runner (O-001 remainder) → testing-stack ADR |

Supporting cross-cutting ADRs (no DEC ID):
[ADR-DB1-004](../adr/database/ADR-DB1-004-SCHEMA-VERSIONING-AND-GIT-TRACEABILITY.md)
(Git ↔ schema traceability) and
[ADR-DB1-009](../adr/database/ADR-DB1-009-PERSISTENCE-AND-TRANSACTION-BOUNDARIES.md)
(persistence/transaction boundaries).

**Unchanged:** DEC-16, DEC-21..DEC-26 (B2/B3) and DEC-27..DEC-30 (NB) remain
open at their original target checkpoints; DB1 verified its decisions do not
preclude any of them.

## 6. DB2 resolution status (added 2026-07-15, Git HEAD `f90f78c`)

Checkpoint **DB2 — Conceptual Domain Model** resolved the B2 decisions.
Original register rows (§2) unchanged; IDs not renumbered.

| ID | Resolution (2026-07-15) | Record | Status | Deferred detail → owner |
| -- | ----------------------- | ------ | ------ | ----------------------- |
| DEC-21 | Customer created only at verified submission (Option A); guest session ≠ Customer; no password/account in MVP; verified-possession linking only (no raw-string auto-merge); audited exceptional merge; grants ≠ identity; Admin identity fully separate | [ADR-DB2-001](../adr/database/ADR-DB2-001-CUSTOMER-IDENTITY-MODEL.md) | Accepted with Deferred Parameters | merge mechanics, uniqueness design, re-verification triggers → DB3/DB4 |
| DEC-24 | Order-owned Shipping Detail, mutable until dispatch then immutable snapshot (Option C); no address book in MVP; recipient may differ from customer; quoted fee in quotation version + final fee in shipping snapshot | [ADR-DB2-002](../adr/database/ADR-DB2-002-SHIPPING-ADDRESS-MODEL.md) | Accepted with Deferred Parameters | post-dispatch correction pattern, anonymization window → DB3 |
| DEC-25 | Persist Notification Intent + append-only Delivery Attempts (Option B); template ref + redacted params, never rendered bodies/secrets/OTP/tokens; distinct from Outbox; operational retention | [ADR-DB2-003](../adr/database/ADR-DB2-003-NOTIFICATION-PERSISTENCE.md) | Accepted with Deferred Parameters | channels/providers (O-005), retention duration → DB3/provider ADR |

**Still open after DB2:** DEC-16, DEC-22, DEC-23, DEC-26 (B3 — DB3) and
DEC-27..DEC-30 (NB) — verified not precluded by the DB2 model
([`DB2_IMPLEMENTATION_HANDOFF.md`](./DB2_IMPLEMENTATION_HANDOFF.md) §1).

## 7. DB3 resolution status (added 2026-07-15, Git HEAD `0563866`)

Checkpoint **DB3 — Lifecycle & Invariant Specification** resolved the B3
decisions. Original register unchanged; IDs not renumbered.

| ID | Resolution (2026-07-15) | Record | Status | Deferred detail → owner |
| -- | ----------------------- | ------ | ------ | ----------------------- |
| DEC-16 | Option A: quotation acceptance gates digitizing; approval gates order creation + both obligations; deposit from accepted total; price change → re-acceptance | [ADR-DB3-001](../adr/database/ADR-DB3-001-APPROVAL-QUOTATION-ORDERING.md) | Accepted | split/soft-hold values = config |
| DEC-22 | Stage matrix S1–S9 + compensation saga; refunds as reviewed records; manual execution | [ADR-DB3-002](../adr/database/ADR-DB3-002-CANCELLATION-REFUND-POLICY.md) | Accepted with Deferred Parameters | stage refund defaults = config (business sign-off) |
| DEC-23 | Hold-and-supersede: order ON_HOLD; job cancel + new job/spec per approval; deposit carries over with obligation recalculation | [ADR-DB3-003](../adr/database/ADR-DB3-003-POST-APPROVAL-PRODUCTION-REVISION.md) | Accepted with Deferred Parameters | hold-release TTL, rounding = config |
| DEC-26 | One request-access grant type + step-up re-verification for locked sensitive set; rotation-on-reissue; revoke-wins-in-tx | [ADR-DB3-004](../adr/database/ADR-DB3-004-SECURE-GRANT-AND-REVERIFICATION.md) | Accepted with Deferred Parameters | expiry/step-up/limit values = config; OTP provider O-005 |

**Still open after DB3:** only NB decisions DEC-27..DEC-30 (object storage,
queue/broker, auth/OTP provider, payment provider) — provider selections by
their own ADRs; the DB3 specs are provider-agnostic by construction.
