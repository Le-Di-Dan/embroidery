/**
 * The Admin Side-background contract, wiring and delivery policy (`APP3-B02A`).
 *
 * Docker-free. Three groups of fact are pinned here that no other suite can see:
 *
 *  - **the HTTP contract** — one operation, its derived id, the route it
 *    composes to, and that `AuthenticatedAdminGuard` is attached. An admin route
 *    without a guard compiles, passes every behavioural test against a mocked
 *    service, and quietly publishes an unpublished product's media;
 *  - **what the delivery refuses** — the service opens no object until the
 *    contextual read has succeeded, and it will not stream an object whose size
 *    contradicts the row;
 *  - **what the module cannot reach** — no upload, no mutation, no presign, no
 *    asset-by-id route, no second operation.
 */
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GUARDS_METADATA, PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Readable } from 'node:stream';
import { ObjectStorageError } from '@embroidery/object-storage';

import { GLOBAL_ROUTE_PREFIX } from '../../bootstrap/api-application';
import { createOperationId } from '../../openapi/operation-id';
import { AuthenticatedAdminGuard } from '../identity/presentation/guards/authenticated-admin.guard';
import { StaffOriginGuard } from '../identity/presentation/guards/staff-origin.guard';
import { AdminSideBackgroundService } from './application/admin-side-background.service';
import { AdminProductSideBackgroundController } from './presentation/admin-product-side-background.controller';
import { adminSideBackgroundParamsSchema } from './presentation/schemas/admin-side-background.request';
import {
  ADMIN_SIDE_BACKGROUND_CACHE_CONTROL,
  ADMIN_SIDE_BACKGROUND_BUCKET,
  ADMIN_SIDE_BACKGROUND_MEDIA_TYPES,
} from './domain/admin-side-background.policy';
import { ADMIN_SIDE_BACKGROUND_ERROR_CODES } from './domain/admin-side-background.errors';
import type { AdminSideBackgroundDescriptor } from './domain/repositories/admin-side-background.repository';

/**
 * Strips comments so the rules below inspect executable code only.
 *
 * Without this, a file that *documents* which predicates it deliberately omits
 * fails the very rule asserting they are omitted — which would make this suite
 * an argument against writing the explanation down.
 */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const MODULE_SOURCE = code(
  readFileSync(join(__dirname, 'catalog-admin-side-background.module.ts'), 'utf8'),
);
const SERVICE_SOURCE = code(
  readFileSync(join(__dirname, 'application', 'admin-side-background.service.ts'), 'utf8'),
);
const REPOSITORY_SOURCE = code(
  readFileSync(
    join(__dirname, 'infrastructure', 'persistence', 'drizzle-admin-side-background.repository.ts'),
    'utf8',
  ),
);

const PRODUCT_ID = '01920000-0000-7000-8000-000000000001';
const SIDE_ID = '01920000-0000-7000-8000-0000000000a1';

function handler(): object {
  const descriptor = Object.getOwnPropertyDescriptor(
    AdminProductSideBackgroundController.prototype,
    'get',
  );
  if (descriptor === undefined) throw new Error('The controller declares no `get` handler.');
  return descriptor.value as object;
}

describe('HTTP contract', () => {
  it('registers exactly one operation', () => {
    const handlers = Object.getOwnPropertyNames(
      AdminProductSideBackgroundController.prototype,
    ).filter((name) => name !== 'constructor');

    expect(handlers).toEqual(['get']);
  });

  it('composes the derived Admin route', () => {
    const controllerPath = Reflect.getMetadata(
      PATH_METADATA,
      AdminProductSideBackgroundController,
    ) as string;
    const handlerPath = Reflect.getMetadata(PATH_METADATA, handler()) as string;
    const composed = [GLOBAL_ROUTE_PREFIX, controllerPath, handlerPath]
      .filter((segment) => segment !== '' && segment !== '/')
      .join('/');

    expect(composed).toBe('api/admin/products/:productId/sides/:sideId/background');
  });

  it('is a GET', () => {
    // RequestMethod.GET === 0.
    expect(Reflect.getMetadata(METHOD_METADATA, handler())).toBe(0);
  });

  it('derives the operation id the client is generated from', () => {
    expect(createOperationId(AdminProductSideBackgroundController.name, 'get')).toBe(
      'adminProductSideBackground_get',
    );
  });

  it('attaches the authenticated Admin guard', () => {
    const guards = (Reflect.getMetadata(GUARDS_METADATA, AdminProductSideBackgroundController) ??
      []) as unknown[];

    expect(guards).toContain(AuthenticatedAdminGuard);
  });

  it('attaches no Origin guard to a read', () => {
    // StaffOriginGuard protects mutations from cross-origin posts. On a GET it
    // would reject the plain `<img src>` an authoring screen uses, which sends
    // no Origin at all.
    const controllerGuards = (Reflect.getMetadata(
      GUARDS_METADATA,
      AdminProductSideBackgroundController,
    ) ?? []) as unknown[];
    const handlerGuards = (Reflect.getMetadata(GUARDS_METADATA, handler()) ?? []) as unknown[];

    expect([...controllerGuards, ...handlerGuards]).not.toContain(StaffOriginGuard);
  });

  it('accepts two UUIDs and nothing else', () => {
    expect(
      adminSideBackgroundParamsSchema.safeParse({ productId: PRODUCT_ID, sideId: SIDE_ID }).success,
    ).toBe(true);
    expect(
      adminSideBackgroundParamsSchema.safeParse({ productId: 'not-a-uuid', sideId: SIDE_ID })
        .success,
    ).toBe(false);
    // `.strict()`: an extra segment cannot smuggle a value into the query.
    expect(
      adminSideBackgroundParamsSchema.safeParse({
        productId: PRODUCT_ID,
        sideId: SIDE_ID,
        slug: 'x',
      }).success,
    ).toBe(false);
  });
});

