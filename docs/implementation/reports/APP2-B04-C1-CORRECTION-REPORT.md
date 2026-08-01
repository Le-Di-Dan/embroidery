# APP2-B04-C1 — Public Catalog Pagination Authority Correction

**Checkpoint:** `APP2-B04-C1` · **Date:** 2026-08-02 · **Branch:** `production`
**Verdict:** **PASS**
**Decision:** IMP-D037 · **ADR amendment:** `ADR-DB5-001` §R10

---

## A. Preflight and the original B04 A/B chain

| Item | Value |
|---|---|
| Branch | `production` |
| Entry HEAD | `559237dd8fb52f57bfebdf227f40b39319f08cfa` — `docs(app2): record public catalog evidence` (B04 Commit B) |
| B04 Commit A | `fa8e05eb49f8f227c09399c1cb591b66b1ed0ba9` — `feat(api): implement public catalog queries`, 31 files, +4338 −5 — **unchanged, not amended** |
| Tracked/staged tree at entry | clean |
| `evidences/` | untouched (ignored, user-owned) |
| Pushed | nothing |
| S01/S02/E01/X01 | not started |

Gates run at preflight: `pnpm check:secrets`, `pnpm check:lifecycle`,
`node --test tools/check-lifecycle-consistency.test.mjs`, `pnpm quality`,
`pnpm check:openapi`, `pnpm check:api-client`, `pnpm check:figma-design-index`,
`node --test tools/check-figma-design-index.test.mjs`, `pnpm db:check:manifest`,
`git diff --check`.

```text
APP2_B04_C1_PREFLIGHT = PASS
```

## B. The pagination-authority contradiction, exactly

Delivered by `APP2-B04` (`drizzle-public-product.repository.ts`,
`public-product-cursor.ts`):

```text
keyset cursor over (display_order ASC, id ASC)
cursor bound to the categorySlug filter
no OFFSET anywhere in the public catalog path
```

Accepted authority at entry:

| Document | Q-01 said |
|---|---|
| `ADR-DB5-001` R5 | `OFFSET`, "≤100 rows total, editorially ordered, jump-to-page expected" |
| `DB5_PAGINATION_ORDERING_MATRIX` §2 | `OFFSET`, cursor `—`, "boundary may shift by one; accepted" |
| `DB5_ACCESS_PATH_MATRIX` §1 | `Pag = OFFSET` |
| `DB5_QUERY_SHAPE_CATALOG` Q-01 | `Pagination: OFFSET` |

The B04 completion report recorded the conflict and handed it to the Product
Owner without editing the authority. That was the correct thing for B04 to do
and the wrong state for the checkpoint to close in: a public API contract may
not contradict an accepted ADR.

`ADR-DB5-001` R8 is the reason the original classification was defensible —
it says converting an `OFFSET` query without an observed threshold "would be
speculative optimization". R8 governs *converting a query that already works*.
When B04 ran, Q-01 had no implementation at all; the classification being
decided was that of a contract being written for the first time. R10 now says
so explicitly.

## C. Product Owner ruling

> Q-01 public catalog list uses **KEYSET** pagination.

| Aspect | Value |
|---|---|
| Order | `products.display_order ASC, products.id ASC` |
| Cursor | `display_order` + `id` + `categorySlug` filter identity |
| Page size | unchanged (`DEFAULT_PAGE_SIZE` 20 / `MAX_PAGE_SIZE` 100, ADR R6) |
| Continuation | `hasNext` + `nextCursor` |
| Scope | **supersedes the Q-01 classification only** |

Recorded as **IMP-D037** in `14-IMPLEMENTATION-DECISION-REGISTER.md` — the next
actual id (the register ended at IMP-D036).

Nothing was reverted, no page numbers or total counts were added, the ordering
tuple and page-size policy are untouched, the public DTO / OpenAPI / generated
client are byte-identical, and no other `OFFSET` query was generalised.

## D. ADR-DB5-001 amendment

