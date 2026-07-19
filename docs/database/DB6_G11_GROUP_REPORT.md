# DB6-G11 — Formal Design Version Group Report

**Date:** 2026-07-19 · **Verdict:** `DB6-G11 PASS` · `OVERALL DB6 IN PROGRESS`

## A. Preflight

| Check | Result |
|---|---|
| Branch / HEAD | `production` / `1228227` (DB6-G10) |
| Working tree | clean before G11 work began |
| Migrations `0000`–`0014` | untouched (only `0015`/`0016` added) |
| Manifest + deferred-owner + column-metric checkers | PASS pre-G11 |
| Canonical metrics pre-G11 | 41 tables, 387 physical columns, 154/152 REL, 95/211 indexes |
| G11 canonical scope (manifest §3) | exactly 3 tables — matches the execution prompt's expectation, no BLOCKED condition |
| `design_cases.current_version_id` | column existed (G9), no FK yet, owner recorded as **G11** |
| Push | not performed |

## B. G11 scope (exact 3 canonical tables)

| Item | Value |
|---|---|
| TBL / tables | TBL-028 `design_versions` · TBL-029 `design_version_assets` · TBL-030 `design_reviews` |
| Column metrics | **20 logical IDs + 9 expansions = 29 business + 6 convention = 35 physical** (22/4/9) |
| REL → FK | REL-045, REL-046, REL-047, REL-048 ×2, REL-049, REL-050 ×3 = **9 native FKs**; + **DEV-DB6-012** (+4: placement refs) + REL-044 resolution (+1) = **14 physical FKs added** |
| Deferred owner-G14 (unchanged) | `custom_requests.current_quotation_id` (REL-062 e2) |
| No-FK evidence | none new — `design_reviews`'s three actor refs are all REL-050, all FK'd |
| CST | CST-021 (IDX-023), CST-022 (IDX-024, LC-08 pUQ), CST-043 instance (IDX-047), CST-066 instance, CST-070 ×2, CST-074 instance, status/outcome closed sets, void-reason-required conditional |
| IDX | Constraint-created: 3 PK + IDX-023 (UQ) + IDX-047 (UQ) = 5; explicit pUQ: IDX-024 = 1; **6 total**. IDX-116 recommended → S25 |
| Dependencies | G3 (customers), G4 (assets/asset_derivatives), G5 (products/variants/sides/areas), G8 (contact_verification_challenges), G9 (design_cases), G10 (secure_access_grants) |

## C. Implementation

**A genuine second missing-edge family was found and resolved (DEV-DB6-012).** `design_versions.product_id`/`product_variant_id`/`product_side_id`/`embroidery_area_id` (COL-TBL028-10) are mandated by the column dictionary and CON-058..060 but have no REL row, ×N marker, or implied-multiplicity entry anywhere in the REL model — the same class of gap DEV-DB6-010 closed for `custom_request_assets → assets`. Per DEV-DB6-009's standing scope guard ("a genuinely missing edge gets its own deviation"), this was implemented (not blocked) and the denominator moved **154/152 → 158/156**, checker-enforced in `tools/db-metric-check.mjs`.

**Design Versions** — the formal, hash-frozen artifact. Not collapsed into `design_cases`: the case stays a pure header/pointer; every formal fact lives on the version row. `document_hash` is required once `status ≠ DRAFT` (CST-074/GRD-007); both hash columns share the `sha256:<64 hex>` format check with `assets.checksum`. Placement and physical dimensions are NOT NULL from creation, unlike `design_sessions`' pre-selection columns where the variant is explicitly optional — the column dictionary differentiates the two rows deliberately (`no/yes/no/no` vs a single `no`). `parent_version_id` is a nullable self-referencing chain. CST-090 (reject-mutation once sent) is an **S24 trigger target, not yet a database mechanism** — honestly not claimed early.

**Design Version Assets** — frozen version↔asset association. Convention columns follow the manifest's Mut classification literally: `design_versions` ("immutable-once-sent") and `design_version_assets` ("immutable w/ version") both carry **no `updated_at`** per the checker's `NO_UPDATED_AT` rule — a departure from `design_template_assets`'s "mutable" classification, which does carry it. State timestamps (`sent_at`/`approved_at`/`superseded_at`/`voided_at`) substitute for a generic `updated_at` on `design_versions`.

**Design Reviews** — append-only customer decision evidence (CST-098 → S24, honestly not yet enforced, smoke below). `grant_id` is NOT NULL (GRD-002: every review is grant-scoped); `step_up_challenge_id` is nullable (step-up is required only for APPROVE, a TX/App gate — GRD-003 — not a same-row CHECK). First-decision-wins (CC-04) is a version-row lock in the deciding transaction, not a DB uniqueness constraint.

