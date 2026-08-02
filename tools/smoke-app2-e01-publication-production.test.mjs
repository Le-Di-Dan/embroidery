/**
 * Docker-free regressions for the `APP2-E01` orchestration.
 *
 * The journey itself needs Docker and several minutes; these run in
 * milliseconds and guard the shape it must keep. Every case here protects
 * something that, if it silently changed, would leave the journey passing while
 * proving less than it claims: a service quietly reverting to development, the
 * TLS gateway being skipped, the Secure-cookie guard being disabled, a
 * credential reaching a command line, or the ordered stages being reordered so
 * that public visibility is asserted before anything is published.
 */
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  ADMIN_SERVICE,
  DERIVATIVES_BUCKET,
  ORIGINALS_BUCKET,
  STORAGE_ENDPOINT,
  STORAGE_SERVICE,
  WORKER_SERVICE,
  apiOriginEnvYaml,
  apiStorageEnvYaml,
  buildAdminArgs,
  buildWorkerArgs,
  e01OverrideYaml,
  removeStorageArgs,
  restoreArgs,
  storageUpArgs,
  swapAdminArgs,
  swapWorkerArgs,
} from './smoke-app2-e01-topology.mjs';
import {
  ADMIN_HTTPS_BASE,
  GATEWAY_ADMIN_HOST,
  TLS_HOST_PORT,
  gatewayTlsOverrideYaml,
  gatewayUpArgs,
  tlsTemplate,
} from './smoke-app2-e01-tls.mjs';
import {
  CANONICAL_CHECK_COUNT,
  CANONICAL_CHECKERS,
  CANONICAL_COLUMN_COUNT,
  CANONICAL_FINGERPRINT,
  CANONICAL_MIGRATION_COUNT,
  CANONICAL_TABLE_COUNT,
  MIGRATE_SERVICE,
  MUTABLE_BASELINE_TABLES,
  WORKER_RUNTIME_POLICY,
  checkerRunArgs,
  checksumRunArgs,
  migrateOverrideYaml,
  migrateRunArgs,
  statusRunArgs,
  workerPolicyStatements,
} from './smoke-app2-e01-schema.mjs';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const source = (name) => readFileSync(join(TOOLS, name), 'utf8');

const orchestrator = source('smoke-app2-e01-publication-production.mjs');
const schema = source('smoke-app2-e01-schema.mjs');
const bootstrap = source('smoke-app2-e01-bootstrap.mjs');
const journey = source('smoke-app2-e01-journey.mjs');
const admin = source('smoke-app2-e01-admin-browser.mjs');
const storefront = source('smoke-app2-e01-storefront-browser.mjs');
const fixtures = source('smoke-app2-e01-fixtures.mjs');

/**
 * Source with comments removed.
 *
 * The forbidden-token scans below have to distinguish "this harness runs
 * `pg_dump`" from "this comment explains why it must not", and prose that names
 * the mistake is exactly what keeps the mistake from coming back.
 */
const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*\*.*$/gm, '');

/** Position of a marker in the journey, so ordering can be asserted. */
const at = (marker) => {
  const index = journey.indexOf(marker);
  assert.notEqual(index, -1, `journey is missing "${marker}"`);
  return index;
};

