/**
 * Central E2E configuration: run identity, ports, hostnames, and derived URLs.
 * Every value is overridable via an `E2E_*` env var so concurrent runs and CI
 * can avoid port collisions. Defaults deliberately avoid the dev ports
 * (3000/3001/4000/5434) so a running dev stack never clashes.
 */
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = join(HERE, '..', '..');
export const REPO_ROOT = join(PACKAGE_ROOT, '..', '..');

/** Unique per orchestrator process — namespaces the Compose project and DB label. */
export function createRunId() {
  return `${process.pid}${randomBytes(3).toString('hex')}`;
}

/**
 * Per-run bootstrap Admin credentials for the APP1 cross-layer acceptance suite
 * (E01). The email is under `*.example.test` (a reserved test domain — never a
 * real inbox) and unique per run so concurrent runs and the identifier
 * rate-limit dimension never collide. The password is a fresh random secret that
 * comfortably exceeds the locked minimum length; it exists only in memory and is
 * passed to the bootstrap CLI and the browser login — never logged or committed.
 */
export function createAdminCredentials(runId) {
  return {
    email: `app1-e01-admin-${runId}@e2e.example.test`,
    password: `E01-${randomBytes(18).toString('base64url')}`,
    displayName: 'APP1 E01 Acceptance Admin',
  };
}

function port(env, key, fallback) {
  const raw = env[key];
  return raw === undefined || raw === '' ? fallback : Number(raw);
}

export function loadE2EConfig(env = process.env) {
  const ports = {
    postgres: port(env, 'E2E_POSTGRES_PORT', 5544),
    api: port(env, 'E2E_API_PORT', 4400),
    storefront: port(env, 'E2E_STOREFRONT_PORT', 4310),
    admin: port(env, 'E2E_ADMIN_PORT', 4311),
    gateway: port(env, 'E2E_GATEWAY_PORT', 8090),
  };
  const hosts = {
    storefront: env['STOREFRONT_HOST'] ?? 'embroidery.local',
    admin: env['ADMIN_HOST'] ?? 'admin.embroidery.local',
  };
  const db = {
    user: env['E2E_POSTGRES_USER'] ?? 'embroidery',
    password: env['E2E_POSTGRES_PASSWORD'] ?? 'embroidery_dev_password',
    name: env['E2E_POSTGRES_DB'] ?? 'embroidery',
  };
  db.baseDatabaseUrl = `postgres://${db.user}:${db.password}@localhost:${ports.postgres}/${db.name}`;

  return {
    repoRoot: REPO_ROOT,
    packageRoot: PACKAGE_ROOT,
    composeFile: join(REPO_ROOT, 'infrastructure', 'compose', 'docker-compose.e2e.yml'),
    ports,
    hosts,
    db,
    baseUrls: {
      storefront: `http://${hosts.storefront}:${ports.gateway}`,
      admin: `http://${hosts.admin}:${ports.gateway}`,
    },
  };
}

/** Env passed to Docker Compose so the E2E gateway proxies to the host apps. */
export function composeEnv(config) {
  return {
    E2E_POSTGRES_PORT: String(config.ports.postgres),
    E2E_POSTGRES_USER: config.db.user,
    E2E_POSTGRES_PASSWORD: config.db.password,
    E2E_POSTGRES_DB: config.db.name,
    E2E_GATEWAY_PORT: String(config.ports.gateway),
    STOREFRONT_HOST: config.hosts.storefront,
    ADMIN_HOST: config.hosts.admin,
    E2E_STOREFRONT_UPSTREAM: `host.docker.internal:${config.ports.storefront}`,
    E2E_ADMIN_UPSTREAM: `host.docker.internal:${config.ports.admin}`,
    E2E_API_UPSTREAM: `host.docker.internal:${config.ports.api}`,
  };
}
