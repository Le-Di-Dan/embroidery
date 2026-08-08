/**
 * The Design Template draft document save (`APP3-B03A`).
 *
 * Docker-free, so every collaborator is a double and what is proved is the
 * *decision*: which documents are admissible, what the compare-and-set is asked
 * for, which associations are reconciled and which events that produces. The SQL
 * and the race are proved live.
 *
 * The cases worth reading twice are the media ones. A document referencing an
 * image is saveable only because the derivative authority map contains that
 * derivative — and the map is built from Assets in the `TEMPLATE_SOURCE` lane
 * alone. A customer upload does not fail a comparison; it fails because it was
 * never in the allowlist. That is asserted by omission, which is the only way to
 * prove a fail-closed rule.
 */
import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION } from '@embroidery/design-document';
import { persistenceError } from '@embroidery/database';

import { resolveArtifactPath } from '../../openapi/openapi-artifact';
import { zodSchemaOf } from '../../platform/validation/zod-dto';
import { SaveTemplateDocumentUseCase } from './application/save-template-document.use-case';
import { TemplateDocumentAuthority } from './application/template-document.authority';
import type { TemplateDocumentMediaAuthority } from './application/template-document-media.authority';
import { SaveDesignTemplateDocumentBody } from './presentation/schemas/admin-design-template.request';
import type {
  DesignTemplate,
  DesignTemplateId,
  DesignTemplateRepository,
  SaveDesignTemplateDraftVersionInput,
} from './domain/repositories/design-template.repository';
import type { DesignTemplateAuditRecorder } from './application/design-template-audit.recorder';

const CONTROLLER_SOURCE = readFileSync(
  join(__dirname, 'presentation/admin-design-template.controller.ts'),
  'utf8',
);
const USE_CASE_SOURCE = readFileSync(
  join(__dirname, 'application/save-template-document.use-case.ts'),
  'utf8',
);
const AUTHORITY_SOURCE = readFileSync(
  join(__dirname, 'application/template-document.authority.ts'),
  'utf8',
);

const TEMPLATE_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6081';
const ASSET_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6082';
const DERIVATIVE_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6083';
const ROUTE = '/api/admin/design-templates/{templateId}/document';

interface OpenApiOperation {
  readonly operationId?: string;
  readonly requestBody?: { content?: Record<string, { schema?: { $ref?: string } }> };
  readonly responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
}

const document = JSON.parse(readFileSync(resolveArtifactPath(__dirname), 'utf8')) as {
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
};

