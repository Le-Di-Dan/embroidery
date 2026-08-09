/**
 * The one-time initial Design Template scope assignment (`APP3-B03B`).
 *
 * Docker-free, so every collaborator is a double and what is proved is the
 * *decision*: what the compare-and-set is asked for, which Audit row is written,
 * and — the part that matters most here — everything this operation must not
 * produce. The SQL predicate and the race are proved live in
 * `tests/integration/design-template-scope-assign.integration.spec.ts`.
 *
 * The cases worth reading twice are the absences. A version row, a document, an
 * Asset association and a normalization event are each asserted **by omission**:
 * the repository double carries the methods that would create them, and the test
 * proves they were never called. A rule that says "we do not do X" is only
 * proved by offering X and watching it stay untouched.
 */
import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { persistenceError } from '@embroidery/database';

import { resolveArtifactPath } from '../../openapi/openapi-artifact';
import { zodSchemaOf } from '../../platform/validation/zod-dto';
import { AssignTemplateScopeUseCase } from './application/assign-template-scope.use-case';
import type { DesignTemplateAuditRecorder } from './application/design-template-audit.recorder';
import type { DesignTemplateScopeAuthority } from './application/design-template-scope.authority';
import { AssignDesignTemplateScopeBody } from './presentation/schemas/admin-design-template.request';
import { designTemplateDraftError } from './domain/design-template-draft.errors';
import type {
  AssignDesignTemplateScopeInput,
  DesignTemplate,
  DesignTemplateId,
  DesignTemplateRepository,
} from './domain/repositories/design-template.repository';

/**
 * Comments are stripped before any source rule runs.
 *
 * Without this, a file that *documents* what it deliberately avoids fails the
 * rule asserting it avoids it: this use case explains at length that it applies
 * no publication predicate, and the word `PUBLISHED` in that sentence is enough
 * to satisfy a naive scan. The same trap cost `APP3-A03` a gate rule.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const read = (relative: string) => stripComments(readFileSync(join(__dirname, relative), 'utf8'));

const CONTROLLER_SOURCE = read('presentation/admin-design-template.controller.ts');
const USE_CASE_SOURCE = read('application/assign-template-scope.use-case.ts');
const REPOSITORY_SOURCE = read('infrastructure/persistence/drizzle-design-template.repository.ts');

const TEMPLATE_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f60b1';
const PRODUCT_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f60b2';
const SIDE_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f60b3';
const AREA_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f60b4';
const ROUTE = '/api/admin/design-templates/{templateId}/scope';

interface OpenApiOperation {
  readonly operationId?: string;
  readonly requestBody?: { content?: Record<string, { schema?: { $ref?: string } }> };
  readonly responses?: Record<string, { description?: string }>;
}

const document = JSON.parse(readFileSync(resolveArtifactPath(__dirname), 'utf8')) as {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
};

function template(overrides: Partial<DesignTemplate> = {}): DesignTemplate {
  return {
    id: TEMPLATE_ID as DesignTemplateId,
    name: 'Mẫu chưa gán phạm vi',
    slug: 'mau-chua-gan-pham-vi',
    description: undefined,
    productId: undefined,
    productSideId: undefined,
    embroideryAreaId: undefined,
    status: 'DRAFT',
    currentVersion: 0,
    previewDerivativeId: undefined,
    archivedAt: undefined,
    createdAt: new Date('2026-08-09T10:00:00.000Z'),
    updatedAt: new Date('2026-08-09T10:00:00.000Z'),
    ...overrides,
  };
}

interface Harness {
  readonly useCase: AssignTemplateScopeUseCase;
  readonly calls: {
    assign: AssignDesignTemplateScopeInput[];
    audit: unknown[];
    saveDraftVersion: unknown[];
    ensureAssetAssociation: unknown[];
    publishVersion: unknown[];
    attachAsset: unknown[];
  };
}

/**
 * The whole use case with doubled collaborators.
 *
 * `assignInitialScope` returns the *scoped* template by default, which is what a
 * real compare-and-set that matched would return. Tests that need a refusal
 * replace it with the exact `PersistenceError` the Drizzle adapter raises, so
 * the translation path under test is the production one.
 */
