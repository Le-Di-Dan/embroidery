# ADR-DB5-001 — Pagination and Ordering Strategy

- Status: Accepted — **amended 2026-08-02 (R10: Q-01 → `KEYSET`)**
- Date: 2026-07-18
- Git HEAD: `456e101` (DB4 baseline)
- Decision IDs: DEC-DB5-01, IMP-D037 (R10 amendment)
- Query IDs: Q-01, Q-04, Q-06, Q-10, Q-12, Q-16, Q-17..Q-29, QX-01..QX-11
- Invariant IDs: INV-14 (history integrity), INV-23 (outbox payload)
- Supersedes: —
- Amended by: §R10, which changes the Q-01 classification only. Every other
  classification in R5 stands exactly as accepted on 2026-07-18.

## Context

DB0–DB4 locked 33 catalog queries plus 11 operational queries but no
pagination semantics. Listing and history queries must have a stable total
order before any composite index column order can be justified: an index
serves a sort only if the sort is deterministic, and a cursor is only
correct if its key set is unique.

The locked scale bounds the problem sharply: 20–100 products, <100
orders/month, <10 concurrent editors, one store. No listing in the MVP is
unbounded except append-only history (`audit_events`,
`inventory_ledger_entries`, transition tables) and transient operational
queues (`outbox_events`, `notification_intents`, `idempotency_records`).

## Decision Drivers

- **Correctness under concurrent writes** — offset pagination skips or
  repeats rows when rows are inserted or reordered between page fetches.
- **Index alignment** — a keyset cursor requires the index key order to be
  exactly the sort order; otherwise the planner sorts anyway and the cursor
  buys nothing.
- **UX honesty** — admin listings in this product need page numbers and
  jump-to-page; customer-facing history needs "load more". These are
  different requirements, not one requirement.
- **Not optimizing what is not slow** — at ≤100 products and ≤100
  orders/month, deep-offset cost is nil. Keyset is chosen where it is
  *correct*, not where it is merely fashionable.
- Every sort must terminate in a unique tie-breaker or the order is not a
  total order and neither strategy is safe.

## Options Considered

1. **Offset/limit everywhere** — simplest, matches admin jump-to-page UX,
   but incorrect on concurrently-written history and unbounded queues.
2. **Keyset everywhere** — always correct, but forbids random page jump and
   adds cursor plumbing to listings that will never exceed one or two pages.
3. **Classified per query** (chosen) — assign a strategy from the query's
   write pattern and UX contract, not from a global preference.

## Decision

### R1 — Five pagination classes are locked

| Class | Meaning | Cursor | Applies when |
|---|---|---|---|
| `OFFSET` | offset/limit with a stable total order | none | bounded set, admin UX needs page jump, low write rate |
| `KEYSET` | seek by `(sort_key, id)` tuple after the last row | opaque encoded tuple | append-heavy or concurrently-written, "load more" UX |
| `TOP_N` | fixed `LIMIT n`, no paging at all | none | dashboards, counters, "latest N" panels |
| `IMMUTABLE_CURSOR` | keyset over rows that never change after insert | `id` alone suffices | append-only history, ledgers, transitions |
| `BATCH_SCAN` | worker claim batch, `LIMIT n`, re-queried each cycle | none (progress = state change) | outbox/notification/expiry sweeps |

`BATCH_SCAN` is not pagination in the UI sense: progress is made by the
worker **mutating** the claimed rows out of the claimable predicate, so the
next scan naturally returns the next batch. It never uses an offset.
Its access-path design lives in [ADR-DB5-003](./ADR-DB5-003-WORKER-CLAIM-INDEXING.md).

### R2 — Every ordering ends in a unique tie-breaker

No sort key in this system is unique on its own (`display_order`,
`created_at`, `occurred_at`, `valid_until` all admit duplicates). Therefore:

- Every listing sort is `(<business sort key>, id)`.
- `id` is the tie-breaker because it is the PK and is unique by CST-001.
- For `uuid7` tables the `id` tie-breaker is additionally **time-ordered**,
  so `(created_at, id)` and `id` alone agree in practice; `id` is still
  written explicitly rather than relied upon implicitly.
- For `bigint` identity tables (append-only records) `id` alone is a
  complete, monotonic total order and no second key is needed.

A sort without a tie-breaker is a defect, not a style choice: it makes both
offset and keyset pagination silently non-deterministic.

### R3 — Direction and NULL handling are part of the contract

- Descending listings (`created_at DESC, id DESC`) must have **both** keys
  descending; a mixed direction cannot be served by one B-tree scan
  direction and forces a sort node.
- `NULLS` placement is locked per index where the sort column is nullable
  (`valid_until`, `expires_at`, `next_attempt_at`). PostgreSQL's defaults
  are `NULLS LAST` for `ASC` and `NULLS FIRST` for `DESC`; where the query
  needs the opposite, the index declares it explicitly so the scan still
  matches. This is recorded per index in
  [`DB5_INDEX_CATALOG.md`](../../database/DB5_INDEX_CATALOG.md).
- Nullable sort columns that are only ever read under a predicate that
  excludes NULL (`WHERE expires_at IS NOT NULL`) use a partial index and
  the NULL question disappears.

