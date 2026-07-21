# DB10 — Execution Log

Append-only. Each checkpoint records its starting HEAD, scope, environment,
evidence, defects, fixes and commits. Earlier entries are never rewritten.

## Decision register

| ID | Decision | Rationale |
|---|---|---|
| **DEC-DB10-001** | DB10's canonical scope is the roadmap's **"Database Acceptance Audit"**: fresh setup, upgrade, backup/restore, new-machine recovery, plus the backup/retention/operational-durability scope locked by DEC-DB9-001. The checkpoint names CP0–CP7 are DB10's own; the roadmap names deliverables, not checkpoints. | `DB_ROADMAP.md` §DB10 and `DB0_PORTABILITY_RECOVERY_REQUIREMENTS.md` §6/§8 agree exactly — RB-01..RB-10 runbooks and DP-04..DP-06 restore validation are named DB10 deliverables with no competing reading. Nothing is materially ambiguous, so §49.3 does not fire. |
| **DEC-DB10-002** | The amended commit `623eb78` is accepted as-is. No history is rewritten. A governance addendum is added to `DB6_MIGRATION_GOVERNANCE.md`'s standing rules and to the DB9 record; the no-amend rule is restated as absolute for DB10 onward. | §4 requires reconciliation, not reconstruction. Rewriting now would violate the same rule twice and would invalidate every hash the DB9 report cites. |
| **DEC-DB10-003** | DB9's final tally is corrected by addendum: the scope matrix holds **63 unique rows — 29 PASS, 33 DEFERRED, 1 N/A** — not 64/29/34/1. `PERF-R33` appears in both the scope table and the handoff table and was counted twice. | Verified by extracting and de-duplicating every `PERF-*` row id from `DB9_PERFORMANCE_SCOPE_MATRIX.md`. Report bookkeeping only; no measurement, status or conclusion changes. §3's "report omission only → addendum and continue" applies. |
| **DEC-DB10-004** | Retention is implemented as a **mechanism with a caller-supplied cutoff**, never with a built-in duration, and is restricted by an explicit code-level table allowlist rather than by the S24 trigger's DELETE policy. | Every duration is `[cfg]` and business-owned (O-008/O-012). Separately, the `retention_exempt` trigger policy is *broader* than the retention policy — four retain-class tables carry it — so relying on the trigger as the boundary would let a job delete commercial records. |
| **DEC-DB10-005** | PITR is rehearsed in a **dedicated disposable PostgreSQL container** with its own volume and its own `archive_mode=on`, never by reconfiguring the shared dev instance. | `archive_mode` needs a server restart; the persistent dev instance must not be mutated (§13.9). A separate container is the honest local substitute and is torn down afterwards. |
| **DEC-DB10-006** | Backup/restore tooling runs `pg_dump`/`pg_restore` **inside the pinned `postgres:16.14-alpine` container** via `docker exec`, not from a host installation. | The container's client tools are byte-identical to the server version, which removes the version-skew class of restore failure entirely, and adds no new host dependency. Passwords are passed via the container environment, never on a command line. |

---

## DB10-CP0 — DB9 handoff reconciliation and durability scope lock

**Starting HEAD:** `07a06ef1205fbf9b7b3f07776ce890dce3008118`
(`docs(database): complete DB9 and DB10 handoff`), branch `production`,
tree clean, `[ahead 84]`, **not pushed**.

**Scope:** §15 preflight (14 items), §16 parameter registry, §17 data
classification matrix, §5 deferred-work classification, §6 scope lock.

### Environment

```
Host:        Windows 10.0.26100, i7-12700K (20 threads), 31.7 GB
Node:        v22.14.0
Docker:      embroidery-dev-postgres-1, postgres:16.14-alpine, healthy
Host port:   5434 (POSTGRES_PORT override; 5432 is taken on this machine)
Client tools pg_dump / pg_restore / pg_basebackup / pg_receivewal / psql,
             all 16.14, present inside the container
```

