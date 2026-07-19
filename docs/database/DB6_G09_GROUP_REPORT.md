# DB6-G09 — Request Intake & Design Case Group Report

**Date:** 2026-07-18 · **Verdict:** `DB6-G9 PASS` · `OVERALL DB6 IN PROGRESS`

## A. Preflight

`production` @ `71cb28e` · tree clean · all commits through G8 ·
`0000`–`0011` byte-identical · journal 12 entries · checker PASS with
canonical metrics confirmed (290 columns, 153/151 pre-G9) · DEV-DB6-009 map
in manifest + register · drift clean 12/12 · G1–G8 parity intact (30 tables
/ 68 indexes) · G7 sessions + G8 verification tables present as targets ·
no partial G9 (`schema/ordering/` absent) · not pushed.

## B. G9 scope (derived; matched expected 7-table family)

| Item | Value |
|---|---|
| Group / context | G9 — Request intake & design case (CTX-ORD AGG-13 / CTX-DSN AGG-10) |
| TBL / tables | TBL-037 `custom_requests`, TBL-038 `customer_owned_products`, TBL-039 `custom_request_quantity_breakdowns`, TBL-040 `custom_request_assets`, TBL-041 `request_moderation_notes`, TBL-042 `custom_request_transitions`, TBL-027 `design_cases` |
| Column metrics | **33 logical IDs + 7 ×N expansions (037-04 ×2, 038-04 ×2, 042-02 ×2, 042-03 ×5) = 40 business + 19 convention = 59 physical** (14/8/7/6/6/13/5) |
| REL edges → FKs | REL-060 (1), REL-061 ×2, REL-062 e1 (custom SQL `0013`), REL-063 ×5, REL-064 (1), REL-043 (1), REL-105 TBL-042 subset (2), **DEV-DB6-010 edge** (assets) = **14 physical FKs** |
| Deferred edges | REL-062 e2 (`current_quotation_id`) → **G14** · REL-044 (`current_version_id`) → **G11** · REL-105 `grant_id` → **G10** |
| No-FK evidence columns | `submitted_session_id` (no REL row; sessions hard-TTL), `request_moderation_notes.admin_id` (dictionary arrow only — DB4 FKs actor refs solely via REL-105, TBL-041 not listed; consistent with TBL-019) |
| CST | CST-001 ×7, CST-020, CST-026, CST-027 (INV-13), CST-028, CST-043 inst., CST-060 (LC-11 ×3 columns), CST-062, CST-066; **CST-121 (subject XOR) = TX/App** — cross-table, no fake CHECK; CST-098 → S24 (TBL-041/042) |
| IDX | Constraint-created: 7 PK + IDX-022/028/029/030/051 · Explicit perf: **IDX-073** (status, created DESC, id DESC), **IDX-100** · Recommended → S25: IDX-117, IDX-137 |
| JSONB | none in G9 (5/9 unchanged) |
| State/type | LC-11 (10 states incl. QUOTE_ACCEPTED), asset role set, moderation kind set |
| Dependencies | G1 (admins), G3 (customers), G4 (assets), G5 (catalog) — G7/G8 integrate via evidence/no-FK columns |
| DB9 seed | customers + catalog before requests; design case after request |
| DB10 | retain-class; PII via customer anonymization; append histories retained |

## C. Implementation highlights

- **DEV-DB6-010 (new deviation, found during FK accounting):** the mandated
  `custom_request_assets → assets` edge is absent from the REL model — every
  sibling asset-association table has an explicit ×2 row (REL-025/042/048/
  057/095), but TBL-040 was bundled into REL-063's five `→ custom_requests`
  edges and its asset edge dropped. Implemented per ADR-DB4-003/CST-043;
  denominators move **153→154 logical / 151→152 physical** via the standing
  scope-guard clause; checker counts it as a documented addition.
- **Request ≠ Order:** leakage scan for order/payment/deposit/reserved/
  amount columns on G9 tables = 0. LC-11 has no ORDERED/PAID alias (smoke
  rejects them).
- **INV-13:** COP table scanned — 0 sku/stock/price columns; CST-027 caps
  one COP per request; fake-SKU path impossible by construction.
- **Request Item not resurrected:** breakdowns have no state/version/public
  identity; root owns invariants; mutable-until-QUOTED stays app-guarded
  (cross-row).
