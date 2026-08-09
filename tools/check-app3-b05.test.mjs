/**
 * Regressions for the `APP3-B05` gate.
 *
 * Each case breaks exactly one ruled property in a throwaway copy of the
 * repository and proves the checker refuses it. The ones worth reading twice are
 * the mutations that leave a *working system*: a version selected by the
 * header's counter instead of its publication stamp — indistinguishable from
 * correct in every state the delivered lifecycle can reach — a scope predicate
 * reduced from three columns to two, an eligibility check dropped so a withdrawn
 * Product keeps serving, a 404 that grows a reason, and a read that quietly
 * acquired a write.
 *
 * The sub-checks run against a temp root; the whole gate is proved once against
 * the real repository in the last block.
 */
import { strict as assert } from 'node:assert';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  APP3_SURFACE_TOOL_FILES,
  acceptedPublicTemplatePaths,
  acceptedSurface,
} from './app3-accepted-surface.mjs';
import {
  CANONICAL_FILES,
  OPERATIONS,
  REPO_ROOT,
  checkApp3B05,
  checkBoundaries,
  checkCompatibility,
  checkEligibility,
  checkNonDisclosure,
  checkPredecessors,
  checkProjection,
  checkReadOnly,
  checkSurface,
  checkVisibility,
  read,
} from './check-app3-b05.mjs';