### §15 preflight results

| # | Item | Result |
|---|---|---|
| 1 | Branch / HEAD / tree | `production`, `07a06ef`, clean, ahead 84, unpushed |
| 2 | Actual DB9 closure commit | **`07a06ef`** — HEAD *is* the closure commit. The DB9 report's "one further commit" is real and present; it added 7 documents |
| 3 | DB9 commit count | **8** — `623eb78, 0b3a427, 912718e, ebc019a, c2af37b, d7ab4b6, 3ce5b88, 07a06ef`. The report listed 7 and described the 8th; §3's "report omitted final hash only" outcome applies → addendum, continue |
| 4 | Amend governance | reconciled — see DEC-DB10-002 and §"Amend reconciliation" below |
| 5 | Deferred rows classified | 33 rows (not 34 — DEC-DB10-003), all classified below |
| 6 | Roadmap DB10 scope | unambiguous — DEC-DB10-001 |
| 7 | Static + test baseline | `format:check`, `lint`, `typecheck` clean; `check:file-size` passes (7 files above the soft review threshold, none over a hard limit); `pnpm test` exit **0** |
| 8 | Migration checksums | `[migration-checksum] all 31 migration files match the frozen manifest` |
| 9 | Physical fingerprint | `[fingerprint-gate] match — 4ca56a59…1672f` against the live dev database |
| 10 | DB6/DB7/DB8/DB9 closure docs | all present in `docs/database/` |
| 11 | No partial DB10 work | no `DB10_*` file, no backup tooling, `infrastructure/backup/README.md` is still the reserved stub (GAP-07) |
| 12 | Persistent dev DB read-only | 78 public tables, fingerprint matched, nothing written |
| 13 | Local tooling | confirmed (see environment) |
| 14 | No leaked disposable DBs | `select datname from pg_database where datname like 'embroidery%'` → `embroidery` only |

### Amend reconciliation (§4)

| Check | Result |
|---|---|
| Actual current hash / subject | `623eb78` · `docs(database): lock DB9 performance scope` — the repaired subject, present and readable |
| Linear descendant chain | `git rev-list --parents f7ef9ec..HEAD` shows one parent per commit; `623eb78`'s parent is `f7ef9ec`, DB8's closure commit |
| Any accepted artifact referencing a superseded hash | **none.** The pre-amend hash appears in no committed document. `DB9_COMPLETION_REPORT.md` §N discloses the amend and cites only the surviving hash |
| Governance record | added to `DB6_MIGRATION_GOVERNANCE.md` as a standing deviation with the rule restated |
| Further amend/squash/rewrite | prohibited for DB10 without exception, including for a malformed subject — a follow-up commit is the only allowed repair |

The event was a message-only repair with an identical tree, made before any
dependent work, and was disclosed by DB9 itself. It is reconcilable
additively, so §49.2 does not fire.

### §5 classification of the 33 deferred DB9 rows

Classes: **A** DB10 operational durability · **B** future application
feature · **C** future infrastructure/deployment · **D** future production
performance/SLA validation · **E** no longer applicable, with evidence ·
**F** unresolved blocker.

