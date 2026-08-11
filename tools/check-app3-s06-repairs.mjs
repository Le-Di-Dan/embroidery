/**
 * `APP3-S06` — the two cross-layer repairs, and the read limit.
 *
 * These are the rules worth a machine most, because each repair has a shape that
 * looks right and is silently wrong:
 *
 * - A Session inspection lane that skips the **full decode**. The catalog lane's
 *   pixel-level verification was always a side effect of generating derivatives;
 *   a lane that writes none loses it, and a truncated PNG is then accepted by a
 *   pipeline that only ever read its header. Every test still passes.
 * - A Session lane that writes a `THUMBNAIL` or a `NORMALIZED` "while it is
 *   there". The first is private catalogue media nothing serves; the second is a
 *   second producer of `APP3-W01A`'s output.
 * - A cloned-media grant with the lane check hoisted into the shared `WHERE`,
 *   which makes the document branch unreachable and the whole repair a no-op.
 * - A document branch that admits `CUSTOMER_UPLOAD`, turning a customer's
 *   document into a way to read another customer's photograph.
 * - A read limit charged after authorization, which bounds successful reads and
 *   not the probing it exists to bound.
 *
 * Read-only, cross-platform pure Node.
 */
import { CANONICAL_FILES, code, read } from './check-app3-s06.sources.mjs';