function harness(
  options: {
    /** True when `findById` must answer "no such template". */
    readonly missing?: boolean;
    readonly existing?: DesignTemplate | undefined;
    readonly assign?: (input: AssignDesignTemplateScopeInput) => Promise<DesignTemplate>;
    readonly resolveScope?: () => Promise<unknown>;
  } = {},
): Harness {
  const calls: Harness['calls'] = {
    assign: [],
    audit: [],
    saveDraftVersion: [],
    ensureAssetAssociation: [],
    publishVersion: [],
    attachAsset: [],
  };

  const templates = {
    findById: () =>
      Promise.resolve(options.missing === true ? undefined : (options.existing ?? template())),
    assignInitialScope: (input: AssignDesignTemplateScopeInput) => {
      calls.assign.push(input);
      return options.assign === undefined
        ? Promise.resolve(
            template({
              productId: input.productId,
              productSideId: input.productSideId,
              embroideryAreaId: input.embroideryAreaId,
            }),
          )
        : options.assign(input);
    },
    // Offered so their absence is provable rather than assumed.
    saveDraftVersion: (input: unknown) => {
      calls.saveDraftVersion.push(input);
      return Promise.resolve({});
    },
    ensureAssetAssociation: (input: unknown) => {
      calls.ensureAssetAssociation.push(input);
      return Promise.resolve({ designTemplateAssetId: 'x', created: true });
    },
    publishVersion: (input: unknown) => {
      calls.publishVersion.push(input);
      return Promise.resolve({});
    },
    attachAsset: (input: unknown) => {
      calls.attachAsset.push(input);
      return Promise.resolve();
    },
    findLatestVersion: () => Promise.resolve(undefined),
  } as unknown as DesignTemplateRepository;

  const scopes = {
    resolve:
      options.resolveScope ??
      (() =>
        Promise.resolve({
          productId: PRODUCT_ID,
          productSideId: SIDE_ID,
          embroideryAreaId: AREA_ID,
        })),
  } as unknown as DesignTemplateScopeAuthority;

  const audit = {
    recordScopeAssigned: (input: unknown) => {
      calls.audit.push(input);
      return Promise.resolve();
    },
  } as unknown as DesignTemplateAuditRecorder;

  const transactions = {
    runInTransaction: <T>(work: () => Promise<T>) => work(),
  } as never;

  return {
    useCase: new AssignTemplateScopeUseCase(templates, scopes, audit, transactions),
    calls,
  };
}

/** The DTO's Zod schema, or a hard failure — never an optional the tests skip. */
function scopeBodySchema() {
  const schema = zodSchemaOf(AssignDesignTemplateScopeBody);
  if (schema === undefined) throw new Error('the DTO carries no Zod schema');
  return schema;
}

const command = {
  templateId: TEMPLATE_ID,
  productId: PRODUCT_ID,
  productSideId: SIDE_ID,
  embroideryAreaId: AREA_ID,
};

