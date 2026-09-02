# APP12-B01-C1 — Dev Data Provenance Cleanup

Correction: `APP12-B01-C1 — Dev data provenance cleanup`
Parent: `APP12-B01 — Public purchasable SKU projection`
Phase: `APP12 — Hardening, UAT and Production Readiness`
Correction budget: **1 / 1 used — no C2**
Date: 2026-09-02

---

## A. Verdict

```text
APP12-B01-C1 = COMPLETE
APP12-B01    = COMPLETE_AFTER_C1
APP12-B02    = NEXT

provenance_proven                = true
B01_SKUs_remaining               = 0
B01_stock_anchors_remaining      = 0
B01_live_holds_remaining         = 0
B01_live_reservations_remaining  = 0
immutable_history_rows           = 0
G03_data_created                 = false
replacement_seed_inserted        = false
```

Six rows were removed. Nothing was deleted by inference, no constraint was
bypassed, no append-only record was touched, and the host Product and Variant
survive byte-identical.

---

## B. Accepted B01 core

Untouched by this correction, as instructed. No production runtime file changed;
the source delta is documentation only.

```text
operation                = publicProductVariant_list   (extended, 0 new operations)
APP5 variant semantics   = PRESERVED
SKU identity             = delivered
multiple SKU projection  = delivered
price                    = override precedence · base fallback · canonical wire
availability             = APP8 authority · HELD · RESERVED · terminal ignored
missing stock            = unavailable, 0 GET mutations
OpenAPI                  = 120 paths / 133 operations / 261 schemas
public operations        = 44  (31 DENY / 13 ALLOW)
migrations               = 38, schema delta 0
```

Re-verified after cleanup — see §M.

---

## C. Root cause

`APP12-B01` §P needed a live gateway response that actually contained a SKU, a
resolved price and an availability figure. The development database held **0**
`skus` and **0** `sku_stocks` rows, so four SKUs and two stock anchors were
inserted onto the existing development Product `ao-thun-cotton`. The synthetic
soft hold was removed afterwards; the six catalog and inventory rows were left in
place and the report described them as "additive dev catalog data".

That reasoning was wrong in a specific way. Additive is not the same as
temporary. Those six rows are persistent business data on a published Product,
and once the checkpoint ended nothing distinguished them from catalog an operator
had authored — not to a later checkpoint, not to a reviewer, not to `APP12-G03`
when it comes to build the representative dataset it actually owns.

The deeper error was an implicit transfer of ownership: keeping data because it
looks useful to a future checkpoint. `APP12-B01` had no authority to create
representative development data, and it could not grant itself that authority by
deciding its leftovers were worth keeping. B01's own automated evidence already
runs against a disposable PostgreSQL the harness provisions and drops; only the
live gateway step reached for the shared database, and that step is exactly where
the discipline lapsed.

---

## D. Provenance audit

Read-only, before any mutation. Every row in both tables was proven B01-created
on **four independent lines of evidence that agree**, not on any one of them.

| Table | PK | Business key | Parent variant | `created_at` | Proof |
| --- | --- | --- | --- | --- | --- |
| `skus` | `…0000000000a1` | `DEV-AO-M-BASE` | `…000000000062` | `2026-09-02 00:58:09.195845+00` | 1·2·3·4 |
| `skus` | `…0000000000a2` | `DEV-AO-M-OVERRIDE` | `…000000000062` | same instant | 1·2·3·4 |
| `skus` | `…0000000000a3` | `DEV-AO-M-NOANCHOR` | `…000000000062` | same instant | 1·2·3·4 |
| `skus` | `…0000000000a4` | `DEV-AO-M-INACTIVE` | `…000000000062` | same instant | 1·2·3·4 |
| `sku_stocks` | `…0000000000b1` | anchor for `…a1`, on hand 12 | — | same instant | 1·2·3·4 |
| `sku_stocks` | `…0000000000b2` | anchor for `…a2`, on hand 4 | — | same instant | 1·2·3·4 |

Full UUID prefix for every row above: `019f9900-0000-7000-8000-`.

The four lines of evidence:

1. **Recorded primary keys.** Every id is a *literal* written in the B01 seed
   statement — not a generated one — and is transcribed in `APP12-B01`
   §P. This is ownership proof; the remaining three are corroboration.
2. **Authored business keys.** All four codes carry the `DEV-AO-M-` prefix
   invented for that seed. No migration, fixture or reference dataset in the
   repository emits that prefix.
