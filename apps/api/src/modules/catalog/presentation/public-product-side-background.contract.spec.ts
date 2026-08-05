/**
 * The public Side-background HTTP contract (`APP3-B02` §3/§8/§10).
 *
 * Four things are pinned here that no other suite can see:
 *
 *  - the route the controller registers composes to *exactly* what the shared
 *    `buildPublicSideBackgroundPath` helper produces, so the server and every
 *    consumer of the helper cannot drift apart;
 *  - the API's local composer produces the same bytes as the shared helper, for
 *    ordinary and for escape-worthy values — the IMP-D018 boundary means the two
 *    are held together by this test rather than by an import;
 *  - the operation id the generator will derive is
 *    `publicProductSideBackground_get`;
 *  - **no guard is attached**. Public here means the absence of a decorator, and
 *    an absence is only safe if something asserts it — adding
 *    `AuthenticatedAdminGuard` to this controller would compile, pass every
 *    other test, and silently take the Studio's backgrounds offline.
 */
import 'reflect-metadata';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { buildPublicSideBackgroundPath } from '@embroidery/contracts';

import { GLOBAL_ROUTE_PREFIX } from '../../../bootstrap/api-application';
import { createOperationId } from '../../../openapi/operation-id';
import { publicSideBackgroundPath } from '../domain/public-side-background-path';
import { PublicProductSideBackgroundController } from './public-product-side-background.controller';
import { publicSideBackgroundParamsSchema } from './schemas/public-side-background.request';

const SLUG = 'thu-bong-gau-nau';
const SIDE_CODE = 'front';

