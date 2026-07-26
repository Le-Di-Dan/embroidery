# APP2-DEC-JOBS — Candidate Comparison and Controlled Spike (research appendix)

Supporting evidence for `ADR-APP2-002` / IMP-D029. Research and spike notes
only; the ADR is authoritative.

## 1. Candidates

| | Runtime | Verdict |
|---|---|---|
| J1 | PostgreSQL-backed claim queue on existing persistence (`outbox_events` + `background_job_attempts`, `FOR UPDATE SKIP LOCKED`) | **Selected** |
| J2 | Redis + BullMQ | Rejected |
| J3 | RabbitMQ | Rejected |

External candidates reviewed from official current sources (BullMQ docs,
RabbitMQ docs, checked 2026-07-26); **no packages installed**. A bounded
external-broker spike was **not** required — the disqualifier is architectural
(loss of transactional coupling to the domain Postgres write + a second source
of truth), not a measured-performance question, and `ADR-DB5-003` already
records the outbox as the transactional handoff regardless of any broker.

## 2. Why J1 (decision drivers)

- Job creation shares the **domain transaction** (outbox invariant INV-23); J2/J3
  publish outside it and would need a Postgres→broker relay — i.e. J1 plus a
  second store.
- The durable path is **already shipped and indexed** (`ADR-DB5-003`):
  `NO_APP2_MIGRATION`, no new runtime dependency.
- Single-node APP2 scale (<100 orders/month) needs durability + bounded retry +
  crash recovery, not brokered throughput.
- One datastore to run/seed/reset locally; jobs test on disposable Postgres.

## 3. Controlled spike

- **Environment:** disposable Postgres 16 (Docker, throwaway DB), the **real 31
  migration files** applied verbatim (78 base tables), mirrored store SQL only —
  **no repository source imported, none modified**. Fully torn down afterwards
  (container removed, workspace deleted); the dev stack (6 containers) was left
  untouched. **Zero residue.**
- **Model proven:** outbox as durable work signal; claim = `FOR UPDATE SKIP
  LOCKED`; **lease = visibility timeout on `next_attempt_at`** (ADR §D4);
  append-only attempts written outside the domain tx.

### Results — 23 / 23 PASS

| Check | Result |
|---|---|
| migrations-applied / table-count | 31 files / 78 tables |
| claim-index / cleanup-index / deadletter-index present | ✅ |
| lease/claim mutation columns permitted (CST-099) | ✅ |
| `payload` update rejected (INV-23) | ✅ |
| row `DELETE` on `outbox_events` rejected (append-only, ADR §D9) | ✅ (via trigger; spike resets with `TRUNCATE`) |
| exclusive claim — two workers, no overlap (`SKIP LOCKED`) | ✅ `wA=3 wB=2 overlap=0` |
| FIFO ordering `(next_attempt_at NULLS FIRST, id)` | ✅ |
| lease blocks concurrent reclaim | ✅ |
| retry deferred before backoff, claimable after | ✅ |
| crash → reclaim after lease expiry, `attempt_count` incremented | ✅ (`attempt_count=2`) |
| terminal dead-letter excluded permanently | ✅ |
| append-only attempt survives rolled-back domain tx | ✅ |
| `(job_kind,job_key,attempt_no)` uniqueness (CST-049) | ✅ |
| duplicate relay → one `DISPATCHED` (idempotent effect) | ✅ |
| shutdown stops new claims, resumes when not draining | ✅ |

### Notable finding

The S24 integrity trigger (`fn_reject_mutation_conditional`, migration 0030)
**rejects row `DELETE` on `outbox_events`** and freezes `payload`/identity,
permitting only the CST-099 dispatch columns. This confirms both that the D4
lease write is legal and that worker cleanup must never delete outbox rows
(ADR §D9) — `DISPATCHED` cleanup is a retention-sweep concern outside APP2.

## 4. Deferred / configuration (not decided here)

Backoff curve, max attempts, lease duration, poll interval, batch size `n` →
`policy_configurations` (owner `APP2-I02`/`APP2-W01`). Image-processing library
→ `APP2-W01`. Priority and heartbeat → out of scope, re-openable by ADR.
