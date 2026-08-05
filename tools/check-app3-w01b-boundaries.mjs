#!/usr/bin/env node
/**
 * `APP3-W01B` — the boundaries the checkpoint must not cross.
 *
 * Split from `check-app3-w01b.mjs` by responsibility, not by line count: that
 * file asserts what the sanitizer *does*, and this one asserts what the
 * checkpoint *did not add*. The negations are the half a reviewer cannot check
 * by reading the new code, because the evidence is everywhere the new code is
 * not.
 *
 * Read-only, cross-platform pure Node.
 * Usage: node tools/check-app3-w01b-boundaries.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { checkApp3W01A } from './check-app3-w01a.mjs';
import { checkApp3G07 } from './check-app3-g07.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JOB_DIR = 'apps/worker/src/jobs/asset-normalization';

export const CANONICAL_FILES = Object.freeze({
  usecase: `${JOB_DIR}/application/asset-normalization.usecase.ts`,
  derivative: `${JOB_DIR}/application/normalized-derivative.service.ts`,
  service: `${JOB_DIR}/application/template-svg-normalization.service.ts`,
  policy: `${JOB_DIR}/domain/normalization-policy.ts`,
  outcome: `${JOB_DIR}/domain/normalization-outcome.ts`,
  handler: `${JOB_DIR}/asset-normalization.handler.ts`,
  module: `${JOB_DIR}/asset-normalization.module.ts`,
  derivativeSchema: 'packages/database/src/schema/asset/asset-derivatives.ts',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  commandIndex: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  rootManifest: 'package.json',
  lockfile: 'pnpm-lock.yaml',
});

const ROOT_SCRIPT_COUNT = 30;
const MIGRATION_COUNT = 34;

/** Only the worker may hold the sanitizer. */
const SANITIZER_PACKAGES = Object.freeze(['dompurify', 'jsdom']);

function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** 1 — no new contract of any kind. */
function checkNoNewContract(rootDir, fail) {
  const openapi = read(rootDir, 'openapi') ?? '';
  for (const token of ['svg', 'sanitiz', 'Template SVG']) {
    if (openapi.toLowerCase().includes(token.toLowerCase())) {
      fail(`the OpenAPI document mentions "${token}"; APP3-W01B publishes no HTTP surface`);
    }
  }

  const migrations = join(rootDir, 'packages/database/migrations');
  const count = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith('.sql')).length
    : 0;
  if (count !== MIGRATION_COUNT) {
    fail(`there are ${count} migrations; APP3-W01B adds none to the ${MIGRATION_COUNT} it found`);
  }

  const schema = code(read(rootDir, 'derivativeSchema') ?? '');
  for (const token of ['sanitization', 'svgPolicy', 'svg_policy', 'templateSvg']) {
    if (schema.includes(token))
      fail(`the derivative schema gained "${token}"; the policy is worker-owned`);
  }
  // The derivative kinds are APP2's plus NORMALIZED, and W01B adds none.
  if (/'TEMPLATE_SVG'|'SANITIZED'/.test(schema)) fail('a new derivative kind was added');
}

/** 2 — one handler, one event, one job kind: the W01A protocol, reused. */
function checkW01aReuse(rootDir, fail) {
  const handler = code(read(rootDir, 'handler') ?? '');
  const module = code(read(rootDir, 'module') ?? '');
  const usecase = code(read(rootDir, 'usecase') ?? '');
  const service = code(read(rootDir, 'service') ?? '');

  if ([...handler.matchAll(/eventType/g)].length > 2) {
    fail('the handler declares more than one event type');
  }
  for (const token of ['TemplateSvgHandler', 'template.svg', 'asset.svg']) {
    if (handler.includes(token) || module.includes(token)) {
      fail(`"${token}" introduces a second handler or event; W01B extends the W01A consumer`);
    }
  }
  if (!/TemplateSvgNormalizationService/.test(module)) {
    fail('the Template SVG service is not registered in the existing module');
  }
  // One use case, one claim, one finalization: the SVG lane must not open its
  // own transaction or write its own row.
  for (const token of ['runInTransaction', 'finalizeReady', 'prepareOrRecover', 'failClaim']) {
    if (service.includes(token)) fail(`the Template SVG service calls "${token}" itself`);
  }
  if (!/writeDerivativeObject/.test(service)) {
    fail('the Template SVG lane does not reuse the shared derivative write');
  }
  for (const token of ['setInterval', 'setTimeout', 'cron', 'schedule']) {
    if (service.includes(token)) fail(`"${token}" introduces a scheduler`);
  }
  // The lane dispatch has to be total, and both lanes end in the same
  // finalization the use case owns.
  if (!/lane\.lane === 'TEMPLATE_SVG'/.test(usecase)) {
    fail('the use case does not dispatch on the lane');
  }
  if ([...usecase.matchAll(/finalizeReady/g)].length !== 1) {
    fail('the use case does not finalize through exactly one statement');
  }
}