3. **A measured empty baseline.** Immediately before the seed, `APP12-B01`
   recorded `select count(*) from skus` → **0** and `sku_stocks` → **0**. There
   was no pre-B01 SKU in this database that could be mistaken for one of these,
   which is why "all rows in the table" and "the rows B01 created" are provably
   the same set here rather than an assumption.
4. **A single-transaction timestamp.** All six rows share
   `created_at = 2026-09-02 00:58:09.195845+00` to the microsecond — one `COMMIT`,
   consistent with the one seed statement and inconsistent with any incremental
   operator authoring.

The host Product and Variant were created `2026-08-21 12:42:47.756242+00`, ten
days earlier: unambiguously **not** B01's, and therefore out of scope for
deletion.

No row was a candidate on similarity, recency, Product association or expected
count alone. Had the tables held any pre-B01 SKU, evidence 1 and 2 would still
have separated the sets; the fact that they did not need to is stated as fact,
not relied on as method.

---

## E. Dependency graph

Every foreign key that could reference the target rows, enumerated from
`pg_constraint` rather than from memory:

| Referencing table | Constraint | → | `ON DELETE` | Rows referencing B01 data |
| --- | --- | --- | --- | --- |
| `sku_stocks` | `fk_sku_stocks__sku_id` | `skus` | `restrict` | **2** (the B01 anchors themselves) |
| `order_items` | `fk_order_items__sku_id` | `skus` | `restrict` | **0** |
| `quotation_line_items` | `fk_quotation_line_items__sku_id` | `skus` | `restrict` | **0** |
| `inventory_soft_holds` | `fk_inventory_soft_holds__sku_stock_id` | `sku_stocks` | `restrict` | **0** |
| `inventory_reservations` | `fk_inventory_reservations__sku_stock_id` | `sku_stocks` | `restrict` | **0** |
| `inventory_ledger_entries` | `fk_inventory_ledger_entries__sku_stock_id` | `sku_stocks` | `restrict` | **0** |

No order line, no quotation line, no hold, no reservation and no ledger entry
depends on any of the six rows. The only dependency inside the set is
`sku_stocks → skus`, which fixes the deletion order.

`pg_trigger` reports **no** non-internal trigger on `skus` or `sku_stocks`, which
is why the raw-SQL seed produced no derived rows anywhere.

---

## F. Cleanup transaction

One transaction, child rows first, constraints respected:

```sql
begin;
  delete from sku_stocks where id in (…b1, …b2) and sku_id in (…a1, …a2);   -- 2
  delete from skus       where id in (…a1, …a2, …a3, …a4)
                           and code in ('DEV-AO-M-BASE','DEV-AO-M-OVERRIDE',
                                        'DEV-AO-M-NOANCHOR','DEV-AO-M-INACTIVE'); -- 4
  do $$ … raise exception unless the outcome is exactly as intended … $$;
commit;
```

Two deliberate safety properties:

- **Every predicate is doubly bound.** Each `delete` matches on the recorded
  primary keys **and** on a second B01-owned attribute (the anchor's `sku_id`,
  the SKU's authored `code`). A mistyped id therefore deletes nothing rather than
  deleting something else.
- **The transaction refuses to commit a wrong outcome.** A `DO` block asserts,
  before `COMMIT`, that `skus` and `sku_stocks` are empty and that the host
  Product (id, slug, `PUBLISHED`, base price `250000.00`), the host Variant (id,
  `is_active`) and the five category rows are all still present and unaltered.
  Any deviation raises and rolls the whole thing back.

Result: `DELETE 2`, `DELETE 4`, `DO`, `COMMIT`.

`fk_sku_stocks__sku_id` is `ON DELETE restrict` and was satisfied by ordering,
not by evasion. **No** trigger was disabled, **no** constraint dropped, **no**
table truncated, **no** database reset, and no `products`, `product_variants`,
`categories`, `orders`, `custom_requests` or payment row was written.

---

## G. Immutable history disposition

```text
immutable_history_rows = 0
```

The §8 retention conflict does not arise, and this was measured rather than
assumed:

| Append-only surface | Rows from the B01 window (≥ `2026-09-02 00:50+00`) | Whole-table total |
| --- | --- | --- |
| `audit_events` | **0** | 209 (all pre-B01) |
| `outbox_events` | **0** | 90 (all pre-B01) |
| `inventory_ledger_entries` | **0** | **0** |

The B01 seed was raw SQL against tables carrying no triggers, and the live reads
it exercised are the checkpoint's own mutation-free `GET`. So the live evidence
produced no audit record, no outbox event and no inventory ledger entry — there
is no test-history residue to classify, and nothing was deleted from any
append-only table. The 299 pre-existing audit and outbox rows predate the B01
window and were left untouched.

---

## H. Post-cleanup counts

| Table | Before C1 | After C1 |
| --- | --- | --- |
| `skus` | 4 | **0** |
| `sku_stocks` | 2 | **0** |
| `inventory_soft_holds` | 0 | **0** |
| `inventory_reservations` | 0 | **0** |
| `inventory_ledger_entries` | 0 | **0** |
| `audit_events` | 209 | **209** |
| `outbox_events` | 90 | **90** |
| `products` | 30 | **30** |
| `product_variants` | 2 | **2** |
| `categories` | 5 | **5** |

`skus` and `sku_stocks` are back to the **0 / 0** the B01 report itself measured
as the pre-seed baseline — the database is in the state it was in before B01
touched it.

---

## I. Existing Product / Variant preservation

```text
existing_Product = PRESERVED
existing_Variant = PRESERVED
```

| Field | Value after cleanup |
| --- | --- |
| Product id · slug | `019f9900-…-000000000061` · `ao-thun-cotton` |
| name · status | `Áo thun cotton` · `PUBLISHED` |
| base price · currency | `250000.00` · `VND` |
| category | `019f9900-…-000000000060` (`ao-thun`, `PUBLISHED`) |
| `is_display_out_of_stock` · `is_indexable` · `display_order` | `false` · `true` · `1` |
| `created_at` · `updated_at` | `2026-08-21 12:42:47.756242+00` · **identical** |
| Variant id · labels · `is_active` | `019f9900-…-000000000062` · `Trắng ngà` / `M` · `true` |
| Variant `created_at` · `updated_at` | `2026-08-21 12:42:47.756242+00` · **identical** |

The strongest evidence is the last row of each half: `updated_at` still equals
`created_at` on both records. Nothing wrote to the Product or the Variant at any
point — not during B01's seed, and not during this cleanup. Product media (0
rows) and all five categories are likewise unchanged.

---

## J. API post-cleanup behaviour

Live, through the canonical gateway, after cleanup and with **no** source change
and no restart:

```text
GET /api/health                                     -> 200
GET /api/public/products/ao-thun-cotton             -> 200
GET /api/public/products/ao-thun-cotton/variants    -> 200
```

```json
{ "productId": "019f9900-…-000000000061",
  "variants": [{ "productVariantId": "019f9900-…-000000000062",
                 "colorName": "Trắng ngà", "sizeLabel": "M",
                 "skus": [] }] }
```

This is the §12 compatibility proof, and it is a better one than the seeded
response was. The Product has no SKU at all, and:

- the **variant is still returned** — it is not withheld because Ready-Made has
  nothing to sell, which is the exact `APP5` guarantee B01 claimed;
- `skus` is an **empty array**, not a null, not a missing key and not a 404;
- the Product detail still resolves with its price and its category, so the
  catalog surface is unaffected by having no purchasable SKU.

Mutation-free in the restored state as well: three further reads of the variants
endpoint left `skus = 0, sku_stocks = 0, holds = 0, reservations = 0,
ledger = 0`. A public `GET` on a Product with no SKU and no stock anchor still
provisions nothing.

---

## K. Future live-fixture cleanup strategy

No seed helper or script exists in the repository — the B01 seed was a manual
`psql` statement — so per §10 and §16 the correction records the procedure rather
than building a data-seeding framework. It is written where it will be read
again, as **`VALIDATION_GOVERNANCE.md` §3A.4**, not only in this report.

Two permitted sources of live subject data, and no third:

```text
1. existing development data, read without mutation
2. a bounded, test-only fixture the same checkpoint removes again
```

For option 2 the cycle is mandatory and the last step is the load-bearing one:

```text
seed -> run the HTTP evidence -> remove -> prove removal by row count
```

with these rules, each one derived from how this defect actually happened:

- **Record the primary keys you insert.** Cleanup that has to infer what it
  created eventually deletes something else. A code, a timestamp, a parent
  association or a row count is corroboration, never proof.
- **Use unmistakably test-only business keys** where the schema permits, so a row
  that outlives its checkpoint is recognisable as debris rather than as catalog.
  (B01's `DEV-AO-M-*` prefix did do this, and it is why provenance was
  recoverable at all — the failure was retention, not naming.)
- **Delete children before parents** and let the declared foreign keys work.
  Never disable a trigger, drop a constraint, truncate, or reset the database.
