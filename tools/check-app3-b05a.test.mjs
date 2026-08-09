/**
 * Regressions for the `APP3-B05A` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The ones worth reading twice are
 * the mutations that leave a **working route**: the newer-published-version
 * clause dropped, so every version that was ever public stays addressable; the
 * document proof removed, so the cumulative association alone authorizes artwork
 * the current design no longer shows; the eligibility call removed, so a
 * withdrawn Product keeps serving; object storage opened before the decision, so
 * latency becomes an existence oracle; and the deliverable list widened.
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

import { APP3_SURFACE_TOOL_FILES, B05A_STATUS_LINES } from './app3-accepted-surface.mjs';
import {
  CANONICAL_FILES,
  OPERATION_ID,
  REPO_ROOT,
  ROUTE,
  checkApp3B05A,
  checkAuthorization,
  checkBoundaries,
  checkDeliverable,
  checkDocumentMembership,
  checkHeaders,
  checkNonDisclosure,
  checkPredecessors,
  checkReadOnly,
  checkStreaming,
  checkSurface,
  read,
} from './check-app3-b05a.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

const file = (key) => read(REPO_ROOT, key) ?? '';
const mentions = (failures, needle) => failures.some((f) => f.includes(needle));

let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-b05a-'));
  temporaries.push(base);
  const extras = [
    'tools/check-app3-b05a.mjs',
    'tools/check-app3-b05a-authorization.mjs',
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
  const root = mkdtempSync(join(tmpdir(), 'app3-b05a-case-'));
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

/* -------------------------------------------------------------------------- */

describe('predecessors', () => {
  it('accepts the delivered phase document', () => {
    assert.deepEqual(run(checkPredecessors), []);
  });

  it('rejects an unaccepted predecessor', () => {
    for (const line of [
      'APP3-B05 = COMPLETE — REVIEW_ACCEPTED',
      'APP3-W01B = COMPLETE — REVIEW_ACCEPTED',
      'APP3-DB01 = COMPLETE — REVIEW_ACCEPTED',
    ]) {
      const phase = file('phase').replace(`\n${line}\n`, '\n');
      assert.ok(mentions(run(checkPredecessors, { phase }), line), line);
    }
  });

  it('accepts B05A under every status line it may legitimately hold', () => {
    for (const line of B05A_STATUS_LINES) {
      const phase = file('phase').replace(/\nAPP3-B05A = [^\n]*\n/, `\n${line}\n`);
      assert.ok(!mentions(run(checkPredecessors, { phase }), 'legitimate status'), line);
    }
  });

  it('rejects a status block that drops a locked B05A property', () => {
    for (const line of [
      'APP3-B05A OPERATIONS = publicDesignTemplateAsset_get',
      'APP3-B05A WRITES = NONE',
      'APP3-B05A AUDIT = NONE',
      'APP3-B05A MIGRATION = NONE',
    ]) {
      const phase = file('phase').replace(`\n${line}\n`, '\n');
      assert.ok(mentions(run(checkPredecessors, { phase }), line), line);
    }
  });

  it('rejects a quietly closed TEMPLATE_SOURCE intake follow-up', () => {
    // B05A delivers bytes it did not create. A checkpoint that erased the
    // follow-up would be claiming an intake surface nobody reviewed.
    const phase = file('phase').replaceAll('FU-APP3-TEMPLATE-SOURCE-ASSET-INTAKE-01', 'FU-X');
    assert.ok(mentions(run(checkPredecessors, { phase }), 'intake follow-up'));
  });

  /**
   * The phase document with `APP3-S01` rewound to the world before it shipped.
   *
   * The status-line half of this rule stopped being falsifiable through the
   * phase document once S01 legitimately delivered: the gate reads that same
   * line to decide which world it is in, so writing `COMPLETE` there now
   * *defines* the delivered world rather than violating it. Recorded rather
   * than papered over — a case asserting it would be asserting a tautology.
   *
   * What still bites is the structural half, and it is the one that mattered:
   * a phase that has not delivered S01 beside a repository that has grown a
   * Storefront Studio feature anyway.
   */
  const beforeS01 = () =>
    file('phase').replace(/\nAPP3-S01 = [^\n]*\n/, '\nAPP3-S01 = READY — NOT STARTED\n');

  it('rejects a Storefront Studio feature built by a backend checkpoint', () => {
    const root = rootWith({ phase: beforeS01() });
    mkdirSync(join(root, 'apps/storefront/src/features/design-studio'), { recursive: true });
    const failures = [];
    checkPredecessors(root, (message) => failures.push(message));
    assert.ok(mentions(failures, 'design-studio'));
  });
});

