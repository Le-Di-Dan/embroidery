# DB5 — Index Cost & Redundancy Report

**Date:** 2026-07-18 · **Git HEAD:** `456e101`
**Governance:** [ADR-DB5-004](../adr/database/ADR-DB5-004-INDEX-GOVERNANCE.md)
R5 (redundancy), R6 (write budgets), R7 (removal).

## 1. Per-table index census

**W** = write profile: `H` hot-write · `A` append-heavy · `M` moderate ·
`L` low/read-mostly. **I** integrity · **P** performance (incl. PK in the
total). Budget per ADR-DB5-004 R6.

| Table | W | I | P | Total | Budget | Status |
|---|---|---|---|---|---|---|
| TBL-001 admin_accounts | L | 2 | 1 | 3 | 6 | ok |
| TBL-002 admin_credentials | L | 0 | 1 | 1 | 6 | ok |
| TBL-003 admin_sessions | M | 1 | 3 | 4 | 5 | ok |
| TBL-004 customers | L | 0 | 2 | 2 | 5 | ok |
| TBL-005 contact_points | L | 2 | 2 | 4 | 5 | ok |
| TBL-006 challenges | H (temp) | 1 | 3 | 4 | 5 | ok |
| TBL-007 attempts | **A** | 0 | 2 | 2 | 3 | ok |
| TBL-008 grants | M | 2 | 3 | 5 | 5 | **at budget** |
| TBL-009 merge_cases | L | 1 | 1 | 2 | 5 | ok |
| TBL-010 merge_events | A | 0 | 2 | 2 | 3 | ok |
| TBL-011..017 catalog (7) | L | 1–2 each | 1–2 each | 2–3 each | 6 | ok |
| TBL-018 sku_stocks | **H (lock anchor)** | 1 | 1 | **2** | 3 | ok — minimal by design |
| TBL-019 ledger | **A** | 0 | 2 | 2 | 3 | ok |
| TBL-020 soft_holds | M | 1 | 3 | 5 | 5 | at budget |
| TBL-021 reservations | M | 1 | 3 | 5 | 5 | at budget |
| TBL-022 assets | M | 1 | 3 | 5 | 5 | at budget |
| TBL-023 inspections | A | 0 | 2 | 2 | 3 | ok |
| TBL-024 derivatives | M | 2 | 3 | 5 | 5 | at budget |
| TBL-025 design_sessions | **H (autosave)** | 1 | 2 | **3** | 3 | at budget |
| TBL-026..036 design (11) | L | 1–2 each | 0–2 each | 2–3 each | 5 | ok |
| TBL-037 custom_requests | M | 1 | 3 | 4 | 5 | ok |
| TBL-038..041 request children | L | 1 each | 1–2 each | 2 each | 5 | ok |
| TBL-042 request_transitions | **A** | 0 | 2 | 2 | 3 | ok |
| TBL-043 orders | M | 2 | 3 | 5 | 5 | at budget |
| TBL-044 order_items | L (immutable) | 1 | 1 | 2 | 5 | ok |
| TBL-045 order_transitions | **A** | 0 | 3 | **3** | 3 | at budget |
| TBL-046..049 order children | L | 1 each | 1 each | 2 each | 5 | ok |
| TBL-050 quotations | L | 2 | 1 | 3 | 5 | ok |
| TBL-051 quotation_versions | L (frozen) | 1 | 2 | 3 | 5 | ok |
| TBL-052/053 | L | 1 each | 1 each | 2 each | 5 | ok |
| TBL-054 obligations | M | 1 | 2 | 3 | 5 | ok |
| TBL-055 attempts | M | 0 | 4 | 4 | 5 | ok |
| **TBL-056 provider_events** | **A** | 1 | 4 | **5** | **3** | **over — justified §5** |
| TBL-057 reconciliations | A | 0 | 2 | 2 | 3 | ok |
| TBL-058 refunds | L | 0 | 3 | 3 | 5 | ok |
| TBL-059 production_jobs | L | 1 | 2 | 3 | 5 | ok |
| TBL-060..063 production | L/A | 1 each | 1 each | 2 each | 3–5 | ok |
| TBL-064..069 gallery/content | L | 1–2 each | 1 each | 2–3 each | 6 | ok |
| TBL-070 notification_intents | H | 1 | 2 | **3** | 3 | at budget |
| TBL-071 delivery_attempts | **A** | 0 | 2 | 2 | 3 | ok |
| **TBL-072 audit_events** | **A, unbounded** | 0 | 5 | **5** | **3** | **over — justified §5** |
| TBL-073 outbox_events | **H (highest)** | 0 | 3 | **3** | 3 | at budget |
| **TBL-074 idempotency** | **H** | 1 | 3 | **4** | **3** | **over — justified §5** |
| TBL-075 job_attempts | A | 1 | 2 | 3 | 3 | at budget |
| TBL-076/077 policy | L | 1 each | 1 each | 2 each | 6 | ok |
| TBL-078 business_profiles | L | 1 | 1 | 2 | 6 | ok |