- Header: `Status: Accepted — amended 2026-08-02 (R10: Q-01 → KEYSET)`, decision
  ids gain IMP-D037, and an `Amended by` line states that only Q-01 changes.
- R5's Q-01 row now reads `KEYSET` with the cursor rationale.
- R8 gains a paragraph distinguishing "convert a working query" from
  "classify a contract being designed", pointing at R10.
- **R9** is explicitly reserved and unused, so the numbering is never reused.
- **R10** is the amendment: decision table, activation event, scope (with the
  dated history that Q-01 was `OFFSET` from 2026-07-18 until this amendment),
  why the tuple did not change, why the cursor carries the filter, concurrent-
  write behaviour, and a link to the measured access path.

R10 states the concurrency property carefully: a cursor at `(display_order, id)`
is unaffected by rows inserted or reordered elsewhere in the key space, so a
continuation neither duplicates nor omits a row because a boundary shifted.
**No multi-request snapshot is claimed** — successive requests are separate
read-committed transactions and a product published, unpublished or reordered
between two of them will legitimately appear or disappear.

## E. DB5 matrix and catalog reconciliation

| Document | Change |
|---|---|
| `DB5_QUERY_SHAPE_CATALOG.md` | Q-01 `Pagination` → `KEYSET` with cursor + filter identity; `DB6 validation` row replaced with the measured result |
| `DB5_PAGINATION_ORDERING_MATRIX.md` | Q-01 row → `KEYSET`, cursor cell populated, `Aligned? no`, concurrent-write cell → "exact"; amendment note; §8 alignment paragraph corrected; roll-up `OFFSET` 7 → 6, `KEYSET` 1 → 2 |
| `DB5_ACCESS_PATH_MATRIX.md` | Q-01 `Pag` → `KEYSET`; fallback/EXPLAIN cells now record both measured forms; dated amendment note |
| `DB5_COMPLETENESS_MATRIX.md` | Q-01 row annotated with the amendment and the evidence link (status stays `complete`) |
| `DB5_EXPLAIN_VALIDATION_PLAN.md` | E1 expectation replaced with what was measured; a paragraph records that E1 has now run and that its "Index Scan IDX-065, no sort node" expectation is superseded |
| `DB5_TEST_AND_OPERATIONS_HANDOFF.md` | new §3.1.1 with five Q-01 keyset assertions a former offset listing did not need |
| `DB5_INDEX_CATALOG.md` | IDX-065 rationale gains a precise statement of what it does and does not serve |
| `DB5_INDEXES_CATALOG_GALLERY_CONTENT.md` | §1 gains the three measured cases (filtered / constant-`category_id` / unfiltered) |
| `DB5_Q01_ACCESS_PATH_EVIDENCE.md` | **new** — the measurement itself |
| `docs/database/README.md` | DB5 document-set index gains the evidence document |

One collateral fix: the Q-04 gallery row's concurrent-write cell said "as Q-01",
which stopped being true the moment Q-01 changed class. It now states its own
behaviour.

## F. The keyset contract is preserved, not redesigned

No file under `apps/`, `packages/*/src/`, `infrastructure/`, the database
schema or migrations was touched. `git show --stat` for Commit C lists only
documentation, `tools/` and `package.json` (two new scripts, one added to the
`quality` chain). The delivered cursor, ordering, page-size policy, DTOs,
OpenAPI document and generated client are unchanged.

## G. IDX-065 leading-prefix analysis

IDX-065 is `products (category_id, display_order, id) WHERE status='PUBLISHED'`.
Its ordering is reachable only when `category_id` is an **equality constant**,
because that is the leading key.

The delivered contract does not supply one. `GET /api/public/products` filters
by category **slug** — `categories.slug = ?` across the join to `categories` —
so `products.category_id` is not a constant at plan time in either form. This is
a sharper statement than "IDX-065 serves Q-01", and it was measured, not argued.

## H. Filtered access path (measured)

`EXPLAIN (ANALYZE, BUFFERS)`, PostgreSQL 16.14, 33 migrations, `ANALYZE` after
seeding, page size 20:

