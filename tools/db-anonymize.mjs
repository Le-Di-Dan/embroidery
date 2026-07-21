#!/usr/bin/env node
/**
 * DB10 — customer anonymization (DB10-CP4).
 *
 * Scrubs direct PII from a customer and their contact points while keeping
 * the row, its id and every commercial link intact. This is the "field
 * scrub, rows retained while commercial history exists" behaviour the
 * retention map specifies for the `comm + anonymize` class — not a delete.
 *
 * What it removes: `display_name`, `notes`, and each contact point's
 * `normalized_value` / `display_value`.
 * What it keeps: `id`, `verified_at`, merge linkage, and every foreign key an
 * order, quotation or approval snapshot depends on — so financial and audit
 * evidence stays whole (§34).
 *
 * The scrub is idempotent: a row already carrying `anonymized_at` is skipped,
 * so re-running changes nothing. Durations stay deferred — anonymization is
 * driven by an explicit id set or a caller cutoff, never a built-in period.
 *
 * Usage:
 *   node tools/db-anonymize.mjs --database <name> (--customer <uuid> | --cutoff <iso>)
 *                               [--dry-run] [--container <name>]
 * Exit: 0 ok · 2 usage · 3 unavailable
 */
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const DEFAULT_CONTAINER = process.env.DB_BACKUP_CONTAINER ?? 'embroidery-dev-postgres-1';
const ROLE = process.env.DB_BACKUP_ROLE ?? 'embroidery';

function log(message) {
  console.log(`[anonymize] ${message}`);
}

function fail(code, message) {
  console.error(`[anonymize] ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (!token.startsWith('--')) fail(2, `unexpected argument: ${token}`);
    const name = token.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) fail(2, `--${name} requires a value`);
    parsed[name] = value;
    i += 1;
  }
  return parsed;
}

function psql(container, database, statement) {
  return execFileSync(
    'docker',
    [
      'exec',
      container,
      'psql',
      '-U',
      ROLE,
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
      '-tAc',
      statement,
    ],
    { encoding: 'utf8' },
  ).trim();
}

function assertIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value)) {
    fail(2, `--database must be a plain identifier, received: ${value}`);
  }
  return value;
}

/** Builds the `WHERE` selecting the customers in scope, not yet anonymized. */
function scopeClause(args) {
  if (args.customer !== undefined) {
    if (!/^[0-9a-fA-F-]{36}$/.test(args.customer)) fail(2, `--customer must be a uuid`);
    return `id = '${args.customer}'::uuid and anonymized_at is null`;
  }
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(args.cutoff)) {
    fail(2, `--cutoff must be an ISO-8601 timestamp`);
  }
  // updated_at is a stand-in for "last commercial activity"; the real trigger
  // is a business-owned period (DP-RET-06). The mechanism does not change.
  return `updated_at < '${args.cutoff}'::timestamptz and anonymized_at is null`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.database === undefined || (args.customer === undefined && args.cutoff === undefined)) {
    fail(
      2,
      'usage: node tools/db-anonymize.mjs --database <name> ' +
        '(--customer <uuid> | --cutoff <iso>) [--dry-run] [--container <name>]',
    );
  }

  const database = assertIdentifier(args.database);
  const container = args.container ?? DEFAULT_CONTAINER;
  const scope = scopeClause(args);

  const eligible = Number(
    psql(container, database, `select count(*) from customers where ${scope}`),
  );
  if (args.dryRun === true) {
    log(`dry run — ${eligible} customer(s) would be anonymized`);
    console.log(JSON.stringify({ dryRun: true, eligible }));
    process.exit(0);
  }

  // One transaction: scrub contact points for the in-scope customers, then
  // the customers themselves. Contact points first so the customer row still
  // identifies them when the child update runs.
  const statement = `
    begin;
    update customer_contact_points
    set normalized_value = 'anonymized:' || id::text,
        display_value = 'anonymized',
        anonymized_at = now(),
        updated_at = now()
    where customer_id in (select id from customers where ${scope})
      and anonymized_at is null;
    update customers
    set display_name = null,
        notes = null,
        anonymized_at = now(),
        updated_at = now()
    where ${scope};
    commit;`;
  psql(container, database, statement);

  const anonymized = Number(
    psql(container, database, `select count(*) from customers where anonymized_at is not null`),
  );
  log(`anonymized ${eligible} customer(s); ${anonymized} total now carry anonymized_at`);
  console.log(JSON.stringify({ dryRun: false, anonymized: eligible, totalAnonymized: anonymized }));
  process.exit(0);
}

try {
  main();
} catch (error) {
  fail(3, error.message);
}