| Class | Rows | Count | Disposition |
|---|---|---|---|
| **A — DB10 implementation scope** | `PERF-T04` (S24 retention-delete exemption) | 1 | Implemented and tested in DB10-CP4. This is the only DB9 deferral DB10 absorbs. |
| **B — future application feature** | `PERF-R06`, `R08`, `R13`, `R14`, `R16`, `R18`, `R19`, `R22`, `R23`, `R24`, `R25`, `R26`, `R30`, `R31`, `R32`, `R35`, `R36`, `R37`, `R38`, `R39`, `R40`, `R41`, `R42`, `Q04`, `W01`, `W02`, `W03`, `W04`, `W07`, `W08` | 30 | Remain explicit handoffs. Each already names its owner in the DB9 matrix. **DB10 does not claim any of these are solved.** |
| **C — future infrastructure/deployment** | *(none from DB9's list)* — but DP-BAK-05/06/07 and DP-WAL-02 in the parameter registry are new C-class items DB10 raises | 0 (+4 new) | Object storage, backup destination, encryption scheme, WAL archive destination. |
| **D — future production performance/SLA** | `PERF-A01` (index write amplification per row under real traffic), `PERF-P03` (acquire-timeout under a deployed connection budget) | 2 | Neither is durability work. Both need traffic or a deployment topology that does not exist. |
| **E — no longer applicable** | *(none)* | 0 | — |
| **F — unresolved blocker** | *(none)* | 0 | §49 does not fire. |

Two rows deserve their reasoning stated rather than tabulated:

- **`PERF-W01`** is annotated in the DB9 matrix as "Owner: DB10 / the
  use-case layer". DB10 declines the DB10 half and classifies it **B**.
  Order-creation transaction *latency* is performance work; DB10 does
  performance measurement only where durability requires it (retention
  batches, restore wall-clock). The transaction's *correctness* is already
  proven by DB8 CC-07 and nothing about it is open.
- **`PERF-R25`, `R37`, `R41`** are expiry/sweep reads and look retention-shaped.
  They stay **B**: each is a read a *feature* performs (session expiry, grant
  sweep, hold expiry) inside its own bounded context, not the platform
  retention job DB10 owns. DB10-CP4's job deletes rows past a cutoff; it does
  not implement a context's expiry semantics, and pretending otherwise would
  be exactly the "silent absorption" §5 forbids.

### Special-attention items (§5)

| Item | Finding |
|---|---|
| Retention deletion cost | Not measured by DB9 (`DB9_DB10_HANDOFF.md` §5 says so plainly). **DB10-CP4 measures it.** |
| Autovacuum behaviour over time | Not measured by DB9. **Not measured by DB10 either** — disposable databases live for minutes. Recorded as DP-OPS-08, owner infrastructure. DB10 does not claim it. |
| Backup/restore workload | Not measured by DB9. **DB10-CP2 measures it** at the rehearsal scale, with no extrapolation to production. |
| `audit_events` index-build risk | Carried forward: 5 indexes, 62 % of relation size, largest object in the schema. Any future index change needs `CREATE INDEX CONCURRENTLY`; it also dominates restore index-rebuild time. |
| Application features with no live caller | 30 class-B rows above. Named, owned, **not** claimed solved. |
| Provider/broker/worker infrastructure | Still unchosen (`CLAUDE.md` §8). The retention job DB10 builds is a callable service with no scheduler, and the log says so. |

### Result

```
DB10-CP0  PASS
```

No blocker. §6 scope confirmed against the roadmap; §7 baseline verified
unchanged (78/833/160/78/50/189/211/46/9/1/30/31, fingerprint matched).

**Files changed:** `DB10_EXECUTION_LOG.md`,
`DB10_DURABILITY_PARAMETER_REGISTRY.md`, `DB10_DATA_DURABILITY_MATRIX.md`,
`DB6_MIGRATION_GOVERNANCE.md` (amend addendum),
`DB9_COMPLETION_REPORT.md` (tally addendum).

**Next checkpoint:** DB10-CP1 — backup architecture and tooling.

---

## DB10-CP1 — Backup architecture, parameter registry and tooling foundation

**Starting HEAD:** `6ac5600` (`docs(database): lock DB10 durability scope`).

**Scope:** §18 layered strategy, §19 logical backup tooling, §20 manifest,
§21 failure fixtures. Closes `GAP-07` (the reserved
`infrastructure/backup/README.md` stub).

### Backup/recovery mechanism

`pg_dump --format=custom --no-owner --no-privileges`, streamed from inside
the pinned `postgres:16.14-alpine` container over its local unix socket
(DEC-DB10-006). No password is handled, stored or passed on any command
line at any point, which is why no code path here can leak one.

### Parameters

`--database`, `--out`, `--label`, `--container`, `--retention-class`,
`--url` (optional, adds the schema fingerprint to the manifest).
Restore: `--manifest`, `--target`, `--create`, `--schema-only`,
`--data-only`, `--verify-only`, `--keep-failed`.

### Artifacts produced

`<backupId>.dump` and `<backupId>.manifest.json` — the manifest carries the
21 fields §20 requires, including the schema fingerprint, applied-migration
count, exact per-table row counts, artifact sha256, and explicit
`encryption: none` / `sanitization: none`.

### Validation — smoke

| Step | Evidence |
|---|---|
| Backup of the dev database (read-only operation) | `20260721T140701Z-embroidery-cp1smoke` — 0 rows across 78 tables, 299 561 bytes, sha256 `4182cc93…` |
| Restore into a fresh target | `pg_restore` 1 950 ms; row-count parity OK; **78 public tables; 31 applied migrations recovered in the `drizzle` journal** |
| Fingerprint of the restored database | `[fingerprint-gate] match — 4ca56a59…1672f` — a restored database reproduces the canonical DB6 baseline exactly |

### Failure fixtures (§21)

| Fixture | Expected | Result |
|---|---|---|
| F1 — database does not exist | non-zero, no artifact | exit **3**, destination directory never created |
| F2 — container unreachable | non-zero, no artifact | exit **3**, no artifact |
| F3 — invalid argument (`--databse`) | usage error | exit **2** with usage text |
| F4 — unsafe identifier (`x";drop`) | rejected before any command runs | exit **2**, identifier regex refused it |
| F5 — corrupted artifact, manifest unchanged | refuse before touching the server | exit **4**, **no database created** |
| F6 — unwritable destination | non-zero, no artifact | exit **1** (`ENOTDIR`) |
| F7 — corrupted artifact with a re-hashed manifest | `pg_restore` fails cleanly | exit **1**, `--exit-on-error` stopped at the first bad statement |

No fixture produced a false-success artifact, and no fixture printed a
credential — there is none to print.

### Defects found and fixed

1. **The first backup silently produced no manifest and exited 0.**
   `child.stdout.pipe(sink)` auto-ends the sink; the code then called
   `sink.end()` and attached a `finish` listener afterwards, which had
   already fired. The promise never settled, the event loop drained, and Node
   exited 0 with a dump and no manifest — the worst possible outcome for a
   backup tool, because the artifact looks fine. Replaced with
   `stream/promises.pipeline`, which owns the sink's lifetime.
2. **F7 initially left a half-restored database behind.** `pg_restore`
   correctly exited non-zero, but the database `db-restore.mjs` had created
   survived, populated up to the first error. Fixed: a restore that fails
   after creating its own target now drops it, with `--keep-failed` to opt
   out for diagnosis. A half-restored database that looks real is precisely
   the trap this class of tooling must not set.

### Tests

`node --test tools/backup-runtime.test.mjs` — **8 passed**. Deliberately
container-free (identifier safety, argument parsing, manifest validation) so
`pnpm test` stays meaningful without a Docker daemon; the end-to-end
rehearsal is CP2's.

### Result

```
DB10-CP1  PASS
```

**Files changed:** `tools/backup-runtime.mjs`, `tools/db-backup.mjs`,
`tools/db-restore.mjs`, `tools/backup-runtime.test.mjs`,
`docs/database/DB10_BACKUP_ARCHITECTURE.md`,
`infrastructure/backup/README.md`, `package.json`, `.gitignore`.

**Next checkpoint:** DB10-CP2 — logical backup and restore rehearsal against
representative data.

---

## DB10-CP2 — Logical backup and restore rehearsal

**Starting HEAD:** `2d7e588` (`feat(database): add verified backup and restore tooling`).

**Scope:** §22 representative source, §23 backup + dual restore, §24 restore
verification, §25 corruption fixture, §26 selective-restore feasibility.

### Mechanism and data

A disposable source database (tier S — the full pipeline in miniature, 1 001
rows across 78 tables, every CHECK/FK/S24 trigger live) is backed up with the
real `tools/db-backup.mjs`, then restored by the real `tools/db-restore.mjs`
into **two independent empty databases**, `restore_a` and `restore_b`. The
`bench_uuid` generation function is dropped before the backup so the artifact
carries only the canonical schema.

A new `apps/api/src/tests/durability/` harness runs the tools as processes
(not a reimplementation) and — via `attachActor` — compiles a real Nest
module against a restored database by URL, so the application's own
repositories read the restored rows.

### Validation (§24) — each restored database

| Check | restore_a | restore_b |
|---|---|---|
| `pg_restore` wall-clock | ~3.5 s | ~3.8 s |
| Row-count parity vs manifest | OK | OK |
| Migration-journal parity (31) | OK | OK |
| All 7 live-catalog checkers + fingerprint gate | PASS (`4ca56a59…1672f`) | PASS |
| Critical-table content checksums (7 tables, order-independent md5) | identical to source | identical to source |
| CHECK + S24 immutability still enforcing (SQLSTATE 23000) | PASS | — |
| Repository read through `OrderRepository.findById` | PASS | — |
| Order → outbox atomicity, commit **and** rollback halves | PASS | — |

The manifest is credential-free (asserted: contains neither `password` nor
the dev password), declares `encryption: none` / `sanitization: none`, and
records the source fingerprint, which matches the frozen baseline.

### Corruption and safety fixtures (§25)

| Fixture | Result |
|---|---|
| Corrupted artifact, manifest hash unchanged | exit **4**, no database created, no credential printed |
| Restore over an existing database (`--create`) | exit **1**, refused |
| Schema-only selective restore | exit **0**, restored schema passes the fingerprint gate |

### Selective restore feasibility (§26)

`--schema-only` is proven (a schema-only restore reproduces the baseline).
`--data-only` exists but is **not promised as a recovery path**: this schema
has 160 FK edges and the S24 append-only triggers reject the out-of-order
writes a data-only restore into a populated database would attempt, so a safe
selective *data* recovery needs the schema-then-data ordering the full
restore already performs. Recorded rather than overclaimed.

### Defects found and fixed

1. `rawExecutor` read `.db` off the injected `DatabaseConnection`; the getter
   is `.database`. Fixed.
2. The atomicity test reused the backbone request for both the commit and the
   rollback half, so the second create hit `uq_orders__request` before
   reaching the deliberate throw. Reordered: rollback first (leaves the
   request order-free), then commit — each half now exercises what it claims.
3. The S24 assertion expected a mapped `PersistenceError.code`; the raw
   executor deliberately does **not** map driver errors (DEC-DB8-005), so the
   SQLSTATE lives on the wrapped `.cause.code`. Added `sqlStateOf`, which
   digs the 5-char SQLSTATE out of the cause chain — testing the real error
   the raw path produces rather than one it does not.

### Cleanup

Every `embroidery_db10_restore_*` database is dropped in `afterAll`,
including any a failed assertion leaves behind; the manual CP1 smoke database
was also removed. `select datname from pg_database where datname like
'embroidery%'` → `embroidery` only. Dev fingerprint re-checked: match.

### Tests

`apps/api` durability suite: **13 passed** (`npx jest --runInBand db10-cp2`).

### Result

```
DB10-CP2  PASS
```

**Files changed:** `apps/api/src/tests/durability/durability-harness.ts`,
`apps/api/src/tests/durability/db10-cp2-logical-restore.integration.spec.ts`,
`apps/api/src/tests/integration/db8-concurrency-context.ts` (exported
`compileActor` for reuse).

**Next checkpoint:** DB10-CP3 — physical recovery / WAL / PITR feasibility
and rehearsal.
