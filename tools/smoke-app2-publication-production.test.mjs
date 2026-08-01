// APP2-A04-C1 — Docker-free regressions for the isolated production smoke.
//
// These run in the ordinary `tools/*.test.mjs` aggregation (`pnpm test`), so the
// harness's isolation, cleanup and credential rules are enforced on every
// quality run without anyone starting Docker. The Docker smoke itself is
// deliberately NOT part of `pnpm quality`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  ACTIVE_DEV_NEXT,
  DEV_PROJECT,
  GATEWAY_ADMIN_HOST,
  argsAreCredentialFree,
  classifyAdminRuntime,
  cleanupPlan,
  composeArgs,
  dockerignoreIsolatesNext,
  gatewayUrl,
  phasePlan,
  productionImageTag,
  productionOverrideYaml,
  redactSecrets,
  removeImageArgs,
  restoreArgs,
} from './smoke-app2-publication-production.mjs';
import { TOUCH_TARGET_EXCLUSIONS, TOUCH_TARGET_MIN } from './smoke-app2-publication-targets.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS = readFileSync(
  join(REPO_ROOT, 'tools', 'smoke-app2-publication-production.mjs'),
  'utf8',
);
const BROWSER = readFileSync(
  join(REPO_ROOT, 'tools', 'smoke-app2-publication-browser.mjs'),
  'utf8',
);
const TARGETS = readFileSync(
  join(REPO_ROOT, 'tools', 'smoke-app2-publication-targets.mjs'),
  'utf8',
);
const ENV_FILE = join(REPO_ROOT, '.env');

// --- 1. isolated output differs from the active dev `.next` ------------------

test('the production build never consumes or writes the active dev .next', () => {
  const dockerignore = readFileSync(join(REPO_ROOT, '.dockerignore'), 'utf8');
  // The real isolation guarantee: build output cannot enter the build context,
  // so `next build` inside the image can neither read nor overwrite the
  // workspace output the dev container is serving from.
  assert.equal(dockerignoreIsolatesNext(dockerignore), true);
  assert.equal(dockerignoreIsolatesNext('**/dist\nnode_modules'), false);
});

test('the swapped Admin runs from the image, not the bind-mounted working tree', () => {
  const yaml = productionOverrideYaml(productionImageTag('seed'));
  // `!reset` on volumes is what makes the runtime genuinely production: without
  // it Compose merges the dev source mounts back in over the built image.
  assert.match(yaml, /volumes: !reset \[\]/);
  assert.match(yaml, /build: !reset null/);
  assert.match(yaml, /NODE_ENV: production/);
  assert.equal(yaml.includes(ACTIVE_DEV_NEXT), false);
});

test('each run gets its own image tag', () => {
  assert.notEqual(productionImageTag('a1'), productionImageTag('b2'));
  assert.match(productionImageTag('a1'), /^embroidery-a04c1-admin-prod:/);
});

// --- 2/3. cleanup runs after success AND after failure ----------------------

test('cleanup is planned from what changed, not from whether the smoke passed', () => {
  const success = cleanupPlan({ swapped: true, imageTag: 'img:1', envFile: ENV_FILE });
  const failure = cleanupPlan({ swapped: true, imageTag: 'img:1', envFile: ENV_FILE });
  // Identical plans: the teardown path cannot diverge on outcome, which is the
  // property that keeps a thrown assertion from parking the dev stack.
  assert.deepEqual(success, failure);
  assert.deepEqual(
    success.map((s) => s.step),
    ['restore-dev-admin', 'remove-image'],
  );
});

test('the teardown plan is executed from a finally block', () => {
  const finallyIndex = HARNESS.indexOf('} finally {');
  const cleanupIndex = HARNESS.indexOf('for (const { step, args } of cleanupPlan(');
  assert.ok(finallyIndex > 0, 'harness has a finally block');
  assert.ok(cleanupIndex > finallyIndex, 'cleanup executes inside finally');
});

test('the throwaway image is removed even when nothing was swapped', () => {
  const plan = cleanupPlan({ swapped: false, imageTag: 'img:1', envFile: ENV_FILE });
  assert.deepEqual(
    plan.map((s) => s.step),
    ['remove-image'],
  );
  assert.deepEqual(plan[0].args, removeImageArgs('img:1'));
});

