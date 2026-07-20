# DB6-S27 Group Report — Release Readiness, Reproducibility & Operational Handoff

## A. Preflight

- Canonical S27 scope: no `ROADMAP.md` exists in this repository (confirmed absent, same
  finding as S26); no DB6 document defines an S27 scope different from the prompt's
  expected direction. Applied as-is per the prompt's own contingency clause.
- Branch `production`. Commit chain verified: `2d184e1` (S26), `08effd0` (S25), `c0aa466`/
  `3ffade2`/`8774d29` (S24). Tree clean before this slice.
- Migrations `0000`–`0031` byte-identical; journal at 31 entries. `drizzle-kit check` clean.
  All S26 live-catalog checkers passed on the pre-S27 baseline. Fingerprint generator
  reproduced `4ca56a59...` on the pre-S27 baseline (within the original, already-checked-out
  working directory).
- Zero pending launch indexes, zero pending FKs, zero pending JSONB boundaries, 30/30 S24
  triggers, no S28 artifact found, persistent dev DB read-only (migration id 29 throughout).

**This slice found and fixed two real defects and one real documentation gap while
executing the rehearsal steps required by §B–§C — not hypothetical fixtures, actual bugs
surfaced by actually running the rehearsal:**

1. A fresh clean-clone checkout produced a **different** deterministic schema fingerprint
   than the canonical `4ca56a59...` baseline, despite identical migrations and identical
   live-catalog metrics. Root-caused to `core.autocrlf`-driven CRLF conversion of migration
   `0030`'s PL/pgSQL function body on checkout. **Fixed** by adding `.gitattributes`
   (commit `69b66d8`) — re-verified identical fingerprint after the fix.
2. A failure-rehearsal fixture (unreachable database) crashed with an unhandled-rejection
   stack trace and, worse, **leaked the plaintext database password** in
   `db-fingerprint-gate.mjs`'s own error message. **Fixed** — `live-db.mjs`'s `connect()`
   now catches and redacts; the gate script uses the same redaction for its own text.
3. `drizzle-orm`'s migrator does not re-verify an already-applied migration file's bytes on
   a later run — a post-hoc edit to `0001` in a scratch copy produced a clean `exit 0`.
   **Closed** by a new `tools/db-migration-checksum-check.mjs` (frozen SHA-256 manifest,
   verified to correctly fail on the same tamper test after the fix).