/** A minimal valid canonical document; `elements` carries the image when asked. */
function designDocument(elements: readonly unknown[] = []): Record<string, unknown> {
  return {
    schemaVersion: CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
    placement: {
      productSideId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6090',
      embroideryAreaId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6091',
      canvasWidthPx: 1000,
      canvasHeightPx: 1200,
      physicalWidthMm: 400,
      physicalHeightMm: 480,
      pxPerMm: 2.5,
    },
    elements,
  };
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

interface RepositoryOptions {
  readonly row?: DesignTemplate | undefined;
  /** A real Error: the use case narrows it with an `instanceof` check. */
  readonly saveThrows?: Error | undefined;
  readonly associationCreated?: boolean;
}

/** Records exactly what the use case asked the repository to do. */
function recordingRepository(options: RepositoryOptions = {}) {
  const saves: SaveDesignTemplateDraftVersionInput[] = [];
  const associations: string[] = [];
  const row = 'row' in options ? options.row : template();

  const repository = {
    findById: () => Promise.resolve(row),
    saveDraftVersion: (input: SaveDesignTemplateDraftVersionInput) => {
      saves.push(input);
      if (options.saveThrows !== undefined) {
        // Rejected with the real error object, never a bare value: the use case
        // narrows it with `isPersistenceError`, which is an `instanceof` check.
        return Promise.reject(options.saveThrows);
      }
      return Promise.resolve({
        id: 'version-1' as never,
        designTemplateId: input.designTemplateId,
        version: input.expectedCurrentVersion + 1,
        designDocument: input.designDocument,
        documentSchemaVersion: input.documentSchemaVersion,
        publishedAt: undefined,
        createdAt: new Date('2026-08-08T11:00:00.000Z'),
      });
    },
    ensureAssetAssociation: (_id: DesignTemplateId, assetId: string) => {
      associations.push(assetId);
      return Promise.resolve({
        designTemplateAssetId: `assoc-${assetId}`,
        created: options.associationCreated ?? true,
      });
    },
    publishVersion: () => {
      throw new Error('APP3-B03A must never publish a version.');
    },
    attachAsset: () => {
      throw new Error('APP3-B03A must use ensureAssetAssociation, never attachAsset.');
    },
    archive: () => {
      throw new Error('APP3-B03A must never archive.');
    },
  } as unknown as DesignTemplateRepository;

  return { repository, saves, associations };
}

function outboxStore() {
  const appended: Record<string, unknown>[] = [];
  const outbox = {
    append: (event: Record<string, unknown>) => {
      appended.push(event);
      return Promise.resolve('event-id');
    },
  } as never;
  return { outbox, appended };
}

function auditRecorder() {
  const written: Record<string, unknown>[] = [];
  const recorder = {
    recordDraftVersionSaved: (input: Record<string, unknown>) => {
      written.push(input);
      return Promise.resolve();
    },
  } as unknown as DesignTemplateAuditRecorder;
  return { recorder, written };
}

/** A media authority over an explicit derivative set — the allowlist itself. */
function mediaAuthority(
  records: readonly Record<string, unknown>[],
): TemplateDocumentMediaAuthority {
  return {
    contextFor: () =>
      Promise.resolve({
        derivatives: new Map(records.map((r) => [r['derivativeId'] as string, r])),
      }),
  } as unknown as TemplateDocumentMediaAuthority;
}

const transactions = { runInTransaction: <T>(work: () => Promise<T>) => work() } as never;

function useCase(
  repository: DesignTemplateRepository,
  parts: {
    outbox: never;
    audit: DesignTemplateAuditRecorder;
    media?: TemplateDocumentMediaAuthority;
  },
): SaveTemplateDocumentUseCase {
  return new SaveTemplateDocumentUseCase(
    repository,
    new TemplateDocumentAuthority(),
    parts.media ?? mediaAuthority([]),
    parts.audit,
    parts.outbox,
    transactions,
  );
}

describe('the published save contract', () => {
  it('publishes exactly one new operation, at the locked route and id', () => {
    expect(document.paths[ROUTE]?.put?.operationId).toBe('adminDesignTemplate_saveDocument');
    // Enumerated rather than counted. A bare number said "four" and had to be
    // rewritten the day `APP3-B04` legitimately published three more; naming
    // each operation and its owner keeps the assertion just as strict — an
    // eighth still fails — while saying which checkpoint every one belongs to.
    const templateOperations = Object.entries(document.paths)
      .filter(([path]) => path.startsWith('/api/admin/design-templates'))
      .flatMap(([path, methods]) => Object.keys(methods).map((method) => `${method} ${path}`))
      .sort();
    expect(templateOperations).toEqual(
      [
        'get /api/admin/design-templates', // APP3-B03
        'post /api/admin/design-templates', // APP3-B03
        'get /api/admin/design-templates/{templateId}', // APP3-B03
        'put /api/admin/design-templates/{templateId}/document', // this checkpoint
        'post /api/admin/design-templates/{templateId}/archive', // APP3-B04
        'post /api/admin/design-templates/{templateId}/publish', // APP3-B04
        'post /api/admin/design-templates/{templateId}/unpublish', // APP3-B04
      ].sort(),
    );
  });

  it('publishes no B04A, B05 or B05A route alongside it', () => {
    for (const forbidden of [
      '/api/admin/design-templates/{templateId}/restore',
      '/api/public/design-templates',
    ]) {
      expect(document.paths[forbidden]).toBeUndefined();
    }
  });

  it('references the generated P01 DesignDocument rather than restating it', () => {
    const ref =
      document.paths[ROUTE]?.put?.requestBody?.content?.['application/json']?.schema?.$ref;
    expect(ref).toBe('#/components/schemas/SaveDesignTemplateDocumentBody');
    const body = document.components.schemas['SaveDesignTemplateDocumentBody'];
    expect(Object.keys(body?.properties ?? {}).sort()).toEqual([
      'document',
      'expectedCurrentVersion',
    ]);
    // The marker must have been resolved by document assembly; an unresolved
    // open object here is the `APP3-B08-C1` defect returning.
    expect(JSON.stringify(body?.properties?.['document'])).toContain(
      '#/components/schemas/DesignDocument',
    );
    expect(document.components.schemas['DesignDocument']).toBeDefined();
  });

  it('answers with the B03 detail projection, concretely', () => {
    const success = document.paths[ROUTE]?.put?.responses?.['200'];
    const schema = JSON.stringify(success?.content?.['application/json']?.schema);
    expect(schema).toContain('AdminDesignTemplateDetailResponse');
  });

  it('guards the write with the Admin session and the mutating pair', () => {
    expect(CONTROLLER_SOURCE).toMatch(/@Put\(':templateId\/document'\)/);
    // One per mutating operation: B03's create, this save, and B04's three
    // transitions — the two reads carry the controller-level Admin guard only.
    expect(
      CONTROLLER_SOURCE.match(/@UseGuards\(StaffOriginGuard, StaffJsonBodyGuard\)/g),
    ).toHaveLength(5);
  });
});

describe('the request contract', () => {
  const schema = (() => {
    const parsed = zodSchemaOf(SaveDesignTemplateDocumentBody);
    if (parsed === undefined) throw new Error('the DTO carries no Zod schema');
    return parsed;
  })();

  it('accepts a first save at expected version 0', () => {
    expect(
      schema.safeParse({ expectedCurrentVersion: 0, document: designDocument() }).success,
    ).toBe(true);
  });

  it('rejects a negative or fractional expected version', () => {
    for (const value of [-1, 1.5, '1']) {
      expect(
        schema.safeParse({ expectedCurrentVersion: value, document: designDocument() }).success,
      ).toBe(false);
    }
  });

  it('requires a document object', () => {
    expect(schema.safeParse({ expectedCurrentVersion: 0 }).success).toBe(false);
    expect(schema.safeParse({ expectedCurrentVersion: 0, document: null }).success).toBe(false);
    expect(schema.safeParse({ expectedCurrentVersion: 0, document: 'x' }).success).toBe(false);
  });

  it('rejects everything the server owns', () => {
    for (const owned of [
      { version: 3 },
      { publishedAt: '2026-08-08T00:00:00.000Z' },
      { status: 'PUBLISHED' },
      { documentSchemaVersion: 1 },
      { templateId: TEMPLATE_ID },
      { designTemplateAssetId: 'x' },
    ]) {
      expect(
        schema.safeParse({ expectedCurrentVersion: 0, document: designDocument(), ...owned })
          .success,
      ).toBe(false);
    }
  });
});

describe('saving a draft version', () => {
  it('asks for the next version under the caller token and persists the canonical document', async () => {
    const { repository, saves } = recordingRepository();
    const { outbox, appended } = outboxStore();
    const { recorder, written } = auditRecorder();

    const view = await useCase(repository, { outbox, audit: recorder }).save({
      templateId: TEMPLATE_ID,
      expectedCurrentVersion: 0,
      document: designDocument(),
    });

    expect(saves).toHaveLength(1);
    expect(saves[0]?.expectedCurrentVersion).toBe(0);
    expect(saves[0]?.documentSchemaVersion).toBe(CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION);
    // The canonical document, not the caller's object: quantization runs first.
    expect(saves[0]?.designDocument).not.toBe(undefined);
    expect(view.currentVersion?.version).toBe(1);
    expect(view.status).toBe('DRAFT');
    // No media, so no association and no event.
    expect(appended).toHaveLength(0);
    expect(written).toEqual([{ templateId: TEMPLATE_ID, version: 1 }]);
  });

  it('refuses a non-DRAFT template without asking the repository to save', async () => {
    const { repository, saves } = recordingRepository({
      row: template({ status: 'PUBLISHED' }),
    });
    const { outbox } = outboxStore();
    const { recorder } = auditRecorder();

    await expect(
      useCase(repository, { outbox, audit: recorder }).save({
        templateId: TEMPLATE_ID,
        expectedCurrentVersion: 1,
        document: designDocument(),
      }),
    ).rejects.toMatchObject({ code: 'DESIGN_TEMPLATE_NOT_EDITABLE' });
    expect(saves).toHaveLength(0);
  });

  it('refuses an unknown template', async () => {
    const { repository } = recordingRepository({ row: undefined });
    const { outbox } = outboxStore();
    const { recorder } = auditRecorder();

    await expect(
      useCase(repository, { outbox, audit: recorder }).save({
        templateId: TEMPLATE_ID,
        expectedCurrentVersion: 0,
        document: designDocument(),
      }),
    ).rejects.toMatchObject({ code: 'DESIGN_TEMPLATE_NOT_FOUND' });
  });

  it('turns a stale compare-and-set into the version conflict, not a 500', async () => {
    // A `PersistenceError` that reached the controller untranslated would answer
    // 500 against a published 409 — the exact `APP3-B06B-C1` defect.
    const { repository } = recordingRepository({
      saveThrows: persistenceError({
        kind: 'INVARIANT_VIOLATION',
        code: 'STALE_WRITE',
        operation: 'DesignTemplateRepository.saveDraftVersion',
        message: 'changed',
      }),
    });
    const { outbox, appended } = outboxStore();
    const { recorder, written } = auditRecorder();

    await expect(
      useCase(repository, { outbox, audit: recorder }).save({
        templateId: TEMPLATE_ID,
        expectedCurrentVersion: 0,
        document: designDocument(),
      }),
    ).rejects.toMatchObject({ code: 'DESIGN_TEMPLATE_VERSION_CONFLICT' });

    // The loser writes nothing at all.
    expect(appended).toHaveLength(0);
    expect(written).toHaveLength(0);
  });

  it('refuses an unsupported schema version and a malformed document', async () => {
    const { repository, saves } = recordingRepository();
    const { outbox } = outboxStore();
    const { recorder } = auditRecorder();
    const subject = useCase(repository, { outbox, audit: recorder });

    for (const candidate of [
      { ...designDocument(), schemaVersion: 99 },
      { ...designDocument(), placement: undefined },
      { nothing: true },
    ]) {
      await expect(
        subject.save({ templateId: TEMPLATE_ID, expectedCurrentVersion: 0, document: candidate }),
      ).rejects.toMatchObject({ name: 'TemplateDocumentRejectedError' });
    }
    expect(saves).toHaveLength(0);
  });
});

describe('Template Asset associations and normalization', () => {
  // Shaped from 's own fixture rather than by hand:
  // an element that merely looks plausible is rejected by P01 structure, and the
  // test would then prove nothing about associations.
  const imageElement = {
    id: 'image-1',
    type: 'image',
    visible: true,
    locked: false,
    opacity: 1,
    transform: { x: 10, y: 20, width: 100, height: 50, rotationDeg: 0, scaleX: 1, scaleY: 1 },
    assetId: ASSET_ID,
    derivativeId: DERIVATIVE_ID,
    intrinsicWidthPx: 800,
    intrinsicHeightPx: 600,
  };

  const eligible = [
    {
      derivativeId: DERIVATIVE_ID,
      assetId: ASSET_ID,
      kind: 'NORMALIZED',
      status: 'READY',
      // Equal to the element's intrinsic dimensions: P01-C1 refuses a
      // disagreement, because the document's own idea of the image size is what
      // decides how it is scaled onto the product.
      widthPx: 800,
      heightPx: 600,
      mediaType: 'image/webp',
      byteSize: 4096,
    },
  ];

  it('appends exactly one normalization request for a new association', async () => {
    const { repository, associations } = recordingRepository({ associationCreated: true });
    const { outbox, appended } = outboxStore();
    const { recorder } = auditRecorder();

    await useCase(repository, {
      outbox,
      audit: recorder,
      media: mediaAuthority(eligible),
    }).save({
      templateId: TEMPLATE_ID,
      expectedCurrentVersion: 0,
      document: designDocument([imageElement]),
    });

    expect(associations).toEqual([ASSET_ID]);
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      eventType: 'asset.normalization.requested',
      aggregateKind: 'ASSET',
      aggregateId: ASSET_ID,
      payloadSchemaVersion: 1,
    });
    expect(appended[0]?.['payload']).toMatchObject({
      schemaVersion: 1,
      assetId: ASSET_ID,
      normalizationPolicyVersion: 1,
      associationRef: { kind: 'DESIGN_TEMPLATE_ASSET', designTemplateAssetId: `assoc-${ASSET_ID}` },
    });
  });

  it('appends nothing when the association already existed', async () => {
    const { repository, associations } = recordingRepository({ associationCreated: false });
    const { outbox, appended } = outboxStore();
    const { recorder } = auditRecorder();

    await useCase(repository, {
      outbox,
      audit: recorder,
      media: mediaAuthority(eligible),
    }).save({
      templateId: TEMPLATE_ID,
      expectedCurrentVersion: 0,
      document: designDocument([imageElement]),
    });

    // Reconciled, but not re-requested: the work is already done or in flight.
    expect(associations).toEqual([ASSET_ID]);
    expect(appended).toHaveLength(0);
  });

  it('refuses an image whose derivative is not in the allowlist, by omission', async () => {
    // The map is empty — a `TEMPLATE_SOURCE` scope miss looks exactly like an
    // id that does not exist, which is what makes the rule fail closed.
    const { repository, associations } = recordingRepository();
    const { outbox, appended } = outboxStore();
    const { recorder } = auditRecorder();

    await expect(
      useCase(repository, { outbox, audit: recorder, media: mediaAuthority([]) }).save({
        templateId: TEMPLATE_ID,
        expectedCurrentVersion: 0,
        document: designDocument([imageElement]),
      }),
    ).rejects.toMatchObject({ name: 'TemplateDocumentRejectedError' });

    expect(associations).toHaveLength(0);
    expect(appended).toHaveLength(0);
  });

  it('refuses a derivative that is not a measured READY NORMALIZED one', async () => {
    const { repository } = recordingRepository();
    const { outbox } = outboxStore();
    const { recorder } = auditRecorder();

    const notReady = [{ ...eligible[0], status: 'PROCESSING' }];
    await expect(
      useCase(repository, { outbox, audit: recorder, media: mediaAuthority(notReady) }).save({
        templateId: TEMPLATE_ID,
        expectedCurrentVersion: 0,
        document: designDocument([imageElement]),
      }),
    ).rejects.toMatchObject({ name: 'TemplateDocumentRejectedError' });
  });
});

