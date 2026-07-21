#!/usr/bin/env node
/**
 * DB10-CP3 — point-in-time-recovery rehearsal.
 *
 * Proves PITR as a *mechanism* on a throwaway PostgreSQL, never by touching
 * the shared dev instance (DEC-DB10-005). The scenario is the canonical one:
 *
 *   1. start a primary with WAL archiving on;
 *   2. take a base backup;
 *   3. transaction A, then record a recovery target time;
 *   4. transaction B (after the target);
 *   5. archive the current segment and stop generating;
 *   6. recover a fresh instance from the base + archived WAL to the target;
 *   7. assert A is present and B is absent.
 *
 * The whole thing runs inside one disposable container using two data
 * directories and two postmasters on different ports — the primary on 5432,
 * the recovered instance on 5433 — so the archive is a plain shared
 * directory and no cross-container plumbing is needed. Everything is torn
 * down at the end, pass or fail.
 *
 * Usage: node tools/db-pitr-rehearsal.mjs [--keep]
 * Exit:  0 rehearsal proved PITR · 1 rehearsal failed · 2 setup error
 */
import { execFileSync, spawnSync } from 'node:child_process';
import process from 'node:process';

const KEEP = process.argv.includes('--keep');
const IMAGE = 'postgres:16.14-alpine';
const CONTAINER = `embroidery-pitr-${process.pid}`;
const ROLE = 'embroidery';
const DB = 'embroidery';
// Under the postgres-owned home so both postmasters and pg_basebackup can
// write here without a root-owned parent getting in the way.
const HOME = '/var/lib/postgresql';
const ARCHIVE = `${HOME}/archive`;
const BASE = `${HOME}/base`;
const RECOVERY = `${HOME}/recovery`;

function log(message) {
  console.log(`[pitr] ${message}`);
}

/** Runs a host command, returning trimmed stdout; throws on failure. */
function host(cmd, args, options = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...options }).trim();
}

/** Runs a command inside the container as a chosen user. */
function inside(user, argv) {
  return host('docker', ['exec', '-u', user, CONTAINER, ...argv]);
}

/** `psql -tAc` against one of the two instances. */
function psql(port, statement) {
  return inside('postgres', [
    'psql',
    '-p',
    String(port),
    '-h',
    '/var/run/postgresql',
    '-U',
    ROLE,
    '-d',
    DB,
    '-tAc',
    statement,
  ]);
}

function containerRunning() {
  const out = spawnSync('docker', ['ps', '-q', '-f', `name=^${CONTAINER}$`], { encoding: 'utf8' });
  return (out.stdout ?? '').trim() !== '';
}

function teardown() {
  if (KEEP) {
    log(`--keep: leaving container ${CONTAINER} up for inspection.`);
    return;
  }
  spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' });
}

function startPrimary() {
  log(`starting disposable primary (${IMAGE}) with archiving on`);
  host('docker', [
    'run',
    '-d',
    '--name',
    CONTAINER,
    '-e',
    `POSTGRES_USER=${ROLE}`,
    '-e',
    'POSTGRES_PASSWORD=pitr_rehearsal_only',
    '-e',
    `POSTGRES_DB=${DB}`,
    '-e',
    'POSTGRES_INITDB_ARGS=--locale=C --encoding=UTF8',
    IMAGE,
    '-c',
    'wal_level=replica',
    '-c',
    'archive_mode=on',
    // `test ! -f` makes the command idempotent, the shape the docs recommend.
    '-c',
    `archive_command=test ! -f ${ARCHIVE}/%f && cp %p ${ARCHIVE}/%f`,
    '-c',
    'max_wal_senders=3',
  ]);

  waitReady(5432);

  // The archive directory must exist and be writable before the first
  // segment is archived. Archiving retries on failure, so creating it a
  // moment after boot loses nothing. It lives under the postgres-owned home,
  // so no chown is needed.
  inside('postgres', ['mkdir', '-p', ARCHIVE]);
}

