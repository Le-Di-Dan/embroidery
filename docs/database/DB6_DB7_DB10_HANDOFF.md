# DB6 → DB7–DB10 Handoff

DB6 (physical schema, migration, and persistence foundation) is complete. This document
lists exactly what remains open for the next phases — DB6 does not implement any of it.

## 1. DB7 — Repository layer, integration & negative validation

| Obligation | Table(s)/column(s) | Guard/constraint/deviation ID | Physical guarantee | Application guarantee needed | Test owner |
|---|---|---|---|---|---|
| TX/App same-root pointer guard | `custom_requests`/`design_cases`/`quotations`/`orders` cross-references | CON-058..060 (TX/App tier, DB4) | none — these are same-transaction application invariants, not DB-enforceable without a cross-table trigger DB6 was never asked to build | repository layer must verify the pointer chain resolves to one root before writing | DB7 |
| Placement hierarchy | product/side/area/variant placement columns | CON-058..060 | column types exist; no DB-level hierarchy CHECK across tables | application-level hierarchy validation before insert | DB7 |
| Secure-grant purpose/scope validation | `secure_access_grants` | REL-105 subset, DEV-DB6-015/016 | `grant_id` FK exists (RESTRICT); no DB-level purpose/scope enforcement | repository must check grant purpose matches the operation before use | DB7 |
| Exact-version eligibility (e.g. quote/design version must be the current one before acceptance) | `quotation_versions`/`design_versions` + their `current_version_id` pointers | REL "current pointer" family, `DB6_RELATIONSHIP_COVERAGE_AUDIT.md` | current-pointer FK exists; no DB-level "is this the current version" CHECK at acceptance time | repository must re-read the current pointer inside the same transaction before accepting | DB7 |
| Append-only/immutability application error handling | all 30 S24 trigger targets | CST-090..100, `DB6_S24_TRIGGER_REPORT.md` | trigger raises `SQLSTATE 23000` with a table-name-only message (no PII) on a rejected mutation | repository must catch `23000` and translate to a client-safe error, not surface the raw Postgres message | DB7 |
| No-FK reference validation | `outbox_events.aggregate_kind/aggregate_id` (REL-104), `audit_events.target_kind/target_id` (REL-103), `notification_intents.recipient_contact_point_id`/`source_outbox_event_id` (DEV-DB6-016) | REL-103/104, DEV-DB6-016 | no physical FK by design — polymorphic/logical references | repository must validate these references against the correct target table itself; the DB cannot | DB7 |
| Repository transactional behavior | all money/state-machine tables | — | migrations are batch-transactional (verified `DB6_MIGRATION_OPERATIONS_RUNBOOK.md` §6); this says nothing about application transaction boundaries | DB7 must define its own transaction scope per use case (e.g. quotation acceptance + order creation) | DB7 |
| Negative integration tests | every CHECK/FK/UNIQUE/trigger in this schema | full manifest | DB6 proved each constraint fires in isolation (disposable-DB fixtures) | DB7 must prove the same constraints fire correctly through the actual repository/ORM call path, including error mapping | DB7 |
| Client-safe error envelopes | all of the above | `docs/development/BACKEND_CONVENTIONS.md` (standard response envelope) | none — DB errors are raw Postgres errors | DB7/API layer must map SQLSTATEs to the envelope, never leak a raw SQL error to a client | DB7 |

## 2. DB8 — Concurrency validation

None of the following have been tested under concurrent load — DB6 only proved structural
correctness (constraints/indexes/triggers exist and fire correctly one request at a time).

| Scenario | Existing physical arbiter | Status |
|---|---|---|
| Stock oversubscription | `sku_stocks` PK + `IDX-016` (`uq_sku_stocks__sku`) lock anchor, `FOR UPDATE`/`SKIP LOCKED` pattern documented in schema comments | arbiter exists, concurrency behavior unverified |
| Soft-hold → reservation conversion | `inventory_soft_holds`/`inventory_reservations` partial-unique active-hold indexes (`IDX-017`, `IDX-018`) | arbiters exist, race behavior unverified |
| Official reservation races | `inventory_reservations` partial unique on active status | arbiter exists, unverified |
| Duplicate Quotation→Order conversion | `quotations`/`orders` current-pointer FKs, `idempotency_records` (CST-048 arbiter) | idempotency table exists; end-to-end double-submit protection unverified |
| Payment callback idempotency races | `idempotency_records`, `payment_provider_events` append-only + `IDX-095`/`IDX-096`-class timeline indexes | table/index exist; concurrent-callback behavior unverified |
| Refund/capture/reconciliation races | `refunds` (CST-100 column-scoped trigger), `payment_reconciliations` (append-only) | triggers exist; concurrent-decision races unverified |
| Current-version lost update | every `current_version_id` pointer family | FK exists; optimistic/pessimistic locking strategy not chosen or tested |
| Production creation/start races | `production_jobs`/`production_job_transitions` (append-only) | append-only evidence trail exists; race prevention at creation unverified |
| Notification worker claim/retry | `notification_intents` partial index `IDX-091` (claimable), `outbox_events` `IDX-088`/`IDX-090` (claim/cleanup) | claim-column indexes exist; actual worker claim logic (`SELECT ... FOR UPDATE SKIP LOCKED`) not implemented or tested — no worker application exists yet |
| Trigger/lock deadlock analysis | all 30 S24 triggers | triggers are `BEFORE UPDATE OR DELETE`, no nested table access — no known deadlock vector, but never load-tested |

