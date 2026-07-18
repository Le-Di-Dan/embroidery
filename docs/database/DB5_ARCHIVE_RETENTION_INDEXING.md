# DB5 — Archive, Retention & Cleanup Indexing

**Date:** 2026-07-18 · **Git HEAD:** `456e101`
**Basis:** [`DB4_DELETE_ARCHIVE_RETENTION_MAPPING.md`](./DB4_DELETE_ARCHIVE_RETENTION_MAPPING.md),
[ADR-DB1-011](../adr/database/ADR-DB1-011-DELETE-ARCHIVE-RETENTION.md).
**Rule:** no retention duration is hard-coded here. All TTLs and retention
windows are **policy configuration** (TBL-076/077) — DB5 designs the *scan*,
not the *duration*.

## 1. Two distinct patterns

| Pattern | Meaning | Index shape |
|---|---|---|
| **Archive** | row stays, becomes invisible to public reads | partial index on the *active* state — archived rows are excluded structurally |
| **Cleanup** | row is deleted or scrubbed after a TTL | partial/plain index on the *time* column, ordered for batch scanning |

The distinction matters: archive needs no scan index at all (the archived
rows simply are not in the public partial index), whereas cleanup needs an
ordered time key so a worker can drain batches.

## 2. Archived catalog / content / gallery

`categories`, `products`, `gallery_entries`, `content_pages`,
`design_templates` use `status='ARCHIVED'` plus an `archived_at` evidence
timestamp. Rows are **retained indefinitely** — archive is delisting, not
deletion (REL-020: archiving a category only delists its products).

| Table | Active-set index | Archive scan index |
|---|---|---|
| products | IDX-065 `WHERE status='PUBLISHED'` | **none** |
| gallery_entries | IDX-066 `WHERE status='PUBLISHED'` | **none** |
| content_pages | IDX-067 `WHERE status='PUBLISHED' AND is_indexable` | **none** |
| categories, design_templates | — (tiny) | **none** |

**No archive-scan index exists and none is needed.** Archived rows are
excluded from every public partial index by construction, and no catalogued
query enumerates archived rows on a schedule. `archived_at` is evidence, not
a filter — nothing scans by it.

## 3. Temporary sessions (Q-25)

| Aspect | Value |
|---|---|
| Table | TBL-025 `design_sessions` (`temp`, hard-ttl) |
| Time column | `last_activity_at` (COL-TBL025-09) — retention start event |
| State predicate | `status='ACTIVE'` |
| Batch order | `(last_activity_at, id)` |
| Index | **IDX-085** |
| Cascade | `design_session_assets` (REL-042) and challenges (REL-007) are `cascade-temp` children — deleted with the family |
| Bloat risk | **high** — hot updates plus deletion; the worst dead-tuple profile in the schema |

`expires_at` (COL-TBL025-08) also exists, but the sweep keys on
`last_activity_at` because that is the retention-start event per
ADR-DB1-011. Indexing both would be redundant; one time key per scan.

DB10 owns autovacuum tuning here.

## 4. Verification and grant expiry

| Scan | Table | Predicate | Order | Index |
|---|---|---|---|---|
| Challenge expiry | TBL-006 | `status='ISSUED'` | `(expires_at, id)` | IDX-112 |
| Attempt cleanup | TBL-007 | — | cascade-temp with challenge (REL-008) | IDX-111 |
| **QX-06** grant expiry | TBL-008 | `status='ACTIVE'` | `(expires_at, id)` | IDX-105 |

The grant sweep is **hygiene only**. Guards read `expires_at` directly in
the acting transaction (CST-116, ADR-DB3-004 r9), so a lagging sweep can
never grant access it shouldn't — which is exactly why its consistency can
be `E` without a security consequence. Grants are `retain` (evidence), so
the sweep transitions status rather than deleting rows.

## 5. Quotation, hold and reservation expiry

| Scan | Table | Predicate | Order | Index | Race |
|---|---|---|---|---|---|
| **Q-24** quotation expiry | TBL-051 | `status='SENT'` | `(valid_until, id)` | IDX-084 | CC-06 |
| **QX-10** hold expiry | TBL-020 | `status='HELD'` | `(expires_at, id)` | IDX-109 | CC-23 |
| **QX-10** reservation expiry | TBL-021 | `status='RESERVED' AND expires_at IS NOT NULL` | `(expires_at, id)` | IDX-110 | **CC-22** |

All three are **business-state transitions**, not deletions — terminal rows
are retained (DB4 `Del`: `retain`).

Two design points carried from the context docs:

- **`expires_at IS NOT NULL` on IDX-110** — NULL means *no expiry*
  (COL-TBL021-05, ADR-DB1-018 r3). Without the clause the sweep index would
  carry rows that can never expire.
- **CC-22 semantics** — the sweep takes the **same row lock** the business
  path takes. Committed-first wins; a deposit-verified reserve that commits
  first keeps the hold. The sweep never wins by default, which is why a
  hold cannot be lost mid-payment.

## 6. Idempotency cleanup (QX-05)

| Aspect | Value |
|---|---|
| Table | TBL-074 (`oper`, hard-ttl) |
| TTL scan | `expires_at < now()` → **IDX-093** `(expires_at, id)` — deliberately **non-partial**, since every record expires |
| Stuck scan | `status='IN_PROGRESS' AND claimed_at < now() − timeout` → **IDX-094** partial |
| Bloat risk | **high** — high insert + high delete |

IDX-093 is not merely hygiene: without it the table grows unbounded and
**IDX-058 — the P0 double-execution arbiter — slows down with it**. TTL
cleanup is what keeps the idempotency probe constant-cost.