describe('E01 production topology', () => {
  it('requires every production service', () => {
    for (const marker of [
      'buildArgs',
      'buildAdminArgs',
      'buildWorkerArgs',
      'buildStorefrontArgs',
    ]) {
      assert.ok(orchestrator.includes(marker), `orchestrator must build ${marker}`);
    }
    for (const marker of ['swapArgs', 'swapAdminArgs', 'swapWorkerArgs', 'swapStorefrontArgs']) {
      assert.ok(orchestrator.includes(marker), `orchestrator must swap ${marker}`);
    }
  });

  it('builds Admin and worker from the canonical runner stages', () => {
    assert.ok(buildAdminArgs('t').includes('runner'));
    assert.ok(buildWorkerArgs('t').includes('runner'));
    assert.ok(buildAdminArgs('t').some((arg) => arg.endsWith('admin.Dockerfile')));
    assert.ok(buildWorkerArgs('t').some((arg) => arg.endsWith('worker.Dockerfile')));
  });

  it('runs every application in production mode with no source mounts', () => {
    const yaml = e01OverrideYaml({
      adminTag: 'a',
      workerTag: 'w',
      databaseUrl: 'postgres://x',
      storageAccessKey: 'k',
      storageSecretKey: 's',
    });
    assert.equal(yaml.match(/NODE_ENV: production/g)?.length, 2);
    assert.equal(yaml.match(/volumes: !reset \[\]/g)?.length, 2);
    assert.ok(yaml.includes(`  ${ADMIN_SERVICE}:`));
    assert.ok(yaml.includes(`  ${WORKER_SERVICE}:`));
  });

  it('mandates a disposable object store, never the development one', () => {
    const yaml = e01OverrideYaml({
      adminTag: 'a',
      workerTag: 'w',
      databaseUrl: 'postgres://x',
      storageAccessKey: 'k',
      storageSecretKey: 's',
    });
    assert.ok(yaml.includes(`  ${STORAGE_SERVICE}:`));
    assert.ok(yaml.includes(STORAGE_ENDPOINT));
    assert.ok(yaml.includes(ORIGINALS_BUCKET));
    assert.ok(yaml.includes(DERIVATIVES_BUCKET));
    // The API must point at the same disposable store as the worker.
    assert.ok(apiStorageEnvYaml('k', 's').includes(STORAGE_ENDPOINT));
    assert.ok(storageUpArgs(['f'], 'e').includes(STORAGE_SERVICE));
    assert.ok(removeStorageArgs(['f'], 'e').includes('-fsv'));
  });

  it('keeps the disposable database TLS-only with a generated password', () => {
    // The API's TLS requirement is stated by the shared production topology
    // module this run reuses; the worker's is stated here.
    const shared = source('smoke-app2-t01-production-topology.mjs');
    assert.ok(shared.includes('DATABASE_SSL_MODE'));
    assert.ok(
      e01OverrideYaml({
        adminTag: 'a',
        workerTag: 'w',
        databaseUrl: 'postgres://x',
        storageAccessKey: 'k',
        storageSecretKey: 's',
      }).includes('DATABASE_SSL_MODE: require'),
    );
    assert.ok(orchestrator.includes('databasePassword'));
    // Never the developer's database credential.
    assert.ok(!orchestrator.includes('embroidery_dev_password'));
  });

  it('never copies anything out of the development database', () => {
    // `APP2-E01-C1`: the disposable copy is migrated, never dumped. A snapshot
    // of the developer's database inherits local drift, can never fail when the
    // migration runner is broken, and depends on a machine nobody else has.
    const harness = [orchestrator, schema, bootstrap, journey, fixtures].join('\n');
    for (const forbidden of ['pg_dump', 'pg_restore', '--schema-only', '--data-only']) {
      assert.ok(
        !new RegExp(`['"\`]?${forbidden.replace(/[-]/g, '\\-')}`).test(stripComments(harness)),
        `the harness must not use ${forbidden}`,
      );
    }
    assert.ok(!/--table=(categories|policy_configurations|products)/.test(harness));
    assert.ok(!orchestrator.includes('dumpArgs'));
    assert.ok(!orchestrator.includes('restoreDumpArgs'));
  });

  it('never points the migration runner or a checker at the development database', () => {
    const harness = stripComments([orchestrator, schema, bootstrap, fixtures].join('\n'));
    // The development containers and hostnames the dev Compose file owns.
    for (const host of ['POSTGRES_CONTAINER', '@postgres:5432', 'minio:9000']) {
      assert.ok(!harness.includes(host), `the harness must not address development ${host}`);
    }
    // Every disposable statement goes to the disposable container.
    assert.ok(fixtures.includes('PROD_DB_CONTAINER'));
    assert.ok(
      migrateOverrideYaml({ databaseUrl: 'postgres://x@api-db-t01c1:5432/y' }).includes(
        'api-db-t01c1',
      ),
    );
  });
});

