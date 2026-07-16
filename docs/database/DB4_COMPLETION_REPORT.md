# DB4 — Completion Report

**Checkpoint:** DB4 — Logical Relational Schema
**Date:** 2026-07-15 · **Audited Git HEAD (start):** `a79f5235fd35f76076148cfc53a3eb18f538730b` · **Branch:** `production`
**Nature:** Logical schema documentation + 4 ADRs only. No Drizzle schema,
no SQL/DDL, no migration, no index, no trigger body, no backend/test code,
no Docker/package change. DB5/DB6 not started.

## A. Preflight

Branch `production`; initial HEAD `a79f523` (DB3 commit); working tree
clean; baseline commits `a0e29b4`/`f90f78c`/`0563866`/`a79f523` verified;
DB3 completion report + all 19 DB3 deliverables + 25 prior ADRs present;
artifact scan clean (no `.sql`/drizzle/ORM install). No DB0–DB3 history
modified — registers appended only.

## B. Inputs validated

All DB0–DB3 deliverables and ADR-DB1-001..018 / ADR-DB2-001..003 /
ADR-DB3-001..004 read in full this session; product sources (00/01/04/05/
06/07/09/10/11/12/13, SYSTEM_ARCHITECTURE, BACKEND_CONVENTIONS) consulted
via the DB0–DB3 requirement/lifecycle traces. Inherited counts confirmed:
29 lifecycles · ~90 TR · 30 guards · 20 side effects · 35/35 invariants ·
28 CC · D7-01..15 · D8-01..25 · DEC-16/22/23/26 and GAP-01/03/04/09/12
resolved at DB3 · GAP-10 owned by DB4.

## C. Logical schema summary

- **Tables:** 78 (TBL-001..078) — 3 IDN · 8 CUS · 7 CAT · 4 INV · 3 AST ·
  12 DSN · 13 ORD · 4 QUO · 5 PAY · 5 PRD · 2 GAL · 4 CNT · 2 NTF · 1 AUD
  · 5 PLT.
- **Columns:** ~430 domain columns + standard `id/created_at/updated_at`
  set (COL-* per table, full dictionary).
- **Relationships:** REL-001..105 (all FK directions, cardinality,
  on-delete: restrict everywhere except two transient cascade-temp
  families; no physical cascade into history).
- **Constraints:** CST-001..125 (+ blanket PK/NN) — 50 uniques/partial
  uniques, 15 check families, 11 immutability/append-only trigger
  candidates, 1 exclusion candidate, 16 explicitly TX/App-only rules.

## D. DB4 decisions

- **Money (ADR-DB4-001):** `numeric(14,2)` + explicit `currency_code`
  ('VND' CK); percent `numeric(5,2)` 0–100; app-VO rounding at one
  derivation point; deposit+remaining=total CHECK; no float anywhere.
- **Transition history (ADR-DB4-002):** hybrid — Tier A dedicated tables
  (request/order/production), Tier B structural history, Tier C state+audit;
  audit never the only history; no global weak transition table.
- **Asset association (ADR-DB4-003):** context-owned association tables +
  direct FK columns; no generic `asset_links`.
- **JSONB (ADR-DB4-004):** closed 9-column set with schema versions,
  owners, redaction; all invariant fields relational.
- **GAP-10:** stitch count = admin-entered quotation pricing input
  (`quotation_versions.stitch_count`), never derived; register updated.

## E. Context schema summary

| Context doc | Tables | Root/version/snapshot/append structures | Critical constraints |
|---|---|---|---|
| Identity/Customer | 11 | grants hashed-token; merge case + events | CST-003/005/007/008/009 |
| Catalog/Inventory/Asset | 14 | ledger append; stock lock anchor; asset tombstone | CST-014/016/061/071 |
| Design/Ordering | 25 | versions + approval snapshot (+children); Tier A transitions; COP without SKU refs | CST-022/023/030/067/090/091 |
| Quotation/Payment | 9 | immutable versions + acceptance; obligations ×2; provider events append | CST-038/039/040/048/064/092 |
| Production/Shipping | 8 | immutable spec; shipping detail→snapshot freeze; fee acknowledgements | CST-034/041/042/094/095 |
| Content/Gallery/Agreement | 6 | agreement immutable versions + hash | CST-044/045/046/096 |
| Notification/Audit/Platform | 8 | intents + append attempts; outbox column-scoped; idempotency; versioned config | CST-047/048/098/099 |

## F. State/history mapping