**No concurrency correctness claim is made anywhere in DB6's reports.** DB8 owns all of the
above.

## 3. DB9 — Measured performance validation

DB6-S25 completed only the **structural** launch-index implementation (211/211 objects
exist with the correct definitions). None of the following exist yet:

- `EXPLAIN (ANALYZE, BUFFERS)` runs against representative data volumes (every structural
  `EXPLAIN` in DB6's reports ran on 0–2 row disposable tables and explicitly returned
  sequential scans, which is expected and correct at that volume — not a performance
  result).
- Query-shape validation against the DB5 access-path catalog under real data.
- Worker queue throughput/latency behavior (no worker application exists yet).
- Index selectivity measurement (would require populated data).
- Write-amplification measurement for the append-heavy tables (`outbox_events`,
  `audit_events`, `background_job_attempts`, `idempotency_records`, transition tables) —
  DB6-S25's write-amplification section was a structural budget statement (index count per
  table), not a measured cost.
- Trigger overhead measurement (S24's 30 triggers add a `BEFORE` check per UPDATE/DELETE;
  the cost is a few JSONB-diff operations per row — never benchmarked).
- Vacuum/autovacuum tuning for the append-only tables' `retention_exempt` DELETE path.
- Index retirement/tuning evidence (nothing has been retired for underuse; nothing can be
  until real query patterns exist).

**No production performance claim is made anywhere in DB6's reports.**

## 4. DB10 — Backup, retention, and operational durability

Not started. `DB6_MIGRATION_OPERATIONS_RUNBOOK.md` §1.4 explicitly requires an approved
backup/recovery procedure to exist **before** any production migration rollout — DB6 does
not fabricate that evidence and does not implement any of the following:

- Backup procedure (frequency, retention window, storage target).
- Restore rehearsal (proving a backup is actually restorable).
- Point-in-time recovery, if the eventual operational plan requires it.
- Retention jobs for the append-only tables (CST-098's `retention_exempt` DELETE path is a
  *mechanism* — a session GUC an operator job can set — not a scheduled job; no such job
  exists yet).
- Anonymization jobs (`customers.anonymized_at` column exists; no job sets it).
- Asset/audit/notification retention policy execution (`DB4_DELETE_ARCHIVE_RETENTION_MAPPING.md`
  documents the *intended* policy per table; nothing executes it).
- Disaster recovery plan.
- Persistent environment upgrade procedure (how the real dev/staging/production Postgres
  instances get upgraded across migrations over time, as opposed to the disposable-DB
  rehearsal pattern DB6 used for all its own validation).
- Production rollout approvals (organizational sign-off process, not a technical artifact).

## 5. Application / deployment handoff

**Explicit, unambiguous statement:**

```
DB6 complete  ≠  application feature implementation complete
DB6 complete  ≠  production deployment complete
```

Nothing in `apps/` or any NestJS module exists yet that calls this schema. Open, in no
particular priority order, all entirely outside DB6:

- NestJS repositories/services (DB7).
- Worker application (referenced throughout DB6's schema comments as the intended consumer
  of `outbox_events`/`background_job_attempts`/`notification_intents`, never implemented).
- Authorization/authentication wiring (admin session/secure-grant tables exist; no auth
  guard code exists).
- API request validation (no controllers exist).
- Storefront/admin UI (Next.js apps exist as scaffolding per `docs/architecture/`, no
  feature code calling this schema).
- Payment/notification provider adapters (schema models their evidence; no adapter code
  exists).
- Monitoring/observability wiring.
- Actual deployment to any environment beyond the local dev Docker Compose stack.
- Backup/recovery execution (DB10, §4 above).
