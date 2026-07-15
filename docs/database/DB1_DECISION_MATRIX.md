# DB1 — Decision Matrix

**Checkpoint:** DB1 — Persistence Architecture & ADR Lockdown
**Date:** 2026-07-15 · **Git HEAD:** `563d9863c5d9591095038a28887e217058d816e4` · **Branch:** `production`
**Scope:** All 19 B1 decisions from [`DB0_OPEN_DECISIONS.md`](./DB0_OPEN_DECISIONS.md). ADRs live in [`../adr/database/`](../adr/database/).

> **DB1-C1 correction (2026-07-15):** DEC-01/02/03/11/12 entries updated —
> PostgreSQL patch governance (current 16.x baseline **16.14**), ORM
> comparison re-run on current official docs (exclusivity claim removed;
> Prisma partial indexes exist behind the `partialIndexes` Preview feature),
> collation rationale scoped, backup manifest extended. See
> [`DB1_CORRECTION_REPORT.md`](./DB1_CORRECTION_REPORT.md).

Status legend: `Accepted` · `Accepted with Deferred Parameters` (AwDP).
Reversal cost: relative cost of changing the decision after implementation.

---

## Summary table

| DEC | Tier | ADR | Status | Selected option |
| --- | ---- | --- | ------ | --------------- |
| DEC-01 | A | [ADR-DB1-002](../adr/database/ADR-DB1-002-ORM-QUERY-LAYER.md) | Accepted | Drizzle ORM (+ sanctioned raw SQL escape hatch) |
| DEC-02 | A | [ADR-DB1-003](../adr/database/ADR-DB1-003-MIGRATION-STRATEGY.md) | Accepted | drizzle-kit, generated-then-reviewed SQL, immutable shared migrations |
| DEC-03 | A | [ADR-DB1-001](../adr/database/ADR-DB1-001-POSTGRESQL-VERSION.md) | Accepted | PostgreSQL major 16 + governed reviewed patch pin (baseline 16.14 at DB1-C1; DB6 applies); UTF8/UTC; `C` default scoped to technical ordering |
| DEC-04 | A | [ADR-DB1-007](../adr/database/ADR-DB1-007-ID-STRATEGY.md) | Accepted | UUIDv7 (app-generated) business / bigint identity append-only / separate codes |
| DEC-05 | A | [ADR-DB1-008](../adr/database/ADR-DB1-008-STATUS-REPRESENTATION.md) | Accepted | text + CHECK constraint; TS constants as source; PG enums prohibited |
| DEC-06 | B | [ADR-DB1-012](../adr/database/ADR-DB1-012-DESIGN-DOCUMENT-CANONICALIZATION.md) | AwDP | `packages/design-document` owns; RFC 8785 JCS + SHA-256; versioned payload |
| DEC-07 | A | [ADR-DB1-006](../adr/database/ADR-DB1-006-NAMING-CONVENTIONS.md) | Accepted | snake_case, plural tables, explicit constraint names, `_at` timestamptz UTC |
| DEC-08 | A | [ADR-DB1-005](../adr/database/ADR-DB1-005-DATABASE-SCHEMA-ORGANIZATION.md) | Accepted | Single schema `public` + documented module ownership map |
| DEC-09 | B | [ADR-DB1-010](../adr/database/ADR-DB1-010-IMMUTABILITY-ENFORCEMENT.md) | AwDP | Defense-in-depth: app guards + versioned records + DB reject-mutation triggers |
| DEC-10 | A | [ADR-DB1-011](../adr/database/ADR-DB1-011-DELETE-ARCHIVE-RETENTION.md) | Accepted | Category framework (archive/hard-delete/anonymize/immutable/tombstone) |
| DEC-11 | A | [ADR-DB1-014](../adr/database/ADR-DB1-014-BACKUP-AND-RESTORE.md) | Accepted | `pg_dump -Fc` + JSON manifest + SHA-256, off-site, scheduled |
| DEC-12 | A | [ADR-DB1-014](../adr/database/ADR-DB1-014-BACKUP-AND-RESTORE.md) | Accepted | Same-major restore; restore-then-forward-migrate; manifest-gated compatibility |
| DEC-13 | B | [ADR-DB1-011](../adr/database/ADR-DB1-011-DELETE-ARCHIVE-RETENTION.md) | AwDP | Named retention classes + configured durations + audited worker cleanup |
| DEC-14 | B | [ADR-DB1-018](../adr/database/ADR-DB1-018-INVENTORY-RESERVATION-EXPIRY.md) | AwDP | Explicit `expires_at` + configurable policy + idempotent audited sweep |
| DEC-15 | B | [ADR-DB1-017](../adr/database/ADR-DB1-017-IDEMPOTENCY-POLICY.md) | AwDP | DB-arbitrated records: (namespace, scope key) unique + fingerprint + TTL classes |
| DEC-17 | A | [ADR-DB1-013](../adr/database/ADR-DB1-013-MULTI-MACHINE-AND-DOCKER-VOLUMES.md) | Accepted | One volume per repo/machine + mandatory schema-mismatch check + disposable dev data |
| DEC-18 | A | [ADR-DB1-003](../adr/database/ADR-DB1-003-MIGRATION-STRATEGY.md) | Accepted | Forward-only/forward-fix; no `down` as recovery path; backup before destructive |
| DEC-19 | A | [ADR-DB1-015](../adr/database/ADR-DB1-015-SEED-STRATEGY.md) | Accepted | 3 tiers (system/dev/test), idempotent upsert, deterministic IDs, never in migrations |
| DEC-20 | A | [ADR-DB1-016](../adr/database/ADR-DB1-016-TEST-DATABASE-STRATEGY.md) | Accepted | Real pinned PostgreSQL, template-DB-per-worker, rollback + truncate modes |

