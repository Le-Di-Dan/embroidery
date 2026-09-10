/**
 * Fresh-build authority for the browser tier (`APP12-E01` §3.4,
 * `FU-APP12-H08-04`).
 *
 * The orchestrator starts both Next apps with `next start`, which serves
 * whatever `.next` happens to be on disk. Nothing built it. A source change was
 * therefore invisible to every browser project until somebody remembered to run
 * `pnpm --filter … build` by hand — and the run did not fail, it *passed*,
 * against stale code, and reported success. That cost `APP12-H08` two full runs
 * before it was diagnosed, and `APP12-N02-A01` re-confirmed it the hard way.
 *
 * The fix is not a reminder. It is this module: the orchestrator builds the apps
 * it is about to start, every time, before it starts them. `next build` is
 * incremental, so an unchanged tree costs a fraction of a cold build; a changed
 * one costs what it should have cost all along.
 *
 * It also reads back each app's `BUILD_ID`, so a run can *state* which build it
 * served rather than assume. That identifier is what makes "this run exercised
 * current source" a fact in the completion report instead of a claim.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

/** Generous: a cold Next production build on a loaded machine is minutes, not seconds. */
const BUILD_TIMEOUT_MS = 900_000;

function resolveNextBin(appDir) {
  const require = createRequire(join(appDir, 'package.json'));
  return require.resolve('next/dist/bin/next');
}

/**
 * The identifier `next start` will serve, read from the build just produced.
 *
 * Present in every page's `__NEXT_DATA__` and on the static asset paths, so a
 * browser assertion can compare what it was served against what was built.
 */
export function readBuildId(appDir) {
  return readFileSync(join(appDir, '.next', 'BUILD_ID'), 'utf8').trim();
}

function runBuild({ name, dir, log }) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, [resolveNextBin(dir), 'build'], {
      cwd: dir,
      // A production build, because a production `next start` is what runs.
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    let output = '';
    const collect = (chunk) => {
      output += String(chunk);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    const kill = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Building ${name} exceeded ${String(BUILD_TIMEOUT_MS)}ms.`));
    }, BUILD_TIMEOUT_MS);

    child.once('error', reject);
    child.once('exit', (code) => {
      clearTimeout(kill);
      if (code !== 0) {
        // The build log is the diagnosis. Bounded, because a Next build prints a
        // page table that would otherwise bury the error that stopped it.
        const tail = output.split(/\r?\n/).slice(-40).join('\n');
        reject(new Error(`Building ${name} failed (exit ${String(code)}):\n${tail}`));
        return;
      }
      log(`built ${name} in ${String(Math.round((Date.now() - startedAt) / 1000))}s`);
      resolve();
    });
  });
}

/**
 * Builds each app and returns the `BUILD_ID` it will serve.
 *
 * Sequential rather than parallel: two concurrent Next builds on one machine
 * contend for the same CPU and the same disk and finish later than they would in
 * order, and a failure is far easier to read when only one build is speaking.
 *
 * @param {{ apps: readonly {name: string, dir: string}[], log: (msg: string) => void }} params
 * @returns {Promise<Record<string, string>>} app name → BUILD_ID
 */
export async function buildNextApps({ apps, log }) {
  const buildIds = {};
  for (const app of apps) {
    log(`building ${app.name} (fresh-build authority, FU-APP12-H08-04)`);
    await runBuild({ ...app, log });
    buildIds[app.name] = readBuildId(app.dir);
    log(`${app.name} BUILD_ID=${buildIds[app.name]}`);
  }
  return buildIds;
}
