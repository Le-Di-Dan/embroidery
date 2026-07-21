#!/usr/bin/env node
/**
 * DB10 — retention sweep (DB10-CP4).
 *
 * Deletes rows older than a caller-supplied cutoff, in bounded batches,
 * child-before-parent, under the S24 `retention_exempt` exemption — and
 * **only** for the families a retention policy actually reaches.
 *
 * Two safety properties are structural, not conventional:
 *
 * 1. **No built-in durations.** The cutoff is always an argument
 *    (DEC-DB10-004). Every retention period in this system is a deferred
 *    business value; a tool that hard-coded one would be inventing policy.
 * 2. **A code-level allowlist, not the trigger, is the boundary.** The S24
 *    `retention_exempt` trigger policy is broader than the retention policy —
 *    `audit_events`, `payment_provider_events` and the ledger all carry it
 *    while the retention map marks the last two *retain forever*. This tool
 *    refuses any family not in `FAMILIES`, so the exemption GUC can never be
 *    pointed at a commercial record.
 *
 * Usage:
 *   node tools/db-retention.mjs --database <name> --family <id> --cutoff <iso>
 *                               [--batch <n>] [--dry-run] [--container <name>]
 * Exit: 0 ok · 2 usage · 3 unavailable
 */
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const DEFAULT_CONTAINER = process.env.DB_BACKUP_CONTAINER ?? 'embroidery-dev-postgres-1';
const ROLE = process.env.DB_BACKUP_ROLE ?? 'embroidery';
const DEFAULT_BATCH = 500;

/**
 * The families a retention policy reaches. Each is an ordered list of steps —
 * children first, parent last — so foreign keys never block a delete.
 *
 * `retain` families (orders, payments, ledger, snapshots) are deliberately
 * absent: they are not deletable regardless of the trigger's exemption.
 */
const FAMILIES = {
  outbox: [
    { table: 'outbox_events', column: 'dispatched_at', status: ['DISPATCHED', 'DEAD_LETTER'] },
  ],
  idempotency: [{ table: 'idempotency_records', column: 'expires_at' }],
  background_jobs: [{ table: 'background_job_attempts', column: 'finished_at' }],
  notification: [
    {
      table: 'notification_delivery_attempts',
      column: 'created_at',
      parent: {
        table: 'notification_intents',
        fk: 'intent_id',
        column: 'created_at',
        status: ['SATISFIED', 'FAILED', 'CANCELLED'],
      },
    },
    {
      table: 'notification_intents',
      column: 'created_at',
      status: ['SATISFIED', 'FAILED', 'CANCELLED'],
    },
  ],
  verification: [
    {
      table: 'contact_verification_attempts',
      column: 'created_at',
      parent: {
        table: 'contact_verification_challenges',
        fk: 'challenge_id',
        column: 'expires_at',
        status: ['VERIFIED', 'FAILED', 'EXPIRED', 'CANCELLED'],
      },
    },
    {
      table: 'contact_verification_challenges',
      column: 'expires_at',
      status: ['VERIFIED', 'FAILED', 'EXPIRED', 'CANCELLED'],
    },
  ],
  audit: [{ table: 'audit_events', column: 'occurred_at' }],
  admin_sessions: [
    { table: 'admin_sessions', column: 'expires_at', status: ['EXPIRED', 'REVOKED'] },
  ],
  asset_inspections: [{ table: 'asset_inspections', column: 'inspected_at' }],
  inventory_holds: [
    {
      table: 'inventory_soft_holds',
      column: 'expires_at',
      status: ['CONVERTED', 'RELEASED', 'EXPIRED'],
    },
  ],
};

function log(message) {
  console.log(`[retention] ${message}`);
}

function fail(code, message) {
  console.error(`[retention] ${message}`);
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

/** A cutoff must be an ISO-8601 instant; it is interpolated into SQL, so it is validated. */
function assertCutoff(value) {
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:?\d{2})?|Z)?$/.test(value)) {
    fail(2, `--cutoff must be an ISO-8601 timestamp, received: ${value}`);
  }
  return value;
}

function psql(container, database, statement) {
  const out = execFileSync(
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
  );
  return out.trim();
}

