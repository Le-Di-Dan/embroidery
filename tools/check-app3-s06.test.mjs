/**
 * Regressions for the `APP3-S06` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The ones worth reading twice are
 * the mutations that leave a **working capability** behind:
 *
 * - the Session lane's full decode removed, so a truncated PNG is accepted by a
 *   pipeline that only ever read its header;
 * - the lane matched on the kind alone, so a `CUSTOMER_UPLOAD` marked `PUBLIC`
 *   is inspected under customer-private assumptions;
 * - the Session lane given a derivative, so inspection becomes a second producer
 *   of `APP3-W01A`'s output;
 * - the customer-private lane hoisted out of the upload branch, which makes the
 *   document branch unreachable and the cloned-media repair a silent no-op;
 * - the document branch's `TEMPLATE_SOURCE` narrowing dropped, so a customer's
 *   own document becomes a way to read another customer's photograph;
 * - the read limit moved after authorization, bounding successful reads instead
 *   of the probing it exists to bound;
 * - the preview query key stripped of its derivative, so a replacement renders
 *   the previous picture under the new media identity;
 * - intrinsic dimensions taken from a decoded `<img>`;
 * - the initial box fitted to the Embroidery Area rectangle alone, so an Area
 *   whose millimetre maximum is tighter accepts an upload and inserts nothing.
 *
 * Every one of those passes a happy-path integration test.
 *
 * The sub-checks run against a temp root; the whole gate is proved once against
 * the real repository in the last block.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import { APP3_SURFACE_TOOL_FILES } from './app3-accepted-surface.mjs';
import {
  CANONICAL_FILES,
  REPO_ROOT,
  checkAffordanceMirror,
  checkApp3S06,
  checkClonedMediaGrant,
  checkCommandIndex,
  checkComposition,
  checkDesignApproval,
  checkImageAuthority,
  checkImmutability,
  checkInspectionLane,
  checkObjectUrls,
  checkPolling,
  checkPredecessors,
  checkReadLimit,
  checkRenderer,
  checkStatusProjection,
  checkSurface,
} from './check-app3-s06.mjs';
import { read } from './check-app3-s06.sources.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

const file = (key) => read(REPO_ROOT, key) ?? '';
const mentions = (failures, needle) => failures.some((f) => f.includes(needle));

/** Every Studio source, so the whole-feature rules see a real tree. */
const FEATURE_DIR = 'apps/storefront/src/features/design-studio';

let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-s06-'));
  temporaries.push(base);

  const extras = [
    'tools/check-app3-s06.mjs',
    'tools/check-app3-s06.sources.mjs',
    'tools/check-app3-s06-repairs.mjs',
    'tools/check-app3-s06-frontend.mjs',
    'apps/storefront/package.json',
    'apps/api/package.json',
    'apps/worker/package.json',
    ...APP3_SURFACE_TOOL_FILES,
  ];
  for (const relative of [...Object.values(CANONICAL_FILES), ...extras]) {
    const target = join(base, relative);
    mkdirSync(dirname(target), { recursive: true });
    try {
      cpSync(join(REPO_ROOT, relative), target);
    } catch {
      // The completion report does not exist while Commit A is prepared.
    }
  }
  // The whole feature, because the feature-wide rules must see every file — a
  // rule that only read the files it knew about would be satisfied by a new one
  // breaking it.
  cpSync(join(REPO_ROOT, FEATURE_DIR), join(base, FEATURE_DIR), { recursive: true });

  const migrations = join(base, 'packages/database/migrations');
  mkdirSync(migrations, { recursive: true });
  for (let index = 0; index < 34; index += 1) {
    writeFileSync(join(migrations, `${String(index).padStart(4, '0')}_fixture.sql`), '');
  }
  return base;
}

function rootWith(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'app3-s06-case-'));
  temporaries.push(root);
  cpSync(baseRoot(), root, { recursive: true });
  for (const [key, content] of Object.entries(overrides)) {
    const target = join(root, CANONICAL_FILES[key] ?? key);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  return root;
}

function run(check, overrides = {}) {
  const failures = [];
  check(rootWith(overrides), (message) => failures.push(message));
  return failures;
}