Per §4 of the execution prompt ("Allowed in S27: fix stale command examples... add
deterministic validation wrappers... improve CI/script error reporting"), all three were
fixed inline, no schema or migration object was touched, and no correction checkpoint was
opened.

## B. Clean-clone reproducibility

Two independent rehearsals via `git worktree add <path> HEAD --detach` (equivalent
guarantee to a full clone — only tracked files are checked out, nothing from the main
working directory's untracked state is visible):

| Rehearsal | Worktree commit | Result |
|---|---|---|
| #1 (pre-fix) | `2d184e1` | metrics identical; fingerprint **`5ada8061...` — MISMATCH** found and root-caused (finding #1 above) |
| #2 (post-fix) | `69b66d8` | metrics identical; fingerprint **`4ca56a59...` — MATCH** |
| #3 (second independent run, same post-fix checkout, third disposable DB) | `69b66d8` | metrics identical; fingerprint **`4ca56a59...` — MATCH** |

`pnpm install --filter @embroidery/database...` from each worktree completed in ~2–3
seconds (warm pnpm store; observational timing only, not a performance claim). Each
rehearsal created its own disposable database inside the existing dev Postgres container,
applied all 31 migrations, ran all 6 live checkers plus the fingerprint gate, and dropped
the database afterward. **Assertion confirmed: S27 validation does not depend on any
undocumented local file** — full detail and exact commands in
`DB6_REPRODUCIBILITY_RUNBOOK.md`.

## C. Migration operations runbook

Full content in `DB6_MIGRATION_OPERATIONS_RUNBOOK.md`. Highlights independently verified
against the actual `drizzle-orm` source and a real failure injection (not assumed):

- **Transactional guarantee (corrected from an initial wrong assumption):** all pending
  migrations in one `pnpm db:migrate` invocation share a **single** transaction — verified
  by injecting a broken statement into a 3-file scratch batch and confirming **zero**
  tables/journal rows remained afterward, including the two files that "succeeded" before
  the broken one ran. This is a stronger guarantee than "each file is its own transaction,"
  which was the first (wrong) draft of this runbook section before the experiment.
- Rollback language kept honest: forward-only migrations, no automatic down-migration, no
  backup/restore implementation (explicitly deferred to DB10, not fabricated here).
- Release ordering: no DB4/DB5/roadmap document currently assigns an explicit
  migration→app deployment order; DB6's evidence-backed position (migrations are additive,
  no application code exists yet to conflict with) is stated as such, not embellished.
- Lock notes: `0031`'s 27 ordinary `CREATE INDEX` statements and `0030`'s 30 triggers
  documented with their real lock classes (`SHARE` / brief `ACCESS EXCLUSIVE`); no claimed
  production duration.

## D. Release-candidate package

Full content in `DB6_RELEASE_CANDIDATE_MANIFEST.md`: release candidate ID
`db6-rc-69b66d8-m0031-4ca56a59`, full metric block, validation command list, checker paths,
explicit deferred-work list (S28, DB7–DB10, application code, production deployment — none
implied complete), operational handoffs. Every referenced path exists and is committed; no
credential, no local absolute path, no generated dump.

## E. CI/automation contract

Deterministic ordered command list (documented in `DB6_RELEASE_CANDIDATE_MANIFEST.md`
§"Validation commands"): static checks → `drizzle-kit check` → fresh migration → live
catalog checkers → fingerprint gate → migration checksum check → cleanup. Every command:
non-zero exit on mismatch (verified per-checker in §F), no interactive prompts, targets a
uniquely-named disposable database (never a shared/persistent one), redacts every
connection string in its own output (fixed this slice, see §A finding #2), and each stage
logs its own `[stage-name]` prefix so a CI log immediately isolates the failing step.
Portability assumptions: Linux CI runner with Docker + a Postgres 16.14 service (or
equivalent container), Node ≥22, pnpm 11.5.2 via Corepack — no Windows-specific step is
required for the CI path itself (the CRLF finding in §A is a *local developer checkout*
risk on Windows, which `.gitattributes` now neutralizes for every environment, Linux CI
included, since the fix is checkout-normalization, not OS-conditional logic).

## F. Validation

- Static: `tsc --noEmit`, `eslint .` (including all new S27 files — two globals had to be
  added to `packages/database/eslint.config.mjs`'s `tools/**/*.mjs` override:
  `URL` in addition to the S26-added `process`/`console`), `check-file-size.mjs` (largest
  new file: 87 lines), `db-manifest-check.mjs` + companions — all clean.
- End-to-end rehearsals: §B (2 clean-clone rehearsals + 1 additional disposable-DB run, all
  post-fix identical).
- Failure rehearsals (all against isolated fixtures/scratch copies, never the tracked
  migration files):
  - Wrong expected fingerprint → `db-fingerprint-gate.mjs` exit 1, clear expected/actual
    diff, no auto-update. PASS.
  - Missing migration file → `drizzle-orm`'s own migrator exit 1, names the exact missing
    file, no secret. PASS.
  - Altered historical migration checksum → **exit 0 undetected by the migrator itself**
    (a real gap, documented, then closed by the new checksum checker, which correctly
    caught the same tamper and returned to exit 0 after restoring the file). PASS after fix.
  - Unavailable database connection → **initially leaked a plaintext password** (a real
    finding, fixed in `live-db.mjs`); re-run after the fix: exit 2, redacted URL, no stack
    trace. PASS after fix.
- Reproducibility result: §B's rehearsal #2 and #3 (both post-fix) produced identical
  metrics, identical fingerprint, identical checker PASS results — only the disposable DB
  name and timestamps differed, exactly as required.
- Persistent dev DB: confirmed at migration id 29 before this slice, before every
  rehearsal, and after this slice — never mutated.

## G. Metrics

```
tables:                          78 / 78
columns:                        833
logical relationships:          164
physical FKs:                   160 / 160
PK:                               78
UQ:                               50
CHECK:                          189
physical indexes:               211 / 211
partial indexes:                 46
JSONB:                             9 / 9
trigger functions:                 1
triggers:                        30
migrations:                      31
latest:                        0031
fingerprint:            4ca56a5967730d257edb34e72d6c40373156704cab7c87e3a684803c8321672f

clean-checkout rehearsals:        2 (worktree #1 pre-fix, #2 post-fix)
release rehearsals:                2 (worktree #2 + a third disposable DB from the same checkout)
failure fixtures exercised:        4 (wrong fingerprint, missing file, altered checksum, unavailable connection)
real defects found and fixed:      2 (CRLF fingerprint drift, password leak)
real coverage gap found and closed: 1 (migration checksum blind spot)
CI command stages:                 7 (static → drift → fresh migrate → live checkers → fingerprint gate → checksum check → cleanup)
artifact count (this slice):      10 (4 docs + 6 tool/data files: db-fingerprint-gate.mjs, db-migration-checksum-check.mjs, canonical-fingerprint.txt, migration-checksums.json, live-db.mjs edit, eslint.config.mjs edit, .gitattributes)
unresolved release gates:          0
```

No physical schema metric changed from the S26 baseline — every number above is identical
to `DB6_FINAL_PHYSICAL_INVENTORY.md`'s S26 figures.

## H. Task board

```
DB6-G01..G19 = COMPLETE
DB6-S24      = COMPLETE
DB6-S25      = COMPLETE
DB6-S26      = COMPLETE
DB6-S27      = COMPLETE
DB6-S28      = OPEN
OVERALL DB6  = IN PROGRESS
```

## I. Commits

Three commits this slice (one more than the suggested maximum two, because the
`.gitattributes` fix was a genuine mid-rehearsal blocker-turned-fix that had to land before
the rehearsal could be re-run to completion — recorded as its own commit rather than folded
in, consistent with this engagement's standing "smallest coherent change per commit" rule):

1. `69b66d8` — `chore: enforce LF line endings on checkout` (`.gitattributes` — the CRLF
   fingerprint-drift fix, found mid-rehearsal, landed before the rehearsal could pass).
2. `33015e4` — `docs(database): add DB6 release readiness handoff` — the 4 required S27
   reports.
3. `0deaf79` — `chore(database): add DB6 reproducibility verification workflow` — the
   fingerprint gate, migration checksum checker, the password-leak fix in `live-db.mjs`,
   the checksum/fingerprint data files, and the `eslint.config.mjs` globals addition.

All on `production`, tree clean before each commit, no amend/squash, not pushed.

## J. Verdict

```text
DB6-S27      PASS
OVERALL DB6  IN PROGRESS
```

Per standing instruction: stop after S27. Do not start S28 without a new explicit prompt.
Do not mark DB6 complete — S28 remains open.