Cross-cutting policy ADRs without their own DEC ID:
[ADR-DB1-004](../adr/database/ADR-DB1-004-SCHEMA-VERSIONING-AND-GIT-TRACEABILITY.md)
(Git ↔ schema traceability, supports DEC-02/03/17/18) and
[ADR-DB1-009](../adr/database/ADR-DB1-009-PERSISTENCE-AND-TRANSACTION-BOUNDARIES.md)
(persistence/transaction ownership, DB1 Task R).

---

## Per-decision detail

### DEC-01 — ORM / query layer (Tier A, Accepted)

- **ADR:** ADR-DB1-002 · **REQ:** REQ-OPS-001, REQ-INT-001/002/004/005, REQ-PAY-005, REQ-SESS-003, REQ-OUTBOX-001, REQ-IDEM-001 · **INV:** INV-01/07/11/16/18/19/23/24/25 · **GAP:** —
- **Options:** Prisma, Drizzle, MikroORM, TypeORM (+ Kysely/raw-SQL as supplements). *(DB1-C1: all four can express partial indexes + CHECK per current official docs — no capability exclusivity.)*
- **Selected:** Drizzle ORM; raw SQL sanctioned inside module persistence adapters.
- **Rationale (refreshed):** best overall fit — stable (non-Preview) native declaration of partial unique indexes + CHECK in the schema source of truth; SQL-like explicit model without UoW/Active-Record magic; reviewable SQL migrations; raw-SQL escape hatch. Prisma's partial indexes are Preview-gated; MikroORM's partial indexes drop to raw DDL strings + UoW magic; TypeORM has documented index-sync limitations and weakest typing.
- **Deferred:** exact compatible pins of drizzle-orm/drizzle-kit/driver + compatibility spike → DB6 (row-lock spike: plain FOR UPDATE, NOWAIT, SKIP LOCKED, in-transaction behavior, concurrent reservation, generated-SQL assertions).
- **Impl:** DB6 · **Verify:** DB7/DB8 · **Reversal:** medium (adapters only; SQL history tool-agnostic).
- **Risks:** pre-1.0 churn (pin exact versions); under-documented locking (spike + raw-SQL fallback).
- **Multi-machine:** TS schema + SQL migrations fully Git-tracked; no machine-local codegen state.

### DEC-02 — Migration framework (Tier A, Accepted)

- **ADR:** ADR-DB1-003 · **REQ:** REQ-OPS-001/005/006/007 · **INV:** INV-26..31 · **GAP:** —
- **Options:** drizzle-kit; standalone runner (node-pg-migrate/Flyway); Prisma Migrate.
- **Selected:** drizzle-kit; generated-then-reviewed; `--custom` for data/trigger/destructive SQL; single linear history owned by the API app.
- **Rationale:** native to chosen ORM; plain SQL artifacts; one tool/one history for 1–3 devs.
- **Deferred:** exact directory path/commands → DB6.
- **Impl:** DB6 · **Verify:** DB7/DB10 · **Reversal:** low-medium (plain SQL replayable).
- **Risks:** branch timestamp interleaving (rebase-and-regenerate rule); snapshot corruption (CI fresh-install arbiter).
- **Multi-machine:** migrations are the only schema channel between machines.

