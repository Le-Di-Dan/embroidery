# DB5 — Index Design: Notification, Audit & Platform (CTX-NTF / CTX-AUD / CTX-PLT)

**Date:** 2026-07-18 · **Git HEAD:** `456e101`
**Tables:** TBL-070..TBL-077
**Index IDs:** IDX-057..061, 088, 090..098, 131

Every table here is append-heavy or high-churn. This is where index
restraint matters most: `outbox_events` is polled continuously and
`audit_events` grows without bound. Governance:
[ADR-DB5-004](../adr/database/ADR-DB5-004-INDEX-GOVERNANCE.md) R6,
[ADR-DB5-003](../adr/database/ADR-DB5-003-WORKER-CLAIM-INDEXING.md).

## 1. Outbox — the claim path (Q-27 / QX-04) · P0

`outbox_events` (TBL-073) is the **highest-write table in the system**. Its
index set is exactly three, and that number is a decision, not an accident.

| # | Index | Purpose |
|---|---|---|
| 1 | PK (CST-001, `bigint` identity) | by-id, FIFO tie-break |
| 2 | **IDX-088** `(next_attempt_at NULLS FIRST, id) WHERE status='PENDING'` | claim |
| 3 | IDX-090 `(dispatched_at, id) WHERE status='DISPATCHED'` | cleanup |

### IDX-088 in detail

- **Partial predicate is the *stable* part only** — `status='PENDING'`.
  The time filter is deliberately **not** in the predicate: `now()` is not
  immutable and cannot appear in an index predicate at all, and a baked-in
  literal would be wrong the moment time advanced (ADR-DB5-003 R3).
- **The time filter becomes a range scan on the key.** The query is
  `status='PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= now())`;
  the planner scans the index from the start and stops when it passes `now()`.
- **`NULLS FIRST` is load-bearing.** `next_attempt_at` is nullable
  (COL-TBL073-07) and NULL means "never deferred, eligible immediately".
  PostgreSQL's default for an ascending key is `NULLS LAST`, which would put
  every *fresh* event at the far end of the index — the exact opposite of
  FIFO. Getting this wrong would not error; it would quietly make the relay
  scan the whole index on every poll.
- **The claimable set drains.** `DISPATCHED`, `FAILED` and `DEAD_LETTER`
  rows are structurally excluded, so a million dispatched events cost this
  index nothing. This is what makes a polled query on an unbounded table
  cheap forever.
- **Claim mechanism:** `FOR UPDATE SKIP LOCKED` (CC-25, GRD-029, CST-124) —
  a DB6 spike with a documented single-worker fallback (ADR-DB5-003 R7).
- **Claim must exit the set in the same transaction**: `status`,
  `claimed_by`, `claimed_at` are set before commit, all within the
  column-scoped mutable set (CST-099). `payload` is never touched (INV-23).

### What is rejected on this table

- `event_type` index (IDX-R02) — Q-33 is P3 with deferred tooling.
- `(aggregate_kind, aggregate_id)` index (REL-104) — no catalogued query
  reads the outbox by aggregate.
