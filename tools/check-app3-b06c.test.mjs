/**
 * Regressions for the `APP3-B06C` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The ones worth reading twice are
 * the mutations that leave a **working route**: the association predicate
 * dropped, so any authorized session reads any customer's upload; the identity
 * taken from the path instead of the credential, so a stolen address is enough;
 * the mutation guard reused, which looks stricter and breaks every `<img>`;
 * `ORIGINAL` made a candidate when the derivative is missing; object storage
 * opened before the decision, so latency becomes an existence oracle; and a
 * provider size mismatch streamed anyway.
 *
 * Every one of those passes an integration happy path.
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
  OPERATION_ID,
  REPO_ROOT,
  ROUTE,
  checkAuthorization,
  checkBoundaries,
  checkCommandIndex,
  checkEligibility,
  checkHeaders,
  checkOperation,
  checkOperationIdStability,
  checkPredecessors,
  checkReadOnly,
  checkReadSemantics,
  checkStreaming,
  checkTestsExist,
  read,
  runChecks,
} from './check-app3-b06c.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

const file = (key) => read(REPO_ROOT, key) ?? '';
const mentions = (failures, needle) => failures.some((f) => f.includes(needle));

let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-b06c-'));
  temporaries.push(base);
  const extras = [
    'tools/check-app3-b06c.mjs',
    'tools/check-app3-b06c-security.mjs',
    'tools/check-app3-b06c-stream.mjs',
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
  const migrations = join(base, 'packages/database/migrations');
  mkdirSync(migrations, { recursive: true });
  for (let index = 0; index < 34; index += 1) {
    writeFileSync(join(migrations, `${String(index).padStart(4, '0')}_fixture.sql`), '');
  }
  return base;
}

function rootWith(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'app3-b06c-case-'));
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

/** One source file with one line deleted, which is how a term really disappears. */
function without(key, needle) {
  const source = file(key);
  const line = source.split('\n').find((candidate) => candidate.includes(needle));
  assert.ok(line !== undefined, `no line contains "${needle}"`);
  return source.replace(`${line}\n`, '');
}

/** One source file with one substring rewritten. */
function replacing(key, from, to) {
  const source = file(key);
  assert.ok(source.includes(from), `no source contains "${from}"`);
  return source.replace(from, to);
}

/* -------------------------------------------------------------------------- */

describe('predecessors', () => {
  it('accepts the delivered phase document', () => {
    assert.deepEqual(run(checkPredecessors), []);
  });

  it('rejects an unaccepted predecessor', () => {
    for (const line of [
      'APP3-S05 = COMPLETE — REVIEW_ACCEPTED',
      'APP3-S05-MI01 = COMPLETE — REVIEW_ACCEPTED',
      'APP3-B06B = COMPLETE — REVIEW_ACCEPTED',
      'APP3-W01C = COMPLETE — REVIEW_ACCEPTED',
      'APP3-G04 = COMPLETE — REVIEW_ACCEPTED',
    ]) {
      const phase = file('phase').replace(`\n${line}\n`, '\n');
      assert.ok(mentions(run(checkPredecessors, { phase }), line), line);
    }
  });

  it('rejects a checkpoint that claims its own consumer', () => {
    // B06C publishing a contract does not implement the Storefront that uses it.
    const phase = `${file('phase')}\nAPP3-S06 = COMPLETE — REVIEW_ACCEPTED\n`;
    assert.ok(mentions(run(checkPredecessors, { phase }), 'APP3-S06 is recorded complete'));
  });

  it('rejects a rewound B06C status', () => {
    const phase = file('phase').replace(
      '\nAPP3-B06C = COMPLETE — REVIEW_DELIVERED\n',
      '\nAPP3-B06C = READY — NOT STARTED\n',
    );
    assert.ok(mentions(run(checkPredecessors, { phase }), 'not recorded complete'));
  });

  it('rejects a dropped zero-write declaration', () => {
    for (const line of ['APP3-B06C WRITES = NONE', 'APP3-B06C AUDIT = NONE']) {
      const phase = file('phase').replace(`\n${line}\n`, '\n');
      assert.ok(mentions(run(checkPredecessors, { phase }), line), line);
    }
  });
});

