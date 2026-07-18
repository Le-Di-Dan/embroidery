# ADR-DB5-003 — Worker Queue and Claim Access Paths

- Status: Accepted
- Date: 2026-07-18
- Git HEAD: `456e101` (DB4 baseline)
- Decision IDs: DEC-DB5-03
- Query IDs: Q-25, Q-26, Q-27, QX-03, QX-04, QX-05, QX-06, QX-10
- Concurrency IDs: CC-19, CC-22, CC-25, CC-26
- Guard IDs: GRD-029 (exclusive outbox claim)
- Invariant IDs: INV-23 (outbox payload immutable)
- Constraint IDs: CST-099, CST-124

## Context

Eight worker access paths exist across DB0/DB3/DB4: outbox relay (Q-27 /
QX-04), notification retry (QX-03), asset processing (Q-26), session expiry
(Q-25), quotation expiry (Q-24), reservation/hold expiry (QX-10),
idempotency cleanup (QX-05) and grant expiry (QX-06).

DB3 locked the *strategies* (CC-25 skip-locked claim, CC-22/26 locks,
idempotent consumers) and CST-124 recorded the outbox claim as a locking
pattern rather than a constraint. DB4 recorded partial-index *directions*
only. Neither designed the access path. Without it, a multi-worker claim
either scans the whole table each poll or serializes workers behind one
another.

Two properties make queue tables different from every other table here:

- The claimable set is a **tiny fraction** of the table and **shrinks as
  work succeeds**, so a partial index on the claimable predicate stays small
  even as the table grows.
- They are the **highest-write tables in the system** (Q-27 is polled),
  so index count directly costs write throughput.

## Decision Drivers

- A claim must be **exclusive** (GRD-029) without workers blocking each
  other — a plain `FOR UPDATE` makes worker 2 wait on worker 1's row.
- The claimable predicate must be **index-matchable**, i.e. written the
  same way in the query and the index, or the partial index is not used.
- Retry backoff (`next_attempt_at`) means claimability is **time-dependent**,
  which interacts badly with partial-index predicates (see R3 — this is the
  subtle failure mode this ADR most needs to prevent).
- Dead-letter rows must be excluded permanently, not re-scanned forever.
- At-least-once delivery is already tolerated (CC-25) because consumers are
  idempotent — so the design optimizes for *never losing* work, not for
  exactly-once claiming.

## Options Considered

1. **`FOR UPDATE` claim** — correct but serializes workers; each waits for
   the previous transaction. Rejected for the polled outbox.
2. **`FOR UPDATE SKIP LOCKED` claim** (chosen for contended queues) —
   each worker takes a disjoint batch, no blocking, no starvation.
3. **Advisory locks keyed by row id** — extra bookkeeping, no benefit over
   `SKIP LOCKED`, and locks outlive transaction boundaries. Rejected.
4. **Status-flip claim without locking** (`UPDATE ... WHERE status='PENDING'
   RETURNING`) — relies on row-level write conflicts; under READ COMMITTED
   the loser re-evaluates and may claim a row it should not. Rejected as the
   general pattern; equivalent only for single-worker sweeps.
5. **External broker** — out of scope; the queue/broker implementation is an
   explicitly open decision and the outbox table is the transactional
   handoff regardless.

## Decision

### R1 — Two claim classes

| Class | Pattern | Applies to |
|---|---|---|
| `CONTENDED_CLAIM` | partial index → `LIMIT n` → `FOR UPDATE SKIP LOCKED` → mutate out of the claimable set | `outbox_events` (Q-27), `notification_intents` (QX-03) |
| `SWEEP` | partial index → `LIMIT n` batch → per-row lock → mutate | `design_sessions` (Q-25), `assets`/`asset_derivatives` (Q-26), `quotation_versions` (Q-24), `inventory_soft_holds`/`inventory_reservations` (QX-10), `idempotency_records` (QX-05), `secure_access_grants` (QX-06) |

`SWEEP` paths run from a scheduler at low frequency with a single active
runner; they do not need `SKIP LOCKED` for throughput, but they **do** take
per-row locks because they contend with live business transactions
(CC-22: reservation expiry vs deposit-verified reserve). The expiry sweep is
never permitted to win by default — it takes the same row lock the business
path takes, and committed-first wins.