function openapiWith(mutate) {
  const document = JSON.parse(file('openapi'));
  mutate(document);
  return JSON.stringify(document);
}

/**
 * One source file with **every** matching line deleted.
 *
 * `replaceAll`, not `replace`: `APP3-B06C` found two mutations that passed
 * because only the first matching line was removed and a second still carried
 * the term, so the "mutation" left the property intact.
 */
function without(key, needle) {
  const source = file(key);
  const lines = source.split('\n').filter((line) => line.includes(needle));
  assert.ok(lines.length > 0, `no line contains "${needle}"`);
  let mutated = source;
  for (const line of lines) mutated = mutated.replaceAll(`${line}\n`, '');
  return mutated;
}

/** One source file with one substring rewritten. */
function replacing(key, from, to) {
  const source = file(key);
  assert.ok(source.includes(from), `no source contains "${from}"`);
  return source.replaceAll(from, to);
}

/* -------------------------------------------------------------------------- */

describe('predecessors', () => {
  it('accepts the delivered phase document', () => {
    assert.deepEqual(run(checkPredecessors), []);
  });

  it('rejects an unaccepted predecessor', () => {
    for (const line of [
      'APP3-B06C = COMPLETE — REVIEW_ACCEPTED',
      'APP3-W01C = COMPLETE — REVIEW_ACCEPTED',
      'APP3-S05 = COMPLETE — REVIEW_ACCEPTED',
    ]) {
      const phase = file('phase').replace(`\n${line}\n`, '\n');
      assert.ok(mentions(run(checkPredecessors, { phase }), line), line);
    }
  });

  it('rejects a status block that omits a fact nobody can recompute', () => {
    for (const line of [
      'APP3-S06 REPAIR_A_DECODE = FULL_DECODE_ON_A_LANE_WITH_NO_DERIVATIVE',
      'APP3-S06 REPAIR_C_NARROWING = DOCUMENT_BRANCH_IS_TEMPLATE_SOURCE_ONLY',
      'APP3-S06 READ_RATE_LIMIT = IMP-D043 PO-07 BOOTSTRAP_RESUME_READ',
      'FU-APP3-B06C-SESSION-LANE-INSPECTION-01 = COMPLETE — CLOSED_BY_APP3-S06',
    ]) {
      const phase = file('phase').replace(`\n${line}`, '\n');
      assert.ok(mentions(run(checkPredecessors, { phase }), line), line);
    }
  });

  it('refuses credit for a follow-up S06 did not close', () => {
    const phase = file('phase').replace(
      'FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01 = OPEN',
      'FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01 = COMPLETE',
    );
    assert.ok(mentions(run(checkPredecessors, { phase }), 'Template intake follow-up'));
  });

  it('refuses a later Studio capability recorded complete', () => {
    for (const later of ['APP3-S08', 'APP3-S09', 'APP3-S11']) {
      const phase = `${file('phase')}\n${later} = COMPLETE — REVIEW_DELIVERED\n`;
      assert.ok(mentions(run(checkPredecessors, { phase }), later), later);
    }
  });
});

describe('design approval stays scoped', () => {
  it('accepts the four approved rows', () => {
    assert.deepEqual(run(checkDesignApproval), []);
  });

  it('refuses an unapproved S06 row', () => {
    const registry = file('registry').replace(
      /(\| FIG-STUDIO-IMAGE-DESKTOP-READY \|[^\n]*)APPROVED_FOR_IMPLEMENTATION/,
      '$1REVIEW_REQUIRED',
    );
    assert.ok(mentions(run(checkDesignApproval, { registry }), 'FIG-STUDIO-IMAGE-DESKTOP-READY'));
  });

  it('refuses a blanket Studio approval', () => {
    // The exact failure a "the Studio is designed, approve it all" edit makes.
    const registry = file('registry').replaceAll('REVIEW_REQUIRED', 'APPROVED_FOR_IMPLEMENTATION');
    const failures = run(checkDesignApproval, { registry });
    assert.ok(mentions(failures, 'FIG-STUDIO-WATERMARK-DESKTOP-LIGHT'));
    // The mobile image sheet is the same *capability* and a different
    // checkpoint: approving the desktop rows must never carry it along.
    assert.ok(mentions(failures, 'FIG-STUDIO-MOBILE-IMAGESHEET'));
  });

  it('refuses a row whose node id moved', () => {
    const registry = file('registry').replace('608:441', '608:999');
    assert.ok(mentions(run(checkDesignApproval, { registry }), 'does not carry node'));
  });
});