// --- 4. dev-service restore is mandatory ------------------------------------

test('restore recreates the dev Admin from the dev Compose file alone', () => {
  const args = restoreArgs(ENV_FILE);
  // Restoring through an override would leave the production image in place.
  assert.equal(
    args.some((a) => String(a).includes('production-admin.yml')),
    false,
  );
  assert.match(args.join(' '), /docker-compose\.dev\.yml/);
  assert.ok(args.includes('--force-recreate'));
  assert.equal(args.at(-1), 'admin');
});

test('a swapped run always plans the restore step first', () => {
  const plan = cleanupPlan({ swapped: true, imageTag: 'img:1', envFile: ENV_FILE });
  assert.equal(plan[0].step, 'restore-dev-admin');
});

// --- 5. gateway target ------------------------------------------------------

test('scenarios address the canonical gateway host, never a direct app port', () => {
  assert.equal(GATEWAY_ADMIN_HOST, 'admin.embroidery.local');
  assert.equal(gatewayUrl('/products'), 'http://admin.embroidery.local/products');
  assert.equal(/:300\d/.test(BROWSER), false, 'no direct Next port in browser scenarios');
  assert.equal(/localhost:300\d/.test(HARNESS), false, 'no direct Next port in harness');
});

test('the override keeps the developer Compose project so the gateway resolves it', () => {
  assert.match(productionOverrideYaml('img:1'), new RegExp(`name: ${DEV_PROJECT}`));
});

test('runtime classification separates the production server from the dev server', () => {
  assert.equal(
    classifyAdminRuntime({ command: 'node apps/admin/server.js', nodeEnv: 'production' }),
    'production',
  );
  assert.equal(
    classifyAdminRuntime({
      command: 'pnpm --filter @embroidery/admin dev',
      nodeEnv: 'development',
    }),
    'development',
  );
  // A standalone server started without the production discriminator must not
  // be accepted as proof of a production runtime.
  assert.equal(
    classifyAdminRuntime({ command: 'node apps/admin/server.js', nodeEnv: '' }),
    'unknown',
  );
});

// --- 6. credentials absent from arguments and output ------------------------

test('no credential can reach an argument vector', () => {
  const secret = 'sup3r-secret-value';
  assert.equal(argsAreCredentialFree(['compose', 'up', '-d'], [secret]), true);
  assert.equal(argsAreCredentialFree(['--password', secret], [secret]), false);
  // The compose invocation passes the env FILE, never a value out of it.
  const args = composeArgs(['a.yml'], ENV_FILE);
  assert.ok(args.includes('--env-file'));
  assert.equal(argsAreCredentialFree(args, [secret]), true);
});

test('secrets are redacted from anything the harness prints', () => {
  const secret = 'sup3r-secret-value';
  assert.equal(redactSecrets(`login=${secret} ok`, [secret]), 'login=<redacted> ok');
  assert.equal(redactSecrets('nothing here', [secret]), 'nothing here');
  assert.equal(redactSecrets('x', ['']), 'x');
});

