#!/usr/bin/env node
/**
 * APP12-V02-C2 — identity-sequence parity check and repair.
 *
 * Usage:
 *   node tools/db-sequence-sync.mjs --database <name> [--container <name>]
 *   node tools/db-sequence-sync.mjs --database <name> --repair
 *
 * `tools/db-restore.mjs` now verifies and repairs sequence parity as part of a
 * restore, but a database that was already loaded before that check existed
 * carries the damage silently. This is the operator-facing counterpart: it
 * reports drift on a live database and, with `--repair`, advances each drifted
 * sequence past its table's highest key.
 *
 * ## What drift actually is
 *
 * `COPY` — which is how `pg_restore` loads an identity column — writes the key
 * without advancing the sequence that owns it. The database is then internally
 * consistent and completely fine to read, and every future insert into an
 * affected table fails on the **primary key**. Applications do not guard
 * against that: an `ON CONFLICT` clause names the business uniqueness it knows
 * about, so a primary-key 23505 escapes as an unhandled server error. In
 * `APP12-V02-C2` it surfaced as an Admin image upload returning HTTP 500 and
 * being reported to the operator as an object-storage outage.
 *
 * ## Why repair is opt-in
 *
 * Without `--repair` this only reports, and exits non-zero when it finds drift,
 * so it can be used as a gate. Writing to a database is the operator's call.
 */
import process from 'node:process';

import {
  DEFAULT_CONTAINER,
  EXIT,
  assertSafeIdentifier,
  databaseExists,
  identitySequenceDrift,
  parseArgs,
  resyncIdentitySequences,
  serverReachable,
} from './backup-runtime.mjs';

const USAGE =
  'usage: node tools/db-sequence-sync.mjs --database <name> [--container <name>] [--repair]';

function log(message) {
  console.log(`[db:sequence-sync] ${message}`);
}

function fail(code, message) {
  console.error(`[db:sequence-sync] ${message}`);
  process.exit(code);
}

function main() {
  const args = parseArgs(process.argv.slice(2), {
    keys: ['database', 'container'],
    flags: ['repair'],
  });

  const database = args.database;
  if (database === undefined) {
    fail(EXIT.usage, USAGE);
    return;
  }
  assertSafeIdentifier('database', database);
  const container = args.container ?? DEFAULT_CONTAINER;

  if (!serverReachable(container)) {
    fail(EXIT.failed, `PostgreSQL is not reachable in container "${container}".`);
    return;
  }
  if (!databaseExists(container, database)) {
    fail(EXIT.failed, `database "${database}" does not exist.`);
    return;
  }

  const drifted = identitySequenceDrift(container, database);
  if (drifted.length === 0) {
    log(`identity sequence parity OK for "${database}" — no sequence is behind its rows.`);
    process.exit(EXIT.ok);
    return;
  }

  for (const entry of drifted) {
    log(`behind: ${entry.table} (last_value ${entry.sequenceLastValue}, max id ${entry.maxId})`);
  }

  if (args.repair !== true) {
    fail(
      EXIT.failed,
      `${drifted.length} identity sequence(s) behind their rows. ` +
        'Re-run with --repair to advance them. Until then, the next insert into ' +
        'each of those tables fails on its primary key.',
    );
    return;
  }

  resyncIdentitySequences(container, database, drifted);
  const remaining = identitySequenceDrift(container, database);
  if (remaining.length > 0) {
    fail(EXIT.failed, `still behind after repair: ${remaining.map((e) => e.table).join(', ')}`);
    return;
  }
  log(`repaired — ${drifted.length} identity sequence(s) advanced past their rows.`);
  process.exit(EXIT.ok);
}

main();
