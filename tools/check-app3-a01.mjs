#!/usr/bin/env node
/**
 * `APP3-A01` — Admin Product placement authoring.
 *
 * The first APP3 frontend checkpoint, so this gate asserts two different kinds
 * of thing:
 *
 * *That the authority to build it exists.* `D01`/`D01-C1` accepted, the design
 * rows A01/A02/A03 need actually `APPROVED_FOR_IMPLEMENTATION` in the registry,
 * and `B01`/`B01-C1` accepted. A frontend checkpoint that began without those
 * is the failure `FIGMA_DESIGN_INDEX` §2 exists to prevent.
 *
 * *That the screen stayed inside its checkpoint.* One route, two generated
 * operations, no contract change, no backend or Figma mutation.
 *
 * Both directions are asserted wherever an absence carries meaning. "No public
 * placement operation is imported" is checked as a real absence, not inferred
 * from the presence of the Admin pair — a screen can import both.
 *
 * This gate does **not** read the completion report. A report is a claim; every
 * fact below is recomputed from the repository.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkA01BackgroundPreview } from './check-app3-a01-background.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const PHASE_PLAN = join(
  REPO_ROOT,
  'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
);
const REGISTRY = join(REPO_ROOT, 'docs/design/FIGMA_DESIGN_INDEX.md');
const ADMIN = join(REPO_ROOT, 'apps/admin');
const FEATURE = join(ADMIN, 'src/features/product-placement');
const ROUTE = join(ADMIN, 'src/app/(protected)/products/[productId]/placement/page.tsx');
const STYLESHEET = join(FEATURE, 'styles/product-placement.scss');
const SHARED_FIELD = join(ADMIN, 'src/shared/forms/admin-text-field.tsx');
const OPENAPI = join(REPO_ROOT, 'packages/contracts/openapi/openapi.generated.json');
const CLIENT = join(REPO_ROOT, 'packages/api-client/src/generated/embroidery-api.ts');
const CURATED_CLIENT = join(REPO_ROOT, 'packages/api-client/src/index.ts');
const BACKGROUND_SERVICE = join(FEATURE, 'services/side-background.service.ts');
const BACKGROUND_HOOK = join(FEATURE, 'hooks/use-side-background.ts');
const PREVIEW = join(FEATURE, 'components/placement-preview.tsx');
const SCREEN = join(FEATURE, 'components/product-placement-screen.tsx');

const failures = [];
const checks = [];

function check(label, condition, detail = '') {
  checks.push(label);
  if (!condition) {
    failures.push(detail === '' ? label : `${label} — ${detail}`);
  }
}

const read = (path) => readFileSync(path, 'utf8');

/** Comments explain what a file deliberately avoids; rules must not match them. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function collect(dir, pattern) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collect(full, pattern));
    else if (pattern.test(entry.name)) files.push(full);
  }
  return files;
}

// ---------------------------------------------------------------------------
// 1 · Entry authority
// ---------------------------------------------------------------------------
const plan = read(PHASE_PLAN);

for (const [id, expected] of [
  ['APP3-D01', 'COMPLETE — REVIEW_ACCEPTED'],
  ['APP3-D01-C1', 'COMPLETE — REVIEW_ACCEPTED'],
  ['APP3-B01', 'COMPLETE — REVIEW_ACCEPTED'],
  ['APP3-B01-C1', 'COMPLETE — REVIEW_ACCEPTED'],
]) {
  check(
    `entry: ${id} is accepted`,
    plan.includes(`\n${id} = ${expected}`),
    `phase plan does not record "${id} = ${expected}"`,
  );
}

check(
  'entry: the frontend gate is open',
  /\nFRONTEND_GATE = OPEN —/.test(plan),
  'FRONTEND_GATE is not recorded as OPEN',
);

// ---------------------------------------------------------------------------
// 2 · Design registry — the rows A01 actually renders from
// ---------------------------------------------------------------------------
const registry = read(REGISTRY);

/** Reads one registry row's status column. */
function rowStatus(id) {
  const line = registry.split('\n').find((row) => row.startsWith(`| ${id} |`));
  if (line === undefined) return null;
  return (line.split('|')[8] ?? '').trim();
}

