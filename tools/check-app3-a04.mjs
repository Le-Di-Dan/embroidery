#!/usr/bin/env node
/**
 * `APP3-A04` — the Admin Design Template lifecycle screen.
 *
 * The rules worth a machine are the ones that stay green while being wrong. A
 * readiness row rendered green because nothing could evaluate it. A publish
 * disabled by a client guess instead of the server. A 409 replayed. An archive
 * that says "delete". A restore that publishes. A `targetStatus` in a body. Each
 * of those ships a screen that looks right and misleads the operator holding it.
 *
 * The contract-immutability rules matter as much: A04 adds **zero** API
 * operations, so the published document and the generated client must be
 * byte-identical to the world `APP3-B04A` left. A frontend checkpoint that moved
 * either of them changed something nobody reviewed as a contract change.
 *
 * This gate does not read the completion report. A report is a claim; every fact
 * below is recomputed from the repository. Read-only, cross-platform pure Node.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { acceptedSurface } from './app3-accepted-surface.mjs';
import {
  A04_DESIGN_ROWS,
  A04_LIFECYCLE_OPERATIONS,
  READINESS_CONDITIONS,
  checkDesignApproval,
  checkReadinessConcepts,
} from './check-app3-a04-authority.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const FEATURE = 'apps/admin/src/features/design-template-lifecycle';

export const PUBLICATION_ROUTE_FILE =
  'apps/admin/src/app/(protected)/design-templates/[templateId]/publication/page.tsx';

export const CANONICAL_FILES = Object.freeze({
  phase: 'docs/implementation/phases/APP3-DESIGN-TEMPLATES-AND-STUDIO.md',
  index: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  registry: 'docs/design/FIGMA_DESIGN_INDEX.md',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
  generatedClient: 'packages/api-client/src/generated/embroidery-api.ts',
  curatedClient: 'packages/api-client/src/index.ts',
  rootPackage: 'package.json',
  route: PUBLICATION_ROUTE_FILE,
  routeAuthority: 'apps/admin/src/features/design-templates/model/design-template-route.ts',
  screen: `${FEATURE}/components/design-template-publication-screen.tsx`,
  actionPanel: `${FEATURE}/components/lifecycle-action-panel.tsx`,
  readinessPanel: `${FEATURE}/components/readiness-panel.tsx`,
  readinessModel: `${FEATURE}/model/lifecycle-readiness.ts`,
  actionsModel: `${FEATURE}/model/lifecycle-actions.ts`,
  failureModel: `${FEATURE}/model/lifecycle-failure.ts`,
  copy: `${FEATURE}/model/lifecycle-copy.ts`,
  service: `${FEATURE}/services/design-template-lifecycle.service.ts`,
  command: `${FEATURE}/hooks/use-lifecycle-command.ts`,
  editorScreen:
    'apps/admin/src/features/design-template-editor/components/design-template-editor-screen.tsx',
  listFeature: 'apps/admin/src/features/design-templates',
  unitSpec: 'apps/admin/test/components/design-template-lifecycle.test.tsx',
  readinessSpec: 'apps/admin/test/components/design-template-lifecycle-readiness.test.tsx',
  boundarySpec: 'apps/admin/test/boundary/design-template-lifecycle-source.test.ts',
});

const MIGRATIONS = 'packages/database/migrations';
const EXPECTED_MIGRATIONS = 34;
const ROOT_SCRIPTS = 30;
const RUNTIME_FILE_LIMIT = 400;
const TEST_FILE_LIMIT = 600;

/** The world `APP3-B04A` left, which a frontend checkpoint may not move. */
const FROZEN_OPENAPI_SHA256 = 'f736306045faa1c7a638bf7749b27051e351b967d29d574c20c6dce1fb581908';
const GENERATED_CLIENT_DIR = 'packages/api-client/src/generated';
const FROZEN_CLIENT_TREE_SHA256 =
  'f47c774ad5a6b3e1f40ad1d1413e6693e3a7ba5a1088f7cadd716a17519f62d9';

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** Comments explain what a file deliberately avoids; rules must not match them. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const code = (rootDir, key) => stripComments(read(rootDir, key) ?? '');

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