describe('the published operation', () => {
  it('accepts the delivered artifact', () => {
    assert.deepEqual(run(checkOperation), []);
  });

  it('rejects a route rewritten as a generic asset-by-id', () => {
    // The mutation that ships a working feature and deletes the whole
    // authorization argument: an asset id that grants access on its own.
    const openapi = openapiWith((document) => {
      document.paths['/api/public/assets/{assetId}'] = document.paths[ROUTE];
      delete document.paths[ROUTE];
    });
    assert.ok(mentions(run(checkOperation, { openapi }), 'is not published'));
  });

  it('rejects a second public asset address alongside it', () => {
    const openapi = openapiWith((document) => {
      document.paths['/api/public/assets/{assetId}'] = { get: { operationId: 'x_get' } };
    });
    assert.ok(mentions(run(checkOperation, { openapi }), 'no checkpoint owns'));
  });

  it('rejects a second Session delivery address', () => {
    const openapi = openapiWith((document) => {
      document.paths['/api/public/design-sessions/{sessionId}/assets/{assetId}/original'] = {
        get: { operationId: 'y_get' },
      };
    });
    assert.ok(mentions(run(checkOperation, { openapi }), 'second Session delivery address'));
  });

  it('rejects a second method on the delivery path', () => {
    const openapi = openapiWith((document) => {
      document.paths[ROUTE].delete = { operationId: 'publicDesignSessionAsset_remove' };
    });
    assert.ok(mentions(run(checkOperation, { openapi }), 'expected only get'));
  });

  it('rejects a renamed operation id', () => {
    const openapi = openapiWith((document) => {
      document.paths[ROUTE].get.operationId = 'publicDesignSessionAssetPreview_get';
    });
    assert.ok(mentions(run(checkOperation, { openapi }), OPERATION_ID));
  });

  it('rejects a rendition selector', () => {
    const openapi = openapiWith((document) => {
      document.paths[ROUTE].get.parameters.push({
        name: 'variant',
        in: 'query',
        schema: { type: 'string' },
      });
    });
    assert.ok(mentions(run(checkOperation, { openapi }), 'query:variant'));
  });

  it('rejects a request body', () => {
    const openapi = openapiWith((document) => {
      document.paths[ROUTE].get.requestBody = { content: {} };
    });
    assert.ok(mentions(run(checkOperation, { openapi }), 'declares a request body'));
  });

  it('rejects a JSON success body', () => {
    const openapi = openapiWith((document) => {
      document.paths[ROUTE].get.responses['200'].content = { 'application/json': {} };
    });
    assert.ok(mentions(run(checkOperation, { openapi }), 'binary body'));
  });

  it('rejects a surface that grew by more than this operation', () => {
    const openapi = openapiWith((document) => {
      document.paths['/api/public/unrelated'] = { get: { operationId: 'z_get' } };
    });
    assert.ok(mentions(run(checkOperation, { openapi }), 'paths; expected'));
  });
});

