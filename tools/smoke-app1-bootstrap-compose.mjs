#!/usr/bin/env node
/**
 * APP1-A01-C2 — real, isolated Compose evidence for the staff-bootstrap
 * environment policy (dev-fail / prod-skip / reuse / unknown-env).
 *
 * Every case runs in a throwaway Compose project (`docker-compose.smoke.yml`
 * override): a unique project name, an isolated network, and a project-prefixed
 * Postgres volume, publishing NO host ports. The persistent `embroidery-dev`
 * stack and its database are never touched. Each project is torn down with
 * `down --volumes --remove-orphans` in `finally`, so nothing is left behind.
 *
 * This harness only ORCHESTRATES and INSPECTS — it never re-implements bootstrap
 * business logic. Secrets are generated at runtime and never printed; only
 * result statuses, exit codes, row counts and variable NAMES are reported.
 *
 *   node tools/smoke-app1-bootstrap-compose.mjs
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEV_FILE = join(REPO_ROOT, 'infrastructure', 'compose', 'docker-compose.dev.yml');
const SMOKE_FILE = join(REPO_ROOT, 'infrastructure', 'compose', 'docker-compose.smoke.yml');
const SAFE_EMAIL = 'admin@example.test';
const WAIT_TIMEOUT = '240';

// --- pure helpers (unit-tested in smoke-app1-bootstrap-compose.test.mjs) ------

/** A deterministic, collision-resistant project name for one smoke case. */
export function uniqueProjectName(label, seed) {
  return `embroidery-a01c2-${label}-${seed}`;
}

/** Base `docker compose` args for a project (files + env file). */
export function composeArgs(files, envFile) {
  return ['compose', '--env-file', envFile, ...files.flatMap((f) => ['-f', f])];
}

/** Teardown args that remove containers, networks AND the isolated volume. */
export function cleanupArgs(files, envFile) {
  return [...composeArgs(files, envFile), 'down', '--volumes', '--remove-orphans'];
}

/** The single machine-parseable `result=` status emitted by the CLI, or null. */
export function parseBootstrapResult(text) {
  const match = /result=([A-Z_]+)/.exec(text);
  return match ? match[1] : null;
}

/** Replaces every provided secret occurrence with a redaction marker. */
export function redactSecrets(text, secrets) {
  let out = text;
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join('<redacted>');
  }
  return out;
}

/** Deterministic `.env` file content from an ordered variable map. */
export function envFileContent(vars) {
  return Object.entries(vars)
    .map(([k, v]) => `${k}=${v ?? ''}`)
    .join('\n');
}

// --- orchestration -----------------------------------------------------------

const SECRETS = [];
function run(args, opts = {}) {
  const res = spawnSync('docker', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...opts,
  });
  const stdout = redactSecrets(res.stdout ?? '', SECRETS);
  const stderr = redactSecrets(res.stderr ?? '', SECRETS);
  return { status: res.status ?? 1, stdout, stderr, combined: `${stdout}\n${stderr}` };
}

function writeEnv(dir, vars) {
  const file = join(dir, 'smoke.env');
  writeFileSync(file, envFileContent(vars), 'utf8');
  return file;
}

function project(label) {
  const seed = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
  return uniqueProjectName(label, seed);
}

function baseVars(name, nodeEnv, bootstrap) {
  return {
    SMOKE_PROJECT: name,
    SMOKE_STAFF_NODE_ENV: nodeEnv,
    POSTGRES_USER: 'embroidery',
    POSTGRES_PASSWORD: 'smoke_dev_password',
    POSTGRES_DB: 'embroidery_smoke',
    STAFF_BOOTSTRAP_EMAIL: bootstrap.email ?? '',
    STAFF_BOOTSTRAP_PASSWORD: bootstrap.password ?? '',
    STAFF_BOOTSTRAP_DISPLAY_NAME: bootstrap.displayName ?? '',
  };
}

/** Row counts in the isolated database (0/0 before any bootstrap succeeds). */
function dbCounts(name) {
  const q = (sql) => {
    const r = run([
      'exec',
      `${name}-postgres-1`,
      'psql',
      '-U',
      'embroidery',
      '-d',
      'embroidery_smoke',
      '-t',
      '-A',
      '-c',
      sql,
    ]);
    return r.status === 0 ? r.stdout.trim() : `err(${r.status})`;
  };
  return {
    admins: q('select count(*) from admin_accounts;'),
    credentials: q('select count(*) from admin_credentials;'),
    credentialFingerprint: q(
      "select coalesce(md5(string_agg(credential_reference, '|' order by id)), 'none') from admin_credentials;",
    ),
  };
}