/** Predecessors: this checkpoint consumes four accepted backend operations. */
export function checkPredecessors(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';
  for (const line of [
    'APP3-B04 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-B04A = COMPLETE — REVIEW_ACCEPTED',
    'APP3-D01 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-A02 = COMPLETE — REVIEW_ACCEPTED',
    'APP3-A03 = COMPLETE — REVIEW_ACCEPTED',
  ]) {
    if (!phase.includes(`\n${line}\n`)) {
      fail(`${CANONICAL_FILES.phase}: status block does not record "${line}"`);
    }
  }
}

/** One screen, one route, addressed by UUID; the editor links to it. */
export function checkRoute(rootDir, fail) {
  if (read(rootDir, 'route') === undefined) {
    fail(`${PUBLICATION_ROUTE_FILE}: missing`);
  }

  const authority = code(rootDir, 'routeAuthority');
  if (!/adminDesignTemplatePublicationRoute/.test(authority)) {
    fail(`${CANONICAL_FILES.routeAuthority}: publishes no publication route helper`);
  }
  // The one URL space, and no `/admin/` prefix or slug address.
  if (/['"`]\/admin\/design-templates/.test(authority)) {
    fail(`${CANONICAL_FILES.routeAuthority}: spells an /admin-prefixed Template route`);
  }
  if (/slug/.test(authority.split('adminDesignTemplatePublicationRoute')[1] ?? '')) {
    fail(`${CANONICAL_FILES.routeAuthority}: addresses publication by slug rather than UUID`);
  }

  // Exactly three Design Template route files: list, editor, publication.
  const routes = collect(join(rootDir, 'apps/admin/src/app'), /\.tsx$/)
    .map((path) => path.replace(/\\/g, '/'))
    .filter((path) => /design-template/i.test(path));
  if (routes.length !== 3) {
    fail(`apps/admin/src/app: ${routes.length} Design Template routes, expected 3`);
  }

  // The editor's single affordance is a navigation through the guard.
  const editor = code(rootDir, 'editorScreen');
  if (
    !/guard\.requestNavigation\(\(\) => \{\s*router\.push\(adminDesignTemplatePublicationRoute/.test(
      editor,
    )
  ) {
    fail(`${CANONICAL_FILES.editorScreen}: does not route to A04 through the navigation guard`);
  }
}

/** All four lifecycle operations cross the curated boundary, in A04 alone. */
export function checkClientBoundary(rootDir, fail) {
  const curated = code(rootDir, 'curatedClient');
  for (const operation of A04_LIFECYCLE_OPERATIONS) {
    if (!new RegExp(`\\b${operation},`).test(curated)) {
      fail(`${CANONICAL_FILES.curatedClient}: does not export ${operation}`);
    }
  }

  // The consumer boundary: A04 calls them, and no other feature does.
  const feature = collect(join(rootDir, FEATURE), /\.tsx?$/);
  const featureText = feature.map((path) => readFileSync(path, 'utf8')).join('\n');
  for (const operation of A04_LIFECYCLE_OPERATIONS) {
    if (!featureText.includes(operation)) {
      fail(`${FEATURE}: does not consume ${operation}`);
    }
  }

  for (const [label, dir] of [
    ['the Template list', CANONICAL_FILES.listFeature],
    ['the Template editor', 'apps/admin/src/features/design-template-editor'],
  ]) {
    const sources = collect(join(rootDir, dir), /\.tsx?$/);
    for (const path of sources) {
      const text = stripComments(readFileSync(path, 'utf8'));
      for (const operation of A04_LIFECYCLE_OPERATIONS) {
        if (text.includes(operation)) {
          fail(`${label}: ${path.replace(/\\/g, '/')} invokes ${operation}, which is APP3-A04's`);
        }
      }
    }
  }
}

/** The action matrix: four transitions, and the ones LC-24 refuses are absent. */
export function checkActionMatrix(rootDir, fail) {
  const actions = code(rootDir, 'actionsModel');

  for (const [status, expected] of [
    ['DRAFT', "\\['publish', 'archive'\\]"],
    ['PUBLISHED', "\\['unpublish', 'archive'\\]"],
    ['ARCHIVED', "\\['restore'\\]"],
  ]) {
    if (!new RegExp(`${status}: Object\\.freeze\\(${expected}`).test(actions)) {
      fail(`${CANONICAL_FILES.actionsModel}: ${status} does not offer exactly its LC-24 actions`);
    }
  }
  // Restore is reachable from `ARCHIVED` alone, and never chains into publish.
  if (/ARCHIVED:[^\n]*publish/.test(actions)) {
    fail(`${CANONICAL_FILES.actionsModel}: offers a publish from ARCHIVED`);
  }
  if (/restoreAndPublish|publishAfterRestore/i.test(actions)) {
    fail(`${CANONICAL_FILES.actionsModel}: chains restore into a publish`);
  }
  // A reason for archive and restore, and for neither of the others.
  if (!/REASONED_ACTIONS[\s\S]{0,120}'archive',\s*\n?\s*'restore',/.test(actions)) {
    fail(`${CANONICAL_FILES.actionsModel}: does not require a reason for archive and restore`);
  }
  if (!/REASON_MAX_LENGTH = 500/.test(actions)) {
    fail(`${CANONICAL_FILES.actionsModel}: does not mirror the 500-character server bound`);
  }

  // No delete anywhere on the surface.
  for (const path of collect(join(rootDir, FEATURE), /\.tsx?$/)) {
    const text = stripComments(readFileSync(path, 'utf8'));
    if (/adminDesignTemplateDelete|hardDelete|\bDELETE\b/.test(text)) {
      fail(`${path.replace(/\\/g, '/')}: names a delete — archive is retention, never removal`);
    }
  }
}

/** The exact bodies: the token, the reason, and nothing the server owns. */
export function checkCommandBodies(rootDir, fail) {
  const service = code(rootDir, 'service');

  for (const [action, shape] of [
    ['publish', 'PublishDesignTemplateBody = { expectedCurrentVersion }'],
    ['unpublish', 'UnpublishDesignTemplateBody = { expectedCurrentVersion }'],
  ]) {
    if (!service.includes(shape)) {
      fail(`${CANONICAL_FILES.service}: ${action} does not send the token alone`);
    }
  }
  for (const action of ['Archive', 'Restore']) {
    const body = new RegExp(
      `${action}DesignTemplateBody = \\{\\s*expectedCurrentVersion,\\s*reason: requireReason`,
    );
    if (!body.test(service)) {
      fail(`${CANONICAL_FILES.service}: ${action.toLowerCase()} does not send token + reason`);
    }
  }
  for (const owned of [
    'targetStatus',
    'publishedAt',
    'archivedAt',
    'force',
    'publishAfterRestore',
    'versionToPublish',
  ]) {
    if (new RegExp(`\\b${owned}\\b`).test(service)) {
      fail(`${CANONICAL_FILES.service}: sends server-owned "${owned}"`);
    }
  }

  // The token comes from the authoritative detail, never a local increment.
  const screen = code(rootDir, 'screen');
  if (!/expectedCurrentVersion: detail\.currentVersion\?\.version \?\? 0/.test(screen)) {
    fail(`${CANONICAL_FILES.screen}: the concurrency token is not the authoritative version`);
  }
  if (/version \+ 1|\+\+|incrementVersion/.test(screen)) {
    fail(`${CANONICAL_FILES.screen}: increments a version locally`);
  }
}

/** Success adopts the response; a conflict re-reads once and never replays. */
export function checkCacheBehaviour(rootDir, fail) {
  const command = code(rootDir, 'command');

  if (!/setQueryData\(designTemplateEditorKeys\.detail\(templateId\), detail\)/.test(command)) {
    fail(`${CANONICAL_FILES.command}: does not adopt the response into the shared detail entry`);
  }
  if (!/invalidateQueries\(\{ queryKey: designTemplateQueryKeys\.lists\(\) \}\)/.test(command)) {
    fail(`${CANONICAL_FILES.command}: does not invalidate the Template list root`);
  }
  if (!/retry:\s*false/.test(command)) {
    fail(`${CANONICAL_FILES.command}: the lifecycle mutation may retry`);
  }
  // Exactly one authoritative re-read, and only on the conflict path.
  const rereads = (command.match(/fetchLifecycleDetail\(/g) ?? []).length;
  if (rereads !== 1) {
    fail(`${CANONICAL_FILES.command}: ${rereads} authoritative re-reads, expected exactly 1`);
  }
  if (!/requiresAuthoritativeReread\(/.test(command)) {
    fail(`${CANONICAL_FILES.command}: does not gate the re-read on the conflict classification`);
  }
  // A stale reason-bearing command voids its confirmation.
  if (!/setReasonInvalidated\(requiresReason\(request\.action\)\)/.test(command)) {
    fail(`${CANONICAL_FILES.command}: a stale archive or restore keeps its old confirmation`);
  }
  // Never optimistic.
  if (/optimistic|onMutate/i.test(command)) {
    fail(`${CANONICAL_FILES.command}: flips state optimistically`);
  }

  const failure = code(rootDir, 'failureModel');
  if (!/httpStatus/.test(failure)) {
    fail(`${CANONICAL_FILES.failureModel}: does not classify from the transport status`);
  }
  const classify = /export function classifyLifecycleFailure\(([\s\S]*?)\n}/.exec(failure);
  if (classify === null) {
    fail(`${CANONICAL_FILES.failureModel}: the classifier is not identifiable`);
  } else if (/\.message/.test(classify[1])) {
    fail(`${CANONICAL_FILES.failureModel}: branches on message text`);
  }
}

/** Archive is retention; restore lands in DRAFT and never republishes. */
export function checkCopyRulings(rootDir, fail) {
  const copy = read(rootDir, 'copy') ?? '';

  for (const [needle, complaint] of [
    ['không phải xoá', 'archive does not say it is not a delete'],
    ['có thể khôi phục sau', 'archive does not say it can be restored'],
    ['không được xuất bản lại', 'restore does not say it is not a republication'],
    ['không được sửa tự động', 'restore does not say the scope is left alone'],
    ['không thay đổi gì', 'a refusal does not say the server changed nothing'],
  ]) {
    if (!copy.includes(needle)) fail(`${CANONICAL_FILES.copy}: ${complaint}`);
  }
  // Never claims a cascade or a deletion.
  for (const forbidden of ['xoá vĩnh viễn', 'xoá tất cả', 'xoá Asset', 'xoá phiên bản']) {
    if (copy.includes(forbidden)) {
      fail(`${CANONICAL_FILES.copy}: claims a deletion ("${forbidden}") that never happens`);
    }
  }
  // The refusal names no guard, because the wire publishes no discriminator.
  const notReady = /notReady:\s*\n?\s*'([^']*)'/.exec(copy)?.[1] ?? '';
  for (const condition of READINESS_CONDITIONS) {
    if (notReady.includes(condition)) {
      fail(`${CANONICAL_FILES.copy}: the publish refusal names "${condition}"`);
    }
  }
}

/** Zero API change: the frozen document and the frozen generated client. */
export function checkContractImmutability(rootDir, fail) {
  const openapi = read(rootDir, 'openapi');
  if (openapi === undefined) {
    fail(`${CANONICAL_FILES.openapi}: missing`);
  } else {
    const digest = createHash('sha256').update(openapi).digest('hex');
    if (digest !== FROZEN_OPENAPI_SHA256) {
      fail(`${CANONICAL_FILES.openapi}: sha256 ${digest}; APP3-A04 adds no API operation`);
    }
    const document = JSON.parse(openapi);
    const surface = acceptedSurface(rootDir);
    const paths = Object.keys(document.paths ?? {}).length;
    const operations = Object.values(document.paths ?? {}).reduce(
      (total, methods) => total + Object.keys(methods).length,
      0,
    );
    const schemas = Object.keys(document.components?.schemas ?? {}).length;
    if (paths !== surface.paths || operations !== surface.operations) {
      fail(
        `${CANONICAL_FILES.openapi}: ${paths}/${operations}, expected ${surface.paths}/${surface.operations}`,
      );
    }
    if (surface.schemas !== undefined && schemas !== surface.schemas) {
      fail(`${CANONICAL_FILES.openapi}: ${schemas} schemas, expected ${surface.schemas}`);
    }
  }

  const tree = hashGeneratedTree(join(rootDir, GENERATED_CLIENT_DIR));
  if (tree !== FROZEN_CLIENT_TREE_SHA256) {
    fail(`${GENERATED_CLIENT_DIR}: tree hash ${tree}; the generated client must not move`);
  }
}

/** The generated client's tree hash, computed exactly as `check:generated` does. */
function hashGeneratedTree(dir) {
  const files = [];
  const walk = (directory, prefix) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const full = join(directory, entry.name);
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(full, relative);
      else files.push([relative, readFileSync(full, 'utf8')]);
    }
  };
  walk(dir, '');
  const hash = createHash('sha256');
  for (const [path, content] of files) {
    hash.update(path);
    hash.update('\n');
    hash.update(content.replace(/\r\n/g, '\n'));
    hash.update('\0');
  }
  return hash.digest('hex');
}

/** No backend, worker, migration or dependency change; file sizes; commands. */
export function checkBoundaries(rootDir, fail) {
  const migrations = join(rootDir, MIGRATIONS);
  const count = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith('.sql')).length
    : 0;
  if (count !== EXPECTED_MIGRATIONS) {
    fail(`${MIGRATIONS}: ${count} migrations, expected ${EXPECTED_MIGRATIONS}`);
  }

  const rootPackage = read(rootDir, 'rootPackage');
  if (rootPackage !== undefined) {
    const scripts = Object.keys(JSON.parse(rootPackage).scripts ?? {});
    if (scripts.length !== ROOT_SCRIPTS) {
      fail(`package.json: ${scripts.length} root scripts, expected ${ROOT_SCRIPTS}`);
    }
  }

  for (const path of collect(join(rootDir, FEATURE), /\.tsx?$/)) {
    const lines = readFileSync(path, 'utf8').split('\n').length;
    if (lines > RUNTIME_FILE_LIMIT) {
      fail(`${path.replace(/\\/g, '/')}: ${lines} lines, over the ${RUNTIME_FILE_LIMIT} limit`);
    }
  }
  for (const key of ['unitSpec', 'readinessSpec', 'boundarySpec']) {
    const source = read(rootDir, key);
    if (source === undefined) {
      fail(`${CANONICAL_FILES[key]}: missing`);
      continue;
    }
    const lines = source.split('\n').length;
    if (lines > TEST_FILE_LIMIT) {
      fail(`${CANONICAL_FILES[key]}: ${lines} lines, over the ${TEST_FILE_LIMIT} limit`);
    }
  }

  const index = read(rootDir, 'index') ?? '';
  for (const command of ['CMD-CHECK-APP3-A04', 'CMD-TEST-APP3-A04', 'CMD-TEST-APP3-A04-ADMIN']) {
    if (!index.includes(command)) fail(`${CANONICAL_FILES.index}: does not index ${command}`);
  }
}

export function checkApp3A04(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);
  checkPredecessors(rootDir, fail);
  checkDesignApproval(rootDir, fail, read);
  checkRoute(rootDir, fail);
  checkClientBoundary(rootDir, fail);
  checkActionMatrix(rootDir, fail);
  checkCommandBodies(rootDir, fail);
  checkReadinessConcepts(rootDir, fail, code, CANONICAL_FILES);
  checkCacheBehaviour(rootDir, fail);
  checkCopyRulings(rootDir, fail);
  checkContractImmutability(rootDir, fail);
  checkBoundaries(rootDir, fail);
  return failures;
}

async function main() {
  const failures = checkApp3A04(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-a04 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `check:app3-a04 — one lifecycle screen at one route, consuming the four LC-24 operations and ` +
      `no fifth: ${String(A04_DESIGN_ROWS.length)} approved design rows and no Studio row; the ` +
      'action matrix offers publish/archive from DRAFT, unpublish/archive from PUBLISHED and ' +
      'restore alone from ARCHIVED, with no direct republication and no delete; every command ' +
      'sends the authoritative expectedCurrentVersion and nothing the server owns, archive and ' +
      'restore carrying a bounded reason; all seven GRD-T01 conditions are rendered from a ' +
      'computed advisory panel with no readiness endpoint invented, an unprovable row never ' +
      'reads as a pass and never blocks, and the server stays the final authority; a refusal ' +
      'names no guard because the wire publishes none, and states the server changed nothing; a ' +
      'conflict is never replayed, is re-read exactly once, and voids a stale reason; the list ' +
      'and the editor still invoke no lifecycle operation; and the OpenAPI document and the ' +
      'generated client are byte-identical to the world APP3-B04A left.',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
