/**
 * Published Template asset delivery — the authorization equation (`APP3-B05A`
 * §3, §6, §11, §12).
 *
 * The route's whole security argument is that six independent facts must hold at
 * once and that failing any one of them is indistinguishable from failing any
 * other. An integration test proves the happy path; this suite exists to break
 * each term on its own and watch the answer stay the same.
 *
 * Two properties dominate, and neither is visible from a happy-path test:
 *
 *  - **ordering** — no object-storage call may happen until every term has
 *    succeeded, so a caller probing slugs, versions or asset ids cannot use
 *    provider load or response timing as an existence oracle;
 *  - **reconciliation** — the object about to be streamed must be the object the
 *    row describes, and where the provider's count and the persisted `byte_size`
 *    disagree the honest answer is to send neither.
 *
 * The document half is deliberately exercised through real P01 structure
 * validation rather than a stub. "This Version places this Asset" is the one term
 * SQL cannot express, and a fake that answered it would test nothing.
 */
import { ObjectStorageError, type ObjectStoragePort } from '@embroidery/object-storage';
import { Readable } from 'node:stream';

import type { ProductPlacementRepository } from '../catalog/domain/repositories/product-placement.repository';
import type {
  PublicDesignTemplateAssetRepository,
  PublicTemplateAssetCandidate,
} from './domain/repositories/public-design-template-asset.repository';
import { PublicDesignTemplateAssetService } from './application/public-design-template-asset.service';

const ASSET_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';
const OTHER_ASSET_ID = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6072';
const BYTES = Buffer.from('TEMPLATE-ARTWORK-'.repeat(8), 'utf8');

const LOOKUP = { slug: 'hoa-sen-theu-tay', version: 2, assetId: ASSET_ID };

const PLACEMENT = Object.freeze({
  productSideId: 'side-front',
  embroideryAreaId: 'area-chest',
  canvasWidthPx: 1000,
  canvasHeightPx: 1000,
  physicalWidthMm: 200,
  physicalHeightMm: 200,
  pxPerMm: 5,
});

function transform(): Record<string, number> {
  return { x: 10, y: 20, width: 100, height: 50, rotationDeg: 0, scaleX: 1, scaleY: 1 };
}

/** A structurally valid v1 document placing exactly the assets named. */
function documentPlacing(...assetIds: readonly string[]): unknown {
  return {
    schemaVersion: 1,
    placement: { ...PLACEMENT },
    elements: assetIds.map((assetId, index) => ({
      id: `image-${String(index + 1)}`,
      type: 'image',
      visible: true,
      locked: false,
      opacity: 1,
      transform: transform(),
      assetId,
      derivativeId: `derivative-${String(index + 1)}`,
      intrinsicWidthPx: 800,
      intrinsicHeightPx: 600,
    })),
  };
}

/** A valid document whose only element is text — it places nothing. */
function textOnlyDocument(): unknown {
  return {
    schemaVersion: 1,
    placement: { ...PLACEMENT },
    elements: [
      {
        id: 'text-1',
        type: 'text',
        visible: true,
        locked: false,
        opacity: 1,
        transform: transform(),
        text: 'Thêu',
        fontId: 'inter',
        fontSizePx: 24,
        fontWeight: 400,
        fontStyle: 'normal',
        textAlign: 'left',
        fill: '#101010',
      },
    ],
  };
}

function candidate(overrides: Partial<PublicTemplateAssetCandidate> = {}) {
  return {
    storageKey: 'test/derivatives/019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071/NORMALIZED.webp',
    mediaType: 'image/webp',
    byteSize: BYTES.length,
    document: documentPlacing(ASSET_ID),
    productId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6081',
    productSideId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6082',
    embroideryAreaId: '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6083',
    ...overrides,
  } satisfies PublicTemplateAssetCandidate;
}

interface Harness {
  readonly service: PublicDesignTemplateAssetService;
  readonly lookups: unknown[];
  readonly scopes: unknown[];
  readonly opened: string[];
}