## 7. Outbox and notification retention

| Scan | Table | Predicate | Order | Index |
|---|---|---|---|---|
| Outbox cleanup | TBL-073 | `status='DISPATCHED'` | `(dispatched_at, id)` | IDX-090 |
| Dead-letter visibility | TBL-075 | `is_dead_letter` | `(finished_at, id)` | IDX-131 |
| Notification intents | TBL-070 | terminal statuses | `created_at` order | **none — see below** |
| Delivery attempts | TBL-071 | cascade with intent (REL-100) | — | IDX-092 |

`DEAD_LETTER` outbox rows are **not** swept by IDX-090 — its predicate is
`status='DISPATCHED'`. Dead letters need operator attention before removal,
and quietly deleting them would destroy the evidence of a failed side
effect.

**Notification intent retention has no dedicated index.** `notification_intents`
is at its 3-index budget (PK, IDX-057, IDX-091), and the retention sweep runs
rarely on a table kept small by that same sweep. It may scan. Adding a
fourth index to a high-churn table to speed an infrequent maintenance job
would be a poor trade (ADR-DB5-004 R6) — recorded as a deliberate
no-index decision, revisited if the table grows.

Bloat: TBL-070, TBL-073 and TBL-074 are the three tables where high churn
plus deletion produces dead tuples fastest. DB10 owns autovacuum tuning and
bloat monitoring for them specifically.

## 8. Audit retention

`audit_events` is retention class **audit** — `retain`, append-only
(CST-098), unbounded by design. **There is no cleanup scan and no cleanup
index.** If a retention window is ever introduced, IDX-096
`(occurred_at DESC, id DESC)` already provides the ordered time key, so no
new index would be required.

The same applies to `inventory_ledger_entries` (the stock rebuild source),
`payment_provider_events`, `payment_reconciliations`, and the three
transition tables: all `retain`, all append-only, none swept.

## 9. Asset retention and tombstones

Assets use **two-phase tombstone** deletion (ADR-DB1-011):

| Phase | Column | Predicate | Index |
|---|---|---|---|
| 1 — deletion requested | `deletion_requested_at` (COL-TBL022-10) | `status='DELETION_PENDING'` | **IDX-133** |
| 2 — binary confirmed deleted | `deleted_at` (COL-TBL022-12) | — | none |

The phase-1 scan is what a worker drains: find pending tombstones, delete
the object-storage binary, then stamp `deleted_at`. Phase 2 needs no index —
the row is already located by the phase-1 scan.

Derivatives tombstone **with their parent** (REL-032). Binaries never live
in PostgreSQL (INV-10), so retention here is a coordination problem with
object storage, not a table-size problem.

## 10. Customer anonymization

`customers` and `customer_contact_points` use **field-level scrub**
(`anonymized_at`, COL-TBL004-04 / COL-TBL005-09), not deletion — rows and
relationships are preserved so history stays intact.

**No index on `anonymized_at`.** Anonymization is triggered per customer by
an operator decision, not by a scheduled scan over all customers. Adding a
scan index would imply a bulk process that does not exist.

Crucially: **anonymization never rewrites historical snapshots.** Frozen
contact copies in `approval_snapshots` (COL-TBL031-09), shipping snapshots
and order display copies are untouched (their redaction is a separate
break-glass privacy procedure). No index exists to find snapshots to scrub,
because scrubbing them is not a routine operation.

## 11. Roll-up

| Scan | Index | Deferred value |
|---|---|---|
| Session expiry | IDX-085 | TTL `[cfg]` O-008 |
| Challenge expiry | IDX-112 | TTL `[cfg]` |
| Grant expiry | IDX-105 | grant.standard class `[cfg]` |
| Quotation expiry | IDX-084 | validity window `[cfg]` |
| Hold expiry | IDX-109 | hold TTL `[cfg]` (ADR-DB1-018) |
| Reservation expiry | IDX-110 | reservation TTL `[cfg]`, nullable |
| Idempotency TTL | IDX-093 | TTL class per namespace `[cfg]` |
| Idempotency stuck | IDX-094 | timeout `[cfg]` |
| Outbox cleanup | IDX-090 | processed retention `[cfg]` |
| Asset tombstone | IDX-133 | — |
| Admin session expiry | IDX-121 | `[cfg]` |
| Notification retention | **none (deliberate)** | `[cfg]` |
| Archive (5 tables) | **none needed** | n/a |
| Audit / ledger / evidence | **none — retained** | n/a |

**11 cleanup scans indexed · 3 deliberate no-index decisions · 0 hard-coded
durations.**

Every scan uses the `BATCH_SCAN` pattern (ADR-DB5-001 R1, ADR-DB5-003 R1):
a bounded `LIMIT n` batch, ordered by the time key, with the `now()`
comparison as a **range scan on the key** rather than an index predicate
(ADR-DB5-003 R3).

## 12. Validation handoff

- **DB6:** seed `policy_configurations` with every TTL/retention class named
  above; no duration literal in code.
- **DB7:** D7-11 (append-only enforcement plus the operator-pipeline
  exemption for retention jobs).
- **DB8:** CC-22 (reservation expiry vs deposit-verified reserve) is the
  critical sweep race.
- **DB9:** seed must include rows *already past* their expiry in each state,
  plus reservations with NULL `expires_at`, or no sweep index is exercised.
- **DB10:** autovacuum/bloat monitoring on TBL-025, TBL-070, TBL-073,
  TBL-074; unused-index review excludes cleanup indexes, whose value is
  correctness of a rare job rather than scan frequency (ADR-DB5-004 R7).
