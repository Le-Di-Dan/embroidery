#!/usr/bin/env node
/**
 * `APP2-B04-C1` — measures the Q-01 public catalog access path for real.
 *
 * The correction may not simply assert that IDX-065 serves the delivered
 * keyset listing. It builds a disposable PostgreSQL, applies all 33 tracked
 * migrations, seeds the deterministic MVP fixture and captures
 * `EXPLAIN (ANALYZE, BUFFERS)` for four cases — unfiltered first page,
 * unfiltered continuation, category-filtered first page, category-filtered
 * continuation — plus a structural probe with sequential scans disabled, which
 * is what separates "the planner prefers a scan at this size" from "the index
 * could not serve this ordering at any size".
 *
 * Nothing here touches the developer's database, the dev stack or the tracked
 * Compose files, and the disposable container has no password to leak: it runs
 * with `POSTGRES_HOST_AUTH_METHOD=trust` on loopback and is removed on exit,
 * pass or fail.
 *
 * The decision content lives in `explain-q01-access-path.mjs`; this file only
 * executes it.
 */
import { execFile } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
  CANONICAL_CATEGORIES,
  FIXTURE,
  categoryConstantStatement,
  READY_POLL_MS,
  READY_TIMEOUT_MS,
  REPO_ROOT,
  accessPathVerdict,
  argsAreCredentialFree,
  containerName,
  databaseUrl,
  explain,
  extractPlanJson,
  lastRowStatement,
  listStatement,
  parsePublishedPort,
  portArgs,
  psqlArgs,
  removeArgs,
  runArgs,
  scenarios,
  seedStatements,
  summarizePlan,
} from './explain-q01-access-path.mjs';

const run = promisify(execFile);
const MIGRATIONS_DIR = join(REPO_ROOT, 'packages', 'database', 'migrations');

async function docker(args, options = {}) {
  if (!argsAreCredentialFree(args)) {
    throw new Error('refusing to run a docker command carrying a credential-shaped argument');
  }
  return run('docker', args, { maxBuffer: 64 * 1024 * 1024, ...options });
}

/** One psql round trip; `input` feeds a whole migration file through stdin. */
async function psql(name, statements, input) {
  const args =
    input === undefined
      ? psqlArgs(name, statements)
      : [
          'exec',
          '--interactive',
          name,
          'psql',
          '--username',
          'embroidery',
          '--dbname',
          'embroidery',
          '--variable',
          'ON_ERROR_STOP=1',
          '--quiet',
        ];
  const child = execFile('docker', args, { maxBuffer: 64 * 1024 * 1024 });
  if (input !== undefined) {
    child.stdin.end(input);
  }
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `psql exited ${code}`)),
    );
  });
}