describe('the published surface', () => {
  it('accepts the generated artifact', () => {
    assert.deepEqual(run(checkSurface), []);
  });

  it('refuses a missing status route', () => {
    const openapi = openapiWith((document) => {
      delete document.paths['/api/public/design-sessions/{sessionId}/assets/{assetId}/status'];
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'paths'));
  });

  it('refuses a reissued accepted operation id', () => {
    // The `APP3-B04A` failure: a controller split silently renames every
    // operation derived from the class name.
    const openapi = openapiWith((document) => {
      const path = document.paths['/api/public/design-sessions/{sessionId}/assets'];
      path.post.operationId = 'publicDesignSessionAssetUpload_create';
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'publicDesignSessionAsset_create'));
  });

  it('refuses a second public status address', () => {
    const openapi = openapiWith((document) => {
      document.paths['/api/public/assets/{assetId}/status'] = {
        get: { operationId: 'publicAsset_status' },
      };
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'second public status address'));
  });
});

describe('repair A — the Session inspection lane', () => {
  it('accepts the delivered lane', () => {
    assert.deepEqual(run(checkInspectionLane), []);
  });

  it('refuses a lane matched on the kind alone', () => {
    const lane = replacing(
      'lane',
      'lane.assetKind === kind && lane.classification === classification',
      'lane.assetKind === kind',
    );
    assert.ok(mentions(run(checkInspectionLane, { lane }), 'kind/classification pair'));
  });

  it('refuses a Session lane that writes a derivative', () => {
    const lane = replacing(
      'lane',
      "code: 'SESSION',\n  assetKind: 'CUSTOMER_UPLOAD',\n  classification: 'CUSTOMER_PRIVATE',\n  derivatives: Object.freeze([]),",
      "code: 'SESSION',\n  assetKind: 'CUSTOMER_UPLOAD',\n  classification: 'CUSTOMER_PRIVATE',\n  derivatives: DERIVATIVE_OUTPUT_POLICIES,",
    );
    assert.ok(mentions(run(checkInspectionLane, { lane }), 'declares a derivative of its own'));
  });

  it('refuses the full decode being removed', () => {
    // The mutation that leaves a working pipeline and accepts a truncated PNG:
    // the catalog lane's decode was always a side effect of generating output.
    const verification = without('verification', 'requiresFullDecodeVerification(lane)');
    assert.ok(mentions(run(checkInspectionLane, { verification }), 'does not decode'));
  });

  it('refuses the decode rule becoming a configurable flag', () => {
    const lane = replacing(
      'lane',
      'return lane.derivatives.length === 0',
      'return lane.fullDecode',
    );
    assert.ok(mentions(run(checkInspectionLane, { lane }), 'not derived'));
  });

  it('refuses a decode that runs before the policy', () => {
    // An oversized image would then be reported `DECODE_FAILED` rather than by
    // its own precise code — and would be decoded despite being refusable.
    const verification = replacing(
      'verification',
      `    const inspected = this.applyPolicy(mediaType, byteSize, source, metadata);

    if (requiresFullDecodeVerification(lane)) {
      await this.verifyDecodable(source, signal);
    }`,
      `    if (requiresFullDecodeVerification(lane)) {
      await this.verifyDecodable(source, signal);
    }
    const inspected = this.applyPolicy(mediaType, byteSize, source, metadata);`,
    );
    assert.ok(mentions(run(checkInspectionLane, { verification }), 'before the policy'));
  });

  it('refuses the two hard-coded lane literals coming back', () => {
    const assetRows = `${file('assetRows')}\nconst REQUIRED_KIND = 'CATALOG_MEDIA';\n`;
    assert.ok(mentions(run(checkInspectionLane, { assetRows }), 'hard-codes a single lane'));
  });

  it('refuses generation that ignores the lane', () => {
    const inspectionUseCase = replacing(
      'inspectionUseCase',
      'for (const policy of lane.derivatives)',
      'for (const policy of DERIVATIVE_OUTPUT_POLICIES)',
    );
    assert.ok(mentions(run(checkInspectionLane, { inspectionUseCase }), 'not generated per lane'));
  });

  it('refuses a scheduler or a wait inside the repair', () => {
    const inspectionUseCase = `${file('inspectionUseCase')}\nsetInterval(() => undefined, 1000);\n`;
    assert.ok(mentions(run(checkInspectionLane, { inspectionUseCase }), 'scheduler or a wait'));
  });
});

