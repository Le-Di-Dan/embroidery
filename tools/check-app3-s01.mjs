#!/usr/bin/env node
/**
 * `APP3-S01` — Studio bootstrap shell, placement context and Template selection.
 *
 * The rules worth a machine are the ones that stay green while being wrong. A
 * picker that asks the Admin placement APIs and shows retired Sides to a
 * customer. One that fabricates a page number over a keyset cursor, or reads a
 * detail per listed row. One that keeps the previous Side's Template selected,
 * so a session is opened on a placement the visitor is no longer looking at.
 * One whose preview object URL is never revoked, or is written to storage where
 * it outlives the `no-store` it was served under. One where a refused clone
 * quietly becomes a blank session nobody asked for. One that persists a Session
 * id in `localStorage` and calls it resume. One that starts building the S02
 * editor because the preview box looked empty. Every one of those ships a
 * working screen.
 *
 * This module rules on the route, the design approval and the artifacts that
 * must not move; `check-app3-s01-runtime.mjs` rules on what the screen does.
 *
 * The route rule is **world-aware**. Before S01 the Studio route must not
 * exist — that absence is what proves no earlier checkpoint invented one — and
 * after it, the same route must exist. A gate that only ever asserted presence
 * would accept "whatever routes currently exist", which is the failure it is
 * here to prevent.
 *
 * This gate does not read the completion report. A report is a claim; every
 * fact below is recomputed from the repository.
 *
 * Read-only, cross-platform pure Node. No network, no database, no container.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  S01_STATUS_LINES,
  acceptedSurface,
  isS01Delivered,
  isS02Delivered,
} from './app3-accepted-surface.mjs';
import {
  CANONICAL_FILES,
  EXPECTED_MIGRATIONS,
  FEATURE,
  LATER_STUDIO_ROWS,
  MIGRATIONS,
  REJECTED_STUDIO_ROUTES,
  REPO_ROOT,
  ROOT_SCRIPTS,
  S01_DESIGN_ROWS,
  S02_DESIGN_ROWS,
  STOREFRONT,
  STUDIO_ROUTE,
  code,
  collect,
  featureCode,
  read,
} from './check-app3-s01.sources.mjs';
import {
  checkApiBoundary,
  checkPreview,
  checkSelection,
  checkSession,
  checkTemplateReads,
} from './check-app3-s01-runtime.mjs';

export { REPO_ROOT, CANONICAL_FILES, STUDIO_ROUTE, S01_DESIGN_ROWS, LATER_STUDIO_ROWS };
export { checkApiBoundary, checkPreview, checkSelection, checkSession, checkTemplateReads };

/** The predecessors this screen is only meaningful on top of. */
export function checkPredecessors(rootDir, fail) {
  const phase = read(rootDir, 'phase') ?? '';
  for (const id of [
    'APP3-D01',
    'APP3-D01-C1',
    'APP3-B01',
    'APP3-B02',
    'APP3-B05',
    'APP3-B05A',
    'APP3-B07',
    'APP3-P01',
    'APP3-P02',
    'APP3-A01',
    'APP3-A04',
  ]) {
    if (!phase.includes(`\n${id} = COMPLETE — REVIEW_ACCEPTED\n`)) {
      fail(`${CANONICAL_FILES.phase}: "${id} = COMPLETE — REVIEW_ACCEPTED" is not recorded`);
    }
  }
  if (!S01_STATUS_LINES.some((line) => phase.includes(`\n${line}\n`))) {
    fail(`${CANONICAL_FILES.phase}: APP3-S01 is not recorded under a legitimate status`);
  }
  if (isS01Delivered(rootDir)) {
    for (const line of [
      'APP3-S01 BACKEND_CHANGE = NONE',
      'APP3-S01 MIGRATION = NONE',
      'APP3-S01 BROWSER_PERSISTENCE = NONE',
    ]) {
      if (!phase.includes(`\n${line}`)) {
        fail(`${CANONICAL_FILES.phase}: status block does not record "${line}"`);
      }
    }
  }
  // The intake follow-up is not S01's to close, and a frontend checkpoint that
  // closed it would be claiming an intake surface nobody reviewed.
  if (!/FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01/.test(phase)) {
    fail(`${CANONICAL_FILES.phase}: the TEMPLATE_SOURCE intake follow-up is no longer recorded`);
  }
  // S02 is the next checkpoint, not part of this one — and a successor cannot
  // ship before the predecessor it consumes. Once S01 is delivered the stage is
  // free to exist; before that, an S02 recorded complete would mean the stage
  // was built on a bootstrap that had not shipped.
  if (!isS01Delivered(rootDir) && /\nAPP3-S02 = COMPLETE/.test(phase)) {
    fail(`${CANONICAL_FILES.phase}: APP3-S02 is recorded complete before APP3-S01 delivered it`);
  }
}