const A01_ROWS = [
  'FIG-ADMIN-PLACEMENT-DESKTOP-DEFAULT',
  'FIG-ADMIN-PLACEMENT-DESKTOP-AREAEDIT',
  'FIG-ADMIN-PLACEMENT-DESKTOP-VALIDATION',
  'FIG-ADMIN-PLACEMENT-DESKTOP-LOADING',
  'FIG-ADMIN-PLACEMENT-NARROW-1280',
];

for (const id of A01_ROWS) {
  check(
    `design: ${id} is approved for implementation`,
    rowStatus(id) === 'APPROVED_FOR_IMPLEMENTATION',
    `status is ${String(rowStatus(id))}`,
  );
}

for (const id of ['FIG-DS-INPUT', 'FIG-DS-SCRIM-TOKEN']) {
  check(
    `design: ${id} is canonical and approved`,
    rowStatus(id) === 'APPROVED_FOR_IMPLEMENTATION',
    `status is ${String(rowStatus(id))}`,
  );
}

// The other direction: approval is scoped, not blanket. A Studio screen whose
// checkpoint has not opened must still be unapproved, or this gate would pass
// on a registry that had silently licensed the whole phase.
check(
  'design: Studio rows are still unapproved',
  rowStatus('FIG-STUDIO-STAGE-DESKTOP-SELECTED') === 'REVIEW_REQUIRED',
  'a Studio screen row was approved without its checkpoint',
);
check(
  'design: A04 lifecycle rows are still unapproved',
  rowStatus('FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-READY') === 'REVIEW_REQUIRED',
  'an A04 row was approved without its checkpoint',
);

// ---------------------------------------------------------------------------
// 3 · One screen, one protected route
// ---------------------------------------------------------------------------
check('route: the placement page exists', existsSync(ROUTE));

const appRoutes = collect(join(ADMIN, 'src/app'), /\.tsx?$/).filter((path) =>
  /placement/i.test(path),
);
check(
  'route: exactly one placement route',
  appRoutes.length === 1,
  `found ${String(appRoutes.length)}`,
);
check(
  'route: sits in the protected route group',
  appRoutes.every((path) => path.includes('(protected)')),
  'a placement route is outside (protected)',
);

// Read defensively: a gate that throws on a missing file reports a stack trace
// instead of the rule that was broken, which is the least useful thing it could
// do at exactly the moment it matters.
const routeSource = existsSync(ROUTE) ? read(ROUTE) : '';
check(
  'route: is a thin boundary',
  routeSource !== '' &&
    !stripComments(routeSource).includes("'use client'") &&
    routeSource.split('\n').length < 30,
  'the route segment is missing or not thin',
);

// A01 must not have started A02/A03/A04/Studio.
for (const forbidden of ['template-list', 'template-editor', 'design-studio', 'studio']) {
  check(
    `scope: no ${forbidden} feature was created`,
    !existsSync(join(ADMIN, 'src/features', forbidden)),
    `apps/admin/src/features/${forbidden} exists`,
  );
}

// ---------------------------------------------------------------------------
// 4 · Generated-client boundary
// ---------------------------------------------------------------------------
const featureSources = collect(FEATURE, /\.tsx?$/).map((path) => ({
  path,
  text: stripComments(read(path)),
}));

check('feature: has source files', featureSources.length > 0);

const importers = featureSources.filter(
  (file) =>
    file.text.includes('adminProductPlacementGet') ||
    file.text.includes('adminProductPlacementReplace'),
);
check(
  'client: both generated operations are consumed',
  importers.length === 1 &&
    importers[0].text.includes('adminProductPlacementGet') &&
    importers[0].text.includes('adminProductPlacementReplace'),
  `${String(importers.length)} module(s) import the operations`,
);