**Totals: 134 indexes across 78 tables — an average of 1.7 indexes per table
including primary keys.** 64 integrity-backed, 70 performance.

## 2. Write-amplification assessment

| Tier | Tables | Amplification | Assessment |
|---|---|---|---|
| **Highest-write** | `outbox_events` | 3 indexes; 2 partial and near-empty in steady state | Effective cost ≈ PK + one small partial. The claim index only carries `PENDING` rows, so a million dispatched events cost it nothing. |
| **High-write** | `idempotency_records`, `design_sessions`, `notification_intents`, `sku_stocks`, `contact_verification_challenges` | 2–4 each | `sku_stocks` at 2 is the most important number in this table — every index on it is maintained inside the most contended lock in the system. |
| **Append-heavy** | `audit_events`, `inventory_ledger_entries`, `payment_provider_events`, transitions ×3, delivery/verification attempts, inspections, merge events | 2–5 | Inserts only; no update amplification. Cost is index-build on insert plus storage. |
| **Moderate** | orders, requests, payments, holds, reservations, assets, derivatives | 3–5 | Business-volume bounded (<100 orders/month). |
| **Low** | catalog, gallery, content, agreements, policy, immutable children | 2–3 | Negligible. |

**Update amplification is low across the schema by construction**, because
so much of it is immutable or append-only: `order_items`, `approval_snapshots`
(+children), `production_specifications`, `shipping_snapshots`,
`quotation_versions` (post-send), `design_versions` (post-send),
`agreement_versions` (post-publish) are frozen and only ever inserted into.
An index on a frozen table has insert cost and zero update cost.

## 3. Overlap and prefix analysis

Leading-prefix relationships deliberately **exploited** — the narrower index
was *not* created, because the wider one already serves it:

| Wider index | Prefix serving | Narrower index avoided |
|---|---|---|
| IDX-044 `(order_id, approval_snapshot_id)` | `(order_id)` | `production_jobs (order_id)` — IDX-R04 |
| IDX-033 `(order_id, position)` | `(order_id)` | `order_items (order_id)` |
| IDX-042 `(order_id, kind)` partial | `(order_id)` **for live rows only** | — (IDX-075 still required, §4) |
| IDX-015 `(product_id, asset_id, role)` | `(product_id)` | `product_media (product_id, …)` — IDX-R07 |
| IDX-065 `(category_id, display_order, id)` partial | `(category_id)` | `products (category_id)` — IDX-R11 |
| IDX-023 `(design_case_id, version)` | `(design_case_id)` | `design_versions (design_case_id)` |
| IDX-039 `(quotation_id, version)` | `(quotation_id)` | `quotation_versions (quotation_id)` |
| IDX-030 `(request, variant, size)` | `(custom_request_id)` | breakdowns FK index |
| IDX-046..051 association uniques | owner column | 6 FK indexes |
| IDX-095 `(target_kind, target_id, …)` | `(target_kind)` | — |

**10 prefix relationships exploited → ~15 indexes avoided.**

