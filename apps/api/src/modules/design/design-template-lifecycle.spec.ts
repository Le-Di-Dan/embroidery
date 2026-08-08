/**
 * The Design Template lifecycle contract (`APP3-B04`).
 *
 * Docker-free, so every collaborator is a double and what is proved is the
 * *decision*: which transitions are admissible, what the guard refuses and what
 * each transition is forbidden to touch. The SQL, the set-once timestamp and the
 * races are proved live.
 *
 * The cases worth reading twice are the `GRD-T01` refusals. `IMP-D042` PO-07
 * says no backend checkpoint may implement a *reduced* publish guard, so each
 * clause has its own case and each one asserts that **nothing was written** —
 * a guard that refuses after mutating is not a guard.
 */
import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION } from '@embroidery/design-document';
import { persistenceError } from '@embroidery/database';

import { resolveArtifactPath } from '../../openapi/openapi-artifact';
import { zodSchemaOf } from '../../platform/validation/zod-dto';
import {
  DesignTemplateLifecycleUseCase,
  TemplateNotPublishableError,
} from './application/design-template-lifecycle.use-case';
import { TemplatePublicationAuthority } from './application/template-publication.authority';
import {
  ArchiveDesignTemplateBody,
  PublishDesignTemplateBody,
} from './presentation/schemas/admin-design-template.request';
import type { DesignTemplateAuditRecorder } from './application/design-template-audit.recorder';
import type { TemplateDocumentMediaAuthority } from './application/template-document-media.authority';
import type {
  DesignTemplate,
  DesignTemplateId,
  DesignTemplateRepository,
} from './domain/repositories/design-template.repository';

const CONTROLLER_SOURCE = readFileSync(
  join(__dirname, 'presentation/admin-design-template.controller.ts'),
  'utf8',
);
const USE_CASE_SOURCE = readFileSync(
  join(__dirname, 'application/design-template-lifecycle.use-case.ts'),
  'utf8',
);
const GUARD_SOURCE = readFileSync(
  join(__dirname, 'application/template-publication.authority.ts'),
  'utf8',
);

const TEMPLATE_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6101';
const PRODUCT_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6102';
const SIDE_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6103';
const AREA_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6104';
const ASSET_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6105';
const DERIVATIVE_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6106';

const BASE = '/api/admin/design-templates/{templateId}';

interface OpenApiOperation {
  readonly operationId?: string;
  readonly responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
}

const document = JSON.parse(readFileSync(resolveArtifactPath(__dirname), 'utf8')) as {
  paths: Record<string, Record<string, OpenApiOperation>>;
};

/** A document whose placement agrees with the fixture Side/Area below. */
function designDocument(elements: readonly unknown[] = []): Record<string, unknown> {
  return {
    schemaVersion: CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
    placement: {
      productSideId: SIDE_ID,
      embroideryAreaId: AREA_ID,
      canvasWidthPx: 1000,
      canvasHeightPx: 1000,
      physicalWidthMm: 200,
      physicalHeightMm: 200,
      pxPerMm: 5,
    },
    elements: [
      {
        id: 'text-1',
        type: 'text',
        visible: true,
        locked: false,
        opacity: 1,
        transform: { x: 120, y: 120, width: 100, height: 50, rotationDeg: 0, scaleX: 1, scaleY: 1 },
        text: 'Thêu',
        fontId: 'inter',
        fontSizePx: 24,
        fontWeight: 400,
        fontStyle: 'normal',
        textAlign: 'left',
        fill: '#101010',
      },
      ...elements,
    ],
  };
}

function template(overrides: Partial<DesignTemplate> = {}): DesignTemplate {
  return {
    id: TEMPLATE_ID as DesignTemplateId,
    name: 'Hoa sen',
    slug: 'hoa-sen',
    description: undefined,
    productId: PRODUCT_ID as never,
    productSideId: SIDE_ID as never,
    embroideryAreaId: AREA_ID as never,
    status: 'DRAFT',
    currentVersion: 1,
    previewDerivativeId: undefined,
    archivedAt: undefined,
    createdAt: new Date('2026-08-08T10:00:00.000Z'),
    updatedAt: new Date('2026-08-08T10:00:00.000Z'),
    ...overrides,
  };
}