describe('E01 canonical migration path', () => {
  it('applies the committed migrations with the repository runner', () => {
    const args = migrateRunArgs(['f'], 'e');
    assert.ok(args.includes(MIGRATE_SERVICE));
    assert.ok(args.at(-1).includes('pnpm --filter @embroidery/database db:migrate'));
    assert.ok(args.includes('--no-deps'), 'must not wake the development database');
    assert.ok(args.includes('--rm'));
    assert.ok(orchestrator.includes('applyCanonicalMigrations'));
  });

  it('refuses to accept a partial or drifted migration set', () => {
    assert.equal(CANONICAL_MIGRATION_COUNT, 33);
    // `db:status` exits 0 only for an exact match; the count is asserted too.
    assert.ok(statusRunArgs(['f'], 'e').at(-1).includes('db:status'));
    assert.ok(bootstrap.includes('in repository'), 'the applied/repository counts are parsed');
    assert.ok(bootstrap.includes('CANONICAL_MIGRATION_COUNT'));
    assert.ok(checksumRunArgs(['f'], 'e').at(-1).includes('db-migration-checksum-check.mjs'));
  });

  it('verifies the frozen fingerprint and physical counts', () => {
    assert.ok(CANONICAL_CHECKERS.includes('db-fingerprint-gate.mjs'));
    assert.equal(CANONICAL_CHECKERS.length, 7, 'the canonical DB6 checker set');
    assert.equal(CANONICAL_TABLE_COUNT, 78);
    assert.equal(CANONICAL_COLUMN_COUNT, 833);
    assert.equal(CANONICAL_CHECK_COUNT, 190);
    assert.match(CANONICAL_FINGERPRINT, /^[0-9a-f]{64}$/);
    assert.ok(bootstrap.includes('reproduces the frozen physical baseline'));
  });

  it('reuses the committed checkers instead of reimplementing them', () => {
    for (const checker of CANONICAL_CHECKERS) {
      assert.ok(
        existsSync(join(TOOLS, '..', 'packages', 'database', 'tools', checker)),
        `${checker} must be the committed script`,
      );
      assert.ok(checkerRunArgs(['f'], 'e', checker).at(-1).includes(checker));
    }
    // The URL is expanded by the container's own shell, never by this harness.
    assert.ok(checkerRunArgs(['f'], 'e', CANONICAL_CHECKERS[0]).at(-1).includes('"$DATABASE_URL"'));
  });

  it('runs no journey stage before the schema is verified', () => {
    const migrate = orchestrator.indexOf('applyCanonicalMigrations');
    const verify = orchestrator.indexOf('verifyCanonicalSchema');
    const api = orchestrator.indexOf("'production API'");
    const journeyStart = orchestrator.indexOf('runJourney(');
    assert.ok(migrate < verify, 'migrate before verify');
    assert.ok(verify < api, 'verify before any application starts');
    assert.ok(api < journeyStart, 'applications before the journey');
  });

  it('demands a zero mutable baseline it did not create by deleting', () => {
    for (const table of ['assets', 'products', 'audit_events', 'outbox_events', 'admin_accounts']) {
      assert.ok(MUTABLE_BASELINE_TABLES.includes(table));
    }
    const harness = [orchestrator, schema, bootstrap, journey, fixtures].join('\n');
    assert.ok(!/delete from|truncate /i.test(harness), 'evidence is never deleted');
    assert.ok(journey.includes('zero mutable baseline'));
  });
});

describe('E01 independent prerequisites', () => {
  it('publishes the worker policy itself, with values the validator accepts', () => {
    const p = WORKER_RUNTIME_POLICY;
    assert.ok(p.backoffBaseMs <= p.backoffMaxMs);
    assert.ok(p.handlerTimeoutMs + p.leaseSafetyMarginMs <= p.leaseDurationMs);
    assert.ok(p.shutdownGraceMs <= p.handlerTimeoutMs);
    assert.ok(p.pollIntervalMs < p.leaseDurationMs);
    assert.ok(Object.values(p).every((v) => Number.isInteger(v) && v > 0));
  });

  it('authors the policy after the staff identity, because the column demands it', () => {
    assert.ok(bootstrap.indexOf('bootstrapStaff(') < bootstrap.indexOf('workerPolicyStatements('));
    assert.ok(
      workerPolicyStatements('11111111-1111-7111-8111-111111111111').statements.length === 3,
    );
  });

  it('expects the four categories from migration 0033, not from a copy', () => {
    assert.ok(bootstrap.includes('migration 0033 provisioned the four fixed categories'));
    assert.ok(!/insert into categories/i.test([schema, bootstrap, fixtures].join('\n')));
  });
});