- **Design case = header:** 2 business columns, no status (state derives
  from G11 versions), CST-020 1–1; pointer cycle resolved by custom SQL
  `0013` (REL-102/REL-033 mechanism), restrict + nullable.
- **Verification-before-customer:** `customer_id` NOT NULL (customer is
  resolved/created first in the submission tx); challenge evidence is a TX
  guard — DB4 defines no challenge FK and none was invented.
- Migrations: `0012` (7 tables, 7 PK, 4 UQ, 7 CK, 13 FK, IDX-073/100) +
  `0013` (custom pointer FK). `0000`–`0011` untouched.

## D. Metrics after G9

```text
groups complete:                     9 / 19
tables implemented:                 37 / 78
logical COL IDs: 227 · expansions: 20 · business: 247 · convention: 102
physical columns:                  349 (register/live agree)
logical relationship edges:        154 · physical FKs implemented: 54 / 152
expanded constraint instances:     265 mapped
physical constraints implemented:  165 (37 PK + 54 FK + 23 UQ + 51 CK)
launch indexes implemented:         82 / 211
partial indexes implemented:        12 / 45 (G9 adds none — no stable-state
                                    partial exists in its DB5 set; volatile = 0)
JSONB boundaries implemented:        5 / 9
state/type columns implemented:     19 (+status, from_status, to_status,
                                    role, kind — LC-11 tuple shared 3 ways)
required documents complete:         7 / 15
```

## E. A01–A15 (G9 effect)

- **A03**: no new partial index (IDX-073/100 are full-key by DB5 design);
  12/45 stands, volatile 0.
- **A08**: no money field in G9 (DB4 defines none — no estimate column
  exists in the dictionary); unchanged, partially closed; owners G14/G15/G16.
- **A09**: +3 sets (LC-11 ×3 columns from one exported tuple; role; kind) →
  **19** columns total, byte-identical.
- **A10**: requests = mutable lifecycle root; COP = request-owned mutable
  child; breakdowns = mutable-until-QUOTED (app boundary); assets assoc =
  mutable; notes/transitions = **append-only** (CST-098 → S24, honestly not
  claimed); design_cases = mutable header.
- **A11**: launch-required only; request root carries exactly 3 indexes
  (PK + IDX-028 + IDX-073).
- **A12**: deferred DB9. **A15**: unchanged.
- **Deferred relationships resolved by G9:** none were owed *to* G9;
  G9 defers three onward (G10/G11/G14) with nullable columns in place.

## F. Validation

| Gate | Result |
|---|---|
| Static (typecheck, lint, format, 52 tests, file-size, checker with 154/152 + 349-column reconciliation) | PASS |
| Leakage scans | order/payment/inventory on G9 = 0; COP sku/stock/price = 0; no JSONB; no 3D; no plaintext secret |
| Fresh: empty → 14 migrations | PASS `up-to-date`; pointer FK present |
| Upgrade from G8 prefix (+G1–G8 chain: customer, catalog, asset, verified challenge) | 12 → 2 pending → 14; all pre-existing rows survived |
| No-op reapply | PASS |
| Drift/checksum | clean; journal append-only |
| Physical parity | 37 tables; 37 PK + 54 FK + 23 UQ + 51 CK; 82 indexes; 0 duplicates; 0 non-conforming names |
| Behavioral smoke | **17/17** — duplicate code, ORDERED alias rejected, orphan customer, COP flow + duplicate COP + zero dims, INV-13 scan 0, breakdown lines (store + COP) + duplicate + zero qty, asset assoc + duplicate role + bogus role, design case + CST-020 duplicate, pointer valid/dangling/delete-restrict, transitions valid/bogus-state/orphan, moderation valid/bogus-kind, delete-restrict (customer, request), rollback residue 0 |
| Honest gap demonstrated | moderation note with a **nonexistent admin_id inserted successfully** — the documented no-FK evidence-class gap on TBL-041 (app-owned integrity, DB7 target), not a defect |
| Security/privacy | no unscoped PII index; code never an authz input; errors redacted in harness |

## G. Commits

`feat(database): implement DB6 schema group G09` — one commit, tree clean,
not pushed, no old commit amended.

## H. Verdict

```text
DB6-G9       PASS
OVERALL DB6  IN PROGRESS
```

Task board: `DB6-G01..G19` = **9/19** (open) · `DB6-S24..S28` open.
