#!/usr/bin/env node
/**
 * APP2-A04-C1 — real, isolated production-runtime evidence for the Admin
 * Product publication interaction (APP2-A04).
 *
 * WHY THIS EXISTS
 * ---------------
 * A04 proved `next build` succeeds and then reviewed the screens against the
 * *development* server. A green build plus a dev-mode review cannot show
 * production startup, production route serving, hashed asset delivery, direct
 * hard refresh, or gateway-to-production upstream behaviour. This harness
 * closes that gap.
 *
 * ISOLATION MODEL
 * ---------------
 * The production runtime is an ephemeral IMAGE built from the canonical
 * `admin.Dockerfile` `runner` stage. `.dockerignore` excludes `**\/.next`, so
 * `next build` runs entirely inside an image layer: the workspace `.next` is
 * neither read nor written, and the running dev container's own
 * `/app/apps/admin/.next/dev` is untouched. No tracked Nginx or Compose file
 * changes — the service swap is a Compose override written to a temp directory
 * for the duration of the run and deleted afterwards.
 *
 * The override targets the SAME Compose project, so the gateway keeps proxying
 * its `admin` upstream by service name and that name now resolves to the
 * production container. That is what makes this a gateway proof rather than a
 * host-port proof.
 *
 * CREDENTIALS
 * -----------
 * This harness never reads the repository `.env` for a secret value and never
 * puts one on a command line (see CLAUDE.md §8a, docs/09 §9a). The operator
 * supplies the Admin login through `SMOKE_ADMIN_EMAIL` / `SMOKE_ADMIN_PASSWORD`
 * in the environment of this process only; they reach Playwright through a
 * child-process environment and are redacted from every line this tool prints.
 *
 *   SMOKE_ADMIN_EMAIL=... SMOKE_ADMIN_PASSWORD=... node tools/smoke-app2-publication-production.mjs
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEV_FILE = join(REPO_ROOT, 'infrastructure', 'compose', 'docker-compose.dev.yml');
const BROWSER_SCRIPT = join(REPO_ROOT, 'tools', 'smoke-app2-publication-browser.mjs');

/** The canonical gateway host for the Admin console. */
export const GATEWAY_ADMIN_HOST = 'admin.embroidery.local';
/** The Compose project the developer's stack runs under. */
export const DEV_PROJECT = 'embroidery-dev';
/** The dev server's own build output, inside the container. Never touched. */
export const ACTIVE_DEV_NEXT = '/app/apps/admin/.next/dev';
/** Bounded waits — a hung container must fail the run, never park it. */
export const BUILD_TIMEOUT_MS = 900_000;
export const WAIT_TIMEOUT_SECONDS = '240';

// --- pure helpers (unit-tested in smoke-app2-publication-production.test.mjs) --

/** A collision-resistant tag for one run's throwaway production image. */
export function productionImageTag(seed) {
  return `embroidery-a04c1-admin-prod:${seed}`;
}

/** Base `docker compose` args for the dev project plus any override files. */
export function composeArgs(files, envFile) {
  return ['compose', '--env-file', envFile, ...files.flatMap((f) => ['-f', f])];
}

/**
 * The temporary override that swaps the dev Admin for the prebuilt production
 * image. `!reset` clears the base `build` and `volumes` keys, so the container
 * runs the immutable image and NOT the bind-mounted working tree — that is what
 * makes the runtime genuinely production rather than dev sources in disguise.
 */
export function productionOverrideYaml(imageTag) {
  return [
    `name: ${DEV_PROJECT}`,
    'services:',
    '  admin:',
    `    image: ${imageTag}`,
    '    build: !reset null',
    '    volumes: !reset []',
    '    environment:',
    '      NODE_ENV: production',
    '      NEXT_PUBLIC_API_BASE_PATH: /api',
    '      INTERNAL_API_BASE_URL: http://api:4000/api',
    '',
  ].join('\n');
}

/** Args that restore the developer's Admin service from the dev file alone. */
export function restoreArgs(envFile) {
  return [
    ...composeArgs([DEV_FILE], envFile),
    'up',
    '-d',
    '--force-recreate',
    '--no-deps',
    'admin',
  ];
}

/** Args that delete the run's throwaway image. */
export function removeImageArgs(imageTag) {
  return ['image', 'rm', '-f', imageTag];
}