describe('repair B — the status projection', () => {
  it('accepts the delivered projection', () => {
    assert.deepEqual(run(checkStatusProjection), []);
  });

  it('refuses an unguarded status route', () => {
    const statusController = without('statusController', '@UseGuards(DesignSessionReadGuard)');
    assert.ok(mentions(run(checkStatusProjection, { statusController }), 'no read guard'));
  });

  it('refuses the raw path session id as an identity', () => {
    const statusController = replacing(
      'statusController',
      'sessionId: context.designSessionId as DesignSessionId',
      'sessionId: params.sessionId as DesignSessionId',
    );
    assert.ok(mentions(run(checkStatusProjection, { statusController }), 'raw path session id'));
  });

  it('refuses a cacheable status response', () => {
    const statusController = without(
      'statusController',
      "setHeader('Cache-Control', SESSION_ASSET_CACHE_CONTROL)",
    );
    assert.ok(mentions(run(checkStatusProjection, { statusController }), 'cacheable'));
  });

  it('refuses a field the projection may not publish', () => {
    const statusResponse = replacing(
      'statusResponse',
      '  byteSize?: number;',
      '  byteSize?: number;\n\n  @ApiProperty()\n  storageKey?: string;',
    );
    assert.ok(mentions(run(checkStatusProjection, { statusResponse }), 'storageKey'));
  });

  it('refuses READY without the whole quartet behind it', () => {
    const adapter = without('adapter', 'if (widthPx === null || heightPx === null');
    assert.ok(mentions(run(checkStatusProjection, { adapter }), 'widthPx === null'));
  });

  it('refuses the status read admitting the document grant', () => {
    const adapter = replacing(
      'adapter',
      '          uploadGrant(),',
      '          sessionMediaGrant(),',
    );
    assert.ok(mentions(run(checkStatusProjection, { adapter }), 'upload grant'));
  });

  it('refuses a controller split that would reissue an operation id', () => {
    const operationId = without(
      'operationId',
      "PublicDesignSessionAssetStatusController: 'publicDesignSessionAsset'",
    );
    assert.ok(mentions(run(checkStatusProjection, { operationId }), 'mapped to its domain'));
  });
});

describe('repair C — the cloned-media grant', () => {
  it('accepts the delivered grant', () => {
    assert.deepEqual(run(checkClonedMediaGrant), []);
  });

  it('refuses the lane check hoisted out of the upload branch', () => {
    // The silent no-op: a lane asserted globally makes the document branch
    // unreachable, the repair does nothing, and every test still passes.
    const grant = replacing(
      'grant',
      'eq(assets.kind, SESSION_INTAKE_ASSET_KIND),\n    eq(assets.classification, SESSION_INTAKE_CLASSIFICATION),\n    exists(',
      'exists(',
    );
    assert.ok(mentions(run(checkClonedMediaGrant, { grant }), 'inside the upload branch'));
  });

  it('refuses a document branch that is not narrowed to Template artwork', () => {
    // The mutation that makes a customer's own document a way to read another
    // customer's photograph.
    const grant = replacing('grant', 'eq(assets.kind, TEMPLATE_ARTWORK_ASSET_KIND),\n    ', '');
    assert.ok(mentions(run(checkClonedMediaGrant, { grant }), 'Template artwork'));
  });

  it('refuses a document branch that stops matching the pair', () => {
    const grant = replacing('grant', "element ->> 'derivativeId'", "element ->> 'assetId'");
    assert.ok(mentions(run(checkClonedMediaGrant, { grant }), 'derivativeId'));
  });

  it('refuses an unguarded JSONB access', () => {
    const grant = without('grant', 'jsonb_typeof(');
    assert.ok(mentions(run(checkClonedMediaGrant, { grant }), 'unguarded'));
  });

  it('refuses a grant that consults Template lineage', () => {
    const grant = `${file('grant')}\nconst byTemplate = eq(designTemplates.id, 'x');\n`;
    assert.ok(mentions(run(checkClonedMediaGrant, { grant }), 'Template lineage'));
  });
});

