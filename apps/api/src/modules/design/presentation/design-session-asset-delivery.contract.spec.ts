/**
 * The Design Session asset delivery HTTP contract (`APP3-B06C` §4, §15, §19).
 *
 * Six things are pinned here that no other suite can see:
 *
 *  - the route is contextual — Session **and** Asset — so the address cannot
 *    degrade into generic asset access;
 *  - the operation id the generator will derive is `publicDesignSessionAsset_get`
 *    *despite* the class being a second controller: `APP3-B04A` proved a
 *    responsibility split can reissue accepted ids without a route changing, and
 *    the domain-key entry is what stops it here;
 *  - exactly one handler exists, it is a `GET`, and it accepts no body and no
 *    query rendition selector;
 *  - a **read guard is attached, and it is not the mutation guard.** Both halves
 *    matter: an unguarded route would be public, and the mutation guard would
 *    demand an `Origin` no `<img>` sends and would spend the save budget;
 *  - the route is disjoint from the upload route it shares a base with;
 *  - the delivery surface names no storage identity at all.
 */
import 'reflect-metadata';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GLOBAL_ROUTE_PREFIX } from '../../../bootstrap/api-application';
import { createOperationId } from '../../../openapi/operation-id';
import { PublicDesignSessionAssetPreviewController } from './public-design-session-asset-preview.controller';
import { PublicDesignSessionAssetController } from './public-design-session-asset.controller';
import { DesignSessionReadGuard } from './guards/design-session-read.guard';
import { DesignSessionGuard } from './guards/design-session.guard';
import { designSessionAssetParamsSchema } from './schemas/design-session-asset-delivery.request';
import {
  SESSION_ASSET_CACHE_CONTROL,
  SESSION_ASSET_CONTENT_DISPOSITION,
  SESSION_ASSET_CONTENT_TYPE_OPTIONS,
} from '../domain/design-session-asset-delivery.policy';

const SESSION_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6070';
const ASSET_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';

function controllerPath(): string {
  return Reflect.getMetadata(PATH_METADATA, PublicDesignSessionAssetPreviewController) as string;
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
    PublicDesignSessionAssetPreviewController.prototype,
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

function servedPath(values: Record<string, string>): string {
  return routeTemplate().replaceAll(/:([A-Za-z]+)/g, (_match, name: string) => {
    const value = values[name];
    if (value === undefined) {
      throw new Error(`The route declares an unexpected parameter ":${name}".`);
    }
    return value;
  });
}

const MODULE_DIR = join(__dirname, '..');

function sourceOf(relative: string): string {
  return readFileSync(join(MODULE_DIR, relative), 'utf8');
}

/**
 * A source file with its prose removed.
 *
 * The doc comments deliberately explain what this route does *not* do — "no
 * presign", "the original is never served" — so a naive search for those words
 * finds the explanation rather than an implementation and reports the opposite of
 * the truth.
 */
function withoutComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/.*$/gm, '');
}

describe('APP3-B06C delivery route shape', () => {
  it('is addressed through the Session that owns the asset', () => {
    expect(routeTemplate()).toBe(
      '/api/public/design-sessions/:sessionId/assets/:assetId/editor-preview',
    );
    expect(servedPath({ sessionId: SESSION_ID, assetId: ASSET_ID })).toBe(
      `/api/public/design-sessions/${SESSION_ID}/assets/${ASSET_ID}/editor-preview`,
    );
  });

  it('never exposes the asset outside its Session', () => {
    // Both segments precede the asset id, so there is no prefix of this address
    // that serves bytes — the generic `GET /assets/{id}` IMP-D044 PO-06 forbids
    // is not merely unimplemented, it is unrepresentable on this controller.
    const template = routeTemplate();
    expect(template.indexOf(':sessionId')).toBeLessThan(template.indexOf(':assetId'));
    expect(template).not.toMatch(/^\/api\/public\/assets/);
  });

  it('derives the accepted operation id despite being a second class', () => {
    expect(createOperationId('PublicDesignSessionAssetPreviewController', 'get')).toBe(
      'publicDesignSessionAsset_get',
    );
    // The upload half keeps its accepted id: the split reissued nothing.
    expect(createOperationId('PublicDesignSessionAssetController', 'create')).toBe(
      'publicDesignSessionAsset_create',
    );
  });

  it('is a GET and is the only operation the delivery controller declares', () => {
    expect(Reflect.getMetadata(METHOD_METADATA, handler())).toBe(RequestMethod.GET);

    const handlers = Object.getOwnPropertyNames(
      PublicDesignSessionAssetPreviewController.prototype,
    ).filter(
      (name) =>
        name !== 'constructor' &&
        Reflect.hasMetadata(
          PATH_METADATA,
          Object.getOwnPropertyDescriptor(PublicDesignSessionAssetPreviewController.prototype, name)
            ?.value as object,
        ),
    );
    expect(handlers).toEqual(['get']);
  });

  it('is disjoint from the upload route it shares a base path with', () => {
    const uploadHandler = Object.getOwnPropertyDescriptor(
      PublicDesignSessionAssetController.prototype,
      'create',
    )?.value as object;
    const uploadPath = Reflect.getMetadata(PATH_METADATA, uploadHandler) as string;
    expect(Reflect.getMetadata(METHOD_METADATA, uploadHandler)).toBe(RequestMethod.POST);
    // Two more segments than the upload address, so no request can reach both.
    expect(handlerPath().startsWith(uploadPath)).toBe(true);
    expect(handlerPath()).not.toBe(uploadPath);
  });
});

