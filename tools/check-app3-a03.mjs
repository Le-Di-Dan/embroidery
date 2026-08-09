#!/usr/bin/env node
/**
 * `APP3-A03` — Admin Design Template editor.
 *
 * The first APP3 frontend checkpoint that **writes**, so most of what this gate
 * protects is the discipline around one `PUT`: the exact body, the version token
 * that must be echoed rather than invented, and the refusal that must never
 * become a retry.
 *
 * Three rules carry more weight than the rest.
 *
 * *`APP3-P01` is the only document authority.* No second schema, no second
 * validator, no second schema-version constant. The empty document a
 * never-saved Template opens on is composed from P01's exported constants and
 * handed straight back to P01's own validator.
 *
 * *`APP3-P02` is the only geometry.* No matrix is multiplied here, no rotation
 * expanded, no px↔mm conversion performed. `IMP-D045` locks the semantics and a
 * renderer implements the contract rather than restating it.
 *
 * *No Template asset bytes are reachable.* `APP3-B05A` serves published Template
 * assets and `APP3-B06C` serves Session uploads; neither is permission to render
 * a draft in the Admin console, and no storage address is constructed anywhere.
 *
 * Rules whose meaning depends on which checkpoints have delivered are asserted
 * in **both** directions — the `APP3-A02` list must never reach the detail read
 * even now that one exists, and the lifecycle operations must stay absent for
 * A02 and A03 alike.
 *
 * This gate does not read the completion report. A report is a claim; every fact
 * below is recomputed from the repository.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { acceptedAdminTemplatePaths } from './app3-accepted-paths.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const PHASE_PLAN = join(
  REPO_ROOT,
  'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
);
const REGISTRY = join(REPO_ROOT, 'docs/design/FIGMA_DESIGN_INDEX.md');
const ADMIN = join(REPO_ROOT, 'apps/admin');
const FEATURE = join(ADMIN, 'src/features/design-template-editor');
const LIST_FEATURE = join(ADMIN, 'src/features/design-templates');
const ROUTE = join(ADMIN, 'src/app/(protected)/design-templates/[templateId]/page.tsx');
const STYLESHEET = join(FEATURE, 'styles/design-template-editor.scss');
const CURATED_CLIENT = join(REPO_ROOT, 'packages/api-client/src/index.ts');
const GENERATED_CLIENT = join(REPO_ROOT, 'packages/api-client/src/generated/embroidery-api.ts');
const OPENAPI = join(REPO_ROOT, 'packages/contracts/openapi/openapi.generated.json');
const COMMAND_INDEX = join(REPO_ROOT, 'docs/implementation/SCOPED_COMMAND_INDEX.md');
const ROOT_PACKAGE = join(REPO_ROOT, 'package.json');

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
  ['APP3-A02', 'COMPLETE — REVIEW_ACCEPTED'],
  ['APP3-B03', 'COMPLETE — REVIEW_ACCEPTED'],
  ['APP3-B03A', 'COMPLETE — REVIEW_ACCEPTED'],
  ['APP3-P01', 'COMPLETE — REVIEW_ACCEPTED'],
  ['APP3-P02', 'COMPLETE — REVIEW_ACCEPTED'],
]) {
  check(
    `entry: ${id} is accepted`,
    plan.includes(`\n${id} = ${expected}`),
    `phase plan does not record "${id} = ${expected}"`,
  );
}

// The Template image-intake gap is a carried limitation, not something A03 may
// quietly close. A gate that stopped asserting it would let a later edit claim
// production intake without anyone noticing the follow-up had vanished.
// Every occurrence, not the first one that satisfies the rule. The phase plan
// records this follow-up in more than one checkpoint's status block, so a rule
// asking "does an OPEN line exist" would keep passing while the block that
// actually governs A03 said CLOSED.
const intakeStatuses = plan
  .split('\n')
  .filter((line) => line.startsWith('FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01 ='));
check(
  'entry: the TEMPLATE_SOURCE intake follow-up is still open',
  intakeStatuses.length > 0 && intakeStatuses.every((line) => /= OPEN\b/.test(line)),
  `recorded as: ${intakeStatuses.join(' | ') || 'nothing'}`,
);

// ---------------------------------------------------------------------------
// 2 · Design registry — the rows A03 renders from
// ---------------------------------------------------------------------------
const registry = read(REGISTRY);

function rowStatus(id) {
  const line = registry.split('\n').find((row) => row.startsWith(`| ${id} |`));
  return line === undefined ? null : (line.split('|')[8] ?? '').trim();
}

const A03_ROWS = [
  'FIG-ADMIN-TEMPLATEEDITOR-DESKTOP-DEFAULT',
  'FIG-ADMIN-TEMPLATEEDITOR-DESKTOP-TEXTSELECTED',
  'FIG-ADMIN-TEMPLATEEDITOR-DESKTOP-SAVING',
  'FIG-ADMIN-TEMPLATEEDITOR-DESKTOP-CONFLICT',
  'FIG-ADMIN-TEMPLATEEDITOR-MOBILE-READONLY',
  'FIG-ADMIN-TEMPLATEEDITOR-NARROW-1280',
];

for (const id of A03_ROWS) {
  check(
    `design: ${id} is approved for implementation`,
    rowStatus(id) === 'APPROVED_FOR_IMPLEMENTATION',
    `status is ${String(rowStatus(id))}`,
  );
}

// Approval stays scoped: a screen whose checkpoint has not opened is still
// unapproved, or this gate would pass on a registry that licensed the phase.
for (const id of [
  'FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-READY',
  'FIG-ADMIN-TEMPLATELIFECYCLE-DESKTOP-RESTOREBLOCKED',
  'FIG-STUDIO-SHELL-DESKTOP-DEFAULT',
]) {
  check(
    `design: ${id} is still unapproved`,
    rowStatus(id) === 'REVIEW_REQUIRED',
    `a row outside A03 was approved without its checkpoint (status ${String(rowStatus(id))})`,
  );
}

// ---------------------------------------------------------------------------
// 3 · One protected route, addressed by id
// ---------------------------------------------------------------------------
check('route: the editor segment exists', existsSync(ROUTE));

const routeSource = read(ROUTE);
const routeCode = stripComments(routeSource);
check(
  'route: sits in the protected route group',
  ROUTE.replace(/\\/g, '/').includes('(protected)'),
  'the editor route is outside (protected)',
);
check(
  'route: is a thin boundary',
  routeSource !== '' && !routeCode.includes("'use client'") && routeSource.split('\n').length < 40,
  'the route segment is missing or not thin',
);
check(
  'route: addressed by template id, never by the public slug',
  routeCode.includes('templateId') && !routeCode.includes('slug'),
  'the editor is addressed by something other than the template id',
);
check(
  'route: does not prefetch the version token on the server',
  !routeCode.includes('prefetchQuery') && !routeCode.includes('HydrationBoundary'),
  'a server-dehydrated version token would already be stale when the operator acted on it',
);

const editorRoutes = collect(join(ADMIN, 'src/app'), /\.tsx?$/)
  .map((path) => path.replace(/\\/g, '/'))
  .filter((path) => /design-templates\/\[/.test(path));
check(
  'route: exactly one editor segment, with no alias',
  editorRoutes.length === 1,
  `found ${String(editorRoutes.length)}`,
);

// ---------------------------------------------------------------------------
// 4 · A02 activation, and the invariants it must not break
// ---------------------------------------------------------------------------
const listSources = collect(LIST_FEATURE, /\.tsx?$/).map((path) => ({
  path: path.replace(/\\/g, '/'),
  where: relative(REPO_ROOT, path),
  text: stripComments(read(path)),
}));

check(
  'activation: the list links into the editor through the one route authority',
  listSources.some(
    (file) =>
      /design-template-route\.ts$/.test(file.path) &&
      /export function adminDesignTemplateEditorRoute/.test(file.text),
  ),
  'the editor route is not built from the list capability route module',
);

// Call sites only. The route module *declares* the builder, so a rule that
// matched the identifier anywhere would count the declaration as a consumer and
// then demand an `href` from a module that renders nothing.
const linkers = listSources.filter(
  (file) =>
    !/design-template-route\.ts$/.test(file.path) &&
    file.text.includes('adminDesignTemplateEditorRoute('),
);
check(
  'activation: the row affordance is a real link',
  linkers.length > 0 &&
    linkers.every((file) => /href=\{adminDesignTemplateEditorRoute\(/.test(file.text)),
  'the edit affordance does not navigate to the built route',
);

// …and the absence that makes the rule above mean something. Without this, a
// component that stopped calling the builder and interpolated the URL itself
// would simply drop out of `linkers` and pass — the second spelling being
// exactly what one route authority exists to prevent.
const literalUrlBuilders = listSources.filter(
  (file) =>
    !/design-template-route\.ts$/.test(file.path) && /['"`]\/design-templates\//.test(file.text),
);
check(
  'activation: no module spells the editor URL for itself',
  literalUrlBuilders.length === 0,
  literalUrlBuilders.map((file) => file.where).join(', '),
);

// The A02 invariants, restated against the world where the operation exists.
for (const file of listSources) {
  check(
    `activation: ${file.where} still performs no detail read`,
    !file.text.includes('adminDesignTemplateDetail'),
    'the list reached the detail read APP3-A03 curated — that is the N+1 a keyset list avoids',
  );
  check(
    `activation: ${file.where} still consumes no lifecycle operation`,
    !/adminDesignTemplate(Publish|Unpublish|Archive|Restore)/.test(file.text),
    'a lifecycle operation reached the list',
  );
}

check(
  'activation: no stale "editor unavailable" copy survives the activation',
  !/APP3-A03\)/.test(read(join(LIST_FEATURE, 'model/design-template-copy.ts'))),
  'the list still tells the operator the editor does not exist',
);

// ---------------------------------------------------------------------------
// 5 · Generated-client boundary
// ---------------------------------------------------------------------------
const sources = collect(FEATURE, /\.tsx?$/).map((path) => ({
  path: path.replace(/\\/g, '/'),
  where: relative(REPO_ROOT, path),
  text: stripComments(read(path)),
}));

check('feature: has source files', sources.length > 0);

const curated = stripComments(read(CURATED_CLIENT));
const curatedExports =
  curated.match(/export \{[^}]*\} from '\.\/generated\/embroidery-api';/gs) ?? [];

check(
  'client: the detail read and the document save cross the boundary together',
  curatedExports.some(
    (statement) =>
      statement.includes('adminDesignTemplateDetail') &&
      statement.includes('adminDesignTemplateSaveDocument'),
  ),
  'the read is the only source of the version token the save must echo, so one without the ' +
    'other would publish a write nobody could safely perform',
);

// The lifecycle operations, as real absences — for A02 and A03 alike.
for (const operation of [
  'adminDesignTemplatePublish',
  'adminDesignTemplateUnpublish',
  'adminDesignTemplateArchive',
  'adminDesignTemplateRestore',
]) {
  check(
    `client: ${operation} stays withheld`,
    !new RegExp(`export \\{[^}]*${operation}`, 's').test(curated),
    'lifecycle belongs to APP3-A04',
  );
  check(
    `client: ${operation} is not consumed anywhere in the editor`,
    sources.every((file) => !file.text.includes(operation)),
    'a lifecycle operation reached the editor',
  );
}

// The operation exists in the contract — which is exactly why withholding it is
// a decision this gate has to verify rather than an accident of the API.
const generated = read(GENERATED_CLIENT);
check(
  'client: the withheld lifecycle operations do exist in the generated client',
  ['adminDesignTemplatePublish', 'adminDesignTemplateArchive'].every((operation) =>
    generated.includes(`export const ${operation} =`),
  ),
  'the generated client no longer publishes them, so the withholding above proves nothing',
);

for (const [group, module] of [
  [
    ['adminDesignTemplateDetail', 'adminDesignTemplateSaveDocument'],
    /design-template-editor\.service\.ts$/,
  ],
  [
    ['adminProductPlacementGet', 'adminProductSideBackgroundGet'],
    /template-placement\.service\.ts$/,
  ],
]) {
  const consumers = sources.filter((file) => group.some((name) => file.text.includes(name)));
  check(
    `client: ${group[0]} and its pair are consumed in exactly one service`,
    consumers.length === 1 && module.test(consumers[0].path),
    `${String(consumers.length)} module(s) consume them`,
  );
}

for (const file of sources) {
  check(
    `client: ${file.where} uses no raw transport`,
    !/\bfetch\s*\(/.test(file.text) && !/\baxios\b/.test(file.text),
    'raw fetch or axios found',
  );
  check(
    `client: ${file.where} does not duplicate an endpoint path`,
    !file.text.includes('/api/admin/') && !file.text.includes('/api/public/'),
    'a hard-coded endpoint was found',
  );
}

// ---------------------------------------------------------------------------
// 6 · Asset delivery — nothing reaches Template bytes
// ---------------------------------------------------------------------------
for (const file of sources) {
  check(
    `assets: ${file.where} reaches no published-Template or Session delivery route`,
    !/publicDesignTemplate|publicDesignSession|editor-preview/.test(file.text),
    'APP3-B05A and APP3-B06C are not permission to render an Admin draft',
  );
  check(
    `assets: ${file.where} builds no storage address`,
    !/minio|s3\.|amazonaws|presign|signedUrl/i.test(file.text) &&
      !/\bstorageKey\b|\bbucket\b/i.test(file.text),
    'a storage address or credential-shaped value was constructed',
  );
  check(
    `assets: ${file.where} renders no HTML image for a Template asset`,
    !/<img\b/.test(file.text) && !/next\/image/.test(file.text),
    'an HTML image element would fetch bytes outside the authorized operation',
  );
}

const objectUrlOwners = sources.filter((file) => file.text.includes('createObjectURL'));
check(
  'assets: the object URL is created only where it is revoked',
  objectUrlOwners.length === 1 &&
    /use-editor-side-background\.ts$/.test(objectUrlOwners[0].path) &&
    objectUrlOwners[0].text.includes('revokeObjectURL'),
  'an object URL is created outside the hook that owns its lifetime',
);

// The authorized consumer set for the Admin Side background, asserted globally.
// `APP3-A01` was the only one; `APP3-A03` is the second and last. A third would
// be a new surface reading protected media, which is exactly the thing this
// operation's `no-store` answer exists to bound.
const backgroundConsumers = collect(join(ADMIN, 'src'), /\.tsx?$/)
  .map((path) => ({ path: path.replace(/\\/g, '/'), text: stripComments(read(path)) }))
  .filter((file) => file.text.includes('adminProductSideBackgroundGet'));
check(
  'assets: exactly two authorized Side-background consumers, A01 and A03',
  backgroundConsumers.length === 2 &&
    backgroundConsumers.some((file) => file.path.includes('/features/product-placement/')) &&
    backgroundConsumers.some((file) => file.path.includes('/features/design-template-editor/')),
  backgroundConsumers.map((file) => file.path).join(', '),
);
check(
  'assets: no public Side-background route is used for Admin authoring',
  backgroundConsumers.every((file) => !file.text.includes('publicProductSideBackgroundGet')),
  'the public route requires a PUBLISHED product a draft need not be',
);

// ---------------------------------------------------------------------------
// 7 · Document authority — APP3-P01 and nothing else
// ---------------------------------------------------------------------------
const documentModule = sources.find((file) => /model\/editor-document\.ts$/.test(file.path));
check('document: the constructor module exists', documentModule !== undefined);

// Anchored to the **call**, not to the identifier: every one of these names
// also appears in the import statement, so a substring scan would pass a module
// that imported P01's authority and then ignored it.
check(
  'document: the empty document is validated by APP3-P01 itself',
  /return validateDesignDocumentStructure\(\{/.test(documentModule?.text ?? ''),
  'the empty document is built without being handed to P01 for validation',
);
check(
  'document: the schema version comes from APP3-P01',
  /schemaVersion: CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION/.test(documentModule?.text ?? ''),
  'the schema version is not read from P01',
);
// Both limits, named individually. One of them satisfying the rule is how a
// hard-coded element cap sits beside a correctly-derived text cap and passes.
for (const limit of ['maxElements', 'maxTextElements']) {
  check(
    `document: ${limit} comes from APP3-P01`,
    new RegExp(`DESIGN_DOCUMENT_LIMITS\\.${limit}\\b`).test(documentModule?.text ?? ''),
    'a local limit would diverge from PO-09 the moment it changed',
  );
}
check(
  'document: the font comes from the controlled registry',
  documentModule?.text.includes('INTER_CONTROLLED_FONT') === true,
  'a font is named by something other than the controlled registry',
);

for (const file of sources) {
  check(
    `document: ${file.where} declares no schema version of its own`,
    !/schemaVersion\s*:\s*[0-9]/.test(file.text),
    'a literal schema version is a second authority the day P01 bumps its own',
  );
  check(
    `document: ${file.where} defines no second validator`,
    !/function validateDesignDocument/.test(file.text),
    'a second validator would disagree with P01 exactly when it mattered',
  );
  check(
    `document: ${file.where} names no CSS font family`,
    !/fontFamily\s*:\s*['"]/.test(file.text),
    'a document must reference a fontId, never a family a server never approved',
  );
}

// ---------------------------------------------------------------------------
// 8 · Geometry authority — APP3-P02 and nothing else
// ---------------------------------------------------------------------------
const stage = sources.find((file) => /components\/editor-stage\.tsx$/.test(file.path));
check('geometry: the stage module exists', stage !== undefined);

// Matched as calls. An import the stage no longer uses proves nothing, and the
// import list is where a substring scan would find every one of these names.
for (const symbol of ['resolveEffectiveTransform', 'getElementBounds', 'containsBounds']) {
  check(
    `geometry: the stage calls ${symbol} from the design engine`,
    new RegExp(`${symbol}\\(`).test(stage?.text ?? ''),
    'the stage computes something the engine already owns',
  );
}

for (const file of sources) {
  check(
    `geometry: ${file.where} composes no transform of its own`,
    !/Math\.(sin|cos|atan2)\b/.test(file.text) && !/rotationDeg\s*\*\s*Math\.PI/.test(file.text),
    'a rotation was computed outside the engine',
  );
  check(
    `geometry: ${file.where} performs no px↔mm conversion`,
    !/\bpxPerMm\s*[*/]/.test(file.text),
    'IMP-D045 makes product_sides.px_per_mm the sole conversion authority',
  );
}