describe('delivery policy', () => {
  it('serves only the editor-safe raster types, never SVG', () => {
    expect([...ADMIN_SIDE_BACKGROUND_MEDIA_TYPES]).not.toContain('image/svg+xml');
    expect(ADMIN_SIDE_BACKGROUND_MEDIA_TYPES.length).toBeGreaterThan(0);
  });

  it('serves derivatives, never the private originals bucket', () => {
    expect(ADMIN_SIDE_BACKGROUND_BUCKET).toBe('DERIVATIVES');
  });

  it('never allows a response to be cached', () => {
    // These bytes may belong to a product that was never published.
    expect(ADMIN_SIDE_BACKGROUND_CACHE_CONTROL).toBe('no-store');
  });

  it('declares no media constant of its own', () => {
    const policy = code(
      readFileSync(join(__dirname, 'domain', 'admin-side-background.policy.ts'), 'utf8'),
    );

    // Every value is re-exported from the shared policy; a fresh literal here is
    // how an Admin path would drift from the public one it must agree with.
    expect(policy).not.toMatch(/=\s*'[A-Z_]+'/);
    expect(policy).not.toMatch(/image\/\w+/);
  });

  it('exposes exactly three error codes', () => {
    expect([...ADMIN_SIDE_BACKGROUND_ERROR_CODES]).toEqual([
      'ADMIN_SIDE_BACKGROUND_NOT_FOUND',
      'ADMIN_SIDE_BACKGROUND_INVALID',
      'ADMIN_SIDE_BACKGROUND_UNAVAILABLE',
    ]);
  });
});

describe('authorization predicates', () => {
  it('requires the Side to belong to the named Product', () => {
    expect(REPOSITORY_SOURCE).toMatch(/eq\(productSides\.productId, products\.id\)/);
    expect(REPOSITORY_SOURCE).toMatch(/eq\(products\.id, lookup\.productId\)/);
    expect(REPOSITORY_SOURCE).toMatch(/eq\(productSides\.id, lookup\.sideId\)/);
  });

  it('imposes no Product publication or Category visibility predicate', () => {
    // The whole point of B02A: A01 authors placement while the Product is DRAFT.
    expect(REPOSITORY_SOURCE).not.toMatch(/PRODUCT_PUBLISHED_STATE/);
    expect(REPOSITORY_SOURCE).not.toMatch(/products\.status/);
    expect(REPOSITORY_SOURCE).not.toMatch(/products\.archivedAt/);
    expect(REPOSITORY_SOURCE).not.toMatch(/categories/);
    expect(REPOSITORY_SOURCE).not.toMatch(/APP2_CATEGORY_STATUS/);
  });

  it('still re-proves the Asset lane and the editor-safe derivative', () => {
    for (const predicate of [
      'SIDE_BACKGROUND_ASSET_KIND',
      'SIDE_BACKGROUND_ASSET_CLASSIFICATION',
      'SIDE_BACKGROUND_ASSET_STATUS',
      'EDITOR_SAFE_DERIVATIVE_KIND',
      'EDITOR_SAFE_DERIVATIVE_STATE',
    ]) {
      expect(REPOSITORY_SOURCE).toContain(predicate);
    }
    expect(REPOSITORY_SOURCE).toMatch(/isWatermarked, false/);
    expect(REPOSITORY_SOURCE).toMatch(/isNull\(assets\.deletedAt\)/);
  });

  it('opens no transaction around the read', () => {
    expect(REPOSITORY_SOURCE).not.toMatch(/\btransaction\b/);
  });
});

