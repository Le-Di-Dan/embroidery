# DB6-G07 — Design Pre-Request Group Report (incl. DB6-C2)

**Date:** 2026-07-18 · **Verdicts:** `DB6-C2 PASS` · `DB6-G7 PASS` ·
`OVERALL DB6 IN PROGRESS`

## A. DB6-C2 metric reconciliation (executed first, own commit)

- **Root cause:** chat running totals hand-accumulated with the wrong
  implicit formula (`ids + convention = physical`), ignoring ×N COL
  expansions, plus arithmetic slips (G1: 16→17; G2: 24→34). Manifest
  per-group notes were correct throughout.
- **Canonical model:** `ids + expansions = business`; `business + convention
  = physical`. G1–G6: 155 + 7 = 162 + 64 = **226**, matching `pg_attribute`
  exactly.
- **Enforcement:** live-verified register (`column-metrics.ts` +
  27-test spec: bijection, exact counts, formulas, tamper fixture) +
  checker cross-check of manifest §4.1. Deliberate tamper → 3 failures.
- **Impact:** physical/migration/behavior — none. Commit `cdaa1f4`.

## B. Preflight G7

`production` @ `cdaa1f4` (post-C2) · tree clean · all commits through C2 ·
`0000`–`0008` byte-identical · journal 9 entries · checker PASS (incl. new
column metrics) · drift clean 9/9 · G1–G6 parity intact (23 tables /
52 indexes) · deferred REL-033 edge absent pre-G7 (probe = 0) · no partial
G7 (`schema/design/` absent) · not pushed.

## C. G7 scope (derived; matched expected 5-table family)