describe('the published surface', () => {
  it('accepts the delivered artifact', () => {
    assert.deepEqual(run(checkSurface), []);
  });

  it('rejects a renamed operation', () => {
    const openapi = openapiWith((document) => {
      document.paths[ROUTE].get.operationId = 'publicDesignTemplate_asset';
    });
    assert.ok(mentions(run(checkSurface, { openapi }), `expected "${OPERATION_ID}"`));
  });

  it('rejects a second method on the delivery path', () => {
    const openapi = openapiWith((document) => {
      document.paths[ROUTE].delete = { operationId: 'x', responses: {} };
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'also publishes'));
  });

  it('rejects an authenticated delivery route', () => {
    const openapi = openapiWith((document) => {
      document.paths[ROUTE].get.security = [{ cookie: [] }];
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'anonymous'));
  });

  it('rejects a request body or a query rendition selector', () => {
    const withBody = openapiWith((document) => {
      document.paths[ROUTE].get.requestBody = { content: {} };
    });
    assert.ok(mentions(run(checkSurface, { openapi: withBody }), 'request body'));

    const withQuery = openapiWith((document) => {
      document.paths[ROUTE].get.parameters.push({ name: 'variant', in: 'query' });
    });
    assert.ok(mentions(run(checkSurface, { openapi: withQuery }), 'query parameter'));
  });

  it('rejects a JSON-enveloped success', () => {
    const openapi = openapiWith((document) => {
      document.paths[ROUTE].get.responses['200'].content = { 'application/json': { schema: {} } };
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'binary body'));
  });

  it('rejects a generic public asset address', () => {
    for (const route of [
      '/api/public/assets/{assetId}',
      '/api/public/design-template-assets/{assetId}',
      '/api/public/design-sessions/{sessionId}/assets/{assetId}',
    ]) {
      const openapi = openapiWith((document) => {
        document.paths[route] = { get: { operationId: 'x', responses: {} } };
      });
      assert.ok(mentions(run(checkSurface, { openapi }), route), route);
    }
  });

  it('leaves the accepted Admin asset operations alone', () => {
    // The ban is about *public* generic access. `APP2` publishes authenticated
    // Admin asset routes by id, and a rule that caught them would be refusing an
    // accepted checkpoint.
    assert.ok(!mentions(run(checkSurface), '/api/admin/assets'));
  });

  it('rejects a surface that moved without a checkpoint recording it', () => {
    const openapi = openapiWith((document) => {
      document.paths['/api/public/design-templates/{slug}/preview'] = {
        get: { operationId: 'x', responses: {} },
      };
    });
    const failures = run(checkSurface, { openapi });
    assert.ok(mentions(failures, 'expected'));
  });
});