/** Repair A: one pipeline, two lanes, and the decode that is not free. */
export function checkInspectionLane(rootDir, fail) {
  const lane = code(rootDir, 'lane');
  const rows = code(rootDir, 'assetRows');
  const useCase = code(rootDir, 'inspectionUseCase');
  const verification = code(rootDir, 'verification');
  const pipeline = code(rootDir, 'sharpPipeline');

  // Both lanes are declared, and each is matched on the **pair**. A kind-only
  // match would admit a `CUSTOMER_UPLOAD` marked `PUBLIC`.
  for (const required of [
    'CATALOG_INSPECTION_LANE',
    'SESSION_INSPECTION_LANE',
    "assetKind: 'CUSTOMER_UPLOAD'",
    "classification: 'CUSTOMER_PRIVATE'",
    "assetKind: 'CATALOG_MEDIA'",
    "classification: 'PRODUCTION_SENSITIVE'",
  ]) {
    if (!lane.includes(required)) {
      fail(`${CANONICAL_FILES.lane}: does not declare ${required}`);
    }
  }
  if (!/lane\.assetKind === kind && lane\.classification === classification/.test(lane)) {
    fail(`${CANONICAL_FILES.lane}: a lane is not matched on the kind/classification pair`);
  }

  // The catalog lane keeps both outputs; the Session lane produces none.
  if (!/derivatives: DERIVATIVE_OUTPUT_POLICIES/.test(lane)) {
    fail(`${CANONICAL_FILES.lane}: the catalog lane no longer produces its accepted derivatives`);
  }
  if (!/code: 'SESSION',[\s\S]{0,220}derivatives: Object\.freeze\(\[\]\)/.test(lane)) {
    fail(`${CANONICAL_FILES.lane}: the Session lane declares a derivative of its own`);
  }
  // `NORMALIZED` is `APP3-W01A`'s, produced from the event `APP3-B06B` emits.
  // Inspection writing one would be a second producer of one derivative kind.
  if (/NORMALIZED/.test(lane) && !/'NORMALIZED', 'THUMBNAIL'/.test(lane)) {
    fail(`${CANONICAL_FILES.lane}: the inspection lane names the editor-safe derivative kind`);
  }

  // The two literals that used to be the whole ownership rule are gone from the
  // row reader, and the lane decides instead.
  if (/REQUIRED_KIND|REQUIRED_CLASSIFICATION/.test(rows)) {
    fail(`${CANONICAL_FILES.assetRows}: still hard-codes a single lane`);
  }
  if (!/resolveInspectionLane\(row\.kind, row\.classification\)/.test(rows)) {
    fail(`${CANONICAL_FILES.assetRows}: does not resolve the lane from the locked row`);
  }
  // An Asset in no lane is still a stop, not a default.
  if (!/lane === undefined/.test(rows) || !/contradiction\(/.test(rows)) {
    fail(`${CANONICAL_FILES.assetRows}: an Asset outside every lane is not refused`);
  }

  // Generation follows the lane rather than a module constant.
  if (!/for \(const policy of lane\.derivatives\)/.test(useCase)) {
    fail(`${CANONICAL_FILES.inspectionUseCase}: derivatives are not generated per lane`);
  }
  if (/DERIVATIVE_OUTPUT_POLICIES/.test(useCase)) {
    fail(
      `${CANONICAL_FILES.inspectionUseCase}: still generates the catalog outputs unconditionally`,
    );
  }

  /*
   * The decode, and the fact it is **derived** rather than configured.
   *
   * A boolean flag on the lane would be one edit away from a future lane
   * inheriting the weaker check silently. Deriving it from
   * `derivatives.length === 0` means any lane that writes no output gets the
   * explicit decode automatically, and there is no field anyone can forget.
   */
  if (!/requiresFullDecodeVerification/.test(lane)) {
    fail(`${CANONICAL_FILES.lane}: publishes no full-decode rule`);
  }
  if (!/return lane\.derivatives\.length === 0/.test(lane)) {
    fail(`${CANONICAL_FILES.lane}: the full-decode rule is not derived from the lane's outputs`);
  }
  if (!/requiresFullDecodeVerification\(lane\)/.test(verification)) {
    fail(`${CANONICAL_FILES.verification}: does not decode on a lane that writes no derivative`);
  }
  if (!/verifyFullDecode\(/.test(pipeline)) {
    fail(`${CANONICAL_FILES.sharpPipeline}: publishes no full-decode verification`);
  }
  // Under the locked safety options, or it is a different decode from the one
  // that decides what "safe" means.
  if (!/sharp\(sharpOptions\(\)\)[\s\S]{0,200}stats\(\)/.test(pipeline)) {
    fail(`${CANONICAL_FILES.sharpPipeline}: the decode does not use the locked safety options`);
  }
  // The decode runs *after* the policy, so an oversized image keeps its precise
  // code instead of being reported as undecodable.
  const policyAt = verification.indexOf('applyPolicy(');
  const decodeAt = verification.indexOf('verifyDecodable(');
  if (policyAt === -1 || decodeAt === -1 || policyAt > decodeAt) {
    fail(`${CANONICAL_FILES.verification}: the decode runs before the policy`);
  }
  // A decode failure is a property of the file, so it is a verdict and never a
  // retry — and the native error never becomes a message.
  if (!/assetRejection\('DECODE_FAILED'\)/.test(verification)) {
    fail(`${CANONICAL_FILES.verification}: a failed decode is not a deterministic rejection`);
  }

  // No new mechanism: the convergence is `APP3-W01C`'s existing retry.
  for (const forbidden of ['setInterval', 'setTimeout', 'cron', 'sleep(', 'new Queue(']) {
    if (useCase.includes(forbidden) || lane.includes(forbidden)) {
      fail(`the inspection repair introduces a scheduler or a wait ("${forbidden}")`);
    }
  }
}

/** Repair B: exactly one status projection, and what it may say. */
export function checkStatusProjection(rootDir, fail) {
  const controller = code(rootDir, 'statusController');
  const service = code(rootDir, 'statusService');
  const adapter = code(rootDir, 'adapter');
  const response = code(rootDir, 'statusResponse');

  if (!/@UseGuards\(DesignSessionReadGuard\)/.test(controller)) {
    fail(`${CANONICAL_FILES.statusController}: the status route carries no read guard`);
  }
  if (/@UseGuards\(DesignSessionGuard\)/.test(controller)) {
    fail(`${CANONICAL_FILES.statusController}: the status route carries the mutation guard`);
  }
  // The identity used downstream is the authorized one, never the path string.
  if (!/sessionId: context\.designSessionId/.test(controller)) {
    fail(`${CANONICAL_FILES.statusController}: the session id is not the authorized one`);
  }
  if (/sessionId: params\.sessionId/.test(controller)) {
    fail(`${CANONICAL_FILES.statusController}: the raw path session id is used as an identity`);
  }
  if (!/setHeader\('Cache-Control', SESSION_ASSET_CACHE_CONTROL\)/.test(controller)) {
    fail(`${CANONICAL_FILES.statusController}: the status response is cacheable`);
  }

  // The three states, and only the ready one carries media.
  for (const state of ['PROCESSING', 'READY', 'REJECTED']) {
    if (!response.includes(state)) {
      fail(`${CANONICAL_FILES.statusResponse}: does not publish the ${state} state`);
    }
  }
  if (!/state === 'READY'/.test(service)) {
    fail(`${CANONICAL_FILES.statusService}: a non-ready state is not stripped of media fields`);
  }

  /*
   * Nothing about storage, the pipeline, or why a file was refused.
   *
   * Asserted against the **fields published**, never by banning words. The
   * response's own docblock and the operation's published description both say —
   * correctly — that no checksum, storage key or rejection reason is disclosed,
   * and a word ban would fire on exactly that honest prose. That is the proxy
   * failure `APP3-B06B` and `APP3-B06C` both recorded; this reads the property
   * list instead.
   */
  const published = new Set([...response.matchAll(/^\s{2}(\w+)[?!]?:/gm)].map((match) => match[1]));
  const allowed = new Set([
    'assetId',
    'state',
    'derivativeId',
    'widthPx',
    'heightPx',
    'mediaType',
    'byteSize',
  ]);
  for (const field of published) {
    if (!allowed.has(field)) {
      fail(`${CANONICAL_FILES.statusResponse}: publishes the field "${field}"`);
    }
  }
  // And the runtime view carries no more than the schema promises.
  const returned = new Set([...service.matchAll(/^\s{2}readonly (\w+)\??:/gm)].map((m) => m[1]));
  for (const field of returned) {
    if (!allowed.has(field)) {
      fail(`${CANONICAL_FILES.statusService}: the view carries the field "${field}"`);
    }
  }

  // A `READY` short of the whole `APP3-DB01` quartet is `PROCESSING`: a Studio
  // told `READY` builds an `APP3-P01` element from those numbers.
  if (!/state: 'PROCESSING'/.test(adapter)) {
    fail(`${CANONICAL_FILES.adapter}: an incompletely described derivative is reported READY`);
  }
  for (const guard of ['derivativeId === null', 'widthPx === null', 'byteSize === null']) {
    if (!adapter.includes(guard)) {
      fail(`${CANONICAL_FILES.adapter}: the status projection does not require ${guard}`);
    }
  }
  // The status route is scoped to the upload grant. Admitting the document
  // branch would open a second, wider door to enumerate processing state.
  if (!/uploadGrant\(\)/.test(adapter)) {
    fail(`${CANONICAL_FILES.adapter}: the status read is not scoped to the upload grant`);
  }
  if (/findAssetStatus[\s\S]{0,900}sessionMediaGrant\(\)/.test(adapter)) {
    fail(`${CANONICAL_FILES.adapter}: the status read admits the document grant`);
  }

  // One published operation, mapped so the controller split reissues no id.
  const operationId = code(rootDir, 'operationId');
  if (!/PublicDesignSessionAssetStatusController: 'publicDesignSessionAsset'/.test(operationId)) {
    fail(`${CANONICAL_FILES.operationId}: the status controller is not mapped to its domain`);
  }
}

/** Repair C: two grants, and the narrowing that makes a leak unrepresentable. */
export function checkClonedMediaGrant(rootDir, fail) {
  const grant = code(rootDir, 'grant');

  for (const required of ['uploadGrant', 'documentGrant', 'sessionMediaGrant']) {
    if (!grant.includes(required)) fail(`${CANONICAL_FILES.grant}: publishes no ${required}`);
  }
  // The upload branch carries the customer-private lane with it. Hoisting it
  // into the shared `WHERE` would make the document branch unreachable — the
  // repair would be a no-op and every test would still pass.
  if (!/uploadGrant\(\)[\s\S]{0,600}SESSION_INTAKE_ASSET_KIND/.test(grant)) {
    fail(`${CANONICAL_FILES.grant}: the upload lane check is not inside the upload branch`);
  }
  // The document branch admits Template artwork only, so a document reference
  // can never reach another customer's private upload.
  if (!/documentGrant\([\s\S]{0,400}TEMPLATE_ARTWORK_ASSET_KIND/.test(grant)) {
    fail(`${CANONICAL_FILES.grant}: the document branch is not narrowed to Template artwork`);
  }
  if (/documentGrant\([\s\S]{0,600}SESSION_INTAKE_CLASSIFICATION/.test(grant)) {
    fail(`${CANONICAL_FILES.grant}: the document branch admits customer-private media`);
  }
  // Matched on the pair, so an Asset visible through one derivative cannot be
  // read through another.
  for (const required of ["element ->> 'assetId'", "element ->> 'derivativeId'"]) {
    if (!grant.includes(required)) {
      fail(`${CANONICAL_FILES.grant}: the document branch does not match ${required}`);
    }
  }
  // A malformed stored document contributes no grant rather than erroring:
  // `jsonb_array_elements` on a non-array raises.
  if (!/jsonb_typeof\(/.test(grant)) {
    fail(`${CANONICAL_FILES.grant}: the JSONB access is unguarded`);
  }
  // Clone lineage is provenance, never permission.
  for (const lineage of ['designTemplates', 'templateId', 'publishedAt', 'templateVersion']) {
    if (grant.includes(lineage)) {
      fail(`${CANONICAL_FILES.grant}: a grant consults Template lineage (${lineage})`);
    }
  }
}

/** The read limit that closed `FU-APP3-B06C-READ-RATE-LIMIT-01`. */
export function checkReadLimit(rootDir, fail) {
  const guard = code(rootDir, 'readGuard');
  const limiter = code(rootDir, 'limiter');
  const config = code(rootDir, 'authConfig');

  if (!/read: \{ max: 60, windowMs: MINUTE_MS \}/.test(config)) {
    fail(`${CANONICAL_FILES.authConfig}: the 60/minute read limit is not declared`);
  }
  /*
   * It **is** a PO-07 value, and the file has to say so.
   *
   * `APP3-B06C` recorded the opposite — that PO-07 defined four controls and no
   * read limit — and refused to invent one. Refusing was right; the premise was
   * wrong. `IMP-D043` PO-07 rules "bootstrap/resume/read 60/minute per ephemeral
   * network key", and the security document's locked table has carried it since
   * `APP3-G03`. A future reader who found this number attributed to a checkpoint
   * ruling rather than to PO-07 would think it was tunable by whoever set it.
   */
  if (!/PO-07/.test(read(rootDir, 'authConfig') ?? '')) {
    fail(`${CANONICAL_FILES.authConfig}: the read limit is not attributed to IMP-D043 PO-07`);
  }
  if (!/checkRead\(networkKey/.test(limiter)) {
    fail(`${CANONICAL_FILES.limiter}: publishes no read check keyed by network`);
  }
  if (!/checkRead\(networkKey\)/.test(guard)) {
    fail(`${CANONICAL_FILES.readGuard}: the read limit is not applied`);
  }
  // Charged **before** authorization, so it bounds probing rather than only
  // successful reads.
  const limitAt = guard.indexOf('checkRead(');
  const authorizeAt = guard.indexOf('this.authorization.authorize(');
  if (limitAt === -1 || authorizeAt === -1 || limitAt > authorizeAt) {
    fail(`${CANONICAL_FILES.readGuard}: the read limit is charged after authorization`);
  }
  // Still not the mutation budget: a scene referencing several images must never
  // cost a customer the ability to save their own work.
  if (/checkMutation\(/.test(guard)) {
    fail(`${CANONICAL_FILES.readGuard}: a read consumes the PO-07 mutation limit`);
  }
}