function build(options: {
  candidate?: PublicTemplateAssetCandidate | undefined;
  scopeEligible?: boolean;
  providerSize?: number;
  failWith?: Error;
}): Harness {
  const lookups: unknown[] = [];
  const scopes: unknown[] = [];
  const opened: string[] = [];

  const repository: PublicDesignTemplateAssetRepository = {
    findDeliverableCandidate: (lookup) => {
      lookups.push(lookup);
      return Promise.resolve(options.candidate);
    },
  };

  const placement = {
    findPublicPlacementScope: (reference: unknown) => {
      scopes.push(reference);
      return Promise.resolve((options.scopeEligible ?? true) ? reference : undefined);
    },
  } as unknown as ProductPlacementRepository;

  const storage = {
    getObjectStream: (reference: { bucket: string; key: string }) => {
      opened.push(`${reference.bucket}:${reference.key}`);
      if (options.failWith !== undefined) {
        return Promise.reject(options.failWith);
      }
      return Promise.resolve({
        body: Readable.from([BYTES]),
        bucket: reference.bucket,
        key: reference.key,
        sizeBytes: options.providerSize ?? BYTES.length,
        metadata: {},
      });
    },
  } as unknown as ObjectStoragePort;

  return {
    service: new PublicDesignTemplateAssetService(repository, placement, storage),
    lookups,
    scopes,
    opened,
  };
}

const signal = (): AbortSignal => new AbortController().signal;

const codeOf = async (work: () => Promise<unknown>): Promise<string> => {
  try {
    await work();
  } catch (error: unknown) {
    return (error as { code?: string }).code ?? 'NO_CODE';
  }
  return 'NO_ERROR';
};

const NOT_FOUND = 'PUBLIC_DESIGN_TEMPLATE_ASSET_NOT_FOUND';
const UNAVAILABLE = 'PUBLIC_DESIGN_TEMPLATE_ASSET_UNAVAILABLE';

describe('the address is carried whole into the durable lookup', () => {
  it('asks for the exact slug, version and asset the caller addressed', async () => {
    const harness = build({ candidate: candidate() });
    await harness.service.open(LOOKUP, signal());

    // Never "latest": the version the caller named is the version proved.
    expect(harness.lookups).toEqual([LOOKUP]);
  });

  it('serves the persisted derivative type and length', async () => {
    const stream = await build({ candidate: candidate() }).service.open(LOOKUP, signal());

    expect(stream.contentType).toBe('image/webp');
    expect(stream.contentLengthBytes).toBe(BYTES.length);
  });

  it('reads the editor-safe bucket and never the private originals', async () => {
    const harness = build({ candidate: candidate() });
    await harness.service.open(LOOKUP, signal());

    expect(harness.opened).toEqual([`DERIVATIVES:${candidate().storageKey}`]);
  });

  it('serves sanitized template SVG under its persisted type', async () => {
    // `APP3-W01B`'s output, and the only shape of SVG that can reach here: the
    // candidate is a `NORMALIZED` derivative, so the raw source is not a
    // candidate at all. Nothing on this path re-parses or re-sanitizes it.
    const stream = await build({
      candidate: candidate({ mediaType: 'image/svg+xml' }),
    }).service.open(LOOKUP, signal());

    expect(stream.contentType).toBe('image/svg+xml');
  });
});

describe('every durable refusal is silent and costs no provider request', () => {
  it('refuses when no candidate resolves', async () => {
    const harness = build({ candidate: undefined });

    expect(await codeOf(() => harness.service.open(LOOKUP, signal()))).toBe(NOT_FOUND);
    // The security property: a probe costs one query, no scope resolution and no
    // provider request, so load and timing reveal nothing about what exists.
    expect(harness.opened).toEqual([]);
    expect(harness.scopes).toEqual([]);
  });

  it('gives the same answer whichever durable term failed', async () => {
    // Template unknown, draft, archived, unpublished; version unknown, historical
    // or never published; association missing; wrong lane; derivative unready,
    // watermarked or incomplete — all of them arrive as an absent candidate, and
    // the caller cannot tell them apart.
    const codes = await Promise.all(
      [1, 2, 3, 4].map(() =>
        codeOf(() => build({ candidate: undefined }).service.open(LOOKUP, signal())),
      ),
    );

    expect(new Set(codes)).toEqual(new Set([NOT_FOUND]));
  });
});

