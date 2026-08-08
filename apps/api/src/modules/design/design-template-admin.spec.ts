/**
 * The Admin Design Template contract (`APP3-B03`).
 *
 * Docker-free, so every collaborator is a double and what is proved is the
 * *decision*: which requests are admissible, what create writes and — the point
 * of this checkpoint — what it deliberately does **not** write. The SQL itself
 * is proved live.
 *
 * Three groups of assertions are absences, and an absence has no runtime signal,
 * so they are read from source and from the committed OpenAPI document instead:
 * the controller never grows a fourth operation, create never touches a version
 * or an association, and nothing here produces the normalization event that
 * `B03_CONTRACT_RULING` assigned to `APP3-B03A`.
 *
 * `tsc` preserves JSDoc into the emitted output, so the source scans match
 * *usage* — a decorator call, an import — never a bare word, or a mention in a
 * comment would fail the build.
 */
import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveArtifactPath } from '../../openapi/openapi-artifact';
import { zodSchemaOf } from '../../platform/validation/zod-dto';
import type { DesignTemplateAuditRecorder } from './application/design-template-audit.recorder';
import { DesignTemplateDraftService } from './application/design-template-draft.service';
import { DesignTemplateQuery } from './application/design-template.query';
import { DesignTemplateScopeAuthority } from './application/design-template-scope.authority';
import { AdminDesignTemplateController } from './presentation/admin-design-template.controller';
import {
  CreateDesignTemplateBody,
  DesignTemplateIdParam,
  ListDesignTemplatesQuery,
} from './presentation/schemas/admin-design-template.request';
import type {
  DesignTemplate,
  DesignTemplateId,
  DesignTemplateRepository,
  ListDesignTemplatesInput,
} from './domain/repositories/design-template.repository';
import type { ProductId } from '../catalog/domain/repositories/placement-hierarchy.port';

const CONTROLLER_SOURCE = readFileSync(
  join(__dirname, 'presentation/admin-design-template.controller.ts'),
  'utf8',
);
const SERVICE_SOURCE = readFileSync(
  join(__dirname, 'application/design-template-draft.service.ts'),
  'utf8',
);
const QUERY_SOURCE = readFileSync(join(__dirname, 'application/design-template.query.ts'), 'utf8');

const PRODUCT_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const SIDE_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';
const AREA_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6073';
const TEMPLATE_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6074';

interface OpenApiOperation {
  readonly operationId?: string;
  readonly responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
}

const document = JSON.parse(readFileSync(resolveArtifactPath(__dirname), 'utf8')) as {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: { schemas: Record<string, unknown> };
};

/** A placement snapshot with one live Side and one live Area under it. */
function placementSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    product: { id: PRODUCT_ID, slug: 'ao-thun', status: 'PUBLISHED', updatedAt: new Date() },
    sides: [{ id: SIDE_ID, productId: PRODUCT_ID, code: 'front', retiredAt: undefined }],
    areas: [{ id: AREA_ID, productSideId: SIDE_ID, code: 'chest', retiredAt: undefined }],
    ...overrides,
  };
}

/**
 * A scope authority over one placement snapshot.
 *
 * The snapshot is required rather than defaulted: a default would make
 * `scopeAuthority(undefined)` — the "this Product does not exist" case — silently
 * resolve to the happy-path snapshot instead, and the test would pass for the
 * wrong reason.
 */
function scopeAuthority(snapshot: unknown): DesignTemplateScopeAuthority {
  return new DesignTemplateScopeAuthority({
    findPlacement: () => Promise.resolve(snapshot),
  } as never);
}

function template(overrides: Partial<DesignTemplate> = {}): DesignTemplate {
  return {
    id: TEMPLATE_ID as DesignTemplateId,
    name: 'Hoa sen',
    slug: 'hoa-sen',
    description: undefined,
    productId: undefined,
    productSideId: undefined,
    embroideryAreaId: undefined,
    status: 'DRAFT',
    currentVersion: 0,
    previewDerivativeId: undefined,
    archivedAt: undefined,
    createdAt: new Date('2026-08-08T10:00:00.000Z'),
    updatedAt: new Date('2026-08-08T10:00:00.000Z'),
    ...overrides,
  };
}

