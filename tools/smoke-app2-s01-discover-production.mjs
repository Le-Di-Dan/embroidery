#!/usr/bin/env node
/**
 * `APP2-S01` §19 — isolated production evidence for the Storefront Discover
 * feed.
 *
 * A `next build` plus a development-container visit establishes nothing about
 * production: not that the standalone image starts, not that hashed assets
 * resolve through the gateway, not that the page hydrates in a real build.
 * `APP2-T01-C1` found a production API image that could not start at all — a
 * defect every other gate in this repository was blind to.
 *
 * The topology is the accepted `APP2-T01-C1` / `APP2-B04` one, imported rather
 * than reimplemented: the same canonical Dockerfiles, the same temporary
 * Compose override outside the repository, the same disposable TLS PostgreSQL
 * (a production API may not attach to the development database — its TLS and
 * password guards correctly forbid it), the same bounded waits, the same
 * structural `finally` restore and the same gateway reload after every swap and
 * after the restore. `APP2-S01` adds one service to it: a production Storefront.
 *
 * No credential is used or needed — every route under test is anonymous. The
 * disposable database's password is generated for this run's throwaway
 * container and dies with it; it is never read from `.env`, never rotated and
 * never placed on a command line.
 *
 *   pnpm smoke:app2-s01-discover:production
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

import { createPhases } from './smoke-app2-s01-discover-phases.mjs';
import {
  GATEWAY_STOREFRONT_HOST,
  buildStorefrontArgs,
  storefrontImageTag,
  storefrontOverrideYaml,
  swapStorefrontArgs,
} from './smoke-app2-s01-storefront-topology.mjs';
import { createDockerFacts } from './smoke-app2-t01-docker-facts.mjs';
import {
  BUILD_TIMEOUT_MS,
  DEV_FILE,
  REPO_ROOT,
  argsAreCredentialFree,
  buildArgs,
  buildPgArgs,
  databaseUpArgs,
  pgDockerfile,
  pgImageTag,
  productionImageTag,
  productionOverrideYaml,
  redactSecrets,
  swapArgs,
} from './smoke-app2-t01-production-topology.mjs';

const BROWSER_SCRIPT = join(REPO_ROOT, 'tools', 'smoke-app2-s01-discover-browser.mjs');

const SECRETS = [];
const results = [];
const docker = createDockerFacts(SECRETS);

function record(label, ok, detail = {}) {
  results.push({ label, ok, detail });
  console.log(
    redactSecrets(`[${ok ? 'PASS' : 'FAIL'}] ${label} :: ${JSON.stringify(detail)}`, SECRETS),
  );
}

const phases = createPhases({ ...docker, record });

/** The browser scenarios, in a child process. Nothing secret is handed over. */
function runScenarios() {
  const args = [BROWSER_SCRIPT];
  record('no secret in the scenario arguments', argsAreCredentialFree(args, SECRETS), {
    argc: args.length,
  });
  const scenarios = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, SMOKE_BASE_URL: `http://${GATEWAY_STOREFRONT_HOST}` },
  });
  console.log(redactSecrets(scenarios.stdout ?? '', SECRETS));
  if (scenarios.stderr) console.error(redactSecrets(scenarios.stderr, SECRETS));
  record('production Discover browser scenarios', scenarios.status === 0, {
    exit: scenarios.status ?? 1,
  });
}

function buildImages({ imageTag, storefrontTag, databaseImageTag, pgContextDir }) {
  const api = docker.run(buildArgs(imageTag), { timeout: BUILD_TIMEOUT_MS });
  record('production API image built', api.status === 0, { tag: imageTag, exit: api.status });
  if (api.status !== 0) {
    console.error(api.stderr.slice(-4000));
    throw new Error(`production API image build failed (${api.status})`);
  }

  const storefront = docker.run(buildStorefrontArgs(storefrontTag), { timeout: BUILD_TIMEOUT_MS });
  record(
    'production Storefront image built from the canonical Dockerfile',
    storefront.status === 0,
    {
      tag: storefrontTag,
      exit: storefront.status,
    },
  );
  if (storefront.status !== 0) {
    console.error(storefront.stderr.slice(-6000));
    throw new Error(`production Storefront image build failed (${storefront.status})`);
  }

  mkdirSync(pgContextDir, { recursive: true });
  writeFileSync(join(pgContextDir, 'Dockerfile'), pgDockerfile(), 'utf8');
  const pg = docker.run(buildPgArgs(databaseImageTag, pgContextDir), { timeout: BUILD_TIMEOUT_MS });
  record('disposable TLS database image built', pg.status === 0, { exit: pg.status });
  if (pg.status !== 0) {
    console.error(pg.stderr.slice(-4000));
    throw new Error(`disposable database image build failed (${pg.status})`);
  }
}

async function main() {
  const seed = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
  const imageTag = productionImageTag(seed);
  const storefrontTag = storefrontImageTag(seed);
  const databaseImageTag = pgImageTag(seed);
  // Generated for this run's throwaway container and destroyed with it. Not a
  // rotation: no existing credential is read, replaced or re-seeded.
  const databasePassword = `s01${randomBytes(18).toString('hex')}`;
  const dir = mkdtempSync(join(tmpdir(), 's01-'));
  const overrideFile = join(dir, 'production-storefront.yml');
  const pgContextDir = join(dir, 'pg-tls');
  const envFile = join(REPO_ROOT, '.env');
  const files = [DEV_FILE, overrideFile];
  const swapped = { api: false, storefront: false };

  SECRETS.push(databasePassword);
  console.log('== APP2-S01 isolated production Discover smoke ==');

  try {
    const entry = phases.verifyEntryState(overrideFile);
    buildImages({ imageTag, storefrontTag, databaseImageTag, pgContextDir });

    writeFileSync(
      overrideFile,
      productionOverrideYaml({ imageTag, databaseImageTag, databasePassword }) +
        storefrontOverrideYaml(storefrontTag),
      'utf8',
    );
    record(
      'the generated password never reaches a command line',
      argsAreCredentialFree(
        [
          ...swapArgs(files, envFile),
          ...swapStorefrontArgs(files, envFile),
          ...databaseUpArgs(files, envFile),
        ],
        SECRETS,
      ),
      { channel: 'compose override file → container environment' },
    );

    phases.prepareDatabase({ files, envFile });

    swapped.api = true;
    swapped.storefront = true;
    const facts = phases.swapUpstreams({ envFile, entry, files });
    if (facts.api.kind !== 'production' || facts.storefront.kind !== 'production') {
      throw new Error('a service is not the production runtime; refusing to smoke');
    }

    runScenarios();
  } finally {
    phases.restoreAndCleanup({ swapped, imageTag, storefrontTag, databaseImageTag, envFile, dir });
  }

  const failed = results.filter((entry) => !entry.ok);
  console.log(`\n== summary: ${results.length - failed.length}/${results.length} passed ==`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
