#!/usr/bin/env node
/**
 * The single benchmark orchestrator.
 *
 * It owns every process it starts (the spike's `next start`, the Playwright
 * run, and — on Linux — the pinned browser container), tears everything down in
 * `finally` and on signals, and never relies on a test runner to kill a server.
 * That is the same wrapper-owned-lifecycle rule APP0-T02B locked for the
 * product E2E tier.
 *
 * Usage: node scripts/run-bench.mjs [--host|--container] [--projects=a,b]
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import { captureEnvironment } from './bench-env.mjs';

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.SPIKE_PORT ?? 4320);
const IMAGE = 'mcr.microsoft.com/playwright:v1.61.1-noble';
const HOST_PROJECTS = ['desktop-chromium', 'mobile-chromium'];
const CONTAINER_PROJECTS = ['desktop-chromium', 'mobile-chromium', 'desktop-webkit'];

const args = process.argv.slice(2);
const mode = args.includes('--container') ? 'container' : 'host';
const projectArg = args.find((arg) => arg.startsWith('--projects='));
const projects = projectArg
  ? projectArg.slice('--projects='.length).split(',')
  : mode === 'container'
    ? CONTAINER_PROJECTS
    : HOST_PROJECTS;

const log = (message) => {
  console.log(`[bench] ${message}`);
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });
    server.listen(port, '127.0.0.1');
  });
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // not up yet
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startServer() {
  const require = createRequire(join(PACKAGE_ROOT, 'package.json'));
  const nextBin = require.resolve('next/dist/bin/next');
  const child = spawn(
    process.execPath,
    [nextBin, 'start', '--hostname', '0.0.0.0', '--port', String(PORT)],
    {
      cwd: PACKAGE_ROOT,
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    },
  );
  child.stdout.on('data', () => {});
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[next] ${String(chunk)}`);
  });
  return child;
}

function stopServer(child) {
  if (child === null || child.exitCode !== null) {
    return;
  }
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      child.kill('SIGKILL');
    }
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGKILL');
  }
}

function runHost() {
  const require = createRequire(join(PACKAGE_ROOT, 'package.json'));
  const cli = require.resolve('@playwright/test/cli');
  return spawnSyncInherit(process.execPath, [
    cli,
    'test',
    ...projects.flatMap((project) => ['--project', project]),
  ]);
}

function spawnSyncInherit(command, commandArgs, cwd = PACKAGE_ROOT) {
  const { status } = spawnSync(command, commandArgs, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      SPIKE_BASE_URL: `http://127.0.0.1:${String(PORT)}`,
      SPIKE_PLATFORM: mode === 'container' ? 'linux' : 'windows',
    },
  });
  return status ?? 1;
}

function runContainer() {
  const scratch = join(PACKAGE_ROOT, '.bench-container');
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(join(scratch, 'results', 'raw'), { recursive: true });
  for (const entry of ['playwright.config.ts', 'tsconfig.json', 'bench', 'src']) {
    cpSync(join(PACKAGE_ROOT, entry), join(scratch, entry), { recursive: true });
  }
  writeFileSync(
    join(scratch, 'package.json'),
    `${JSON.stringify(
      {
        name: 'spike-bench-container',
        private: true,
        devDependencies: { '@playwright/test': '1.61.1' },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  // The official image ships browsers and system dependencies — NOT the npm
  // package. It is installed here and version-aligned on purpose.
  const script = [
    'set -e',
    'node -v',
    'npm install --no-audit --no-fund --loglevel=error',
    'npx playwright --version',
    `npx playwright test ${projects.map((project) => `--project ${project}`).join(' ')}`,
  ].join(' && ');
  const status = spawnSyncInherit(
    'docker',
    [
      'run',
      '--rm',
      '--add-host',
      'host.docker.internal:host-gateway',
      '-v',
      `${scratch}:/work`,
      '-w',
      '/work',
      '-e',
      `SPIKE_BASE_URL=http://host.docker.internal:${String(PORT)}`,
      '-e',
      'SPIKE_PLATFORM=linux',
      IMAGE,
      'sh',
      '-lc',
      script,
    ],
    PACKAGE_ROOT,
  );
  cpSync(join(scratch, 'results', 'raw'), join(PACKAGE_ROOT, 'results', 'raw'), {
    recursive: true,
    force: true,
  });
  rmSync(scratch, { recursive: true, force: true });
  return status;
}

function hostPlaywrightVersion() {
  const require = createRequire(join(PACKAGE_ROOT, 'package.json'));
  const cli = require.resolve('@playwright/test/cli');
  return execFileSync(process.execPath, [cli, '--version'], {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
  }).trim();
}

function imageDigest() {
  try {
    return execFileSync(
      'docker',
      ['image', 'inspect', IMAGE, '--format', '{{index .RepoDigests 0}}'],
      { encoding: 'utf8' },
    ).trim();
  } catch {
    return 'unavailable';
  }
}

/**
 * What actually drove the browsers. In container mode the image ships the
 * browsers and system dependencies but NOT the npm package, which is installed
 * inside the container and version-aligned with the host pin.
 */
function guestEnvironment() {
  if (mode !== 'container') {
    return {
      guestOs: `${process.platform} (same machine as host)`,
      guestNodeVersion: process.version,
      playwrightPackage: hostPlaywrightVersion(),
      browserSource: 'host browser cache installed by @playwright/test',
    };
  }
  return {
    guestOs: `linux — ${IMAGE}`,
    guestImageDigest: imageDigest(),
    guestNodeVersion: 'Node 24 (image default; printed by `node -v` in the run log)',
    playwrightPackage: `${hostPlaywrightVersion()} (host pin; installed separately inside the image)`,
    browserSource: 'browsers baked into the pinned image at /ms-playwright',
  };
}

let server = null;
let exitCode;

const shutdown = () => {
  stopServer(server);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  if (!(await isPortFree(PORT))) {
    throw new Error(
      `Port ${String(PORT)} is busy; refusing to benchmark against an unknown server.`,
    );
  }
  log(`mode=${mode} projects=${projects.join(',')}`);
  server = startServer();
  await waitForHttp(`http://127.0.0.1:${String(PORT)}/`, 60_000);
  log('spike server ready');

  mkdirSync(join(PACKAGE_ROOT, 'results', 'raw'), { recursive: true });
  exitCode = mode === 'container' ? runContainer() : runHost();

  const environment = captureEnvironment({
    runner: mode === 'container' ? `container ${IMAGE}` : 'host',
    projects,
    guest: guestEnvironment(),
  });
  const name = mode === 'container' ? 'environment.linux.json' : 'environment.windows.json';
  writeFileSync(
    join(PACKAGE_ROOT, 'results', name),
    `${JSON.stringify(environment, null, 2)}\n`,
    'utf8',
  );
  log(`environment written to results/${name}`);
} finally {
  stopServer(server);
  server = null;
  await delay(500);
  log(`teardown complete; port ${String(PORT)} free = ${String(await isPortFree(PORT))}`);
}

process.exit(exitCode ?? 1);