const temporaries = [];
after(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

const file = (key) => read(REPO_ROOT, key) ?? '';
const mentions = (failures, needle) => failures.some((f) => f.includes(needle));

let base;
function baseRoot() {
  if (base !== undefined) return base;
  base = mkdtempSync(join(tmpdir(), 'app3-b05-'));
  temporaries.push(base);
  const extras = ['tools/check-app3-b05.mjs', ...APP3_SURFACE_TOOL_FILES];
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
  const root = mkdtempSync(join(tmpdir(), 'app3-b05-case-'));
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

const LIST = '/api/public/design-templates';
const DETAIL = '/api/public/design-templates/{slug}';

/* -------------------------------------------------------------------------- */

describe('the accepted surface authority', () => {
  it('reports the B05 surface when B05 is the frontier', () => {
    const phase = ['# phase', '', '```text', 'APP3-B05 = COMPLETE — REVIEW_DELIVERED', '```'].join(
      '\n',
    );
    const surface = acceptedSurface(rootWith({ phase }));
    assert.equal(surface.paths, 31);
    assert.equal(surface.operations, 36);
    assert.equal(surface.schemas, 81);
  });

  it('keeps B04 frozen at its own world', () => {
    const phase = ['# phase', '', '```text', 'APP3-B04 = COMPLETE — REVIEW_ACCEPTED', '```'].join(
      '\n',
    );
    const surface = acceptedSurface(rootWith({ phase }));
    assert.equal(surface.paths, 29);
    assert.equal(surface.operations, 34);
    assert.equal(surface.schemas, 76);
  });

  it('admits the public Template paths only once B05 is recorded', () => {
    const before = ['# phase', '', '```text', 'APP3-B04 = COMPLETE', '```'].join('\n');
    const after_ = ['# phase', '', '```text', 'APP3-B05 = COMPLETE', '```'].join('\n');
    assert.deepEqual(acceptedPublicTemplatePaths(rootWith({ phase: before })), []);
    assert.deepEqual(acceptedPublicTemplatePaths(rootWith({ phase: after_ })), [LIST, DETAIL]);
  });
});

describe('predecessors', () => {
  it('accepts the delivered phase document', () => {
    assert.deepEqual(run(checkPredecessors), []);
  });

  it('rejects an unaccepted predecessor', () => {
    const phase = file('phase').replace(
      '\nAPP3-B04 = COMPLETE — REVIEW_ACCEPTED\n',
      '\nAPP3-B04 = COMPLETE — REVIEW_DELIVERED\n',
    );
    assert.ok(mentions(run(checkPredecessors, { phase }), 'APP3-B04 = COMPLETE — REVIEW_ACCEPTED'));
  });

  it('rejects a status block that drops a locked B05 property', () => {
    for (const line of [
      'APP3-B05 COMPATIBILITY = EXACT_TRIPLE_PRODUCT_SIDE_AREA',
      'APP3-B05 VERSION_SELECTION = HIGHEST_PUBLISHED_AT_NOT_NULL',
      'APP3-B05 SCOPE_ELIGIBILITY = RE_EVALUATED_AT_READ_TIME',
      'APP3-B05 WRITES = NONE',
    ]) {
      const phase = file('phase').replace(`\n${line}\n`, '\n');
      assert.ok(mentions(run(checkPredecessors, { phase }), line), line);
    }
  });

  it('rejects a B05A that has quietly started', () => {
    const phase = file('phase').replace(
      /\nAPP3-B05A = [^\n]*\n/,
      '\nAPP3-B05A = COMPLETE — REVIEW_DELIVERED\n',
    );
    assert.ok(mentions(run(checkPredecessors, { phase }), 'unstarted successor'));
  });
});

describe('the published surface', () => {
  it('accepts the delivered artifact', () => {
    assert.deepEqual(run(checkSurface), []);
  });

  it('rejects a moved route or a renamed operation', () => {
    for (const [route, operationId] of Object.entries(OPERATIONS)) {
      const openapi = openapiWith((document) => {
        document.paths[route].get.operationId = 'publicDesignTemplate_renamed';
      });
      assert.ok(mentions(run(checkSurface, { openapi }), `expected "${operationId}"`), route);
    }
    const moved = openapiWith((document) => {
      document.paths['/api/public/templates'] = document.paths[LIST];
      delete document.paths[LIST];
    });
    assert.ok(mentions(run(checkSurface, { openapi: moved }), LIST));
  });

  it('rejects a third public Template operation', () => {
    const openapi = openapiWith((document) => {
      // `APP3-B05A`'s delivery route, arriving a checkpoint early.
      document.paths['/api/public/design-templates/{slug}/assets/{assetId}'] = {
        get: { operationId: 'publicDesignTemplate_asset', responses: {} },
      };
    });
    const failures = run(checkSurface, { openapi });
    assert.ok(mentions(failures, 'expected 2'));
    assert.ok(mentions(failures, 'is not an APP3-B05 operation'));
  });

  it('rejects a write method appearing on a public read path', () => {
    const openapi = openapiWith((document) => {
      document.paths[DETAIL].post = { operationId: 'publicDesignTemplate_clone', responses: {} };
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'also publishes post'));
  });

  it('rejects an authenticated public read', () => {
    const openapi = openapiWith((document) => {
      document.paths[LIST].get.security = [{ sessionCookie: [] }];
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'B05 is anonymous'));
  });

  it('rejects a surface count that no accepted checkpoint explains', () => {
    // The expected counts come from the shared authority, not from literals.
    // `31`/`81` were the accepted world the day B05 shipped and stopped being it
    // when B02A, B03B and B04A each legitimately published an operation — the
    // regression would then fail on the *number* rather than on the property it
    // exists to prove, which is that a drifted count is caught at all.
    const world = acceptedSurface(REPO_ROOT);
    for (const [mutate, needle] of [
      [(d) => delete d.paths[DETAIL], `paths, expected ${String(world.paths)}`],
      [
        (d) => (d.components.schemas['Extra'] = { type: 'object' }),
        `schemas, expected ${String(world.schemas)}`,
      ],
    ]) {
      assert.ok(mentions(run(checkSurface, { openapi: openapiWith(mutate) }), needle), needle);
    }
  });

  it('rejects a detail that restates the Design Document', () => {
    const openapi = openapiWith((document) => {
      document.components.schemas['PublicDesignTemplateDetailResponse'].properties.document = {
        type: 'object',
        additionalProperties: true,
      };
    });
    assert.ok(mentions(run(checkSurface, { openapi }), 'does not reuse the P01 DesignDocument'));
  });

  it('rejects a generated client type that lost its shape', () => {
    const clientSchemas = file('clientSchemas').replace(
      /export type PublicDesignTemplateDetail200 = [^;]+;/,
      'export type PublicDesignTemplateDetail200 = unknown;',
    );
    assert.ok(mentions(run(checkSurface, { clientSchemas }), 'PublicDesignTemplateDetail200'));
  });
});

describe('the compatibility triple', () => {
  it('accepts the delivered contract', () => {
    assert.deepEqual(run(checkCompatibility), []);
  });

  it('rejects any scope id becoming optional', () => {
    for (const column of ['productId', 'productSideId', 'embroideryAreaId']) {
      const request = file('request').replace(
        `${column}: scopeIdSchema,`,
        `${column}: scopeIdSchema.optional(),`,
      );
      assert.ok(mentions(run(checkCompatibility, { request }), column), column);
    }
  });

  it('rejects a scope column dropped from the SQL predicate', () => {
    for (const column of ['productId', 'productSideId', 'embroideryAreaId']) {
      const adapter = file('adapter').replace(
        `eq(designTemplates.${column}, input.scope.${column}),`,
        '',
      );
      assert.ok(
        mentions(run(checkCompatibility, { adapter }), `does not match ${column} by equality`),
        column,
      );
    }
  });

  it('rejects a null-tolerant scope predicate that admits unscoped rows', () => {
    const adapter = file('adapter').replace(
      'eq(designTemplates.embroideryAreaId, input.scope.embroideryAreaId),',
      'or(eq(designTemplates.embroideryAreaId, input.scope.embroideryAreaId), isNull(designTemplates.embroideryAreaId)),',
    );
    assert.ok(mentions(run(checkCompatibility, { adapter }), 'admits an unscoped template'));
  });

  it('rejects a list query that grows a forbidden dimension', () => {
    for (const [field, needle] of [
      ['status: z.string().optional(),', 'a lifecycle selector'],
      ['offset: z.coerce.number().optional(),', 'offset paging'],
      ['search: z.string().optional(),', 'free-text search'],
      ['sort: z.string().optional(),', 'a sort selector'],
    ]) {
      const request = file('request').replace(
        '    productId: scopeIdSchema,',
        `    ${field}\n    productId: scopeIdSchema,`,
      );
      assert.ok(mentions(run(checkCompatibility, { request }), needle), needle);
    }
  });

  it('rejects a list query that stopped refusing unknown parameters', () => {
    const request = file('request').replace(
      '    limit: z.coerce.number().int().min(1).max(PUBLIC_DESIGN_TEMPLATE_MAX_PAGE_SIZE).optional(),\n  })\n  .strict();',
      '    limit: z.coerce.number().int().min(1).max(PUBLIC_DESIGN_TEMPLATE_MAX_PAGE_SIZE).optional(),\n  });',
    );
    assert.ok(mentions(run(checkCompatibility, { request }), 'unknown parameters'));
  });

  it('rejects a scope parameter published as optional', () => {
    const openapi = openapiWith((document) => {
      for (const parameter of document.paths[LIST].get.parameters) {
        if (parameter.name === 'productSideId') parameter.required = false;
      }
    });
    assert.ok(mentions(run(checkCompatibility, { openapi }), 'required parameter'));
  });
});

describe('visibility and published-version selection', () => {
  it('accepts the delivered read', () => {
    assert.deepEqual(run(checkVisibility), []);
  });

  it('rejects a read that stops constraining the header to PUBLISHED', () => {
    const adapter = file('adapter').replace(
      'eq(designTemplates.status, PUBLIC_TEMPLATE_STATE),\n            this.hasPublishedVersion(),',
      'this.hasPublishedVersion(),',
    );
    assert.ok(mentions(run(checkVisibility, { adapter }), 'constrain the header to PUBLISHED'));
  });

  it('rejects a read that admits DRAFT or ARCHIVED', () => {
    const adapter = file('adapter').replace(
      "const PUBLIC_TEMPLATE_STATE = 'PUBLISHED' as const;",
      "const PUBLIC_TEMPLATE_STATE = 'PUBLISHED' as const;\nconst LEAK = eq(designTemplates.status, 'ARCHIVED');",
    );
    assert.ok(mentions(run(checkVisibility, { adapter }), "admits 'ARCHIVED'"));
  });

  it('rejects selecting the version by the header counter', () => {
    // The mutation that leaves a working system: `current_version` and the
    // highest published version agree in every state the lifecycle can reach.
    const adapter = file('adapter').replace(
      'isNotNull(designTemplateVersions.publishedAt),\n        ),\n      )\n      .orderBy(designTemplateVersions.designTemplateId, desc(designTemplateVersions.version));',
      'eq(designTemplateVersions.version, designTemplates.currentVersion),\n        ),\n      )\n      .orderBy(designTemplateVersions.designTemplateId, desc(designTemplateVersions.version));',
    );
    assert.ok(mentions(run(checkVisibility, { adapter }), "header's current_version"));
  });

  it('rejects dropping the published_at predicate entirely', () => {
    const adapter = file('adapter').replaceAll(
      'isNotNull(designTemplateVersions.publishedAt),',
      '',
    );
    assert.ok(mentions(run(checkVisibility, { adapter }), 'selected by published_at'));
  });

  it('rejects losing the descending version order', () => {
    const adapter = file('adapter').replace(
      'desc(designTemplateVersions.version)',
      'designTemplateVersions.version',
    );
    assert.ok(mentions(run(checkVisibility, { adapter }), 'version descending'));
  });

  it('rejects showing a PUBLISHED header that holds no published version', () => {
    const adapter = file('adapter').replace(
      '            this.hasPublishedVersion(),\n          ),\n        )\n        .limit(1);',
      '          ),\n        )\n        .limit(1);',
    );
    assert.ok(mentions(run(checkVisibility, { adapter }), 'require a published version'));
  });

  it('rejects picking the version row per template in JavaScript', () => {
    const adapter = file('adapter').replace('.selectDistinctOn(', '.select(');
    assert.ok(mentions(run(checkVisibility, { adapter }), 'one version per template'));
  });
});

describe('current scope eligibility', () => {
  it('accepts the delivered resolution', () => {
    assert.deepEqual(run(checkEligibility), []);
  });

  it('rejects removing the port seam', () => {
    const catalogPort = file('catalogPort').replace(/findPublicPlacementScope\(/g, 'unused(');
    assert.ok(mentions(run(checkEligibility, { catalogPort }), 'no public placement-scope seam'));
  });

  it('rejects a detail read that stops re-evaluating eligibility', () => {
    const query = file('query').replace(/eligibleScope\(/g, 'skipped(');
    assert.ok(mentions(run(checkEligibility, { query }), 're-evaluate scope eligibility'));
  });

  it('rejects each eligibility predicate dropped from the scope read', () => {
    // The mutation is applied **inside `findPublicPlacementScope` alone**.
    // `findPublicPlacement` carries `isNull(embroideryAreas.retiredAt)` and
    // `isNull(categories.archivedAt)` too, earlier in the same file, so a plain
    // `replace` would delete APP2's predicate and leave this rule's subject
    // standing — which is exactly why the checker reads the one method body.
    const mutateScopeRead = (fragment) => {
      const source = file('catalogAdapter');
      const body = /async findPublicPlacementScope\(([\s\S]*?)\n  }\n/.exec(source);
      assert.ok(body !== null, 'the scope read is identifiable in the real adapter');
      assert.ok(body[0].includes(fragment), `the scope read contains "${fragment}"`);
      return source.replace(body[0], body[0].replace(fragment, ''));
    };

    for (const [fragment, needle] of [
      ['isNull(embroideryAreas.retiredAt),', 'admits a retired Area'],
      ['isNull(productSides.retiredAt),', 'admits a retired Side'],
      ['isNull(categories.archivedAt),', 'admits an archived category'],
      [
        '.innerJoin(productSides, eq(productSides.id, embroideryAreas.productSideId))',
        'bind the Area to the Side',
      ],
      [
        '.innerJoin(products, eq(products.id, productSides.productId))',
        'bind the Side to the Product',
      ],
    ]) {
      const catalogAdapter = mutateScopeRead(fragment);
      assert.ok(mentions(run(checkEligibility, { catalogAdapter }), needle), needle);
    }
  });

  it('rejects dropping the Product publication predicate', () => {
    const catalogAdapter = file('catalogAdapter').replaceAll(
      'PRODUCT_PUBLISHED_STATE',
      'ANY_STATE',
    );
    assert.ok(mentions(run(checkEligibility, { catalogAdapter }), 'PRODUCT_PUBLISHED_STATE'));
  });

  it('rejects Design restating Catalog’s publication predicate', () => {
    const adapter = `${file('adapter')}\nconst copy = PRODUCT_PUBLISHED_STATE;\n`;
    assert.ok(mentions(run(checkEligibility, { adapter }), 'restates'));
  });
});

describe('safe non-disclosure', () => {
  it('accepts the delivered vocabulary', () => {
    assert.deepEqual(run(checkNonDisclosure), []);
  });

  it('rejects a third error code that names a reason', () => {
    const errors = file('errors').replace(
      "  'PUBLIC_DESIGN_TEMPLATE_CURSOR_INVALID',\n] as const;",
      "  'PUBLIC_DESIGN_TEMPLATE_CURSOR_INVALID',\n  'PUBLIC_DESIGN_TEMPLATE_ARCHIVED',\n] as const;",
    );
    const failures = run(checkNonDisclosure, { errors });
    assert.ok(mentions(failures, 'expected 2'));
    assert.ok(mentions(failures, 'ARCHIVED'));
  });

  it('rejects a message that interpolates the caller’s slug', () => {
    const errors = file('errors').replace(
      "'That design template is not available.',",
      '`No template at ${slug}.`,',
    );
    assert.ok(mentions(run(checkNonDisclosure, { errors }), 'interpolates'));
  });

  it('rejects a detail read that answers only one hidden state', () => {
    const query = file('query').replace(
      'if (scope === undefined || (await this.eligibleScope(scope)) === undefined) {\n      throw publicDesignTemplateNotFound();\n    }',
      '',
    );
    assert.ok(mentions(run(checkNonDisclosure, { query }), 'every hidden state alike'));
  });

  it('rejects a cursor that stops binding the scope', () => {
    for (const column of ['productId', 'productSideId', 'embroideryAreaId']) {
      const cursor = file('cursor').replace(`${column} !== scope.${column}`, 'false');
      assert.ok(mentions(run(checkNonDisclosure, { cursor }), `bind ${column}`), column);
    }
  });

  it('rejects a malformed cursor silently restarting the sequence', () => {
    const cursor = file('cursor').replaceAll(
      'throw publicDesignTemplateCursorInvalid();',
      'return undefined;',
    );
    assert.ok(mentions(run(checkNonDisclosure, { cursor }), 'silently restarts'));
  });
});

describe('the read-only guarantee', () => {
  it('accepts the delivered read path', () => {
    assert.deepEqual(run(checkReadOnly), []);
  });

  it('rejects a write appearing anywhere in the read path', () => {
    for (const key of ['adapter', 'query', 'controller']) {
      const mutated = `${file(key)}\nasync function touch(db) { await db.update(x).set({}); }\n`;
      assert.ok(mentions(run(checkReadOnly, { [key]: mutated }), 'writes'), key);
    }
  });

  it('rejects an audit or outbox append', () => {
    const query = file('query').replace(
      'return toPublicDetailView(row);',
      'await this.audit.recordRead(row);\n    return toPublicDetailView(row);',
    );
    assert.ok(mentions(run(checkReadOnly, { query }), 'audit row'));
  });

  it('rejects the port growing a write', () => {
    const port = file('port').replace(
      '  findPublishedBySlug(slug: string): Promise<PublishedDesignTemplate | undefined>;',
      '  findPublishedBySlug(slug: string): Promise<PublishedDesignTemplate | undefined>;\n\n  touchViewCount(id: string): Promise<void>;',
    );
    assert.ok(mentions(run(checkReadOnly, { port }), 'touchViewCount'));
  });

  it('rejects binding the write-bearing Template port into the public module', () => {
    const module = file('module').replace(
      '      provide: PUBLISHED_DESIGN_TEMPLATE_REPOSITORY,',
      '      provide: DESIGN_TEMPLATE_REPOSITORY,',
    );
    const failures = run(checkReadOnly, { module });
    assert.ok(mentions(failures, 'write-bearing Template port'));
    assert.ok(mentions(failures, 'does not bind the read-only Template port'));
  });

  it('rejects an auth dependency composed into an anonymous read', () => {
    const module = file('module').replace(
      'imports: [DatabaseModule, CatalogPlacementReadModule],',
      'imports: [DatabaseModule, CatalogPlacementReadModule, IdentityModule],',
    );
    assert.ok(mentions(run(checkReadOnly, { module }), 'IdentityModule'));
  });

  it('rejects losing the placement port', () => {
    const module = file('module').replace('CatalogPlacementReadModule]', ']');
    assert.ok(mentions(run(checkReadOnly, { module }), 'controller-free port'));
  });

  it('rejects a guard or a write method on the controller', () => {
    const guarded = file('controller').replace(
      '  @Get()',
      '  @UseGuards(DesignSessionGuard)\n  @Get()',
    );
    assert.ok(mentions(run(checkReadOnly, { controller: guarded }), 'must be anonymous'));

    const written = file('controller').replace('  @Get()', '  @Post()\n  @Get()');
    assert.ok(mentions(run(checkReadOnly, { controller: written }), 'write method'));
  });

  it('rejects a storable cache policy on a revocable resource', () => {
    const policy = file('policy').replace(
      "PUBLIC_DESIGN_TEMPLATE_CACHE_CONTROL = 'no-store'",
      "PUBLIC_DESIGN_TEMPLATE_CACHE_CONTROL = 'public, max-age=3600, immutable'",
    );
    assert.ok(mentions(run(checkReadOnly, { policy }), 'no-store'));

    const controller = file('controller').replace(
      "  @Header('Cache-Control', PUBLIC_DESIGN_TEMPLATE_CACHE_CONTROL)\n  @ApiSuccessCode('PUBLIC_DESIGN_TEMPLATE_DETAIL_READ'",
      "  @ApiSuccessCode('PUBLIC_DESIGN_TEMPLATE_DETAIL_READ'",
    );
    assert.ok(mentions(run(checkReadOnly, { controller }), 'cache headers, expected 2'));
  });
});

describe('the projection', () => {
  it('accepts the delivered shape', () => {
    assert.deepEqual(run(checkProjection), []);
  });

  it('rejects a private field reaching the wire', () => {
    for (const leak of ['previewDerivativeId', 'storageKey', 'archivedAt']) {
      const projection = file('projection').replace(
        '  readonly scope: PublicTemplateScopeView;',
        `  readonly ${leak}: string;\n  readonly scope: PublicTemplateScopeView;`,
      );
      assert.ok(mentions(run(checkProjection, { projection }), leak), leak);
    }
  });

  it('rejects publishing the internal template id', () => {
    const projection = file('projection').replace(
      '  readonly slug: string;\n  readonly name: string;',
      '  readonly templateId: string;\n  readonly slug: string;\n  readonly name: string;',
    );
    assert.ok(mentions(run(checkProjection, { projection }), 'internal template id'));
  });

  it('rejects a list page that carries a Design Document', () => {
    const projection = file('projection').replace(
      '  readonly publishedVersion: PublicTemplateVersionView;\n}',
      '  readonly publishedVersion: PublicTemplateVersionView;\n  readonly document: unknown;\n}',
    );
    assert.ok(mentions(run(checkProjection, { projection }), 'carries a Design Document'));
  });

  it('rejects a response that stops reusing the generated component', () => {
    const response = file('response').replaceAll('PUBLISHED_SCHEMA_MARKER', 'UNUSED_MARKER');
    assert.ok(mentions(run(checkProjection, { response }), 'generated DesignDocument component'));
  });
});

describe('boundaries', () => {
  it('accepts the delivered repository', () => {
    assert.deepEqual(run(checkBoundaries), []);
  });

  it('rejects a migration or a root script this checkpoint may not add', () => {
    const root = rootWith();
    writeFileSync(join(root, 'packages/database/migrations/0034_extra.sql'), '');
    const failures = [];
    checkBoundaries(root, (message) => failures.push(message));
    assert.ok(mentions(failures, '35 migrations'));

    const rootPackage = JSON.parse(file('rootPackage'));
    rootPackage.scripts['check:app3-b05'] = 'node tools/check-app3-b05.mjs';
    assert.ok(
      mentions(
        run(checkBoundaries, { rootPackage: JSON.stringify(rootPackage) }),
        '31 root scripts',
      ),
    );
  });

  it('rejects a missing canonical file', () => {
    for (const key of ['unitSpec', 'liveSpec', 'port']) {
      const root = rootWith();
      rmSync(join(root, CANONICAL_FILES[key]), { force: true });
      const failures = [];
      checkBoundaries(root, (message) => failures.push(message));
      assert.ok(mentions(failures, CANONICAL_FILES[key]), key);
    }
  });

  it('rejects a command index that does not index this checkpoint', () => {
    const index = file('index').replaceAll('CMD-TEST-APP3-B05-INTEGRATION', 'CMD-REMOVED');
    assert.ok(mentions(run(checkBoundaries, { index }), 'CMD-TEST-APP3-B05-INTEGRATION'));
  });
});

describe('the whole gate against the real repository', () => {
  it('passes', () => {
    assert.deepEqual(checkApp3B05(REPO_ROOT), []);
  });
});