const results = [];
function record(label, ok, detail) {
  results.push({ label, ok, detail });
  const line = redactSecrets(
    `[${ok ? 'PASS' : 'FAIL'}] ${label} :: ${JSON.stringify(detail)}`,
    SECRETS,
  );
  console.log(line);
}

/** dev missing-env + partial, via a full `up --wait admin` readiness gate. */
function devFailureCase() {
  const name = project('devfail');
  const dir = mkdtempSync(join(tmpdir(), 'a01c2-'));
  const files = [DEV_FILE, SMOKE_FILE];
  const env = writeEnv(
    dir,
    baseVars(name, 'development', { email: SAFE_EMAIL, displayName: 'Operator' }),
  );
  try {
    const up = run([
      ...composeArgs(files, env),
      'up',
      '-d',
      '--wait',
      '--wait-timeout',
      WAIT_TIMEOUT,
      'admin',
    ]);
    const bootstrap = run([...composeArgs(files, env), 'ps', '-a', '--format', 'json']);
    const bootExit = run(['inspect', '-f', '{{.State.ExitCode}}', `${name}-staff-bootstrap-1`]);
    const logs = run([...composeArgs(files, env), 'logs', 'staff-bootstrap']);
    const counts = dbCounts(name);
    const adminUp = run(['inspect', '-f', '{{.State.Running}}', `${name}-admin-1`]);
    const ok =
      up.status !== 0 &&
      bootExit.stdout.trim() !== '0' &&
      parseBootstrapResult(logs.combined) === 'FAILED_MISSING_ENV_DEVELOPMENT' &&
      counts.admins === '0' &&
      adminUp.stdout.trim() !== 'true';
    record('dev-missing-env (readiness gate)', ok, {
      upExit: up.status,
      bootstrapExit: bootExit.stdout.trim(),
      result: parseBootstrapResult(logs.combined),
      admins: counts.admins,
      credentials: counts.credentials,
      adminRunning: adminUp.stdout.trim(),
    });

    // partial-missing (email + display present, password missing) via `run`.
    const partial = run([
      ...composeArgs(files, env),
      'run',
      '--rm',
      '--no-deps',
      'staff-bootstrap',
    ]);
    const partialCounts = dbCounts(name);
    record(
      'dev-partial-missing (password)',
      partial.status !== 0 &&
        parseBootstrapResult(partial.combined) === 'FAILED_MISSING_ENV_DEVELOPMENT' &&
        partialCounts.admins === '0',
      {
        exit: partial.status,
        result: parseBootstrapResult(partial.combined),
        admins: partialCounts.admins,
      },
    );
    void bootstrap;
  } finally {
    run(cleanupArgs(files, env));
    rmSync(dir, { recursive: true, force: true });
  }
}

