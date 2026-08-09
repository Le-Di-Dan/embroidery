#!/usr/bin/env node
/**
 * `APP3-A02` — Admin Design Template list.
 *
 * A read/list screen, so most of what this gate protects is **restraint**: the
 * contract has no search, sort, page number or total; the screen owns no
 * lifecycle transition; and the row detail read that would turn a keyset list
 * into an N+1 is withheld from the client boundary entirely.
 *
 * The truthfulness rules are the ones worth reading twice. `APP3-B03`'s list
 * projection calls `toSummaryView(template, undefined)`, so no page ever
 * carries `currentVersion` — which means a row saying "no version yet" would
 * mislabel every published template. The gate asserts the screen says where the
 * number lives instead, and separately that an absent *scope* — which the list
 * genuinely does report — is stated plainly.
 *
 * Both directions are asserted wherever an absence carries meaning: a withheld
 * operation is checked as a real absence, never inferred from the presence of
 * the two this screen consumes.
 *
 * This gate does not read the completion report. A report is a claim; every
 * fact below is recomputed from the repository.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const PHASE_PLAN = join(
  REPO_ROOT,
  'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
);
const REGISTRY = join(REPO_ROOT, 'docs/design/FIGMA_DESIGN_INDEX.md');
const ADMIN = join(REPO_ROOT, 'apps/admin');
const FEATURE = join(ADMIN, 'src/features/design-templates');
const ROUTE = join(ADMIN, 'src/app/(protected)/design-templates/page.tsx');
const STYLESHEET = join(FEATURE, 'styles/design-templates.scss');
const NAV = join(ADMIN, 'src/features/admin-shell/model/admin-shell-nav.ts');
const ROWS = join(FEATURE, 'model/design-template-rows.ts');
const SERVICE = join(FEATURE, 'services/design-template.service.ts');
const CURATED_CLIENT = join(REPO_ROOT, 'packages/api-client/src/index.ts');
const OPENAPI = join(REPO_ROOT, 'packages/contracts/openapi/openapi.generated.json');
const CLIENT = join(REPO_ROOT, 'packages/api-client/src/generated/embroidery-api.ts');
const COMMAND_INDEX = join(REPO_ROOT, 'docs/implementation/SCOPED_COMMAND_INDEX.md');

const failures = [];
const checks = [];

function check(label, condition, detail = '') {
  checks.push(label);
  if (!condition) failures.push(detail === '' ? label : `${label} — ${detail}`);
}

const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');

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
  ['APP3-B03', 'COMPLETE — REVIEW_ACCEPTED'],
  ['APP3-A01', 'COMPLETE — REVIEW_ACCEPTED'],
]) {
  check(
    `entry: ${id} is accepted`,
    plan.includes(`\n${id} = ${expected}`),
    `phase plan does not record "${id} = ${expected}"`,
  );
}

// ---------------------------------------------------------------------------
// 2 · Design registry — the rows A02 renders from
// ---------------------------------------------------------------------------
const registry = read(REGISTRY);

function rowStatus(id) {
  const line = registry.split('\n').find((row) => row.startsWith(`| ${id} |`));
  return line === undefined ? null : (line.split('|')[8] ?? '').trim();
}

const A02_ROWS = [
  'FIG-ADMIN-TEMPLATELIST-DESKTOP-DEFAULT',
  'FIG-ADMIN-TEMPLATELIST-DESKTOP-LOADING',
  'FIG-ADMIN-TEMPLATELIST-DESKTOP-EMPTY',
  'FIG-ADMIN-TEMPLATELIST-DESKTOP-ERROR',
  'FIG-ADMIN-TEMPLATELIST-MOBILE-DEFAULT',
];

for (const id of A02_ROWS) {
  check(
    `design: ${id} is approved for implementation`,
    rowStatus(id) === 'APPROVED_FOR_IMPLEMENTATION',
    `status is ${String(rowStatus(id))}`,
  );
}

// Approval stays scoped: a screen whose checkpoint has not opened is still
// unapproved, or this gate would pass on a registry that licensed the phase.
check(
  'design: A04 lifecycle rows are still unapproved',
  rowStatus('FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-READY') === 'REVIEW_REQUIRED',
  'an A04 row was approved without its checkpoint',
);

// ---------------------------------------------------------------------------
// 3 · One screen, one protected route, one nav entry
// ---------------------------------------------------------------------------
check('route: the list page exists', existsSync(ROUTE));

const appRoutes = collect(join(ADMIN, 'src/app'), /\.tsx?$/).filter((path) =>
  /design-template/i.test(path),
);
check(
  'route: exactly one design-template route',
  appRoutes.length === 1,
  `found ${String(appRoutes.length)}`,
);
check(
  'route: sits in the protected route group',
  appRoutes.every((path) => path.includes('(protected)')),
  'a design-template route is outside (protected)',
);

const routeSource = read(ROUTE);
check(
  'route: is a thin boundary',
  routeSource !== '' &&
    !stripComments(routeSource).includes("'use client'") &&
    routeSource.split('\n').length < 30,
  'the route segment is missing or not thin',
);

const nav = stripComments(read(NAV));
check(
  'navigation: one entry pointing at the owned route constant',
  /ADMIN_DESIGN_TEMPLATES_ROUTE/.test(nav) && /id: 'design-templates'/.test(nav),
  'the shell has no Design Template entry, or it does not use the route constant',
);

// A02 must not have started A03/A04.
for (const forbidden of ['template-editor', 'template-lifecycle', 'design-studio']) {
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
  where: relative(REPO_ROOT, path),
  text: stripComments(read(path)),
}));

check('feature: has source files', featureSources.length > 0);

const curated = stripComments(read(CURATED_CLIENT));
check(
  'client: the list and create operations are on the curated boundary',
  /adminDesignTemplateCreate, adminDesignTemplateList/.test(curated),
  'the two consumed operations are not exported together',
);

// The withheld operations, as real absences.
for (const [operation, why] of [
  ['adminDesignTemplateDetail', 'a row-level detail read is the N+1 a keyset list avoids'],
  ['adminDesignTemplatePublish', 'lifecycle belongs to APP3-A04'],
  ['adminDesignTemplateUnpublish', 'lifecycle belongs to APP3-A04'],
  ['adminDesignTemplateArchive', 'lifecycle belongs to APP3-A04'],
]) {
  check(
    `client: ${operation} stays withheld`,
    !new RegExp(`export \\{[^}]*${operation}`).test(curated),
    why,
  );
}

const consumers = featureSources.filter(
  (file) =>
    file.text.includes('adminDesignTemplateList') ||
    file.text.includes('adminDesignTemplateCreate'),
);
check(
  'client: the operations are consumed in exactly one service',
  consumers.length === 1 && /services[\\/]design-template\.service\.ts$/.test(consumers[0].path),
  `${String(consumers.length)} module(s) consume them`,
);

for (const file of featureSources) {
  check(
    `client: ${file.where} uses no raw transport`,
    !/\bfetch\s*\(/.test(file.text) && !/\baxios\b/.test(file.text),
    'raw fetch or axios found',
  );
  check(
    `client: ${file.where} does not duplicate the endpoint path`,
    !file.text.includes('/api/admin/design-templates'),
    'a hard-coded endpoint was found',
  );
  check(
    `client: ${file.where} consumes no lifecycle operation`,
    !/adminDesignTemplate(Publish|Unpublish|Archive|Restore)/.test(file.text),
    'a lifecycle operation is consumed',
  );
  check(
    `client: ${file.where} performs no per-row detail read`,
    !file.text.includes('adminDesignTemplateDetail'),
    'a detail read reached the list screen',
  );
}

// ---------------------------------------------------------------------------
// 5 · Only the capabilities the contract publishes
// ---------------------------------------------------------------------------
const FORBIDDEN_PARAM = /\b(search|sortBy|orderBy|sort|offset|pageNumber|totalCount)\s*:/;
const DECLARATION = /^\s*(const|let|var|function|export)\b/;

for (const file of featureSources) {
  const offenders = file.text
    .split('\n')
    .filter((line) => FORBIDDEN_PARAM.test(line) && !DECLARATION.test(line));
  check(
    `contract: ${file.where} builds no unsupported request parameter`,
    offenders.length === 0,
    offenders.join(' | '),
  );
}

const service = stripComments(read(SERVICE));
check(
  'pagination: the cursor is forwarded, never parsed or rebuilt',
  service.includes('cursor') && !/atob|Buffer\.from|JSON\.parse\([^)]*cursor/.test(service),
  'the client has an opinion about the cursor',
);
check(
  'pagination: the filters are part of the query key, so a change resets the cursor',
  /status: filters\.status/.test(
    stripComments(read(join(FEATURE, 'model/design-template-query-keys.ts'))),
  ),
  'the list key does not carry the filters',
);

// ---------------------------------------------------------------------------
// 6 · Truthful cells
// ---------------------------------------------------------------------------
const rows = stripComments(read(ROWS));
// Anchored to the **return**, not to the string anywhere in the file: a union
// member `| { kind: 'not-in-list' }` and a `versionLabel` branch both survive a
// `versionCell` rewritten to fabricate a number, so a substring scan would pass
// the one mutation that matters.
check(
  'truth: an unreported version is distinguished from an absent one',
  /return \{ kind: 'not-in-list' \}/.test(rows) && /versionNotInList/.test(rows),
  'the row cannot tell "no version" from "not carried by the list"',
);
check(
  'truth: no version is fabricated',
  !/version:\s*1\b/.test(rows) && !/\?\?\s*1\b/.test(rows),
  'a default version is invented',
);
check(
  'truth: an absent scope is stated plainly',
  /noScope/.test(rows) && /'none'/.test(rows),
  'an absent placement scope is not represented',
);
check(
  'truth: a scope with an unknown Product is not given an invented label',
  /'assigned'/.test(rows) && /scopeAssigned/.test(rows),
  'an unresolved Product is labelled anyway',
);
check(
  'truth: server ordering is preserved',
  !/\.sort\(/.test(rows),
  'the row projection re-sorts the server page',
);

// ---------------------------------------------------------------------------
// 7 · Mobile adaptation and tokens
// ---------------------------------------------------------------------------
const stylesheet = stripComments(read(STYLESHEET));
check(
  'responsive: a card adaptation exists beside the table',
  existsSync(join(FEATURE, 'components/design-template-card-list.tsx')) &&
    /@media \(max-width: \$template-card-breakpoint\)/.test(stylesheet),
  'no mobile card adaptation',
);
check(
  'responsive: the table is hidden rather than scrolled sideways on mobile',
  /\.design-template-table \{\s*display: none;/.test(stylesheet),
  'the desktop table survives into the mobile breakpoint',
);
check(
  'tokens: the stylesheet hard-codes no colour',
  !/rgba?\(/.test(stylesheet) && !/#[0-9a-fA-F]{3,8}\b/.test(stylesheet),
  'a literal colour was found',
);
check(
  'tokens: the dialog scrim binds the canonical token',
  stylesheet.includes('$color-overlay-scrim'),
  'the scrim is not the canonical token',
);

// ---------------------------------------------------------------------------
// 8 · No contract change, no backend or Figma mutation
// ---------------------------------------------------------------------------
const document = JSON.parse(read(OPENAPI) || '{}');
const paths = Object.keys(document.paths ?? {});
const operations = paths.reduce(
  (total, path) =>
    total +
    Object.keys(document.paths[path]).filter((verb) =>
      ['get', 'post', 'put', 'patch', 'delete'].includes(verb),
    ).length,
  0,
);
check(
  'contract: the surface is unchanged at 32 paths',
  paths.length === 32,
  `found ${String(paths.length)}`,
);
check(
  'contract: the surface is unchanged at 37 operations',
  operations === 37,
  `found ${String(operations)}`,
);
for (const [label, path] of [
  ['OpenAPI document', OPENAPI],
  ['generated client', CLIENT],
]) {
  check(
    `contract: the ${label} carries no A02 edit`,
    !read(path).includes('APP3-A02'),
    `${label} mentions APP3-A02`,
  );
}

const rootScripts = Object.keys(
  JSON.parse(read(join(REPO_ROOT, 'package.json'))).scripts ?? {},
).length;
check('governance: root scripts remain 30', rootScripts === 30, `found ${String(rootScripts)}`);

// Each row is matched as an **id bound to the command it names**. A bare
// `includes(id)` is a substring test that a renamed row still satisfies — and
// `CMD-CHECK-APP3-A02` is a prefix of `CMD-TEST-APP3-A02-ADMIN`, so a substring
// scan cannot tell a registered command from an unregistered neighbour.
const commandRows = read(COMMAND_INDEX).split('\n');
for (const [command, invocation] of [
  ['CMD-CHECK-APP3-A02', 'node tools/check-app3-a02.mjs'],
  ['CMD-TEST-APP3-A02', 'node --test tools/check-app3-a02.test.mjs'],
  ['CMD-TEST-APP3-A02-ADMIN', '--testPathPatterns=design-template'],
]) {
  check(
    `governance: ${command} is registered`,
    commandRows.some((row) => row.includes(`\`${command}\` |`) && row.includes(invocation)),
    'not registered in the scoped command index, or not bound to its command',
  );
}

// ---------------------------------------------------------------------------
// 9 · File-size policy
// ---------------------------------------------------------------------------
const oversized = collect(FEATURE, /\.tsx?$/).filter((path) => read(path).split('\n').length > 400);
check(
  'policy: every production file is within 400 lines',
  oversized.length === 0,
  oversized.map((path) => relative(REPO_ROOT, path)).join(', '),
);

const oversizedTests = collect(join(ADMIN, 'test'), /design-template.*\.tsx?$/).filter(
  (path) => read(path).split('\n').length > 600,
);
check(
  'policy: every A02 test file is within 600 lines',
  oversizedTests.length === 0,
  oversizedTests.map((path) => relative(REPO_ROOT, path)).join(', '),
);

// ---------------------------------------------------------------------------
if (failures.length > 0) {
  console.error(`APP3-A02 check FAILED (${String(failures.length)} of ${String(checks.length)}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `APP3-A02 check passed (${String(checks.length)} assertions; one protected route, ` +
    'two generated operations, five approved design rows). The list renders from summaries ' +
    'alone — the detail read and every lifecycle operation stay off the client boundary, so a ' +
    'row cannot become an N+1 or grow a publish button; the cursor is forwarded unparsed and ' +
    'the filters sit in the query key, so a filter change resets the collection structurally; ' +
    'and the two cells the contract under-reports are distinguished — an unreported version is ' +
    'never rendered as an absent one.',
);
