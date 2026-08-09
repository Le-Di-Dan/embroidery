#!/usr/bin/env node
/**
 * `APP3-B02` — public Product Side background delivery.
 *
 * The checkpoint's risk is not that the route breaks; a broken route 404s and is
 * noticed. It is that a later edit makes something *easier* in a way that
 * quietly turns a publication-gated read into a capability: trusting the
 * manifest's `studioEligible` instead of re-proving the facts, buffering the
 * object "just to hash it", holding a transaction across the stream, sending the
 * provider's length when it contradicts the row, or adding an Asset-id route
 * "for debugging". Every one of those compiles and passes a happy-path test.
 *
 * This half asserts the **delivery mechanics**; `check-app3-b02-contract.mjs`
 * asserts what the checkpoint publishes. Both run from here, together with the
 * accepted predecessors.
 *
 * Read-only, cross-platform pure Node.
 * Usage: node tools/check-app3-b02.mjs [rootDir]
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { acceptedAdminSideBackgroundPaths } from './app3-accepted-surface.mjs';
import { checkApp3B01 } from './check-app3-b01.mjs';
import { checkApp3B01N } from './check-app3-b01n.mjs';
import { checkApp3G04 } from './check-app3-g04.mjs';
import { checkApp3W01B } from './check-app3-w01b.mjs';
import {
  CANONICAL_FILES,
  REPO_ROOT,
  checkApp3B02Contract,
  code,
  read,
} from './check-app3-b02-contract.mjs';

export { CANONICAL_FILES, REPO_ROOT };

/**
 * Every contextual fact the delivery query must prove, as it appears in the
 * repository source.
 *
 * Stated as the *predicate* rather than as prose: a checkpoint that dropped one
 * of these would still compile, still pass a happy-path test, and would serve a
 * withdrawn background to anyone holding an address.
 */
const CONTEXTUAL_PREDICATES = Object.freeze([
  [/eq\(products\.slug, lookup\.slug\)/, 'the Product slug'],
  [/eq\(products\.status, PRODUCT_PUBLISHED_STATE\)/, 'Product publication'],
  [/isNull\(products\.archivedAt\)/, 'the Product archive check'],
  [/eq\(categories\.status, APP2_CATEGORY_STATUS\)/, 'Category publication'],
  [/isNull\(categories\.archivedAt\)/, 'the Category archive check'],
  [
    /eq\(productSides\.productId, products\.id\)|productSides\.productId, products\.id/,
    'Side membership',
  ],
  [/eq\(productSides\.code, lookup\.sideCode\)/, 'the Side code'],
  [/isNull\(productSides\.retiredAt\)/, 'the Side retirement check'],
  [/eq\(assets\.id, productSides\.backgroundAssetId\)/, 'the background association'],
  [/eq\(assets\.kind, SIDE_BACKGROUND_ASSET_KIND\)/, 'the Asset lane'],
  [/eq\(assets\.status, SIDE_BACKGROUND_ASSET_STATUS\)/, 'the Asset status'],
  [/isNull\(assets\.deletedAt\)/, 'the Asset tombstone check'],
  [/eq\(assetDerivatives\.kind, EDITOR_SAFE_DERIVATIVE_KIND\)/, 'the NORMALIZED kind'],
  [/eq\(assetDerivatives\.status, EDITOR_SAFE_DERIVATIVE_STATE\)/, 'the READY state'],
  [/eq\(assetDerivatives\.isWatermarked, false\)/, 'the unwatermarked rule'],
  [/isNotNull\(assetDerivatives\.storageKey\)/, 'the storage key'],
  [/isNotNull\(assetDerivatives\.mediaType\)/, 'the media type'],
  [/isNotNull\(assetDerivatives\.widthPx\)/, 'the width'],
  [/isNotNull\(assetDerivatives\.heightPx\)/, 'the height'],
  [/isNotNull\(assetDerivatives\.byteSize\)/, 'the byte size'],
]);

/**
 * 1 — the whole contextual decision is one query, re-proved per request.
 *
 * One statement so PostgreSQL evaluates it against a single snapshot: splitting
 * it would open windows in which an unpublish could commit between the checks,
 * and the earlier checks would have proved nothing about the row finally served.
 */