describe('the six-term authorization', () => {
  it('accepts the delivered adapter and service', () => {
    assert.deepEqual(run(checkAuthorization), []);
  });

  it('rejects a dropped durable term, one at a time', () => {
    for (const [needle, complaint] of [
      ['eq(designTemplates.status, PUBLIC_TEMPLATE_STATE)', 'PUBLISHED template'],
      ['isNull(designTemplates.archivedAt)', 'archived template'],
      ['isNotNull(designTemplateVersions.publishedAt)', 'published version'],
      ['not(this.hasNewerPublishedVersion())', 'current version'],
      ['eq(assets.kind, TEMPLATE_ARTWORK_ASSET_KIND)', 'Template artwork lane'],
      ['eq(assets.status, TEMPLATE_ARTWORK_ASSET_STATUS)', 'accepted asset'],
      ['isNull(assets.deletedAt)', 'tombstoned asset'],
      ['eq(assetDerivatives.kind, EDITOR_SAFE_DERIVATIVE_KIND)', 'NORMALIZED'],
      ['eq(assetDerivatives.status, EDITOR_SAFE_DERIVATIVE_STATE)', 'READY'],
      ['eq(assetDerivatives.isWatermarked, false)', 'watermarked derivative'],
    ]) {
      const adapter = without('adapter', needle);
      assert.ok(mentions(run(checkAuthorization, { adapter }), complaint), needle);
    }
  });

  it('rejects a dropped quartet requirement', () => {
    for (const column of ['storageKey', 'mediaType', 'widthPx', 'heightPx', 'byteSize']) {
      const adapter = without('adapter', `isNotNull(assetDerivatives.${column})`);
      assert.ok(mentions(run(checkAuthorization, { adapter }), column), column);
    }
  });

  it('rejects an unaliased newer-version self-join', () => {
    // The defect the integration proof found: without the alias PostgreSQL sees
    // one relation on both sides, the predicate degenerates to `version >
    // version`, and every historical published version stays addressable while
    // every current-version test still passes.
    const adapter = file('adapter').replace(
      "const newerVersions = alias(designTemplateVersions, 'newer_version');",
      'const newerVersions = designTemplateVersions;',
    );
    assert.ok(mentions(run(checkAuthorization, { adapter }), 'not aliased'));
  });

  it('rejects a version selected from the header counter', () => {
    const adapter = file('adapter').replace(
      'eq(designTemplateVersions.version, lookup.version)',
      'eq(designTemplateVersions.version, designTemplates.currentVersion)',
    );
    assert.ok(mentions(run(checkAuthorization, { adapter }), 'header counter'));
  });

  it('rejects storage opened before the document or the eligibility proof', () => {
    const service = file('service').replace(
      /const candidate = await this\.candidates[\s\S]*?const result = await this\.openObject\(candidate\.storageKey, signal\);/,
      [
        'const candidate = await this.candidates.findDeliverableCandidate(lookup);',
        'if (candidate === undefined) throw publicDesignTemplateAssetNotFound();',
        'const result = await this.openObject(candidate.storageKey, signal);',
        'if (!publishedDocumentPlacesAsset(candidate.document, lookup.assetId)) {',
        '  throw publicDesignTemplateAssetNotFound();',
        '}',
        'if (!(await this.stillPubliclyDesignable(candidate))) {',
        '  throw publicDesignTemplateAssetNotFound();',
        '}',
      ].join('\n'),
    );
    const failures = run(checkAuthorization, { service });
    assert.ok(mentions(failures, 'opened before the document proof'));
    assert.ok(mentions(failures, 'opened before the eligibility proof'));
  });

  it('rejects a dropped Catalog eligibility call', () => {
    const service = file('service').replaceAll('findPublicPlacementScope', 'noopScope');
    assert.ok(mentions(run(checkAuthorization, { service }), 're-ask Catalog'));
  });

  it('rejects a re-derived Catalog predicate', () => {
    const service = file('service').replace(
      'return scope !== undefined;',
      "return scope !== undefined && products.status === 'PUBLISHED';",
    );
    assert.ok(mentions(run(checkAuthorization, { service }), 're-derives'));
  });
});

describe('document membership', () => {
  it('accepts the delivered proof', () => {
    assert.deepEqual(run(checkDocumentMembership), []);
  });

  it('rejects a membership decided outside APP3-P01', () => {
    const membership = file('membership').replaceAll(
      'validateDesignDocumentStructure',
      'JSON.parse',
    );
    assert.ok(mentions(run(checkDocumentMembership, { membership }), 'APP3-P01'));
  });

  it('rejects a document that is read around rather than failing closed', () => {
    const membership = file('membership').replace('if (!parsed.ok) return false;', '');
    assert.ok(mentions(run(checkDocumentMembership, { membership }), 'fail closed'));
  });

  it('rejects membership taken from any element type', () => {
    const membership = file('membership').replace(
      "(element) => element.type === 'image' && element.assetId === assetId,",
      '(element) => element.assetId === assetId,',
    );
    assert.ok(mentions(run(checkDocumentMembership, { membership }), 'image element'));
  });

  it('rejects authorization from the pre-validation reference reader', () => {
    const membership = `${file('membership')}\nexport const x = assetIdsIn;\n`;
    assert.ok(mentions(run(checkDocumentMembership, { membership }), 'pre-validation'));
  });

  it('rejects membership inferred from the durable association', () => {
    const membership = file('membership').replace(
      'return parsed.value.elements.some(',
      'if (designTemplateAssets) return true;\n  return parsed.value.elements.some(',
    );
    assert.ok(mentions(run(checkDocumentMembership, { membership }), 'designTemplateAssets'));
  });
});

