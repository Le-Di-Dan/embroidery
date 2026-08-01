/**
 * The public catalog-media HTTP contract (`APP2-T01` §16).
 *
 * Three things are pinned here that no other suite can see:
 *
 *  - the route the controller registers composes to *exactly* what the shared
 *    `buildPublicProductMediaPath` helper produces, so the server and every
 *    consumer of the helper cannot drift apart;
 *  - the operation id the generator will derive is `publicProductMedia_get`;
 *  - **no guard is attached**. Public here means the absence of a decorator, and
 *    an absence is only safe if something asserts it — adding
 *    `AuthenticatedAdminGuard` to this controller would compile, pass every
 *    other test, and silently take the storefront's images offline.
 */
import 'reflect-metadata';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import {
  buildPublicProductMediaPath,
  PUBLIC_PRODUCT_MEDIA_RENDITIONS as CONTRACT_RENDITIONS,
} from '@embroidery/contracts';

import { GLOBAL_ROUTE_PREFIX } from '../../../bootstrap/api-application';
import { createOperationId } from '../../../openapi/operation-id';
import { PUBLIC_PRODUCT_MEDIA_RENDITIONS } from '../domain/public-product-media.policy';
import { PublicProductMediaController } from './public-product-media.controller';
import { publicProductMediaParamsSchema } from './schemas/public-product-media.request';

const SLUG = 'thu-bong-gau-nau';
const MEDIA_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';

function controllerPath(): string {
  return Reflect.getMetadata(PATH_METADATA, PublicProductMediaController) as string;
}

/**
 * The handler as a plain metadata target.
 *
 * Read through its property descriptor rather than as
 * `Controller.prototype.get`: the latter detaches a method from its receiver,
 * which is a real hazard the linter is right to flag even though nothing is
 * called here.
 */
function handler(): object {
  const descriptor = Object.getOwnPropertyDescriptor(PublicProductMediaController.prototype, 'get');
  if (descriptor === undefined) {
    throw new Error('The controller declares no `get` handler.');
  }
  return descriptor.value as object;
}

function handlerPath(): string {
  return Reflect.getMetadata(PATH_METADATA, handler()) as string;
}

/** The full served path, with route parameters substituted. */
function servedPath(values: Record<string, string>): string {
  const template = `/${GLOBAL_ROUTE_PREFIX}/${controllerPath()}/${handlerPath()}`;
  return template.replaceAll(/:([A-Za-z]+)/g, (_match, name: string) => {
    const value = values[name];
    if (value === undefined) {
      throw new Error(`The route declares an unexpected parameter ":${name}".`);
    }
    return value;
  });
}

describe('public catalog-media route', () => {
  it('registers exactly the locked path', () => {
    expect(servedPath({ slug: SLUG, productMediaId: MEDIA_ID, rendition: 'thumbnail' })).toBe(
      `/api/public/products/${SLUG}/media/${MEDIA_ID}/thumbnail`,
    );
  });

  it.each([...PUBLIC_PRODUCT_MEDIA_RENDITIONS])(
    'agrees with the shared route helper for the %s rendition',
    (rendition) => {
      expect(servedPath({ slug: SLUG, productMediaId: MEDIA_ID, rendition })).toBe(
        buildPublicProductMediaPath({ slug: SLUG, productMediaId: MEDIA_ID, rendition }),
      );
    },
  );

  it('offers the same renditions as the shared contract', () => {
    // The API declares these itself because the compiled process cannot load
    // `@embroidery/contracts` (IMP-D018); this is what keeps the copies honest.
    expect([...PUBLIC_PRODUCT_MEDIA_RENDITIONS]).toStrictEqual([...CONTRACT_RENDITIONS]);
  });

  it('derives the expected operation id', () => {
    expect(createOperationId(PublicProductMediaController.name, 'get')).toBe(
      'publicProductMedia_get',
    );
  });

  it('declares exactly one handler', () => {
    const handlers = Object.getOwnPropertyNames(PublicProductMediaController.prototype).filter(
      (name) => name !== 'constructor',
    );

    expect(handlers).toStrictEqual(['get']);
  });
});

describe('public catalog-media anonymity', () => {
  it('attaches no guard to the controller', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PublicProductMediaController)).toBeUndefined();
  });

  it('attaches no guard to the handler', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, handler())).toBeUndefined();
  });

  it('applies no guard and declares no authentication in its source', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(__filename.replace('.contract.spec.ts', '.controller.ts'), 'utf8');

    // Matched as *usage*, not as any mention: the controller's own doc comment
    // explains which guards deliberately do not belong here, and a prose
    // reference to a guard must not read as an applied one.
    expect(source).not.toMatch(/@UseGuards\s*\(/);
    expect(source).not.toMatch(/@ApiCookieAuth\s*\(/);
    expect(source).not.toMatch(/from\s*['"].*identity.*['"]/);
  });
});

describe('public catalog-media path validation', () => {
  const valid = { slug: SLUG, productMediaId: MEDIA_ID, rendition: 'thumbnail' };

  it('accepts a well-formed address', () => {
    expect(publicProductMediaParamsSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['uppercase slug', { ...valid, slug: 'Thu-Bong' }],
    ['slug with a separator run', { ...valid, slug: 'thu--bong' }],
    ['slug with traversal', { ...valid, slug: '../../etc' }],
    ['empty slug', { ...valid, slug: '' }],
    ['non-uuid media id', { ...valid, productMediaId: 'not-a-uuid' }],
    [
      'media id that is a storage key',
      { ...valid, productMediaId: 'derivatives/a/THUMBNAIL.webp' },
    ],
    ['unknown rendition', { ...valid, rendition: 'original' }],
    ['derivative kind as rendition', { ...valid, rendition: 'PREVIEW_WATERMARKED' }],
    ['unknown extra parameter', { ...valid, bucket: 'DERIVATIVES' }],
  ])('rejects a %s', (_label, params) => {
    expect(publicProductMediaParamsSchema.safeParse(params).success).toBe(false);
  });

  it('accepts both approved renditions and nothing else', () => {
    for (const rendition of PUBLIC_PRODUCT_MEDIA_RENDITIONS) {
      expect(publicProductMediaParamsSchema.safeParse({ ...valid, rendition }).success).toBe(true);
    }
    expect(
      publicProductMediaParamsSchema.safeParse({ ...valid, rendition: 'THUMBNAIL' }).success,
    ).toBe(false);
  });
});