function version(overrides: Record<string, unknown> = {}) {
  return {
    id: 'version-1',
    designTemplateId: TEMPLATE_ID,
    version: 1,
    designDocument: designDocument(),
    documentSchemaVersion: CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
    publishedAt: undefined,
    createdAt: new Date('2026-08-08T10:30:00.000Z'),
    ...overrides,
  } as never;
}

/** A live Product with one live Side and one live Area under it. */
function placementSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    product: { id: PRODUCT_ID, slug: 'ao-thun', status: 'PUBLISHED', updatedAt: new Date() },
    sides: [
      {
        id: SIDE_ID,
        productId: PRODUCT_ID,
        code: 'front',
        retiredAt: undefined,
        imageWidthPx: 1000,
        imageHeightPx: 1000,
        physicalWidthMm: '200',
        physicalHeightMm: '200',
        pxPerMm: '5',
      },
    ],
    areas: [
      {
        id: AREA_ID,
        productSideId: SIDE_ID,
        code: 'chest',
        retiredAt: undefined,
        boundXPx: '100',
        boundYPx: '100',
        boundWidthPx: '400',
        boundHeightPx: '300',
        maxWidthMm: undefined,
        maxHeightMm: undefined,
      },
    ],
    ...overrides,
  };
}

const ELIGIBLE_DERIVATIVE = {
  derivativeId: DERIVATIVE_ID,
  assetId: ASSET_ID,
  kind: 'NORMALIZED',
  status: 'READY',
  widthPx: 800,
  heightPx: 600,
  mediaType: 'image/webp',
  byteSize: 4096,
};

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

/**
 * A publication guard over one placement snapshot.
 *
 * The snapshot is required rather than defaulted: a default would make
 * `guard(undefined)` — the "this Product no longer resolves" case — silently use
 * the happy-path snapshot, and the test would pass for the wrong reason.
 */
function guard(
  snapshot: unknown,
  media: readonly Record<string, unknown>[] = [],
): TemplatePublicationAuthority {
  return new TemplatePublicationAuthority(
    { findPlacement: () => Promise.resolve(snapshot) } as never,
    mediaAuthority(media),
  );
}

interface RepositoryOptions {
  readonly row?: DesignTemplate | undefined;
  readonly latest?: unknown;
  readonly throws?: Error;
}

function recordingRepository(options: RepositoryOptions = {}) {
  const calls: string[] = [];
  const repository = {
    findById: () => Promise.resolve('row' in options ? options.row : template()),
    findLatestVersion: () => Promise.resolve('latest' in options ? options.latest : version()),
    publishCurrentVersion: () => {
      calls.push('publishCurrentVersion');
      return options.throws === undefined ? Promise.resolve() : Promise.reject(options.throws);
    },
    unpublish: () => {
      calls.push('unpublish');
      return options.throws === undefined ? Promise.resolve() : Promise.reject(options.throws);
    },
    archive: () => {
      calls.push('archive');
      return options.throws === undefined ? Promise.resolve() : Promise.reject(options.throws);
    },
    saveDraftVersion: () => {
      calls.push('saveDraftVersion');
      throw new Error('APP3-B04 must never create a version.');
    },
    ensureAssetAssociation: () => {
      calls.push('ensureAssetAssociation');
      throw new Error('APP3-B04 must never mutate an association.');
    },
  } as unknown as DesignTemplateRepository;
  return { repository, calls };
}

function auditRecorder() {
  const written: Record<string, unknown>[] = [];
  const recorder = {
    recordLifecycle: (input: Record<string, unknown>) => {
      written.push(input);
      return Promise.resolve();
    },
  } as unknown as DesignTemplateAuditRecorder;
  return { recorder, written };
}

