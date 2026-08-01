/**
 * `APP2-T01-C1` — the production topology, expressed as pure functions.
 *
 * Everything that decides *what* the swap does — the image tag, the Compose
 * override, the restore, the gateway reload, how a running container is
 * classified as production or development, and the teardown plan — lives here
 * with no Docker call in sight. That is what lets the Docker-free suite in
 * `smoke-app2-t01-public-media-production.test.mjs` assert the safety
 * properties on every `pnpm test`, not only on a machine with Docker running.
 *
 * The orchestration that executes this plan is
 * `smoke-app2-t01-public-media-production.mjs`.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DEV_FILE = join(REPO_ROOT, 'infrastructure', 'compose', 'docker-compose.dev.yml');
export const API_DOCKERFILE = join(REPO_ROOT, 'infrastructure', 'docker', 'api.Dockerfile');

/** The Compose project the developer's stack runs under. */
export const DEV_PROJECT = 'embroidery-dev';
/** The service alias the committed gateway configuration proxies to. */
export const API_SERVICE = 'api';
export const API_CONTAINER = `${DEV_PROJECT}-${API_SERVICE}-1`;
export const GATEWAY_CONTAINER = `${DEV_PROJECT}-gateway-1`;
export const POSTGRES_CONTAINER = `${DEV_PROJECT}-postgres-1`;
export const MINIO_CONTAINER = `${DEV_PROJECT}-minio-1`;

/**
 * The disposable, TLS-enabled PostgreSQL the production API runs against.
 *
 * Not a preference — a requirement. `packages/database` refuses to start under
 * `NODE_ENV=production` with `DATABASE_SSL_MODE=disable`, and refuses the
 * documented development password. Both guards are correct and neither may be
 * weakened to make a smoke pass, so a genuine production API simply cannot
 * attach to the development database. This sidecar satisfies both: TLS on, and
 * a synthetic password generated per run.
 *
 * It carries a copy of the development database so that `storage_key` values
 * resolve to objects that really exist in the development MinIO, which the
 * production API keeps using unchanged. The developer's own PostgreSQL is read
 * once with `pg_dump` and never written.
 */
export const PROD_DB_SERVICE = 'api-db-t01c1';
export const PROD_DB_CONTAINER = `${DEV_PROJECT}-${PROD_DB_SERVICE}-1`;
export const PROD_DB_USER = 'embroidery';
export const PROD_DB_NAME = 'embroidery';
export const PG_IMAGE_PREFIX = 'embroidery-t01c1-pg-tls';
/** Mirrors the tracked development image exactly; never a floating tag. */
export const POSTGRES_BASE_IMAGE = 'postgres:16.14-alpine';

/** Bounded waits — a hung container must fail the run, never park it. */
export const BUILD_TIMEOUT_MS = 1_200_000;
export const WAIT_TIMEOUT_SECONDS = '240';
export const IMAGE_PREFIX = 'embroidery-t01c1-api-prod';

/** A collision-resistant tag for one run's throwaway production image. */
export function productionImageTag(seed) {
  return `${IMAGE_PREFIX}:${seed}`;
}

/** Base `docker compose` args for the dev project plus any override files. */
export function composeArgs(files, envFile) {
  return ['compose', '--env-file', envFile, ...files.flatMap((file) => ['-f', file])];
}

/** Args that build the throwaway production image from the canonical stage. */
export function buildArgs(imageTag) {
  return ['build', '-f', API_DOCKERFILE, '--target', 'runner', '-t', imageTag, REPO_ROOT];
}

/** A collision-resistant tag for one run's throwaway TLS PostgreSQL image. */
export function pgImageTag(seed) {
  return `${PG_IMAGE_PREFIX}:${seed}`;
}

/**
 * The throwaway PostgreSQL image: the tracked development base plus a
 * self-signed certificate. Built as an image rather than bind-mounted so the
 * key can be owned by `postgres` with 0600 — PostgreSQL refuses to start with a
 * world-readable key, and a Windows bind mount cannot express that.
 *
 * `DATABASE_SSL_MODE=require` encrypts without verifying the chain
 * (`create-database-client.ts`), which is exactly what a self-signed
 * certificate supports. A two-day validity makes the certificate useless
 * outside the run that created it.
 */
export function pgDockerfile() {
  return [
    `FROM ${POSTGRES_BASE_IMAGE}`,
    'RUN apk add --no-cache openssl \\',
    ' && mkdir -p /var/lib/postgresql/tls \\',
    ` && openssl req -new -x509 -days 2 -nodes -subj "/CN=${PROD_DB_SERVICE}" \\`,
    '      -out /var/lib/postgresql/tls/server.crt \\',
    '      -keyout /var/lib/postgresql/tls/server.key \\',
    ' && chown -R postgres:postgres /var/lib/postgresql/tls \\',
    ' && chmod 600 /var/lib/postgresql/tls/server.key',
    'CMD ["postgres", "-c", "ssl=on", \\',
    '     "-c", "ssl_cert_file=/var/lib/postgresql/tls/server.crt", \\',
    '     "-c", "ssl_key_file=/var/lib/postgresql/tls/server.key"]',
    '',
  ].join('\n');
}