Direction: a B-tree scans backwards, so no descending index was created for
Q-10 or Q-12 — IDX-023 and IDX-039 serve `version DESC` directly. **No mixed-
direction index exists** anywhere in the catalog.

## 4. Justified overlaps

Five places where a performance index shares a leading column with a unique
index. **All five are correctness matters, not speed**, and every one has the
same root cause: **a partial index cannot be used as a full access path.**

| # | Partial (integrity) | Plain (access) | Why both |
|---|---|---|---|
| 1 | IDX-008 grants `(customer_id, request_id) WHERE ACTIVE` | **IDX-107** `(customer_id)` | CC-27 merge must find **all** grants incl. expired/revoked; the partial would silently skip them |
| 2 | IDX-005 contacts `(customer_id) WHERE is_primary` | **IDX-134** `(customer_id)` | merge and customer detail need **all** contacts, not just primary |
| 3 | IDX-042 obligations `(order_id, kind) WHERE PENDING/SATISFIED` | **IDX-075** `(order_id)` | Q-09 must show **SUPERSEDED** obligations (ADR-DB3-003 r7 recalculation chain) |
| 4 | IDX-017/018 holds/reservations `WHERE HELD/RESERVED` | **IDX-126/127** by owner | cancel/audit paths read terminal rows |
| 5 | **IDX-020 derivatives `(asset_id, kind) WHERE status <> 'FAILED'`** | **IDX-099 `(asset_id)`** | see below |

### Overlap #5 in detail — the planner-implication case

This is the subtlest entry in the catalog and the one most likely to be
"simplified" away by a future reviewer.

IDX-020's predicate is `status <> 'FAILED'`. Q-30 filters `status = 'READY'`.
A human sees that `'READY' <> 'FAILED'` and concludes the partial index
covers the query. **The planner does not**: `status` is `text` with a CHECK
constraint (ADR-DB1-008), and PostgreSQL does not derive predicate
implication across a CHECK's value list to prove that equality on one member
implies inequality with another. The partial index would therefore not be
matched, and Q-30 — a **P0** path resolving signed asset access — would fall
back to a scan.

IDX-099 `(asset_id)` is plain and always matchable. **EXPLAIN scenario E30
exists specifically to falsify this reasoning**: if the planner *does* match
IDX-020, IDX-099 should be removed.

## 5. Budget exceptions

Three tables exceed their ADR-DB5-004 R6 budget. Each is recorded here
rather than silently taken.

### `payment_provider_events` — 5 indexes on an append-heavy table

- Write rate is bounded by **real payment volume**: <100 orders/month means
  a few hundred callbacks/month. "Append-heavy" describes the table's
  *shape*, not its throughput here.
- IDX-043 is non-negotiable — the INV-07 duplicate-callback arbiter.
- IDX-079/080/081 serve three distinct **P0** reconciliation forms; 080 and
  081 are complementary partials over the same nullable column, so together
  they cost roughly one full index.
- A missed unmatched payment is a **money error**, not a slow page.
- **First removal candidate:** IDX-078 (attempt `provider_ref`), which
  partly duplicates what IDX-043 answers from the event side.

### `audit_events` — 5 indexes on an unbounded append-only table

- Compliance record (REQ-AUDIT-001..003, INV-14) with four genuinely
  distinct catalogued lookup forms.
- **No parent table to join from** — REL-103 is polymorphic with no FK — so
  each form needs its own path; there is no "fetch via the owner" fallback.
- Writes are one row per audited action, bounded by business volume.
- **First removal candidates:** IDX-097 (`correlation_id`) and IDX-098
  (admin actor), both `recommended`. IDX-095/096 are `required`.

### `idempotency_records` — 4 indexes on a high-write table

- IDX-058 is the **P0 double-execution arbiter** (CST-048).
- IDX-093 (TTL) is required for a second-order reason: without it the table
  grows unbounded and **IDX-058 itself slows down**. Cleanup is what keeps
  the arbiter constant-cost.