test('neither file reads a secret out of the repository .env', () => {
  for (const [name, source] of [
    ['harness', HARNESS],
    ['browser', BROWSER],
  ]) {
    assert.equal(
      /readFileSync\([^)]*['"]\.env['"]/.test(source),
      false,
      `${name} must not read .env contents`,
    );
    assert.equal(/dotenv/.test(source), false, `${name} must not load .env`);
  }
  // The credential is supplied per run by the operator, through the environment.
  assert.match(HARNESS, /SMOKE_ADMIN_PASSWORD/);
  assert.match(BROWSER, /process\.env\.SMOKE_ADMIN_PASSWORD/);
});

test('the browser scenarios never write a credential into their output', () => {
  assert.equal(/console\.log\([^)]*PASSWORD/.test(BROWSER), false);
  assert.equal(/console\.log\([^)]*EMAIL/.test(BROWSER), false);
});

// --- mobile touch-target coverage (APP2-A04-C1 scope extension) --------------

test('the 44px threshold matches the approved styles token', () => {
  assert.equal(TOUCH_TARGET_MIN, 44);
  const layout = readFileSync(
    join(REPO_ROOT, 'packages', 'styles', 'src', 'settings', '_layout.scss'),
    'utf8',
  );
  // The smoke and the stylesheet must not be able to drift apart: the harness
  // asserts the same number the fix is built from.
  assert.match(layout, /\$size-touch-target-min:\s*44px/);
});

test('the publication back link is fixed with the approved token, not a literal', () => {
  const scss = readFileSync(
    join(
      REPO_ROOT,
      'apps',
      'admin',
      'src',
      'features',
      'products',
      'styles',
      'product-publication.scss',
    ),
    'utf8',
  );
  const rule = /\.product-publication__back\s*\{[\s\S]*?\n\}/.exec(scss)?.[0] ?? '';
  assert.ok(rule, 'back-link rule exists');
  assert.match(rule, /min-height:\s*styles\.\$size-touch-target-min/);
  assert.match(rule, /align-items:\s*center/);
  assert.match(rule, /display:\s*inline-flex/);
  // No hardcoded pixel target may replace the token.
  assert.equal(/min-height:\s*\d+px/.test(rule), false);
});

test('the back link stays a semantic link on its existing route', () => {
  const screen = readFileSync(
    join(
      REPO_ROOT,
      'apps/admin/src/features/products/components/product-publication-screen.tsx'.replace(
        /\//g,
        sep,
      ),
    ),
    'utf8',
  );
  // The fix must not turn navigation into a button or change where it goes.
  assert.match(screen, /<Link className="product-publication__back" href={ADMIN_PRODUCTS_ROUTE}>/);
});

test('the skip-link exclusion is a closed, named list', () => {
  assert.deepEqual([...TOUCH_TARGET_EXCLUSIONS], ['admin-shell__skip-link']);
  assert.equal(Object.isFrozen(TOUCH_TARGET_EXCLUSIONS), true);
  // A pattern-based exclusion could silently grow to swallow real failures.
  assert.equal(/exclusions.*=.*\/.*\//i.test(TARGETS), false);
});

test('the back link cannot be filtered out of touch-target measurement', () => {
  // Only the named exclusion list is consulted — no ad-hoc selector skipping.
  assert.ok(TARGETS.includes('allowed.includes(control.className)'));
  for (const forbidden of ['product-publication__back', 'publish-action', 'unpublish-action']) {
    assert.equal(
      TOUCH_TARGET_EXCLUSIONS.includes(forbidden),
      false,
      `${forbidden} must never be excluded`,
    );
  }
});

test('touch targets are measured in every A04 state that owns controls', () => {
  for (const state of ['blocked-draft', 'ready-draft', 'published', 'unpublish-dialog']) {
    assert.ok(BROWSER.includes(`'${state}'`), `state ${state} is measured`);
  }
  // Computed geometry, not a class-name proxy.
  assert.match(TARGETS, /getBoundingClientRect\(\)/);
  assert.match(TARGETS, /box\.height < min/);
});

test('an undersized control is reported with selector, name and size', () => {
  assert.match(TARGETS, /selector:/);
  assert.match(TARGETS, /name:/);
  assert.match(TARGETS, /height:/);
  assert.match(TARGETS, /width:/);
});

// --- 7. downstream commands are absent --------------------------------------

test('the harness starts nothing downstream of A04', () => {
  for (const marker of ['B04', 'S01', 'S02', 'E01', 'T01', 'san-pham', 'storefront']) {
    assert.equal(
      HARNESS.includes(marker),
      false,
      `harness must not reference downstream marker ${marker}`,
    );
  }
  // The smoke swaps only the Admin service; no other service is recreated.
  assert.equal(/'(api|worker|postgres|minio|storefront)'/.test(HARNESS), false);
});

test('the phase plan is bounded and ends in restore then cleanup', () => {
  const phases = phasePlan();
  assert.deepEqual(phases.slice(-2), ['restore', 'cleanup']);
  assert.equal(phases.length, 6);
});

test('every wait is bounded so a hung container fails instead of parking', () => {
  assert.match(HARNESS, /BUILD_TIMEOUT_MS = \d/);
  assert.match(HARNESS, /WAIT_TIMEOUT_SECONDS = '\d+'/);
  assert.match(HARNESS, /'--wait-timeout'/);
});