### R4 — Archive and status predicates are part of the pagination contract

A listing's status/archive predicate is not a filter applied after paging —
it defines the paged set. Public listings page over
`status = 'PUBLISHED'` only; admin listings page over an explicit status
set. The predicate therefore belongs in the partial index that serves the
page, not in application post-filtering, which would make page sizes ragged.

### R5 — Per-query classification (locked)

**Public / customer-facing**

| Query | Class | Sort | Rationale |
|---|---|---|---|
| Q-01 product listing | `KEYSET` | `(display_order, id)` | **Amended by R10 (2026-08-02).** The public listing is a cursor-continuation feed, not a jump-to-page admin table; the cursor carries `(display_order, id)` plus the `categorySlug` filter identity |
| Q-02 product detail | n/a | — | single graph, not a listing |
| Q-04 gallery listing | `OFFSET` | `(display_order, id)` | small curated set |
| Q-06 sitemap set | `BATCH_SCAN` | `(id)` | full enumeration by a generator, not a UI page |
| Q-10 design version history | `OFFSET` | `(version DESC, id DESC)` | ≤ tens of versions per case; `version` is unique within the case (CST-021) so the order is already total — `id` retained for uniformity |
| Q-12 quotation version history | `OFFSET` | `(version DESC, id DESC)` | same shape, CST-036 |
| Q-15 order lookup | n/a | — | single graph |

**Admin**

| Query | Class | Sort | Rationale |
|---|---|---|---|
| Q-21 request listing by status | `OFFSET` | `(created_at DESC, id DESC)` | admin needs page jump and total counts; ≤ hundreds of rows |
| Q-17 / Q-18 payment queues | `TOP_N` + `OFFSET` fallback | `(created_at, id)` | worklists, oldest-first; typically single page |
| Q-19 production queue | `TOP_N` + `OFFSET` fallback | `(created_at, id)` | same |
| Q-20 low stock | `TOP_N` | `(id)` | ≤ dozens of SKUs; whole set fits one page |
| Q-22 dashboard | `TOP_N` per bucket | per bucket | counts + short lists only; see [`DB5_ADMIN_DASHBOARD_ACCESS_PATHS.md`](../../database/DB5_ADMIN_DASHBOARD_ACCESS_PATHS.md) |
| Q-23 failed/unmatched payments | `OFFSET` | `(created_at DESC, id DESC)` | reconciliation worklist |
| Q-24 expiring quotations | `TOP_N` | `(valid_until, id)` | short horizon window |
| Q-16 payment reconciliation | `KEYSET` | `(received_at DESC, id DESC)` | `payment_provider_events` is append-heavy and concurrently written by callbacks; offset would repeat/skip evidence rows during review |
| QX-08 merge review queue | `TOP_N` | `(created_at, id)` | rare |

**History / append-only**

| Query | Class | Sort | Rationale |
|---|---|---|---|
| Q-29 audit history | `IMMUTABLE_CURSOR` | `(occurred_at DESC, id DESC)` | append-only and unbounded; rows never change, so a cursor is exact |
| QX-01 transition history | `IMMUTABLE_CURSOR` | `(id)` | `bigint` identity, insert-ordered; `id` alone is total |
| QX-02 saga resume | `IMMUTABLE_CURSOR` | `(id)` | replay must be deterministic and gap-free |
| inventory ledger | `IMMUTABLE_CURSOR` | `(id)` | rebuild source of truth (TBL-019) — must never skip a row |

The ledger case is the strongest argument in this ADR: `inventory_ledger_entries`
is the **rebuild source** for stock balances. An offset-paged replay that
skipped one row during concurrent appends would silently produce a wrong
balance. `IMMUTABLE_CURSOR` on `id` makes replay exact.

**Worker**

| Query | Class | Rationale |
|---|---|---|
| Q-25 session expiry, Q-26 asset queue, Q-27 outbox, QX-03 notification retry, QX-05/06/10 sweeps | `BATCH_SCAN` | claim-and-mutate; see ADR-DB5-003 |

### R6 — Page size is bounded and configured, never client-dictated

- Default and maximum page sizes are **policy configuration**
  (`policy_configurations`, TBL-076), not hard-coded — per CLAUDE.md §5.
- The maximum bounds worst-case work per request; an unbounded page size
  is a denial-of-service surface on the history queries.
- Exact default/maximum values are **deferred to DB6 configuration seeding**;
  DB5 locks only that they are bounded and configured.

### R7 — Behavior under concurrent writes is specified, not assumed

- `OFFSET` classes accept that a row inserted between page fetches may
  shift the boundary by one. This is **acceptable only** because these sets
  are small, editorially ordered, and low-write. It is recorded as a known
  property, not hidden.
- `KEYSET` and `IMMUTABLE_CURSOR` classes are exact under concurrent insert:
  a cursor at `(k, id)` is unaffected by rows inserted elsewhere in the key
  space.
- No listing query takes a lock to stabilize its page. Read consistency for
  transaction-adjacent reads is handled by the write-path locks in
  [`DB3_CONCURRENCY_SPECIFICATION.md`](../../database/DB3_CONCURRENCY_SPECIFICATION.md),
  not by pagination.

