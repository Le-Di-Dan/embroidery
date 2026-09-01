/**
 * The client-facing publication surface, without a database.
 *
 * Routes, operation ids, guards, strict bodies, the safe projections, and the
 * exact audit and outbox rows a transition leaves. The projection cases are
 * written as leak tests rather than shape tests — the risk is not a missing
 * field, it is an extra one.
 */
import 'reflect-metadata';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';

import { AuthenticatedAdminGuard } from '../../identity/presentation/guards/authenticated-admin.guard';
import { StaffJsonBodyGuard } from '../../identity/presentation/guards/staff-json-body.guard';
import { StaffOriginGuard } from '../../identity/presentation/guards/staff-origin.guard';
import { AdminProductPublicationController } from '../presentation/admin-product-publication.controller';
import { publicationCommandBodySchema } from '../presentation/schemas/admin-product-publication.request';
import { productIdParamSchema } from '../presentation/schemas/admin-product.request';
import {
  PRODUCT_PUBLICATION_REQUIREMENT_CODES,
  PRODUCT_PUBLISHABLE_STATES,
  PRODUCT_UNPUBLISHABLE_STATES,
  PRODUCT_UNPUBLISHED_STATE,
} from '../domain/product-publication.policy';
import { evaluatePublicationReadiness } from '../domain/product-publication.readiness';
import type { ProductDraft, ProductDraftId } from '../domain/repositories/product-draft.repository';
import { toPublicationView, toReadinessView } from './product-publication.projection';
import {
  PRODUCT_PUBLICATION_PAYLOAD_VERSION,
  PRODUCT_PUBLISHED_ACTION,
  PRODUCT_UNPUBLISHED_ACTION,
  ProductPublicationRecorder,
} from './product-publication.recorder';

const PRODUCT_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const TOKEN = '2026-08-01T09:15:42.317Z';

function productAt(overrides: Partial<ProductDraft> = {}): ProductDraft {
  return {
    id: PRODUCT_ID as ProductDraftId,
    categoryId: 'a5b1d2c3-0000-4000-8000-000000000001',
    categorySlug: 'thu-bong',
    categoryName: 'Thú bông',
    name: 'Gấu bông thỏ trắng',
    slug: 'gau-bong-tho-trang',
    description: 'Gấu bông thêu tay.',
    basePriceAmount: '250000.00',
    currencyCode: 'VND',
    status: 'DRAFT',
    displayOrder: 0,
    archivedAt: undefined,
    createdAt: new Date('2026-07-30T08:00:00.000Z'),
    updatedAt: new Date(TOKEN),
    ...overrides,
  };
}

function handler(method: keyof AdminProductPublicationController) {
  return AdminProductPublicationController.prototype[method] as unknown as object;
}

function guardsOn(method: keyof AdminProductPublicationController): unknown[] {
  return (Reflect.getMetadata(GUARDS_METADATA, handler(method)) as unknown[]) ?? [];
}

describe('publication HTTP contract', () => {
  it('registers exactly three operations on the Admin product resource', () => {
    const methods: (keyof AdminProductPublicationController)[] = [
      'publicationReadiness',
      'publish',
      'unpublish',
    ];
    expect(Reflect.getMetadata(PATH_METADATA, AdminProductPublicationController)).toBe(
      'admin/products',
    );
    expect(
      methods.map((name) => Reflect.getMetadata(PATH_METADATA, handler(name)) as string),
    ).toEqual([':productId/publication-readiness', ':productId/publish', ':productId/unpublish']);
    expect(
      methods.map((name) => Reflect.getMetadata(METHOD_METADATA, handler(name)) as number),
    ).toEqual([RequestMethod.GET, RequestMethod.POST, RequestMethod.POST]);
  });

  it('states the exact operation ids the generated client exposes', () => {
    // `swagger/apiOperation` is the metadata key `@ApiOperation` writes. Read by
    // its literal name rather than through `@nestjs/swagger/dist/*`, which is
    // package-internal and not a resolvable entry point. The end-to-end proof
    // that these ids reach the artifact lives in `build-openapi-document.spec`.
    const idOf = (method: keyof AdminProductPublicationController) =>
      (
        Reflect.getMetadata('swagger/apiOperation', handler(method)) as {
          operationId?: string;
        }
      )?.operationId;

    expect(idOf('publicationReadiness')).toBe('adminProduct_publicationReadiness');
    expect(idOf('publish')).toBe('adminProduct_publish');
    expect(idOf('unpublish')).toBe('adminProduct_unpublish');
  });

  it('guards every route with the authenticated Admin guard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminProductPublicationController)).toEqual([
      AuthenticatedAdminGuard,
    ]);
  });

  it('adds origin and JSON body guards to the two mutations only', () => {
    expect(guardsOn('publish')).toEqual([StaffOriginGuard, StaffJsonBodyGuard]);
    expect(guardsOn('unpublish')).toEqual([StaffOriginGuard, StaffJsonBodyGuard]);
    // Readiness is a read: it takes no body, so a body guard would document a
    // contract it does not have.
    expect(guardsOn('publicationReadiness')).toEqual([]);
  });
});

