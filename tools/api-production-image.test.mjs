/**
 * Regression for the production-only defect `APP2-T01-C1` reproduced.
 *
 * WHAT HAPPENED
 * -------------
 * The API production image shipped `packages/<name>/dist` for every workspace
 * package the runtime loads, but not those packages' `node_modules`. pnpm links
 * in isolated mode: `@nestjs/common` for `@embroidery/persistence` lives at
 * `packages/persistence/node_modules/@nestjs/common`, never at the workspace
 * root. The image therefore built green, started, and exited immediately with
 *
 *   Error: Cannot find module '@nestjs/common'
 *   Require stack: /app/packages/persistence/dist/database.module.js …
 *
 * Nothing before this correction could see it. The development image serves
 * TypeScript over a bind mount and never loads `dist`; `nest build` only
 * compiles; and the T01 gateway smoke ran against that development runtime.
 *
 * WHY THIS TEST IS SHAPED THIS WAY
 * --------------------------------
 * It derives the packages to check from `apps/api/package.json` rather than
 * listing them, so adding a fourth runtime workspace dependency and shipping
 * only its `dist` fails here — at `pnpm test` speed — instead of in a container
 * that a production smoke has to be running to observe.
 *
 * `@embroidery/contracts` is deliberately excluded: it resolves to raw
 * TypeScript and the compiled API must never require it (IMP-D018), which
 * `apps/api/src/**` boundary checks enforce separately.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCKERFILE = readFileSync(
  join(REPO_ROOT, 'infrastructure', 'docker', 'api.Dockerfile'),
  'utf8',
);

/** Never loadable from compiled output; excluded by the IMP-D018 boundary. */
export const RUNTIME_EXCLUDED_WORKSPACE_PACKAGES = ['@embroidery/contracts'];

/** The workspace packages the compiled API loads at runtime. */
function runtimeWorkspacePackages() {
  const api = JSON.parse(readFileSync(join(REPO_ROOT, 'apps', 'api', 'package.json'), 'utf8'));
  return Object.entries(api.dependencies ?? {})
    .filter(
      ([name, range]) => name.startsWith('@embroidery/') && String(range).startsWith('workspace:'),
    )
    .map(([name]) => name)
    .filter((name) => !RUNTIME_EXCLUDED_WORKSPACE_PACKAGES.includes(name))
    .map((name) => name.replace('@embroidery/', ''));
}

/** The `runner` stage only — the earlier stages legitimately copy the tree. */
function runnerStage() {
  const start = DOCKERFILE.indexOf('AS runner');
  assert.ok(start > 0, 'api.Dockerfile must define a `runner` stage');
  return DOCKERFILE.slice(start);
}

test('the API image ships a resolvable runtime for every workspace package', () => {
  const runner = runnerStage();
  const packages = runtimeWorkspacePackages();
  assert.ok(packages.length >= 3, `expected runtime workspace packages, got ${packages.length}`);

  for (const name of packages) {
    // The compiled output.
    assert.match(
      runner,
      new RegExp(`COPY --from=build[^\\n]* /app/packages/${name}/dist `),
      `runner must copy packages/${name}/dist`,
    );
    // Its manifest, so Node resolves the package entry point.
    assert.match(
      runner,
      new RegExp(`COPY --from=build[^\\n]* /app/packages/${name}/package\\.json `),
      `runner must copy packages/${name}/package.json`,
    );
    // And its own dependencies — the piece whose absence produced
    // `Cannot find module '@nestjs/common'` at startup.
    assert.match(
      runner,
      new RegExp(`COPY --from=prod-deps[^\\n]* /app/packages/${name}/node_modules `),
      `runner must copy packages/${name}/node_modules`,
    );
  }
});

test('the production install covers the API workspace dependencies', () => {
  // `@embroidery/api` alone installs only `apps/api/node_modules`. The ellipsis
  // is what makes the workspace packages importers of the install, and so what
  // makes their `node_modules` exist at all.
  assert.match(
    DOCKERFILE,
    /pnpm install --frozen-lockfile --prod --filter "@embroidery\/api\.\.\."/,
  );

  // An importer with no manifest in the build context is not installed, so each
  // runtime workspace package must have its `package.json` copied first.
  const prodDeps = DOCKERFILE.slice(
    DOCKERFILE.indexOf('AS prod-deps'),
    DOCKERFILE.indexOf('AS runner'),
  );
  for (const name of runtimeWorkspacePackages()) {
    assert.match(
      prodDeps,
      new RegExp(`COPY packages/${name}/package\\.json packages/${name}/`),
      `prod-deps must copy packages/${name}/package.json`,
    );
  }
});

test('the production runtime is the compiled entrypoint, not a dev server', () => {
  const runner = runnerStage();
  assert.match(runner, /ENV NODE_ENV=production/);
  assert.match(runner, /CMD \["node", "dist\/main\.js"\]/);
  assert.match(runner, /USER node/);
  // Raw TypeScript is never shipped into the production image.
  assert.doesNotMatch(runner, /\/app\/packages\/\w[\w-]*\/src/);
});