- **Guard the deletion inside the transaction**: assert the intended counts and
  the survival of surrounding business rows before `COMMIT`, so a mistaken
  predicate rolls back instead of committing.
- **Never clean append-only history.** Audit, outbox and ledger rows stay and are
  classified in the report with their live business effect stated.
- **A checkpoint may not keep its seed because a later checkpoint will want it.**
  Representative data is `APP12-G03`'s deliverable under its own authority.
- If provenance cannot be proven from recorded evidence, report
  `BLOCKED_PROVENANCE` and delete nothing.

Automated suites are unaffected and need no change: they already run against a
disposable PostgreSQL the harness provisions, migrates and drops. This rule is
about live gateway evidence only.

---

## L. Files changed

No production runtime source, no test source, no generated artifact.

**Modified (4)**

```text
docs/implementation/VALIDATION_GOVERNANCE.md                      (new §3A.4)
docs/implementation/reports/APP12-B01-COMPLETION-REPORT.md        (correction notice; §P superseded, preserved)
docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md
```

**New (1)**

```text
docs/implementation/reports/APP12-B01-C1-COMPLETION-REPORT.md
```

The remaining change is to the **development database only**: six rows removed.

---

## M. Validation

| Command | Result |
| --- | --- |
| `git diff --check` | clean |
| Read-only provenance audit (`skus`, `sku_stocks`, holds, reservations, ledger, `pg_constraint`, `pg_trigger`) | complete — §D, §E |
| Guarded cleanup transaction | `DELETE 2` · `DELETE 4` · `DO` · `COMMIT` |
| Post-cleanup row counts | §H |
| `CMD-TEST-APP12-B01-CONTRACT` | 2 suites / **23** tests PASS |
| `CMD-TEST-APP12-B01-INVENTORY` (real PostgreSQL) | 2 suites / **25** tests PASS |
| APP5 consumer regression (`custom-request`) | 8 suites / **131** tests PASS |
| `release-gate` contract | **11** tests PASS |
| `CMD-CHECK-CATEGORY-SOURCE-OF-TRUTH` | PASS — 2 392 files |
| `CMD-OPENAPI-CHECK` | PASS — artifact up to date |
| `CMD-API-CLIENT-CHECK` | PASS — tree hash `8dba96d1…` unchanged |
| Live HTTP post-cleanup smoke | PASS — §J |
| Prettier on touched docs | PASS |

The missing-stock no-mutation test is inside `CMD-TEST-APP12-B01-INVENTORY` and
passed; it was additionally re-proved live against the restored database (§J).

No typecheck, ESLint or file-size gate is reported: no `.ts`/`.tsx`/`.scss` file
changed, so per `VALIDATION_GOVERNANCE.md` §3A.1 the "Docs / Markdown only" row
applies and running app suites for a documentation delta would be theatre. The
B01 suites above were run anyway — not because the source changed, but to prove
the *database* cleanup did not alter behaviour.

---

## N. Baseline freeze

```text
OpenAPI                    120 paths / 133 operations / 261 schemas   (unchanged)
generated client           unchanged (tree hash identical)
migrations                 38        (delta 0)
DB schema                  unchanged (no DDL of any kind)
routes                     unchanged
release matrix             31 DENY / 13 ALLOW
Figma                      unchanged
Storefront purchase UI     not started
Admin UI                   unchanged
B01 implementation         semantically unchanged — no runtime file touched
```

No migration was added. No Ready-Made order creation exists. No replacement seed
was inserted and no `APP12-G03` dataset was created.

---

## O. Follow-ups

`FU-APP12-B01-01` is unchanged and remains owned by **`APP12-B02`**: order
creation must resolve the price through `resolvePublicSkuUnitPrice()` and
re-check availability under the `sku_stocks` anchor lock.

**No follow-up is created for the cleanup.** It was mandatory now, it is done,
and deferring it to `APP12-G03` is precisely the implicit ownership transfer this
correction exists to reject.

Recorded, informationally: `APP12-B02` and `APP12-S01` will need a purchasable
SKU to exercise. They must obtain one under §K — a bounded fixture they remove
again, or `APP12-G03`'s dataset once it exists — never by re-seeding the
development catalog and leaving it there.

---

## P. Roadmap

```text
APP12-B01    = COMPLETE_AFTER_C1
APP12-B01-C1 = COMPLETE   (correction 1/1 — no C2)
APP12-B02    = NEXT
```

`APP12-B02`, `APP12-S01`, `APP12-G03` and `APP12-A01` remain open and unstarted.
Roadmap `LOCKED` at 38. Nothing pushed.