function controllerPath(): string {
  return Reflect.getMetadata(PATH_METADATA, PublicProductSideBackgroundController) as string;
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
  const descriptor = Object.getOwnPropertyDescriptor(
    PublicProductSideBackgroundController.prototype,
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

describe('public side-background route', () => {
  it('registers exactly the locked path', () => {
    expect(servedPath({ slug: SLUG, sideCode: SIDE_CODE })).toBe(
      `/api/public/products/${SLUG}/sides/${SIDE_CODE}/background`,
    );
  });

  it('is keyed by the Product slug and the Side code, never by an artifact identity', () => {
    const template = `${controllerPath()}/${handlerPath()}`;
    expect(template).toContain(':slug');
    expect(template).toContain(':sideCode');
    for (const forbidden of ['assetId', 'derivativeId', 'productSideId', 'storageKey', 'kind']) {
      expect(template).not.toContain(forbidden);
    }
  });

  it('agrees with the shared route helper', () => {
    expect(servedPath({ slug: SLUG, sideCode: SIDE_CODE })).toBe(
      buildPublicSideBackgroundPath({ slug: SLUG, sideCode: SIDE_CODE }),
    );
  });

  it('derives the expected operation id', () => {
    expect(createOperationId(PublicProductSideBackgroundController.name, 'get')).toBe(
      'publicProductSideBackground_get',
    );
  });

  it('declares exactly one handler', () => {
    const handlers = Object.getOwnPropertyNames(
      PublicProductSideBackgroundController.prototype,
    ).filter((name) => name !== 'constructor');

    expect(handlers).toStrictEqual(['get']);
  });

  it('accepts no request body and no query rendition selector', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(__filename.replace('.contract.spec.ts', '.controller.ts'), 'utf8');

    expect(source).not.toMatch(/@Body\s*\(/);
    expect(source).not.toMatch(/@Query\s*\(/);
    expect(source).not.toMatch(/@Post|@Put|@Patch|@Delete/);
  });
});

describe('the API composer and the shared helper agree', () => {
  it.each([
    ['ao-thun-theu-hoa', 'front'],
    ['a', 'b'],
    ['thu-bong-gau-nau', 'mat-truoc-1'],
    ['x1-y2-z3', 'side_02'],
    // The longest code the database CHECK admits.
    ['p', `a${'z'.repeat(63)}`],
  ])('produces identical bytes for %s / %s', (slug, sideCode) => {
    // The compiled API cannot `require` `@embroidery/contracts` (IMP-D018), so
    // it composes the path itself. This equality is the only thing keeping the
    // two implementations from drifting.
    expect(publicSideBackgroundPath({ slug, sideCode })).toBe(
      buildPublicSideBackgroundPath({ slug, sideCode }),
    );
  });

  it('percent-encodes each segment independently', () => {
    // Neither value can contain these today; the encoding is what keeps the
    // composer safe if a future writer widens either charset.
    expect(publicSideBackgroundPath({ slug: 'a/b', sideCode: 'c d' })).toBe(
      '/api/public/products/a%2Fb/sides/c%20d/background',
    );
    expect(publicSideBackgroundPath({ slug: 'a', sideCode: '../etc' })).not.toContain('../');
  });

  it('emits a relative application path and nothing else', () => {
    const path = publicSideBackgroundPath({ slug: SLUG, sideCode: SIDE_CODE });
    expect(path.startsWith('/api/')).toBe(true);
    for (const forbidden of ['http://', 'https://', 'amazonaws', 'minio', '?', '#']) {
      expect(path).not.toContain(forbidden);
    }
  });
});

describe('path validation', () => {
  const parse = (slug: string, sideCode: string) =>
    publicSideBackgroundParamsSchema.safeParse({ slug, sideCode });

  it('accepts a well-formed slug and side code', () => {
    expect(parse(SLUG, SIDE_CODE).success).toBe(true);
    expect(parse('a1', 'a_1-2').success).toBe(true);
  });

  it.each([
    ['uppercase slug', 'Ao-Thun', SIDE_CODE],
    ['slug with underscore', 'ao_thun', SIDE_CODE],
    ['slug with traversal', '../etc', SIDE_CODE],
    ['leading hyphen slug', '-ao', SIDE_CODE],
    ['empty slug', '', SIDE_CODE],
    ['uppercase side code', SLUG, 'Front'],
    ['side code with slash', SLUG, 'front/back'],
    ['side code with dot', SLUG, 'front.back'],
    ['leading hyphen side code', SLUG, '-front'],
    ['empty side code', SLUG, ''],
    ['over-long side code', SLUG, `a${'z'.repeat(64)}`],
  ])('rejects %s', (_label, slug, sideCode) => {
    expect(parse(slug, sideCode).success).toBe(false);
  });

  it('rejects any extra path member', () => {
    expect(
      publicSideBackgroundParamsSchema.safeParse({
        slug: SLUG,
        sideCode: SIDE_CODE,
        rendition: 'thumbnail',
      }).success,
    ).toBe(false);
  });

  it('accepts exactly what the database CHECK accepts for a side code', async () => {
    // The request schema restates `PLACEMENT_CODE_PATTERN` because a
    // presentation layer should state the shape it accepts, and because
    // `@embroidery/database` does not export it. The literal is read from the
    // schema source so the restatement is checked against the real constraint
    // rather than against a second memory of it.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const schemaSource = readFileSync(
      join(__dirname, '../../../../../../packages/database/src/schema/catalog/product-sides.ts'),
      'utf8',
    );
    const declared = /PLACEMENT_CODE_PATTERN = '([^']+)'/.exec(schemaSource)?.[1];
    expect(declared).toBeDefined();

    const database = new RegExp(declared as string);
    for (const code of ['a', 'z9', 'front', 'side_02', 'a-b_c', `a${'z'.repeat(63)}`]) {
      expect(database.test(code)).toBe(parse(SLUG, code).success);
    }
    for (const code of ['', '-a', '_a', 'A', 'a.b', `a${'z'.repeat(64)}`]) {
      expect(database.test(code)).toBe(parse(SLUG, code).success);
    }
  });
});

describe('public side-background anonymity', () => {
  it('attaches no guard to the controller', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, PublicProductSideBackgroundController),
    ).toBeUndefined();
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
    expect(source).not.toMatch(/@ApiBearerAuth|@ApiCookieAuth/);
  });
});