describe('the read limit', () => {
  it('accepts the delivered limit', () => {
    assert.deepEqual(run(checkReadLimit), []);
  });

  it('refuses the limit being removed', () => {
    const readGuard = without('readGuard', 'this.limiter.checkRead(networkKey)');
    assert.ok(mentions(run(checkReadLimit, { readGuard }), 'not applied'));
  });

  it('refuses a limit charged after authorization', () => {
    // It would then bound successful reads and not the probing it exists to
    // bound — a caller guessing asset ids would never spend it.
    const source = file('readGuard');
    const limit = source
      .split('\n')
      .filter((line) => line.includes('this.limiter.checkRead(networkKey)'))
      .join('\n');
    const readGuard = source
      .replace(`${limit}\n`, '')
      .replace(
        '    if (!outcome.authorized) {',
        `    if (!this.limiter.checkRead(networkKey).allowed) throw designSessionRateLimited();\n    if (!outcome.authorized) {`,
      );
    assert.ok(mentions(run(checkReadLimit, { readGuard }), 'after authorization'));
  });

  it('refuses a read that spends the mutation budget', () => {
    const readGuard = replacing(
      'readGuard',
      'const outcome = await this.authorization.authorize(request, sessionId);',
      'this.limiter.checkMutation(sessionId);\n    const outcome = await this.authorization.authorize(request, sessionId);',
    );
    assert.ok(mentions(run(checkReadLimit, { readGuard }), 'mutation limit'));
  });

  it('refuses the limit losing its PO-07 attribution', () => {
    // A number attributed to a checkpoint rather than to PO-07 reads as tunable
    // by whoever set it, which is exactly what a locked control is not.
    const authConfig = file('authConfig').replaceAll('PO-07', 'an APP3-S06 ruling');
    assert.ok(mentions(run(checkReadLimit, { authConfig }), 'IMP-D043 PO-07'));
  });
});