/** The `WHERE` fragment selecting a step's expired rows. */
function whereClause(step, cutoff) {
  if (step.parent !== undefined) {
    const p = step.parent;
    const parentStatus =
      p.status === undefined ? '' : ` and status = any(array[${quoteList(p.status)}])`;
    return `${step.fk ?? p.fk} in (select id from ${p.table} where ${p.column} < '${cutoff}'::timestamptz${parentStatus})`;
  }
  const status =
    step.status === undefined ? '' : ` and status = any(array[${quoteList(step.status)}])`;
  return `${step.column} < '${cutoff}'::timestamptz${status}`;
}

function quoteList(values) {
  return values.map((value) => `'${value}'`).join(', ');
}

/**
 * One bounded batch: select up to `batch` expired rows, delete them, return
 * the count.
 *
 * `set local` runs in the same implicit transaction as the delete (psql sends
 * the whole string as one simple query), which is what activates the S24
 * exemption for this batch and nothing beyond it. `set local` prints its own
 * `SET` command tag, so the count is the *last* line of output, not the whole
 * of it — parsing the whole string would yield NaN and loop forever.
 */
function deleteBatch(container, database, step, cutoff, batch) {
  const where = whereClause({ ...step, fk: step.parent?.fk }, cutoff);
  const sql = `
    set local app.bypass_retention_trigger = 'on';
    with victims as (
      select ctid from ${step.table}
      where ${where}
      order by ctid
      limit ${batch}
      for update skip locked
    ), del as (
      delete from ${step.table} where ctid in (select ctid from victims) returning 1
    )
    select count(*) from del`;
  const lines = psql(container, database, sql)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const count = Number(lines[lines.length - 1]);
  if (!Number.isInteger(count)) {
    throw new Error(`unexpected batch output for ${step.table}: ${lines.join(' | ')}`);
  }
  return count;
}

function countExpired(container, database, step, cutoff) {
  const where = whereClause({ ...step, fk: step.parent?.fk }, cutoff);
  return Number(psql(container, database, `select count(*) from ${step.table} where ${where}`));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.database === undefined || args.family === undefined || args.cutoff === undefined) {
    fail(
      2,
      'usage: node tools/db-retention.mjs --database <name> --family <id> --cutoff <iso> ' +
        '[--batch <n>] [--dry-run] [--container <name>]',
    );
  }

  const family = FAMILIES[args.family];
  if (family === undefined) {
    fail(
      2,
      `unknown or non-retention family "${args.family}". ` +
        `Retention only reaches: ${Object.keys(FAMILIES).join(', ')}. ` +
        'Commercial records (orders, payments, ledger, snapshots) are never deletable.',
    );
  }

  const cutoff = assertCutoff(args.cutoff);
  const batch = args.batch === undefined ? DEFAULT_BATCH : Number(args.batch);
  if (!Number.isInteger(batch) || batch < 1) fail(2, `--batch must be a positive integer`);

  const container = args.container ?? DEFAULT_CONTAINER;
  const started = Date.now();
  const report = {};

  for (const step of family) {
    if (args.dryRun === true) {
      report[step.table] = { wouldDelete: countExpired(container, database(args), step, cutoff) };
      continue;
    }
    let total = 0;
    let batches = 0;
    for (;;) {
      const deleted = deleteBatch(container, database(args), step, cutoff, batch);
      total += deleted;
      if (deleted > 0) batches += 1;
      if (deleted < batch) break;
    }
    report[step.table] = { deleted: total, batches };
  }

  const durationMs = Date.now() - started;
  log(`family ${args.family}${args.dryRun === true ? ' (dry run)' : ''} cutoff ${cutoff}`);
  for (const [table, metrics] of Object.entries(report)) {
    log(`  ${table}: ${JSON.stringify(metrics)}`);
  }
  log(`done in ${durationMs} ms`);
  console.log(
    JSON.stringify({ family: args.family, dryRun: args.dryRun === true, durationMs, report }),
  );
  process.exit(0);
}

function database(args) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(args.database)) {
    fail(2, `--database must be a plain identifier, received: ${args.database}`);
  }
  return args.database;
}

try {
  main();
} catch (error) {
  fail(3, error.message);
}