describe('APP3-B06C delivery request contract', () => {
  it('accepts exactly two UUID path parameters', () => {
    const parsed = designSessionAssetParamsSchema.parse({
      sessionId: SESSION_ID,
      assetId: ASSET_ID,
    });
    expect(parsed).toEqual({ sessionId: SESSION_ID, assetId: ASSET_ID });
  });

  it.each([
    ['a non-UUID session id', { sessionId: 'not-a-uuid', assetId: ASSET_ID }],
    ['a non-UUID asset id', { sessionId: SESSION_ID, assetId: 'not-a-uuid' }],
  ])('refuses %s at the boundary', (_label, input) => {
    expect(() => designSessionAssetParamsSchema.parse(input)).toThrow();
  });

  it('refuses a rendition selector rather than ignoring it', () => {
    // `.strict()`. A parameter that could choose between artifacts is a parameter
    // that could eventually choose the private original, so it is refused rather
    // than dropped.
    expect(() =>
      designSessionAssetParamsSchema.parse({
        sessionId: SESSION_ID,
        assetId: ASSET_ID,
        variant: 'original',
      }),
    ).toThrow();
  });

  it('declares no body and no query object at all', () => {
    const source = withoutComments(
      sourceOf('presentation/public-design-session-asset-preview.controller.ts'),
    );
    expect(source).not.toMatch(/@Body\(/);
    expect(source).not.toMatch(/@Query\(/);
    expect(source).not.toMatch(/ApiBody/);
  });
});

describe('APP3-B06C delivery guard composition', () => {
  it('carries the read guard, not the mutation guard', () => {
    const guards = (Reflect.getMetadata(GUARDS_METADATA, handler()) ?? []) as unknown[];
    expect(guards).toContain(DesignSessionReadGuard);
    // The mutation guard would require an `Origin` no same-origin `<img>` sends
    // and would charge every preview against the 30/minute save budget.
    expect(guards).not.toContain(DesignSessionGuard);
  });

  it('leaves the accepted upload guard untouched', () => {
    const uploadHandler = Object.getOwnPropertyDescriptor(
      PublicDesignSessionAssetController.prototype,
      'create',
    )?.value as object;
    const guards = (Reflect.getMetadata(GUARDS_METADATA, uploadHandler) ?? []) as unknown[];
    expect(guards).toContain(DesignSessionGuard);
    expect(guards).not.toContain(DesignSessionReadGuard);
  });
});

describe('APP3-B06C delivery surface leaks nothing', () => {
  const source = withoutComments(
    sourceOf('presentation/public-design-session-asset-preview.controller.ts'),
  );

  it.each([
    ['a presign', /presign/i],
    ['a bucket name', /bucket/i],
    ['a storage key', /storageKey/],
    ['a checksum', /checksum/i],
    ['a filename parameter', /filename/i],
    ['an entity tag', /etag/i],
    ['a range header', /accept-ranges|content-range/i],
  ])('names no %s', (_label, pattern) => {
    expect(source).not.toMatch(pattern);
  });

  it('caches nothing, stated as a value rather than as an absent word', () => {
    // Deliberately asserted against the policy constant, not by searching the
    // source for `max-age` or `immutable`: the published description legitimately
    // says the bytes *are* immutable while the authorisation is not, and a word
    // ban would fire on that correct prose. What matters is the directive sent.
    expect(SESSION_ASSET_CACHE_CONTROL).toBe('no-store');
    expect(SESSION_ASSET_CONTENT_TYPE_OPTIONS).toBe('nosniff');
    expect(SESSION_ASSET_CONTENT_DISPOSITION).toBe('inline');
  });

  it('sets exactly the accepted private-binary headers', () => {
    expect(source).toMatch(/setHeader\('Cache-Control', SESSION_ASSET_CACHE_CONTROL\)/);
    expect(source).toMatch(
      /setHeader\('X-Content-Type-Options', SESSION_ASSET_CONTENT_TYPE_OPTIONS\)/,
    );
    const headerCalls = source.match(/response\.setHeader\(/g) ?? [];
    expect(headerCalls).toHaveLength(2);
  });
});