### R2 — Claimable predicates are locked, and written identically everywhere

The predicate in the query text **must** match the partial index predicate,
or PostgreSQL will not use the index. These are the locked forms:

| Path | Claimable predicate | Batch order |
|---|---|---|
| Q-27 outbox | `status = 'PENDING'` | `(next_attempt_at NULLS FIRST, id)` |
| QX-03 notification | `status IN ('PENDING','PROCESSING')` | `(created_at, id)` |
| Q-25 sessions | `status = 'ACTIVE'` | `(last_activity_at, id)` |
| Q-26 assets | `status IN ('UPLOADED','INSPECTING')` | `(created_at, id)` |
| Q-26 derivatives | `status IN ('PENDING','PROCESSING')` | `(created_at, id)` |
| Q-24 quotations | `status = 'SENT'` | `(valid_until, id)` |
| QX-10 holds | `status = 'HELD'` | `(expires_at, id)` |
| QX-10 reservations | `status = 'RESERVED' AND expires_at IS NOT NULL` | `(expires_at, id)` |
| QX-05 idempotency | (no status predicate — TTL only) | `(expires_at, id)` |
| QX-06 grants | `status = 'ACTIVE'` | `(expires_at, id)` |

All status values are the exact DB3 state-set members from
[`DB3_DB4_HANDOFF.md`](../../database/DB3_DB4_HANDOFF.md) §1. No invented
state appears in any predicate.

`inventory_reservations` carries `AND expires_at IS NOT NULL` because
COL-TBL021-05 permits NULL meaning "no expiry" (ADR-DB1-018 r3). Omitting
it would make the sweep index carry rows that can never expire.

### R3 — Time-dependent claimability stays **out** of the index predicate

This is the central technical decision of this ADR.

The natural-looking predicate `status='PENDING' AND next_attempt_at <= now()`
**must not** be used as a partial index predicate. `now()` is not immutable,
so it cannot appear in an index predicate at all; and baking a literal
timestamp in would make the index wrong the moment time advances.

Locked split:

- **Index predicate:** the *stable* part only — `status = 'PENDING'`.
- **Index key:** `(next_attempt_at, id)` — so the time filter becomes an
  ordered **range scan** over the index rather than a predicate the index
  must encode.
- **Query predicate:** `status='PENDING' AND (next_attempt_at IS NULL OR
  next_attempt_at <= now())`, which the planner satisfies by scanning the
  index from the start until it passes `now()`.

`next_attempt_at` is nullable (COL-TBL073-07): NULL means "never deferred,
eligible immediately". The index therefore declares **`NULLS FIRST`** so
first-attempt rows sort ahead of backed-off rows and the scan finds them
without traversing the whole index. Getting this wrong — leaving the
default `NULLS LAST` on an ascending key — would put every
never-attempted event at the far end of the index, which is precisely the
opposite of the desired order.

### R4 — Ordering, fairness and starvation

- Outbox order is `(next_attempt_at NULLS FIRST, id)`. `id` is `bigint`
  identity, so ties break in insert order — **FIFO**, which is what an event
  relay should be.
- `SKIP LOCKED` gives fairness across workers naturally: worker 2 skips
  worker 1's locked rows and takes the next ones. No worker starves.
- Because the batch is ordered and bounded by `LIMIT n`, a persistently
  failing row cannot block the queue head forever — it acquires a
  `next_attempt_at` in the future on failure and thereby sorts *behind*
  fresh work. Backoff is what prevents head-of-line blocking; the ordering
  alone would not.
- A row that exhausts its bounded retries moves to `DEAD_LETTER` and leaves
  the claimable set permanently (R5).

### R5 — Dead-letter and terminal exclusion is structural

- The partial predicate `status = 'PENDING'` **structurally excludes**
  `DISPATCHED`, `FAILED` and `DEAD_LETTER` rows. They are not filtered at
  query time — they are not in the index at all.
- This is the property that keeps the claim index small forever: a
  million dispatched events cost the claim index nothing.
- Dead-letter *visibility* (an admin needs to see them) is a different
  query with its own small partial index, not a reuse of the claim index.
- `background_job_attempts.is_dead_letter` (COL-TBL075-05) gets its own
  partial index for the same reason.

### R6 — Claim mutation must exit the claimable set in the same transaction