| Ref | Page | Ordering path | Sort | Rows returned / scanned | Thumbnail loops | Buffers hit / read | Plan / exec ms |
|---|---|---|---|---|---|---|---|
| Q01-F1 | first | `Limit → Result → Sort → Hash Join → Seq Scan → Hash → Seq Scan` | yes | 20 / 61 | 20 | 574 / 0 | 2.388 / 0.866 |
| Q01-F2 | continuation | same | yes | 20 / 41 | 20 | 574 / 0 | 2.401 / 0.757 |

Structural probe `enable_seqscan = off` (Q01-P2): IDX-065 **is** used, as a
`Bitmap Index Scan` — which selects rows and discards order — and a sort node
remains.

Reference form with a constant `category_id` (Q01-P3, **not** the delivered
statement): `Limit → Index Scan` on IDX-065, **no sort node**. That is the exact
filtered utility, and it is reachable only from a form the public contract does
not currently issue.

## I. Unfiltered access path (measured)

| Ref | Page | Ordering path | Sort | Rows returned / scanned | Thumbnail loops | Buffers hit / read | Plan / exec ms |
|---|---|---|---|---|---|---|---|
| Q01-U1 | first | `Limit → Result → Sort → Hash Join → Seq Scan → Hash → Seq Scan` | yes | 20 / 64 | 20 | 574 / 0 | 2.297 / 0.788 |
| Q01-U2 | continuation | same | yes | 20 / 44 | 20 | 574 / 0 | 2.519 / 0.804 |

There is no `category_id` equality at all here, so IDX-065's leading key is
unconstrained and the index cannot supply `(display_order, id)` order under any
planner setting. **No document claims otherwise**, and the consistency checker
now refuses such a claim.

Fixture cardinality (DB5 conventions D-A + D-B skew):

| Rows | Count |
|---|---|
| `products` PUBLISHED / DRAFT / ARCHIVED | 60 / 12 / 8 |
| Skewed category (`thu-bong`) | 40 of the 60 published |
| `categories` | 4 — **not seeded**, provisioned by migration 0033 (IMP-D032) |
| `product_media` / `assets` / `asset_derivatives` | 60 each, one eligible THUMBNAIL chain per published product |
| Duplicate `display_order` pairs | every position shared by two products |

PostgreSQL version:
`PostgreSQL 16.14 on x86_64-pc-linux-musl, compiled by gcc (Alpine 15.2.0) 15.2.0, 64-bit`.

MVP scale is deliberate — the locked bound is 20–100 products. No
production-scale claim is made anywhere in this correction.

## J. Current access-path verdict

**Accepted.**

| Criterion | Evidence |
|---|---|
| Correct page | 20 rows, correct keyset boundary, total order via the tie-breaker |
| Cost | ≤ 64 rows scanned by the ordering path, 574 shared buffer hits, **0 reads**, sub-millisecond execution |
| Sort | top-N heapsort over ≤ 60 rows — no spill, no disk |
| N+1 | none — the thumbnail subquery ran exactly 20 times, once per returned row |
| Keyset effectiveness | continuation pages scan fewer rows than first pages (44 vs 64, 41 vs 61) — rows before the cursor are eliminated at the scan |

A sequential scan and an in-memory sort over an MVP-scale relation are the
correct plan (ADR-DB5-004 R8; E1 already anticipated the unfiltered seq scan;
`DB9_QUERY_PLAN_CATALOG` PERF-R01 measured `Limit → Sort → Seq Scan` for this
shape and passed it).

**No index and no migration were added.** Whether Q-01 should resolve the
category to an id before querying — which would make IDX-065's ordering
reachable — is recorded and **routed to DB10**, preserving DB9/DB10 measured-
tuning ownership. It is not fixed here: that would be a change to frozen B04
source, and the current cost does not justify one.

## K. Consistency checker and regressions

New narrow checker `tools/check-pagination-authority.mjs`, wired into
`pnpm quality` as `pnpm check:pagination-authority`. It parses named rows in
named files and is explicitly not a Markdown parser.