describe('session authorization', () => {
  it('accepts the delivered composition', () => {
    assert.deepEqual(run(checkAuthorization), []);
  });

  it('rejects an unguarded delivery route', () => {
    const controller = without('controller', '@UseGuards(DesignSessionReadGuard)');
    assert.ok(mentions(run(checkAuthorization, { controller }), 'carries no read guard'));
  });

  it('rejects the mutation guard on a safe GET', () => {
    const controller = replacing(
      'controller',
      '@UseGuards(DesignSessionReadGuard)',
      '@UseGuards(DesignSessionGuard)',
    );
    assert.ok(mentions(run(checkAuthorization, { controller }), 'carries the mutation guard'));
  });

  it('rejects an identity read from the path instead of the credential', () => {
    // Passes every happy-path test — and lets a caller holding session A's cookie
    // address session B.
    const controller = replacing(
      'controller',
      'sessionId: context.designSessionId as DesignSessionId',
      'sessionId: params.sessionId as DesignSessionId',
    );
    const failures = run(checkAuthorization, { controller });
    assert.ok(mentions(failures, 'does not come from the authorized context'));
    assert.ok(mentions(failures, 'raw path session id'));
  });

  it('rejects a re-implemented credential check', () => {
    const guard = `${file('guard')}\nconst digest = createHmac('sha256', 'x');\n`;
    assert.ok(mentions(run(checkAuthorization, { guard }), 'createHmac'));
  });

  it('rejects a guard that mints a cookie', () => {
    const guard = replacing(
      'guard',
      "response.setHeader('Set-Cookie', outcome.clearCookie);",
      "response.setHeader('Set-Cookie', this.cookies.serializeSessionCookie(sessionId));",
    );
    assert.ok(mentions(run(checkAuthorization, { guard }), 'Set-Cookie'));
  });

  it('rejects a dropped authorization-failure budget', () => {
    const guard = replacing('guard', 'checkAuthorizationFailure(', 'skipTheBudget(');
    assert.ok(mentions(run(checkAuthorization, { guard }), 'authorization-failure budget'));
  });
});

describe('contextual eligibility', () => {
  it('accepts the delivered descriptor', () => {
    assert.deepEqual(run(checkEligibility), []);
  });

  it('rejects a dropped ownership predicate', () => {
    // The single most dangerous mutation in this checkpoint: the route still
    // works, and every authorized session can read every customer's upload.
    const adapter = without('adapter', 'eq(designSessionAssets.sessionId, lookup.sessionId)');
    assert.ok(mentions(run(checkEligibility, { adapter }), 'lookup.sessionId'));
  });

  it('rejects a dropped lane or inspection predicate', () => {
    for (const needle of [
      'eq(assets.kind, SESSION_INTAKE_ASSET_KIND)',
      'eq(assets.classification, SESSION_INTAKE_CLASSIFICATION)',
      'eq(assets.status, SESSION_ASSET_DELIVERABLE_STATUS)',
      'isNull(assets.deletedAt)',
    ]) {
      const adapter = without('adapter', needle);
      assert.ok(mentions(run(checkEligibility, { adapter }), needle), needle);
    }
  });

  it('rejects a dropped derivative predicate', () => {
    for (const needle of [
      'eq(assetDerivatives.kind, EDITOR_SAFE_DERIVATIVE_KIND)',
      'eq(assetDerivatives.status, EDITOR_SAFE_DERIVATIVE_STATE)',
      'eq(assetDerivatives.isWatermarked, false)',
    ]) {
      const adapter = without('adapter', needle);
      assert.ok(mentions(run(checkEligibility, { adapter }), needle), needle);
    }
  });

  it('rejects a dropped quartet requirement', () => {
    for (const column of ['storageKey', 'mediaType', 'widthPx', 'heightPx', 'byteSize']) {
      const adapter = without('adapter', `isNotNull(assetDerivatives.${column})`);
      assert.ok(mentions(run(checkEligibility, { adapter }), column), column);
    }
  });

  it('rejects a dropped session-liveness predicate', () => {
    const adapter = without('adapter', 'gt(designSessions.expiresAt, lookup.at)');
    assert.ok(mentions(run(checkEligibility, { adapter }), 'expiresAt'));
  });

  it('rejects a write on the read path', () => {
    const adapter = `${file('adapter')}\nawait this.db.update(assets).set({});\n`;
    assert.ok(mentions(run(checkEligibility, { adapter }), 'can write or lock'));
  });

  it('rejects SVG widened into the delivery allowlist', () => {
    const policy = replacing(
      'policy',
      "SESSION_ASSET_MEDIA_TYPES = ['image/webp'] as const",
      "SESSION_ASSET_MEDIA_TYPES = ['image/webp', 'image/svg+xml'] as const",
    );
    assert.ok(mentions(run(checkEligibility, { policy }), 'image/svg+xml'));
  });

  it('rejects ORIGINAL becoming nameable on the delivery path', () => {
    const adapter = replacing(
      'adapter',
      'eq(assetDerivatives.kind, EDITOR_SAFE_DERIVATIVE_KIND)',
      "eq(assetDerivatives.kind, 'ORIGINAL')",
    );
    assert.ok(mentions(run(checkEligibility, { adapter }), 'ORIGINAL'));
  });

  it('rejects a restated intake lane instead of the reused authority', () => {
    const policy = replacing(
      'policy',
      "} from './session-asset-intake.policy';",
      "};\nexport const SESSION_INTAKE_ASSET_KIND = 'CUSTOMER_UPLOAD' as const;",
    );
    const failures = run(checkEligibility, { policy });
    assert.ok(mentions(failures, 'restates the intake lane'));
  });
});