describe('what APP3-B03A must never do', () => {
  it('writes the association before the event, inside the transaction', () => {
    const association = USE_CASE_SOURCE.indexOf('ensureAssetAssociation(');
    const append = USE_CASE_SOURCE.indexOf('this.outbox.append(');
    expect(association).toBeGreaterThan(-1);
    expect(append).toBeGreaterThan(association);
    // Both inside `runInTransaction`, which opens before either.
    expect(USE_CASE_SOURCE.indexOf('runInTransaction')).toBeLessThan(association);
  });

  it('never publishes, archives or stamps publishedAt', () => {
    for (const source of [USE_CASE_SOURCE, AUTHORITY_SOURCE]) {
      expect(source).not.toMatch(/publishVersion\(|\.archive\(/);
      expect(source).not.toMatch(/publishedAt:\s*(new Date|at\b)/);
    }
  });

  it('takes no P02 geometry authority', () => {
    // `GRD-T01` is APP3-B04's. A draft may be saved out of bounds.
    expect(AUTHORITY_SOURCE).not.toMatch(/from '@embroidery\/design-engine'/);
    expect(USE_CASE_SOURCE).not.toMatch(/from '@embroidery\/design-engine'/);
  });

  it('never reads object storage to decide a document write', () => {
    for (const source of [USE_CASE_SOURCE, AUTHORITY_SOURCE]) {
      expect(source).not.toMatch(/ObjectStorage|getObject|presign|storageKey/);
    }
  });
});