- IDX-094 is tiny (partial on `IN_PROGRESS`) and prevents a dead worker from
  wedging an operation permanently.
- Rows are transient (hard-TTL), so steady-state size stays small.

## 6. Rejected indexes and future activation thresholds

15 rejections are recorded in
[`DB5_INDEX_CATALOG.md`](./DB5_INDEX_CATALOG.md) §5. Those with a concrete
re-activation trigger:

| ID | Rejected | Activate when |
|---|---|---|
| IDX-R01 | low-stock partial | `sku_stocks` > ~10,000 rows |
| IDX-R02 | `outbox_events (event_type)` | analytics tooling selected **and** its access pattern known |
| IDX-R03 | merge-case queue | merge cases become routine (>100s) |
| IDX-R11 | `products (category_id)` plain | products > ~10,000 |
| BRIN on `audit_events` / ledger | — | tables reach the **hundreds of millions** of rows; below that a B-tree is faster and more flexible |
| `pg_trgm` search | — | prefix search measured insufficient; extension proven in the pinned image; fallback stated (ADR-DB5-002 R6/R7) |
| `vi-x-icu` collated index | — | a listing sorts Population B **in the database**; DB10 REINDEX step activates in the same change |
| INCLUDE columns | IDX-073, IDX-065 | BUFFERS shows heap fetches dominating (E1/E21) |

## 7. Bloat risk

| Table | Risk | Driver | Owner |
|---|---|---|---|
| TBL-025 design_sessions | **high** | frequent updates + TTL deletion | DB10 autovacuum |
| TBL-073 outbox_events | **high** | high insert + status churn + TTL deletion | DB10 |
| TBL-074 idempotency_records | **high** | high insert + TTL deletion | DB10 |
| TBL-070 notification_intents | medium | churn + retention | DB10 |
| TBL-006 challenges | medium | temp, hard-TTL | DB10 |
| TBL-018 sku_stocks | medium | small table, very frequent updates → HOT-update behavior matters | DB10 |
| Append-only tables | low | inserts only, no dead tuples until retention runs | — |
| Immutable/frozen tables | none | — | — |

`sku_stocks` deserves specific attention despite being tiny: `quantity_on_hand`
updates are frequent, and keeping the index count at 2 is what preserves the
chance of HOT updates (which avoid index maintenance entirely when no
indexed column changes). **Adding an index on a frequently-updated column of
this table would be a lock-path regression, not a neutral change.**

## 8. Storage estimate

At locked scale the entire database is small — the largest tables are
`audit_events` (D-D: 50k rows) and `outbox_events` (D-C: 5k). Total index
storage is expected in the **low tens of megabytes**. Index size is not a
constraint at this scale; **write-path cost and lock-hold time are the real
budgets**, which is why §1 and §2 are framed around them rather than around
disk.

## 9. Findings

1. **No duplicate index exists.** All five overlaps (§4) are justified,
   documented, and each has a falsifying EXPLAIN scenario.
2. **No mixed-direction and no redundant descending index exists.**
3. **~15 indexes avoided** through leading-prefix exploitation (§3).
4. **Three budget exceptions**, each recorded with a first-removal candidate.
5. **Zero speculative indexes** — every performance index names a catalogued
   query.
6. **Zero JSONB, zero expression, zero INCLUDE, zero non-B-tree indexes;
   zero extensions required.**
7. **The highest-write table carries three indexes** and the lock anchor
   carries two — the two numbers that matter most are the two smallest.

## 10. Handoff

- **DB6:** implement in the order of
  [`DB5_DB6_HANDOFF.md`](./DB5_DB6_HANDOFF.md) §2; run `ANALYZE` after
  seeding.
- **DB9:** datasets D-A..D-G must exist or the partial indexes are never
  exercised and this report cannot be validated.
- **DB10:** unused-index review (ADR-DB5-004 R7) targeting IDX-078, IDX-097,
  IDX-098 first; bloat monitoring on the four high-risk tables; re-check the
  §6 activation thresholds annually.
