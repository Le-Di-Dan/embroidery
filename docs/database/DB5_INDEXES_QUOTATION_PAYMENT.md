# DB5 — Index Design: Quotation & Payment (CTX-QUO / CTX-PAY)

**Date:** 2026-07-18 · **Git HEAD:** `456e101`
**Tables:** TBL-050..TBL-058
**Index IDs:** IDX-037..043, 075..081, 084, 122..124

This is the financial context. Two constraint-backed indexes here
(IDX-042 obligation uniqueness, IDX-043 provider-event uniqueness) are the
arbiters that prevent double-charging and double-crediting.

## 1. Quotation root, current pointer and history

| Path | Predicate | Index |
|---|---|---|
| **Q-13** current quotation | `custom_request_id` → `current_version_id` | IDX-037 (CST-035) → PK |
| Lookup by code | `code` | IDX-038 (CST-035) |
| **Q-12** version history | `quotation_id` | IDX-039 (CST-036), backwards |
| Line items | `(quotation_version_id, position)` | IDX-040 (CST-037) |
| Acceptance evidence | `quotation_version_id` | IDX-041 (CST-038) |

The **current version is a header pointer** (`quotations.current_version_id`,
REL-068), followed by PK. There is deliberately **no index supporting a
"max(version)" scan**: the pointer exists precisely so that the current
version is a single-row follow rather than an aggregate. Consistency of the
pointer is TX-owned (DB4 relationship rules).

`quotation_versions` rows freeze at SENT (CST-092), so their index
maintenance is effectively insert-only afterwards — only the status column
advances. Deposit and remaining amounts come from the **version**
(COL-TBL051-16), never recomputed at read time.

`stitch_count` (COL-TBL051-05) is an **admin-entered immutable pricing
input** (GAP-10), never derived. It is **not indexed** — no query filters on
it; it is a pricing input carried in the frozen version.

## 2. Quotation expiry (Q-24)

**IDX-084** — `quotation_versions (valid_until, id) WHERE status='SENT'`

- The equality moved into the **partial predicate** rather than a leading
  key column — strictly better here, because it also shrinks the index and
  excludes the frozen terminal states permanently.
- `valid_until` is nullable in DRAFT only, and the `status='SENT'` predicate
  excludes those rows (it is required at send, COL-TBL051-18), so the NULL
  ordering question does not arise.
- The horizon comparison is a **range scan on the key**, never an index
  predicate (ADR-DB5-003 R3).
- **CC-06** (expiry sweep vs acceptance): both paths lock the version row;
  committed-first wins, and an accept-after-expire fails. The sweep never
  wins by default.
- **CC-05** (accept an old version after a new one was sent) is an
  in-transaction state check, not an index concern.

## 3. Payment obligations — Deposit and Remaining are independent

**IDX-042** — `payment_obligations (order_id, kind) WHERE status IN ('PENDING','SATISFIED')` (CST-039)

This partial unique encodes **INV-04**: at most one *live* obligation per
(order, kind). Three properties are locked and must not be blurred:

- **`DEPOSIT` and `REMAINING` are two independent obligations.** They have
  separate lifecycles, separate attempts, and separate satisfaction. Q-17
  and Q-18 are therefore **two queries**, not one parameterized guess, and
  neither may infer the other's state.
- **`SUPERSEDED` and `CANCELLED` are excluded** from the predicate, which is
  what makes recalculation possible (ADR-DB3-003 r7): a superseded
  obligation stays in the table as evidence while a new live one is created.
- **IDX-075 `(order_id)` is required alongside it**, because Q-09 must show
  the customer the full obligation picture including superseded rows — which
  the partial index cannot serve. A partial index is never used as a full
  access path.

| Path | Index |
|---|---|
| Live obligation per (order, kind) | IDX-042 (CST-039) |
| **All** obligations of an order | IDX-075 |
| Attempts for an obligation | IDX-077 |

`satisfied_at` is set **exactly once** (CC-10, COL-TBL054-06) under an
obligation-row lock; `satisfied_by_attempt_id` (REL-083) is the
exactly-once application evidence. Neither is indexed — both are read from
an already-located row.

## 4. Payment attempts

| Path | Predicate | Index |
|---|---|---|
| Attempts by obligation | `payment_obligation_id` | IDX-077 |
| **Q-23** failed / needs review | `status IN ('FAILED','REQUIRES_REVIEW')` | IDX-076 `(created_at DESC, id DESC)` |
| Provider reference lookup | `(provider_key, provider_ref) WHERE provider_ref IS NOT NULL` | IDX-078 |

IDX-076's partial predicate uses exact LC-16 members. `REQUIRES_REVIEW` is
the state contradictory or out-of-order callbacks land in (CC-08, CST-118) —
it is an operational queue that must never be missed, which is why it shares
the failed-payments index rather than being an afterthought.

IDX-078 is partial on `provider_ref IS NOT NULL` because the column is
nullable (COL-TBL055-06) — bank-transfer and manual attempts have none.
Excluding them keeps the index near-unique and small.

The attempt state machine **never regresses** (CST-118) — an application
rule enforced in-transaction, not by an index.

## 5. Provider events and reconciliation (Q-16) — P0

**IDX-043** — `payment_provider_events (provider_key, provider_event_ref)` (CST-040)

This is the **duplicate-callback arbiter** (INV-07 / GRD-012, CC-07). The
first callback applies; duplicates replay the stored outcome, and the event
row is still appended as evidence. Verified by D7-09 / D8-01, both marked
critical in DB4.

Four distinct reconciliation forms, four indexes:

| Form | Predicate | Index |
|---|---|---|
| (a) exact event | `(provider_key, provider_event_ref)` | IDX-043 |
| (b) date-range review | `received_at` range | IDX-079 `(received_at DESC, id DESC)` |
| (c) **unmatched** events | `payment_attempt_id IS NULL` | IDX-081 |
| (d) join to attempt | `payment_attempt_id = ?` | IDX-080 |

Form (c) is the operationally important one: `payment_attempt_id` is
nullable by design (REL-086) because **unmatched events await manual
reconciliation**. IDX-081's partial index on `IS NULL` stays tiny — an
unmatched event is an exception, not the norm — and makes "what needs my
attention" a constant-cost query regardless of total event volume.
IDX-080 is its complement, partial on `IS NOT NULL`.

Q-16 uses **`KEYSET`** pagination (ADR-DB5-001 R5), the only admin listing
that does: `payment_provider_events` is append-heavy and written
concurrently by provider callbacks while an admin is reviewing. Offset
paging would repeat or skip financial evidence rows mid-review.

`redacted_payload` (JSONB) is **opaque evidence** — reconciliation filters
exclusively on relational columns (`provider_key`, `provider_ref`, `amount`,
`currency_code`, `signature_valid`, `application_outcome`, `received_at`).
**No GIN index** (ADR-DB4-004 #6).

`signature_valid` (COL-TBL056-07) records server-side verification (INV-15).
Payment success is **never** based on a browser redirect — the callback
evidence chain is the source of truth.

## 6. Manual reconciliation and refunds

| Path | Index |
|---|---|
| Reconciliations by attempt | IDX-124 |
| Refunds by order | IDX-122 |
| Refund review queue (`PENDING_REVIEW`, `APPROVED`) | IDX-123 |

`payment_reconciliations` is append-only evidence (CST-098); **CC-09**
(manual reconcile vs provider callback) locks the attempt row — first commit
wins, the second escalates to `REQUIRES_REVIEW` rather than silently
overwriting.

`refunds` amounts are immutable after insert (CST-100); only status and
decision columns advance (LC-20). The refundable-amount check (CST-117 /
GRD-021) is a **cross-row aggregate over attempts, evaluated in the
transaction** — not a constraint and not an index.

`bank_reference` (COL-TBL057-08) and `transfer_reference` (COL-TBL058-08)
are `[SEC]` access-controlled evidence and are **not indexed** — no
catalogued query looks up a payment by bank reference, and creating that
path would widen exposure of manual-transfer evidence for no operational
gain.

## 7. Money and index design

Per ADR-DB4-001: money is exact `numeric(14,2)` plus a row `currency_code`;
**no float exists anywhere**. Consequences here:

- **No amount column is indexed.** No catalogued query filters or sorts by
  amount; reconciliation matches on references and outcomes, not values.
- Amount *comparisons* (provider-reported vs expected, GRD-011) are exact
  equality on `numeric` inside the verification transaction — correct
  precisely because the type is exact.
- `currency_code` is CHECK-constrained to `'VND'` (CST-068) and has
  cardinality 1. Indexing it would be useless today and misleading later.

## 8. Write-cost summary

| Table | Profile | Indexes (incl. PK) | Budget | Status |
|---|---|---|---|---|
| TBL-050 quotations | low | 3 | ≤5 | ok |
| TBL-051 quotation_versions | low (frozen at send) | 3 | ≤5 | ok |
| TBL-052 line_items | insert-only | 2 | ≤5 | ok |
| TBL-053 acceptances | append | 2 | ≤3 | ok |
| TBL-054 obligations | moderate | 3 | ≤5 | ok |
| TBL-055 attempts | moderate | 4 | ≤5 | ok |
| TBL-056 provider_events | **append-heavy** | **5** | ≤3 | **over budget — justified** |
| TBL-057 reconciliations | append | 2 | ≤3 | ok |
| TBL-058 refunds | low | 3 | ≤5 | ok |

### The `payment_provider_events` budget exception

Five indexes (PK, IDX-043, IDX-079, IDX-080, IDX-081) on an append-heavy
table exceeds the ≤3 budget of ADR-DB5-004 R6. Recorded and justified rather
than silently taken:

- Write rate is bounded by **real payment volume** — <100 orders/month means
  a few hundred callbacks per month, not a firehose. The "append-heavy"
  classification is about the table's *shape*, not its throughput here.
- IDX-043 is **non-negotiable**: it is the INV-07 arbiter.
- IDX-079, IDX-080, IDX-081 each serve a **distinct P0 reconciliation
  form** with no overlap (time-range, join, unmatched); IDX-080/081 are
  complementary partials over the same nullable column, so together they
  cost roughly one full index.
- Financial reconciliation is the highest-consequence read path in the
  system; a missed unmatched payment is a money error, not a slow page.

First removal candidate if usage shows otherwise: IDX-078 (attempt provider
reference), which duplicates part of what IDX-043 already answers from the
event side.

## 9. Validation handoff

- **DB7:** **D7-09** (CST-040 provider event uniqueness), D7-13 (CST-039),
  D7-06 (money non-negative, CST-063), D7-03 (CST-092/100 immutability),
  D7-10 (CST-073 refund evidence, CST-117 refundable).
- **DB8:** **D8-01** (duplicate callbacks, CC-07), D8-02 (out-of-order
  callbacks, CC-08), D8-03 (refund vs late callback), D8-04 (obligation
  uniqueness), D8-10 (double acceptance, GRD-006), D8-11 (concurrent
  version creation, CC-28).
- **DB9:** seed must include unmatched provider events (`payment_attempt_id
  IS NULL`), a superseded obligation chain, attempts in `REQUIRES_REVIEW`,
  attempts with NULL `provider_ref`, and an expired SENT quotation version —
  otherwise the four partial indexes here are never exercised.
