/**
 * The published Template asset HTTP contract (`APP3-B05A` §2, §13, §14, §18).
 *
 * Five things are pinned here that no other suite can see:
 *
 *  - the route is contextual — Template slug **and** Version **and** Asset — so
 *    the address cannot degrade into generic asset access;
 *  - the operation id the generator will derive is `publicDesignTemplateAsset_get`,
 *    which is a function of the *controller class name*: `APP3-B04A` proved a
 *    responsibility split can reissue accepted ids without a route changing;
 *  - exactly one handler exists, it is a `GET`, and it accepts no body and no
 *    query rendition selector;
 *  - **no guard is attached.** Public here is the absence of a decorator, and an
 *    absence is only safe when something asserts it;
 *  - the route is disjoint from both `APP3-B05` reads, which share its base.
 */
import 'reflect-metadata';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { readFileSync } from 'node:fs';

import { GLOBAL_ROUTE_PREFIX } from '../../../bootstrap/api-application';
import { createOperationId } from '../../../openapi/operation-id';
import { PublicDesignTemplateAssetController } from './public-design-template-asset.controller';
import { PublicDesignTemplateController } from './public-design-template.controller';
import { publicDesignTemplateAssetParamsSchema } from './schemas/public-design-template-asset.request';

const SLUG = 'hoa-sen-theu-tay';
const VERSION = '3';
const ASSET_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';

function controllerPath(): string {
  return Reflect.getMetadata(PATH_METADATA, PublicDesignTemplateAssetController) as string;
}

/**
 * The handler as a plain metadata target.
 *
 * Read through its property descriptor rather than as `Controller.prototype.get`:
 * the latter detaches a method from its receiver, which is a real hazard the
 * linter is right to flag even though nothing is called here.
 */
function handler(): object {
  const descriptor = Object.getOwnPropertyDescriptor(
    PublicDesignTemplateAssetController.prototype,
    'get',
  );
  if (descriptor === undefined) {
    throw new Error('The controller declares no `get` handler.');
  }
  return descriptor.value as object;
}

function handlerPath(): string {
  return Reflect.getMetadata(PATH_METADATA, handler()) as string;
}

function routeTemplate(): string {
  return `/${GLOBAL_ROUTE_PREFIX}/${controllerPath()}/${handlerPath()}`;
}

/** The full served path, with route parameters substituted. */
function servedPath(values: Record<string, string>): string {
  return routeTemplate().replaceAll(/:([A-Za-z]+)/g, (_match, name: string) => {
    const value = values[name];
    if (value === undefined) {
      throw new Error(`The route declares an unexpected parameter ":${name}".`);
    }
    return value;
  });
}

function controllerSource(): string {
  return readFileSync(__filename.replace('.contract.spec.ts', '.controller.ts'), 'utf8');
}

/**
 * The controller with its prose removed.
 *
 * The doc comments deliberately explain what this route does *not* do — "no
 * `filename` parameter", "no ETag" — so a ban asserted against the raw file
 * fires on the explanation of the rule rather than on a violation of it. Stripped
 * first, then matched: the rules below are about code.
 */