describe('read semantics', () => {
  it('accepts the delivered guard', () => {
    assert.deepEqual(run(checkReadSemantics), []);
  });

  it('rejects a read that spends the mutation limit', () => {
    const guard = replacing(
      'guard',
      'attachDesignSessionContext(request, outcome.context);',
      'this.limiter.checkMutation(outcome.context.designSessionId);\n    attachDesignSessionContext(request, outcome.context);',
    );
    assert.ok(mentions(run(checkReadSemantics, { guard }), 'consumes the mutation limit'));
  });

  it('rejects a mutation guard that quietly lost its own limit', () => {
    // Half-flipped world: the read guard is right and the mutation guard is not.
    const mutationGuard = without('mutationGuard', 'this.limiter.checkMutation(');
    assert.ok(
      mentions(run(checkReadSemantics, { mutationGuard }), 'no longer applies the mutation limit'),
    );
  });

  it('rejects a GET that carries revision semantics', () => {
    const controller = `${file('controller')}\nconst r = body.expectedRevision;\n`;
    assert.ok(mentions(run(checkReadSemantics, { controller }), 'expectedRevision'));
  });

  it('rejects the mutation origin policy applied to a safe GET', () => {
    const guard = replacing(
      'guard',
      'this.origins.evaluateSafeRead(request)',
      'this.origins.evaluate(request)',
    );
    const failures = run(checkReadSemantics, { guard });
    assert.ok(mentions(failures, 'applies the mutation origin policy'));
  });

  it('rejects a weakened mutation origin rule', () => {
    const originPolicy = replacing(
      'originPolicy',
      'hasAllowedOrigin(request) && this.hasAllowedFetchSite(request)',
      'hasAllowedOrigin(request) || this.hasAllowedFetchSite(request)',
    );
    assert.ok(mentions(run(checkReadSemantics, { originPolicy }), 'was weakened'));
  });
});

describe('operation-id stability across the controller split', () => {
  it('accepts the delivered mapping', () => {
    assert.deepEqual(run(checkOperationIdStability), []);
  });

  it('rejects a split that reissues the accepted upload id', () => {
    // `APP3-B04A` proved this exact failure: a responsibility split renaming
    // published ids without one line of route changing.
    const operationId = replacing(
      'operationId',
      "  PublicDesignSessionAssetController: 'publicDesignSessionAsset',\n",
      '',
    );
    assert.ok(mentions(run(checkOperationIdStability, { operationId }), 'accepted domain'));
  });
});

