# DB6 Reproducibility Runbook

Developer/CI-focused: how to independently verify the DB6 physical schema from a clean
checkout. Operator-focused rollout steps live in `DB6_MIGRATION_OPERATIONS_RUNBOOK.md`.

## 1. Required runtime versions

| Tool | Version | Source |
|---|---|---|
| Node.js | `>=22.0.0` | root `package.json` `engines` |
| pnpm | `11.5.2` (pinned via Corepack) | root `package.json` `packageManager` |
| Docker | 27.x with Compose v2 | `docs/development/LOCAL_DEVELOPMENT.md` §1 |
| PostgreSQL | `16.14-alpine`, exact pinned patch, `--locale=C --encoding=UTF8` | `infrastructure/compose/docker-compose.dev.yml` (ADR-DB1-001, DEV-DB6-002) |

## 2. Required / optional environment variables

Required (present in `.env.example`, copy to `.env` per
`docs/development/LOCAL_DEVELOPMENT.md` §3): `POSTGRES_HOST`, `POSTGRES_PORT`,
`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL` (must agree with the
discrete `POSTGRES_*` values — `packages/database/src/config/database-config.ts` fails fast
otherwise).

Optional: `POSTGRES_PORT=5433` (or any free port) if 5432 is already taken locally — a
known Windows collision, see `docs/development/LOCAL_DEVELOPMENT.md`.

No credential is ever printed by any DB6 tool — every connection string is passed through
`redactUrl`/the equivalent redaction in `packages/database/tools/live-db.mjs` before it can
reach a log line.

## 3. Clean-clone rehearsal (what S27 ran)

Two independent rehearsals were performed via `git worktree add <path> HEAD --detach`
(a full `git clone` is equivalent but slower on this host; a worktree checks out only
tracked files, same guarantee of no dependence on local untracked state):

```bash
git worktree add ../embroidery-clean-clone HEAD --detach
cd ../embroidery-clean-clone
pnpm install --filter @embroidery/database...
```

Then, against a disposable database inside the existing dev Postgres container (no new
container needed — the container already runs the canonical pinned image):

```bash
# create a disposable DB (never the persistent dev DB)
docker exec embroidery-dev-postgres-1 psql -U embroidery -d embroidery \
  -c "CREATE DATABASE embroidery_rehearsal OWNER embroidery;"

cd packages/database
node -e "
  import('drizzle-orm/node-postgres').then(async ({ drizzle }) => {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const pg = (await import('pg')).default;
    const pool = new pg.Pool({ connectionString: process.argv[1] });
    await migrate(drizzle(pool), { migrationsFolder: './migrations' });
    await pool.end();
  });
" "postgres://embroidery:embroidery_dev_password@localhost:5434/embroidery_rehearsal"

node tools/db-live-tables-check.mjs "$URL"
node tools/db-live-constraints-check.mjs "$URL"
node tools/db-live-indexes-check.mjs "$URL"
node tools/db-live-jsonb-check.mjs "$URL"
node tools/db-live-money-check.mjs "$URL"
node tools/db-live-triggers-check.mjs "$URL"
node tools/db-fingerprint-gate.mjs "$URL"
node tools/db-migration-checksum-check.mjs

# cleanup
docker exec embroidery-dev-postgres-1 psql -U embroidery -d embroidery \
  -c "DROP DATABASE embroidery_rehearsal;"
```

Every command above has a deterministic non-zero exit on failure and prints its stage name
(`[tables]`, `[constraints]`, `[fingerprint-gate]`, etc.) so a CI log immediately shows which
stage failed.

## 4. What "no dependence on undocumented local files" means here

The clean-clone rehearsal is the assertion mechanism: everything the checkers/fingerprint
need (`pg`, `drizzle-orm`, the migration `.sql` files, the checker scripts themselves) comes
from `pnpm install` plus tracked repository files. Nothing in `packages/database/tools/`
reads from outside the package directory except the live Postgres connection.

