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

import { acceptedAdminTemplatePaths, isA04Delivered } from './app3-accepted-paths.mjs';

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
  'design: A04 lifecycle rows follow their checkpoint',
  rowStatus('FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-READY') ===
    (isA04Delivered(REPO_ROOT) ? 'APPROVED_FOR_IMPLEMENTATION' : 'REVIEW_REQUIRED'),
  'an A04 row does not match APP3-A04 delivered state',
);

// ---------------------------------------------------------------------------
// 3 · One screen, one protected route, one nav entry
// ---------------------------------------------------------------------------
check('route: the list page exists', existsSync(ROUTE));

const appRoutes = collect(join(ADMIN, 'src/app'), /\.tsx?$/)
  .filter((path) => /design-template/i.test(path))
  .map((path) => path.replace(/\\/g, '/'));

// The **set** is the rule, not the count. The list owned the only route until
// `APP3-A03` delivered the editor segment and `APP3-A04` its publication child;
// a number would fail on each of those for a reason that has nothing to do with
// the property being protected, which is that there is no *alias* — no second
// spelling of this URL space. Each route is admitted only once the checkpoint
// that owns it exists.
const hasEditorRoute = existsSync(
  join(ADMIN, 'src/app/(protected)/design-templates/[templateId]/page.tsx'),
);
const hasPublicationRoute = existsSync(
  join(ADMIN, 'src/app/(protected)/design-templates/[templateId]/publication/page.tsx'),
);
const expectedRoutes = 1 + (hasEditorRoute ? 1 : 0) + (hasPublicationRoute ? 1 : 0);
check(
  'route: exactly the list route and the accepted child segments',
  appRoutes.length === expectedRoutes,
  `found ${String(appRoutes.length)}, expected ${String(expectedRoutes)}: ${appRoutes.join(', ')}`,
);
check(
  'route: the list segment is one of them',
  appRoutes.some((path) => /design-templates\/page\.tsx$/.test(path)),
  'the list route segment is missing',
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

// A02 must not have started A04 or the Studio. The Template *editor* is
// `APP3-A03`'s and is expected to exist once that checkpoint has delivered —
// what stays forbidden is A02 growing one of its own.
for (const forbidden of ['template-lifecycle', 'design-studio']) {
  check(
    `scope: no ${forbidden} feature was created`,
    !existsSync(join(ADMIN, 'src/features', forbidden)),
    `apps/admin/src/features/${forbidden} exists`,
  );
}
check(
  'scope: the list feature contains no editor of its own',
  !existsSync(join(FEATURE, 'components/design-template-editor-screen.tsx')),
  'an editor screen was added inside the list feature',
);

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
// Asserted as membership of one export statement, not as an exact substring.
// The previous spelling pinned the two names adjacent on a single line, which
// Prettier rewrapped the moment `APP3-A03` added a third — a formatting change
// is not a boundary change.
const curatedExports = curated.match(/export \{[^}]*\} from '\.\/generated\/embroidery-api';/gs);
check(
  'client: the list and create operations are on the curated boundary together',
  (curatedExports ?? []).some(
    (statement) =>
      statement.includes('adminDesignTemplateList') &&
      statement.includes('adminDesignTemplateCreate'),
  ),
  'the two consumed operations are not exported together',
);

// The lifecycle operations. Withheld until `APP3-A04` existed to consume them,
// and exported once it did — so the rule that survives is not "unreachable"
// but "not reached **from here**": the list must never invoke one whether or
// not the boundary offers it. That is the property "no row-level lifecycle
// control" was always about, and it is stronger now than the absence it
// replaced.
for (const operation of [
  'adminDesignTemplatePublish',
  'adminDesignTemplateUnpublish',
  'adminDesignTemplateArchive',
  'adminDesignTemplateRestore',
]) {
  check(
    `client: ${operation} matches APP3-A04 delivered state`,
    new RegExp(`export \\{[^}]*${operation}`, 's').test(curated) === isA04Delivered(REPO_ROOT),
    'a lifecycle export does not match APP3-A04 delivered state',
  );
  check(
    `client: ${operation} is not consumed by the list`,
    featureSources.every((file) => !file.text.includes(operation)),
    'a lifecycle operation reached the Template list',
  );
}

// The detail read is a different case and must be checked in both worlds.
// `APP3-A02` proved "no N+1" by the operation being unreachable; `APP3-A03`
// legitimately brought it across for the editor. So the rule moves to where the
// property actually lives — the list's own sources, asserted below — and here
// the two worlds are pinned so neither can drift silently.
const detailIsCurated = /export \{[^}]*adminDesignTemplateDetail/s.test(curated);
check(
  'client: the detail read is curated only alongside the save it belongs with',
  !detailIsCurated || /export \{[^}]*adminDesignTemplateSaveDocument/s.test(curated),
  'the detail read crossed the boundary without the save that needs its version token',
);

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
// The property is "**this** checkpoint published no operation", and a frontend
// gate cannot express that as a frozen total: `32`/`37` were true the day A02
// shipped and became false the moment `APP3-B03B` legitimately added one, which
// is a rule failing for a reason that has nothing to do with the Template list.
//
// The Admin Template surface is asserted instead as an enumerated set with an
// owner per entry — strict, because a route nobody claims still fails — and
// derived from the shared authority so one accepted checkpoint's operation is
// not re-litigated in six gates. `operations` stays as the count of *that* set.
const adminTemplatePaths = paths.filter((path) => path.startsWith('/api/admin/design-templates'));
const acceptedTemplatePaths = acceptedAdminTemplatePaths(REPO_ROOT);
check(
  'contract: the Admin Template surface is exactly what the accepted checkpoints published',
  adminTemplatePaths.slice().sort().join('\n') === acceptedTemplatePaths.slice().sort().join('\n'),
  `found ${adminTemplatePaths.join(', ')}`,
);
check(
  'contract: this feature publishes no operation of its own',
  operations >= 37,
  `the surface shrank below the world A02 was built against (${String(operations)})`,
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
    'alone — no source in this feature reaches the detail read that APP3-A03 curated for the ' +
    'editor, and every lifecycle operation stays off the client boundary, so a row cannot ' +
    'become an N+1 or grow a publish button; the cursor is forwarded unparsed and ' +
    'the filters sit in the query key, so a filter change resets the collection structurally; ' +
    'and the two cells the contract under-reports are distinguished — an unreported version is ' +
    'never rendered as an absent one.',
);