// ---------------------------------------------------------------------------
// 1–4 · The published operation and its body
// ---------------------------------------------------------------------------
describe('the published contract', () => {
  it('publishes exactly one new operation, at the canonical route', () => {
    const path = document.paths[ROUTE];
    expect(path).toBeDefined();
    expect(Object.keys(path ?? {})).toEqual(['put']);
    expect(path?.put?.operationId).toBe('adminDesignTemplate_assignScope');
  });

  it('offers no rescope, clear-scope or PATCH alias', () => {
    for (const [route, methods] of Object.entries(document.paths)) {
      if (!/design-templates/.test(route)) continue;
      expect(Object.keys(methods)).not.toContain('patch');
      expect(route).not.toMatch(/rescope|scope\/clear|unscope/);
    }
  });

  it('requires the complete triple and nothing else', () => {
    const schema = scopeBodySchema();
    expect(
      schema.safeParse({
        productId: PRODUCT_ID,
        productSideId: SIDE_ID,
        embroideryAreaId: AREA_ID,
      }).success,
    ).toBe(true);

    // No server-owned field, and no token whose only legal value is 0.
    for (const extra of [
      { status: 'DRAFT' },
      { currentVersion: 0 },
      { expectedCurrentVersion: 0 },
      { version: 1 },
      { document: {} },
      { slug: 'x' },
      { name: 'x' },
      { publishedAt: '2026-08-09T00:00:00.000Z' },
      { assetId: PRODUCT_ID },
    ]) {
      expect(
        schema.safeParse({
          productId: PRODUCT_ID,
          productSideId: SIDE_ID,
          embroideryAreaId: AREA_ID,
          ...extra,
        }).success,
      ).toBe(false);
    }
  });

  it('rejects every partial triple', () => {
    const schema = scopeBodySchema();
    for (const partial of [
      {},
      { productId: PRODUCT_ID },
      { productId: PRODUCT_ID, productSideId: SIDE_ID },
      { productSideId: SIDE_ID, embroideryAreaId: AREA_ID },
      { productId: PRODUCT_ID, embroideryAreaId: AREA_ID },
    ]) {
      expect(schema.safeParse(partial).success).toBe(false);
    }
  });

  it('is guarded as an Admin write', () => {
    expect(CONTROLLER_SOURCE).toMatch(
      /@Put\(':templateId\/scope'\)\s*\n\s*@UseGuards\(StaffOriginGuard, StaffJsonBodyGuard\)/,
    );
    expect(CONTROLLER_SOURCE).toMatch(/@UseGuards\(AuthenticatedAdminGuard\)/);
  });
});

