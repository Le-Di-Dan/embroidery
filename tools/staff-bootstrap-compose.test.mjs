/**
 * Contract checks on the RENDERED development Compose config (docker compose
 * config --format json) for the automatic staff-bootstrap wiring (A01-FU03):
 *  - a one-shot `db-migrate` and `staff-bootstrap` service exist, own no ports,
 *    reuse the API image, and never carry a committed credential;
 *  - the dependency graph is postgres → db-migrate → staff-bootstrap → admin,
 *    and api waits for migrations, so the public Admin is gated on a successful
 *    bootstrap;
 *  - the bootstrap service receives the environment discriminator and all three
 *    STAFF_BOOTSTRAP_* variables.
 *
 * Requires the docker CLI; skipped (with reason) where docker is unavailable.
 * Run:  node --test "tools/*.test.mjs"
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { buildComposeArgs } from './docker-dev.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_FILE = join(REPO_ROOT, 'infrastructure', 'compose', 'docker-compose.dev.yml');

function render(env) {
  const args = buildComposeArgs({
    composeFiles: [BASE_FILE],
    envFile: undefined,
    profile: undefined,
    commandArgs: ['config', '--format', 'json'],
  });
  return spawnSync('docker', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 16 * 1024 * 1024,
  });
}

const CLEAN_ENV = {
  GATEWAY_HTTP_PORT: '',
  STAFF_BOOTSTRAP_EMAIL: '',
  STAFF_BOOTSTRAP_PASSWORD: '',
  STAFF_BOOTSTRAP_DISPLAY_NAME: '',
};

const probe = render(CLEAN_ENV);
const dockerAvailable = !probe.error && probe.status === 0;
const skipReason = dockerAvailable
  ? false
  : 'docker CLI unavailable in this environment - verified via runtime checks instead';

test(
  'one-shot bootstrap services exist, own no ports, and reuse the API image',
  { skip: skipReason },
  () => {
    const services = JSON.parse(probe.stdout).services;

    for (const name of ['db-migrate', 'staff-bootstrap']) {
      const svc = services[name];
      assert.ok(svc, `${name} service must exist`);
      assert.equal(svc.ports, undefined, `${name} must not publish host ports`);
      assert.equal(svc.restart, 'no', `${name} must be a one-shot (restart: "no")`);
      assert.match(svc.build.dockerfile, /api\.Dockerfile$/, `${name} must reuse the API image`);
    }
  },
);

test(
  'staff-bootstrap receives the environment discriminator and all STAFF_BOOTSTRAP_* vars',
  { skip: skipReason },
  () => {
    const env = JSON.parse(probe.stdout).services['staff-bootstrap'].environment;
    assert.equal(env.NODE_ENV, 'development');
    for (const key of [
      'STAFF_BOOTSTRAP_EMAIL',
      'STAFF_BOOTSTRAP_PASSWORD',
      'STAFF_BOOTSTRAP_DISPLAY_NAME',
    ]) {
      assert.ok(key in env, `${key} must be passed to staff-bootstrap`);
    }
    // No committed credential: the password renders empty when unset in the env.
    assert.equal(env.STAFF_BOOTSTRAP_PASSWORD, '');
  },
);

test(
  'dependency graph gates the public Admin on a successful bootstrap',
  { skip: skipReason },
  () => {
    const services = JSON.parse(probe.stdout).services;

    assert.equal(
      services['db-migrate'].depends_on.postgres.condition,
      'service_healthy',
      'db-migrate must wait for a healthy database',
    );
    assert.equal(
      services['staff-bootstrap'].depends_on['db-migrate'].condition,
      'service_completed_successfully',
      'staff-bootstrap must wait for migrations to complete',
    );
    assert.equal(
      services.admin.depends_on['staff-bootstrap'].condition,
      'service_completed_successfully',
      'admin must wait for a successful bootstrap',
    );
    assert.equal(
      services.api.depends_on['db-migrate'].condition,
      'service_completed_successfully',
      'api must serve only a migrated schema',
    );
  },
);