| Item | Value |
|---|---|
| Group / context | G7 — Design pre-request (CTX-DSN, AGG-09/12) |
| TBL / tables | TBL-034 `design_templates`, TBL-035 `design_template_versions`, TBL-036 `design_template_assets`, TBL-025 `design_sessions`, TBL-026 `design_session_assets` |
| Logical COL IDs | **27** (TBL034: 8, TBL035: 5, TBL036: 2, TBL025: 10, TBL026: 2) |
| ×N expansions | **6** (TBL034-04 ×3 scope; TBL025-02 ×4 geometry; TBL025-06 ×2 provenance) |
| Convention columns | **14** (5 id, 5 created_at, 4 updated_at — none on the `ver` table) |
| Total physical | **47** (13/7/5/17/5) |
| REL rows → edges in G7 | REL-056 (1), REL-057 (3, implied — DEV-DB6-009), REL-058 (×3), REL-040 (4, implied), REL-041 (1), REL-042 (×2) = **14 schema FKs** + REL-033 deferred edge = **15 physical FKs** |
| Deferred FK resolved | **REL-033 → design_sessions** (`fk_assets__uploaded_via_session_id`, custom migration `0010`, ON DELETE SET NULL) |
| Remaining deferred edges | REL-028 ×3 (G10/G15) unchanged |
| No-FK evidence columns | `submitted_request_id` (no REL row), `template_version` (integer stamp, REL-041 "no live link") |
| CST | CST-001 ×5, CST-011 (3/4), CST-019, CST-025, CST-043 ×2, CST-060 ×2, autosave floor CK |
| IDX | Constraint-created: 5 PK + IDX-013/021/027/048/049 · Explicit: **IDX-085** (P0 partial, the session table's only non-unique index) · Deferred/rejected: none (IDX-R12 stands) |
| JSONB | payloads **#1** and **#3** — 5/9 boundaries live; **no hash columns** (not defined by DB4 for either; hashing starts at G11) |
| State columns | template publication set; session LC-07 (ACTIVE/SUBMITTED/EXPIRED/DELETED) |
| Expiry/cleanup | `expires_at`, `last_activity_at` + IDX-085 (stable `'ACTIVE'` predicate, `now()` in query only); TTL value config-owned, not hard-coded |
| Optimistic concurrency | `autosave_revision` (COL-TBL025-05): predicate `id = $1 AND autosave_revision = $2`, app increments atomically, stale write conflicts; DB8 owns the race; no per-autosave row lock |
| Dependencies | G4 (assets, derivatives), G5 (catalog geometry) |
| DB9 seed | catalog chain → templates → versions before sessions |
| DB10 | session TTL hard-delete sweep (IDX-085), cascade-temp family cleanup, template-version retention |

## D. Implementation notes

- **DEV-DB6-009 (found during scope derivation, resolved before coding):**
  eight REL rows carry implied multiplicity without ×N markers — corrected
  edge model **153 logical / 151 physical** (was 129/128); checker now uses
  markers + curated map and rejects double-marking. Register entry has the
  full per-row evidence.
- Clone-on-use physical shape: provenance stamp columns, no live link, no
  version-row FK — template header/version updates cannot touch sessions.
- The one sanctioned `ON DELETE CASCADE` in the schema: session→assoc
  (cascade-temp family). The deferred REL-033 edge uses `SET NULL` because
  its parent is hard-TTL-deleted; the G4 customers edge stays `restrict` —
  the two REL-033 edges legitimately differ under the `set-null-cand`
  legend.
- Migrations: `0009` (generated, 5 tables, 19 statements, reviewed) +
  `0010` (custom SQL, 1 ALTER — cycle-avoidance same as REL-102/0004).
  `0006` untouched. No deviation beyond DEV-DB6-009.

## E. Metrics after G7

```text
groups complete:                     7 / 19
tables implemented:                 28 / 78
documented logical COL IDs:        182   (+27)
×N expansions / business columns:   13 / 195
convention columns:                 78
total physical columns:            273   (live pg_attribute anchor: 273)
physical FKs implemented:           37 / 151   (22 + 14 schema + 1 deferred-resolved)
expanded constraint instances:     265 mapped (model unchanged)
physical constraints implemented:  123 (28 PK + 37 FK + 18 UQ + 40 CK)
launch indexes implemented:         63 / 211
partial indexes implemented:        10 / 45 (IDX-085 added; volatile = 0)
JSONB boundaries implemented:        5 / 9
state/type columns implemented:     13
required documents complete:         7 / 15
```

## F. A01–A15 (G7 effect)

- **A03**: +1 partial (IDX-085, predicate `status='ACTIVE'` byte-identical
  LC-07) → **10/45**, volatile 0; remaining owners: G8–G19 groups + S25.
- **A08**: no money in G7 (none in DB4) — unchanged, partially closed.
- **A09**: +2 state columns → 13 total; template set = DB3 publication set,
  session set = LC-07; both byte-identical; separate constants per table.
- **A10**: templates = mutable header; template_versions =
  **immutable-once-published** (S24 trigger, `WHEN published_at IS NOT
  NULL`); template_assets/session_assets = mutable assoc; sessions = temp
  (mutable, hard-TTL). No blanket trigger; no early claim.
- **A11**: only launch-required; session write amplification reviewed —
  IDX-085 is the table's single non-unique index.
- **A12**: deferred DB9. **A15**: unchanged.
- **REL-033 deferred edge: implemented** (manifest status updated).

## G. Validation

| Gate | Result |
|---|---|
| Static (typecheck, lint, format, 45 tests incl. metric spec, file-size, checker 9 groups) | PASS |
| Fresh: empty → 11 migrations | PASS `up-to-date`; deferred FK exists, `confdeltype = n` (SET NULL); cascade edge `c` |
| Upgrade from G6 prefix + pre-existing asset/derivative rows | 9 → 2 pending → 11; rows survived; FK added over existing data |
| No-op reapply | PASS |
| Drift/checksum | clean; `0000`–`0008` unchanged; journal append-only |
| Physical parity | 28 tables; 28 PK + 37 FK + 18 UQ + 40 CK; 63 indexes; 0 duplicates; 0 non-conforming names; JSONB = closed set only; no 3D/binary/URL/token column |
| Behavioral smoke | **18/18**: template root+version+asset paths; duplicate version/slug/secret/assoc; bogus states; orphan FKs (root, scope, area, session); clone-on-use — root update leaves published version byte-intact; guest session with no customer linkage; negative autosave floor; **optimistic autosave: correct revision UPDATE 1, stale UPDATE 0**; deferred REL-033 provenance set + dangling rejected; **TTL delete: cascade-temp assoc → 0, SET NULL provenance → 0**; rollback residue 0 |
| Security | secret column is `session_secret_hash` only; no plaintext token; PII-free errors in harness; no raw-session-id authorization path added |

## H. Commits

```text
cdaa1f4  chore(database): reconcile DB6 physical column metrics   (C2)
<g7>     feat(database): implement DB6 schema group G07
```
Working tree clean · not pushed · no old commit amended.

## I. Verdict

```text
DB6-C2       PASS
DB6-G7       PASS
OVERALL DB6  IN PROGRESS
```

Task board: `DB6-G01..G19` = **7/19** (open) · `DB6-S24..S28` open.