describe('the current version document must place this asset', () => {
  it('refuses when the document places a different asset', async () => {
    // The durable association is cumulative: `APP3-B03A` records every Asset ever
    // placed and removing an image in a later Version does not remove the row.
    // Association alone must therefore not authorize.
    const harness = build({ candidate: candidate({ document: documentPlacing(OTHER_ASSET_ID) }) });

    expect(await codeOf(() => harness.service.open(LOOKUP, signal()))).toBe(NOT_FOUND);
    expect(harness.opened).toEqual([]);
  });

  it('refuses when the document places nothing at all', async () => {
    const harness = build({ candidate: candidate({ document: textOnlyDocument() }) });

    expect(await codeOf(() => harness.service.open(LOOKUP, signal()))).toBe(NOT_FOUND);
  });

  it('accepts an asset placed alongside others', async () => {
    const stream = await build({
      candidate: candidate({ document: documentPlacing(OTHER_ASSET_ID, ASSET_ID) }),
    }).service.open(LOOKUP, signal());

    expect(stream.contentLengthBytes).toBe(BYTES.length);
  });

  it.each([
    ['a document that is not an object', 42],
    ['a null document', null],
    ['a document with no elements', { schemaVersion: 1, placement: { ...PLACEMENT } }],
    ['an unknown schema version', { schemaVersion: 99, placement: { ...PLACEMENT }, elements: [] }],
    [
      'a structurally broken element',
      {
        schemaVersion: 1,
        placement: { ...PLACEMENT },
        elements: [{ id: 'x', type: 'image', assetId: ASSET_ID }],
      },
    ],
  ])('fails closed on %s rather than reading around it', async (_label, document) => {
    const harness = build({ candidate: candidate({ document }) });

    expect(await codeOf(() => harness.service.open(LOOKUP, signal()))).toBe(NOT_FOUND);
    expect(harness.opened).toEqual([]);
  });

  it('refuses an asset id carried by a non-image element', async () => {
    // A stray `assetId` on a text or shape element is not a placement. The
    // pre-validation reader used for allowlists accepts one; authorization must
    // not, or a document could name artwork it never shows.
    const document = {
      schemaVersion: 1,
      placement: { ...PLACEMENT },
      elements: [
        {
          id: 'shape-1',
          type: 'shape',
          visible: true,
          locked: false,
          opacity: 1,
          transform: transform(),
          shape: 'rectangle',
          fill: '#ffffff',
          stroke: '#000000',
          strokeWidthPx: 2,
          assetId: ASSET_ID,
        },
      ],
    };
    const harness = build({ candidate: candidate({ document }) });

    expect(await codeOf(() => harness.service.open(LOOKUP, signal()))).toBe(NOT_FOUND);
  });
});

describe('catalog eligibility is re-evaluated on every request', () => {
  it('asks Catalog about the exact triple the row carries', async () => {
    const harness = build({ candidate: candidate() });
    await harness.service.open(LOOKUP, signal());

    expect(harness.scopes).toEqual([
      {
        productId: candidate().productId,
        productSideId: candidate().productSideId,
        embroideryAreaId: candidate().embroideryAreaId,
      },
    ]);
  });

  it('refuses when the placement is no longer publicly designable', async () => {
    // A withdrawn Product, a retired Side and a retired Area are one answer here:
    // Catalog owns the predicate and reports only whether the chain resolves.
    const harness = build({ candidate: candidate(), scopeEligible: false });

    expect(await codeOf(() => harness.service.open(LOOKUP, signal()))).toBe(NOT_FOUND);
    expect(harness.opened).toEqual([]);
  });

  it('asks Catalog only after the document has been proved', async () => {
    const harness = build({ candidate: candidate({ document: textOnlyDocument() }) });
    await codeOf(() => harness.service.open(LOOKUP, signal()));

    expect(harness.scopes).toEqual([]);
  });
});