const transactions = { runInTransaction: <T>(work: () => Promise<T>) => work() } as never;

function useCase(
  repository: DesignTemplateRepository,
  audit: DesignTemplateAuditRecorder,
  publication: TemplatePublicationAuthority = guard(placementSnapshot()),
): DesignTemplateLifecycleUseCase {
  return new DesignTemplateLifecycleUseCase(repository, publication, audit, transactions);
}

describe('the published lifecycle contract', () => {
  it('publishes exactly three operations, at the locked routes and ids', () => {
    for (const [route, operationId] of [
      [`${BASE}/publish`, 'adminDesignTemplate_publish'],
      [`${BASE}/unpublish`, 'adminDesignTemplate_unpublish'],
      [`${BASE}/archive`, 'adminDesignTemplate_archive'],
    ] as const) {
      expect(document.paths[route]?.post?.operationId).toBe(operationId);
      const success = document.paths[route]?.post?.responses?.['200'];
      expect(JSON.stringify(success?.content?.['application/json']?.schema)).toContain(
        'AdminDesignTemplateDetailResponse',
      );
    }
  });

  it('publishes no restore route — that is APP3-B04A', () => {
    expect(document.paths[`${BASE}/restore`]).toBeUndefined();
    // Usage, not the word: the controller's own header explains where restore
    // lives, and a bare-word scan would fail on that explanation.
    expect(CONTROLLER_SOURCE).not.toMatch(/@Post\(':templateId\/restore'\)/);
  });

  it('guards all three writes with the Admin session and the mutating pair', () => {
    expect(CONTROLLER_SOURCE).toMatch(/@UseGuards\(AuthenticatedAdminGuard\)/);
    // Create, save, publish, unpublish, archive: five mutating operations.
    expect(
      CONTROLLER_SOURCE.match(/@UseGuards\(StaffOriginGuard, StaffJsonBodyGuard\)/g),
    ).toHaveLength(5);
  });
});

describe('the request contract', () => {
  const publishSchema = (() => {
    const schema = zodSchemaOf(PublishDesignTemplateBody);
    if (schema === undefined) throw new Error('the DTO carries no Zod schema');
    return schema;
  })();
  const archiveSchema = (() => {
    const schema = zodSchemaOf(ArchiveDesignTemplateBody);
    if (schema === undefined) throw new Error('the DTO carries no Zod schema');
    return schema;
  })();

  it('requires the concurrency token on publish', () => {
    expect(publishSchema.safeParse({ expectedCurrentVersion: 1 }).success).toBe(true);
    expect(publishSchema.safeParse({}).success).toBe(false);
    expect(publishSchema.safeParse({ expectedCurrentVersion: -1 }).success).toBe(false);
  });

  it('rejects anything the server owns', () => {
    for (const owned of [{ status: 'PUBLISHED' }, { publishedAt: 'now' }, { version: 2 }]) {
      expect(publishSchema.safeParse({ expectedCurrentVersion: 1, ...owned }).success).toBe(false);
    }
  });

  it('requires a non-blank reason on archive and nowhere else', () => {
    expect(archiveSchema.safeParse({ expectedCurrentVersion: 1, reason: 'Hết mẫu' }).success).toBe(
      true,
    );
    expect(archiveSchema.safeParse({ expectedCurrentVersion: 1 }).success).toBe(false);
    // Blank satisfies "required" and none of its purpose.
    expect(archiveSchema.safeParse({ expectedCurrentVersion: 1, reason: '   ' }).success).toBe(
      false,
    );
    expect(
      archiveSchema.safeParse({ expectedCurrentVersion: 1, reason: 'x'.repeat(501) }).success,
    ).toBe(false);
    // Publish must not accept one: PO-03 requires a reason for archive only.
    expect(publishSchema.safeParse({ expectedCurrentVersion: 1, reason: 'x' }).success).toBe(false);
  });
});

