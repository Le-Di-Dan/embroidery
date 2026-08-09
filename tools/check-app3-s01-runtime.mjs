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
import {
  CANONICAL_FILES,
  CONSUMED_OPERATIONS,
  FEATURE,
  code,
  featureCode,
  read,
} from './check-app3-s01.sources.mjs';

/** Six operations, the approved Axios client, and nothing that bypasses either. */
export function checkApiBoundary(rootDir, fail) {
  const all = featureCode(rootDir);
  for (const operation of CONSUMED_OPERATIONS) {
    if (!all.includes(operation)) fail(`${FEATURE}: ${operation} is not consumed`);
  }
  for (const forbidden of [
    'adminProductPlacementGet',
    'adminDesignTemplate',
    'publicDesignSessionAutosave',
    'publicDesignSessionAssetCreate',
    'publicProductSideBackgroundGet',
  ]) {
    if (all.includes(forbidden)) fail(`${FEATURE}: reaches ${forbidden}, which S01 does not own`);
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
  // An operation on the curated boundary is an invitation to call it. Autosave
  // is `APP3-S10`'s and customer image upload is `APP3-S06`'s; neither screen
  // exists, so neither operation may cross yet.
  for (const withheld of ['publicDesignSessionAutosave', 'publicDesignSessionAssetCreate']) {
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

  const all = featureCode(rootDir);
  for (const s02 of ['<svg', '<canvas', 'renderer', 'viewport', 'undoStack']) {
    if (all.includes(s02)) fail(`${FEATURE}: builds an APP3-S02 renderer concern (${s02})`);
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

  const all = featureCode(rootDir);
  for (const persistence of [
    'localStorage',
    'sessionStorage',
    'document.cookie',
    'history.pushState',
    'history.replaceState',
    'useSearchParams',
    'zustand',
  ]) {
    if (all.includes(persistence)) fail(`${FEATURE}: a Session identity may reach ${persistence}`);
  }
  for (const secret of ['secret', '__Host-']) {
    if (all.includes(secret)) fail(`${FEATURE}: names a session secret (${secret})`);
  }
}