describe('streaming and ordering', () => {
  it('accepts the delivered service', () => {
    assert.deepEqual(run(checkStreaming), []);
  });

  it('rejects storage opened before the descriptor', () => {
    // Latency becomes an existence oracle, and every probe costs the provider.
    const service = replacing(
      'service',
      'const candidate = await this.candidates.findDeliverableCandidate(lookup);',
      'const result0 = await this.storage.getObjectStream({ bucket: SESSION_ASSET_BUCKET, key: lookup.assetId });\n    const candidate = await this.candidates.findDeliverableCandidate(lookup);',
    );
    assert.ok(mentions(run(checkStreaming, { service }), 'not opened after the descriptor'));
  });

  it('rejects a missing descriptor that no longer refuses', () => {
    const service = without('service', 'throw designSessionAssetNotFound();');
    assert.ok(mentions(run(checkStreaming, { service }), 'does not refuse before storage'));
  });

  it('rejects a buffered object', () => {
    const service = `${file('service')}\nconst all = Buffer.concat([]);\n`;
    assert.ok(mentions(run(checkStreaming, { service }), 'buffers the object'));
  });

  it('rejects a provider size mismatch that streams anyway', () => {
    const service = without('service', 'providerSize !== candidate.byteSize');
    assert.ok(mentions(run(checkStreaming, { service }), 'reconcile the provider size'));
  });

  it('rejects a contradicted object left draining', () => {
    const service = without('service', 'result.body.destroy();');
    assert.ok(mentions(run(checkStreaming, { service }), 'leaves its stream draining'));
  });

  it('rejects an authorized storage failure turned into a privacy 404', () => {
    const errors = replacing(
      'errors',
      'DESIGN_SESSION_ASSET_UNAVAILABLE: (payload) => new ServiceUnavailableException(payload),',
      'DESIGN_SESSION_ASSET_UNAVAILABLE: (payload) => new NotFoundException(payload),',
    );
    assert.ok(mentions(run(checkStreaming, { errors }), 'not a 503'));
  });

  it('rejects a disconnect that no longer tears the body down', () => {
    const controller = without('controller', "addEventListener('abort'");
    assert.ok(mentions(run(checkStreaming, { controller }), 'does not destroy the open body'));
  });
});

describe('response headers', () => {
  it('accepts the delivered headers', () => {
    assert.deepEqual(run(checkHeaders), []);
  });

  it('rejects a cacheable response', () => {
    // A session expires while its bytes do not, so a cached copy keeps serving a
    // customer's photograph to a browser that can no longer prove it owns them.
    const policy = replacing(
      'policy',
      "SESSION_ASSET_CACHE_CONTROL = 'no-store'",
      "SESSION_ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable'",
    );
    assert.ok(mentions(run(checkHeaders, { policy }), 'not no-store'));
  });

  it('rejects a cacheable directive sent from the controller', () => {
    const controller = replacing(
      'controller',
      "response.setHeader('Cache-Control', SESSION_ASSET_CACHE_CONTROL);",
      "response.setHeader('Cache-Control', 'public, max-age=600');",
    );
    assert.ok(mentions(run(checkHeaders, { controller }), 'forbidden cache header'));
  });

  it('accepts the description calling the bytes immutable', () => {
    // The rule is about the value sent, not the word used. A gate that banned the
    // word would refuse a correct artifact — the proxy failure `APP3-B06B`
    // recorded.
    assert.ok(file('controller').includes('immutable'));
    assert.deepEqual(run(checkHeaders), []);
  });

  it('rejects a validator or range header', () => {
    for (const header of ['ETag', 'Last-Modified', 'Accept-Ranges']) {
      const controller = replacing(
        'controller',
        "response.setHeader('Cache-Control', SESSION_ASSET_CACHE_CONTROL);",
        `response.setHeader('${header}', 'x');\n    response.setHeader('Cache-Control', SESSION_ASSET_CACHE_CONTROL);`,
      );
      assert.ok(mentions(run(checkHeaders, { controller }), 'header'), header);
    }
  });

  it('rejects the parent asset mime type answering for the derivative', () => {
    const controller = replacing('controller', 'type: stream.contentType', 'type: asset.mimeType');
    assert.ok(mentions(run(checkHeaders, { controller }), 'persisted media type'));
  });
});