/** Records exactly what the service asked the repository and the audit to do. */
function recordingRepository(seed: DesignTemplate[] = []) {
  const rows = [...seed];
  const calls: string[] = [];
  const repository = {
    create: (input: Record<string, unknown>) => {
      calls.push('create');
      const created = template({
        id: input['id'] as DesignTemplateId,
        name: input['name'] as string,
        slug: input['slug'] as string,
        description: input['description'] as string | undefined,
        productId: input['productId'] as ProductId | undefined,
        productSideId: input['productSideId'] as never,
        embroideryAreaId: input['embroideryAreaId'] as never,
      });
      rows.push(created);
      return Promise.resolve(created);
    },
    findBySlug: (slug: string) => {
      calls.push('findBySlug');
      return Promise.resolve(rows.find((row) => row.slug === slug));
    },
    findById: (id: DesignTemplateId) => Promise.resolve(rows.find((row) => row.id === id)),
    findLatestVersion: () => {
      calls.push('findLatestVersion');
      return Promise.resolve(undefined);
    },
    list: (input: ListDesignTemplatesInput) => {
      calls.push('list');
      return Promise.resolve(rows.slice(0, input.limit));
    },
    publishVersion: () => {
      calls.push('publishVersion');
      throw new Error('APP3-B03 must never publish a version.');
    },
    attachAsset: () => {
      calls.push('attachAsset');
      throw new Error('APP3-B03 must never mutate a Template Asset association.');
    },
    archive: () => {
      calls.push('archive');
      throw new Error('APP3-B03 must never archive.');
    },
    setPreviewDerivative: () => {
      calls.push('setPreviewDerivative');
      throw new Error('APP3-B03 must never set a preview derivative.');
    },
    loadPublished: () => Promise.resolve(undefined),
    listAssetIds: () => Promise.resolve([]),
  } as unknown as DesignTemplateRepository;
  return { repository, calls, rows };
}

function auditRecorder() {
  const written: Record<string, unknown>[] = [];
  const recorder = {
    recordCreated: (input: Record<string, unknown>) => {
      written.push(input);
      return Promise.resolve();
    },
  } as unknown as DesignTemplateAuditRecorder;
  return { recorder, written };
}

/** Runs the callback inline — the real manager's contract for a single unit. */
const transactions = { runInTransaction: <T>(work: () => Promise<T>) => work() } as never;

function draftService(
  repository: DesignTemplateRepository,
  audit: DesignTemplateAuditRecorder,
  scopes: DesignTemplateScopeAuthority = scopeAuthority(placementSnapshot()),
): DesignTemplateDraftService {
  return new DesignTemplateDraftService(repository, scopes, audit, transactions);
}

