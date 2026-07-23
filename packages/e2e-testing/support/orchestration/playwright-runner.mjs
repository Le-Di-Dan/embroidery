/**
 * Runs the Playwright specs against an already-started environment.
 *
 * Two modes, one config/specs:
 *  - host: runs on the developer/CI host. Chromium resolves the gateway
 *    hostnames via `--host-resolver-rules` (set per-project in the config), so
 *    the host path is Chromium-only (Windows required smoke).
 *  - container: runs the pinned official image (browsers baked in, npm package
 *    installed per the DEC-E2E correction) with `--add-host` DNS for the gateway
 *    hostnames, enabling Chromium + Firefox + WebKit (Linux full matrix).
 */
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const IMAGE = 'mcr.microsoft.com/playwright:v1.61.1-noble';

function resolveCli(packageRoot) {
  const require = createRequire(join(packageRoot, 'package.json'));
  for (const id of ['@playwright/test/cli', '@playwright/test/cli.js', 'playwright/cli']) {
    try {
      return require.resolve(id);
    } catch {
      // try next
    }
  }
  throw new Error('Could not resolve the Playwright CLI; is @playwright/test installed?');
}

function spawnAwait(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.once('exit', (code) => resolve(code ?? 1));
    child.once('error', () => resolve(1));
  });
}

/** Runs on the host (Chromium projects). Returns the process exit code. */
export function runHost({ packageRoot, projects, baseUrls, extraArgs = [] }) {
  const cli = resolveCli(packageRoot);
  const args = ['test', ...projects.flatMap((p) => ['--project', p]), ...extraArgs];
  return spawnAwait(process.execPath, [cli, ...args], {
    cwd: packageRoot,
    env: {
      ...process.env,
      E2E_RUNNER: 'host',
      E2E_BASE_STOREFRONT: baseUrls.storefront,
      E2E_BASE_ADMIN: baseUrls.admin,
    },
  });
}

/**
 * Runs the pinned Linux image against the host gateway. Copies only the
 * portable config + specs (they import nothing from the workspace) into a scratch
 * dir, installs the exact npm package inside the container (the image ships
 * browsers, not the package), and runs. Returns the exit code.
 */
export async function runContainer({ packageRoot, projects, config, projectName }) {
  const scratch = mkdtempSync(join(tmpdir(), 'emb-e2e-linux-'));
  try {
    cpSync(join(packageRoot, 'playwright.config.ts'), join(scratch, 'playwright.config.ts'));
    cpSync(join(packageRoot, 'specs'), join(scratch, 'specs'), { recursive: true });
    writeFileSync(
      join(scratch, 'package.json'),
      `${JSON.stringify(
        {
          name: 'e2e-linux-runner',
          private: true,
          devDependencies: { '@playwright/test': '1.61.1' },
        },
        null,
        2,
      )}\n`,
    );

    // Join the Compose network so Docker DNS resolves the real gateway
    // hostnames (aliases on the gateway service). The gateway listens on its
    // internal port 8080 here — not the host-published port.
    const network = `${projectName}_default`;
    const internalBase = (host) => `http://${host}:8080`;
    const inner = [
      'set -e',
      'node -v',
      'npm install --no-audit --no-fund >/tmp/install.log 2>&1',
      'npx playwright --version',
      `npx playwright test ${projects.map((p) => `--project ${p}`).join(' ')}`,
    ].join(' && ');

    return await spawnAwait('docker', [
      'run',
      '--rm',
      '--network',
      network,
      '-v',
      `${scratch}:/work`,
      '-w',
      '/work',
      '-e',
      `E2E_RUNNER=container`,
      '-e',
      `E2E_BASE_STOREFRONT=${internalBase(config.hosts.storefront)}`,
      '-e',
      `E2E_BASE_ADMIN=${internalBase(config.hosts.admin)}`,
      IMAGE,
      'sh',
      '-lc',
      inner,
    ]);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
