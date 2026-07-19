# DB6-G08 — Contact Verification Group Report

**Date:** 2026-07-18 · **Verdict:** `DB6-G8 PASS` · `OVERALL DB6 IN PROGRESS`

## A. Preflight

`production` @ `2858dad` · tree clean · all commits through G7/C2 ·
`0000`–`0010` byte-identical · journal 11 entries · checker PASS with
canonical metrics confirmed: **273 physical columns**, **153 logical edges /
151 physical FK target**, DEV-DB6-009 curated map present in manifest §2.2 +
deviation register (not checker-only) · REL-033 status implemented with
SET-NULL source trace in manifest G7 note and migration `0010` header ·
drift clean 11/11 · G1–G7 parity intact (28 tables / 63 indexes) · no
partial G8 (`contact-verification-*` files absent) · not pushed.

## B. G8 scope (derived; matched expected 2 tables)

| Item | Value |
|---|---|
| Group / context | G8 — Contact verification (CTX-CUS, AGG-03) |
| TBL / tables | TBL-006 `contact_verification_challenges` · TBL-007 `contact_verification_attempts` |
| Column metrics | **12 logical IDs + 0 expansions = 12 business + 5 convention = 17 physical** (12/5; append table has no `updated_at`) |
| REL rows → edges | REL-006, REL-007, REL-008 (all ×1) → **3 edges, 3 physical FKs, none deferred** |
| CST | CST-001 ×2, **CST-007** (IDX-006 arbiter), CST-060 (LC-02), purpose CK, contact-kind CK, attempt outcome CK; **CST-098 → S24** (attempts) |
| TX/App-only | expire-then-reissue transition, rate-limit evaluation (GRD-026), constant-time code verification, customer creation from evidence |
| IDX | Constraint-created: 2 PK · Explicit pUQ: **IDX-006** · Explicit perf: **IDX-112** (expiry sweep), **IDX-111** (rate window — append table's only non-PK index) · Recommended → S25: IDX-130 · Rejected/retired touched: none |
| Security fields | `code_hash` (opaque one-way, no algorithm/salt/version columns — DB4 defines none; no format CK — CST-070 excludes it; no index/lookup path), `normalized_value` (PII target), `expires_at`, `verified_at` |
| Dependencies | G3 (contact points), G7 (design_sessions) |
| DB9 seed | none required pre-verification; challenges are transient |
| DB10 | hard-TTL family deletion (challenge delete cascades attempts); retention: `hard-ttl`/`sec/trans` |

## C. Implementation

**Lifecycle-faithful nullability:** `contact_point_id` nullable —
verification precedes customer creation (ADR-DB2-001); a submission
challenge carries only the raw normalized target. No customer FK, no
account/password/token field, no notification body/provider payload, no
JSONB, no IP/device metadata — all verified absent.

**Delete behaviors, all three distinct and verified in catalog + smoke:**
attempts → challenges **cascade** (`c`, cascade-temp family); challenges →
contact points **restrict** (`r`, anonymize-class parent); challenges →
sessions **SET NULL** (`n`, hard-TTL parent).

**CST-007 arbiter semantics:** one ISSUED per (kind, value, purpose);
same target + different purpose allowed; expiry does not self-remove rows —
the reissue tx marks EXPIRED then inserts (smoke case 9 exercises exactly
this shape).

Migration `0011_create_contact_verification_tables.sql` — generated,
human-reviewed, G8 only: 2 tables, 2 PK, 4 CK, 3 FK, 3 explicit indexes.
No custom SQL. No new deviations.

**Idempotency/issue handoff (not implemented):** resolve scope → expire
stale ISSUED row → insert new challenge (23505 = concurrent-issuer loss) →
notification intent/outbox atomically (owner G18/G2 wiring) → commit.
Global idempotency stays on CST-048 records — nothing duplicated here.

## D. Metrics after G8

```text
groups complete:                     8 / 19
tables implemented:                 30 / 78
logical COL IDs:                   194 · expansions: 13 · business: 207
convention columns:                 83
physical columns:                  290 (register/checker/live agree)
logical relationship edges:        153 · physical FKs implemented: 40 / 151
expanded constraint instances:     265 mapped
physical constraints implemented:  132 (30 PK + 40 FK + 18 UQ + 44 CK)
launch indexes implemented:         68 / 211
partial indexes implemented:        12 / 45 (IDX-006, IDX-112 added; volatile = 0)
JSONB boundaries implemented:        5 / 9
state/type columns implemented:     16 (+status, +purpose, +outcome)
required documents complete:         7 / 15
```

## E. A01–A15 (G8 effect)

- **A03**: +2 partial (IDX-006 pUQ, IDX-112) → **12/45**; both predicates
  `status = 'ISSUED'` byte-identical LC-02; volatile 0.
- **A08**: no money (DB4 defines none) — unchanged, partially closed.
- **A09**: +3 (challenge status LC-02; purpose; attempt outcome — three
  separate constants, never merged) → **16** total, byte-identical.
- **A10**: challenges = operational mutable temp root (mutable: status,
  verified_at, updated_at; immutable-at-issue: target, purpose, code_hash,
  expires_at — app rule, no rotation model in DB4); attempts =
  **append-only**, CST-098 → S24, honestly not claimed (smoke case 12 shows
  UPDATE currently succeeds; DB7 target open).
- **A11**: launch-required only; append table kept at 1 non-PK index.
- **A12**: deferred DB9 — no performance claim.
- **A15**: unchanged; no PII/abuse-search index added (explicitly none on
  `normalized_value` beyond the DB5-approved arbiter).

## F. Validation

| Gate | Result |
|---|---|
| Static (typecheck, lint, format, 50 tests, file-size, checker incl. column/REL reconciliation) | PASS |
| Plaintext/secret scans | code/otp column scan = 0; no pepper; no provider payload |
| Fresh: empty → 12 migrations | PASS `up-to-date`; FK delete types verified `c`/`r`/`n` |
| Upgrade from G7 prefix (+G3 contact chain) | 11 → 1 pending → 12; rows survived |
| No-op reapply | PASS |
| Drift/checksum | clean; `0000`–`0010` unchanged; journal append-only |
| Physical parity | 30 tables; 30 PK + 40 FK + 18 UQ + 44 CK; 68 indexes; 0 duplicates; 0 non-conforming names |
| Behavioral smoke | **15/15** — pre-customer challenge; linked STEP_UP; CST-007 duplicate rejected while different-purpose allowed; bogus state/purpose/kind; orphan FKs (contact point, challenge); expire-then-reissue; attempt MISMATCH + orphan + bogus outcome; **single-consume: conditional transition UPDATE 1 then UPDATE 0**; S24 gap documented; **family cascade: challenge delete → attempts 0**; rollback residue 0; plaintext columns = 0 |
| Security/privacy | no hash-lookup path; errors redacted in harness; DETAIL not forwarded by tooling |

## G. Commits

`feat(database): implement DB6 schema group G08` — one commit, tree clean,
not pushed, no old commit amended.

## H. Verdict

```text
DB6-G8       PASS
OVERALL DB6  IN PROGRESS
```

Task board: `DB6-G01..G19` = **8/19** (open) · `DB6-S24..S28` open.