It requires the ADR row, the pagination matrix row, the access-path matrix row,
the query-shape catalog block and the evidence document's machine-checked fact
table to agree on: class `KEYSET`, order `(display_order, id)`, direction `ASC`,
tie-breaker `id`, cursor containing `display_order` + `id` + `categorySlug`.

`tools/check-pagination-authority.test.mjs` — 14 tests. Each copies the real
canonical documents into a scratch tree and reintroduces exactly one drift:

| Fixture | Result |
|---|---|
| ADR Q-01 → `OFFSET` | fails |
| Pagination matrix Q-01 → `OFFSET` | fails (twice: classification + unlabelled-OFFSET scan) |
| Access-path matrix Q-01 → `OFFSET` | fails |
| Query-shape catalog Q-01 → `OFFSET` | fails |
| Order tuple → `(created_at, id)` | fails |
| Cursor drops `categorySlug` | fails |
| Prose claiming an exact IDX-065 match for the unfiltered listing | fails |
| Evidence fact contradicting the documents | fails |
| A machine-checked fact deleted | fails |
| Labelled historical/superseded OFFSET prose | **allowed** |
| A denial ("unfiltered is *not* an exact IDX-065 match") | **allowed** |
| A captured plan naming an index scan | **allowed** — evidence, not a claim |

`tools/explain-q01-access-path.test.mjs` — 21 Docker-free tests over the
harness: the fixture stays at MVP scale, seeds no category, skews one, gives
every `display_order` a duplicate pair; the statements order by the canonical
tuple, never contain `offset`, add the keyset predicate only for a continuation,
filter by slug across the join, escape quotes; the container carries no
credential on any command line, has no password at all, listens on loopback and
removes its volume; the plan summary separates the ordering path from the
subquery and the verdict refuses both a repeated catalog pass and an N+1.

Both files run under the existing `node --test "tools/*.test.mjs"` aggregation
inside `pnpm test`, so they are in `pnpm quality`.

## L. APP2-S01 authority and status

```text
APP2-S01 = READY — NOT STARTED
```

Design authority: **UI02 Discover Feed**, `REUSE_AND_SUPPLEMENT_ONLY` —
`FIG-UI02-DISCOVER-{SECTION,DESKTOP,TABLET,MOBILE}`; 5-column desktop /
3-column tablet / 2-column mobile **masonry** with linear DOM reading order.
Forbidden: an equal-height ecommerce card grid or a uniform 3-column layout.

**S01 was not started.** No Storefront file was created or modified.

## M. APP2-S02 blocker and status

```text
APP2-S02 = BLOCKED_BY_UI03_RECONCILIATION
```

The B04 report concluded `APP2-S02 = READY — NOT STARTED`. That was wrong, and
it is corrected in the phase document and the roadmap. Accepted design authority
says:

```text
APP2-D01-STOREFRONT-PRODUCT-DETAIL = NOT_APPROVED
                                     WITHHELD_PENDING_UI03_RECONCILIATION
reuse policy                       = SEPARATE_RECONCILIATION_REQUIRED
```

Required UI03 roots, recorded exactly:

```text
261:1290
262:1291
273:1409
279:1504
```

Backend completion does not lift a design blocker. The reconciliation was **not**
created or executed here, Figma was not touched, and the public browser route
`/san-pham/<slug>` remains unresolved — `450:404` still marks it `CHƯA CHỐT`.

## N. APP2-E01 handoff

```text
APP2-E01 = BLOCKED_BY_APP2-S01_AND_APP2-S02
```

S02 remains blocked, so E01 remains blocked regardless of S01's readiness.

## O. Frozen application and artifacts