/** Replaces every supplied secret occurrence with a redaction marker. */
export function redactSecrets(text, secrets) {
  let out = text;
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join('<redacted>');
  }
  return out;
}

/**
 * True when no supplied secret appears in an argument vector. Command-line
 * arguments are visible in process listings and shell history, so a credential
 * must reach a child through its environment instead.
 */
export function argsAreCredentialFree(args, secrets) {
  return !args.some((arg) => secrets.some((secret) => secret && String(arg).includes(secret)));
}

/**
 * The production build target is isolated only because the build context
 * excludes build output. Verified at runtime rather than assumed, so a future
 * edit to `.dockerignore` fails this harness instead of silently reintroducing
 * the collision the correction was raised for.
 */
export function dockerignoreIsolatesNext(dockerignoreText) {
  return dockerignoreText
    .split('\n')
    .map((line) => line.trim())
    .includes('**/.next');
}

/** The URL a scenario probes, always through the gateway host. */
export function gatewayUrl(path) {
  return `http://${GATEWAY_ADMIN_HOST}${path}`;
}

/**
 * Classifies a running Admin container as the production or the development
 * runtime from non-secret runtime facts alone. The standalone server is started
 * as `node apps/admin/server.js`; the dev server runs Next's dev command.
 */
export function classifyAdminRuntime({ command, nodeEnv }) {
  const cmd = String(command ?? '');
  if (cmd.includes('server.js') && nodeEnv === 'production') return 'production';
  if (cmd.includes('dev')) return 'development';
  return 'unknown';
}

/** Ordered phase plan. Cleanup and restore are structural, not conditional. */
export function phasePlan() {
  return ['verify-isolation', 'build-image', 'swap-upstream', 'smoke', 'restore', 'cleanup'];
}

/**
 * The teardown steps, derived from what the run actually changed rather than
 * from whether it succeeded. The `finally` block executes exactly this plan, so
 * a failed smoke tears down along the same path a successful one does — the
 * developer's Admin never stays swapped because an assertion threw.
 */
export function cleanupPlan({ swapped, imageTag, envFile }) {
  const plan = [];
  if (swapped) plan.push({ step: 'restore-dev-admin', args: restoreArgs(envFile) });
  plan.push({ step: 'remove-image', args: removeImageArgs(imageTag) });
  return plan;
}

// --- orchestration -----------------------------------------------------------

const SECRETS = [];
const results = [];

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

function record(label, ok, detail) {
  results.push({ label, ok, detail });
  console.log(
    redactSecrets(`[${ok ? 'PASS' : 'FAIL'}] ${label} :: ${JSON.stringify(detail)}`, SECRETS),
  );
}

/** Probes a path through the gateway, resolving the host to the local edge. */
function probe(path, extraArgs = []) {
  const res = spawnSync(
    'curl',
    [
      '-s',
      '-o',
      '/dev/null',
      '-w',
      '%{http_code}',
      '-H',
      `Host: ${GATEWAY_ADMIN_HOST}`,
      ...extraArgs,
      `http://127.0.0.1${path}`,
    ],
    { encoding: 'utf8' },
  );
  return (res.stdout ?? '').trim();
}

/**
 * Polls a gateway path until it answers as expected, or the bound elapses.
 * The restored dev server recompiles on first request, so probing it the instant
 * the container starts reports a 502 that says nothing about the stack's health.
 */
function waitForGateway(path, expected, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let code = '';
  while (Date.now() < deadline) {
    code = probe(path);
    if (code === expected) return code;
    // Synchronous sleep — this whole harness is spawnSync-based orchestration.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
  }
  return code;
}

function adminRuntimeFacts() {
  const container = `${DEV_PROJECT}-admin-1`;
  const command = run(['inspect', '-f', '{{join .Config.Cmd " "}}', container]).stdout.trim();
  const image = run(['inspect', '-f', '{{.Config.Image}}', container]).stdout.trim();
  const nodeEnv = run(['exec', container, 'printenv', 'NODE_ENV']).stdout.trim();
  return { command, image, nodeEnv, kind: classifyAdminRuntime({ command, nodeEnv }) };
}