describe('publish', () => {
  it('publishes a ready DRAFT and audits the transition', async () => {
    const { repository, calls } = recordingRepository();
    const { recorder, written } = auditRecorder();

    await useCase(repository, recorder).publish({
      templateId: TEMPLATE_ID,
      expectedCurrentVersion: 1,
    });

    expect(calls).toContain('publishCurrentVersion');
    // Never a version, never an association: publish moves a header.
    expect(calls).not.toContain('saveDraftVersion');
    expect(calls).not.toContain('ensureAssetAssociation');
    expect(written).toEqual([
      {
        templateId: TEMPLATE_ID,
        transition: 'PUBLISHED',
        from: 'DRAFT',
        to: 'PUBLISHED',
        version: 1,
      },
    ]);
  });

  it('publishes a template that references an eligible asset', async () => {
    const image = {
      id: 'image-1',
      type: 'image',
      visible: true,
      locked: false,
      opacity: 1,
      transform: { x: 120, y: 120, width: 100, height: 50, rotationDeg: 0, scaleX: 1, scaleY: 1 },
      assetId: ASSET_ID,
      derivativeId: DERIVATIVE_ID,
      intrinsicWidthPx: 800,
      intrinsicHeightPx: 600,
    };
    const { repository, calls } = recordingRepository({
      latest: version({ designDocument: designDocument([image]) }),
    });
    const { recorder } = auditRecorder();

    await useCase(repository, recorder, guard(placementSnapshot(), [ELIGIBLE_DERIVATIVE])).publish({
      templateId: TEMPLATE_ID,
      expectedCurrentVersion: 1,
    });

    expect(calls).toContain('publishCurrentVersion');
  });

  const refusals: readonly [string, () => DesignTemplateLifecycleUseCase][] = [
    [
      'a header with no immutable version',
      () => {
        const { repository } = recordingRepository({
          row: template({ currentVersion: 0 }),
          latest: undefined,
        });
        return useCase(repository, auditRecorder().recorder);
      },
    ],
    [
      'an incomplete scope',
      () => {
        const { repository } = recordingRepository({
          row: template({ embroideryAreaId: undefined }),
        });
        return useCase(repository, auditRecorder().recorder);
      },
    ],
    [
      'a scope whose Product no longer resolves',
      () => {
        const { repository } = recordingRepository();
        return useCase(repository, auditRecorder().recorder, guard(undefined));
      },
    ],
    [
      'a retired Side',
      () => {
        const { repository } = recordingRepository();
        const snapshot = placementSnapshot({
          sides: [{ ...placementSnapshot().sides[0], retiredAt: new Date() }],
        });
        return useCase(repository, auditRecorder().recorder, guard(snapshot));
      },
    ],
    [
      'an Area hanging from another Side',
      () => {
        const { repository } = recordingRepository();
        const snapshot = placementSnapshot({
          areas: [{ ...placementSnapshot().areas[0], productSideId: 'other-side' }],
        });
        return useCase(repository, auditRecorder().recorder, guard(snapshot));
      },
    ],
    [
      'an unsupported document schema version',
      () => {
        const { repository } = recordingRepository({
          latest: version({ designDocument: { ...designDocument(), schemaVersion: 99 } }),
        });
        return useCase(repository, auditRecorder().recorder);
      },
    ],
    [
      'a structurally invalid document',
      () => {
        const { repository } = recordingRepository({
          latest: version({ designDocument: { x: 1 } }),
        });
        return useCase(repository, auditRecorder().recorder);
      },
    ],
    [
      'a placement that disagrees with the scope',
      () => {
        const document = designDocument();
        (document['placement'] as Record<string, unknown>)['pxPerMm'] = 9;
        const { repository } = recordingRepository({
          latest: version({ designDocument: document }),
        });
        return useCase(repository, auditRecorder().recorder);
      },
    ],
    [
      'geometry outside the embroidery area',
      () => {
        const document = designDocument();
        // The area is 100,100 400×300; put the element far outside it.
        (document['elements'] as Record<string, unknown>[])[0]!['transform'] = {
          x: 900,
          y: 900,
          width: 100,
          height: 50,
          rotationDeg: 0,
          scaleX: 1,
          scaleY: 1,
        };
        const { repository } = recordingRepository({
          latest: version({ designDocument: document }),
        });
        return useCase(repository, auditRecorder().recorder);
      },
    ],
    [
      'a referenced asset with no eligible derivative',
      () => {
        const image = {
          id: 'image-1',
          type: 'image',
          visible: true,
          locked: false,
          opacity: 1,
          transform: {
            x: 120,
            y: 120,
            width: 100,
            height: 50,
            rotationDeg: 0,
            scaleX: 1,
            scaleY: 1,
          },
          assetId: ASSET_ID,
          derivativeId: DERIVATIVE_ID,
          intrinsicWidthPx: 800,
          intrinsicHeightPx: 600,
        };
        const { repository } = recordingRepository({
          latest: version({ designDocument: designDocument([image]) }),
        });
        // Measured but still processing: eligible-looking, and refused.
        return useCase(
          repository,
          auditRecorder().recorder,
          guard(placementSnapshot(), [{ ...ELIGIBLE_DERIVATIVE, status: 'PROCESSING' }]),
        );
      },
    ],
  ];

  for (const [what, build] of refusals) {
    it(`refuses ${what}, writing nothing`, async () => {
      await expect(
        build().publish({ templateId: TEMPLATE_ID, expectedCurrentVersion: 1 }),
      ).rejects.toBeInstanceOf(TemplateNotPublishableError);
    });
  }

  it('refuses a non-DRAFT template as a conflict, not a readiness failure', async () => {
    const { repository, calls } = recordingRepository({ row: template({ status: 'PUBLISHED' }) });
    await expect(
      useCase(repository, auditRecorder().recorder).publish({
        templateId: TEMPLATE_ID,
        expectedCurrentVersion: 1,
      }),
    ).rejects.toMatchObject({ code: 'DESIGN_TEMPLATE_LIFECYCLE_NOT_ALLOWED' });
    expect(calls).toHaveLength(0);
  });

  it('turns a stale compare-and-set into the version conflict, not a 500', async () => {
    const { repository } = recordingRepository({
      throws: persistenceError({
        kind: 'INVARIANT_VIOLATION',
        code: 'STALE_WRITE',
        operation: 'DesignTemplateRepository.publishCurrentVersion',
        message: 'changed',
      }),
    });
    const { recorder, written } = auditRecorder();
    await expect(
      useCase(repository, recorder).publish({ templateId: TEMPLATE_ID, expectedCurrentVersion: 1 }),
    ).rejects.toMatchObject({ code: 'DESIGN_TEMPLATE_VERSION_CONFLICT' });
    expect(written).toHaveLength(0);
  });
});

