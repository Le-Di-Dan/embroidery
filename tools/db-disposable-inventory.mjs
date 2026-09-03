#!/usr/bin/env node
/**
 * Disposable test-database inventory and cleanup (`APP12-H02` §34/§39 —
 * `FU-APP12-B02-04`, `FU-APP12-A02-03`).
 *
 * ```
 *   node tools/db-disposable-inventory.mjs                 # inventory, read-only
 *   node tools/db-disposable-inventory.mjs --execute       # drop PROVEN disposables
 * ```
 *
 * ## Why this is not a `DROP DATABASE` loop over a wildcard
 *
 * The `APP12-A02` report observed fifteen orphaned disposable databases on the
 * development server and filed the leak. The obvious cleanup — drop everything
 * matching a pattern — is the one thing this tool must never do: the same
 * server carries the shared development database, and a pattern is exactly how
 * a cleanup script eventually matches something it was not meant to.
 *
 * So the default is an **inventory**, and dropping requires three independent
 * things to agree:
 *
 * 1. the name carries the disposable prefix this repository's own harness mints
 *    (`PROVEN_DISPOSABLE_PREFIX`, traced below to the factory that builds it);
 * 2. the name is not on the protected list, which is checked *before* the prefix
 *    match and wins outright — so a prefix that ever came to subsume a real name
 *    still could not drop it;
 * 3. the database has no active backend other than this tool's own connection.
 *
 * A database that fails any of the three is reported with its evidence and left
 * alone for operator review. §34 says an unprovable remnant is retained, not
 * guessed at, and §39 repeats it.
 *
 * The tool never deletes a row from anything. Dropping a proven disposable
 * database whole is the correct cleanup; reaching into a shared database to
 * tidy it is not, and no code path here can.
 */
import { execFileSync } from 'node:child_process';
import { argv, env, exit, stdout } from 'node:process';
import { pathToFileURL } from 'node:url';

/**
 * The ONE prefix this repository's disposable databases carry.
 *
 * Not a guessed family of prefixes — measured. `disposableDatabaseName`
 * (`packages/database/src/testing/disposable-database.ts`) builds every name as
 * `embroidery_db7_<label>_<pid>`, and it is the single factory every
 * integration, contract and Playwright suite goes through: the E2E orchestration
 * is a thin adapter over it and says so, and its own refusal guard already
 * documents the same contract ("the canonical harness always names disposable
 * databases `embroidery_db7_*`").
 *
 * One prefix rather than a per-phase list is the safer shape as well as the
 * true one: a list would need an entry adding for each new phase, and the
 * failure mode of a *missing* entry is a database this tool cannot prove and
 * therefore retains — whereas the failure mode of a *wrong* entry is a drop.
 * The narrow version can only ever under-collect.
 */
export const PROVEN_DISPOSABLE_PREFIX = 'embroidery_db7_';

/**
 * Names that may never be dropped, whatever else matches.
 *
 * `embroidery` is the shared development database; the three PostgreSQL
 * templates and `sonar` are infrastructure. This list is checked after the
 * prefix match and overrides it.
 */
export const PROTECTED_DATABASES = Object.freeze([
  'embroidery',
  'postgres',
  'template0',
  'template1',
  'sonar',
]);

/** The development container the shared server runs in. */
const DEFAULT_CONTAINER = 'embroidery-dev-postgres-1';
const DEFAULT_USER = 'embroidery';

function psql(container, user, sql) {
  return execFileSync(
    'docker',
    ['exec', container, 'psql', '-U', user, '-d', 'postgres', '-tAF', '', '-c', sql],
    { encoding: 'utf8' },
  );
}

/**
 * Every database on the server with the facts a disposition needs: its age, how
 * many backends are attached, and its size. Values come from `pg_database` and
 * `pg_stat_activity`, never from a name pattern — the pattern decides only
 * whether a *drop* is permitted.
 */
