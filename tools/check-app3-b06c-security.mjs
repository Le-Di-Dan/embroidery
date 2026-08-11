/**
 * `APP3-B06C` — the authorization half.
 *
 * Split from the entry point by responsibility: that module says what the
 * checkpoint *published*, this one says what may reach the bytes. The cycle is
 * deliberate and safe — this module imports `CANONICAL_FILES`, `code` and `read`
 * from there and touches none of them until a check is *called*, by which time
 * both modules have finished initialising.
 */
import { isS06Delivered } from './app3-accepted-surface.mjs';
import { CANONICAL_FILES, code, read } from './check-app3-b06c.mjs';

/**
 * The Session half: a credential is required, it is the accepted one, and the
 * identity used downstream is the one it proved.
 */
export function checkAuthorization(rootDir, fail) {
  const controller = code(rootDir, 'controller');
  const guard = code(rootDir, 'guard');

  if (!/@UseGuards\(DesignSessionReadGuard\)/.test(controller)) {
    // An unguarded route is a public one, and "public" here is the absence of a
    // decorator — so the absence has to be asserted, not assumed.
    fail(`${CANONICAL_FILES.controller}: the delivery route carries no read guard`);
  }
  if (/@UseGuards\(DesignSessionGuard\)/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: the delivery route carries the mutation guard`);
  }

  // The identity used downstream is the authorized one. Reading `params.sessionId`
  // would reintroduce exactly the gap the guard just closed: a caller could hold
  // Session A's cookie and address Session B.
  if (!/sessionId: context\.designSessionId/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: the session id does not come from the authorized context`);
  }
  if (/sessionId: params\.sessionId/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: the raw path session id is used as an identity`);
  }

  // Every primitive is reused, none re-implemented. A second copy of the cookie
  // parsing, the HMAC or the liveness rule is a second place for them to drift.
  for (const symbol of [
    'AuthorizeDesignSessionService',
    'DesignSessionRateLimiter',
    'EphemeralNetworkKeyService',
    'DesignSessionOriginPolicy',
  ]) {
    if (!guard.includes(symbol)) {
      fail(`${CANONICAL_FILES.guard}: does not compose ${symbol}`);
    }
  }
  for (const forbidden of ['createHmac', 'timingSafeEqual', 'pepper', 'serializeSessionCookie']) {
    if (guard.includes(forbidden)) {
      fail(`${CANONICAL_FILES.guard}: re-implements or issues a credential ("${forbidden}")`);
    }
  }
  // The one `Set-Cookie` this guard may write is the accepted `APP3-B06A`
  // *clearing* of a credential that will never work again — banning the header
  // outright would refuse a rule the phase already accepted. What must stay
  // impossible is minting one: the value has to come from the authorization
  // outcome, never from the cookie policy's issuer.
  const cookieWrites = guard.match(/setHeader\('Set-Cookie', ([^)]*)\)/g) ?? [];
  if (cookieWrites.some((write) => !write.includes('outcome.clearCookie'))) {
    fail(`${CANONICAL_FILES.guard}: writes a Set-Cookie that is not the accepted clearing value`);
  }
  if (!/attachDesignSessionContext\(request, outcome\.context\)/.test(guard)) {
    fail(`${CANONICAL_FILES.guard}: does not attach the authorized context`);
  }
  if (!/checkAuthorizationFailure\(/.test(guard)) {
    fail(`${CANONICAL_FILES.guard}: does not record the authorization-failure budget`);
  }
}

/**
 * The contextual half: the association, the lane, the inspection verdict and the
 * derivative, all as one statement.
 */
export function checkEligibility(rootDir, fail) {
  const adapter = code(rootDir, 'adapter');
  const policy = code(rootDir, 'policy');

  /*
   * The grant, world-aware (`APP3-S06`).
   *
   * B06C shipped with one grant — the `design_session_assets` association — and
   * this rule pinned it as the statement's first relation, so a foreign asset was
   * unreachable rather than fetched and filtered. `APP3-S06` added a second
   * legitimate grant, because a `CLONE_TEMPLATE` Session's own artwork has no
   * association and could not render at all.
   *
   * What replaces the pin is **not weaker**. The statement must now start from
   * the *authorized Session row*, which is the thing every grant branch is
   * correlated to, and both branches must still be present and still be
   * correlated on both halves of their pair. The property the original rule was
   * protecting — that a caller cannot address media it has no claim on — is
   * asserted term by term rather than by one `from()`.
   */
  const grantSplit = isS06Delivered(rootDir);
  const grant = grantSplit ? code(rootDir, 'grant') : adapter;

  if (!grantSplit) {
    if (!/\.from\(designSessionAssets\)/.test(adapter)) {
      fail(`${CANONICAL_FILES.adapter}: the statement does not start from the association`);
    }
  } else {
    if (!/\.from\(designSessions\)/.test(adapter)) {
      fail(`${CANONICAL_FILES.adapter}: the statement does not start from the authorized Session`);
    }
    if (!adapter.includes('eq(designSessions.id, lookup.sessionId)')) {
      fail(`${CANONICAL_FILES.adapter}: the statement is not bound to the authorized Session id`);
    }
    if (!adapter.includes('eq(assets.id, lookup.assetId)')) {
      fail(`${CANONICAL_FILES.adapter}: the statement is not bound to the addressed Asset`);
    }
    if (!adapter.includes('sessionMediaGrant()')) {
      fail(`${CANONICAL_FILES.adapter}: the descriptor requires no Session media grant`);
    }
    // The upload branch keeps the lane check *with it* rather than in the shared
    // `WHERE` — a lane asserted globally would make the document branch
    // unreachable and the whole repair a silent no-op that every test still
    // passes.
    for (const required of [
      'eq(assets.kind, SESSION_INTAKE_ASSET_KIND)',
      'eq(assets.classification, SESSION_INTAKE_CLASSIFICATION)',
      // Correlated on both halves of the pair, so an association belonging to
      // another Session can never satisfy it.
      'designSessionAssets.sessionId',
      'designSessionAssets.assetId',
      'designSessions.id',
      'assets.id',
    ]) {
      if (!grant.includes(required)) {
        fail(`${CANONICAL_FILES.grant}: the upload grant does not require ${required}`);
      }
    }
    // The document branch matches the exact (asset, derivative) pair, admits
    // Template artwork only, and guards the JSONB access — an unguarded
    // `jsonb_array_elements` on a non-array *errors* rather than granting
    // nothing, which would turn a malformed document into a 500.
    for (const required of [
      'TEMPLATE_ARTWORK_ASSET_KIND',
      "element ->> 'assetId'",
      "element ->> 'derivativeId'",
      'jsonb_typeof',
    ]) {
      if (!grant.includes(required)) {
        fail(`${CANONICAL_FILES.grant}: the document grant does not require ${required}`);
      }
    }
    // Lineage is provenance, never permission: no branch may consult a Template.
    for (const lineage of ['designTemplates', 'templateId', 'publishedAt', 'templateVersion']) {
      if (grant.includes(lineage)) {
        fail(`${CANONICAL_FILES.grant}: a grant branch consults Template lineage (${lineage})`);
      }
    }
  }

  for (const predicate of [
    'eq(designSessions.status, LIVE_SESSION_STATE)',
    'gt(designSessions.expiresAt, lookup.at)',
    'eq(assets.status, SESSION_ASSET_DELIVERABLE_STATUS)',
    'isNull(assets.deletedAt)',
    'eq(assetDerivatives.kind, EDITOR_SAFE_DERIVATIVE_KIND)',
    'eq(assetDerivatives.status, EDITOR_SAFE_DERIVATIVE_STATE)',
    'eq(assetDerivatives.isWatermarked, false)',
    ...(grantSplit
      ? []
      : [
          'eq(designSessionAssets.sessionId, lookup.sessionId)',
          'eq(designSessionAssets.assetId, lookup.assetId)',
          'eq(assets.kind, SESSION_INTAKE_ASSET_KIND)',
          'eq(assets.classification, SESSION_INTAKE_CLASSIFICATION)',
        ]),
  ]) {
    if (!adapter.includes(predicate)) {
      fail(`${CANONICAL_FILES.adapter}: the descriptor does not require ${predicate}`);
    }
  }
  // The whole APP3-DB01 quartet, read rather than trusted from a CHECK.
  for (const column of ['storageKey', 'mediaType', 'widthPx', 'heightPx', 'byteSize']) {
    if (!adapter.includes(`isNotNull(assetDerivatives.${column})`)) {
      fail(`${CANONICAL_FILES.adapter}: the descriptor does not require ${column}`);
    }
  }
  // The one statement, and no transaction spanning a client's download.
  for (const forbidden of ['.insert(', '.update(', '.delete(', ".for('update')", 'transaction(']) {
    if (adapter.includes(forbidden)) {
      fail(`${CANONICAL_FILES.adapter}: the read path can write or lock ("${forbidden}")`);
    }
  }

  // Raster only, and narrower than the intake allowlist: `APP3-W01A` writes one
  // output type, so anything else is a value the pipeline cannot produce.
  if (!/SESSION_ASSET_MEDIA_TYPES = \['image\/webp'\] as const/.test(policy)) {
    fail(`${CANONICAL_FILES.policy}: the delivery allowlist is not exactly image/webp`);
  }
  for (const forbidden of [
    'image/svg+xml',
    'ORIGINAL',
    'THUMBNAIL',
    'CATALOG_PREVIEW',
    'PREVIEW_WATERMARKED',
    'MOCKUP',
  ]) {
    for (const key of ['policy', 'adapter', 'service', 'controller']) {
      if (code(rootDir, key).includes(forbidden)) {
        fail(`${CANONICAL_FILES[key]}: names "${forbidden}", which is not deliverable here`);
      }
    }
  }

  // The lane constants are re-exported, never restated: a second copy of
  // `CUSTOMER_UPLOAD` is how delivery drifts from the intake that authorized it.
  if (/SESSION_INTAKE_ASSET_KIND = 'CUSTOMER_UPLOAD'/.test(policy)) {
    fail(`${CANONICAL_FILES.policy}: restates the intake lane instead of re-exporting it`);
  }
  if (!/from '\.\/session-asset-intake\.policy'/.test(policy)) {
    fail(`${CANONICAL_FILES.policy}: does not reuse the accepted intake lane authority`);
  }
}

/**
 * A GET is not a mutation: no revision, no CAS, no cookie, and not the mutation
 * budget.
 */
export function checkReadSemantics(rootDir, fail) {
  const guard = code(rootDir, 'guard');
  const controller = code(rootDir, 'controller');
  const mutationGuard = code(rootDir, 'mutationGuard');

  if (/checkMutation\(/.test(guard)) {
    // A Studio scene can reference several images; charging previews against the
    // 30/minute save budget would let ordinary rendering exhaust a customer's
    // ability to keep their own work.
    fail(`${CANONICAL_FILES.guard}: the read guard consumes the mutation limit`);
  }
  // The mutation guard keeps its own rule. A gate that only asserted the read
  // guard would stay green if the *mutation* half quietly lost the limit.
  if (!/checkMutation\(/.test(mutationGuard)) {
    fail(
      `${CANONICAL_FILES.mutationGuard}: the mutation guard no longer applies the mutation limit`,
    );
  }

  for (const forbidden of [
    'expectedRevision',
    'advanceRevision',
    'SESSION_REVISION_HEADER',
    'rotateSecret',
    'saveDocument',
  ]) {
    if (guard.includes(forbidden) || controller.includes(forbidden)) {
      fail(`the delivery path carries mutation semantics ("${forbidden}")`);
    }
  }

  // The safe-read origin rule is its own method, and the mutation rule is
  // untouched. Requiring an `Origin` on a GET would mean no same-origin `<img>`
  // could ever display a customer's own upload.
  const origin = code(rootDir, 'originPolicy');
  if (!/evaluateSafeRead\(request:/.test(origin)) {
    fail(`${CANONICAL_FILES.originPolicy}: publishes no safe-read policy`);
  }
  if (!/this\.origins\.evaluateSafeRead\(request\)/.test(guard)) {
    fail(`${CANONICAL_FILES.guard}: does not apply the safe-read origin policy`);
  }
  if (/this\.origins\.evaluate\(request\)/.test(guard)) {
    fail(`${CANONICAL_FILES.guard}: applies the mutation origin policy to a safe GET`);
  }
  if (!/hasAllowedOrigin\(request\) && this\.hasAllowedFetchSite\(request\)/.test(origin)) {
    fail(`${CANONICAL_FILES.originPolicy}: the mutation origin rule was weakened`);
  }
}

/** Both halves of the split controller keep their accepted operation ids. */
export function checkOperationIdStability(rootDir, fail) {
  const factory = read(rootDir, 'operationId') ?? '';
  for (const klass of [
    'PublicDesignSessionAssetController',
    'PublicDesignSessionAssetPreviewController',
  ]) {
    if (!new RegExp(`${klass}: 'publicDesignSessionAsset'`).test(factory)) {
      fail(`${CANONICAL_FILES.operationId}: ${klass} is not mapped to the accepted domain`);
    }
  }
}