29/29 lifecycles → authoritative `text + CHECK` columns with exact DB3
value sets (incl. QUOTE_ACCEPTED, ON_HOLD, CANCELLING); history tiers per
ADR-DB4-002; derived states (availability, fully-paid, effective
agreement, dashboards) computed only; no `global_status`; transition
legality deliberately not in CHECK (GRD-019 → D7-02).

## G. Invariant support

35/35 mapped ([`DB4_INVARIANT_SCHEMA_TRACEABILITY.md`](./DB4_INVARIANT_SCHEMA_TRACEABILITY.md)):
DB-primary invariants have named constraints (INV-01/02/04/07/11/12/16/17/
18/19/24/25 → CST-090s/039/040/048/063/022/061/030…); TX/APP invariants
have named fact tables and are explicitly not fabricated as schema
(CST-110..125); PROC invariants remain DB1-owned.

## H. Snapshot/versioning

Header+versions: design case/quotation/agreement/template/policy config.
Immutable snapshots: approval (+thread colors, terms acceptances), order
items + order total copy, shipping snapshot, production specification,
contact snapshot columns. No overwrite path exists; corrections =
supersede/void/compensating records.

## I. Money/measurement/JSONB

numeric(14,2)+currency; integer quantities/counts (>0 / ≥0 CKs); mm/px
dimension columns with positive CKs; stitch count per GAP-10; JSONB
allowed only in the 9 mapped columns, forbidden for all core business
data.

## J. Relationships/ownership

105 relationships; every cross-context edge is an ID reference or
snapshot; ownership verified against the DB2 matrix (no leak: payment/
inventory/asset/customer/agreement each single-owner); polymorphic
references only for audit target + outbox aggregate ref (justified);
delete behavior mapped per table; **orphan tables: 0 · dual-owner: 0**.

## K. Handoffs

- **DB5:** Q-01..33 + QX-01..11 access paths with tables/joins/filters/
  uniqueness/consistency/partial-predicate directions.
- **DB6:** dependency groups G1–G19, constraint order, raw-SQL trigger/
  partial-unique/exclusion list, lock + skip-locked spikes, JSONB
  validation strategy, collation verification, migration split,
  fresh-install/upgrade notes.
- **DB7/DB8:** D7-01..15 and D8-01..25 mapped to concrete CST/TBL targets
  plus DB4-born schema-scan tests.

## L. Completeness

75/75 concepts · 23/23 aggregates · 29/29 lifecycles (~90 TR) · 35/35
invariants · 30/30 guards · 33+11 queries · 28/28 races · all SE/snapshot
categories · GAP-10 closed. **Unresolved rows: 0.** Deferred = physical
DDL mechanisms (DB6), index design (DB5), config values (business/CON-144),
provider mappings (O-005/O-006) — every item has an owner and acceptance
condition.

## M. Scope compliance

No Drizzle schema · no SQL/DDL · no migration · no actual index/trigger ·
no backend/test code · no package.json/lockfile/Docker change · DB5/DB6
not started. Verified by git status (docs-only) + leakage grep.

## N. Validation

1. **IDs:** TBL 78 defined/unique, no dangling; CST 92 rows + 2 blankets,
   unique, no dangling; REL unique, no dangling; COL unique per prefix,
   78 tables covered.
2. **Links:** all relative links in DB4 docs/ADRs and updated registers
   resolve (completion report added last).
3. **Mermaid:** 7 `erDiagram` blocks, logical names only, no SQL/index
   syntax.
4. **Physical leakage grep:** clean (no CREATE/ALTER/DROP/pgTable/DDL).
5. **Registers:** DB0_CONFLICTS_AND_GAPS (GAP-10 block appended),
   DB_ROADMAP + README status appended, Decision Log **D-041** appended;
   DB1–DB3 ADRs untouched.
6. **Git:** diff is documentation-only (4 modified registers + 27 new
   files).

## O. Commit

Recorded in git history: single docs-only commit
`docs(database): complete DB4 logical relational schema` on `production`
(hash in `git log`); working tree clean after commit; not pushed.

## P. Verdict

**DB4 PASS WITH DEFERRED PHYSICAL MECHANISMS.**

The logical relational design is complete: DB5 can design access paths
without guessing tables/columns; DB6 can implement Drizzle schema and
migrations without inventing structures; DB7/DB8 have concrete constraint
and race targets. Deferred items are exclusively physical implementation
(DB6), index design (DB5), and configuration values (business) — each with
owner and acceptance condition. DB4 does not start DB5/DB6.