### DEC-03 — PostgreSQL version (Tier A, Accepted — amended DB1-C1)

- **ADR:** ADR-DB1-001 · **REQ:** REQ-OPS-004/013, REQ-INT-003 · **INV:** INV-28/29/34 · **GAP:** GAP-02 (resolved: version policy now documented as locked).
- **Options:** major 16 + governed patch pin; move to 17; float major tag; freeze on repo's 16.6.
- **Selected:** major 16 locked; **governed patch policy** — one reviewed exact tag tracking the current 16.x (official baseline **16.14** at correction date; Compose's `16.6-alpine` is stale state, replaced at DB6 with `16.14-alpine` or newer reviewed); patch bumps = controlled maintenance change with release-notes review + migration/smoke gates. UTF8 + UTC; default collation `C` scoped to technical deterministic ordering (Vietnamese user-facing text gets explicit ICU/locale-aware design at DB4/DB5; hashing independent of collation); no baseline extensions; major upgrades need ADR + backup + separate runbook.
- **Deferred:** production image variant → deployment ADR; per-column/ICU collation design → DB4/DB5; exact tag re-confirmation → DB6.
- **Impl:** DB6 · **Verify:** DB7/DB10 · **Reversal:** major upgrade = standard dump/restore; collation-default change = expensive (locked deliberately).
- **Risks:** forgotten patch bumps (governance + DB10 currency check); collation-version drift once ICU collations exist (REINDEX discipline in runbook).
- **Multi-machine:** identical engine + recorded locale/collation everywhere; manifest-tagged backups.

### DEC-04 — ID strategy (Tier A, Accepted)

- **ADR:** ADR-DB1-007 · **REQ:** REQ-INT-004, REQ-REQ-005, REQ-DVER-006 · **INV:** INV-19/32 · **GAP:** —
- **Options:** UUIDv4, UUIDv7, ULID, bigint identity.
- **Selected:** UUIDv7 app-generated (business), bigint identity (append-only internal), separate human `code` columns; branded TS ID types; IDs never a security boundary.
- **Deferred:** library choice → DB6; code formats → DB3/DB4.
- **Impl:** DB6/DB4 · **Verify:** DB7/DB9 · **Reversal:** high after data (locked now).
- **Risks:** clock skew (locality-only concern); v7 timestamp leakage (token overlay if ever needed).
- **Multi-machine:** coordination-free generation on any machine/worker.

### DEC-05 — Status representation (Tier A, Accepted)

- **ADR:** ADR-DB1-008 · **REQ:** REQ-INT-005, REQ-REQ-002, REQ-QUOT-005, REQ-ORD-001, REQ-PAY-004 · **INV:** INV-14/17 · **GAP:** GAP-01 (constraint respected: names stay provisional until DB3).
- **Options:** native PG enum, text+CHECK, lookup table, integer code, app-only.
- **Selected:** text + named CHECK; TS const tuples as single source; PG enums prohibited; lookup table only with metadata justification.
- **Deferred:** final state names → DB3 (GAP-01 owner — not a parameter of this ADR).
- **Impl:** DB4/DB6 · **Verify:** DB7 (incl. TS↔DB set introspection test) · **Reversal:** low.
- **Risks:** TS/CHECK drift (DB7 introspection test).
- **Multi-machine:** value sets live in Git-tracked constants + migrations.

### DEC-06 — Design-document canonicalization & hashing (Tier B, AwDP)

- **ADR:** ADR-DB1-012 · **REQ:** REQ-SESS-003, REQ-DVER-002/006, REQ-APPR-001, REQ-INT-006 · **INV:** INV-03/32 · **GAP:** —
- **Options:** naive stringify, ad hoc key sorting, RFC 8785 JCS, custom serializer.
- **Selected (architecture):** owner `packages/design-document`; DB stores versioned opaque `jsonb` payload + `document_schema_version`; RFC 8785 JCS canonical form; NFC at ingest; SHA-256; `sha256:<hex>` storage; separate preview hash; backward-read, snapshots never migrated in place.
- **Deferred (parameters):** document JSON schema, validation rules, JCS implementation choice, doc-migration mechanics → DB2/DB4 + package-owning checkpoint. DB2 safe: ownership/versioning/hash semantics locked.
- **Impl:** package CP + DB4/DB6 · **Verify:** DB7 (golden hashes cross-machine), DB8 · **Reversal:** moderate (dual-hash transition).
- **Risks:** JCS edge-case deviation (RFC test vectors in CI).
- **Multi-machine:** spec-grounded hash reproducibility is the point (INV-32).

### DEC-07 — Naming conventions (Tier A, Accepted)

- **ADR:** ADR-DB1-006 · **REQ:** REQ-INT-001/003, REQ-OPS-001 · **INV:** INV-11/25 · **GAP:** —
- **Options:** snake_case vs quoted camelCase; singular vs plural; explicit vs generated constraint names.
- **Selected:** snake_case; plural tables; `id`/`<entity>_id`/`code`; `_at` timestamptz UTC; `is_` booleans; `numeric` `_amount` money; explicit `pk_/fk_/uq_/ck_/ix_/tg_` names; timestamped migration slugs.
- **Deferred:** money precision/currency design → DB4.
- **Impl:** DB4/DB6 · **Verify:** DB7 (introspection naming assertions) · **Reversal:** high after DB6 (locked now).
- **Risks:** drift (review checklist + DB7 check).
- **Multi-machine:** deterministic names ⇒ identical DDL everywhere.

### DEC-08 — Schema organization (Tier A, Accepted)

- **ADR:** ADR-DB1-005 · **REQ:** REQ-INT-002, REQ-OPS-004 · **INV:** INV-25 · **GAP:** —
- **Options:** A single schema / B schema-per-module / C prefixes.
- **Selected:** A — single `public` schema; one owning module per table (documented map); cross-module FK = reference only; tool history table may sit in its own schema.
- **Deferred:** ownership map contents → DB2/DB4.
- **Impl:** DB6 · **Verify:** DB7/DB10 · **Reversal:** low-medium (`SET SCHEMA` later).
- **Risks:** boundary erosion (ADR-DB1-009 rules + lint + review).
- **Multi-machine:** simplest possible migrate/backup/reset story.

### DEC-09 — Immutability enforcement (Tier B, AwDP)

- **ADR:** ADR-DB1-010 · **REQ:** REQ-APPR-001/002, REQ-QUOT-002/004, REQ-DVER-005, REQ-AUDIT-001/003 · **INV:** INV-01/02/03/12/14/17 · **GAP:** —
- **Options:** app-only, append-only model, DB triggers, revoked privileges, snapshot tables, versioned+pointer, combination.
- **Selected (architecture):** defense-in-depth — no-update repositories + data classes (immutable snapshot / append-only / mutable header + immutable versions) + `BEFORE UPDATE OR DELETE` reject triggers; corrections only via superseding version/void/correction record; break-glass = audited operator migration only.
- **Deferred (parameters):** per-table class mapping → DB3/DB4; privilege-separation role model → DB6/DB10 hardening. DB2 safe: modeling vocabulary locked.
- **Impl:** DB6 · **Verify:** DB7/DB8/DB10 · **Reversal:** low (per-table triggers).
- **Risks:** missing trigger on new table (generic DB7 iteration test).
- **Multi-machine:** triggers ship in migrations — identical enforcement everywhere.

### DEC-10 — Delete/archive strategy (Tier A, Accepted)

- **ADR:** ADR-DB1-011 · **REQ:** REQ-RETEN-002, REQ-SESS-005, REQ-ASSET-006 · **INV:** INV-12/14 · **GAP:** —
- **Options:** global soft-delete, per-table ad hoc, category framework.
- **Selected:** category framework — archive states (catalog/content), hard delete (transient), anonymize (PII in commercial history), immutable retained (commercial/audit/ledger), two-phase tombstone (assets), TTL delete (outbox/idempotency).
- **Deferred:** none for the strategy itself (durations are DEC-13).
- **Impl:** DB4/DB9 · **Verify:** DB7/DB10 · **Reversal:** low-medium per category.
- **Risks:** semantic misassignment (DB4 ownership-map review).
- **Multi-machine:** semantics in Git-tracked schema/docs, not local practice.

### DEC-11 — Backup tool/format (Tier A, Accepted)

- **ADR:** ADR-DB1-014 · **REQ:** REQ-OPS-002/003, REQ-ASSET-007 · **INV:** INV-33 · **GAP:** GAP-07 (strategy now locked; runbooks remain DB10).
- **Options:** pg_dump -Fc, plain SQL dump, base backup/PITR, volume snapshot, managed snapshot.
- **Selected:** scheduled `pg_dump -Fc` + JSON manifest (**exact** PG version, locale/collation config, migration set, git commit, SHA-256) + off-site encrypted/access-controlled copy; PITR named as escalation path. *(DB1-C1: manifest fields extended.)*
- **Deferred:** cadence/off-site target (O-007 topology) → operations/DB10.
- **Impl:** DB6 hooks + DB10 · **Verify:** DB10 (RB-04/05) · **Reversal:** low (additive).
- **Risks:** untested backups (DP-04 restore-test gate); missing off-site target flagged as go-live blocker.
- **Multi-machine:** manifest makes any backup portable/decidable on any machine.

### DEC-12 — Restore compatibility (Tier A, Accepted)

- **ADR:** ADR-DB1-014 · **REQ:** REQ-OPS-002/003 · **INV:** INV-34 · **GAP:** GAP-07
- **Selected:** same-major restore within the supported PostgreSQL 16 baseline with **mandatory pre-restore target compatibility check** (major version, locale/collation, migration IDs); restore-then-forward-migrate retained; never restore newer-than-code; schema recovery from Git only, data recovery from backup; major-version restore/upgrade = separate runbook; verified restore = scratch restore + verification command + smoke checks; DB-before-assets restore order. *(DB1-C1: pre-check + runbook separation made explicit.)*
- **Impl/Verify/Reversal/Risks/Multi-machine:** as DEC-11.

### DEC-13 — Retention framework (Tier B, AwDP)

- **ADR:** ADR-DB1-011 · **REQ:** REQ-RETEN-001/002, REQ-AUDIT-003, REQ-IDEM-002, REQ-SESS-001/005 · **INV:** INV-24 · **GAP:** —
- **Selected (architecture):** classes `transient`/`operational`/`commercial-record`/`audit`/`backup`; durations = versioned business config, never hard-coded; explicit start events; delete-vs-anonymize per binding; legal-hold concept; audited worker cleanup; default-safe = no deletion when unconfigured.
- **Deferred (parameters):** all durations (O-008/O-012) → DB3 + business sign-off (Decision Log); hold modeling → DB2/DB4. DB2 safe: classes/semantics locked.
- **Impl:** DB4/DB6/DB9 · **Verify:** DB8/DB10 · **Reversal:** low.
- **Risks:** durations never locked (handoff register + DB10 audit).
- **Multi-machine:** config-driven; no machine-local cleanup policy.

### DEC-14 — Reservation expiry (Tier B, AwDP)

- **ADR:** ADR-DB1-018 · **REQ:** REQ-INV-003/004/005/007 · **INV:** INV-05/18/19 · **GAP:** —
- **Selected (architecture):** soft hold ≠ official reservation; creation gate locked (approval + verified deposit); explicit `expires_at` from configurable audited policy; idempotent release/consume/expire; expiry never yields negative stock; manual override = reason + audit; worker sweep.
- **Deferred (parameters):** TTL durations, insufficient-stock behavior → DB3/business. DB2 safe: concepts and gates locked.
- **Impl:** DB4/DB6/DB9 · **Verify:** DB8 · **Reversal:** low.
- **Risks:** unconfigured TTL (soft holds disabled until configured).
- **Multi-machine:** timestamp-based expiry is machine-independent.

### DEC-15 — Idempotency policy (Tier B, AwDP)

- **ADR:** ADR-DB1-017 · **REQ:** REQ-IDEM-001/002, REQ-PAY-005, REQ-REQ-004 · **INV:** INV-07/19/24 · **GAP:** —
- **Selected (architecture):** PostgreSQL-arbitrated records — unique `(operation_namespace, scope_key)` + payload fingerprint; IN_PROGRESS/COMPLETED/expired; replay stored result; conflict on fingerprint mismatch; provider callbacks keyed by server-side provider references (never client-only); TTL classes in config; audited cleanup.
- **Deferred (parameters):** per-operation TTLs, result shapes, stuck-in-progress timeouts → DB3/DB4/DB8. DB2 safe: concept + owner module placement locked.
- **Impl:** DB4/DB6 · **Verify:** DB8 · **Reversal:** low.
- **Risks:** fingerprint canonicalization drift (reuse ADR-DB1-012 facility).
- **Multi-machine:** DB-arbitrated, no local caches as truth.

### DEC-17 — Volumes / branch divergence / cross-machine (Tier A, Accepted)

- **ADR:** ADR-DB1-013 (with ADR-DB1-004 check semantics) · **REQ:** REQ-OPS-004/005/008/009 · **INV:** INV-28/29/30/35 · **GAP:** —
- **Options:** shared volume per repo, volume per branch, forced fresh volume per switch.
- **Selected:** one named volume per repo/machine + mandatory verification command on pull/switch; behind ⇒ migrate; divergent ⇒ reset+migrate+seed; hash mismatch ⇒ stop/investigate; dev data disposable; recreate-not-transfer across machines; pg_dump before risky local ops recommended.
- **Deferred:** command wiring → DB6; runbooks → DB10.
- **Impl:** DB6 · **Verify:** DB7/DB10 · **Reversal:** trivial.
- **Risks:** skipped checks (dev startup runs check automatically).
- **Multi-machine:** this decision *is* the multi-machine policy.

### DEC-18 — Rollback vs forward-fix (Tier A, Accepted)

- **ADR:** ADR-DB1-003 · **REQ:** REQ-OPS-006/008 · **INV:** INV-26/27/31 · **GAP:** —
- **Selected:** forward-only/forward-fix; no `down` migrations authored or relied on; local recovery = reset; unshared branch migrations regenerable; production recovery = pre-migration backup + forward-fix; 9-step failed-migration policy; history reconciliation = explicit operator action only.
- **Impl:** DB6 · **Verify:** DB7/DB10 (RB-06) · **Reversal:** low.
- **Risks:** partial application from non-transactional DDL (flagged in review; backup gate).
- **Multi-machine:** linear forward-only history is what makes volumes disposable.

### DEC-19 — Seed strategy (Tier A, Accepted)

- **ADR:** ADR-DB1-015 · **REQ:** REQ-OPS-011/009 · **INV:** — (PR-06) · **GAP:** —
- **Selected:** 3 tiers (system / dev demo / test fixtures); idempotent upsert; deterministic fixed IDs + explicit ordering; separate from migrations; env-guarded; no secrets; prod bootstrap = migrations + system seed.
- **Deferred:** datasets/commands → DB9.
- **Impl:** DB9 (DB6 plumbing) · **Verify:** DB9/DB10 · **Reversal:** trivial.
- **Risks:** demo-seed drift (CI migrate+seed).
- **Multi-machine:** same commit ⇒ identical baseline on every machine.

### DEC-20 — Test database strategy (Tier A, Accepted)

- **ADR:** ADR-DB1-016 · **REQ:** REQ-OPS-012 · **INV:** INV-07/16/18/19/28/29 · **GAP:** —
- **Selected:** real pinned PostgreSQL only (fakes prohibited for DB behavior); migrate-before-test via template DB; database-per-worker; rollback-per-test default + truncate mode for committed-state concurrency tests; real parallel connections for races; `embroidery_test*` name guard; CI parity.
- **Deferred:** test runner selection (O-001, outside DB scope) → testing-stack ADR.
- **Impl:** DB7/DB8 · **Verify:** DB7/DB8/DB10 · **Reversal:** low.
- **Risks:** suite speed (template cloning keeps per-test cost low).
- **Multi-machine:** Docker + migrations ⇒ identical test envs everywhere.

---

## Cross-decision consistency check (performed at DB1)

- Drizzle ↔ drizzle-kit: same toolchain (DEC-01/02). ✔
- drizzle-kit forward-oriented model ↔ forward-only policy (DEC-02/18). ✔
- Single schema ↔ single linear migration history ↔ volume check simplicity (DEC-08/02/17). ✔
- UUIDv7 app-generated ↔ PG `uuid` type ↔ no extension requirement (DEC-04/03). ✔
- text+CHECK ↔ provisional DB3 state names (cheap transactional set changes) (DEC-05, GAP-01). ✔
- Immutability triggers = hand-authored `--custom` migrations (DEC-09/02). ✔
- Backup manifest schema-version definition = ADR-DB1-004 migration-set model; same-major restore ↔ exact version pin (DEC-11/12/03). ✔
- Volume reset legality ↔ forward-only + deterministic seeds (DEC-17/18/19). ✔
- Test strategy proves partial unique/locking/isolation claims relied on by DEC-01/09/14/15 (DEC-20). ✔
- JCS+SHA-256 hashing machine-independent (DEC-06 ↔ INV-32); idempotency fingerprints reuse the same canonical facility (DEC-15/06). ✔
- Seeds never inside schema migrations (DEC-19/02). ✔
- No conflict with any LOCKED DB0 requirement identified.