describe('the zero-write guarantee', () => {
  it('accepts the delivered wiring', () => {
    assert.deepEqual(run(checkReadOnly), []);
  });

  it('rejects a delivery port that can write', () => {
    const port = `${file('port')}\nexport interface Writable { attachAsset(id: string): Promise<void>; }\n`;
    assert.ok(mentions(run(checkReadOnly, { port }), 'exposes a write'));
  });

  it('rejects a service reaching the writable Session repository', () => {
    const service = `${file('service')}\nimport { DESIGN_SESSION_REPOSITORY } from './x';\n`;
    assert.ok(mentions(run(checkReadOnly, { service }), 'writable Session repository'));
  });

  it('rejects an audit or outbox append on the read path', () => {
    const service = `${file('service')}\nawait this.outbox.append({});\n`;
    assert.ok(mentions(run(checkReadOnly, { service }), 'can append or enqueue'));
  });

  it('rejects a presign or storage credential anywhere on the path', () => {
    const service = `${file('service')}\nconst url = await getSignedUrl(x);\n`;
    assert.ok(mentions(run(checkReadOnly, { service }), 'presign'));
  });

  it('rejects a module that no longer binds the read-only port', () => {
    // `replaceAll`, not `without`: the symbol appears on both the import and the
    // provider line, and deleting one left the other matching — a mutation weak
    // enough to pass while the binding was still there.
    const module = file('module').replaceAll('DESIGN_SESSION_ASSET_DELIVERY_REPOSITORY', 'X_REPO');
    assert.ok(mentions(run(checkReadOnly, { module }), 'read-only delivery port'));
  });

  it('rejects a live suite that stopped proving the zero-delta', () => {
    const liveSpec = file('liveSpec').replaceAll('audit_events', 'something_else');
    assert.ok(mentions(run(checkReadOnly, { liveSpec }), 'audit_events'));
  });
});

describe('boundaries', () => {
  it('accepts the delivered checkpoint', () => {
    assert.deepEqual(run(checkBoundaries), []);
  });

  it('rejects a migration', () => {
    const root = rootWith();
    writeFileSync(join(root, 'packages/database/migrations/0099_b06c.sql'), '');
    const failures = [];
    checkBoundaries(root, (message) => failures.push(message));
    assert.ok(mentions(failures, 'B06C adds none'));
  });

  it('rejects a new root script', () => {
    const rootPackage = JSON.parse(file('rootPackage'));
    rootPackage.scripts['check:app3-b06c'] = 'node tools/check-app3-b06c.mjs';
    assert.ok(
      mentions(run(checkBoundaries, { rootPackage: JSON.stringify(rootPackage) }), 'adds none'),
    );
  });

  it('rejects Storefront source appearing in the checkpoint', () => {
    // `APP3-S06` is the consumer. A backend checkpoint that reaches into it is a
    // frontend capability arriving under a backend review.
    const service = `${file('service')}\nimport x from '../../../../../apps/storefront/src/y';\n`;
    assert.ok(mentions(run(checkBoundaries, { service }), 'frontend or worker path'));
  });
});

describe('the scoped command index', () => {
  it('accepts the delivered index', () => {
    assert.deepEqual(run(checkCommandIndex), []);
  });

  it('rejects an unregistered command', () => {
    const index = file('index').replaceAll('CMD-TEST-APP3-B06C-INTEGRATION', 'CMD-X');
    assert.ok(mentions(run(checkCommandIndex, { index }), 'CMD-TEST-APP3-B06C-INTEGRATION'));
  });
});

describe('the focused proofs exist', () => {
  it('accepts the delivered suites', () => {
    assert.deepEqual(run(checkTestsExist), []);
  });

  it('rejects a dropped suite', () => {
    const root = rootWith();
    rmSync(join(root, CANONICAL_FILES.liveSpec));
    const failures = [];
    checkTestsExist(root, (message) => failures.push(message));
    assert.ok(mentions(failures, 'is missing'));
  });
});

describe('the whole gate, against the real repository', () => {
  it('passes', () => {
    assert.deepEqual(runChecks(REPO_ROOT), []);
  });
});