A claim that locks a row but does not change its status leaves the row
claimable to the next poll after the lock is released — producing repeated
delivery bounded only by luck. Locked rule:

- The claiming transaction **must** set `status`, `claimed_by`,
  `claimed_at` and (on failure) `attempt_count`/`next_attempt_at` before
  commit — all within the column-scoped mutable set permitted by CST-099.
- `payload` is never touched (INV-23).
- Consumers remain idempotent (CC-25); at-least-once is tolerated, but the
  design must not *rely* on that tolerance to mask a missing status flip.

### R7 — `SKIP LOCKED` is a DB6 spike dependency, with a stated fallback

Per ADR-DB1-002 and the DB3 spike list, the ORM's ability to emit
`FOR UPDATE SKIP LOCKED` is unproven. Locked:

- **DB6 spike** must confirm the builder emits it; if not, the claim query
  is a **documented raw-SQL adapter**. Neither this ADR nor
  [`DB3_CONCURRENCY_SPECIFICATION.md`](../../database/DB3_CONCURRENCY_SPECIFICATION.md)
  changes in that case — only the emission mechanism.
- **Fallback if `SKIP LOCKED` were unavailable entirely:** single-worker
  outbox relay. This is *acceptable at locked scale* (<100 orders/month)
  and is the honest fallback rather than inventing a lock-free scheme.
  It is a throughput limitation, not a correctness one.

### R8 — Index budget on queue tables is deliberately tight

`outbox_events` is the highest-write table in the system. Its locked index
set is exactly three:

1. PK (CST-001).
2. Claim index — partial on `status='PENDING'`, key `(next_attempt_at NULLS FIRST, id)`.
3. Cleanup index — partial on `status='DISPATCHED'`, key `(dispatched_at, id)`.

Rejected for this table: any index on `event_type`, `aggregate_kind`,
`aggregate_id`, or any GIN index on `payload`. Operational filtering uses
the relational status columns (ADR-DB4-004 #4); `payload` is opaque by
design. Q-33 (analytics emission stream) reads by `id` order and is
explicitly tool-deferred — it does not justify an `event_type` index today.

`idempotency_records` is the second-highest-write table and is capped at
three: PK, the CST-048 unique arbiter, and the TTL cleanup index.

## Consequences

**Positive**

- Multi-worker outbox relay is non-blocking and FIFO, with a claim index
  that stays small regardless of table growth.
- The `now()`-in-predicate trap (R3) and the missing-status-flip trap (R6)
  are both closed explicitly rather than left to implementation luck.
- Queue tables carry 2–3 indexes each, keeping write amplification low on
  exactly the tables that write most.

**Negative / accepted**

- Claim correctness depends on `SKIP LOCKED` reaching the database
  correctly; that is a DB6 spike with a documented fallback (R7).
- At-least-once delivery persists (CC-25). Accepted — consumers are
  idempotent by design.

## Deferred

| Item | Owner | Acceptance condition |
|---|---|---|
| ORM emission of `FOR UPDATE SKIP LOCKED` | DB6 spike | verified emitted SQL, or raw-SQL adapter documented |
| Batch size `n` per worker | DB6 config | value in `policy_configurations`, not literal |
| Retry/backoff curve and max attempts | DB6 config | bounded, configured (COL-TBL073-06) |
| Poll interval | DB6 config | configured |

## References

- [`DB3_CONCURRENCY_SPECIFICATION.md`](../../database/DB3_CONCURRENCY_SPECIFICATION.md) — CC-19/22/25/26
- [`DB3_SIDE_EFFECT_OUTBOX_CATALOG.md`](../../database/DB3_SIDE_EFFECT_OUTBOX_CATALOG.md)
- [`DB5_LOCKING_ACCESS_PATHS.md`](../../database/DB5_LOCKING_ACCESS_PATHS.md)
- [`DB5_ARCHIVE_RETENTION_INDEXING.md`](../../database/DB5_ARCHIVE_RETENTION_INDEXING.md)
- PostgreSQL 16 `SKIP LOCKED` — https://www.postgresql.org/docs/16/sql-select.html#SQL-FOR-UPDATE-SHARE (checked 2026-07-18)
- PostgreSQL 16 partial indexes (predicate immutability) — https://www.postgresql.org/docs/16/indexes-partial.html (checked 2026-07-18)