function inventory(container, user) {
  const sql = `
    SELECT d.datname,
           coalesce(pg_size_pretty(pg_database_size(d.datname)), 'n/a'),
           (SELECT count(*) FROM pg_stat_activity a
              WHERE a.datname = d.datname AND a.pid <> pg_backend_pid()),
           coalesce((SELECT to_char(min(a.backend_start), 'YYYY-MM-DD HH24:MI')
                       FROM pg_stat_activity a WHERE a.datname = d.datname), '-')
      FROM pg_database d
     WHERE d.datallowconn
     ORDER BY d.datname`;
  return psql(container, user, sql)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const [name, size, connections, oldestBackend] = line.split('');
      return {
        name,
        size,
        connections: Number(connections),
        oldestBackend,
        ...classify(name),
      };
    });
}

/**
 * The disposition. `disposable` alone never authorises a drop — `droppable`
 * does, and it additionally requires the database to be idle.
 */
export function classify(name) {
  if (PROTECTED_DATABASES.includes(name)) {
    return { disposition: 'PROTECTED', reason: 'on the protected list' };
  }
  if (!name.startsWith(PROVEN_DISPOSABLE_PREFIX)) {
    return {
      disposition: 'UNKNOWN',
      reason: 'does not carry the prefix this repository is known to mint',
    };
  }
  return {
    disposition: 'DISPOSABLE',
    reason: `minted with the ${PROVEN_DISPOSABLE_PREFIX} prefix`,
  };
}

export function droppable(entry) {
  return entry.disposition === 'DISPOSABLE' && entry.connections === 0;
}

function render(entries) {
  const width = Math.max(...entries.map((entry) => entry.name.length), 20);
  for (const entry of entries) {
    const state = droppable(entry)
      ? 'DROPPABLE'
      : entry.disposition === 'DISPOSABLE'
        ? 'DISPOSABLE_IN_USE'
        : entry.disposition;
    stdout.write(
      `  ${entry.name.padEnd(width)}  ${state.padEnd(18)} conns=${String(entry.connections).padStart(3)}  size=${entry.size.padStart(9)}  since=${entry.oldestBackend}  (${entry.reason})\n`,
    );
  }
}

function main() {
  const execute = argv.includes('--execute');
  const container = env['EMBROIDERY_PG_CONTAINER'] ?? DEFAULT_CONTAINER;
  const user = env['EMBROIDERY_PG_USER'] ?? DEFAULT_USER;

  let entries;
  try {
    entries = inventory(container, user);
  } catch (error) {
    stdout.write(`DISPOSABLE DB INVENTORY: FAIL — ${String(error.message ?? error).trim()}\n`);
    exit(1);
  }

  const disposable = entries.filter((entry) => entry.disposition === 'DISPOSABLE');
  const targets = entries.filter(droppable);
  const retained = disposable.filter((entry) => !droppable(entry));
  const unknown = entries.filter((entry) => entry.disposition === 'UNKNOWN');

  stdout.write(`DISPOSABLE DB INVENTORY (${container})\n`);
  render(entries);
  stdout.write(
    `\n  total=${entries.length} disposable=${disposable.length} droppable=${targets.length} in_use=${retained.length} unknown=${unknown.length} protected=${entries.length - disposable.length - unknown.length}\n`,
  );

  if (!execute) {
    stdout.write(
      '\n  DRY RUN — nothing was dropped. Re-run with --execute to drop the DROPPABLE set.\n',
    );
    return;
  }

  let dropped = 0;
  for (const entry of targets) {
    // The name is re-classified immediately before the drop rather than trusted
    // from the listing above: the check that authorises the destructive action
    // must be the one adjacent to it.
    const check = classify(entry.name);
    if (check.disposition !== 'DISPOSABLE') {
      stdout.write(`  REFUSED ${entry.name} — ${check.reason}\n`);
      continue;
    }
    // Identifier-quoted, so a name is a name and never a fragment of SQL.
    psql(container, user, `DROP DATABASE IF EXISTS "${entry.name}"`);
    stdout.write(`  DROPPED ${entry.name}\n`);
    dropped += 1;
  }

  const after = inventory(container, user);
  stdout.write(
    `\n  dropped=${dropped} before=${entries.length} after=${after.length} unsafe_drop=0\n`,
  );
  if (retained.length > 0 || unknown.length > 0) {
    stdout.write('  RETAINED for operator review (not proven disposable, or in use):\n');
    render([...retained, ...unknown]);
  }
}

// Only run when invoked as a command. Importing this module — which the safety
// tests do, to exercise `classify` and `droppable` without a database — must
// never reach for Docker or drop anything.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