describe('the Studio capability', () => {
  it('accepts the delivered frontend', () => {
    for (const check of [
      checkImageAuthority,
      checkPolling,
      checkObjectUrls,
      checkRenderer,
      checkComposition,
      checkAffordanceMirror,
    ]) {
      assert.deepEqual(run(check), [], check.name);
    }
  });

  it('refuses a candidate that skips an authority', () => {
    for (const authority of [
      'validateDesignDocumentComplexity',
      'validateDesignDocumentContext',
      'ruleOnCandidate',
    ]) {
      // Every line, or the name survives in the import list and the "mutation"
      // leaves the rule satisfied by a term the code no longer uses.
      const authorityFile = without('authority', authority);
      assert.ok(
        mentions(run(checkImageAuthority, { authority: authorityFile }), authority),
        authority,
      );
    }
  });

  it('refuses intrinsic dimensions taken from the browser', () => {
    const placement = `${file('placement')}\nconst measured = probe.naturalWidth;\n`;
    assert.ok(mentions(run(checkImageAuthority, { placement }), 'naturalWidth'));
  });

  it('refuses an initial placement that may upscale', () => {
    const placement = replacing(
      'placement',
      'Math.min(1, maxWidthPx',
      'Math.min(Infinity, maxWidthPx',
    );
    assert.ok(mentions(run(checkImageAuthority, { placement }), 'may upscale'));
  });

  /*
   * The `APP3-S06-C1` mutations. Each removes one bound from the *construction*
   * and leaves a capability that still works everywhere the Area rectangle is
   * the tighter limit — which is every fixture the checkpoint shipped with. The
   * defect appears only on an Area whose maximum is smaller than its rectangle,
   * as an upload that succeeds and inserts nothing.
   */
  it('refuses an initial placement unbounded by the physical width maximum', () => {
    const placement = without('placement', 'area.maxWidthMm');
    assert.ok(mentions(run(checkImageAuthority, { placement }), 'not bounded by maxWidthMm'));
  });

  it('refuses an initial placement unbounded by the physical height maximum', () => {
    const placement = without('placement', 'area.maxHeightMm');
    assert.ok(mentions(run(checkImageAuthority, { placement }), 'not bounded by maxHeightMm'));
  });

  it('refuses an initial placement that never converts millimetres', () => {
    // The whole pre-C1 shape: the rectangle alone decides, and P02 is left to
    // refuse whatever that produces.
    const placement = replacing('placement', 'mmToPx(maxMm, pxPerMm)', 'Number.POSITIVE_INFINITY');
    assert.ok(mentions(run(checkImageAuthority, { placement }), 'does not convert'));
  });

  it('refuses an axis decided by one authority instead of the tighter of both', () => {
    const placement = replacing(
      'placement',
      'const maxWidthPx = Math.min(scope.boundWidthPx, physicalWidthPx);',
      'const maxWidthPx = scope.boundWidthPx;',
    );
    assert.ok(mentions(run(checkImageAuthority, { placement }), 'tighter of the rectangle'));
  });

  it('refuses a constructed box that is not centred in the area', () => {
    const placement = replacing(
      'placement',
      'x: scope.boundXPx + downToGrid((scope.boundWidthPx - width) / 2),',
      'x: 0,',
    );
    assert.ok(mentions(run(checkImageAuthority, { placement }), 'not centred on boundXPx'));
  });

  it('refuses a second px↔mm scale in the placement rule', () => {
    const placement = `${file('placement')}\nconst PX_PER_MM = 3.7795;\n`;
    assert.ok(mentions(run(checkImageAuthority, { placement }), 'second px↔mm scale'));
  });

  it('refuses a construction that is trusted instead of validated', () => {
    const imageHook = replacing(
      'imageHook',
      'return ruleOnImageCandidate(candidate, elementId, media, scope, limits);',
      'return { ok: true, document: candidate, elementId };',
    );
    assert.ok(mentions(run(checkImageAuthority, { imageHook }), 'without APP3-P02'));
  });

  it('refuses an impossible placement that is not refused', () => {
    const imageHook = without('imageHook', '=== null) return { ok: false');
    assert.ok(mentions(run(checkImageAuthority, { imageHook }), 'is not refused'));
  });

  it('refuses a replacement that re-places the element', () => {
    const placement = replacing(
      'placement',
      '            assetId: media.assetId,\n            derivativeId: media.derivativeId,',
      '            transform: initialImageTransform(media, scope),\n            assetId: media.assetId,\n            derivativeId: media.derivativeId,',
    );
    assert.ok(mentions(run(checkImageAuthority, { placement }), 're-places'));
  });

  it('refuses polling that never stops', () => {
    const statusHook = without('statusHook', 'isTerminalAssetState(state) ? false');
    assert.ok(mentions(run(checkPolling, { statusHook }), 'does not stop'));
  });

  it('refuses the binary route being polled', () => {
    const mediaHook = replacing(
      'mediaHook',
      '      retry: false,',
      '      retry: false,\n      refetchInterval: 2000,',
    );
    assert.ok(mentions(run(checkPolling, { mediaHook }), 'binary route is polled'));
  });

  it('refuses an object URL that is never revoked', () => {
    const mediaHook = without('mediaHook', 'URL.revokeObjectURL(url)');
    assert.ok(mentions(run(checkObjectUrls, { mediaHook }), 'lifecycle'));
  });

  it('refuses a preview key without its derivative', () => {
    // A replacement would go on rendering the previous picture under the new
    // media identity — the stale-image failure the lifecycle exists to prevent.
    const queryKeys = replacing(
      'queryKeys',
      'sessionAssetPreview: (sessionId: string, assetId: string, derivativeId: string)',
      'sessionAssetPreview: (sessionId: string, assetId: string)',
    );
    assert.ok(mentions(run(checkObjectUrls, { queryKeys }), 'derivative'));
  });

  it('refuses a blob reaching the working document', () => {
    const documentStore = `${file('documentStore')}\nexport const cachedBlob = null;\n`;
    assert.ok(mentions(run(checkObjectUrls, { documentStore }), 'working document'));
  });

  it('refuses the honest placeholder being removed', () => {
    const stageElement = replacing(
      'stageElement',
      'mediaUrl === null ? (\n        <ImagePlaceholder width={width} height={height} />\n      ) : (\n        <PlacedImage',
      'mediaUrl === null ? null : (\n        <PlacedImage',
    );
    assert.ok(mentions(run(checkRenderer, { stageElement }), 'placeholder'));
  });

  it('refuses an HTML image in the scene', () => {
    const stageElement = replacing('stageElement', '<image\n', '<img \n');
    assert.ok(mentions(run(checkRenderer, { stageElement }), 'HTML <img>'));
  });

  it('refuses a second drawer or topbar', () => {
    const imagePanel = `${file('imagePanel')}\nconst second = <div className="studio-stage__topbar" />;\n`;
    assert.ok(mentions(run(checkComposition, { imagePanel }), 'topbars'));
  });

  it('refuses a mobile editing surface, hidden or not', () => {
    // The mutation that ships a file picker at 390: the notice removed, so the
    // mobile tier falls through to the desktop inspector.
    const imagePanel = without('imagePanel', 'studio-image-mobile-notice');
    assert.ok(mentions(run(checkComposition, { imagePanel }), '390 boundary'));
  });

  it('refuses a capability S06 does not own', () => {
    for (const capability of ['crop', 'opacity', 'onDelete']) {
      const imageInspector = `${file('imageInspector')}\nconst ${capability} = null;\n`;
      assert.ok(mentions(run(checkComposition, { imageInspector }), capability), capability);
    }
  });

  it('refuses fabricated upload progress', () => {
    const service = without(
      'service',
      'if (event.total === undefined || event.total <= 0) return;',
    );
    assert.ok(mentions(run(checkComposition, { service }), 'real total'));
  });

  it('refuses an affordance that stops mirroring the contract', () => {
    const fileModel = replacing(
      'file',
      'MAX_IMAGE_BYTES = 10_485_760',
      'MAX_IMAGE_BYTES = 20_971_520',
    );
    assert.ok(mentions(run(checkAffordanceMirror, { file: fileModel }), 'contract publishes'));
  });

  it('refuses an affordance offering a type intake always refuses', () => {
    const fileModel = replacing(
      'file',
      "'image/webp'] as const",
      "'image/webp', 'image/gif'] as const",
    );
    assert.ok(mentions(run(checkAffordanceMirror, { file: fileModel }), 'image/gif'));
  });
});