for (const file of featureSources) {
  const where = relative(REPO_ROOT, file.path);
  check(
    `client: ${where} uses no raw transport`,
    !/\bfetch\s*\(/.test(file.text) && !/\baxios\b/.test(file.text),
    'raw fetch or axios found',
  );
  check(
    `client: ${where} does not duplicate the endpoint path`,
    !file.text.includes('/api/admin/products'),
    'a hard-coded placement URL was found',
  );
  check(
    `client: ${where} does not reach the public placement read`,
    !file.text.includes('publicProductPlacementGet') &&
      !file.text.includes('publicProductSideBackgroundGet'),
    'a public placement/background operation was imported',
  );
}

// ---------------------------------------------------------------------------
// 5 · Concurrency, conflict and retirement semantics
// ---------------------------------------------------------------------------
const allFeatureText = featureSources.map((file) => file.text).join('\n');

check(
  'concurrency: expectedUpdatedAt is sent from the draft seed',
  /expectedUpdatedAt:\s*draft\.expectedUpdatedAt/.test(allFeatureText),
  'the replace body does not echo the seeded token',
);

const mutation = featureSources.find((file) => /use-placement-mutation\.ts$/.test(file.path));
check(
  'conflict: the replace mutation never retries',
  mutation !== undefined && /retry:\s*false/.test(mutation.text),
  'the placement mutation does not disable retry',
);

const failureModel = featureSources.find((file) => /placement-failure\.ts$/.test(file.path));
check(
  'conflict: only the exact domain code opens the reload path',
  failureModel !== undefined &&
    /PLACEMENT_VERSION_CONFLICT_CODE\s*=\s*'PLACEMENT_VERSION_CONFLICT'/.test(failureModel.text) &&
    /classifySaveFailure\(error\)\s*===\s*'version-conflict'/.test(failureModel.text),
  'the conflict test is not narrowed to the domain code',
);

const body = featureSources.find((file) => /placement-body\.ts$/.test(file.path));
check(
  'retirement: removal is expressed by omission, never by a delete call',
  body !== undefined &&
    /!row\.removed && row\.retiredAt === null/.test(body.text) &&
    !/\bdelete\b/i.test(body.text),
  'the body mapper does not express retirement by omission',
);

/**
 * True when any `.filter(...)` call in this source consults `retiredAt`.
 *
 * Scanned as "a filter call whose body mentions the field" rather than matched
 * against one filter *shape*: an arrow parameter's own parentheses defeat a
 * character-class regex, so `[^)]*` would silently stop matching the moment
 * somebody wrote `(area) => …`. A rule that only recognises the spelling it was
 * written against is not a rule about retirement.
 */
function filtersOnRetirement(text) {
  const FILTER_BODY_WINDOW = 160;
  let at = text.indexOf('.filter(');
  while (at !== -1) {
    if (text.slice(at, at + FILTER_BODY_WINDOW).includes('retiredAt')) return true;
    at = text.indexOf('.filter(', at + 1);
  }
  return false;
}

const hierarchy = featureSources.find((file) => /placement-hierarchy-panel\.tsx$/.test(file.path));
check(
  'retirement: retired rows are rendered, not filtered out',
  hierarchy !== undefined &&
    !filtersOnRetirement(hierarchy.text) &&
    /retiredBadge/.test(hierarchy.text),
  'the hierarchy hides retired rows or does not badge them',
);

check(
  'hierarchy: Product → Side → Area is rendered as three levels',
  hierarchy !== undefined &&
    /productLabel/.test(hierarchy.text) &&
    /sidesLabel/.test(hierarchy.text) &&
    /areasLabel/.test(hierarchy.text),
  'the three hierarchy levels are not all present',
);

// ---------------------------------------------------------------------------
// 6 · Responsive behaviour
// ---------------------------------------------------------------------------
const viewport = featureSources.find((file) => /use-viewport-mode\.ts$/.test(file.path));
check(
  'responsive: the authoring floor is a named constant',
  viewport !== undefined && /PLACEMENT_AUTHORING_MIN_WIDTH_PX\s*=\s*1024/.test(viewport.text),
  'the authoring floor is missing or not 1024',
);
check(
  'responsive: an unknown viewport defaults to desktop',
  viewport !== undefined && /useState<ViewportMode>\('desktop'\)/.test(viewport.text),
  'the viewport hook does not fail safe to desktop',
);

const screen = featureSources.find((file) => /product-placement-screen\.tsx$/.test(file.path));
check(
  'responsive: mobile renders the notice instead of the editor',
  screen !== undefined &&
    /viewport === 'mobile'[\s\S]{0,400}PlacementMobileNotice/.test(screen.text),
  'the mobile branch does not return the read-only notice',
);

const stylesheet = stripComments(read(STYLESHEET));
check(
  'responsive: a narrow-desktop rule exists',
  /@media \(max-width: \$placement-narrow-desktop\)/.test(stylesheet),
  'no 1280 narrow-desktop rule found',
);

// ---------------------------------------------------------------------------
// 7 · Design-system tokens
// ---------------------------------------------------------------------------
check(
  'tokens: the stylesheet hard-codes no colour',
  !/rgba?\(/.test(stylesheet) && !/#[0-9a-fA-F]{3,8}\b/.test(stylesheet),
  'a literal colour was found in the placement stylesheet',
);
check(
  'tokens: the dialog scrim binds the canonical token',
  stylesheet.includes('$color-overlay-scrim'),
  'the scrim is not the canonical token',
);
check(
  'tokens: the scrim token is defined once in the shared package',
  (
    read(join(REPO_ROOT, 'packages/styles/src/settings/_color.scss')).match(
      /\$color-overlay-scrim:/g,
    ) ?? []
  ).length === 1,
  'the scrim token is missing or defined more than once',
);
check(
  'tokens: exactly one shared Admin field primitive exists',
  existsSync(SHARED_FIELD) &&
    collect(join(ADMIN, 'src/shared'), /\.tsx$/).filter((p) => /field|input/i.test(p)).length === 1,
  'zero or more than one shared field primitive',
);

// ---------------------------------------------------------------------------
// 8 · No contract change, no backend or Figma mutation
// ---------------------------------------------------------------------------
check(
  'contract: the OpenAPI document still publishes the placement paths',
  read(OPENAPI).includes('/api/admin/products/{productId}/placement'),
  'the placement path is missing from the OpenAPI document',
);
check(
  'contract: the generated client still exports both operations',
  /export const adminProductPlacementGet/.test(read(CLIENT)) &&
    /export const adminProductPlacementReplace/.test(read(CLIENT)),
  'a generated placement operation is missing',
);

// A frontend checkpoint may not regenerate either artifact, so neither may
// carry an A01 marker. Checked as an absence, which is the only way a
// "we did not generate" claim can be verified.
for (const [label, path] of [
  ['OpenAPI document', OPENAPI],
  ['generated client', CLIENT],
]) {
  check(
    `contract: the ${label} carries no A01 edit`,
    !read(path).includes('APP3-A01'),
    `${label} mentions APP3-A01`,
  );
}

// ---------------------------------------------------------------------------
// 9b · APP3-A01-C1 — the authorized Side background in the preview
//
// The rules live in their own module so this file stays within the 400-line
// source limit; the verdict is still this gate's. One command, one answer.
// ---------------------------------------------------------------------------
const readIfPresent = (path) => (existsSync(path) ? stripComments(read(path)) : '');

for (const finding of checkA01BackgroundPreview({
  plan,
  curated: readIfPresent(CURATED_CLIENT),
  backgroundService: readIfPresent(BACKGROUND_SERVICE),
  backgroundHook: readIfPresent(BACKGROUND_HOOK),
  preview: readIfPresent(PREVIEW),
  screen: readIfPresent(SCREEN),
  featureSources: featureSources.map((file) => ({
    ...file,
    where: relative(REPO_ROOT, file.path),
  })),
  hasBackgroundSources: existsSync(BACKGROUND_SERVICE) || existsSync(BACKGROUND_HOOK),
})) {
  check(finding.label, finding.ok, finding.detail);
}

const rootScripts = Object.keys(
  JSON.parse(read(join(REPO_ROOT, 'package.json'))).scripts ?? {},
).length;
check('governance: root scripts remain 30', rootScripts === 30, `found ${String(rootScripts)}`);

// ---------------------------------------------------------------------------
// 9 · File-size policy
// ---------------------------------------------------------------------------
const oversizedSource = collect(FEATURE, /\.tsx?$/)
  .concat(existsSync(SHARED_FIELD) ? [SHARED_FIELD] : [])
  .filter((path) => read(path).split('\n').length > 400);
check(
  'policy: every production file is within 400 lines',
  oversizedSource.length === 0,
  oversizedSource.map((path) => relative(REPO_ROOT, path)).join(', '),
);

const oversizedTests = collect(join(ADMIN, 'test'), /placement.*\.tsx?$/).filter(
  (path) => read(path).split('\n').length > 600,
);
check(
  'policy: every placement test file is within 600 lines',
  oversizedTests.length === 0,
  oversizedTests.map((path) => relative(REPO_ROOT, path)).join(', '),
);

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------
if (failures.length > 0) {
  console.error(`APP3-A01 check FAILED (${String(failures.length)} of ${String(checks.length)}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `APP3-A01 check passed (${String(checks.length)} assertions; ` +
    `1 protected route, 2 generated operations, ${String(A01_ROWS.length)} approved design rows).`,
);