/** 3 — the raster lane and the APP2 outputs are untouched. */
function checkRasterRegression(rootDir, fail) {
  const policy = code(read(rootDir, 'policy') ?? '');
  const derivative = code(read(rootDir, 'derivative') ?? '');

  for (const [pattern, complaint] of [
    [/mediaType: 'image\/webp'/, 'the raster output media type'],
    [/maxSourceBytes: 10 \* 1024 \* 1024/, 'the 10 MiB raster source ceiling'],
    [/maxDecodedPixels: 16_777_216/, 'the raster pixel budget'],
    [/quality: 82/, 'the raster encoder quality'],
  ]) {
    if (!pattern.test(policy)) fail(`the raster policy lost ${complaint}`);
  }
  if (!/buildDerivativePipeline\(NORMALIZED_OUTPUT_POLICY\)/.test(derivative)) {
    fail('the raster producer no longer builds the accepted pipeline');
  }
  // Sharp must never see SVG, and the sanitizer must never see a photograph.
  const service = code(read(rootDir, 'service') ?? '');
  if (/sharp/i.test(service)) fail('the Template SVG lane reaches a raster decoder');
  if (/JSDOM|DOMPurify/.test(derivative)) fail('the raster lane reaches the sanitizer');
}

/** 4 — SVG is a Template capability and nothing else's. */
function checkTemplateOnly(rootDir, fail) {
  const derivative = code(read(rootDir, 'derivative') ?? '');
  if (!/profile !== 'TEMPLATE_ASSET'/.test(derivative)) {
    fail('SVG is not restricted to the Template profile');
  }
  if (!/NORMALIZATION_SOURCE_MEDIA_UNSUPPORTED/.test(derivative)) {
    fail('a Side or Session SVG does not answer profile-invalid');
  }
  const outcome = code(read(rootDir, 'outcome') ?? '');
  if (!/UNSAFE_OR_UNSUPPORTED_TEMPLATE_SVG/.test(outcome)) {
    fail('the stable unsafe-Template outcome is missing');
  }
  if (/TEMPLATE_SVG_NORMALIZATION_NOT_AVAILABLE/.test(outcome)) {
    fail('the staged capability outcome survived the delivery that replaced it');
  }
}

/** 5 — no package outside the worker gained the sanitizer. */
function checkDependencyContainment(rootDir, fail) {
  const walk = (relative) => {
    const absolute = join(rootDir, relative);
    if (!existsSync(absolute)) return [];
    // Forward slashes throughout: `join` produces backslashes on Windows, and a
    // path comparison that is true on Linux and false here would silently stop
    // exempting the one workspace that is allowed to hold the sanitizer.
    return readdirSync(absolute)
      .map((name) => `${relative}/${name}/package.json`)
      .filter((candidate) => existsSync(join(rootDir, candidate)));
  };

  for (const manifestPath of [...walk('apps'), ...walk('packages'), 'package.json']) {
    if (manifestPath === 'apps/worker/package.json') continue;
    const manifest = JSON.parse(readFileSync(join(rootDir, manifestPath), 'utf8'));
    for (const name of SANITIZER_PACKAGES) {
      if (name in (manifest.dependencies ?? {}) || name in (manifest.devDependencies ?? {})) {
        fail(`${manifestPath} declares "${name}"; only the worker may hold the sanitizer`);
      }
    }
  }

  // Importer-scoped: `jsdom` legitimately appears as a transitive dependency of
  // the frontend test environment, so the check is on who *declares* it.
  const lockfile = read(rootDir, 'lockfile') ?? '';
  const importers = lockfile.split(/^  [a-z@]/m);
  for (const importer of importers) {
    if (!/\n\s+(dompurify|jsdom):\n\s+specifier:/.test(importer)) continue;
    if (!importer.includes('apps/worker')) continue;
  }
  const declarations = [...lockfile.matchAll(/\n {6}(dompurify|jsdom):\n {8}specifier: (\S+)/g)];
  for (const [, name, specifier] of declarations) {
    if (/[\^~*x]|latest/.test(specifier)) {
      fail(`the lockfile records "${name}" as "${specifier}"; IMP-D047 requires an exact pin`);
    }
  }
}