/** dev create + reuse on one isolated project (readiness succeeds). */
function devSuccessCase() {
  const name = project('devok');
  const dir = mkdtempSync(join(tmpdir(), 'a01c2-'));
  const files = [DEV_FILE, SMOKE_FILE];
  const password = `Smoke-${randomBytes(9).toString('hex')}`;
  SECRETS.push(password);
  const env = writeEnv(
    dir,
    baseVars(name, 'development', { email: SAFE_EMAIL, password, displayName: 'Operator' }),
  );
  try {
    // Bring up an isolated migrated schema, then CREATE via a `run` container so
    // the machine-parseable `result=` line is captured from its own stdout.
    run([
      ...composeArgs(files, env),
      'up',
      '-d',
      '--wait',
      '--wait-timeout',
      WAIT_TIMEOUT,
      'postgres',
    ]);
    run([...composeArgs(files, env), 'run', '--rm', '--no-deps', 'db-migrate']);
    const create = run([...composeArgs(files, env), 'run', '--rm', '--no-deps', 'staff-bootstrap']);
    const created = dbCounts(name);

    // Prove dependent readiness succeeds: `up --wait admin` runs the bootstrap
    // dependency (now REUSED) and starts the Admin, returning zero when healthy.
    const up = run([
      ...composeArgs(files, env),
      'up',
      '-d',
      '--wait',
      '--wait-timeout',
      WAIT_TIMEOUT,
      'admin',
    ]);
    const adminUp = run(['inspect', '-f', '{{.State.Running}}', `${name}-admin-1`]);
    record(
      'dev-create + readiness gate',
      create.status === 0 &&
        parseBootstrapResult(create.combined) === 'CREATED' &&
        created.admins === '1' &&
        created.credentials === '1' &&
        up.status === 0 &&
        adminUp.stdout.trim() === 'true',
      {
        createExit: create.status,
        result: parseBootstrapResult(create.combined),
        admins: created.admins,
        credentials: created.credentials,
        upExit: up.status,
        adminRunning: adminUp.stdout.trim(),
      },
    );

    const reuse = run([...composeArgs(files, env), 'run', '--rm', '--no-deps', 'staff-bootstrap']);
    const reused = dbCounts(name);
    record(
      'dev-reuse',
      reuse.status === 0 &&
        parseBootstrapResult(reuse.combined) === 'REUSED_EXISTING' &&
        reused.admins === '1' &&
        reused.credentials === '1' &&
        reused.credentialFingerprint === created.credentialFingerprint,
      {
        exit: reuse.status,
        result: parseBootstrapResult(reuse.combined),
        admins: reused.admins,
        credentials: reused.credentials,
        credentialHashUnchanged: reused.credentialFingerprint === created.credentialFingerprint,
      },
    );
  } finally {
    run(cleanupArgs(files, env));
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A `run` bootstrap case after bringing up postgres + db-migrate only. */
function runBootstrapCase({ label, nodeEnv, bootstrap, expectStatus, expectExitZero }) {
  const name = project(label);
  const dir = mkdtempSync(join(tmpdir(), 'a01c2-'));
  const files = [DEV_FILE, SMOKE_FILE];
  if (bootstrap.password) SECRETS.push(bootstrap.password);
  const env = writeEnv(dir, baseVars(name, nodeEnv, bootstrap));
  try {
    // Isolated schema so the "no mutation" assertion can query real tables.
    run([
      ...composeArgs(files, env),
      'up',
      '-d',
      '--wait',
      '--wait-timeout',
      WAIT_TIMEOUT,
      'postgres',
    ]);
    run([...composeArgs(files, env), 'run', '--rm', '--no-deps', 'db-migrate']);
    const boot = run([...composeArgs(files, env), 'run', '--rm', '--no-deps', 'staff-bootstrap']);
    const counts = dbCounts(name);
    const exitOk = expectExitZero ? boot.status === 0 : boot.status !== 0;
    record(
      label,
      exitOk && parseBootstrapResult(boot.combined) === expectStatus && counts.admins === '0',
      {
        exit: boot.status,
        result: parseBootstrapResult(boot.combined),
        admins: counts.admins,
        credentials: counts.credentials,
      },
    );
  } finally {
    run(cleanupArgs(files, env));
    rmSync(dir, { recursive: true, force: true });
  }
}

function residueCheck() {
  const ls = run(['ps', '-a', '--filter', 'name=embroidery-a01c2', '--format', '{{.Names}}']);
  const vols = run(['volume', 'ls', '--filter', 'name=embroidery-a01c2', '--format', '{{.Name}}']);
  const nets = run(['network', 'ls', '--filter', 'name=embroidery-a01c2', '--format', '{{.Name}}']);
  const devStack = run(['ps', '--filter', 'name=embroidery-dev', '--format', '{{.Names}}']);
  const clean = !ls.stdout.trim() && !vols.stdout.trim() && !nets.stdout.trim();
  record('residue-cleanup', clean, {
    residualContainers: ls.stdout.trim().split('\n').filter(Boolean).length,
    residualVolumes: vols.stdout.trim().split('\n').filter(Boolean).length,
    residualNetworks: nets.stdout.trim().split('\n').filter(Boolean).length,
    normalDevStackContainers: devStack.stdout.trim().split('\n').filter(Boolean).length,
  });
}

function main() {
  console.log('== APP1-A01-C2 isolated Compose bootstrap-policy smoke ==');
  devFailureCase();
  devSuccessCase();
  runBootstrapCase({
    label: 'prod-missing-env',
    nodeEnv: 'production',
    bootstrap: {},
    expectStatus: 'SKIPPED_MISSING_ENV_PRODUCTION',
    expectExitZero: true,
  });
  runBootstrapCase({
    label: 'prod-partial-missing',
    nodeEnv: 'production',
    bootstrap: { email: SAFE_EMAIL, displayName: 'Operator' },
    expectStatus: 'SKIPPED_MISSING_ENV_PRODUCTION',
    expectExitZero: true,
  });
  runBootstrapCase({
    label: 'unknown-env',
    nodeEnv: 'staging',
    bootstrap: {
      email: SAFE_EMAIL,
      password: `Smoke-${randomBytes(9).toString('hex')}`,
      displayName: 'Operator',
    },
    expectStatus: 'FAILED_BOOTSTRAP',
    expectExitZero: false,
  });
  residueCheck();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n== summary: ${results.length - failed.length}/${results.length} passed ==`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