describe('the artifacts and the command index', () => {
  it('accepts the delivered repository', () => {
    assert.deepEqual(run(checkImmutability), []);
    assert.deepEqual(run(checkCommandIndex), []);
  });

  it('refuses a migration appearing', () => {
    const root = rootWith();
    writeFileSync(join(root, 'packages/database/migrations/0035_new.sql'), '');
    const failures = [];
    checkImmutability(root, (message) => failures.push(message));
    assert.ok(mentions(failures, 'migrations'));
  });

  it('refuses autosave crossing the curated boundary', () => {
    const curatedClient = `${file('curatedClient')}\npublicDesignSessionAutosave,\n`;
    assert.ok(mentions(run(checkImmutability, { curatedClient }), 'autosave'));
  });

  it('refuses an unregistered command', () => {
    // A rename that does not *contain* the original id — otherwise the check
    // still finds its needle and the mutation proves nothing.
    const index = file('index').replaceAll('CMD-CHECK-APP3-S06', 'CMD-CHECK-APP3-IMAGE');
    assert.ok(mentions(run(checkCommandIndex, { index }), 'CMD-CHECK-APP3-S06'));
  });
});

describe('the whole gate', () => {
  it('passes against the real repository', () => {
    assert.deepEqual(checkApp3S06(REPO_ROOT), []);
  });
});