describe('E01 secure Admin gate', () => {
  it('cannot be skipped: the journey drives the HTTPS origin', () => {
    assert.ok(ADMIN_HTTPS_BASE.startsWith('https://'));
    assert.ok(ADMIN_HTTPS_BASE.includes(String(TLS_HOST_PORT)));
    assert.ok(orchestrator.includes('ADMIN_HTTPS_BASE'));
    assert.ok(orchestrator.includes('generateCertificate'));
    assert.ok(orchestrator.includes('gatewayUpArgs'));
  });

  it('terminates TLS at the gateway for the real Admin host', () => {
    const template = tlsTemplate();
    assert.ok(template.includes(`listen ${TLS_HOST_PORT} ssl`));
    assert.ok(template.includes(GATEWAY_ADMIN_HOST));
    assert.ok(template.includes('ssl_certificate'));
    assert.ok(template.includes('proxy_pass http://admin_upstream'));
    assert.ok(template.includes('proxy_pass http://api_upstream'));
  });

  it('mounts the certificate and config from a temporary directory only', () => {
    const yaml = gatewayTlsOverrideYaml({
      certDir: '/tmp/e01/tls',
      templatePath: '/tmp/e01/x.conf',
    });
    assert.ok(yaml.includes('/tmp/e01/tls:/etc/nginx/e01-tls:ro'));
    assert.ok(yaml.includes('/tmp/e01/x.conf:/etc/nginx/conf.d/e01-tls.conf:ro'));
    // The tracked mounts survive untouched.
    assert.ok(yaml.includes('../nginx/nginx.conf:/etc/nginx/nginx.conf:ro'));
  });

  it('recreates the gateway without waking the development one-shots', () => {
    // Without `--no-deps` Compose walks `depends_on` and starts `db-migrate`
    // and `staff-bootstrap` against the DEVELOPER's database.
    assert.ok(gatewayUpArgs(['f'], 'e').includes('--no-deps'));
  });

  it('never disables the Secure-cookie guard', () => {
    const all = [orchestrator, journey, admin, fixtures].join('\n');
    assert.ok(!/STAFF_SESSION_COOKIE_SECURE:\s*'?false/.test(all));
    assert.ok(!/addCookies|setCookie|document\.cookie\s*=/.test(all));
    // The cookie is asserted, not injected.
    assert.ok(admin.includes('session.secure === true'));
    assert.ok(admin.includes('session.httpOnly === true'));
  });

  it('points the CSRF allowlist at exactly the browser origin', () => {
    const yaml = apiOriginEnvYaml(ADMIN_HTTPS_BASE);
    assert.ok(yaml.includes('STAFF_ALLOWED_ORIGINS'));
    assert.equal(yaml.split(',').length, 1, 'the allowlist must hold one exact origin');
    assert.ok(yaml.includes(ADMIN_HTTPS_BASE));
  });
});

describe('E01 fixture policy', () => {
  it('creates no Asset, Product, media or derivative', () => {
    for (const table of ['assets', 'products', 'product_media', 'asset_derivatives']) {
      assert.ok(
        !new RegExp(`insert into ${table}`, 'i').test(fixtures),
        `fixtures must not insert into ${table}`,
      );
    }
  });

  it('generates a real image rather than downloading or faking one', () => {
    assert.ok(fixtures.includes('writeFixtureImage'));
    assert.ok(fixtures.includes('IHDR') && fixtures.includes('IDAT') && fixtures.includes('IEND'));
    assert.ok(!/https?:\/\/[^\s'"]*\.(png|jpe?g|webp)/i.test(fixtures));
  });

  it('seeds the staff identity through the API CLI, never by SQL', () => {
    assert.ok(fixtures.includes('dist/cli/staff-bootstrap.js'));
    assert.ok(!/insert into admin_(accounts|credentials)/i.test(fixtures));
    assert.ok(!fixtures.includes('--rotate'));
  });

  it('keeps credentials out of argv and output', () => {
    // Passed by name through `--env`, never as a value on the command line.
    assert.ok(fixtures.includes("'--env',\n      'STAFF_BOOTSTRAP_PASSWORD'"));
    assert.ok(!/console\.log\([^)]*password/i.test(fixtures));
    assert.ok(orchestrator.includes('SECRETS.push'));
    assert.ok(orchestrator.includes('redactSecrets'));
    assert.ok(orchestrator.includes('argsAreCredentialFree'));
  });
});

describe('E01 journey order', () => {
  it('lets the worker finish before media is attached', () => {
    assert.ok(at('uploadAsset(') < at('completeDraft('));
  });

  it('creates and completes the draft before publishing', () => {
    assert.ok(at('createDraft(') < at('completeDraft('));
    assert.ok(at('completeDraft(') < at('publish('));
  });

  it('checks public visibility only after publish', () => {
    assert.ok(at('publish(') < at('assertDiscoverable('));
    assert.ok(at('assertDiscoverable(') < at('assertDetail('));
  });

  it('checks revocation only after unpublish', () => {
    assert.ok(at('unpublish(') < at('assertRevoked('));
  });

  it('republishes and then leaves the Product as a draft', () => {
    assert.ok(at('assertRevoked(') < at("label: 'republish'"));
    assert.ok(at("label: 'republish'") < at("label: 'final unpublish'"));
  });

  it('drives every mutation through the UI, never the API or SQL', () => {
    for (const marker of ['adminProduct', 'adminAsset', 'axios', 'fetch(']) {
      assert.ok(!admin.includes(marker), `the Admin journey must not use ${marker}`);
    }
    assert.ok(!/insert into|update products set/i.test(admin));
  });
});

describe('E01 evidence and disclosure', () => {
  it('names the streamed not-found honestly', () => {
    assert.ok(storefront.includes('SAFE_STREAMED_NOT_FOUND'));
    assert.ok(storefront.includes('measuredStatus'));
    // A measured 200 is never called a 404.
    assert.ok(!/status === 404[^]*SAFE_STREAMED/.test(storefront));
  });

  it('still demands a real 404 from the media route', () => {
    assert.ok(storefront.includes('returns a real HTTP 404'));
    assert.ok(storefront.includes('media.status === 404'));
  });

  it('measures publication evidence as a delta, never a raw total', () => {
    assert.ok(journey.includes('baseline.publishedAudit'));
    assert.ok(journey.includes('baseline.publishedOutbox'));
    assert.ok(journey.includes('publishedAdded'));
  });

  it('never marks publication events dispatched', () => {
    const all = [orchestrator, journey, admin, fixtures].join('\n');
    assert.ok(!/update outbox_events/i.test(all));
    assert.ok(journey.includes('remain undispatched'));
  });

  it('scans for storage keys and internal causes on public surfaces', () => {
    assert.ok(journey.includes('no storage key, bucket or provider endpoint'));
    assert.ok(journey.includes('minio|amazonaws'));
  });
});

describe('E01 cleanup', () => {
  it('restores every development runtime from the tracked Compose file alone', () => {
    const args = restoreArgs('.env', 'admin');
    assert.ok(args.includes('--force-recreate'));
    assert.equal(args.filter((arg) => arg === '-f').length, 1, 'only the tracked file');
    for (const service of ['storefront', 'admin', 'worker', 'api', 'gateway']) {
      assert.ok(orchestrator.includes(`'${service}'`), `restore must cover ${service}`);
    }
  });

  it('runs cleanup in a finally block, so a failed journey still restores', () => {
    const finallyIndex = orchestrator.indexOf('} finally {');
    assert.notEqual(finallyIndex, -1);
    assert.ok(orchestrator.indexOf('restoreArgs(', finallyIndex) > finallyIndex);
    assert.ok(orchestrator.indexOf('rmSync(dir', finallyIndex) > finallyIndex);
    assert.ok(orchestrator.indexOf('no temporary residue', finallyIndex) > finallyIndex);
  });

  it('commits no browser artifact', () => {
    const all = [orchestrator, journey, admin, storefront].join('\n');
    assert.ok(!/screenshot\(|video:|trace:|recordHar/.test(all));
  });

  it('does not start X01 or another E01 recursively', () => {
    const all = [orchestrator, journey].join('\n');
    assert.ok(!/APP2-X01|smoke:app2-x01|smoke:app2-e01/.test(all.replace(/\*.*$/gm, '')));
  });
});

describe('E01 swap arguments', () => {
  it('swaps one service at a time without touching dependencies', () => {
    for (const args of [swapAdminArgs(['f'], 'e'), swapWorkerArgs(['f'], 'e')]) {
      assert.ok(args.includes('--no-deps'));
      assert.ok(args.includes('--wait'));
    }
  });
});