/** Args that build the throwaway TLS PostgreSQL image from a temp context. */
export function buildPgArgs(tag, contextDir) {
  return ['build', '-t', tag, contextDir];
}

/** The connection string the production API uses. Synthetic password per run. */
export function productionDatabaseUrl(password) {
  return `postgres://${PROD_DB_USER}:${password}@${PROD_DB_SERVICE}:5432/${PROD_DB_NAME}`;
}

/**
 * The temporary override. Two things happen here.
 *
 * 1. The dev API is swapped for the prebuilt production image. `!reset` clears
 *    the base `build` and `volumes` keys, so the container runs the immutable
 *    image and NOT the bind-mounted `apps/api/src` — that is what makes the
 *    runtime genuinely production rather than dev sources in disguise.
 * 2. The three settings a production runtime demands are supplied: a TLS
 *    database that is not the development one, and the Secure staff cookie.
 *    Every other value (object storage, the staff Origin allow-list, the port)
 *    is inherited from the tracked dev file by Compose's own map merge, so this
 *    override states only what production actually changes.
 *
 * `STAFF_SESSION_COOKIE_SECURE: 'true'` is required for the API to boot at all
 * under `NODE_ENV=production` (`staff-auth.config.ts`). Its side effect is the
 * reason this run seeds fixture state instead of calling publish: a `Secure`
 * `__Host-` cookie is never returned over the plain-HTTP development gateway,
 * so no authenticated Admin operation is reachable on a production API here.
 * The route under test is anonymous and unaffected.
 */
export function productionOverrideYaml({ imageTag, databaseImageTag, databasePassword }) {
  return [
    `name: ${DEV_PROJECT}`,
    'services:',
    `  ${PROD_DB_SERVICE}:`,
    `    image: ${databaseImageTag}`,
    '    environment:',
    `      POSTGRES_USER: ${PROD_DB_USER}`,
    `      POSTGRES_PASSWORD: ${databasePassword}`,
    `      POSTGRES_DB: ${PROD_DB_NAME}`,
    "      POSTGRES_INITDB_ARGS: '--locale=C --encoding=UTF8'",
    '      TZ: UTC',
    '      PGTZ: UTC',
    '    healthcheck:',
    `      test: ['CMD-SHELL', 'pg_isready -U ${PROD_DB_USER} -d ${PROD_DB_NAME}']`,
    '      interval: 5s',
    '      timeout: 5s',
    '      start_period: 10s',
    '      retries: 12',
    '    networks:',
    '      - embroidery',
    `  ${API_SERVICE}:`,
    `    image: ${imageTag}`,
    '    build: !reset null',
    '    volumes: !reset []',
    '    environment:',
    '      NODE_ENV: production',
    `      DATABASE_URL: ${productionDatabaseUrl(databasePassword)}`,
    '      DATABASE_SSL_MODE: require',
    "      STAFF_SESSION_COOKIE_SECURE: 'true'",
    '',
  ].join('\n');
}

/** Args that start the disposable database ahead of the API swap. */
export function databaseUpArgs(files, envFile) {
  return [
    ...composeArgs(files, envFile),
    'up',
    '-d',
    '--wait',
    '--wait-timeout',
    WAIT_TIMEOUT_SECONDS,
    PROD_DB_SERVICE,
  ];
}

/** Reads the development database without writing to it. */
export function dumpArgs(devPostgresContainer) {
  return [
    'exec',
    devPostgresContainer,
    'pg_dump',
    '-U',
    PROD_DB_USER,
    '-d',
    PROD_DB_NAME,
    '--no-owner',
    '--no-privileges',
  ];
}

/** Loads that dump into the disposable database, failing on the first error. */
export function restoreDumpArgs() {
  return [
    'exec',
    '-i',
    PROD_DB_CONTAINER,
    'psql',
    '-U',
    PROD_DB_USER,
    '-d',
    PROD_DB_NAME,
    '-v',
    'ON_ERROR_STOP=1',
    '-q',
  ];
}

/** Args that destroy the disposable database container and its volume. */
export function removeDatabaseArgs() {
  return ['rm', '-f', '-v', PROD_DB_CONTAINER];
}