// ---------------------------------------------------------------------------
// 5–12 · The successful assignment, and everything it must not produce
// ---------------------------------------------------------------------------
describe('assigning an unscoped zero-version DRAFT', () => {
  it('writes the exact resolved triple', async () => {
    const { useCase, calls } = harness();

    const view = await useCase.assign(command);

    expect(calls.assign).toEqual([
      {
        id: TEMPLATE_ID,
        productId: PRODUCT_ID,
        productSideId: SIDE_ID,
        embroideryAreaId: AREA_ID,
      },
    ]);
    expect(view.scope).toEqual({
      productId: PRODUCT_ID,
      productSideId: SIDE_ID,
      embroideryAreaId: AREA_ID,
    });
  });

  it('leaves the template a DRAFT', async () => {
    const { useCase } = harness();
    expect((await useCase.assign(command)).status).toBe('DRAFT');
  });

  it('answers with no current version, because none was created', async () => {
    const { useCase } = harness();
    const view = await useCase.assign(command);

    // `currentVersion` is an optional object precisely so "no version" is not
    // rendered as a version zero.
    expect(view.currentVersion).toBeUndefined();
    expect('currentVersion' in view).toBe(false);
  });

  it('carries no document', async () => {
    const { useCase } = harness();
    expect('document' in (await useCase.assign(command))).toBe(false);
  });

  it('creates no version, association, publication or attachment', async () => {
    const { useCase, calls } = harness();

    await useCase.assign(command);

    expect(calls.saveDraftVersion).toEqual([]);
    expect(calls.ensureAssetAssociation).toEqual([]);
    expect(calls.publishVersion).toEqual([]);
    expect(calls.attachAsset).toEqual([]);
  });

  it('appends no outbox event and names no event type', () => {
    // `APP3-G06` bans naming the normalization event outside the checkpoints
    // allowed to produce it; this one produces nothing at all.
    expect(USE_CASE_SOURCE).not.toMatch(/OutboxEventStore|outbox|EVENT_TYPE/);
  });

  it('never touches the version counter or publication state', () => {
    expect(USE_CASE_SOURCE).not.toMatch(/currentVersion:\s|publishedAt|'PUBLISHED'|'ARCHIVED'/);
  });

  it('writes exactly one Audit row, carrying the triple it bound', async () => {
    const { useCase, calls } = harness();

    await useCase.assign(command);

    expect(calls.audit).toEqual([
      {
        templateId: TEMPLATE_ID,
        productId: PRODUCT_ID,
        productSideId: SIDE_ID,
        embroideryAreaId: AREA_ID,
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// 13–17 · Scope validity, through the shared B03 authority
// ---------------------------------------------------------------------------
describe('scope validity', () => {
  it('reuses the create-scope authority rather than a second definition', () => {
    expect(USE_CASE_SOURCE).toMatch(/DesignTemplateScopeAuthority/);
    expect(USE_CASE_SOURCE).toMatch(/this\.scopes\.resolve\(/);
    // No Catalog table, no controller-bearing Catalog import, no second SQL.
    expect(USE_CASE_SOURCE).not.toMatch(/products|product_sides|embroidery_areas|drizzle/);
  });

  for (const [label, code] of [
    ['a Side that is not on the Product', 'DESIGN_TEMPLATE_SCOPE_INVALID'],
    ['an Area that is not on the Side', 'DESIGN_TEMPLATE_SCOPE_INVALID'],
    ['a retired Side', 'DESIGN_TEMPLATE_SCOPE_INVALID'],
    ['a retired Area', 'DESIGN_TEMPLATE_SCOPE_INVALID'],
  ] as const) {
    it(`refuses ${label}, and writes nothing`, async () => {
      const { useCase, calls } = harness({
        resolveScope: () => Promise.reject(designTemplateDraftError(code)),
      });

      await expect(useCase.assign(command)).rejects.toMatchObject({ code });
      expect(calls.assign).toEqual([]);
      expect(calls.audit).toEqual([]);
    });
  }

  it('applies no Product-publication predicate', () => {
    // `IMP-D042` PO-07 makes publication readiness `GRD-T01`, which is APP3-B04's.
    // A draft scoped to an unpublished Product is an ordinary draft.
    expect(USE_CASE_SOURCE).not.toMatch(/PUBLISHED|publication|readiness|GRD-T01'/);
  });

  it('assigns against an unpublished Product', async () => {
    // The authority resolves the chain without consulting product status, so a
    // DRAFT Product produces an ordinary success.
    const { useCase, calls } = harness();
    await useCase.assign(command);
    expect(calls.assign).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 18–24 · Source states that are no longer assignable
// ---------------------------------------------------------------------------
describe('a template that is no longer assignable', () => {
  const staleWrite = () =>
    Promise.reject(
      persistenceError({
        kind: 'INVARIANT_VIOLATION',
        code: 'STALE_WRITE',
        operation: 'DesignTemplateRepository.assignInitialScope',
        message: 'This design template can no longer be given an initial scope.',
      }),
    );

  for (const label of [
    'already scoped',
    'partially scoped',
    'at a version above zero',
    'PUBLISHED',
    'ARCHIVED',
  ]) {
    it(`refuses one that is ${label}, as a conflict`, async () => {
      // Every one of these is the *same* refusal on the wire, because the
      // compare-and-set does not report which of its conditions failed — a
      // caller learning that from a write it was not allowed to make would learn
      // the template's lifecycle state from the refusal.
      const { useCase, calls } = harness({ assign: staleWrite });

      await expect(useCase.assign(command)).rejects.toMatchObject({
        code: 'DESIGN_TEMPLATE_SCOPE_NOT_ASSIGNABLE',
      });
      expect(calls.audit).toEqual([]);
    });
  }

  it('answers 404 for a template that does not exist', async () => {
    const { useCase, calls } = harness({ missing: true });

    await expect(useCase.assign(command)).rejects.toMatchObject({
      code: 'DESIGN_TEMPLATE_NOT_FOUND',
    });
    expect(calls.assign).toEqual([]);
  });

  it('answers 404 when the row disappears between the read and the write', async () => {
    const { useCase } = harness({
      assign: () =>
        Promise.reject(
          persistenceError({
            // The kind `notFoundError` itself raises, so the translation under
            // test sees exactly what the adapter would hand it.
            kind: 'INVALID_REFERENCE',
            code: 'RECORD_NOT_FOUND',
            operation: 'DesignTemplateRepository.assignInitialScope',
            message: 'That design template does not exist.',
          }),
        ),
    });

    await expect(useCase.assign(command)).rejects.toMatchObject({
      code: 'DESIGN_TEMPLATE_NOT_FOUND',
    });
  });

  it('does not repair a partial legacy scope', () => {
    // The predicate requires *all three* columns null, so a row with one set
    // cannot match — the operation refuses rather than completing the triple.
    expect(REPOSITORY_SOURCE).toMatch(/isNull\(designTemplates\.productId\)/);
    expect(REPOSITORY_SOURCE).toMatch(/isNull\(designTemplates\.productSideId\)/);
    expect(REPOSITORY_SOURCE).toMatch(/isNull\(designTemplates\.embroideryAreaId\)/);
  });

  it('writes no Audit row on any refusal', async () => {
    const { useCase, calls } = harness({ assign: staleWrite });
    await expect(useCase.assign(command)).rejects.toBeDefined();
    expect(calls.audit).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 25–29 · The compare-and-set itself
// ---------------------------------------------------------------------------
describe('the compare-and-set', () => {
  it('guards on every condition of the ruling, in one predicate', () => {
    const predicate = REPOSITORY_SOURCE.slice(
      REPOSITORY_SOURCE.indexOf('async assignInitialScope'),
      REPOSITORY_SOURCE.indexOf('async ensureAssetAssociation'),
    );

    expect(predicate).toMatch(/eq\(designTemplates\.status, 'DRAFT'\)/);
    expect(predicate).toMatch(/eq\(designTemplates\.currentVersion, 0\)/);
    expect(predicate).toMatch(/notExists\(/);
    // …and it is an `update … where`, never a read followed by a write.
    expect(predicate).toMatch(/\.update\(designTemplates\)[\s\S]*\.where\(/);
    expect(predicate).not.toMatch(/const \[existing\][\s\S]*\.update\(/);
  });

  it('writes the three scope columns together', () => {
    const predicate = REPOSITORY_SOURCE.slice(
      REPOSITORY_SOURCE.indexOf('async assignInitialScope'),
      REPOSITORY_SOURCE.indexOf('async ensureAssetAssociation'),
    );
    const set = predicate.slice(predicate.indexOf('.set({'), predicate.indexOf('.where('));

    for (const column of ['productId', 'productSideId', 'embroideryAreaId']) {
      expect(set).toContain(`${column}: input.${column}`);
    }
    // Nothing else moves: not the status, not the counter, not a version.
    expect(set).not.toMatch(/status|currentVersion|publishedAt|archivedAt/);
  });

  it('offers no clear or rescope method at all', () => {
    expect(REPOSITORY_SOURCE).not.toMatch(/clearScope|rescope|updateScope/);
  });

  it('runs inside the caller transaction, with the Audit row', () => {
    expect(REPOSITORY_SOURCE).toMatch(/this\.requireTransaction\('assignInitialScope'\)/);
    expect(USE_CASE_SOURCE).toMatch(
      /runInTransaction\([\s\S]*assignInitialScope[\s\S]*recordScopeAssigned/,
    );
  });

  it('translates the persistence guard rather than leaking a 500', () => {
    expect(USE_CASE_SOURCE).toMatch(/isPersistenceError/);
    expect(USE_CASE_SOURCE).toMatch(/'STALE_WRITE'[\s\S]{0,120}SCOPE_NOT_ASSIGNABLE/);
  });
});