## Consequences

**Positive**

- Every listing has a total order, so both index design and cursor encoding
  are mechanical rather than judgment calls.
- The two places where offset is genuinely unsafe (append-only history,
  ledger replay) are handled correctly without imposing cursor plumbing on
  the ~15 small admin listings that do not need it.
- Composite index column order in
  [`DB5_INDEX_CATALOG.md`](../../database/DB5_INDEX_CATALOG.md) is now
  derivable: equality predicate columns, then the sort keys in the declared
  direction, ending in `id`.

**Negative / accepted**

- Two pagination mechanisms exist in the codebase. Accepted: the
  classification table above makes the choice per query non-discretionary.
- `OFFSET` listings can shift by one row under concurrent insert (R7).
  Accepted at locked scale; the trigger to revisit is in R8.

### R8 — Revisit criteria

Reclassify an `OFFSET` query to `KEYSET` when **any** holds:

- the paged set exceeds ~10,000 rows, or
- deep pages (beyond ~50) are observed in real usage, or
- the table's insert rate makes boundary drift user-visible.

`custom_requests` (Q-21) is the most likely future candidate. Until one of
these is observed, converting it would be speculative optimization.

R8 was written before any public listing existed. It is a rule about
*converting a query that already works*; it does not govern the classification
of a contract being designed for the first time. See R10.

### R9 — Reserved

Unused. R10 was added by a later amendment and the numbering is not reused.

### R10 — Q-01 is `KEYSET` (amendment, 2026-08-02)

**Decision.** The public catalog listing Q-01 uses **keyset** pagination.

| Aspect | Value |
|---|---|
| Order | `products.display_order ASC, products.id ASC` |
| Cursor | `display_order` + `id` + the `categorySlug` filter identity |
| Page size | unchanged — the existing `DEFAULT_PAGE_SIZE` / `MAX_PAGE_SIZE` policy (R6) |
| Continuation | `hasNext` + `nextCursor` |

**Activation event.** `APP2-B04` delivered the public catalog contract
(`publicProduct_list`, `publicProduct_detail`). The two public operations
exist, are anonymous, and are cursor-based. This is no longer a hypothetical
future optimization of a working query; it is the classification of the query
this system actually serves.

**Scope.** This supersedes the Q-01 classification only — recorded here as
history: Q-01 was classified `OFFSET` from 2026-07-18 until this amendment. No
other row of R5 changes, no schema or index changes, and R8's thresholds still
govern every remaining `OFFSET` query, `custom_requests` (Q-21) foremost.

**Why the ordering tuple did not change.** `(display_order, id)` was already
the locked total order under R2, and IDX-065 is built on it. Keyset needs
exactly a unique, index-aligned total order, so the tuple that made offset
deterministic is the tuple that makes the cursor correct. The mechanism
changed; the order did not.

**Why the cursor carries the filter.** A cursor encodes a position in *one*
ordered set. `categorySlug` selects which set that is, so a cursor issued under
one filter and replayed under another would silently skip or repeat rows —
the exact failure keyset exists to prevent. Binding the filter into cursor
identity makes that replay a rejected cursor rather than a wrong page.

**Behavior under concurrent writes.** A cursor at `(display_order, id)` is
unaffected by rows inserted or reordered elsewhere in the key space, so a
continuation neither duplicates nor omits a row because a boundary shifted.
This is a statement about the cursor, not a snapshot claim: successive requests
are separate read-committed transactions, and a product published, unpublished
or reordered between two requests will legitimately appear or disappear.

**Access path.** Measured, not assumed:
[`DB5_Q01_ACCESS_PATH_EVIDENCE.md`](../../database/DB5_Q01_ACCESS_PATH_EVIDENCE.md).
The current plan is accepted at MVP cardinality. Note the finding recorded
there — the delivered contract filters on `categories.slug` across a join, so
IDX-065's leading key is not a constant and neither form gets its ordering from
the index. That is acceptable over ≤100 rows and is routed to DB10, not fixed
here.

## Deferred

| Item | Owner | Acceptance condition |
|---|---|---|
| Default/maximum page-size values | DB6 (config seed) | values exist in `policy_configurations`, no literal in code |
| Cursor encoding format (opaque token shape) | DB6 | stable, versioned, non-guessable; encodes no authorization |
| Whether Q-21 migrates to `KEYSET` | DB10 | one of the R8 thresholds observed |

## References

- [`DB0_QUERY_CATALOG.md`](../../database/DB0_QUERY_CATALOG.md) — Q-01..Q-33
- [`DB4_DB5_HANDOFF.md`](../../database/DB4_DB5_HANDOFF.md) — access paths, QX-01..QX-11
- [`DB5_PAGINATION_ORDERING_MATRIX.md`](../../database/DB5_PAGINATION_ORDERING_MATRIX.md) — per-query expansion
- PostgreSQL 16, index ordering and `NULLS FIRST/LAST` semantics —
  https://www.postgresql.org/docs/16/indexes-ordering.html (checked 2026-07-18)