function waitReady(port) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync(
      'docker',
      ['exec', '-u', 'postgres', CONTAINER, 'pg_isready', '-p', String(port), '-U', ROLE],
      { encoding: 'utf8' },
    );
    if ((probe.stdout ?? '').includes('accepting connections')) {
      return;
    }
    execFileSync('docker', ['exec', CONTAINER, 'sleep', '1']);
  }
  throw new Error(`instance on port ${port} never became ready`);
}

function run() {
  startPrimary();

  // A probe table, present in the base backup so recovery has somewhere to
  // land the replayed rows.
  psql(
    5432,
    'create table pitr_probe (id int primary key, label text, at timestamptz default now())',
  );

  log('taking base backup');
  inside('postgres', [
    'pg_basebackup',
    '-h',
    '/var/run/postgresql',
    '-U',
    ROLE,
    '-D',
    BASE,
    '-X',
    'stream',
    '-c',
    'fast',
  ]);

  // Transaction A, then the recovery target, then transaction B. A short
  // sleep separates the timestamps so the target unambiguously falls between
  // them.
  psql(5432, "insert into pitr_probe (id, label) values (1, 'A-before-target')");
  const target = psql(5432, 'select clock_timestamp()');
  log(`recovery target time: ${target}`);
  execFileSync('docker', ['exec', CONTAINER, 'sleep', '2']);
  psql(5432, "insert into pitr_probe (id, label) values (2, 'B-after-target')");

  // Force the current segment to be archived, then a checkpoint, so every
  // change up to the target is safely in the archive.
  psql(5432, 'select pg_switch_wal()');
  psql(5432, 'checkpoint');
  execFileSync('docker', ['exec', CONTAINER, 'sleep', '2']);

  const archived = inside('postgres', ['sh', '-c', `ls -1 ${ARCHIVE} | wc -l`]);
  log(`archived WAL segments: ${archived}`);

  log('preparing recovery instance');
  inside('postgres', ['cp', '-r', BASE, RECOVERY]);
  inside('postgres', ['sh', '-c', `chmod 700 ${RECOVERY}`]);
  inside('postgres', ['touch', `${RECOVERY}/recovery.signal`]);
  inside('postgres', [
    'sh',
    '-c',
    `cat >> ${RECOVERY}/postgresql.auto.conf <<'CONF'
restore_command = 'cp ${ARCHIVE}/%f %p'
recovery_target_time = '${target}'
recovery_target_action = 'promote'
recovery_target_inclusive = on
CONF`,
  ]);

  log('starting recovery to the target time');
  inside('postgres', ['pg_ctl', '-D', RECOVERY, '-o', '-p 5433', '-w', '-t', '120', 'start']);
  waitReady(5433);

  const rows = psql(5433, 'select label from pitr_probe order by id');
  const recovered = rows === '' ? [] : rows.split('\n').map((line) => line.trim());
  log(`recovered rows: [${recovered.join(', ')}]`);

  const inRecoveryMode = psql(5433, 'select pg_is_in_recovery()');
  const probeCount = psql(5433, 'select count(*) from pitr_probe');

  const aPresent = recovered.includes('A-before-target');
  const bAbsent = !recovered.includes('B-after-target');

  inside('postgres', ['pg_ctl', '-D', RECOVERY, '-m', 'fast', 'stop']).trim?.();

  if (aPresent && bAbsent && recovered.length === 1) {
    log('PASS — the transaction before the target survived; the one after it did not.');
    log(`recovered table row count: ${probeCount}; in-recovery after promote: ${inRecoveryMode}`);
    return 0;
  }
  log('FAIL — recovery did not stop cleanly at the target.');
  log(`A present: ${aPresent}, B absent: ${bAbsent}, rows: ${recovered.length}`);
  return 1;
}

let code = 2;
try {
  code = run();
} catch (error) {
  log(`setup error: ${error.message}`);
  if (containerRunning()) {
    const tail = spawnSync('docker', ['logs', '--tail', '20', CONTAINER], { encoding: 'utf8' });
    log(`container log tail:\n${tail.stdout ?? ''}${tail.stderr ?? ''}`);
  }
  code = 2;
} finally {
  teardown();
}
process.exit(code);