/** Args that start the production API in place of the development one. */
export function swapArgs(files, envFile) {
  return [
    ...composeArgs(files, envFile),
    'up',
    '-d',
    '--wait',
    '--wait-timeout',
    WAIT_TIMEOUT_SECONDS,
    '--no-deps',
    API_SERVICE,
  ];
}

/**
 * Args that restore the developer's API service from the tracked dev file
 * alone. `--wait` is part of the restore, not a nicety: the gateway reload that
 * follows must re-resolve the name onto a container that is already answering,
 * otherwise the developer is handed back a stack that looks broken.
 */
export function restoreArgs(envFile) {
  return [
    ...composeArgs([DEV_FILE], envFile),
    'up',
    '-d',
    '--wait',
    '--wait-timeout',
    WAIT_TIMEOUT_SECONDS,
    '--force-recreate',
    '--no-deps',
    API_SERVICE,
  ];
}

/** Args that delete the run's throwaway image. */
export function removeImageArgs(imageTag) {
  return ['image', 'rm', '-f', imageTag];
}

/**
 * Reloading Nginx re-resolves the `api` upstream name. `upstream api_upstream
 * { server api:4000; }` has no `resolver`, so Nginx resolves the name once at
 * configuration load and caches it; replacing the container gives it a new
 * address the running gateway would never see, and the whole run would answer
 * 502. This reloads the committed configuration unchanged — it edits nothing.
 */
export function gatewayReloadArgs() {
  return ['exec', GATEWAY_CONTAINER, 'nginx', '-s', 'reload'];
}

/**
 * The production build is isolated only because the build context excludes
 * mutable build output. Verified at runtime rather than assumed, so a future
 * `.dockerignore` edit fails this harness instead of silently letting host
 * `dist/` or `node_modules/` into the image.
 */
export function dockerignoreIsolatesBuildOutput(dockerignoreText) {
  const lines = dockerignoreText.split('\n').map((line) => line.trim());
  return ['**/node_modules', '**/dist'].every((entry) => lines.includes(entry));
}

/** The temporary override must never be written inside the repository. */
export function isOutsideRepository(path, repoRoot) {
  return !resolve(path).startsWith(resolve(repoRoot));
}

/**
 * Classifies a running API container as the production or the development
 * runtime from non-secret runtime facts alone. The production image runs
 * `node dist/main.js` under `NODE_ENV=production` with no bind mount; the dev
 * image runs the pnpm dev script over mounted sources. All three production
 * conditions are required — a green build says nothing about which of these is
 * actually serving the gateway, which is the gap this correction closes.
 */
export function classifyApiRuntime({ command, nodeEnv, mountCount }) {
  const cmd = String(command ?? '');
  if (cmd.includes('dist/main.js') && nodeEnv === 'production' && mountCount === 0) {
    return 'production';
  }
  if (cmd.includes('dev')) return 'development';
  return 'unknown';
}

/** Ordered phase plan. Restore and cleanup are structural, not conditional. */
export function phasePlan() {
  return [
    'verify-dev-stack',
    'verify-isolation',
    'build-image',
    'swap-upstream',
    'reload-gateway',
    'scenarios',
    'restore',
    'cleanup',
  ];
}

/**
 * The teardown steps, derived from what the run actually changed rather than
 * from whether it succeeded. The `finally` block executes exactly this plan, so
 * a failed smoke tears down along the same path a successful one does — the
 * developer's API never stays swapped because an assertion threw.
 */
export function cleanupPlan({ swapped, imageTag, databaseImageTag, envFile }) {
  const plan = [];
  if (swapped) {
    plan.push({ step: 'restore-dev-api', args: restoreArgs(envFile) });
    plan.push({ step: 'reload-gateway', args: gatewayReloadArgs() });
  }
  // The disposable database goes unconditionally: it may exist even when the
  // API swap never happened, and leaving a stray PostgreSQL on the developer's
  // network is worse than a redundant `docker rm`.
  plan.push({ step: 'remove-database', args: removeDatabaseArgs() });
  plan.push({ step: 'remove-image', args: removeImageArgs(imageTag) });
  plan.push({ step: 'remove-database-image', args: removeImageArgs(databaseImageTag) });
  return plan;
}

/**
 * Replaces every supplied secret occurrence with a redaction marker. The only
 * secret this run has is the synthetic database password it generated itself,
 * and it still never reaches a log line.
 */
export function redactSecrets(text, secrets) {
  let out = text;
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join('<redacted>');
  }
  return out;
}

/**
 * True when no supplied secret appears in an argument vector. Arguments are
 * visible in process listings, so a secret must travel by environment or stdin.
 * The Compose override carries the generated password into the containers by
 * file, and `docker compose --env-file` never puts it on a command line.
 */
export function argsAreCredentialFree(args, secrets) {
  return !args.some((arg) => secrets.some((secret) => secret && String(arg).includes(secret)));
}