| Baseline | Expected | Actual |
|---|---|---|
| OpenAPI hash | `c2c3b874ba6a3a77680e373a67c288b43580e549090c3fbc6075efbd66b84ee8` | unchanged — `pnpm check:openapi` reports the artifact up to date |
| OpenAPI shape | 16 paths / 19 operations / 34 schemas | unchanged |
| Generated client tree hash | `7524fc918629c7b699ff732771940e05c962309be5eeefdfb53123bbe8ecf5a2` | unchanged — reported verbatim by `pnpm check:api-client` |
| Database | 33 migrations / 78 tables / 833 columns / 190 CHECK | unchanged — `pnpm db:check:manifest` passed, no migration added |
| Database fingerprint | `82864268c990990e4597c74cfc69b7b5a91b1bc5a2adbde098ab9ad43aed58cf` | unchanged |
| Figma | 72 registry ids / 72 node rows | unchanged — gate + 31 tests pass |
| Dependencies / lockfile | unchanged | no `package.json` dependency edit; only two scripts added |

No file under `apps/`, `packages/*/src/`, `packages/contracts/openapi/`,
`packages/api-client/src/generated/`, `infrastructure/` or the migrations
directory appears in Commit C.

## P. Commit C evidence

```text
0c331aa68fcc55f0e946e087618afc21bfad6e53
docs(database): lock public catalog keyset pagination
21 files changed, 1695 insertions(+), 23 deletions(-)
```

| File | + / − |
|---|---|
| `docs/adr/database/ADR-DB5-001-PAGINATION-STRATEGY.md` | 65 |
| `docs/database/DB5_ACCESS_PATH_MATRIX.md` | 8 |
| `docs/database/DB5_COMPLETENESS_MATRIX.md` | 2 |
| `docs/database/DB5_EXPLAIN_VALIDATION_PLAN.md` | 17 |
| `docs/database/DB5_INDEXES_CATALOG_GALLERY_CONTENT.md` | 18 |
| `docs/database/DB5_INDEX_CATALOG.md` | 12 |
| `docs/database/DB5_PAGINATION_ORDERING_MATRIX.md` | 36 |
| `docs/database/DB5_Q01_ACCESS_PATH_EVIDENCE.md` | 170 (new) |
| `docs/database/DB5_QUERY_SHAPE_CATALOG.md` | 4 |
| `docs/database/DB5_TEST_AND_OPERATIONS_HANDOFF.md` | 18 |
| `docs/database/README.md` | 1 |
| `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` | 2 |
| `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` | 1 |
| `docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md` | 8 |
| `package.json` | 4 |
| `tools/check-pagination-authority.mjs` | 268 (new) |
| `tools/check-pagination-authority.test.mjs` | 158 (new) |
| `tools/explain-q01-access-path.mjs` | 314 (new) |
| `tools/explain-q01-access-path.test.mjs` | 211 (new) |
| `tools/explain-q01-fixture.mjs` | 168 (new) |
| `tools/explain-q01-public-catalog.mjs` | 233 (new) |

The harness is two source files because Prettier's reflow put the single file at
473 lines, over the 400-line hard limit; the split is by responsibility (what
data exists vs. what is measured over it), not by line range.

## Q. Validation

