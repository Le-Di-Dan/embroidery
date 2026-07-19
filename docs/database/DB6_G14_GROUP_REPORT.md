# DB6-G14 — Quotation Group Report

**Date:** 2026-07-19 · **Checkpoint:** DB6-G14 · **Baseline:** HEAD `07caff3` (G13)

## A. Preflight

- Branch `production`, HEAD `07caff3`, tree clean before this group started.
- Migrations `0000`–`0020` byte-identical; journal 21 entries confirmed.
- `drizzle-kit check` clean; manifest/metric/deferred-owner checkers all
  PASS at the pre-G14 baseline (53 tables, 517 physical columns, 96
  physical FKs, 164 logical edges / 162 physical FK targets, 113 launch
  indexes).
- REL-062-e2 confirmed via manifest §2.2.1 ledger: source
  `custom_requests.current_quotation_id` (G9), target `quotations` (G14),
  restrict, resolution owner G14, status `deferred`.
- G14 scope cross-checked against `DB4_TABLE_CATALOG.md` and the C4 audit's
  §3 row ("G14 — Quotation | 4 | 10 | 0 | 0 | 0") — all three agree, no
  Class-C/D findings, no BLOCKED condition.
- Disposable-DB validation plan set up front: no persistent dev DB use
  for upgrade testing (process correction from the G13 review accepted).

## B. G14 scope

| TBL | Table | Aggregate | PK | Mut |
|---|---|---|---|---|
| TBL-050 | `quotations` | AGG-14 | uuid7 | header |
| TBL-051 | `quotation_versions` | AGG-14 | uuid7 | immutable-once-sent |
| TBL-052 | `quotation_line_items` | AGG-14 | uuid7 | immutable w/ version |
| TBL-053 | `quotation_acceptances` | AGG-14 | bigint | append |

Column metrics (formula: logical + expansions = business; business +
convention = physical):

| Table | Logical | Expansions | Business | Convention | Physical |
|---|---|---|---|---|---|
| quotations | 4 | 0 | 4 | 3 | 7 |
| quotation_versions | 20 | 7 | 27 | 2 | 29 |
| quotation_line_items | 8 | 1 | 9 | 2 | 11 |
| quotation_acceptances | 5 | 2 | 7 | 2 | 9 |
| **G14 total** | **37** | **10** | **47** | **9** | **56** |

Relationship classes (all Class A, no Class C/D):

- REL-065 — `quotations` → `custom_requests` (1–1, restrict)
- REL-066 — `quotation_versions` → `quotations`; `quotation_line_items` →
  `quotation_versions` (×2, comp, restrict)
- REL-067 — `quotation_versions` → `quotation_versions` (parent chain,
  self-referencing, restrict)
- REL-068 — `quotations.current_version_id` → `quotation_versions`
  (deferred reverse pointer, intra-group header↔child cycle, custom SQL)
- REL-069 — `quotation_line_items` → `skus` (nullable, display ref,
  restrict)
- REL-070 — `quotation_acceptances` → `quotation_versions` / `customers` /
  `secure_access_grants` / `contact_verification_challenges` (×4, restrict)
- REL-062 e2 (ledger, not a fresh REL row) — `custom_requests` →
  `quotations` (deferred owner G14, custom SQL)

Indexes: IDX-037/038/039/040/041 (constraint-created); **IDX-084**
(`ix_quotation_versions__valid_until_id__sent`, P0 required — implemented,
not deferred, per DB6 register §3.4).

State/type sets: `QUOTATION_STATES` (LC-12, header) and
`QUOTATION_VERSION_STATES` (LC-13, version) — both exact DB3/DB4 values,
stored as `text` + CHECK, no PostgreSQL enum. `QUOTATION_LINE_KINDS`
(PRODUCT/EMBROIDERY/DIGITIZING_FEE/SHIPPING/ADJUSTMENT/OTHER).

Money: `numeric(14,2)` amounts, `numeric(5,2)` `deposit_percent`, closed
`currency_code = 'VND'` CHECK — no float/double anywhere.

JSONB: none (Quotation domain carries no JSONB per
`DB4_JSONB_PAYLOAD_MAP.md`).

Deferred edges resolved: REL-062 e2, REL-068 (both custom SQL, this
group). No new deferred edges created; no G15-owned edge resolved early.

## C. Implementation

- `quotations` (header): identity, code, 1–1 request link, lifecycle
  status, current-version pointer (FK added by custom SQL). Two
  independent unique constraints (code, custom_request_id) per CST-035.