describe('what may be delivered', () => {
  it('accepts the delivered policy', () => {
    assert.deepEqual(run(checkDeliverable), []);
  });

  it('rejects a widened deliverable list', () => {
    const policy = file('policy').replace(
      "['image/webp', 'image/svg+xml'] as const",
      "['image/webp', 'image/svg+xml', 'image/png'] as const",
    );
    assert.ok(mentions(run(checkDeliverable, { policy }), 'deliverable media types'));
  });

  it('rejects a bucket other than the private derivatives one', () => {
    const policy = file('policy').replace(
      "PUBLIC_TEMPLATE_ASSET_BUCKET = 'DERIVATIVES'",
      "PUBLIC_TEMPLATE_ASSET_BUCKET = 'ORIGINALS'",
    );
    assert.ok(mentions(run(checkDeliverable, { policy }), 'derivatives bucket'));
  });

  it('rejects any other artifact kind becoming nameable', () => {
    for (const kind of ['ORIGINAL', 'THUMBNAIL', 'PREVIEW_WATERMARKED', 'MOCKUP']) {
      const policy = `${file('policy')}\nexport const FALLBACK = '${kind}' as const;\n`;
      assert.ok(mentions(run(checkDeliverable, { policy }), kind), kind);
    }
  });

  it('rejects re-sanitization on the read path', () => {
    const service = file('service').replace(
      'return {\n      body: result.body,',
      'return {\n      body: sanitize(result.body),',
    );
    assert.ok(mentions(run(checkDeliverable, { service }), 're-sanitizes'));
  });
});

describe('streaming and transport', () => {
  it('accepts the delivered service and controller', () => {
    assert.deepEqual(run(checkStreaming), []);
    assert.deepEqual(run(checkHeaders), []);
  });

  it('rejects a dropped size reconciliation', () => {
    const service = file('service').replace(
      'providerSize !== candidate.byteSize',
      'providerSize < 0',
    );
    assert.ok(mentions(run(checkStreaming, { service }), 'reconcile'));
  });

  it('rejects a refusal that leaves the stream draining', () => {
    const service = file('service').replace('result.body.destroy();', '');
    assert.ok(mentions(run(checkStreaming, { service }), 'destroy'));
  });

  it('rejects a presigned URL or a transaction around the stream', () => {
    for (const [needle, injected] of [
      ['presign', 'const url = presign(candidate.storageKey);'],
      ['runInTransaction', 'await this.transactions.runInTransaction(async () => undefined);'],
    ]) {
      const service = file('service').replace(
        'const result = await this.openObject(',
        `${injected}\n    const result = await this.openObject(`,
      );
      assert.ok(mentions(run(checkStreaming, { service }), needle), needle);
    }
  });

  it('rejects a cacheable or revalidatable response', () => {
    const policy = file('policy').replace(
      "PUBLIC_TEMPLATE_ASSET_CACHE_CONTROL = 'no-store'",
      "PUBLIC_TEMPLATE_ASSET_CACHE_CONTROL = 'public, max-age=3600'",
    );
    assert.ok(mentions(run(checkHeaders, { policy }), 'no-store'));

    for (const header of ['ETag', 'Accept-Ranges', 'filename']) {
      const controller = file('controller').replace(
        "response.setHeader('Cache-Control'",
        `response.setHeader('${header}', 'x');\n    response.setHeader('Cache-Control'`,
      );
      assert.ok(mentions(run(checkHeaders, { controller }), header), header);
    }
  });
});