function controllerCode(): string {
  return controllerSource()
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('the route is contextual, never generic asset access', () => {
  it('registers exactly the locked path', () => {
    expect(servedPath({ slug: SLUG, version: VERSION, assetId: ASSET_ID })).toBe(
      `/api/public/design-templates/${SLUG}/versions/${VERSION}/assets/${ASSET_ID}`,
    );
  });

  it('carries all three context segments', () => {
    const template = routeTemplate();
    expect(template).toContain(':slug');
    expect(template).toContain(':version');
    expect(template).toContain(':assetId');
  });

  it('names no storage or derivative identity in the address', () => {
    const template = routeTemplate();
    for (const forbidden of ['storageKey', 'derivativeId', 'bucket', 'key', 'kind']) {
      expect(template).not.toContain(forbidden);
    }
  });

  it('is not reachable without the template and the version', () => {
    // The whole point of the address: an Asset id is subordinate. A route whose
    // asset segment sat at the root would replace six conjunctive proofs with an
    // existence check.
    const path = servedPath({ slug: SLUG, version: VERSION, assetId: ASSET_ID });
    expect(path.indexOf(SLUG)).toBeLessThan(path.indexOf(VERSION));
    expect(path.indexOf(`/versions/${VERSION}`)).toBeLessThan(path.indexOf(ASSET_ID));
    expect(path.startsWith('/api/public/design-templates/')).toBe(true);
  });

  it('cannot be answered by either APP3-B05 read', () => {
    // Both share this base. The detail read is `:slug`; nothing it answers has
    // four more segments, so neither can shadow the other in either direction.
    const b05 = Reflect.getMetadata(PATH_METADATA, PublicDesignTemplateController) as string;
    expect(controllerPath()).toBe(b05);

    const segments = handlerPath().split('/').filter(Boolean);
    expect(segments).toStrictEqual([':slug', 'versions', ':version', 'assets', ':assetId']);
  });

  it('derives the expected operation id', () => {
    expect(createOperationId(PublicDesignTemplateAssetController.name, 'get')).toBe(
      'publicDesignTemplateAsset_get',
    );
  });
});

describe('exactly one anonymous binary read', () => {
  it('declares exactly one handler', () => {
    const handlers = Object.getOwnPropertyNames(
      PublicDesignTemplateAssetController.prototype,
    ).filter((name) => name !== 'constructor');

    expect(handlers).toStrictEqual(['get']);
  });

  it('is a GET', () => {
    expect(Reflect.getMetadata(METHOD_METADATA, handler())).toBe(RequestMethod.GET);
  });

  it('accepts no request body and no query rendition selector', () => {
    const source = controllerCode();
    expect(source).not.toMatch(/@Body\s*\(/);
    expect(source).not.toMatch(/@Query\s*\(/);
    expect(source).not.toMatch(/@Post|@Put|@Patch|@Delete/);
  });

  it('attaches no guard to the controller', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, PublicDesignTemplateAssetController),
    ).toBeUndefined();
  });

  it('attaches no guard to the handler', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, handler())).toBeUndefined();
  });

  it('applies no guard and declares no authentication in its source', () => {
    // Matched as *usage*, not as any mention: the controller's doc comment
    // explains which guards deliberately do not belong here, and a prose
    // reference must not read as an applied one.
    const source = controllerCode();
    expect(source).not.toMatch(/@UseGuards\s*\(/);
    expect(source).not.toMatch(/@ApiBearerAuth|@ApiCookieAuth/);
  });

  it('sends no-store, nosniff and an inline disposition with no filename', () => {
    const source = controllerCode();
    expect(source).toContain('PUBLIC_TEMPLATE_ASSET_CACHE_CONTROL');
    expect(source).toContain('PUBLIC_TEMPLATE_ASSET_CONTENT_TYPE_OPTIONS');
    expect(source).toContain('PUBLIC_TEMPLATE_ASSET_CONTENT_DISPOSITION');
    expect(source).not.toMatch(/filename/i);
    // A version is immutable; its authorization context is not, so no validator
    // or revalidation header may imply the address stays good.
    expect(source).not.toMatch(/ETag|Last-Modified|Accept-Ranges|max-age/i);
  });
});

describe('path validation', () => {
  const parse = (value: Record<string, unknown>) =>
    publicDesignTemplateAssetParamsSchema.safeParse(value);

  it('accepts a well-formed address', () => {
    expect(parse({ slug: SLUG, version: VERSION, assetId: ASSET_ID }).success).toBe(true);
  });

  it('coerces the version to a positive integer', () => {
    const parsed = parse({ slug: SLUG, version: '7', assetId: ASSET_ID });
    expect(parsed.success && parsed.data.version).toBe(7);
  });

  it.each([
    ['uppercase slug', { slug: 'Hoa-Sen', version: VERSION, assetId: ASSET_ID }],
    ['slug with traversal', { slug: '../etc', version: VERSION, assetId: ASSET_ID }],
    ['empty slug', { slug: '', version: VERSION, assetId: ASSET_ID }],
    ['version zero', { slug: SLUG, version: '0', assetId: ASSET_ID }],
    ['negative version', { slug: SLUG, version: '-1', assetId: ASSET_ID }],
    ['fractional version', { slug: SLUG, version: '1.5', assetId: ASSET_ID }],
    ['non-numeric version', { slug: SLUG, version: 'latest', assetId: ASSET_ID }],
    ['absurd version', { slug: SLUG, version: '999999999999', assetId: ASSET_ID }],
    ['non-uuid asset id', { slug: SLUG, version: VERSION, assetId: 'asset-1' }],
    ['empty asset id', { slug: SLUG, version: VERSION, assetId: '' }],
  ])('rejects %s', (_label, value) => {
    expect(parse(value).success).toBe(false);
  });

  it('rejects any extra path member', () => {
    expect(
      parse({ slug: SLUG, version: VERSION, assetId: ASSET_ID, rendition: 'original' }).success,
    ).toBe(false);
  });
});