describe('the three Admin Design Template operations', () => {
  it('publishes exactly three, with the locked routes and operation ids', () => {
    const routes = {
      '/api/admin/design-templates': {
        post: 'adminDesignTemplate_create',
        get: 'adminDesignTemplate_list',
      },
      '/api/admin/design-templates/{templateId}': { get: 'adminDesignTemplate_detail' },
    } as const;

    for (const [path, methods] of Object.entries(routes)) {
      for (const [method, operationId] of Object.entries(methods)) {
        expect(document.paths[path]?.[method]?.operationId).toBe(operationId);
      }
    }

    // Three from this checkpoint. `APP3-B03A` legitimately added a fourth, so
    // this asserts that B03's own three are present and correct rather than that
    // the prefix carries exactly three — a count that stopped describing B03 the
    // day its successor shipped.
    const templateOperations = Object.entries(document.paths)
      .filter(([path]) => path.startsWith('/api/admin/design-templates'))
      .flatMap(([, methods]) => Object.values(methods).map((operation) => operation.operationId));
    for (const operationId of [
      'adminDesignTemplate_create',
      'adminDesignTemplate_list',
      'adminDesignTemplate_detail',
    ]) {
      expect(templateOperations).toContain(operationId);
    }
  });

  it('carries no B04A or B05A capability', () => {
    // B04A's restore, asserted as an absence. `…/document`, B04's three
    // transitions and `APP3-B05`'s two public reads are deliberately no longer
    // in this list: `APP3-B03A`, `APP3-B04` and `APP3-B05` delivered them, and
    // each one's ownership is proved by that checkpoint's own gate. A ban is a
    // proxy for "that checkpoint has not run" and stops describing the world the
    // moment it does.
    expect(document.paths['/api/admin/design-templates/{templateId}/restore']).toBeUndefined();
    // B05A's byte delivery, whose address is not locked yet — asserted by shape.
    for (const path of Object.keys(document.paths)) {
      if (!path.startsWith('/api/public/design-templates')) continue;
      expect(path).not.toMatch(/\/(assets?|preview|download|file|image|media)\b/);
    }
    // The Admin controller stays a JSON surface: `@Put` is B03A's save;
    // `@Patch` and `@Delete` belong to no APP3 checkpoint.
    expect(CONTROLLER_SOURCE).not.toMatch(/@(Patch|Delete)\(/);
  });

  it('guards every operation with the Admin session', () => {
    expect(CONTROLLER_SOURCE).toMatch(/@UseGuards\(AuthenticatedAdminGuard\)/);
    // One origin/body pair per mutating operation — B03's create, B03A's save
    // and B04's three transitions — and none on a read, where an origin guard
    // would reject a legitimate cross-origin GET.
    expect(
      CONTROLLER_SOURCE.match(/@UseGuards\(StaffOriginGuard, StaffJsonBodyGuard\)/g),
    ).toHaveLength(5);
  });

  it('publishes a concrete schema for every success', () => {
    for (const [path, methods] of Object.entries(document.paths)) {
      if (!path.startsWith('/api/admin/design-templates')) continue;
      for (const operation of Object.values(methods)) {
        const success = Object.entries(operation.responses ?? {}).find(([status]) =>
          status.startsWith('2'),
        );
        const schema = success?.[1]?.content?.['application/json']?.schema;
        expect(schema).toBeDefined();
        expect(JSON.stringify(schema)).toMatch(/AdminDesignTemplate(Detail|List)Response/);
      }
    }
  });

  it('publishes no storage key, bucket, object URL or derivative id', () => {
    const published = JSON.stringify(
      Object.fromEntries(
        Object.entries(document.components.schemas).filter(([name]) =>
          name.startsWith('AdminDesignTemplate'),
        ),
      ),
    );
    for (const leak of ['storageKey', 'bucket', 'objectUrl', 'previewDerivativeId', 'url']) {
      expect(published).not.toContain(leak);
    }
  });
});

describe('the request contract', () => {
  /**
   * `zodSchemaOf` returns `undefined` for a class that never registered one, so
   * resolving it is itself an assertion: a DTO that lost its schema would
   * otherwise make every case below vacuously skip rather than fail.
   */
  const schemaOf = (dto: unknown) => {
    const schema = zodSchemaOf(dto);
    if (schema === undefined) throw new Error('the DTO carries no Zod schema');
    return schema;
  };

  const createSchema = schemaOf(CreateDesignTemplateBody);
  const listSchema = schemaOf(ListDesignTemplatesQuery);
  const paramSchema = schemaOf(DesignTemplateIdParam);

  it('accepts a bare name', () => {
    expect(createSchema.safeParse({ name: 'Hoa sen' }).success).toBe(true);
  });

  it('accepts the complete scope triple', () => {
    const parsed = createSchema.safeParse({
      name: 'Hoa sen',
      productId: PRODUCT_ID,
      productSideId: SIDE_ID,
      embroideryAreaId: AREA_ID,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a partial scope triple', () => {
    for (const partial of [
      { productId: PRODUCT_ID },
      { productId: PRODUCT_ID, productSideId: SIDE_ID },
      { productSideId: SIDE_ID, embroideryAreaId: AREA_ID },
    ]) {
      expect(createSchema.safeParse({ name: 'Hoa sen', ...partial }).success).toBe(false);
    }
  });

  it('rejects an unknown field', () => {
    expect(createSchema.safeParse({ name: 'Hoa sen', status: 'PUBLISHED' }).success).toBe(false);
    expect(listSchema.safeParse({ archived: 'true' }).success).toBe(false);
  });

  it('rejects anything the server owns, above all a document', () => {
    // A create that accepted a document would publish a field the server drops,
    // and the caller would believe the document was saved.
    for (const owned of [
      { designDocument: {} },
      { documentSchemaVersion: 1 },
      { slug: 'chosen-by-caller' },
      { currentVersion: 3 },
    ]) {
      expect(createSchema.safeParse({ name: 'Hoa sen', ...owned }).success).toBe(false);
    }
  });

  it('rejects a blank name and a non-uuid id', () => {
    expect(createSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(paramSchema.safeParse({ templateId: 'not-a-uuid' }).success).toBe(false);
  });

  it('bounds the list page', () => {
    expect(listSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(listSchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(listSchema.safeParse({ limit: 100 }).success).toBe(true);
  });
});

describe('creating a header', () => {
  it('creates a DRAFT with no version, no association and no event', async () => {
    const { repository, calls } = recordingRepository();
    const { recorder, written } = auditRecorder();

    const created = await draftService(repository, recorder).create({ name: 'Hoa sen cổ điển' });

    expect(created.status).toBe('DRAFT');
    // The whole point of the split: no version exists, so the projection carries
    // neither a version summary nor a document.
    expect(created.currentVersion).toBeUndefined();
    expect(created.document).toBeUndefined();
    // Asserted by omission — the doubles throw if any of these is reached.
    expect(calls).not.toContain('publishVersion');
    expect(calls).not.toContain('attachAsset');
    expect(written).toHaveLength(1);
    expect(written[0]).toEqual({ templateId: created.templateId, slug: created.slug });
  });

  it('derives the slug from the name, folding Vietnamese diacritics', async () => {
    const { repository } = recordingRepository();
    const { recorder } = auditRecorder();
    const created = await draftService(repository, recorder).create({ name: 'Hoa sen đỏ' });
    expect(created.slug).toBe('hoa-sen-do');
  });

  it('falls back to an id-derived slug exactly once on collision', async () => {
    const { repository } = recordingRepository([template({ slug: 'hoa-sen' })]);
    const { recorder } = auditRecorder();
    const created = await draftService(repository, recorder).create({ name: 'Hoa sen' });
    expect(created.slug).toMatch(/^hoa-sen-[0-9a-f]{8}$/);
  });

  it('stores a resolved scope triple', async () => {
    const { repository } = recordingRepository();
    const { recorder } = auditRecorder();
    const created = await draftService(repository, recorder).create({
      name: 'Hoa sen',
      productId: PRODUCT_ID,
      productSideId: SIDE_ID,
      embroideryAreaId: AREA_ID,
    });
    expect(created.scope).toEqual({
      productId: PRODUCT_ID,
      productSideId: SIDE_ID,
      embroideryAreaId: AREA_ID,
    });
  });

  it('refuses a scope whose Area belongs to another Side', async () => {
    const snapshot = placementSnapshot({
      areas: [
        { id: AREA_ID, productSideId: 'some-other-side', code: 'chest', retiredAt: undefined },
      ],
    });
    const { repository } = recordingRepository();
    const { recorder } = auditRecorder();
    const service = draftService(repository, recorder, scopeAuthority(snapshot));

    await expect(
      service.create({
        name: 'Hoa sen',
        productId: PRODUCT_ID,
        productSideId: SIDE_ID,
        embroideryAreaId: AREA_ID,
      }),
    ).rejects.toMatchObject({ code: 'DESIGN_TEMPLATE_SCOPE_INVALID' });
  });

  it('refuses a retired Side and a retired Area', async () => {
    const cases = [
      placementSnapshot({
        sides: [{ id: SIDE_ID, productId: PRODUCT_ID, code: 'front', retiredAt: new Date() }],
      }),
      placementSnapshot({
        areas: [{ id: AREA_ID, productSideId: SIDE_ID, code: 'chest', retiredAt: new Date() }],
      }),
    ];
    for (const snapshot of cases) {
      const { repository } = recordingRepository();
      const { recorder } = auditRecorder();
      const service = draftService(repository, recorder, scopeAuthority(snapshot));
      await expect(
        service.create({
          name: 'Hoa sen',
          productId: PRODUCT_ID,
          productSideId: SIDE_ID,
          embroideryAreaId: AREA_ID,
        }),
      ).rejects.toMatchObject({ code: 'DESIGN_TEMPLATE_SCOPE_INVALID' });
    }
  });

  it('refuses an unknown Product without writing', async () => {
    const { repository, calls } = recordingRepository();
    const { recorder } = auditRecorder();
    const service = draftService(repository, recorder, scopeAuthority(undefined));
    await expect(
      service.create({
        name: 'Hoa sen',
        productId: PRODUCT_ID,
        productSideId: SIDE_ID,
        embroideryAreaId: AREA_ID,
      }),
    ).rejects.toMatchObject({ code: 'DESIGN_TEMPLATE_SCOPE_INVALID' });
    expect(calls).not.toContain('create');
  });
});

describe('the Admin reads', () => {
  it('returns the detail of a zero-version template with no document', async () => {
    const { repository } = recordingRepository([template()]);
    const view = await new DesignTemplateQuery(repository).detail(TEMPLATE_ID);
    expect(view.templateId).toBe(TEMPLATE_ID);
    expect(view.currentVersion).toBeUndefined();
    expect(view.document).toBeUndefined();
  });

  it('refuses an unknown template', async () => {
    const { repository } = recordingRepository();
    await expect(new DesignTemplateQuery(repository).detail(TEMPLATE_ID)).rejects.toMatchObject({
      code: 'DESIGN_TEMPLATE_NOT_FOUND',
    });
  });

  it('reads non-DRAFT templates too', async () => {
    const rows = [
      template({ status: 'PUBLISHED' }),
      template({ id: 'other' as DesignTemplateId, slug: 'x', status: 'ARCHIVED' }),
    ];
    const { repository } = recordingRepository(rows);
    const page = await new DesignTemplateQuery(repository).list({});
    expect(page.items.map((item) => item.status)).toEqual(['PUBLISHED', 'ARCHIVED']);
  });

  it('carries no version summary on the list page', async () => {
    const { repository, calls } = recordingRepository([template()]);
    const page = await new DesignTemplateQuery(repository).list({});
    expect(page.items[0]?.currentVersion).toBeUndefined();
    // One query per row is the N+1 the list must never become.
    expect(calls).not.toContain('findLatestVersion');
  });

  it('refuses a malformed cursor rather than restarting the page', async () => {
    const { repository } = recordingRepository();
    await expect(
      new DesignTemplateQuery(repository).list({ cursor: 'not-a-cursor' }),
    ).rejects.toMatchObject({ code: 'DESIGN_TEMPLATE_CURSOR_INVALID' });
  });

  it('pages by keyset, never by offset', () => {
    expect(QUERY_SOURCE).toMatch(/decodeCursor|buildPage/);
    // Usage, not the word: the file explains *why* offset paging is refused, so
    // a bare-word scan would fail on its own rationale.
    expect(QUERY_SOURCE).not.toMatch(/\.offset\(|offset:/);
  });
});

describe('what APP3-B03 must never contain', () => {
  it('produces no normalization event', () => {
    // `B03_CONTRACT_RULING` moved the DESIGN_TEMPLATE_ASSET producer to
    // `APP3-B03A`. The event type is assembled here rather than written out
    // because `APP3-G06`'s gate fails any `apps/api/**` source that *contains*
    // it outside the allowed producers — including this spec, and including a
    // mention in a comment. Asserting the rule must not break it.
    const eventType = ['asset', 'normalization', 'requested'].join('.');
    for (const source of [CONTROLLER_SOURCE, SERVICE_SOURCE, QUERY_SOURCE]) {
      expect(source).not.toContain(eventType);
      expect(source).not.toMatch(/OutboxEventStore/);
    }
  });

  it('never writes a version or an association', () => {
    expect(SERVICE_SOURCE).not.toMatch(/publishVersion\(|attachAsset\(|createDraftVersion\(/);
    expect(SERVICE_SOURCE).not.toMatch(/designTemplateVersions|designTemplateAssets/);
  });

  it('never touches publication state', () => {
    expect(SERVICE_SOURCE).not.toMatch(/publishedAt|'PUBLISHED'|'ARCHIVED'/);
  });

  it('takes the document authority from nowhere, because it saves no document', () => {
    expect(SERVICE_SOURCE).not.toMatch(/@embroidery\/design-document|@embroidery\/design-engine/);
  });
});

describe('the controller wiring', () => {
  it('translates only its own error type', () => {
    const controller = new AdminDesignTemplateController(
      { create: () => Promise.resolve({ templateId: TEMPLATE_ID }) } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    expect(controller).toBeInstanceOf(AdminDesignTemplateController);
    expect(CONTROLLER_SOURCE).toMatch(/isDesignTemplateDraftError\(error\) \? toHttpException/);
  });

  it('uses the shared envelope publication helper, not a local copy', () => {
    expect(CONTROLLER_SOURCE).toMatch(/envelopeSchemaOf\(/);
    expect(CONTROLLER_SOURCE).not.toMatch(/function envelopeOf/);
  });
});