describe('module boundary', () => {
  const imports = /imports:\s*\[([\s\S]*?)\]/.exec(MODULE_SOURCE)?.[1] ?? '';
  const controllers = /controllers:\s*\[([\s\S]*?)\]/.exec(MODULE_SOURCE)?.[1] ?? '';

  it('registers exactly one controller', () => {
    expect(controllers.split(',').filter((entry) => entry.trim() !== '')).toHaveLength(1);
    expect(controllers).toContain('AdminProductSideBackgroundController');
  });

  it('imports the auth, database and storage boundaries only', () => {
    expect(imports).toContain('DatabaseModule');
    expect(imports).toContain('ObjectStorageModule');
    expect(imports).toContain('IdentityModule');
    // No placement or draft module: this route must not be able to acquire a
    // write capability by transitive provider access.
    expect(imports).not.toContain('CatalogPlacementModule');
    expect(imports).not.toContain('CatalogDraftModule');
    expect(imports).not.toContain('AuditModule');
  });

  it('reaches no other module concrete adapter', () => {
    expect(MODULE_SOURCE).not.toMatch(/Drizzle(?!AdminSideBackgroundRepository)/);
  });

  it('adds no upload, presign or asset-by-id capability', () => {
    const combined = MODULE_SOURCE + SERVICE_SOURCE;
    for (const forbidden of ['presign', 'putObject', 'upload', 'deleteObject', 'assets/:assetId']) {
      expect(combined.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

describe('service behaviour', () => {
  const descriptor: AdminSideBackgroundDescriptor = {
    storageKey: 'derivatives/normalized/abc.webp',
    mediaType: 'image/webp',
    widthPx: 2000,
    heightPx: 1500,
    byteSize: 1234,
  };

  function makeService(options: {
    readonly descriptor?: AdminSideBackgroundDescriptor | undefined;
    readonly sizeBytes?: number;
    readonly storageThrows?: Error;
  }) {
    const getObjectStream = jest.fn(() => {
      const failure = options.storageThrows;
      if (failure !== undefined) return Promise.reject(failure);
      return Promise.resolve({
        body: Readable.from([Buffer.from('bytes')]),
        sizeBytes: options.sizeBytes ?? descriptor.byteSize,
        contentType: 'application/octet-stream',
      });
    });
    const findDeliverable = jest.fn(() => Promise.resolve(options.descriptor));

    const service = new AdminSideBackgroundService({ findDeliverable }, {
      getObjectStream,
    } as never);
    return { service, findDeliverable, getObjectStream };
  }

  it('streams the bytes with the derivative persisted media type', async () => {
    const { service } = makeService({ descriptor });

    const stream = await service.open(
      { productId: PRODUCT_ID, sideId: SIDE_ID },
      new AbortController().signal,
    );

    // Never the parent Asset's mime type, which describes the uploaded original.
    expect(stream.contentType).toBe('image/webp');
    expect(stream.contentLengthBytes).toBe(1234);
  });

  it('never touches storage when the read resolves nothing', async () => {
    const { service, getObjectStream } = makeService({ descriptor: undefined });

    await expect(
      service.open({ productId: PRODUCT_ID, sideId: SIDE_ID }, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'ADMIN_SIDE_BACKGROUND_NOT_FOUND' });

    // The ordering is the security property: a caller probing ids must not be
    // able to use provider load or timing as an oracle.
    expect(getObjectStream).not.toHaveBeenCalled();
  });

  it('refuses to stream an object whose size contradicts the row', async () => {
    const { service } = makeService({ descriptor, sizeBytes: 999 });

    await expect(
      service.open({ productId: PRODUCT_ID, sideId: SIDE_ID }, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'ADMIN_SIDE_BACKGROUND_UNAVAILABLE' });
  });

  it('maps a provider failure to unavailable, never to not-found', async () => {
    const { service } = makeService({
      descriptor,
      storageThrows: new ObjectStorageError('OBJECT_NOT_FOUND', 'gone'),
    });

    // The descriptor resolved, so the row says the object should exist. A 404
    // would tell the operator their placement is broken when it is not.
    await expect(
      service.open({ productId: PRODUCT_ID, sideId: SIDE_ID }, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'ADMIN_SIDE_BACKGROUND_UNAVAILABLE' });
  });

  it('propagates a client abort rather than reporting a server fault', async () => {
    const { service } = makeService({
      descriptor,
      storageThrows: new ObjectStorageError('REQUEST_ABORTED', 'client went away'),
    });

    await expect(
      service.open({ productId: PRODUCT_ID, sideId: SIDE_ID }, new AbortController().signal),
    ).rejects.toBeInstanceOf(ObjectStorageError);
  });

  it('reads the object storage bucket from the shared policy', () => {
    expect(SERVICE_SOURCE).toContain('ADMIN_SIDE_BACKGROUND_BUCKET');
    expect(SERVICE_SOURCE).not.toMatch(/bucket:\s*'/);
  });

  it('never buffers the object into memory', () => {
    expect(SERVICE_SOURCE).not.toMatch(/getObjectBuffer|toArray\(|Buffer\.concat/);
  });
});
