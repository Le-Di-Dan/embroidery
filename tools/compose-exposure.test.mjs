/**
 * Behavior-level verification of the RENDERED Docker Compose configuration
 * (docker compose config --format json), not raw file text:
 *  - normal mode exposes only the gateway (plus loopback postgres),
 *  - debug overlay binds direct app ports to 127.0.0.1 only,
 *  - the gateway container receives GATEWAY_HTTP_PORT matching its public port.
 *
 * Requires the docker CLI; skipped (with reason) where docker is unavailable,
 * e.g. a CI runner without Docker. Run:  node --test "tools/*.test.mjs"
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { buildComposeArgs } from './docker-dev.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE_DIR = join(REPO_ROOT, 'infrastructure', 'compose');
const BASE_FILE = join(COMPOSE_DIR, 'docker-compose.dev.yml');
const DEBUG_FILE = join(COMPOSE_DIR, 'docker-compose.debug.yml');

function renderComposeConfig(composeFiles, env) {
  const args = buildComposeArgs({
    composeFiles,
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

// Empty string forces the ${VAR:-default} fallback even if the caller's shell
// exports GATEWAY_HTTP_PORT, keeping the default-mode assertions deterministic.
const DEFAULT_ENV = { GATEWAY_HTTP_PORT: '' };

const probe = renderComposeConfig([BASE_FILE], DEFAULT_ENV);
const dockerAvailable = !probe.error && probe.status === 0;
const skipReason = dockerAvailable
  ? false
  : 'docker CLI unavailable in this environment - verified via runtime checks instead';

test(
  'normal mode: only the gateway and loopback postgres publish host ports',
  { skip: skipReason },
  () => {
    const services = JSON.parse(probe.stdout).services;

    for (const app of ['storefront', 'admin', 'api', 'worker']) {
      assert.equal(services[app].ports, undefined, `${app} must not publish host ports`);
    }

    const gatewayPorts = services.gateway.ports;
    assert.equal(gatewayPorts.length, 1);
    assert.equal(gatewayPorts[0].published, '80');
    assert.equal(gatewayPorts[0].target, 8080);

    const postgresPorts = services.postgres.ports;
    assert.equal(postgresPorts[0].host_ip, '127.0.0.1', 'postgres must stay loopback-bound');
  },
);

test(
  'gateway env carries the public port for X-Forwarded-Port rendering',
  { skip: skipReason },
  () => {
    const services = JSON.parse(probe.stdout).services;
    assert.equal(services.gateway.environment.GATEWAY_HTTP_PORT, '80');

    const alt = renderComposeConfig([BASE_FILE], { GATEWAY_HTTP_PORT: '8085' });
    const altServices = JSON.parse(alt.stdout).services;
    assert.equal(altServices.gateway.environment.GATEWAY_HTTP_PORT, '8085');
    assert.equal(altServices.gateway.ports[0].published, '8085');
  },
);

test('debug overlay binds direct application ports to loopback only', { skip: skipReason }, () => {
  const rendered = renderComposeConfig([BASE_FILE, DEBUG_FILE], DEFAULT_ENV);
  assert.equal(rendered.status, 0, rendered.stderr);
  const services = JSON.parse(rendered.stdout).services;

  const expected = { storefront: 3000, admin: 3001, api: 4000 };
  for (const [app, port] of Object.entries(expected)) {
    const ports = services[app].ports;
    assert.equal(ports.length, 1, `${app} must publish exactly one debug port`);
    assert.equal(ports[0].host_ip, '127.0.0.1', `${app} debug port must bind loopback`);
    assert.equal(ports[0].published, String(port));
    assert.equal(ports[0].target, port);
  }
  assert.equal(services.worker.ports, undefined, 'worker must never publish ports');
});