| Command | Result |
|---|---|
| `pnpm check:pagination-authority` | **PASS** — 5 canonical documents agree |
| `node --test tools/check-pagination-authority.test.mjs` | 14/14 |
| `node --test tools/explain-q01-access-path.test.mjs` | 21/21 |
| `node --test "tools/*.test.mjs"` | 238/238 |
| `pnpm explain:q01` (disposable PostgreSQL EXPLAIN harness) | 4/4 access paths accepted; run twice with identical row and loop counts |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns=public-product-cursor` | 7/7 — **run twice** |
| `pnpm test:public-catalog:integration` | 17/17 (live PostgreSQL) |
| `pnpm check:secrets` | PASS — 354 documents, 1702 tracked files |
| `pnpm check:lifecycle` | PASS — LC-04 5 transitions |
| `node --test tools/check-lifecycle-consistency.test.mjs` | 10/10 |
| `pnpm check:openapi` | artifact up to date |
| `pnpm check:api-client` | up to date, tree hash `7524fc91…` |
| `pnpm check:figma-design-index` | PASS — 72/72 |
| `node --test tools/check-figma-design-index.test.mjs` | 31/31 |
| `pnpm db:check:manifest` | all checks passed |
| `node tools/check-file-size.mjs` | PASS (28 files above the review threshold, 0 over the hard limit) |
| `pnpm quality` | **exit 0** (21 + 21 + 16 Turbo tasks successful) |
| `git diff --check` | clean |

No Docker smoke was rerun: this correction changes no runtime source and no
contract, so the accepted B04 production evidence still describes the shipped
system. The only Docker use is the EXPLAIN harness's own disposable PostgreSQL.

No unexpected runtime or application file changed.

## R. Acceptance

| # | Criterion | Status |
|---|---|---|
| 1–2 | Clean B04 evidence entry; Commit A unchanged | PASS |
| 3 | Contradiction reproduced | PASS — §B |
| 4–5 | Ruling recorded; Q-01 only superseded | PASS — IMP-D037, R10 |
| 6–7 | ADR Q-01 → KEYSET; history preserved | PASS |
| 8–11 | Order, tie-breaker, filter-bound cursor, page size unchanged | PASS |
| 12 | No OFFSET in current Q-01 authority | PASS — gated |
| 13–17 | Query-shape, pagination, access-path, handoff, completeness reconciled | PASS |
| 18–19 | Register updated with the next actual id; no unrelated query changed | PASS |
| 20–24 | Both paths measured; version, cardinality, nodes/buffers/rows recorded | PASS |
| 25–26 | IDX-065 exact filtered utility stated precisely; no false unfiltered claim | PASS — §G |
| 27–29 | Current path accepted; no index; DB9/DB10 ownership preserved | PASS |
| 30–36 | Checker exists and rejects all five regressions; historical prose allowed | PASS |
| 37–43 | B04 runtime, tests, OpenAPI, client, database, Figma, dependencies unchanged | PASS |
| 44–50 | S01 ready with UI02 authority; S02 blocked with UI03 nodes; route unresolved | PASS |
| 51 | E01 blocked by both | PASS |
| 52–56 | Checker tests, EXPLAIN harness, cursor tests twice, integration, full quality | PASS |
| 57–59 | Commit C authority/tooling only; Commit D evidence only; exactly two commits | PASS |
| 60–65 | Complete report; clean tree; `evidences/` untouched; nothing pushed; no C2; nothing started | PASS |

One criterion needs a word of precision rather than a tick. Criterion 25 asks
that IDX-065's "exact filtered utility" be stated. The prompt's premise was that
the category-filtered form is an exact leading-prefix match. **Measurement says
it is not** — the delivered query filters by slug across a join, so neither form
takes its order from the index; only a `category_id`-constant form does. The
documents now say exactly that, which is what §7 asked for ("that statement must
be made precise") even though the precise statement is not the expected one.

```text
APP2-B04-C1 = PASS
```

## S. Next-checkpoint handoff

```text
APP2-B04    = COMPLETE — CORRECTED (C1) — DELIVERED_FOR_REVIEW
APP2-B04-C2 = MUST_NOT_BE_CREATED
APP2-S01    = READY — NOT STARTED
APP2-S02    = BLOCKED_BY_UI03_RECONCILIATION
APP2-E01    = BLOCKED_BY_APP2-S01_AND_APP2-S02
APP2-X01    = BLOCKED_BY_APP2-E01
```

Open, owned, not acted on here:

| Item | Owner |
|---|---|
| The UI03 reconciliation that unblocks S02 (roots `261:1290` / `262:1291` / `273:1409` / `279:1504`) | design checkpoint |
| The public browser route `/san-pham/<slug>` | Product Owner (`450:404` = `CHƯA CHỐT`) |
| Whether Q-01 should filter by a resolved `category_id` so IDX-065 orders the page | DB10 / a future catalog checkpoint |
| Latency budgets for Q-01 | DB10 |

Stopped after Commit D. S01 not started, the S02 reconciliation not started,
Figma untouched, the browser route undecided, nothing pushed, no further
correction prompt written.