- `quotation_versions`: full pricing snapshot — stitch/color counts
  (GAP-10, admin-entered, never derived), physical dims, quantity, frozen
  product/variant display copies, subtotal/adjustment/shipping/total/
  deposit/remaining money set, currency, validity window, state-scoped
  timestamps, void reason. CST-064 money-arithmetic CHECKs enforce
  `total = subtotal + adjustment + shipping` and `deposit + remaining =
  total` at the row level — single derivation point stays the send
  transaction.
- `quotation_line_items`: frozen pricing lines, closed `line_kind` set,
  nullable display-only `sku_id` FK, positive quantity, non-negative
  money.
- `quotation_acceptances`: append-only secure-flow evidence, one row per
  version (CST-038), references the exact `quotation_versions.id` — never
  `quotations.current_version_id`.
- Migration `0021_create_quotation_tables.sql` (generated) creates all
  four tables with their 9 inline FKs and the one P0 index. Migration
  `0022_add_quotation_current_version_and_request_pointer_fks.sql`
  (hand-authored) adds the two header↔child-cycle FKs: REL-068
  (`quotations.current_version_id` → `quotation_versions`) and REL-062 e2
  (`custom_requests.current_quotation_id` → `quotations`) — same
  sanctioned mechanism as `0016`/`0019`.
- No custom SQL beyond the two documented pointer FKs. No trigger, no
  composite FK, no business-orchestration logic.

## D. Relationship and pointer integrity

**Existence vs same-root ownership**, reported separately per standing
DB6-C4 policy:

| Pointer | Existence | Same-root ownership |
|---|---|---|
| `quotations.current_version_id` → `quotation_versions` (REL-068) | **Physical FK** — dangling ID rejected (live-verified) | **TX/App** — live-reproduced: quotation A's pointer was successfully set to quotation B's version (cross-root, no rejection at DB layer) |
| `custom_requests.current_quotation_id` → `quotations` (REL-062 e2) | **Physical FK** — dangling ID rejected (live-verified) | **TX/App** — same tier; no cross-request smoke needed beyond the existence proof since the request→quotation link is 1–1 by CST-035, not a chain like the version pointer |

No composite FK, trigger, silent normalization, or auto-repair was added
for either pointer — same policy already locked for REL-044/REL-098.

C4 matrix updated (`DB6_RELATIONSHIP_COVERAGE_AUDIT.md` §5): G14's 10
Class-A edges plus the REL-062 e2 ledger resolution are now physical; zero
remaining Class-C/D findings for this group.

**Denominator: unchanged.** REL-068 was already a documented REL row (not
a C4 finding) and REL-062 e2 was already counted in the 164/162
denominator by the §2.2.1 ledger before G14 started. Implementing them
increases the *implemented* FK count only.

Future G15 edges (`orders`, `payment_obligations`, etc. referencing
Quotation) are not resolved here — out of scope per Part V.

## E. Metrics after G14

```text
groups complete:              14 / 19
tables implemented:           57 / 78
logical COL IDs:              369
logical expansions:           53
business columns:             422
convention columns:           151
physical columns:             573
logical edges:                164 / 164
physical FKs implemented:     107 / 162
launch indexes implemented:   114 / 211  (113 + IDX-084)
```

Denominator unchanged (164 logical / 162 physical FK targets) — verified
by `tools/db-manifest-check.mjs`'s live re-derivation, not hand-counted.

## F. A-status

- **A03** — this group adds one partial index to the 45-partial launch set
  (`ix_quotation_versions__valid_until_id__sent`, 13 unique + 32
  performance denominator per `DB6_INDEX_IMPLEMENTATION_MANIFEST.md`
  §3.5); 0 volatile predicates (`now()` never appears in an index
  predicate — the sweep compares at query time). Running implemented count
  is checker-derived, not hand-accumulated here.
- **A08** — new money columns: `subtotal_amount`, `manual_adjustment_amount`,
  `shipping_fee_amount`, `total_amount`, `deposit_percent`,
  `deposit_amount`, `remaining_amount` (`quotation_versions`);
  `unit_price_amount`, `line_total_amount` (`quotation_line_items`);
  `accepted_total_amount` (`quotation_acceptances`). All `numeric(14,2)` /
  `numeric(5,2)`, closed `'VND'` CHECK, arithmetic CHECKs live-verified.
  Money groups implemented to date: G14 (Quotation). Remaining owner
  groups: G15 (shipping fee final), G16 (Payment), G17 (none). Not closed
  globally.
- **A09** — new lifecycle/type sets: `QUOTATION_STATES` (LC-12),
  `QUOTATION_VERSION_STATES` (LC-13), `QUOTATION_LINE_KINDS`. Byte-identical
  parity between TypeScript tuples and CHECK constraints confirmed via
  `\d+` inspection on the disposable fresh-install DB.
