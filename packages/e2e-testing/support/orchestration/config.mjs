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

/**
 * Per-run APP4 secret material for the E01 cross-layer harness (APP4-E01-H01).
 *
 * Three values, three different primitives, and `loadApp4SecretPepperConfig`
 * rejects a pair that reuses another's value — so these are generated
 * independently rather than derived from one seed. Generated fresh per run and
 * held only in memory: the development stack deliberately ships no defaults for
 * them (a development default is the unpeppered-equivalent shortcut the APP4
 * ruling forbids), and nothing here is ever written to `.env` or a report.
 *
 * `storefrontOrigin` is not secret. It is the origin `APP4-B05` renders the
 * absolute secure link against, and `.invalid` is reserved by RFC 6761 so it can
 * never resolve — the same choice `APP4-W01`'s own suites make. It is a test
 * value, the only place IMP-D050 permits an example origin to exist.
 *
 * The peppers must clear a 32-character minimum; 24 random bytes as hex is 48.
 * The envelope key must decode to exactly 32 bytes, so it is exactly 32 random
 * bytes in base64 — never a literal, which would be a credential in the
 * repository whether or not anything real were sealed under it.
 */
export function createApp4SecretConfig(runId) {
  return {
    verificationCodePepper: `e01-code-${runId}-${randomBytes(24).toString('hex')}`,
    secureLinkTokenPepper: `e01-link-${runId}-${randomBytes(24).toString('hex')}`,
    notificationDeliveryEnvelopeKey: randomBytes(32).toString('base64'),
    storefrontOrigin: 'https://storefront.e01.test.invalid',
    // Not APP4 material, and carried here only because the *real* graph cannot
    // be built without it: APP3-B07 composed the Design module into `AppModule`,
    // and anonymous Design Session secrets are verified with a peppered HMAC
    // that has no unpeppered fallback. Generated per run for the same reason as
    // the values above — a committed default would be the shortcut the APP3 and
    // APP4 rulings both forbid.
    designSessionPepper: `e01-design-${randomBytes(24).toString('hex')}`,
  };
}

/**
 * The APP4 secret material as the process environment every APP4 consumer reads.
 *
 * One builder, so the API HTTP process, the API in-process context and the
 * worker in-process context cannot drift onto different peppers — a mismatch
 * would surface as an envelope that will not open, which reads like a W01 defect
 * and is not one.
 */
export function app4SecretEnv(app4) {
  return {
    VERIFICATION_CODE_SECRET_PEPPER: app4.verificationCodePepper,
    SECURE_LINK_TOKEN_SECRET_PEPPER: app4.secureLinkTokenPepper,
    NOTIFICATION_DELIVERY_ENVELOPE_KEY: app4.notificationDeliveryEnvelopeKey,
    STOREFRONT_PUBLIC_ORIGIN: app4.storefrontOrigin,
    DESIGN_SESSION_SECRET_PEPPER: app4.designSessionPepper,
  };
}

/** The secret values alone — for the leak guard to scan *for*, never to print. */
export function app4SecretValues(app4) {
  return [
    app4.verificationCodePepper,
    app4.secureLinkTokenPepper,
    app4.notificationDeliveryEnvelopeKey,
  ];
}

/**
 * This run's object storage, as the environment every storage consumer reads.
 *
 * The API HTTP process is configured with these by `api-service.mjs`. They are
 * exported here because `APP5-E01` needs the *in-process* worker context to read
 * the same MinIO: APP5 uploads are inspected by the real APP2/APP3 inspection
 * job, which fetches the original it is judging, and the E01 runtime otherwise
 * fills in a deliberately unresolvable `.invalid` endpoint. Nothing here is a
 * deployment credential — both values are this suite's own disposable MinIO
 * login, generated for a container that is dropped with the run.
 */
export function objectStorageEnv(storage) {
  return {
    OBJECT_STORAGE_PROVIDER: 's3',
    OBJECT_STORAGE_ENDPOINT: storage.endpoint,
    OBJECT_STORAGE_REGION: 'us-east-1',
    OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
    OBJECT_STORAGE_ACCESS_KEY_ID: storage.accessKeyId,
    OBJECT_STORAGE_SECRET_ACCESS_KEY: storage.secretAccessKey,
    OBJECT_STORAGE_ORIGINALS_BUCKET: storage.originalsBucket,
    OBJECT_STORAGE_DERIVATIVES_BUCKET: storage.derivativesBucket,
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
    minio: port(env, 'E2E_MINIO_PORT', 9500),
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
  const storage = {
    endpoint: `http://localhost:${ports.minio}`,
    accessKeyId: env['E2E_OBJECT_STORAGE_ACCESS_KEY_ID'] ?? 'e2eminiokey',
    secretAccessKey: env['E2E_OBJECT_STORAGE_SECRET_ACCESS_KEY'] ?? 'e2e-minio-local-secret',
    originalsBucket: 'e2e-originals',
    derivativesBucket: 'e2e-derivatives',
  };
  db.baseDatabaseUrl = `postgres://${db.user}:${db.password}@localhost:${ports.postgres}/${db.name}`;

  return {
    repoRoot: REPO_ROOT,
    packageRoot: PACKAGE_ROOT,
    composeFile: join(REPO_ROOT, 'infrastructure', 'compose', 'docker-compose.e2e.yml'),
    ports,
    hosts,
    db,
    storage,
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
    E2E_MINIO_PORT: String(config.ports.minio),
    E2E_OBJECT_STORAGE_ACCESS_KEY_ID: config.storage.accessKeyId,
    E2E_OBJECT_STORAGE_SECRET_ACCESS_KEY: config.storage.secretAccessKey,
  };
}