function rowStatus(registry, id) {
  const line = registry.split('\n').find((row) => row.startsWith(`| ${id} |`));
  return line === undefined ? null : (line.split('|')[8] ?? '').trim();
}

/** Scoped design approval, asserted in both directions. */
export function checkDesignApproval(rootDir, fail) {
  const registry = read(rootDir, 'registry') ?? '';
  const delivered = isS01Delivered(rootDir);

  for (const [id, node] of Object.entries(S01_DESIGN_ROWS)) {
    const line = registry.split('\n').find((row) => row.startsWith(`| ${id} |`));
    if (line === undefined) {
      fail(`${CANONICAL_FILES.registry}: ${id} is not registered`);
      continue;
    }
    if (!line.includes(`| ${node} |`)) {
      fail(`${CANONICAL_FILES.registry}: ${id} does not carry node ${node}`);
    }
    const expected = delivered ? 'APPROVED_FOR_IMPLEMENTATION' : 'REVIEW_REQUIRED';
    const actual = rowStatus(registry, id);
    if (actual !== expected) {
      fail(`${CANONICAL_FILES.registry}: ${id} is ${String(actual)}, expected ${expected}`);
    }
    if (delivered && !line.includes('APP3-S01')) {
      fail(`${CANONICAL_FILES.registry}: ${id} records no APP3-S01 approval evidence`);
    }
  }

  // The half that makes the approval *scoped*: a blanket Studio approval must
  // fail this gate rather than pass it.
  //
  // World-aware on the section-06 rows only. `APP3-S02` legitimately approves
  // its own three frames, so once it has delivered they are no longer evidence
  // of a blanket approval — while every row belonging to a checkpoint that
  // still has not opened stays exactly as ruled.
  const opened = isS02Delivered(rootDir) ? new Set(S02_DESIGN_ROWS) : new Set();
  for (const id of LATER_STUDIO_ROWS.filter((row) => !opened.has(row))) {
    if (rowStatus(registry, id) !== 'REVIEW_REQUIRED') {
      fail(`${CANONICAL_FILES.registry}: ${id} belongs to a checkpoint that has not opened`);
    }
  }
}

/** One canonical Studio route, and no competing spelling in either world. */
export function checkRoute(rootDir, fail) {
  const delivered = isS01Delivered(rootDir);
  const exists = existsSync(join(rootDir, CANONICAL_FILES.route));
  if (delivered && !exists) {
    fail(`${CANONICAL_FILES.route}: the canonical Studio route ${STUDIO_ROUTE} does not exist`);
  }
  if (!delivered && exists) {
    fail(`${CANONICAL_FILES.route}: a Studio route exists before APP3-S01 delivered it`);
  }

  for (const rejected of REJECTED_STUDIO_ROUTES) {
    if (existsSync(join(rootDir, STOREFRONT, rejected))) {
      fail(`${STOREFRONT}/${rejected}: a competing Studio route exists`);
    }
  }

  const navigation = code(rootDir, 'navigation');
  if (delivered && !navigation.includes('STOREFRONT_STUDIO_ROUTE_SEGMENT')) {
    fail(`${CANONICAL_FILES.navigation}: the Studio segment is not owned by the shell`);
  }
  // The Studio is reached per Product. A top-level nav `href` would have to
  // invent a landing page that does not exist.
  if (!/id: 'studio', label: '[^']*', route: null/.test(navigation)) {
    fail(`${CANONICAL_FILES.navigation}: the studio nav item no longer stays non-interactive`);
  }
  if (!delivered) return;

  const route = code(rootDir, 'route');
  if (route.includes("'use client'")) {
    fail(`${CANONICAL_FILES.route}: the route segment is a client component`);
  }
  if ((read(rootDir, 'route') ?? '').split('\n').length > 80) {
    fail(`${CANONICAL_FILES.route}: the route segment is not thin`);
  }
  // Anchored on the **call**, not the mention: an import left behind after the
  // call was replaced would satisfy a bare `includes` while the route composed
  // its own path (`APP3-B05A`).
  if (!route.includes('buildStorefrontStudioPath(')) {
    fail(`${CANONICAL_FILES.route}: the route does not use the shell route authority`);
  }
  if (route.includes("'thiet-ke'")) {
    fail(`${CANONICAL_FILES.route}: the segment literal is written twice`);
  }
}

/** A server route shell over a lazy client island, and no second shell. */
export function checkBoundary(rootDir, fail) {
  if (!isS01Delivered(rootDir)) return;
  if (!code(rootDir, 'island').includes("'use client'")) {
    fail(`${CANONICAL_FILES.island}: the bootstrap island is not a client boundary`);
  }
  if (!code(rootDir, 'provider').includes('useState(createStudioQueryClient)')) {
    fail(`${CANONICAL_FILES.provider}: the query client is not created per mount`);
  }

  const all = featureCode(rootDir);
  if (all.includes('<main')) {
    fail(`${FEATURE}: a second application shell renders its own <main>`);
  }
  // The manifest is client-owned. A server prefetch of the same resource would
  // be a second, staler answer to a question the island must ask on mount.
  if (all.includes('getServerApiClient')) {
    fail(`${FEATURE}: the Studio island reads through the server API client`);
  }
}