function checkContextualQuery(rootDir, fail) {
  const repository = code(read(rootDir, 'repository') ?? '');

  for (const [pattern, complaint] of CONTEXTUAL_PREDICATES) {
    if (!pattern.test(repository)) fail(`the delivery query does not prove ${complaint}`);
  }
  const statements = [...repository.matchAll(/this\.db\s*\n?\s*\.select\(/g)].length;
  if (statements !== 1) {
    fail(`the delivery repository issues ${statements} selects; the decision must be one query`);
  }
  if (/runInTransaction|transaction\(/.test(repository)) {
    fail('the delivery read opens a transaction; a stream must not hold one');
  }
  // The read path may not repair what it reads.
  if (/\.update\(|\.insert\(|\.delete\(/.test(repository)) {
    fail('the delivery repository writes; a public read repairs nothing');
  }
  // The quartet is narrowed rather than asserted, and refused when impossible.
  for (const [pattern, complaint] of [
    [/widthPx <= 0 \|\| heightPx <= 0/, 'the positive-dimension guard'],
    [/isDeliverableSideBackgroundMediaType\(mediaType\)/, 'the approved media-type guard'],
    [/Number\.MAX_SAFE_INTEGER/, 'the byte-size range guard'],
  ]) {
    if (!pattern.test(repository)) fail(`the descriptor narrowing is missing ${complaint}`);
  }
}

/** 2 — SIDE_BACKGROUND raster only; Template SVG never reaches this route. */
function checkMediaPolicy(rootDir, fail) {
  const policy = code(read(rootDir, 'policy') ?? '');

  // One authority, shared with the manifest. The delivery route and the
  // placement manifest must agree about what is deliverable: a manifest that
  // advertised a background the route then refused would be a Studio that opens
  // on nothing, and two copies of the list is how that happens.
  if (!/PUBLIC_SIDE_BACKGROUND_MEDIA_TYPES = EDITOR_SAFE_DELIVERABLE_MEDIA_TYPES/.test(policy)) {
    fail('the approved media types are not the shared placement constant');
  }
  const placementPolicy = code(read(rootDir, 'placementPolicy') ?? '');
  const declared =
    /EDITOR_SAFE_DELIVERABLE_MEDIA_TYPES = \[([^\]]*)\]/.exec(placementPolicy)?.[1] ?? '';
  if (declared.replaceAll(/[\s,]/g, '') !== "'image/webp'") {
    fail('the approved media types are not exactly the W01A raster output');
  }
  // The declared list is scanned **first and on its own**: stripping it before
  // a file-wide scan is what let a widened list hide, because the strip removed
  // exactly the text that had gone wrong. Its own regression case caught that.
  if (/svg/i.test(declared)) fail('SVG appears in the delivery policy');
  if (/svg/i.test(policy)) fail('SVG appears in the delivery policy');
  // The constants are re-exported from the placement policy, never re-declared:
  // a second copy of PUBLISHED or NORMALIZED is how delivery drifts from the
  // placement path that authorised it.
  for (const constant of [
    'PRODUCT_PUBLISHED_STATE',
    'EDITOR_SAFE_DERIVATIVE_KIND',
    'SIDE_BACKGROUND_ASSET_KIND',
  ]) {
    if (!new RegExp(`${constant}[,\\s]`).test(policy)) {
      fail(`the delivery policy does not reuse ${constant}`);
    }
    if (new RegExp(`${constant} = '`).test(policy)) {
      fail(`the delivery policy re-declares ${constant} as a fresh literal`);
    }
  }
}

/**
 * 3 — the stream is a stream, and it ends when the client does.
 *
 * Buffering would put a whole background in the heap per concurrent request and
 * destroy backpressure; a leaked body would leave the provider draining into a
 * socket nobody is reading.
 */
function checkStreamLifecycle(rootDir, fail) {
  const service = code(read(rootDir, 'service') ?? '');
  const controller = code(read(rootDir, 'controller') ?? '');

  for (const forbidden of ['Buffer.concat', 'toBuffer(', 'readFileSync', 'await result.body']) {
    if (service.includes(forbidden) || controller.includes(forbidden)) {
      fail(`"${forbidden}" buffers the object instead of streaming it`);
    }
  }
  if (!/StreamableFile/.test(controller)) fail('the controller does not stream the response');
  if (!/watchClientDisconnect/.test(controller)) {
    fail('the controller does not watch for a client disconnect');
  }
  if (!/addEventListener\('abort', \(\) => stream\.body\.destroy\(\)/.test(controller)) {
    fail('a disconnect does not destroy the upstream body');
  }
  if (!/response\.writableEnded/.test(controller)) {
    fail('the disconnect watcher would abort completed responses too');
  }
  // Ordering: the descriptor must resolve before **any** provider call.
  //
  // Measured on the text *preceding* the lookup rather than by comparing two
  // indexes: `getObjectStream` also appears in the private opener further down
  // the file, so an index comparison stays satisfied even when a provider call
  // is inserted above the lookup. Its own regression case caught that.
  const lookup = service.indexOf('findDeliverable');
  if (lookup < 0) {
    fail('the service does not resolve a descriptor at all');
  } else {
    const before = service.slice(0, lookup);
    for (const call of ['getObjectStream', 'openObject(', 'this.storage']) {
      if (before.includes(call)) fail('the object is opened before eligibility is proved');
    }
  }
  if (!/publicSideBackgroundNotFound\(\)/.test(service)) {
    fail('an ineligible request does not collapse to the safe not-found');
  }
}

/**
 * 4 — the row and the object must agree before a byte is sent.
 *
 * `APP2-T01` could only trust the provider, because `asset_derivatives` carried
 * no size column. `APP3-DB01` added the quartet, so two independent statements
 * about the same object now exist — and where they disagree the honest answer is
 * to send neither.
 */
function checkReconciliation(rootDir, fail) {
  const service = code(read(rootDir, 'service') ?? '');
  const controller = code(read(rootDir, 'controller') ?? '');

  if (!/providerSize !== descriptor\.byteSize/.test(service)) {
    fail('the provider count is not reconciled against the persisted byte size');
  }
  if (!/result\.body\.destroy\(\)/.test(service)) {
    fail('a contradicted object is not torn down before the refusal');
  }
  if (!/PUBLIC_SIDE_BACKGROUND_UNAVAILABLE/.test(service)) {
    fail('a contradiction does not fail safely');
  }
  if (!/contentType: descriptor\.mediaType/.test(service)) {
    fail('the Content-Type is not the persisted derivative media type');
  }
  if (/sizeBytes(?!.*!==)/.test(service.replace(/const providerSize = result\.sizeBytes;/, ''))) {
    fail('the provider size is used for something other than the reconciliation');
  }
  if (!/length: stream\.contentLengthBytes/.test(controller)) {
    fail('the reconciled length is not sent as Content-Length');
  }
}

/** 5 — the ruled headers, and nothing a cache could outlive a revocation with. */
function checkHeaders(rootDir, fail) {
  const policy = code(read(rootDir, 'policy') ?? '');
  const controller = code(read(rootDir, 'controller') ?? '');

  for (const [pattern, complaint] of [
    [/PUBLIC_SIDE_BACKGROUND_CACHE_CONTROL = 'no-store'/, 'no-store'],
    [/PUBLIC_SIDE_BACKGROUND_CONTENT_TYPE_OPTIONS = 'nosniff'/, 'nosniff'],
    [/PUBLIC_SIDE_BACKGROUND_CONTENT_DISPOSITION = 'inline'/, 'inline disposition'],
  ]) {
    if (!pattern.test(policy)) fail(`the delivery policy does not fix ${complaint}`);
  }
  for (const header of ['Cache-Control', 'X-Content-Type-Options']) {
    if (!new RegExp(`setHeader\\('${header}'`).test(controller)) {
      fail(`the controller does not send ${header}`);
    }
  }
  if (
    /filename/.test(
      controller.replace(/disposition: PUBLIC_SIDE_BACKGROUND_CONTENT_DISPOSITION/, ''),
    )
  ) {
    fail('the controller sends a filename it cannot know');
  }
  for (const forbidden of ['ETag', 'etag', 'Last-Modified', 'providerEntityTag', 'lastModified']) {
    if (controller.includes(forbidden)) fail(`the controller exposes "${forbidden}"`);
  }
  if (
    /max-age|public|immutable/.test(
      policy.replace(/public catalog|publicly|public caller|public read/gi, ''),
    )
  ) {
    fail('the delivery policy admits a cacheable response');
  }
}

/** 6 — no generic asset surface, no upload, no presign, no second route. */
function checkNoGenericSurface(rootDir, fail) {
  const controllers = join(rootDir, 'apps/api/src/modules/catalog/presentation');
  let names = [];
  try {
    names = readdirSync(controllers).filter((name) => name.endsWith('.controller.ts'));
  } catch {
    return;
  }
  // Mode-aware on `APP3-B02A`, which adds the Admin counterpart of this
  // controller. The rule's real subject is "no *unauthorized* second delivery
  // route", so it names the controllers each delivered checkpoint owns instead
  // of counting them — a count would have been satisfied by any second file.
  const expectedSideControllers = [
    'public-product-side-background.controller.ts',
    ...(acceptedAdminSideBackgroundPaths(rootDir).length > 0
      ? ['admin-product-side-background.controller.ts']
      : []),
  ].sort();
  const sideControllers = names.filter((name) => name.includes('side-background')).sort();
  if (JSON.stringify(sideControllers) !== JSON.stringify(expectedSideControllers)) {
    fail(
      `expected side-background controllers ${JSON.stringify(expectedSideControllers)}; found ${JSON.stringify(sideControllers)}`,
    );
  }

  const controller = code(read(rootDir, 'controller') ?? '');
  for (const forbidden of ['presign', 'signedUrl', 'getSignedUrl', 'download', 'attachment']) {
    if (controller.toLowerCase().includes(forbidden.toLowerCase())) {
      fail(`the controller offers "${forbidden}"`);
    }
  }
  const module = code(read(rootDir, 'module') ?? '');
  if (
    /putObjectStream|deleteObject|createBucket/.test(
      module + controller + code(read(rootDir, 'service') ?? ''),
    )
  ) {
    fail('the delivery path can write to object storage');
  }
}

/** 7 — the corpus exists and proves revocation rather than only the happy path. */
function checkTests(rootDir, fail) {
  const integration = read(rootDir, 'integration') ?? '';
  const service = read(rootDir, 'serviceSpec') ?? '';

  for (const [needle, complaint] of [
    ['streams the exact NORMALIZED object', 'exact bytes'],
    ['stops serving the moment the product is unpublished', 'unpublish revocation'],
    ['stops serving once the product is archived', 'archive revocation'],
    ['stops serving once the category is withdrawn', 'category revocation'],
    ['stops serving once the side is retired', 'side retirement'],
    ['serves the replacement, never the replaced object', 'background replacement'],
    ['refuses a side code belonging to another product', 'foreign side codes'],
    ['answers an unknown address exactly as it answers a draft', 'safe not-found collapse'],
    ['including Template SVG', 'the Template SVG refusal'],
    ['provider size contradicts the row', 'the size contradiction'],
    ['never returns the private original', 'original protection'],
    ['appends no audit, outbox or domain row', 'the read path writing nothing'],
    ['path that resolves to the same bytes', 'the manifest path resolving'],
    ['distinguishes the placement canvas', 'canvas versus intrinsic dimensions'],
  ]) {
    if (!integration.includes(needle)) fail(`the live-stack suite does not cover ${complaint}`);
  }
  for (const [needle, complaint] of [
    ['never reaches the provider when nothing is deliverable', 'the probe ordering'],
    ['misleading length', 'the reconciliation refusal'],
    ['destroys the opened stream', 'the torn-down contradicted stream'],
  ]) {
    if (!service.includes(needle)) fail(`the service suite does not cover ${complaint}`);
  }
}

export function checkApp3B02(rootDir = REPO_ROOT) {
  const failures = [];
  const fail = (message) => failures.push(message);

  checkContextualQuery(rootDir, fail);
  checkMediaPolicy(rootDir, fail);
  checkStreamLifecycle(rootDir, fail);
  checkReconciliation(rootDir, fail);
  checkHeaders(rootDir, fail);
  checkNoGenericSurface(rootDir, fail);
  checkTests(rootDir, fail);

  for (const violation of checkApp3B02Contract(rootDir)) fail(violation);

  // Chaining the accepted predecessors: one B02 call asserts the whole authority
  // this route delivers against.
  for (const violation of checkApp3B01(rootDir)) fail(`APP3-B01 regression: ${violation}`);
  for (const violation of checkApp3B01N(rootDir)) fail(`APP3-B01N regression: ${violation}`);
  for (const violation of checkApp3W01B(rootDir)) fail(`APP3-W01B regression: ${violation}`);
  // G04 is the mode-aware editor-media authority, so it reports a mode
  // alongside its failures rather than a bare list.
  for (const violation of checkApp3G04(rootDir).failures) {
    fail(`APP3-G04 regression: ${violation}`);
  }

  return failures;
}

async function main() {
  const failures = checkApp3B02(process.argv[2] ?? REPO_ROOT);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  if (failures.length > 0) {
    console.error(`\ncheck:app3-b02 — ${failures.length} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(
    'check:app3-b02 — the public Side-background route re-proves twenty contextual facts in one ' +
      'transactionless query per request, from Product publication and Category visibility down ' +
      'to the unwatermarked READY NORMALIZED quartet, and narrows rather than trusts them; only ' +
      'the W01A raster output is deliverable and Template SVG never is; the object is streamed, ' +
      'never buffered, opened only after eligibility, and destroyed when the client disconnects; ' +
      'the provider count must equal the persisted byte_size before any body or Content-Length ' +
      'is sent, and a contradiction tears the stream down and fails safely; no-store, nosniff and ' +
      'a filename-free inline disposition are fixed, with no ETag, cache lifetime or storage ' +
      'identity exposed; there is no upload, presign, download or second route; and every ' +
      'revocation — unpublish, archive, category withdrawal, side retirement, background ' +
      'replacement — is proved to stop the next request',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
