#!/usr/bin/env node
/**
 * `APP3-E01` — the cross-layer acceptance run.
 *
 * ## What it does, in order
 *
 * 1. brings up the run's isolated client identities (`smoke-app3-e01-runners`);
 * 2. points the Session origin allow-list at exactly the origins they serve;
 * 3. seeds the Template fixtures, idempotently, so a second run needs no SQL;
 * 4. runs every journey;
 * 5. restores everything it changed, whether the journeys passed or not.
 *
 * ## What it refuses to do
 *
 * It never forges a header to buy Session capacity, never waits out a rate
 * window, and never restarts the API to clear a counter — the three shortcuts
 * `APP3-E01` closed as a security defect, a lie about runtime, and a defeat of
 * the control the phase depends on. Capacity comes from real distinct sources.
 *
 * ## Usage
 *
 *     node tools/smoke-app3-e01.mjs            # the whole run
 *     node tools/smoke-app3-e01.mjs --only=mobile
 *     node tools/smoke-app3-e01.mjs --keep     # leave the topology up
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NETWORK,
  RUNNER_ROLES,
  allowedOrigins,
  containerFor,
  identitiesAreDistinct,
  originFor,
  removeArgs,
  runnerArgs,
} from './smoke-app3-e01-runners.mjs';
import { report } from './smoke-app3-e01-journey.mjs';
import { STUDIO_JOURNEYS } from './smoke-app3-e01-studio.mjs';
import { SECURITY_JOURNEYS } from './smoke-app3-e01-security.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Journeys in the order a customer would meet them. */
const JOURNEYS = Object.freeze({ ...STUDIO_JOURNEYS, ...SECURITY_JOURNEYS });

function docker(args, { quiet = true } = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  if (result.status !== 0 && !quiet) {
    throw new Error(`docker ${args[0]} failed: ${result.stderr.trim()}`);
  }
  return result;
}

function node(script, args = [], env = {}) {
  execFileSync(process.execPath, [join(REPO_ROOT, 'tools', script), ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
}

/** Bring up one forwarder per identity, replacing any left by an earlier run. */
function startIdentities() {
  if (!identitiesAreDistinct()) {
    throw new Error(
      'APP3-E01: two roles share an address or a port; capacity would not be isolated',
    );
  }
  for (const role of RUNNER_ROLES) {
    docker(removeArgs(role));
    docker(runnerArgs({ role }), { quiet: false });
  }
}

function stopIdentities() {
  for (const role of RUNNER_ROLES) docker(removeArgs(role));
}

/** Every identity's forwarder actually forwards, before a journey depends on it. */
async function verifyIdentities() {
  const facts = [];
  for (const role of RUNNER_ROLES) {
    const origin = originFor(role);
    const status = await fetch(`${origin}/healthz`)
      .then((response) => response.status)
      .catch((error) => String(error.message ?? error));
    facts.push({
      name: `identity ${role} reaches the gateway`,
      ok: status === 200,
      detail: `${origin} -> ${String(status)}`,
    });
  }
  return report('identities — real distinct sources, verified before use', facts);
}

/**
 * Wait until the recreated API answers, before any journey depends on it.
 *
 * Not a rate-limit wait — this polls a health route, which is not rate limited,
 * and stops the moment it answers. It exists because pointing the origin
 * allow-list at the run's origins force-recreates the API, and a journey that
 * starts during that window meets `APP3-S01`'s placement ERROR state, which is
 * correct behaviour and does not retry on its own. Measured while writing this
 * run: the 390 journey failed twice against a still-starting API and passed
 * immediately afterwards, with no code change between.
 */
async function waitForApi(origin, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await fetch(`${origin}/api/health`)
      .then((response) => response.status)
      .catch(() => 0);
    if (status === 200) return attempt;
    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });
  }
  throw new Error('APP3-E01: the API never became healthy after the origin allow-list was applied');
}

async function main() {
  const only = process.argv.find((argument) => argument.startsWith('--only='))?.slice(7);
  const keep = process.argv.includes('--keep');
  const selected = only === undefined ? Object.keys(JOURNEYS) : [only];
  for (const name of selected) {
    if (JOURNEYS[name] === undefined) throw new Error(`unknown journey "${name}"`);
  }

  let ok = true;
  startIdentities();
  try {
    // Exactly the origins this run serves, and nothing else. `APP3-S01` §26's
    // helper, pointed at the truth rather than widened.
    node('smoke-app3-s01-trustworthy-origin.mjs', ['apply'], {
      S01_TRUSTWORTHY_ORIGIN: allowedOrigins(),
    });
    const waited = await waitForApi(originFor(RUNNER_ROLES[0]));
    console.log(`api ready after ${String(waited)}s`);
    /*
     * Recreate the worker, because "Up" does not mean "consuming".
     *
     * Found by this run: the development worker had fail-fast-ed at boot on
     * Postgres `57P03` (still starting) hours earlier, closed its pool, and
     * stayed "Up 6 hours" while consuming nothing — so every Session upload
     * since had sat at `INSPECTING` and the upload journey would have reported a
     * product defect that was an environment one. Recreating it here means the
     * journey's verdict is about the pipeline rather than about boot order.
     */
    docker(['restart', 'embroidery-dev-worker-1'], { quiet: false });
    node('smoke-app3-s01-fixtures.mjs', ['seed']);

    ok = (await verifyIdentities()) && ok;
    /*
     * A journey that throws is a failed journey, not a failed run.
     *
     * Every journey has its own client identity and its own Session budget, so
     * one of them falling over tells the others nothing — and stopping there
     * would spend a Session on each rerun to re-learn what this run already
     * knew. The throw is recorded as the fact it is and the run continues.
     */
    for (const name of selected) {
      try {
        const { title, facts } = await JOURNEYS[name]();
        ok = report(title, facts) && ok;
      } catch (error) {
        ok =
          report(`${name} — did not complete`, [
            {
              name: 'the journey ran to its end',
              ok: false,
              // The call log, not just the headline: "click timed out" names no
              // control, and a rerun to find out which one costs a Session.
              detail: String(error?.message ?? error)
                .split('\n')
                .slice(0, 6)
                .join(' | '),
            },
          ]) && ok;
      }
    }
  } finally {
    if (!keep) {
      node('smoke-app3-s01-fixtures.mjs', ['revert']);
      node('smoke-app3-s01-trustworthy-origin.mjs', ['restore']);
      stopIdentities();
    }
  }

  console.log(`\nAPP3-E01: ${ok ? 'every journey held' : 'AT LEAST ONE JOURNEY FAILED'}`);
  process.exitCode = ok ? 0 : 1;
}

await main();

export { JOURNEYS, NETWORK, containerFor };