**REL-044 resolution** — `fk_design_cases__current_version_id` added by hand-authored custom SQL (`0016_add_design_case_current_version_fk.sql`), the same header↔child-cycle mechanism as REL-062/0013 and REL-102/0004. `design-cases.ts` is unchanged except its doc comment; the FK is invisible to `drizzle-kit`'s diff engine by design (same as REL-062/REL-033), so `0016`'s snapshot is a schema-identical copy of `0015`'s with a new revision id — matching the exact precedent of `0010`/`0013`.

**Migration** `0015_create_formal_design_tables.sql` — generated, human-reviewed: 3 `CREATE TABLE` (3 PK, 2 UQ, 7 CK), 13 native/placement FKs, 1 explicit partial-unique index. `0016` adds the single deferred FK by custom SQL. No FK cycle inside `0015`; the cycle with `design_cases` is broken by deferring to `0016`, exactly as instructed.

## D. Metrics after G11

```text
groups complete:                    11 / 19
tables implemented:                 44 / 78
logical COL IDs: 274 · expansions: 29 · business: 303 · convention: 119
physical columns:                  422 (live-anchored: pg_attribute agrees)
logical relationship edges:        158 (154 + DEV-DB6-012's +4) · physical FKs implemented: 78 / 156
expanded constraint instances:     265 mapped
physical constraints implemented:  215 (44 PK + 78 FK + 26 UQ + 67 CK)
launch indexes implemented:        101 / 211
partial indexes implemented:        19 / 45 (G11 adds 1 pUQ; volatile = 0)
JSONB boundaries implemented:        6 / 9
state/type columns implemented:     25 (+status, +outcome)
required documents complete:         7 / 15
```

## E. A-status (G11 effect)

- **A03** — +1 partial unique (IDX-024, INV-16 arbiter — not an optimisation); running total **19/45**, volatile 0.
- **A08** — no money field in G11; unchanged, partially closed.
- **A09** — +2 sets (LC-08 design_versions.status, LC-09 design_reviews.outcome) → **25** state/type columns, byte-identical parity confirmed.
- **A10** — `design_versions`: mutable-until-frozen (CST-090 S24 target, honestly not claimed). `design_version_assets`: frozen-with-version, no `updated_at`. `design_reviews`: **append-only**, CST-098 → S24 target, honestly not claimed (smoke case 13).
- **A11** — launch-required only; G11 carries **zero required (P0/P1) performance indexes** — IDX-116 is `r` (recommended) per the DB6 index manifest's own launch-status classification (DB5's "required for FK support" label is superseded by DB6-A11's closing decision), deferred to S25 like IDX-127/135 in G10.
- **A12** — deferred DB9; structural smoke only.
- **A15** — no speculative index added.
- **REL-044 status:** implemented. **Same-case current-version enforcement:** existence FK only (physical); cross-case pointer ownership (`design_versions.design_case_id = design_cases.id` for the pointed-to row) is **TX/App** — no composite mechanism is documented in DB4 for this edge, and none is invented.

## F. Validation

| Gate | Result |
|---|---|
| Static (typecheck, lint, format, 66 jest tests, 25 tools tests, file-size, manifest + deferred-owner + column-metric checkers) | PASS |
| Quotation/Order/Payment/Inventory/3D/generic-asset-link/plaintext-secret leakage scans | 0 matches |
| Fresh: empty → 17 migrations (disposable `embroidery_fresh_g11`) | PASS; 44 tables; drift clean; physical parity exact (44 PK/78 FK/26 UQ/67 CK/101 indexes); dropped after use |
| Upgrade from G10 prefix (disposable `embroidery_upgrade_g11`, seeded full catalog/customer/request/design-case chain with `current_version_id = null`, plus a grant and a watermarked derivative) | pre-existing `design_cases` row survived untouched; new FK rejects a dangling `current_version_id`; happy-path version creation + pointer update succeeds; drift clean; dropped after use |
| No-op reapply | PASS, no duplicate objects |
| Drift/checksum | `drizzle-kit check` → "Everything's fine" both before and after `0015`/`0016` |
| Physical parity | 44 tables; 44 PK + 78 FK + 26 UQ + 67 CK = 215 constraints; 101 indexes |
| Behavioral smoke | **13/13** — dup version number rejected; dangling parent rejected; send-without-hash rejected; send-with-hash accepted; bad preview-hash format rejected; second concurrent SENT_FOR_REVIEW rejected (INV-16 live); non-positive dims rejected; valid review accepted; bad outcome rejected; dangling grant rejected; valid version-asset accepted; duplicate version-asset rejected; **append-only gap honestly reproduced** (an UPDATE on `design_reviews` still succeeds — CST-098 is S24, not yet a trigger) |
| Security/privacy | no plaintext secret column; `document_hash`/`preview_hash` are hash-only; no PII beyond existing customer facts |

## G. Commits

```text
1228227  feat(database): implement DB6 schema group G10   (prior baseline)
```

G11 implementation commit follows this report — one commit, tree clean, not pushed, no prior commit amended.

## H. Verdict

```text
DB6-G11      PASS
OVERALL DB6  IN PROGRESS
```

Task board: `DB6-G01..G19` = **11/19** (open) · `DB6-S24..S28` open.