async function waitForReady(name) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    try {
      await docker(['exec', name, 'pg_isready', '--username', 'embroidery']);
      return;
    } catch (error) {
      if (Date.now() > deadline) throw new Error(`PostgreSQL never became ready: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
    }
  }
}

async function applyMigrations(name) {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    await psql(name, [], readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }
  return files.length;
}

/** `display_order id` of the last row on page one, for the continuation case. */
async function cursorAfterFirstPage(name, options) {
  const output = await psql(name, [lastRowStatement(options)]);
  const [displayOrder, id] = output.trim().split(/\s+/);
  return { displayOrder: Number(displayOrder), id };
}

async function capture(name, statement, { noSeqScan = false } = {}) {
  const statements = noSeqScan
    ? ['set enable_seqscan = off', explain(statement)]
    : [explain(statement)];
  return summarizePlan(extractPlanJson(await psql(name, statements)));
}

function report(ref, form, page, summary, verdict) {
  console.log(
    [
      `  ${ref} ${form} / ${page}`,
      `    ordering     ${summary.outerNodes.join(' → ')}`,
      `    index        ${summary.indexes.length > 0 ? summary.indexes.join(', ') : '(none)'}`,
      `    sort node    ${summary.hasSort ? 'yes' : 'no'}`,
      `    rows         ${summary.rowsReturned} returned / ${summary.outerRowsScanned} scanned by the ordering path`,
      `    thumbnail    ${summary.subplanLoops} subquery loops / ${summary.subplanRowsScanned} rows`,
      `    buffers      ${summary.sharedHit} hit / ${summary.sharedRead} read`,
      `    timing       plan ${summary.planningMs} ms · exec ${summary.executionMs} ms`,
      `    verdict      ${verdict.accepted ? 'ACCEPTED' : 'UNACCEPTABLE'} — ${verdict.reason}`,
    ].join('\n'),
  );
}

async function main() {
  const name = containerName(process.pid);
  let started = false;
  try {
    console.log(`[explain-q01] starting disposable PostgreSQL (${name})`);
    await docker(runArgs(name));
    started = true;
    const port = parsePublishedPort((await docker(portArgs(name))).stdout);
    console.log(`[explain-q01] listening on ${databaseUrl(port)}`);
    await waitForReady(name);

    const applied = await applyMigrations(name);
    console.log(`[explain-q01] applied ${applied} migrations`);

    for (const statement of seedStatements()) {
      await psql(name, [statement]);
    }
    const counts = (
      await psql(name, [
        "select status || '=' || count(*) from products group by status order by 1",
      ])
    )
      .trim()
      .split('\n')
      .join(' · ');
    const version = (await psql(name, ['select version()'])).trim();
    console.log(`[explain-q01] fixture: ${counts}`);
    console.log(`[explain-q01] ${version}`);

    const filteredAfter = await cursorAfterFirstPage(name, {
      categorySlug: FIXTURE.skewedCategorySlug,
    });
    const unfilteredAfter = await cursorAfterFirstPage(name, {});

    console.log('\n[explain-q01] EXPLAIN (ANALYZE, BUFFERS) — planner default\n');
    let unacceptable = 0;
    for (const scenario of scenarios({ filteredAfter, unfilteredAfter })) {
      const summary = await capture(name, scenario.statement);
      const verdict = accessPathVerdict(summary);
      if (!verdict.accepted) unacceptable += 1;
      report(scenario.ref, scenario.form, scenario.page, summary, verdict);
    }

    console.log('\n[explain-q01] structural probe — enable_seqscan = off\n');
    for (const [ref, options] of [
      ['Q01-P1 unfiltered', {}],
      ['Q01-P2 category-filtered', { categorySlug: FIXTURE.skewedCategorySlug }],
    ]) {
      const summary = await capture(name, listStatement(options), { noSeqScan: true });
      console.log(
        `  ${ref}\n    ordering     ${summary.outerNodes.join(' → ')}\n    index        ${
          summary.indexes.join(', ') || '(none)'
        }\n    sort node    ${summary.hasSort ? 'yes' : 'no'}`,
      );
    }

    const reference = await capture(name, categoryConstantStatement(CANONICAL_CATEGORIES[0].id), {
      noSeqScan: true,
    });
    console.log(
      `\n[explain-q01] reference form — category_id constant (NOT the delivered query)\n  Q01-P3\n    ordering     ${reference.outerNodes.join(
        ' → ',
      )}\n    index        ${reference.indexes.join(', ') || '(none)'}\n    sort node    ${
        reference.hasSort ? 'yes' : 'no'
      }`,
    );

    if (unacceptable > 0) {
      console.error(`\n[explain-q01] ${unacceptable} unacceptable plan(s)`);
      process.exitCode = 1;
      return;
    }
    console.log('\n[explain-q01] all four Q-01 access paths accepted');
  } finally {
    if (started) {
      await docker(removeArgs(name)).catch(() => undefined);
      console.log(`[explain-q01] removed ${name}`);
    }
  }
}

main().catch((error) => {
  console.error(`[explain-q01] failed: ${error.message}`);
  process.exitCode = 1;
});