describe('publication request validation', () => {
  it('requires the concurrency token', () => {
    expect(publicationCommandBodySchema.safeParse({}).success).toBe(false);
  });

  it('accepts an offset-qualified instant only', () => {
    expect(publicationCommandBodySchema.safeParse({ expectedUpdatedAt: TOKEN }).success).toBe(true);
    expect(
      publicationCommandBodySchema.safeParse({ expectedUpdatedAt: '2026-08-01 09:15:42' }).success,
    ).toBe(false);
  });

  it('rejects every unknown field rather than dropping it', () => {
    for (const extra of [
      { status: 'PUBLISHED' },
      { reason: 'vì khách hàng yêu cầu' },
      { publishedAt: TOKEN },
      { slug: 'gau-bong' },
      { force: true },
    ]) {
      expect(
        publicationCommandBodySchema.safeParse({ expectedUpdatedAt: TOKEN, ...extra }).success,
      ).toBe(false);
    }
  });

  it('rejects a product id that is not a UUID before any repository call', () => {
    expect(productIdParamSchema.safeParse({ productId: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('publication projections', () => {
  it('publishes exactly the five readiness fields', () => {
    const view = toReadinessView(
      productAt(),
      evaluatePublicationReadiness({
        product: {
          name: 'x',
          slug: 'x',
          description: undefined,
          basePriceAmount: '0.00',
          currencyCode: 'VND',
        },
        category: undefined,
        media: [],
        assets: [],
        derivatives: [],
      }),
    );
    expect(Object.keys(view).sort()).toEqual([
      'eligible',
      'productId',
      'requirements',
      'status',
      'updatedAt',
    ]);
    expect(view.requirements.map((r) => r.code)).toEqual([
      ...PRODUCT_PUBLICATION_REQUIREMENT_CODES,
    ]);
    expect(Object.keys(view.requirements[0] ?? {}).sort()).toEqual(['code', 'satisfied']);
  });

  it('publishes exactly the four transition fields', () => {
    expect(Object.keys(toPublicationView(productAt({ status: 'PUBLISHED' }))).sort()).toEqual([
      'productId',
      'slug',
      'status',
      'updatedAt',
    ]);
  });

  it('never exposes the category id, archive stamp or any internal fact', () => {
    const serialized = JSON.stringify({
      readiness: toReadinessView(
        productAt(),
        evaluatePublicationReadiness({
          product: productAt(),
          category: { status: 'PUBLISHED', archivedAt: undefined },
          media: [],
          assets: [],
          derivatives: [],
        }),
      ),
      transition: toPublicationView(productAt()),
    });
    for (const leak of [
      'a5b1d2c3-0000-4000-8000-000000000001',
      'categoryId',
      'storageKey',
      'checksum',
      'archivedAt',
      'basePriceAmount',
      'description',
    ]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it('publishes the token the database stored, at millisecond precision', () => {
    expect(toPublicationView(productAt()).updatedAt).toBe(TOKEN);
  });
});

describe('publication lifecycle policy', () => {
  it('publishes only from DRAFT and unpublishes only from PUBLISHED', () => {
    expect([...PRODUCT_PUBLISHABLE_STATES]).toEqual(['DRAFT']);
    expect([...PRODUCT_UNPUBLISHABLE_STATES]).toEqual(['PUBLISHED']);
  });

  it('returns an unpublished product to the existing editable draft state', () => {
    // TR-LC04-05 explicitly introduces no `UNPUBLISHED` state.
    expect(PRODUCT_UNPUBLISHED_STATE).toBe('DRAFT');
  });
});

describe('durable publication evidence', () => {
  function recorderWith() {
    const audits: Record<string, unknown>[] = [];
    const events: Record<string, unknown>[] = [];
    const recorder = new ProductPublicationRecorder(
      {
        append: (input: Record<string, unknown>) => {
          audits.push(input);
          return Promise.resolve();
        },
      } as never,
      {
        append: (input: Record<string, unknown>) => {
          events.push(input);
          return Promise.resolve(1n);
        },
      } as never,
      {
        requireRequestId: () => 'req-0123456789',
        requireActor: () => ({ kind: 'ADMIN', adminId: 'admin-1' }),
      } as never,
      { now: () => new Date('2026-08-01T09:15:42.317Z') },
    );
    return { recorder, audits, events };
  }

  it('appends one audit row and one outbox event per publish', async () => {
    const { recorder, audits, events } = recorderWith();
    await recorder.record({
      transition: 'PUBLISHED',
      productId: PRODUCT_ID,
      slug: 'gau-bong-tho-trang',
      fromStatus: 'DRAFT',
      toStatus: 'PUBLISHED',
    });

    expect(audits).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: PRODUCT_PUBLISHED_ACTION,
      targetKind: 'PRODUCT',
      targetId: PRODUCT_ID,
      actor: { kind: 'ADMIN', adminId: 'admin-1' },
      summary: { from: 'DRAFT', to: 'PUBLISHED' },
      correlationId: 'req-0123456789',
    });
    // Deliberately absent: the R on the Product/catalog audit row is
    // archive/unarchive only.
    expect(audits[0]).not.toHaveProperty('reason');
  });

  it('uses the distinct unpublish vocabulary', async () => {
    const { recorder, audits, events } = recorderWith();
    await recorder.record({
      transition: 'UNPUBLISHED',
      productId: PRODUCT_ID,
      slug: 'gau-bong-tho-trang',
      fromStatus: 'PUBLISHED',
      toStatus: 'DRAFT',
    });
    expect(audits[0]).toMatchObject({ action: PRODUCT_UNPUBLISHED_ACTION });
    expect(events[0]).toMatchObject({ eventType: PRODUCT_UNPUBLISHED_ACTION });
    expect(PRODUCT_PUBLISHED_ACTION).not.toBe(PRODUCT_UNPUBLISHED_ACTION);
  });

  it('emits a minimal versioned outbox payload and nothing else', async () => {
    const { recorder, events } = recorderWith();
    await recorder.record({
      transition: 'PUBLISHED',
      productId: PRODUCT_ID,
      slug: 'gau-bong-tho-trang',
      fromStatus: 'DRAFT',
      toStatus: 'PUBLISHED',
    });

    expect(events[0]).toMatchObject({
      eventType: 'product.published',
      aggregateKind: 'PRODUCT',
      aggregateId: PRODUCT_ID,
      payloadSchemaVersion: PRODUCT_PUBLICATION_PAYLOAD_VERSION,
    });
    expect(Object.keys(events[0]?.['payload'] as object).sort()).toEqual([
      'productId',
      'schemaVersion',
      'slug',
    ]);
  });

  it('refuses to attribute a transition to a non-Admin actor', async () => {
    const recorder = new ProductPublicationRecorder(
      { append: () => Promise.resolve() } as never,
      { append: () => Promise.resolve(1n) } as never,
      {
        requireRequestId: () => 'req-0123456789',
        requireActor: () => ({ kind: 'SYSTEM', systemJobKey: 'whatever' }),
      } as never,
      { now: () => new Date() },
    );
    await expect(
      recorder.record({
        transition: 'PUBLISHED',
        productId: PRODUCT_ID,
        slug: 's',
        fromStatus: 'DRAFT',
        toStatus: 'PUBLISHED',
      }),
    ).rejects.toThrow(/Admin actor/);
  });
});