describe('provider and persisted metadata are reconciled', () => {
  it.each([
    ['a larger object', BYTES.length + 1],
    ['a smaller object', BYTES.length - 1],
    ['a zero-length object', 0],
    ['a negative count', -1],
    ['a non-finite count', Number.NaN],
  ])('refuses to stream %s rather than send a misleading length', async (_label, providerSize) => {
    const harness = build({ candidate: candidate(), providerSize });

    expect(await codeOf(() => harness.service.open(LOOKUP, signal()))).toBe(UNAVAILABLE);
  });

  it('destroys the opened stream when it refuses, leaving no draining connection', async () => {
    let captured: Readable | undefined;
    const repository: PublicDesignTemplateAssetRepository = {
      findDeliverableCandidate: () => Promise.resolve(candidate()),
    };
    const placement = {
      findPublicPlacementScope: (reference: unknown) => Promise.resolve(reference),
    } as unknown as ProductPlacementRepository;
    const storage = {
      getObjectStream: () => {
        captured = Readable.from([BYTES]);
        return Promise.resolve({
          body: captured,
          bucket: 'DERIVATIVES',
          key: candidate().storageKey,
          sizeBytes: BYTES.length + 99,
          metadata: {},
        });
      },
    } as unknown as ObjectStoragePort;

    const service = new PublicDesignTemplateAssetService(repository, placement, storage);
    await codeOf(() => service.open(LOOKUP, signal()));

    expect(captured?.destroyed).toBe(true);
  });
});

describe('provider failures stay in the safe vocabulary', () => {
  it('reports a missing object as unavailable, never as not-found', async () => {
    // The whole authorization already succeeded, so the Template *is* public and
    // the object *should* exist. A 404 would tell an honest caller to stop asking.
    const harness = build({
      candidate: candidate(),
      failWith: new ObjectStorageError('OBJECT_NOT_FOUND', 'gone'),
    });

    expect(await codeOf(() => harness.service.open(LOOKUP, signal()))).toBe(UNAVAILABLE);
  });

  it('propagates a client abort as itself', async () => {
    const aborted = new ObjectStorageError('REQUEST_ABORTED', 'client left');
    const harness = build({ candidate: candidate(), failWith: aborted });

    await expect(harness.service.open(LOOKUP, signal())).rejects.toBe(aborted);
  });

  it('leaks no storage detail in the error it does surface', async () => {
    const harness = build({
      candidate: candidate(),
      failWith: new ObjectStorageError(
        'PROVIDER_UNAVAILABLE',
        `s3://secret-bucket/${candidate().storageKey}`,
      ),
    });

    let message = '';
    try {
      await harness.service.open(LOOKUP, signal());
    } catch (error: unknown) {
      message = (error as Error).message;
    }

    for (const forbidden of ['s3://', 'secret-bucket', candidate().storageKey, 'NORMALIZED']) {
      expect(message).not.toContain(forbidden);
    }
  });

  it('names no slug, version or asset id in any refusal', async () => {
    const messages = await Promise.all(
      [
        build({ candidate: undefined }),
        build({ candidate: candidate(), scopeEligible: false }),
      ].map(async (harness) => {
        try {
          await harness.service.open(LOOKUP, signal());
        } catch (error: unknown) {
          return (error as Error).message;
        }
        return '';
      }),
    );

    for (const message of messages) {
      for (const forbidden of [LOOKUP.slug, String(LOOKUP.version), ASSET_ID, 'PUBLISHED']) {
        expect(message).not.toContain(forbidden);
      }
    }
  });
});