describe('non-disclosure and read-only', () => {
  it('accepts the delivered vocabulary and module', () => {
    assert.deepEqual(run(checkNonDisclosure), []);
    assert.deepEqual(run(checkReadOnly), []);
  });

  it('rejects a fourth error code', () => {
    const errors = file('errors').replace(
      "'PUBLIC_DESIGN_TEMPLATE_ASSET_UNAVAILABLE',",
      "'PUBLIC_DESIGN_TEMPLATE_ASSET_UNAVAILABLE',\n  'PUBLIC_DESIGN_TEMPLATE_ASSET_NOT_PUBLISHED',",
    );
    assert.ok(mentions(run(checkNonDisclosure, { errors }), 'expected 3'));
  });

  it('rejects an interpolated caller-facing message', () => {
    const errors = file('errors').replace(
      "PUBLIC_DESIGN_TEMPLATE_ASSET_NOT_FOUND: 'That design template asset is not available.',",
      'PUBLIC_DESIGN_TEMPLATE_ASSET_NOT_FOUND: `No asset ${assetId} here.`,',
    );
    assert.ok(mentions(run(checkNonDisclosure, { errors }), 'interpolated'));
  });

  it('rejects a storage contradiction reported as not-found', () => {
    const errors = file('errors').replaceAll('ServiceUnavailableException', 'NotFoundException');
    assert.ok(mentions(run(checkNonDisclosure, { errors }), '503'));
  });

  it('rejects a write reaching the read path', () => {
    for (const [key, injected, needle] of [
      ['adapter', 'await this.db.insert(designTemplates);', '.insert('],
      ['service', 'this.audit = new AuditRecorder();', 'AuditRecorder'],
      ['service', 'await this.outbox.appendEvent({});', 'appendEvent'],
    ]) {
      const source = `${file(key)}\n// ${injected}\nconst leak = () => { ${injected} };\n`;
      assert.ok(mentions(run(checkReadOnly, { [key]: source }), needle), needle);
    }
  });

  it('rejects a module that binds a write-capable token', () => {
    const module = file('module').replace(
      'imports: [DatabaseModule',
      'imports: [AuditModule, DatabaseModule',
    );
    assert.ok(mentions(run(checkReadOnly, { module }), 'AuditModule'));
  });

  it('rejects a module that drops the read port or the placement seam', () => {
    for (const token of ['PUBLIC_DESIGN_TEMPLATE_ASSET_REPOSITORY', 'CatalogPlacementReadModule']) {
      const module = file('module').replaceAll(token, 'Something');
      assert.ok(mentions(run(checkReadOnly, { module }), token), token);
    }
  });
});

describe('boundaries', () => {
  it('accepts the delivered repository', () => {
    assert.deepEqual(run(checkBoundaries), []);
  });

  it('rejects a migration or a new root script', () => {
    const root = rootWith();
    writeFileSync(join(root, 'packages/database/migrations/0035_new.sql'), '');
    const failures = [];
    checkBoundaries(root, (message) => failures.push(message));
    assert.ok(mentions(failures, 'migrations'));

    const rootPackage = JSON.parse(file('rootPackage'));
    rootPackage.scripts['check:app3-b05a'] = 'node tools/check-app3-b05a.mjs';
    assert.ok(
      mentions(run(checkBoundaries, { rootPackage: JSON.stringify(rootPackage) }), 'root scripts'),
    );
  });

  it('rejects source that reaches a worker, a frontend or a design file', () => {
    for (const reach of ['apps/worker', 'apps/admin', 'apps/storefront']) {
      const service = `${file('service')}\n// import x from '${reach}/x';\n`;
      assert.ok(mentions(run(checkBoundaries, { service }), reach), reach);
    }
  });

  it('rejects an unindexed scoped command', () => {
    for (const command of ['CMD-CHECK-APP3-B05A', 'CMD-TEST-APP3-B05A-INTEGRATION']) {
      const index = file('index').replaceAll(command, 'CMD-REMOVED');
      assert.ok(mentions(run(checkBoundaries, { index }), command), command);
    }
  });

  it('rejects a missing owned source or spec file', () => {
    const root = rootWith();
    rmSync(join(root, CANONICAL_FILES.liveSpec));
    const failures = [];
    checkBoundaries(root, (message) => failures.push(message));
    assert.ok(mentions(failures, CANONICAL_FILES.liveSpec));
  });
});

describe('the whole gate against the real repository', () => {
  it('passes', () => {
    assert.deepEqual(checkApp3B05A(REPO_ROOT), []);
  });
});