/** The artifacts a frontend checkpoint must leave exactly where it found them. */
export function checkImmutability(rootDir, fail) {
  const raw = read(rootDir, 'openapi');
  if (raw === undefined) {
    fail(`${CANONICAL_FILES.openapi}: missing`);
    return;
  }
  const document = JSON.parse(raw);
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
  for (const key of ['openapi', 'generatedClient']) {
    if ((read(rootDir, key) ?? '').includes('APP3-S01')) {
      fail(`${CANONICAL_FILES[key]}: carries an APP3-S01 edit`);
    }
  }

  const migrations = join(rootDir, MIGRATIONS);
  const count = existsSync(migrations)
    ? readdirSync(migrations).filter((name) => name.endsWith('.sql')).length
    : 0;
  if (count !== EXPECTED_MIGRATIONS) {
    fail(`${MIGRATIONS}: ${count} migrations, expected ${EXPECTED_MIGRATIONS}`);
  }

  const scripts = Object.keys(
    JSON.parse(read(rootDir, 'rootPackage') ?? '{}').scripts ?? {},
  ).length;
  if (scripts !== ROOT_SCRIPTS) {
    fail(`${CANONICAL_FILES.rootPackage}: ${scripts} root scripts, expected ${ROOT_SCRIPTS}`);
  }
}

/** The scoped commands, each bound to the command it names. */
export function checkCommandIndex(rootDir, fail) {
  const rows = (read(rootDir, 'index') ?? '').split('\n');
  for (const [command, invocation] of [
    ['CMD-CHECK-APP3-S01', 'node tools/check-app3-s01.mjs'],
    ['CMD-TEST-APP3-S01', 'node --test tools/check-app3-s01.test.mjs'],
    ['CMD-TEST-APP3-S01-STOREFRONT', '--testPathPatterns=studio'],
  ]) {
    if (!rows.some((row) => row.includes(`\`${command}\` |`) && row.includes(invocation))) {
      fail(`${CANONICAL_FILES.index}: ${command} is not registered against its command`);
    }
  }
}

/** Split by responsibility, so a limit is never met by slicing a file in half. */
export function checkFileSizes(rootDir, fail) {
  for (const path of collect(join(rootDir, FEATURE), /\.tsx?$/)) {
    const lines = readFileSync(path, 'utf8').split('\n').length;
    if (lines > 400) fail(`${relative(rootDir, path)}: ${lines} lines, over the 400-line maximum`);
  }
  for (const path of collect(join(rootDir, STOREFRONT, 'test'), /studio.*\.tsx?$/)) {
    const lines = readFileSync(path, 'utf8').split('\n').length;
    if (lines > 600) {
      fail(`${relative(rootDir, path)}: ${lines} lines, over the 600-line test maximum`);
    }
  }
}

export function checkApp3S01(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);
  const governance = [
    checkPredecessors,
    checkDesignApproval,
    checkRoute,
    checkBoundary,
    checkImmutability,
    checkCommandIndex,
    checkFileSizes,
  ];
  // The runtime rules read the feature's own source, so they only apply in the
  // world where that source exists.
  const runtime = isS01Delivered(rootDir)
    ? [checkApiBoundary, checkTemplateReads, checkSelection, checkPreview, checkSession]
    : [];
  for (const step of [...governance, ...runtime]) step(rootDir, fail);
  return failures;
}

function main() {
  const failures = checkApp3S01();
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-s01 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-s01 — one Storefront Studio route at /san-pham/[slug]/thiet-ke and no competing spelling, on exactly the five approved section-05 design rows with every later Studio row still unapproved: a server shell over a lazy client island, the public placement manifest as the sole Side/Area authority with studioEligible blocking Template and Session work, deterministic IMP-D041 PO-04 selection that starts on the canonical first active Side without narrowing the list by usability first and keeps an Area-less Side selected while closing everything downstream of it, a cascade that is one reducer transition, exact-triple compatibility carried in the query key so a late response for a previous placement cannot land, opaque keyset continuation with no fabricated offset/page/total, one detail read for the one selected Template, a B05A-contextual preview whose blob is revoked on every change and never persisted, the generated BLANK and CLONE_TEMPLATE branches with no clone-to-blank fallback and no duplicate submit, resume by the in-memory create response with no secret argument and no browser persistence of any kind, no renderer concern in the bootstrap screen and exactly one native-SVG renderer in the feature once APP3-S02 has delivered one (none before it, and never a canvas), no Zustand store holding a Session identity, and an OpenAPI artifact, generated client, migration count and root-script count all unchanged.',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
