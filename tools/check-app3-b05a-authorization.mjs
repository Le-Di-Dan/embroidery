/**
 * The six-term authorization of `APP3-B05A`, split out by responsibility.
 *
 * The gate's other rules are about the *shape* of the checkpoint — one operation,
 * anonymous, binary, read-only, inside its boundaries. These three answer a
 * different question: whether the route actually proves what it claims before it
 * hands over bytes. They live apart for that reason, and because the entry point
 * would otherwise cross the repository's 400-line source limit.
 *
 * Every consumer keeps one import: `check-app3-b05a.mjs` re-exports all of this.
 */
import { CANONICAL_FILES, OWNED_SOURCE, code, read } from './check-app3-b05a.mjs';

/**
 * The six-term authorization, as the adapter's predicate and the service's order.
 *
 * Each needle is a term that can be deleted while everything still compiles and
 * every happy path still passes.
 */
export function checkAuthorization(rootDir, fail) {
  const adapter = code(rootDir, 'adapter');
  for (const [needle, complaint] of [
    ['eq(designTemplates.status, PUBLIC_TEMPLATE_STATE)', 'does not require a PUBLISHED template'],
    ['isNull(designTemplates.archivedAt)', 'does not exclude an archived template'],
    ['isNotNull(designTemplateVersions.publishedAt)', 'does not require a published version'],
    ['not(this.hasNewerPublishedVersion())', 'does not restrict delivery to the current version'],
    ['designTemplateAssets.designTemplateId', 'does not join the durable template association'],
    ['eq(assets.kind, TEMPLATE_ARTWORK_ASSET_KIND)', 'does not require the Template artwork lane'],
    [
      'eq(assets.classification, TEMPLATE_ARTWORK_ASSET_CLASSIFICATION)',
      'does not require the Template artwork classification',
    ],
    ['eq(assets.status, TEMPLATE_ARTWORK_ASSET_STATUS)', 'does not require an accepted asset'],
    ['isNull(assets.deletedAt)', 'does not exclude a tombstoned asset'],
    ['eq(assetDerivatives.kind, EDITOR_SAFE_DERIVATIVE_KIND)', 'does not require NORMALIZED'],
    ['eq(assetDerivatives.status, EDITOR_SAFE_DERIVATIVE_STATE)', 'does not require READY'],
    ['eq(assetDerivatives.isWatermarked, false)', 'does not exclude a watermarked derivative'],
  ]) {
    if (!adapter.includes(needle)) fail(`${CANONICAL_FILES.adapter}: ${complaint}`);
  }
  for (const column of ['storageKey', 'mediaType', 'widthPx', 'heightPx', 'byteSize']) {
    if (!adapter.includes(`isNotNull(assetDerivatives.${column})`)) {
      fail(`${CANONICAL_FILES.adapter}: does not require ${column} on the derivative`);
    }
  }
  // The self-join must be aliased. Without it PostgreSQL sees one relation on
  // both sides and the correlated predicate degenerates to `version > version`,
  // which is always false — so every historical published version stays
  // addressable while every test that only checks the current one still passes.
  if (!/alias\(designTemplateVersions,/.test(adapter)) {
    fail(`${CANONICAL_FILES.adapter}: the newer-version self-join is not aliased`);
  }
  if (!/gt\(newerVersions\.version, designTemplateVersions\.version\)/.test(adapter)) {
    fail(`${CANONICAL_FILES.adapter}: the newer-version predicate does not compare two versions`);
  }
  // The header's counter is never the authority (`APP3-B05`'s rule, restated
  // here because this route selects a version of its own).
  if (/designTemplates\.currentVersion/.test(adapter)) {
    fail(`${CANONICAL_FILES.adapter}: selects a version from the header counter`);
  }

  const service = code(rootDir, 'service');
  const order = [
    'findDeliverableCandidate',
    'publishedDocumentPlacesAsset',
    'stillPubliclyDesignable',
    'openObject',
  ].map((needle) => service.indexOf(needle));
  if (order.some((index) => index < 0)) {
    fail(`${CANONICAL_FILES.service}: one of the authorization steps is missing`);
  } else {
    // Anchored on the **call sites**, not the first mention: both names appear in
    // the import list at the top of the file, so comparing first occurrences
    // would report the correct order however the body was rearranged.
    const opened = service.indexOf('this.openObject(');
    for (const [label, needle] of [
      ['the document proof', 'publishedDocumentPlacesAsset(candidate.document'],
      ['the eligibility proof', 'this.stillPubliclyDesignable('],
    ]) {
      const proved = service.indexOf(needle);
      if (proved < 0) {
        fail(`${CANONICAL_FILES.service}: ${label} is not performed`);
      } else if (proved > opened) {
        fail(`${CANONICAL_FILES.service}: object storage is opened before ${label}`);
      }
    }
  }
  // Catalog owns public eligibility; Design asks and never re-derives.
  if (!service.includes('findPublicPlacementScope')) {
    fail(`${CANONICAL_FILES.service}: does not re-ask Catalog for current public eligibility`);
  }
  for (const forbidden of ['products.status', 'categories.status', 'retiredAt']) {
    if (service.includes(forbidden)) {
      fail(`${CANONICAL_FILES.service}: re-derives Catalog's public-eligibility predicate`);
    }
  }
}

/** Document membership is a P01 question, answered through P01. */
export function checkDocumentMembership(rootDir, fail) {
  const membership = code(rootDir, 'membership');
  if (!membership.includes('validateDesignDocumentStructure')) {
    fail(`${CANONICAL_FILES.membership}: does not read the stored document through APP3-P01`);
  }
  if (!/if\s*\(!parsed\.ok\)\s*return false/.test(membership)) {
    fail(`${CANONICAL_FILES.membership}: an uninterpretable document does not fail closed`);
  }
  if (!/element\.type === 'image'/.test(membership)) {
    fail(`${CANONICAL_FILES.membership}: does not require an image element`);
  }
  // `assetIdsIn` is the pre-validation allowlist reader and accepts an `assetId`
  // on an element of any type. Correct for its own job; not an authorization.
  if (membership.includes('assetIdsIn')) {
    fail(`${CANONICAL_FILES.membership}: authorizes from the pre-validation reference reader`);
  }
  for (const forbidden of ['designTemplateAssets', 'mimeType', 'normalization']) {
    if (membership.includes(forbidden)) {
      fail(`${CANONICAL_FILES.membership}: infers membership from "${forbidden}"`);
    }
  }
}

/** Exactly the two editor-safe outputs, and nothing that is not one. */
export function checkDeliverable(rootDir, fail) {
  const policy = read(rootDir, 'policy') ?? '';
  const declared = /PUBLIC_TEMPLATE_ASSET_MEDIA_TYPES = \[([\s\S]*?)\] as const;/.exec(policy);
  if (declared === null) {
    fail(`${CANONICAL_FILES.policy}: the deliverable media types are no longer identifiable`);
  } else {
    const types = (declared[1].match(/'([^']+)'/g) ?? []).map((value) => value.slice(1, -1));
    if (types.join(',') !== 'image/webp,image/svg+xml') {
      fail(`${CANONICAL_FILES.policy}: deliverable media types are ${types.join(', ')}`);
    }
  }
  if (!policy.includes("PUBLIC_TEMPLATE_ASSET_BUCKET = 'DERIVATIVES'")) {
    fail(`${CANONICAL_FILES.policy}: does not read from the derivatives bucket`);
  }

  // No other artifact kind may be nameable from this checkpoint's own source.
  for (const key of OWNED_SOURCE) {
    const source = code(rootDir, key);
    for (const forbidden of [
      'ORIGINAL',
      'THUMBNAIL',
      'CATALOG_PREVIEW',
      'PREVIEW_WATERMARKED',
      'MOCKUP',
    ]) {
      if (new RegExp(`'${forbidden}'`).test(source)) {
        fail(`${CANONICAL_FILES[key]}: names the ${forbidden} artifact kind`);
      }
    }
    // Sanitization happened in `APP3-W01B`. A read path that re-ran it would be a
    // second sanitizer nobody reviewed, and one that could disagree with the
    // bytes already on disk.
    for (const forbidden of ['sanitize', 'DOMPurify', 'jsdom', 'parseSvg']) {
      if (source.includes(forbidden)) {
        fail(`${CANONICAL_FILES[key]}: re-sanitizes on the read path ("${forbidden}")`);
      }
    }
  }
}