function main() {
  const email = process.env.SMOKE_ADMIN_EMAIL ?? '';
  const password = process.env.SMOKE_ADMIN_PASSWORD ?? '';
  if (!email || !password) {
    console.error(
      'Missing SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD. Supply them in this process\n' +
        'environment for this run only. This harness never reads them from .env.',
    );
    process.exitCode = 2;
    return;
  }
  SECRETS.push(password);

  const seed = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
  const imageTag = productionImageTag(seed);
  const dir = mkdtempSync(join(tmpdir(), 'a04c1-'));
  const overrideFile = join(dir, 'production-admin.yml');
  const envFile = join(REPO_ROOT, '.env');
  let swapped = false;

  console.log('== APP2-A04-C1 isolated production publication smoke ==');

  try {
    // 1. Isolation precondition — the build context must exclude build output.
    const ignoreText = readFileSync(join(REPO_ROOT, '.dockerignore'), 'utf8');
    record('isolation: build context excludes .next', dockerignoreIsolatesNext(ignoreText), {
      activeDevNext: ACTIVE_DEV_NEXT,
      workspaceNextEnteringContext: false,
    });

    // 2. Build the throwaway production image (build happens inside the image).
    const build = run(
      [
        'build',
        '-f',
        join(REPO_ROOT, 'infrastructure', 'docker', 'admin.Dockerfile'),
        '--target',
        'runner',
        '-t',
        imageTag,
        REPO_ROOT,
      ],
      { timeout: BUILD_TIMEOUT_MS },
    );
    record('production image built', build.status === 0, { tag: imageTag, exit: build.status });
    if (build.status !== 0) throw new Error(`production image build failed (${build.status})`);

    // 3. Swap the gateway's `admin` upstream to the production container.
    writeFileSync(overrideFile, productionOverrideYaml(imageTag), 'utf8');
    const files = [DEV_FILE, overrideFile];
    const up = run([
      ...composeArgs(files, envFile),
      'up',
      '-d',
      '--wait',
      '--wait-timeout',
      WAIT_TIMEOUT_SECONDS,
      '--no-deps',
      'admin',
    ]);
    swapped = true;
    const facts = adminRuntimeFacts();
    record(
      'gateway upstream is the production runtime',
      up.status === 0 && facts.kind === 'production',
      {
        upExit: up.status,
        runtime: facts.kind,
        nodeEnv: facts.nodeEnv,
        image: facts.image,
      },
    );

    // 4. Production route serving through the real gateway.
    for (const [label, path, expected] of [
      ['healthz', '/healthz', '200'],
      ['login', '/login', '200'],
      ['unauthenticated /products redirects', '/products', '307'],
    ]) {
      const code = probe(path);
      record(`production route: ${label}`, code === expected, { path, code, expected });
    }

    // 5. Browser scenarios — credentials travel by child environment, never argv.
    const browserArgs = [BROWSER_SCRIPT];
    record(
      'credentials absent from browser arguments',
      argsAreCredentialFree(browserArgs, SECRETS),
      {
        argc: browserArgs.length,
      },
    );
    const browser = spawnSync(process.execPath, browserArgs, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: {
        ...process.env,
        SMOKE_ADMIN_EMAIL: email,
        SMOKE_ADMIN_PASSWORD: password,
        SMOKE_BASE_URL: gatewayUrl(''),
      },
    });
    console.log(redactSecrets(browser.stdout ?? '', SECRETS));
    if (browser.stderr) console.error(redactSecrets(browser.stderr, SECRETS));
    record('browser scenarios', browser.status === 0, { exit: browser.status ?? 1 });
  } finally {
    // Restore and cleanup are structural: they run after success AND failure,
    // driven by the same plan the Docker-free tests assert against.
    for (const { step, args } of cleanupPlan({ swapped, imageTag, envFile })) {
      const res = run(args);
      if (step === 'restore-dev-admin') {
        const facts = adminRuntimeFacts();
        record('dev Admin restored', res.status === 0 && facts.kind === 'development', {
          exit: res.status,
          runtime: facts.kind,
        });
        const health = waitForGateway('/healthz', '200');
        const login = waitForGateway('/login', '200');
        record('dev stack healthy after restore', health === '200' && login === '200', {
          healthz: health,
          login,
        });
      }
    }
    rmSync(dir, { recursive: true, force: true });
    const residual = run(['images', '--filter', 'reference=embroidery-a04c1-admin-prod', '-q']);
    record('no temporary residue', !residual.stdout.trim(), {
      residualImages: residual.stdout.trim().split('\n').filter(Boolean).length,
    });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n== summary: ${results.length - failed.length}/${results.length} passed ==`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