- **Any GIN index on `payload`** (IDX-R10) — the payload is immutable and
  opaque; claims filter on relational status columns by design
  (ADR-DB4-004 #4).

## 2. Notification — separate from the outbox

`notification_intents` (TBL-070) is a `CONTENDED_CLAIM` queue in its own
right.

| Path | Predicate | Index |
|---|---|---|
| Intent dedup | `intent_key` | IDX-057 (CST-047) |
| **QX-03** retry scan | `status IN ('PENDING','PROCESSING')` | IDX-091 `(created_at, id)` |
| Attempt history / counts | `(intent_id, attempted_at)` | IDX-092 |

**Notification lifecycle is never joined to the outbox.** REL-101
(`source_outbox_event_id`) is a **nullable one-way trace** — outbox rows are
cleaned on TTL while intents persist on their own schedule — and it is
**not indexed** (IDX-R14 family). The two claim paths are independent by
design (ADR-DB2-003); an index bridging them would invite exactly the
coupling the ADR rejected.

`intent_key` (CST-047) is the **deterministic dedup key** derived from
(source event, recipient, template) — GRD-012 `notification.intent`. It
collapses duplicate messages at the uniqueness level (CC-26), so no locking
is needed for that race.

IDX-092 is the only non-PK index on `notification_delivery_attempts`
(append-heavy). It serves both "attempts for this intent" and the
attempt-count/backoff input in one composite.

`params` (JSONB) is **not indexed**: redacted typed references only, with
**structural exclusion of OTP/tokens/URLs** (D7-12). Ops filtering uses
`status`, `template_key`, `channel` — relational columns (ADR-DB4-004 #8).

`recipient_masked` (COL-TBL070-05) is a masked display copy and is never a
lookup key.

## 3. Audit (Q-29)

`audit_events` (TBL-072) is append-only and unbounded, with **four
genuinely distinct** catalogued lookup forms.

| Form | Predicate | Index |
|---|---|---|
| (a) by target | `(target_kind, target_id)` | IDX-095 `(target_kind, target_id, occurred_at DESC, id DESC)` |
| (b) by admin actor | `admin_id IS NOT NULL` | IDX-098 `(admin_id, occurred_at DESC, id DESC)` |
| (c) by time range | `occurred_at` | IDX-096 `(occurred_at DESC, id DESC)` |
| (d) by correlation | `correlation_id` | IDX-097 |

IDX-095 composite justification: the two target columns are **equality**
predicates and lead; `occurred_at DESC, id DESC` matches the sort exactly;
`id` is the tie-breaker. **REL-103 is polymorphic with no physical FK** (a
justified DB4 exception), so this composite index is the *only* access path
to a target's audit trail — there is no parent table to join from.

Pagination is `IMMUTABLE_CURSOR` (ADR-DB5-001 R5): rows never change after
insert, so a cursor is exact and offset paging on an unbounded append-only
table is avoided.

`summary` (JSONB) is **not indexed** — before/after reference summary,
redacted; audit queries filter on actor/action/target/time **columns**
(ADR-DB4-004 #7).

`action` (COL-TBL072-04) is **not indexed**: no catalogued query filters by
action code alone, and it would be low-selectivity across a large table.

## 4. Idempotency (Q-28 / QX-05) · P0

`idempotency_records` (TBL-074) is the second-highest-write table. Three
indexes, capped:

| # | Index | Purpose |
|---|---|---|
| 1 | PK | — |
| 2 | **IDX-058** `(operation_namespace, scope_key)` unique (CST-048) | the arbiter |
| 3 | IDX-093 `(expires_at, id)` | TTL cleanup |
| + | IDX-094 `(claimed_at, id) WHERE status='IN_PROGRESS'` | stuck-record recovery |

IDX-058 is **the double-execution arbiter** (INV-19/24, GRD-012). The claim
transaction relies on uniqueness rather than a lock — a conflicting insert
loses deterministically (CC-07/11/18, D7-08 / D8-25, both critical).

`fingerprint` (COL-TBL074-03) is **compared after the probe, never
indexed**: a mismatch on the same key is a conflict (CST-125 / GRD-030), and
that comparison happens on the single row the unique index already located.

IDX-094 handles stuck `IN_PROGRESS` records whose worker died mid-claim
(COL-TBL074-07 timeout input). The partial predicate keeps it near-empty.

IDX-093 is intentionally **non-partial** — every record expires eventually,
so a predicate would exclude nothing and only add planner complexity.

`result` (JSONB) is not indexed — a minimal replayable outcome, opaque by
construction (ADR-DB4-004 #5).

## 5. Background jobs and dead-letter

| Path | Index |
|---|---|
| Attempt uniqueness | IDX-059 (CST-049, `(job_kind, job_key, attempt_no)`) |
| Dead-letter visibility | IDX-131 `(finished_at, id) WHERE is_dead_letter` |

Dead-letter *visibility* is deliberately a **separate index from any claim
path** (ADR-DB5-003 R5). Terminal failures must be visible to an
administrator but must never re-enter a worker scan; keeping them in a
distinct tiny partial index makes both properties structural. Manual requeue
creates a **new job**, not a mutation of the dead-letter row
(COL-TBL075-05).

## 6. Policy configuration

| Path | Index |
|---|---|
| Config by key | IDX-060 (CST-050) |
| Versions | IDX-061 (CST-050) |

`policy_configurations` is read constantly (TTL classes, deposit percent,
code formats, page sizes, batch sizes) but is tiny and read through the
`config_key` unique probe then the `current_version_id` pointer. **No
performance index**; the honest optimization here is application-level
caching, not a database index.

`value` (JSONB) is read whole per key — not indexed (ADR-DB4-004 #9).

## 7. Write-cost summary

| Table | Profile | Indexes (incl. PK) | Budget | Status |
|---|---|---|---|---|
| TBL-070 notification_intents | high churn | 3 | ≤3 | at budget |
| TBL-071 delivery_attempts | **append-heavy** | 2 | ≤3 | ok |
| TBL-072 audit_events | **append-heavy, unbounded** | **5** | ≤3 | **over budget — justified** |
| TBL-073 outbox_events | **highest-write** | 3 | ≤3 | at budget |
| TBL-074 idempotency_records | **high-write** | 4 | ≤3 | **over budget — justified** |
| TBL-075 job_attempts | append | 3 | ≤3 | at budget |
| TBL-076 policy_configurations | read-mostly tiny | 2 | ≤6 | ok |
| TBL-077 config_versions | insert-only | 2 | ≤6 | ok |

### `audit_events` exception

Five indexes on an unbounded append-only table. Justified: it is the
compliance record (REQ-AUDIT-001..003, INV-14) with four distinct
catalogued lookup forms, and **no parent table to join from** — REL-103 is
polymorphic without an FK, so each form genuinely needs its own path.
Audit writes are one row per audited action, bounded by business volume.

**First removal candidates** under ADR-DB5-004 R7: IDX-097
(`correlation_id`) and IDX-098 (admin actor) — both `recommended`, both
removable if `idx_scan` shows them unused. IDX-095 and IDX-096 are
`required`.

### `idempotency_records` exception

Four indexes on a high-write table. IDX-058 is non-negotiable (the P0
arbiter); IDX-093 is required for TTL hygiene, without which the table grows
unbounded and the arbiter itself slows down; IDX-094 is tiny and prevents
stuck records from wedging an operation permanently. Rows are **transient**
(hard-TTL), so the steady-state table stays small — which is precisely what
IDX-093 guarantees.

## 8. Retention interaction

All five operational tables here are `hard-ttl` (DB4 `Del` column) and are
cleaned by operator pipelines exempt from the append-only triggers
(CST-098/099, ADR-DB1-011). Each cleanup scan has a dedicated index — IDX-090
(outbox), IDX-093 (idempotency), IDX-131 (dead-letter visibility) — and
notification/audit retention is covered in
[`DB5_ARCHIVE_RETENTION_INDEXING.md`](./DB5_ARCHIVE_RETENTION_INDEXING.md).

Bloat is the real risk on these tables: high churn plus deletion produces
dead tuples faster than anywhere else in the schema. DB10 owns autovacuum
tuning and bloat monitoring for TBL-070, TBL-073 and TBL-074 specifically.

## 9. Validation handoff

- **DB7:** **D7-08** (CST-048 idempotency uniqueness), D7-11 (append-only
  and the outbox column-scoped exception, CST-098/099), **D7-12** (no
  OTP/token/URL in notification params), D7-10 (audit actor consistency,
  CST-072).
- **DB8:** **D8-17** (outbox exclusive claim, CC-25), **D8-25**
  (idempotency conflict/fingerprint mismatch, CC-07/GRD-030), D8-16
  (notification duplicate collapse, CC-26).
- **DB9:** seed must include pending/dispatched/dead-letter outbox rows,
  outbox rows with NULL and with future `next_attempt_at` (to prove the
  `NULLS FIRST` ordering), stuck `IN_PROGRESS` idempotency records, and
  audit events across several target kinds.
- **DB10:** unused-index review focused on IDX-097/098; autovacuum and bloat
  monitoring on TBL-070/073/074.