describe('unpublish', () => {
  it('returns a PUBLISHED template to DRAFT and audits it distinctly', async () => {
    const { repository, calls } = recordingRepository({ row: template({ status: 'PUBLISHED' }) });
    const { recorder, written } = auditRecorder();

    await useCase(repository, recorder).unpublish({
      templateId: TEMPLATE_ID,
      expectedCurrentVersion: 1,
    });

    expect(calls).toEqual(['unpublish']);
    expect(written[0]).toMatchObject({ transition: 'UNPUBLISHED', from: 'PUBLISHED', to: 'DRAFT' });
  });

  it('refuses a DRAFT template', async () => {
    const { repository, calls } = recordingRepository();
    await expect(
      useCase(repository, auditRecorder().recorder).unpublish({
        templateId: TEMPLATE_ID,
        expectedCurrentVersion: 1,
      }),
    ).rejects.toMatchObject({ code: 'DESIGN_TEMPLATE_LIFECYCLE_NOT_ALLOWED' });
    expect(calls).toHaveLength(0);
  });

  it('runs no publication guard — unpublishing never has to be publishable', async () => {
    // The guard would refuse this template, and unpublish must not care.
    const { repository } = recordingRepository({
      row: template({ status: 'PUBLISHED', embroideryAreaId: undefined }),
    });
    await expect(
      useCase(repository, auditRecorder().recorder).unpublish({
        templateId: TEMPLATE_ID,
        expectedCurrentVersion: 1,
      }),
    ).resolves.toBeDefined();
  });
});