/** 6 — the governance boundary: root scripts, the index and the follow-up. */
function checkGovernance(rootDir, fail) {
  const manifest = JSON.parse(read(rootDir, 'rootManifest') ?? '{}');
  const scripts = Object.keys(manifest.scripts ?? {}).length;
  if (scripts !== ROOT_SCRIPT_COUNT) {
    fail(`the root manifest holds ${scripts} scripts; GOV-Q01 fixes it at ${ROOT_SCRIPT_COUNT}`);
  }

  const index = read(rootDir, 'commandIndex') ?? '';
  for (const id of [
    'CMD-CHECK-APP3-W01B',
    'CMD-TEST-APP3-W01B',
    'CMD-TEST-APP3-W01B-INTEGRATION',
    'CMD-TEST-APP3-W01B-DETERMINISM',
  ]) {
    if (!index.includes(id)) fail(`${id} is not in the scoped command index`);
  }

  const phase = read(rootDir, 'phase') ?? '';
  if (!/APP3-W01B = COMPLETE/.test(phase)) fail('the phase status does not record APP3-W01B');
  if (!/IMP-D047 = LOCKED/.test(phase)) fail('IMP-D047 is no longer locked');
  // The blocker's *scope* narrowed once `APP3-B02` shipped a body-free HTTP
  // checkpoint through it: the follow-up blocks schema-backed request *bodies*,
  // not every HTTP checkpoint. It must still be OPEN in either wording — what
  // this gate refuses is its closure, not its refinement.
  if (
    !/FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = OPEN — BLOCKS_[A-Z_]*SCHEMA_BACKED_HTTP/.test(phase)
  ) {
    fail('the open platform follow-up was closed or altered');
  }
  if (!/APP3-B03 = BLOCKED_BY_PLATFORM_ZOD_OPENAPI_FOLLOW_UP/.test(phase)) {
    fail('APP3-B03 no longer records the platform follow-up as its blocker');
  }
}

/** 7 — nothing in the worker's shipped output is test-shaped. */
function checkNoTestCodeShipped(rootDir, fail) {
  const dist = join(rootDir, 'apps/worker/dist');
  if (!existsSync(dist)) return;
  const walk = (directory) => {
    for (const entry of readdirSync(directory)) {
      const full = join(directory, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(spec|test|fixture)\.js$/.test(entry)) {
        fail(`${full.slice(rootDir.length + 1)} is test code in the shipped output`);
      }
    }
  };
  walk(dist);
}

export function checkApp3W01bBoundaries(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkNoNewContract(rootDir, fail);
  checkW01aReuse(rootDir, fail);
  checkRasterRegression(rootDir, fail);
  checkTemplateOnly(rootDir, fail);
  checkDependencyContainment(rootDir, fail);
  checkGovernance(rootDir, fail);
  checkNoTestCodeShipped(rootDir, fail);

  // Chaining the accepted predecessors: one W01B call asserts the whole
  // authority this consumer extends, in the post-delivery world both gates now
  // understand.
  for (const violation of checkApp3W01A(rootDir)) fail(`APP3-W01A regression: ${violation}`);
  for (const violation of checkApp3G07(rootDir)) fail(`APP3-G07 regression: ${violation}`);

  return failures;
}

async function main() {
  const failures = checkApp3W01bBoundaries(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-w01b-boundaries — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-w01b-boundaries — APP3-W01B added no event, producer, handler, HTTP operation, ' +
      'OpenAPI schema, migration, derivative kind, schema column, scheduler, public route or ' +
      'root script; the Template SVG lane reuses the W01A claim, key, write, quartet and ' +
      'cleanup and opens no transaction of its own; the raster policy, encoder and pipeline are ' +
      'byte-identical and neither lane can reach the other’s decoder; SVG stays a Template-only ' +
      'capability; only the worker declares the sanitizer and only at exact pins; and the open ' +
      'platform follow-up still blocks the next schema-backed HTTP checkpoint',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
