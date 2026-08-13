/**
 * `APP3-S01` — the runtime rules: which operations the Studio may reach, how it
 * addresses a Template, how it selects a placement, how it owns a preview blob,
 * and what it may never do with a Session identity.
 *
 * Split from `check-app3-s01.mjs` by responsibility: that module rules on the
 * route, the design approval and the artifacts that must not move, this one on
 * what the screen actually does. Both import their paths from
 * `check-app3-s01.sources.mjs`, so neither carries a copy.
 *
 * Read-only, cross-platform pure Node.
 */
import { join, relative } from 'node:path';

import {
  isS02Delivered,
  isS06Delivered,
  isS07Delivered,
  isS10Delivered,
} from './app3-accepted-surface.mjs';
import {
  CANONICAL_FILES,
  CONSUMED_OPERATIONS,
  FEATURE,
  code,
  collect,
  featureCode,
  read,
  s01FeatureCode,
} from './check-app3-s01.sources.mjs';

/** Six operations, the approved Axios client, and nothing that bypasses either. */
export function checkApiBoundary(rootDir, fail) {
  const all = featureCode(rootDir);
  for (const operation of CONSUMED_OPERATIONS) {
    if (!all.includes(operation)) fail(`${FEATURE}: ${operation} is not consumed`);
  }
  /*
   * The three Session-asset operations are world-aware (`APP3-S06`).
   *
   * They were forbidden feature-wide because no screen owned them, and that is
   * exactly what stopped an earlier checkpoint quietly starting the image
   * capability. `APP3-S06` is the screen that owns them, so after it the ban
   * moves rather than disappearing: the S01 partition still may not reach one,
   * asserted below through `s01FeatureCode`.
   *
   * `publicDesignSessionAutosave` went the same way at `APP3-S10`, the screen
   * that owns saving. The condition the ban stated is satisfied rather than
   * relaxed: S01 still may not save, and the rule below proves it against the S01
   * partition instead of against a feature that now contains one legitimate
   * saver.
   */
  const sessionAssetOwned = isS06Delivered(rootDir);
  const savingOwned = isS10Delivered(rootDir);
  for (const forbidden of [
    'adminProductPlacementGet',
    'adminDesignTemplate',
    ...(savingOwned ? [] : ['publicDesignSessionAutosave']),
    ...(sessionAssetOwned ? [] : ['publicDesignSessionAssetCreate']),
  ]) {
    if (all.includes(forbidden)) fail(`${FEATURE}: reaches ${forbidden}, which S01 does not own`);
  }
  // The Side background belongs to the `APP3-S02` stage. The rule is unchanged
  // for S01 — the bootstrap chain renders no stage, so it needs no background
  // bytes — and is asserted against the files S01 owns rather than against a
  // feature that now legitimately contains one consumer.
  if (s01FeatureCode(rootDir).includes('publicProductSideBackgroundGet')) {
    fail(`${FEATURE}: the bootstrap screen reaches publicProductSideBackgroundGet`);
  }
  // The same treatment for the Session-asset operations: the ban moved to the
  // S01 partition rather than disappearing, so the bootstrap chain still may not
  // upload, poll or fetch private bytes even now that the feature contains a
  // screen that may.
  if (/publicDesignSessionAsset(Create|Get|Status)/.test(s01FeatureCode(rootDir))) {
    fail(`${FEATURE}: the bootstrap screen reaches a Session asset operation`);
  }
  // And the same again for saving: the bootstrap chain edits no document, so it
  // still may not persist one now that a screen exists which may.
  if (s01FeatureCode(rootDir).includes('publicDesignSessionAutosave')) {
    fail(`${FEATURE}: the bootstrap screen reaches publicDesignSessionAutosave`);
  }
  if (!all.includes('getBrowserApiClient')) {
    fail(`${FEATURE}: does not use the approved browser Axios client`);
  }
  // `\bfetch(` rather than `fetch(`: TanStack's own `refetch()` ends in the
  // same three characters, and a substring ban would forbid the retry it powers.
  for (const raw of [/\bfetch\(/, /\bXMLHttpRequest\b/, /from 'axios'/, /\/api\//]) {
    if (raw.test(all)) {
      fail(`${FEATURE}: carries raw transport or a hard-coded API path (${String(raw)})`);
    }
  }
  for (const leak of ['storageKey', 'presign', 'amazonaws', 'minio', 's3://']) {
    if (all.includes(leak)) fail(`${FEATURE}: names a storage address (${leak})`);
  }

  const curated = read(rootDir, 'curatedClient') ?? '';
  for (const operation of CONSUMED_OPERATIONS) {
    if (!curated.includes(operation)) {
      fail(`${CANONICAL_FILES.curatedClient}: ${operation} is not exported to consumers`);
    }
  }
  // An operation on the curated boundary is an invitation to call it, so each
  // stays behind it until the screen that owns it exists. Image upload crossed
  // at `APP3-S06` and autosave at `APP3-S10`, each on its own stated condition;
  // the product-image route has never had a consumer and still does not.
  for (const withheld of [
    ...(savingOwned ? [] : ['publicDesignSessionAutosave']),
    ...(sessionAssetOwned ? [] : ['publicDesignSessionAssetCreate']),
    'publicProductMediaGet',
  ]) {
    if (curated.split('\n').some((line) => line.trim().startsWith(withheld))) {
      fail(`${CANONICAL_FILES.curatedClient}: ${withheld} crossed the boundary without a consumer`);
    }
  }
}

/** Exact-triple compatibility, keyset continuation, and one detail read. */
export function checkTemplateReads(rootDir, fail) {
  const service = code(rootDir, 'templateService');
  for (const id of ['productId:', 'productSideId:', 'embroideryAreaId:']) {
    if (!service.includes(id)) fail(`${CANONICAL_FILES.templateService}: the list omits ${id}`);
  }
  for (const invented of ['offset', 'page:', 'total', 'search', 'sortBy']) {
    if (service.includes(invented)) {
      fail(`${CANONICAL_FILES.templateService}: fabricates the "${invented}" parameter`);
    }
  }

  const keys = code(rootDir, 'queryKeys');
  if (!keys.includes('tripleKey')) {
    fail(`${CANONICAL_FILES.queryKeys}: the compatibility triple is not part of the Template keys`);
  }
  // The preview key must carry the version: B05A serves only the version that
  // is public right now, so a key without it would keep serving a retired one.
  if (!/templateAsset:\s*\(templateSlug[^)]*version/.test(keys)) {
    fail(`${CANONICAL_FILES.queryKeys}: the preview key does not carry the published version`);
  }

  const templateModel = code(rootDir, 'templateModel');
  if (!templateModel.includes('page.hasNext')) {
    fail(`${CANONICAL_FILES.templateModel}: continuation does not require hasNext`);
  }
  if (!code(rootDir, 'detailHook').includes('enabled')) {
    fail(`${CANONICAL_FILES.detailHook}: the detail read is not gated on a selection`);
  }
  if (!code(rootDir, 'screen').includes('selection.templateSlug')) {
    fail(`${CANONICAL_FILES.screen}: the detail read is not bound to the single selected Template`);
  }
}

/**
 * Every shape of "the first Studio-usable Side wins" (`APP3-S01-C1`).
 *
 * The refinement human review rejected: skipping the canonical first active
 * Side because it happens to carry no Area. It is a product-authority change,
 * not an implementation detail, and it is invisible in a manifest where every
 * Side is usable — which is every fixture anyone reaches for first. So it is
 * banned by shape, in the whole feature, rather than watched for in one file.
 */
const SIDE_SKIPPING_SELECTION = Object.freeze([
  /\.(find|filter)\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.areas\.length\s*[>!=]/,
  /\.(find|filter)\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.areas\[0\]/,
  /firstStudioUsableSide/,
  /firstSideWithArea/,
  /usableSides/,
]);

/** Deterministic IMP-D041 selection, and a cascade that is one transition. */
export function checkSelection(rootDir, fail) {
  const placement = code(rootDir, 'placementModel');
  if (!placement.includes('left.id < right.id')) {
    fail(`${CANONICAL_FILES.placementModel}: the canonical order has no stable tie-breaker`);
  }
  if (!placement.includes('side.areas.find')) {
    fail(`${CANONICAL_FILES.placementModel}: an Area is not resolved inside its own Side`);
  }
  // PO-04: the initial Side is the first row of the ordered list, taken whole.
  // Asserting the exact expression rather than a property of the result is the
  // point — every skipping variant is written by narrowing the list first, and
  // this is the one shape in which no filter can be inserted unnoticed.
  if (!/return orderedSides\(placement\)\[0\];/.test(placement)) {
    fail(
      `${CANONICAL_FILES.placementModel}: the initial Side is not the canonical first row (IMP-D041 PO-04)`,
    );
  }
  for (const skipping of SIDE_SKIPPING_SELECTION) {
    if (skipping.test(featureCode(rootDir))) {
      fail(
        `${FEATURE}: narrows the Side list by usability before choosing an initial Side (${String(skipping)})`,
      );
    }
  }

  const selection = code(rootDir, 'selection');
  if (!selection.includes('studioSelectionReducer')) {
    fail(`${CANONICAL_FILES.selection}: the selection is not a single reducer`);
  }
  // The cascade must be structural: every transition returns a whole state, so
  // there is no render in which a new Side sits beside the old Template.
  for (const action of ['reconcile', 'select-side', 'select-area', 'select-template']) {
    if (!selection.includes(`'${action}'`)) {
      fail(`${CANONICAL_FILES.selection}: the reducer has no ${action} transition`);
    }
  }
  if (!selection.includes('templateSlug: null')) {
    fail(`${CANONICAL_FILES.selection}: a placement change does not clear the Template`);
  }
  // A Side with no Area must stay representable: `areaId` goes null and the
  // Side is kept. A reducer that could not express the pair would have to move
  // the visitor somewhere, which is the refinement being corrected.
  if (!selection.includes('areaId: area?.id ?? null')) {
    fail(`${CANONICAL_FILES.selection}: a Side with no Area cannot resolve to a null Area`);
  }
  if (!/const next = selectionForSide\(action\.placement, side\.id\)/.test(selection)) {
    fail(`${CANONICAL_FILES.selection}: a still-present Side is not kept across reconcile`);
  }

  const screen = code(rootDir, 'screen');
  if (!screen.includes('useReducer(studioSelectionReducer')) {
    fail(`${CANONICAL_FILES.screen}: the screen does not drive selection through the reducer`);
  }
  if (!screen.includes('placement?.studioEligible === true')) {
    fail(`${CANONICAL_FILES.screen}: Studio eligibility is not read from the manifest`);
  }
  if (!/useTemplateList\(eligible \? triple : undefined\)/.test(screen)) {
    fail(`${CANONICAL_FILES.screen}: an ineligible Product still requests Templates`);
  }
  // An incomplete placement chain removes the Template, preview and bootstrap
  // sections outright. Absent, not disabled: a disabled control is still a
  // control, and the guard that keeps it disabled is one edit from being wrong.
  if (!/codes === undefined \? \(/.test(screen)) {
    fail(`${CANONICAL_FILES.screen}: an Area-less Side does not close the downstream chain`);
  }
  if (!screen.includes('STUDIO_COPY.sideWithoutArea')) {
    fail(`${CANONICAL_FILES.screen}: an Area-less Side is not explained to the customer`);
  }
  // The Product-level refusal must not be reached for a Side-level gap: another
  // Side may be perfectly usable, and the Side selector has to stay operable.
  if (/side === undefined[\s\S]{0,200}sideWithoutArea/.test(screen)) {
    fail(`${CANONICAL_FILES.screen}: a Side-level gap is reported as a Product-level refusal`);
  }
}

/** The preview blob's lifecycle, and the S02 renderer that must not exist. */
export function checkPreview(rootDir, fail) {
  const preview = code(rootDir, 'previewHook');
  if (!preview.includes('URL.createObjectURL') || !preview.includes('URL.revokeObjectURL')) {
    fail(`${CANONICAL_FILES.previewHook}: the object URL is not created and revoked here`);
  }
  if (!/return \(\) => \{\s*URL\.revokeObjectURL/.test(preview)) {
    fail(`${CANONICAL_FILES.previewHook}: revocation is not effect cleanup`);
  }
  if (!preview.includes('gcTime: 0')) {
    fail(`${CANONICAL_FILES.previewHook}: the no-store blob is retained after nothing renders it`);
  }
  // `placeholderData` is exactly how one Template's artwork appears under
  // another Template's name while the new key loads.
  if (preview.includes('placeholderData')) {
    fail(
      `${CANONICAL_FILES.previewHook}: keeps the previous Template's blob while a new key loads`,
    );
  }
  if (!code(rootDir, 'templateModel').includes("element.type === 'image'")) {
    fail(`${CANONICAL_FILES.templateModel}: the preview asset does not come from the document`);
  }

  /*
   * The renderer rule, world-aware (`APP3-S02` §47).
   *
   * Before S02 the Studio must contain no production renderer at all — that
   * absence is what proved no earlier checkpoint quietly started one. After it,
   * the same rule becomes "exactly one": two `<svg>` roots are two renderers
   * whatever the second is called, and the S01 files are still held to the
   * original absence. Nothing is deleted; the assertion is made in the world it
   * is now being made about.
   *
   * `<canvas>` stays banned outright in both worlds — `IMP-D026` locks native
   * SVG — and so do the concerns that still belong to later checkpoints.
   */
  const all = featureCode(rootDir);
  const s01Only = s01FeatureCode(rootDir);
  const canvases = all.split('<svg').length - 1;
  const expected = isS02Delivered(rootDir) ? 1 : 0;
  if (canvases !== expected) {
    fail(`${FEATURE}: opens ${String(canvases)} <svg> roots, expected exactly ${String(expected)}`);
  }
  for (const s01Ban of ['<svg', 'renderer']) {
    if (s01Only.includes(s01Ban)) {
      fail(`${FEATURE}: the bootstrap screen builds a renderer concern (${s01Ban})`);
    }
  }
  for (const never of ['<canvas', 'undoStack']) {
    if (all.includes(never)) fail(`${FEATURE}: builds a concern S01 must never carry (${never})`);
  }
  /*
   * The viewport, world-aware.
   *
   * S01's rule was that no viewport concern existed anywhere in the feature, and
   * that was a true statement about the world until `APP3-S07` legitimately
   * built one. The half that mattered is unchanged: the *bootstrap screen* still
   * must not carry it, in either world. Only the scope narrows, and only once
   * S07 has shipped — before that the original whole-feature absence is still
   * asserted, so a viewport arriving early is still refused.
   */
  const viewportScope = isS07Delivered(rootDir) ? s01Only : all;
  if (viewportScope.includes('viewport')) {
    fail(`${FEATURE}: builds a concern S01 must never carry (viewport)`);
  }
}

/** Bootstrap, resume, and the secret boundary. */
export function checkSession(rootDir, fail) {
  const service = code(rootDir, 'sessionService');
  for (const branch of [
    'CreateBlankDesignSessionBodyMode.BLANK',
    'CloneDesignSessionBodyMode.CLONE_TEMPLATE',
  ]) {
    if (!service.includes(branch)) {
      fail(`${CANONICAL_FILES.sessionService}: does not use the generated ${branch} discriminator`);
    }
  }
  if (service.includes('document:')) {
    fail(`${CANONICAL_FILES.sessionService}: sends a locally manufactured Design Document`);
  }

  const hook = code(rootDir, 'sessionHook');
  if (!hook.includes('if (create.isPending) return;')) {
    fail(`${CANONICAL_FILES.sessionHook}: a duplicate bootstrap is not blocked`);
  }
  // The fallback that must never exist: a refused clone opening a blank
  // session. An error handler may only record which action failed.
  if (/onError[\s\S]{0,400}createBlankSession/.test(hook)) {
    fail(`${CANONICAL_FILES.sessionHook}: a failed clone falls back to a blank session`);
  }
  if (!hook.includes('resumption.mutate(snapshot.sessionId)')) {
    fail(`${CANONICAL_FILES.sessionHook}: resume does not use the id the create response returned`);
  }
  if (!hook.includes('HTTP_UNAUTHORIZED')) {
    fail(`${CANONICAL_FILES.sessionHook}: expiry is not bound to the 401 B07 actually answers`);
  }

  /*
   * `localStorage` is world-aware from `APP3-S10`.
   *
   * S01 forbade it outright because no accepted authority allowed anything to be
   * kept, and that ban is what stopped a Session id being stashed and called
   * resume. `APP3-G03` allows exactly one thing — the **non-secret Session id**,
   * under a namespaced key — and `APP3-S10` is the checkpoint that keeps it. So
   * the ban narrows to everything outside that checkpoint's files, and every
   * other entry on this list stays forbidden feature-wide, `document.cookie`
   * most of all: the secret is `HttpOnly` and this code may not go looking.
   */
  const all = featureCode(rootDir);
  const savedIdOwned = isS10Delivered(rootDir);
  const outsideS10 = s01FeatureCode(rootDir);
  for (const persistence of [
    ...(savedIdOwned ? [] : ['localStorage']),
    'sessionStorage',
    'document.cookie',
    'history.pushState',
    'history.replaceState',
    'useSearchParams',
  ]) {
    if (all.includes(persistence)) fail(`${FEATURE}: a Session identity may reach ${persistence}`);
  }
  // Narrower than the ban it replaces: the bootstrap chain still stores nothing,
  // and a document, revision or expiry may not be stored even by the checkpoint
  // that may store an id.
  if (savedIdOwned && outsideS10.includes('localStorage')) {
    fail(`${FEATURE}: localStorage is written outside the APP3-S10 resume handle`);
  }
  /*
   * Zustand, world-aware.
   *
   * S01's rule was that no store existed at all: its placement selection is a
   * reducer and its server state is TanStack Query's, so a store could only
   * have been a duplicate — or somewhere a Session id could come to rest.
   * `APP3-S02` introduces exactly one, for browser-only interaction state, and
   * the half of the rule that mattered is unchanged and now asserted directly:
   * whatever store exists must not be able to hold a Session identity.
   */
  if (s01FeatureCode(rootDir).includes('zustand')) {
    fail(`${FEATURE}: the bootstrap screen holds a Zustand store`);
  }
  for (const store of collect(join(rootDir, FEATURE, 'store'), /\.ts$/)) {
    const source = code(rootDir, relative(rootDir, store).replaceAll('\\', '/'));
    for (const identity of ['sessionId', 'snapshot', 'secret', 'expiresAt']) {
      if (source.includes(identity)) {
        fail(`${relative(rootDir, store)}: a Session identity may reach the interaction store`);
      }
    }
  }
  for (const secret of ['secret', '__Host-']) {
    if (all.includes(secret)) fail(`${FEATURE}: names a session secret (${secret})`);
  }
}