// ---------------------------------------------------------------------------
// 9 · Rendering architecture — native SVG, no second renderer
// ---------------------------------------------------------------------------
for (const file of sources) {
  check(
    `render: ${file.where} introduces no rendering engine`,
    !/\b(konva|fabric|pixi|three)\b/i.test(file.text) &&
      !/getContext\(\s*['"]2d['"]/.test(file.text) &&
      !/<canvas\b/.test(file.text),
    'IMP-D026 locks native SVG rendered by React',
  );
  check(
    `render: ${file.where} uses no inline style or CSS custom property`,
    !/style=\{\{/.test(file.text) && !/'--[a-z-]+'\s*:/.test(file.text),
    '05-FRONTEND-AND-SCSS-STANDARD §8 forbids both; APP3-A01 was corrected for it',
  );
}
check(
  'render: the stage draws in the document placement canvas',
  stage?.text.includes('viewBox') === true && stage?.text.includes('canvasWidthPx') === true,
  'the stage does not use the document placement canvas as its coordinate space',
);

// ---------------------------------------------------------------------------
// 10 · Save, version and conflict semantics
// ---------------------------------------------------------------------------
const service = sources.find((file) => /design-template-editor\.service\.ts$/.test(file.path));
const stateModule = sources.find((file) => /model\/editor-state\.ts$/.test(file.path));
const failureModule = sources.find((file) => /model\/editor-failure\.ts$/.test(file.path));
const sourceModule = sources.find((file) => /model\/editor-source\.ts$/.test(file.path));
const screenSource =
  sources.find((file) => /design-template-editor-screen\.tsx$/.test(file.path))?.text ?? '';

// Anchored to the **object literal that becomes the request**, not to the names
// appearing somewhere in the file: a body that also carried a status would still
// mention both members, so a substring scan would pass the one mutation that
// matters.
check(
  'save: the body is exactly expectedCurrentVersion and document',
  /const body: SaveDesignTemplateDocumentBody = \{\s*expectedCurrentVersion,\s*document:[^}]*\};/.test(
    service?.text ?? '',
  ),
  'the request body is not the two published members alone',
);

for (const forbidden of ['status', 'scope', 'slug', 'publishedAt', 'documentSchemaVersion']) {
  check(
    `save: the body carries no ${forbidden}`,
    !new RegExp(`SaveDesignTemplateDocumentBody = \\{[^}]*\\b${forbidden}\\b`, 's').test(
      service?.text ?? '',
    ),
    'a member the contract does not declare was added to the save body',
  );
}

check(
  'save: an unversioned template expects version 0',
  /UNVERSIONED_EXPECTED_VERSION = 0/.test(sourceModule?.text ?? ''),
  'the never-saved case does not send 0',
);
check(
  'save: no version is fabricated for a never-saved template',
  !/version:\s*1\b/.test(sourceModule?.text ?? ''),
  'a version 1 was invented rather than derived by the server',
);
check(
  'save: the response replaces the local document rather than being assumed equal',
  /RESET_FROM_SERVER'?\s*:?[\s\S]{0,80}case 'SAVE_SUCCESS'/.test(stateModule?.text ?? '') ||
    /case 'SAVE_SUCCESS'/.test(stateModule?.text ?? ''),
  'the save success path does not adopt the returned canonical document',
);

// A `409` may not be answered from the refusal alone. The API raises both
// causes as a `ConflictException` and the envelope reduces every one of those
// to `code: "CONFLICT"`, so there is nothing on the wire to branch on — the
// cause is resolved from the template's own status instead.
check(
  'conflict: a 409 is not classified from the error alone',
  /return 'conflict-unresolved'/.test(failureModule?.text ?? ''),
  'the screen guessed which guard refused instead of asking',
);
check(
  'conflict: the cause is resolved from the reported template status',
  /export function resolveConflictCause/.test(failureModule?.text ?? '') &&
    /status === 'DRAFT' \? 'stale-version' : 'not-editable'/.test(failureModule?.text ?? ''),
  'the two 409 causes are not separated by authoritative state',
);
check(
  'conflict: an unresolvable 409 defaults to the recoverable branch',
  /if \(status === undefined\) return 'stale-version';/.test(failureModule?.text ?? ''),
  'a failed re-read would tell the operator their template left draft on no evidence',
);
// Matched as a **string literal**, which is the only form an error code can
// take. A bare identifier scan flags this feature's own `DESIGN_TEMPLATE_EDITOR_COPY`
// catalogue — a local constant that has nothing to do with the server's
// vocabulary — and a rule that fires on a name rather than on the construct
// carrying the meaning is not a rule.
const transcribers = sources.filter((file) => /['"]DESIGN_TEMPLATE_[A-Z_]+['"]/.test(file.text));
check(
  'conflict: no server error vocabulary is transcribed into the client',
  transcribers.length === 0,
  `an internal error code was copied into ${transcribers.map((file) => file.where).join(', ')}, where it can drift unnoticed`,
);
check(
  'conflict: the classifying re-read never replaces the draft',
  /const fresh = await detailQuery\.reload\(\);\s*\n\s*const cause = resolveConflictCause/.test(
    screenSource,
  ),
  'the 409 re-read does something other than classify',
);
check(
  'conflict: dismissing the dialog does not clear the conflict',
  /case 'KEEP_LOCAL_DRAFT':[\s\S]{0,200}conflictDialogOpen: false/.test(stateModule?.text ?? '') &&
    !/case 'KEEP_LOCAL_DRAFT':[\s\S]{0,200}conflicted: false/.test(stateModule?.text ?? ''),
  'closing the dialog would make a stale draft look saved',
);
check(
  'conflict: a conflicted draft cannot be saved',
  /!state\.conflicted/.test(stateModule?.text ?? ''),
  'the save is not disabled while the draft is known to be stale',
);

for (const file of sources) {
  check(
    `conflict: ${file.where} performs no automatic retry or merge`,
    !/\bmerge[A-Z(]/.test(file.text) && !/retry:\s*true/.test(file.text),
    'a merge or an automatic retry would break "the server was not overwritten"',
  );
}

const mutation = sources.find((file) => /use-save-template-document\.ts$/.test(file.path));
check(
  'save: the mutation never retries',
  /retry: false/.test(mutation?.text ?? ''),
  'a retried save would resend a version the server already refused',
);
check(
  'save: the response is written to the cache instead of triggering a second read',
  /setQueryData/.test(mutation?.text ?? '') && !/refetchQueries/.test(mutation?.text ?? ''),
  'a detail GET after the save asks a question the response already answered',
);

// ---------------------------------------------------------------------------
// 11 · Read-only, scope and the Template-image limitation
// ---------------------------------------------------------------------------
const screen = sources.find((file) => /design-template-editor-screen\.tsx$/.test(file.path));

check(
  'status: only DRAFT is editable',
  /EDITABLE_TEMPLATE_STATUS = 'DRAFT'/.test(sourceModule?.text ?? '') &&
    /detail\.status === EDITABLE_TEMPLATE_STATUS/.test(sourceModule?.text ?? ''),
  'the editable status is decided by something other than DRAFT',
);
check(
  'status: a non-DRAFT template renders no save control',
  /editable \? \(\s*<button[\s\S]{0,400}editor-save/.test(
    read(join(FEATURE, 'components/editor-topbar.tsx')),
  ),
  'the save button is not gated on the template being editable',
);

check(
  'scope: the editor mutates no placement',
  sources.every((file) => !/adminProductPlacementReplace/.test(file.text)),
  'the editor owns no Product placement mutation',
);

// `APP3-A03-C1` gave the unscoped state a purpose, so the rule changed shape.
// It used to be "an unscoped Template asks for no Product at all"; a selector
// that could not list Products would be useless. What still holds — and is the
// property the old rule was protecting — is that nothing about a *Product* is
// fetched speculatively: the placement query follows the scope when there is
// one, the operator's explicit choice while assigning, and nothing otherwise.
check(
  'scope: the placement query follows the scope, or an explicit choice, or nothing',
  /scopeRef\?\.productId \?\? \(assignable \? scopeAssignment\.candidateProductId : null\)/.test(
    screenSource,
  ),
  'the placement query is not bounded to a resolved scope or a chosen Product',
);
check(
  'scope: nothing for the editor is fetched on a small viewport',
  /viewport === 'mobile'\s*\n?\s*\? null/.test(screenSource),
  'a phone would issue the placement request the read-only notice has no use for',
);
check(
  'scope: the Product list is requested only while an assignment is possible',
  /useScopeProductOptions\(enabled\)/.test(read(join(FEATURE, 'hooks/use-scope-assignment.ts'))) &&
    /enabled: assignable/.test(screenSource),
  'the Product list is fetched for a Template that cannot be assigned one',
);
check(
  'scope: the Side and Area are resolved by id',
  /candidate\.id === scope\.productSideId/.test(
    stripComments(read(join(FEATURE, 'model/editor-scope.ts'))),
  ),
  'a scope resolved by name or index would follow a rename or a reorder',
);
check(
  'scope: an unresolved scope falls back to nothing',
  /return \{ kind: 'unresolved' \}/.test(
    stripComments(read(join(FEATURE, 'model/editor-scope.ts'))),
  ),
  'a fallback Side would author a document against geometry the Template does not name',
);

// ---------------------------------------------------------------------------
// 11b · APP3-A03-C1 — the one-time initial scope assignment
// ---------------------------------------------------------------------------
const c1Delivered = /\nAPP3-A03-C1 = COMPLETE/.test(plan);

if (c1Delivered) {
  const selector = read(join(FEATURE, 'components/editor-scope-assignment.tsx'));
  const selection = read(join(FEATURE, 'model/scope-selection.ts'));
  const scopeService = read(join(FEATURE, 'services/template-scope.service.ts'));

  check(
    'C1: the blocker is closed — the selector exists and is reachable',
    selector !== '' && /EditorScopeAssignment/.test(screenSource),
    'an unscoped DRAFT still has no way to acquire a scope',
  );
  check(
    'C1: only an unscoped, versionless DRAFT is offered the assignment',
    /detail\.scope === undefined &&\s*\n?\s*detail\.status === EDITABLE_TEMPLATE_STATUS &&\s*\n?\s*detail\.currentVersion === undefined/.test(
      read(join(FEATURE, 'model/editor-source.ts')),
    ),
    'the selector would be offered for a Template APP3-B03B refuses',
  );
  check(
    'C1: the assignment operation is consumed in exactly one service',
    sources.filter((file) => file.text.includes('adminDesignTemplateAssignScope')).length === 1,
    'the scope write is reachable from more than one module',
  );
  check(
    'C1: the request is exactly the three ids',
    /const body: AssignDesignTemplateScopeBody = \{ productId, productSideId, embroideryAreaId \};/.test(
      scopeService,
    ),
    'the assignment body carries something the contract does not declare',
  );
  check(
    'C1: Products come from the accepted Admin operation',
    /adminProductList/.test(scopeService) &&
      sources.every((file) => !/publicProductList|adminProductDetail/.test(file.text)),
    'Product discovery was invented, or reaches the published-only public list',
  );
  // The cascade is the whole reason the selection is a reducer. Anchored to the
  // returned object, not to the identifiers: a `SELECT_PRODUCT` that spread the
  // previous state would still mention every field.
  check(
    'C1: choosing a Product clears the Side and the Area',
    /return \{ productId: action\.productId, productSideId: null, embroideryAreaId: null \};/.test(
      selection,
    ),
    'a stale Side could survive a Product change, producing a triple from two Products',
  );
  check(
    'C1: choosing a Side clears the Area',
    /return \{ \.\.\.state, productSideId: action\.productSideId, embroideryAreaId: null \};/.test(
      selection,
    ),
    'a stale Area could survive a Side change',
  );
  check(
    'C1: retired Sides and Areas are not offered',
    /\.filter\(isLive\)/.test(selection) &&
      /retiredAt === null \|\| row\.retiredAt === undefined/.test(selection),
    'a retired row would be offered as a legal new placement',
  );
  check(
    'C1: Areas are read from the chosen Side, never a flattened list',
    /side\.areas\.filter\(isLive\)/.test(selection),
    'an Area from a sibling Side would be reachable',
  );
  check(
    'C1: no partial triple can be submitted',
    /if \(productId === null \|\| productSideId === null \|\| embroideryAreaId === null\) return null;/.test(
      selection,
    ) && /disabled=\{triple === null \|\| assigning\}/.test(selector),
    'the confirm can act without a complete triple',
  );
  check(
    'C1: success writes the server answer into the cache instead of re-reading',
    /setQueryData\(designTemplateEditorKeys\.detail\(templateId\), detail\)/.test(
      read(join(FEATURE, 'hooks/use-assign-template-scope.ts')),
    ),
    'the transition would need a second detail GET',
  );
  check(
    'C1: the assignment is never retried',
    /retry: false/.test(read(join(FEATURE, 'hooks/use-assign-template-scope.ts'))),
    'a retry would resend a triple the server already refused',
  );
  check(
    'C1: a lost race is resolved by one re-read, never by forcing the triple',
    /const fresh = await reloadDetail\(\);/.test(
      read(join(FEATURE, 'hooks/use-scope-assignment.ts')),
    ),
    'the 409 is answered without asking the server what actually happened',
  );
  check(
    'C1: no rescope or clear-scope path exists',
    sources.every((file) => !/rescope|clearScope|unassignScope|replaceScope/i.test(file.text)),
    'APP3-B03B publishes neither, so a control for either is a promise nothing can keep',
  );
  check(
    'C1: the scope stays read-only context after assignment',
    !/onChangeScope|onClearScope/.test(read(join(FEATURE, 'components/editor-scope-panel.tsx'))),
    'the scope panel grew a mutation affordance',
  );
  check(
    'C1: the correction is recorded and the follow-up reconciled',
    /FU-APP3-TEMPLATE-SCOPE-EDIT-01 = CLOSED_FOR_CURRENT_APP3_SCOPE/.test(plan),
    'the follow-up still claims the blocker is open, or claims general rescope',
  );
}

const layers = stripComments(read(join(FEATURE, 'components/editor-layer-list.tsx')));
check(
  'image: the add-image control is present and disabled with a reason',
  /data-testid="editor-add-image"/.test(layers) &&
    /disabled\s*\n?\s*aria-describedby="editor-add-image-reason"/.test(layers),
  'the control is hidden, enabled, or carries no reason',
);
check(
  'image: the reason names the missing TEMPLATE_SOURCE flow',
  /addDisabledReason/.test(layers) &&
    /TEMPLATE_SOURCE/.test(read(join(FEATURE, 'model/design-template-editor-copy.ts'))),
  'the disabled control does not say what it is waiting for',
);
check(
  'image: no CATALOG_MEDIA or asset-upload substitution',
  sources.every((file) => !/CATALOG_MEDIA/.test(file.text) && !/adminAssetUpload/.test(file.text)),
  'a substitute asset kind or an upload route reached the editor',
);

// ---------------------------------------------------------------------------
// 12 · Responsive and accessibility
// ---------------------------------------------------------------------------
const viewport = sources.find((file) => /use-editor-viewport\.ts$/.test(file.path));
check(
  'responsive: an unknown viewport fails safe to desktop',
  /useState<EditorViewportMode>\('desktop'\)/.test(viewport?.text ?? ''),
  'a false mobile verdict would hide the whole editor from a desktop operator',
);
check(
  'responsive: mobile returns the notice instead of the editor',
  /viewport === 'mobile'[\s\S]{0,400}editor-mobile-notice/.test(screen?.text ?? ''),
  'the mobile branch does not replace the editor',
);
check(
  'responsive: mobile issues no background request',
  /productId: viewport === 'mobile' \? null/.test(screen?.text ?? ''),
  'the background query is not disabled on a small viewport',
);

// Comments are stripped for the same reason they are in the source rules, and
// the omission was a real defect: the declaration below is *explained* by a
// comment naming `minmax(0, 1fr)`, so a rule reading the raw file was satisfied
// by its own rationale even after the declaration was changed to `1fr`.
const styles = stripComments(read(STYLESHEET));
check('style: the stylesheet exists', styles.trim() !== '');
check(
  'style: no literal colour or rgba',
  !/#[0-9a-fA-F]{3,8}\b/.test(styles) && !/\brgba?\(/.test(styles),
  'a literal colour bypasses the design-system tokens',
);
check(
  'style: the scrim is the canonical token',
  styles.includes('styles.$color-overlay-scrim'),
  'the dialog scrim is not the shared token',
);
check(
  'style: every class is feature-prefixed',
  (styles.match(/^\.[a-z][a-z0-9_-]*/gm) ?? []).every((name) =>
    name.startsWith('.template-editor'),
  ),
  'the Admin stylesheet is global; an unprefixed class collides silently',
);
check(
  'style: the stage may shrink rather than overflow',
  styles.includes('minmax(0, 1fr)'),
  "a grid track's default minimum is auto, which is how a wide SVG creates a horizontal scrollbar",
);
// The inspector is a scroll container on both axes whatever the x rule says —
// CSS computes a `visible` axis to `auto` when the other is not `visible`. So
// the rule asserts what actually prevents `APP3-A01`'s clipped inspector: the
// column may shrink and nothing inside may exceed it.
check(
  'style: the inspector scrolls vertically and nothing inside can exceed its width',
  styles.includes('overflow-y: auto') &&
    /\.template-editor-scope,\s*\n\.template-editor-inspector \{[^}]*min-width: 0;/.test(styles) &&
    /\.template-editor-inspector \{[^}]*max-width: 100%;/.test(styles),
  'the inspector can clip its own controls, which is how APP3-A01 lost half of one',
);
check(
  'style: the stylesheet is registered in the Admin entry',
  read(join(ADMIN, 'src/styles/main.scss')).includes(
    'features/design-template-editor/styles/design-template-editor',
  ),
  'the stylesheet is never loaded',
);

check(
  'a11y: the stage does not trap focus',
  /role="group"/.test(stage?.text ?? '') && !/tabIndex=\{0\}/.test(stage?.text ?? ''),
  'the stage element is focusable or announces itself as an application',
);
check(
  'a11y: the layer list offers selection without a pointer',
  /<button/.test(layers) && /aria-pressed=/.test(layers),
  'selection is only reachable on the canvas',
);
check(
  'a11y: the save state is announced politely',
  /aria-live="polite"/.test(read(join(FEATURE, 'components/editor-topbar.tsx'))),
  'a save is either silent or interrupts the operator',
);
check(
  'a11y: the conflict dialog is modal and focus-managed',
  /aria-modal="true"/.test(read(join(FEATURE, 'components/editor-dialog.tsx'))),
  'the conflict dialog is not a managed modal',
);

// ---------------------------------------------------------------------------
// 13 · No contract, API, worker, database or Figma change
// ---------------------------------------------------------------------------
const openapi = JSON.parse(read(OPENAPI) || '{"paths":{},"components":{"schemas":{}}}');
const pathCount = Object.keys(openapi.paths).length;
const operationCount = Object.values(openapi.paths).reduce(
  (total, item) =>
    total +
    Object.keys(item).filter((method) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
      .length,
  0,
);
const schemaCount = Object.keys(openapi.components.schemas).length;

// A frontend gate cannot express "this checkpoint published no operation" as a
// frozen total. `32`/`37`/`81` were true the day A03 shipped and became false
// the moment `APP3-B03B` legitimately added the scope assignment — a rule
// failing for a reason that has nothing to do with the editor.
//
// The Admin Template surface is asserted as an enumerated set instead, derived
// from the shared authority so an accepted checkpoint's operation is not
// re-litigated here. It stays strict: a route no checkpoint claims still fails.
const adminTemplatePaths = Object.keys(openapi.paths).filter((path) =>
  path.startsWith('/api/admin/design-templates'),
);
const acceptedTemplatePaths = acceptedAdminTemplatePaths(REPO_ROOT);
check(
  'contract: the Admin Template surface is exactly what the accepted checkpoints published',
  adminTemplatePaths.slice().sort().join('\n') === acceptedTemplatePaths.slice().sort().join('\n'),
  `found ${adminTemplatePaths.join(', ')}`,
);
check(
  'contract: this feature publishes nothing of its own',
  pathCount >= 32 && operationCount >= 37 && schemaCount >= 81,
  `the surface shrank below the world A03 was built against ` +
    `(${String(pathCount)}/${String(operationCount)}/${String(schemaCount)})`,
);
check(
  'contract: the operations A03 consumes already existed',
  openapi.paths['/api/admin/design-templates/{templateId}']?.get?.operationId ===
    'adminDesignTemplate_detail' &&
    openapi.paths['/api/admin/design-templates/{templateId}/document']?.put?.operationId ===
      'adminDesignTemplate_saveDocument',
  'A03 did not consume the published operations',
);

// The tracked migration directory only. Counting every `.sql` under
// `packages/database` also counts `dist/migrations`, which is git-ignored build
// output — a gate whose verdict changes depending on whether someone has run a
// build is not a gate.
const migrations = collect(join(REPO_ROOT, 'packages/database/migrations'), /\.sql$/);
check(
  'scope: no migration was added',
  migrations.length === 34,
  `${String(migrations.length)} migrations`,
);

const rootScripts = Object.keys(JSON.parse(read(ROOT_PACKAGE)).scripts ?? {});
check(
  'governance: the root script count is unchanged',
  rootScripts.length === 30,
  `${String(rootScripts.length)} root scripts`,
);

const commandRows = read(COMMAND_INDEX).split('\n');
for (const [command, invocation] of [
  ['CMD-CHECK-APP3-A03', 'node tools/check-app3-a03.mjs'],
  ['CMD-TEST-APP3-A03', 'node --test tools/check-app3-a03.test.mjs'],
  ['CMD-TEST-APP3-A03-ADMIN', '--testPathPatterns=design-template-editor'],
]) {
  check(
    `governance: ${command} is registered`,
    commandRows.some((row) => row.includes(`\`${command}\` |`) && row.includes(invocation)),
    'not registered in the scoped command index, or not bound to its command',
  );
}

// ---------------------------------------------------------------------------
// 14 · File-size policy
// ---------------------------------------------------------------------------
const oversized = collect(FEATURE, /\.tsx?$/).filter((path) => read(path).split('\n').length > 400);
check(
  'policy: every production file is within 400 lines',
  oversized.length === 0,
  oversized.map((path) => relative(REPO_ROOT, path)).join(', '),
);

const oversizedTests = collect(join(ADMIN, 'test'), /design-template-editor.*\.tsx?$/).filter(
  (path) => read(path).split('\n').length > 600,
);
check(
  'policy: every A03 test file is within 600 lines',
  oversizedTests.length === 0,
  oversizedTests.map((path) => relative(REPO_ROOT, path)).join(', '),
);

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------
if (failures.length > 0) {
  console.error(`APP3-A03 check FAILED (${String(failures.length)} of ${String(checks.length)}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `APP3-A03 check passed (${String(checks.length)} assertions; one protected editor route, two ` +
    'generated operations, six approved design rows). The document comes from APP3-P01 and the ' +
    'geometry from APP3-P02 — no second schema, validator or transform exists here; the save ' +
    'sends exactly the two published members and echoes the version the server issued; a 409 is ' +
    'resolved from the template status the server reports rather than guessed from a refusal ' +
    'that carries no discriminator, and the conflict it opens offers two choices, never a merge, ' +
    'never a force-save and never a retry; and Template image intake stays visible, disabled and ' +
    'explained rather than substituted.',
);