**Real finding from this rehearsal (fixed, not just reported):** a fresh checkout on a
machine with `core.autocrlf=true` (the default on many Windows Git installs) silently
converted migration `0030`'s multi-line PL/pgSQL function body from LF to CRLF line
endings. Those bytes land verbatim inside Postgres's stored function definition
(`pg_get_functiondef`), so the two checkouts produced byte-identical *behavior* but a
**different** deterministic schema fingerprint purely from whitespace, with zero schema
semantic change. Root-caused via a byte-level diff of the normalized JSON (`functions[0].def`
differed at the first `\r\n` vs `\n`), not guessed. Fixed by adding `.gitattributes`
(`* text=auto eol=lf`, `*.sql text eol=lf`) at the repository root, committed in `69b66d8`.
Re-run after the fix: both worktrees and the original checkout reproduce the identical
canonical fingerprint `4ca56a5967730d257edb34e72d6c40373156704cab7c87e3a684803c8321672f`.

## 5. Failure rehearsals (isolated fixtures only — never the tracked migration files)

| Fixture | Command | Expected | Result |
|---|---|---|---|
| Wrong expected fingerprint | `node tools/db-fingerprint-gate.mjs "$URL" <fixture-file-with-wrong-hash>` | exit 1, prints expected vs. actual, no auto-fix | PASS |
| Missing migration file | Copy `migrations/*.sql` to a scratch dir, delete one file, run the migrator against it | exit 1 (uncaught, but immediately actionable — names the exact missing file), no secret in the message | PASS |
| Altered historical migration checksum | Copy `migrations/*.sql`, append a comment to an already-applied file, run `pnpm db:migrate` against it | **exit 0 — drizzle-orm's migrator does not re-verify already-applied files** (see §6) | documented gap, closed by `db-migration-checksum-check.mjs` |
| Unavailable database connection | `node tools/db-live-tables-check.mjs "postgres://user:pass@localhost:1/x"` (before the fix) | crashed with an unhandled-rejection stack trace and **leaked the plaintext password** in `db-fingerprint-gate.mjs`'s own error text | **real finding, fixed** — see §6 |

All fixtures ran against copies/scratch directories or throwaway databases; no tracked
migration file (`0000`–`0031`) was left modified, and the persistent dev database was never
touched (confirmed at migration id 29 before and after every rehearsal in this document).

## 6. Two additional real findings from the failure rehearsals (fixed, not merely noted)

1. **Plaintext password leak on connection failure.** Before the fix, an unreachable
   `DATABASE_URL` caused `live-db.mjs`'s `connect()` to throw an unhandled rejection, and
   `db-fingerprint-gate.mjs`'s own catch block echoed the child process's full command line
   — including the raw connection string — into its own error output. Fixed:
   `connect()` now catches the error itself, prints only `redactUrl(url)` plus the
   Postgres/network error code, and calls `process.exit(2)` — no stack trace, no credential,
   deterministic exit code. `db-fingerprint-gate.mjs` was updated to use the same
   `redactUrl` helper for its own message instead of the raw `execFileSync` error text.
2. **Migration checksum blind spot.** `drizzle-orm`'s migrator (and `drizzle-kit check`,
   which only diffs `schema.ts` against snapshots, not raw migration bytes) never
   re-verifies an already-applied migration file's content on a later run — confirmed by
   tampering with `0001` in a scratch copy and observing a clean `exit 0`. Closed by the new
   `tools/db-migration-checksum-check.mjs`, which recomputes a SHA-256 of every migration
   file and compares it against the frozen `tools/migration-checksums.json` manifest,
   failing loudly (and naming the exact file and both hashes) on any drift.

## 7. Reproducibility result

Two independent rehearsals (worktree #1 pre-fix, worktree #2 post-`.gitattributes`-fix, plus
a third disposable database built directly from worktree #2's checkout) all produced:

- identical table/column/FK/constraint/index/JSONB/trigger metrics;
- identical deterministic fingerprint (`4ca56a59...`) — once the `.gitattributes` fix was in
  place;
- identical `db-manifest-check`/`db-metric-check`/`db-deferred-owner-check`/
  `db-migration-checksum-check` PASS results.

Only dynamic fields (disposable DB name, run timestamp, wall-clock time) differed, exactly
as expected.