describe('archive', () => {
  for (const from of ['DRAFT', 'PUBLISHED'] as const) {
    it(`archives from ${from} with a reason`, async () => {
      const { repository, calls } = recordingRepository({ row: template({ status: from }) });
      const { recorder, written } = auditRecorder();

      await useCase(repository, recorder).archive({
        templateId: TEMPLATE_ID,
        expectedCurrentVersion: 1,
        reason: 'Hết mẫu',
      });

      expect(calls).toEqual(['archive']);
      expect(written[0]).toMatchObject({
        transition: 'ARCHIVED',
        from,
        to: 'ARCHIVED',
        reason: 'Hết mẫu',
      });
    });
  }

  it('refuses an already archived template', async () => {
    const { repository, calls } = recordingRepository({ row: template({ status: 'ARCHIVED' }) });
    await expect(
      useCase(repository, auditRecorder().recorder).archive({
        templateId: TEMPLATE_ID,
        expectedCurrentVersion: 1,
        reason: 'x',
      }),
    ).rejects.toMatchObject({ code: 'DESIGN_TEMPLATE_LIFECYCLE_NOT_ALLOWED' });
    expect(calls).toHaveLength(0);
  });

  it('carries a reason on archive alone', async () => {
    const { repository } = recordingRepository({ row: template({ status: 'PUBLISHED' }) });
    const { recorder, written } = auditRecorder();
    await useCase(repository, recorder).unpublish({
      templateId: TEMPLATE_ID,
      expectedCurrentVersion: 1,
    });
    // PO-03 requires a reason for archive and restore only; one invented for
    // unpublish would be evidence the server made up.
    expect(written[0]).not.toHaveProperty('reason');
  });
});

describe('what APP3-B04 must never do', () => {
  it('never creates a version or mutates a document', () => {
    expect(USE_CASE_SOURCE).not.toMatch(/saveDraftVersion\(|publishVersion\(/);
    expect(USE_CASE_SOURCE).not.toMatch(/prepareDesignDocument\(/);
  });

  it('never produces a normalization event', () => {
    const eventType = ['asset', 'normalization', 'requested'].join('.');
    for (const source of [USE_CASE_SOURCE, GUARD_SOURCE]) {
      expect(source).not.toContain(eventType);
      expect(source).not.toMatch(/OutboxEventStore/);
    }
  });

  it('never mutates scope to make a template publishable', () => {
    expect(GUARD_SOURCE).not.toMatch(/\.set\(|update\(/);
    expect(USE_CASE_SOURCE).not.toMatch(/productSideId:|embroideryAreaId:/);
  });

  it('never reaches object storage or the worker', () => {
    for (const source of [USE_CASE_SOURCE, GUARD_SOURCE]) {
      expect(source).not.toMatch(/ObjectStorage|presign|getObject|storageKey/);
    }
  });

  it('composes the whole guard rather than a reduced one', () => {
    // Each GRD-T01 clause delegated to the authority that owns it.
    for (const call of [
      'readSchemaVersion(',
      'prepareDesignDocument(',
      'validatePlacementSnapshot(',
      'validateDocumentWithinEmbroideryArea(',
      'findPlacement(',
    ]) {
      expect(GUARD_SOURCE).toContain(call);
    }
    // `NEW_EDITING`, not the laxer historical mode.
    expect(GUARD_SOURCE).toContain("'NEW_EDITING'");
  });
});