- **A10** — categories: `quotations` = mutable header;
  `quotation_versions` = mutable draft then immutable-once-sent (no S24
  trigger yet); `quotation_line_items` = protected with version (frozen
  alongside the parent version, no independent S24 target — correction is
  always a new version); `quotation_acceptances` = append-only evidence.
  S24 targets: CST-092 (`quotation_versions` reject-mutation once
  non-DRAFT). DB7 targets: send-guard (stitch count required, validity
  window required), accept-guard (GRD-002/003/006, CST-114).
- **A11** — launch-required-only: IDX-084 implemented; root/version write
  budget unaffected (append-mostly workload).
- **A12** — remains deferred to DB9; no performance pass run on this
  disposable/near-empty data.
- **A15** — no speculative index added; existing no-index decisions
  preserved.
- **REL-062-e2** — closed, implemented in G14 (custom SQL `0022`).
- **Current pointer existence enforcement** — physical FK, both pointers.
- **Current pointer same-root enforcement** — TX/App, both pointers,
  live-verified gap.
- **Quotation-to-Order boundary** — no `orders`/`payment`/`reservation`
  table or column added; no trigger crosses the boundary.
- **Deposit-to-Reservation boundary** — `deposit_amount`/`remaining_amount`
  are commercial snapshot fields on `quotation_versions` only; no
  `deposit_paid`, `payment_status`, or reservation-linking column added.

## G. Validation

- **Static:** typecheck clean; ESLint clean (0 warnings); Prettier clean;
  79/79 Jest tests pass; 25/25 tool tests pass; file-size check passes
  (only the pre-existing `tools/db-metric-check.mjs` review-threshold
  notice, unrelated to G14); manifest/metric/deferred-owner checkers all
  PASS (57 tables, 573 columns, 164 edges, 107/162 FKs); identifier-length
  scan clean (longest name 51 bytes, well under the 63-byte limit);
  float/double scan clean; JSONB scan clean; Order/Payment/Reservation
  leakage scan clean; plaintext token/OTP/secret scan clean.
- **Fresh disposable install:** `embroidery_g14_fresh` — migrations
  `0000`–`0022` applied cleanly; live counts: 57 tables, 573 columns, 107
  FKs; `drizzle-kit check` clean. Database dropped after verification.
- **G13-prefix disposable upgrade (not the persistent dev DB, per the
  accepted process correction):** `embroidery_g14_upgrade` — migrations
  `0000`–`0020` applied from a trimmed migration set (G13 baseline),
  representative G1–G13 data seeded including a `custom_requests` row with
  `current_quotation_id` still `NULL` (the pre-existing deferred-column
  state), then the real `0021`/`0022` applied on top. Pre-existing row
  survived unchanged; both custom-SQL FKs added without error; no
  drop/recreate; journal append-only (23 entries). Database dropped after
  verification.
- **Reapply/drift:** `drizzle-kit check` clean on both disposable
  databases; no pending migration; no generated diff.
- **Physical parity:** exact G14 table/column/FK counts confirmed live on
  both disposable databases (57/573/107); no Order/Payment/Reservation
  table, no `deposit_paid`, no float money, no plaintext secret.
- **Behavioral smoke (24 cases, all matched expectation):** valid
  quotation/version/line-item/acceptance inserts; dangling FK rejected at
  every level (request, parent version, line-item parent, current-version
  pointer, current-quotation pointer); duplicate 1–1 request, duplicate
  version number, duplicate line position, duplicate acceptance all
  rejected; invalid lifecycle state rejected; money-arithmetic CHECKs
  (total, deposit+remaining) rejected on mismatch; unsupported currency
  rejected; non-positive quantity rejected at both version and line-item
  level; **cross-root `current_version_id` pointer succeeded** (confirms
  the documented TX/App-only gap, same tier as REL-044/REL-098); **line-item
  UPDATE succeeded** (honest S24-deferred gap, not claimed as rejected);
  all rollback-wrapped test rows confirmed absent afterward (clean
  transaction isolation).
- **Security/privacy:** no PII beyond what DB4 already classifies
  (customer_id references only); PostgreSQL error DETAIL not forwarded to
  any application surface (DB layer only, no service code written).
- **Persistent dev DB confirmed untouched:** table count re-checked at 53
  (G13 state) after all disposable-DB work completed.

## H. Commits

```text
<pending — see below>
```

Tree clean before commit; not pushed.

## I. Verdict

```text
DB6-G14      PASS
OVERALL DB6  IN PROGRESS
```
