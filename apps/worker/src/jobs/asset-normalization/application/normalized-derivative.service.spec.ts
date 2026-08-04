/**
 * Media admission, limits and output measurement (`APP3-W01A`).
 *
 * Docker-free but not decoder-free: the limits are asserted against **real
 * decoded images**, because a limit test that trusted a hand-written metadata
 * object would prove the arithmetic and not the pipeline. The fixtures are the
 * accepted APP2 generators, so the bytes are genuinely decodable files rather
 * than byte patterns with the right magic number.
 *
 * The boundary cases are the point: 4096 passes and 4097 fails, the pixel budget
 * is met exactly at 4096 × 4096, and an over-limit source is **rejected** rather
 * than quietly resized into compliance.
 */
import sharp from 'sharp';

import { InMemoryObjectStorage } from '../../asset-inspection/tests/in-memory-object-storage';
import { checksumOf } from '../../asset-inspection/tests/image-fixtures';
import { NORMALIZATION_LIMITS, NORMALIZED_OUTPUT_POLICY } from '../domain/normalization-policy';
import type { NormalizationSourceFacts } from '../domain/repositories/asset-normalization.repository';
import { NormalizedDerivativeService } from './normalized-derivative.service';

const ASSET = '019a2b3c-4d5e-7f60-8a1b-2c3d4e5f6071';

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 20, g: 90, b: 160, alpha: 1 } },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function facts(
  bytes: Buffer,
  overrides: Partial<NormalizationSourceFacts> = {},
): NormalizationSourceFacts {
  return {
    assetId: ASSET,
    storageKey: `test/originals/${ASSET}/original.png`,
    mediaType: 'image/png',
    byteSize: BigInt(bytes.length),
    checksum: checksumOf(bytes),
    status: 'ACCEPTED',
    kind: 'CATALOG_MEDIA',
    classification: 'PRODUCTION_SENSITIVE',
    deleted: false,
    ...overrides,
  };
}

function build(bytes?: Buffer, source?: NormalizationSourceFacts) {
  const storage = new InMemoryObjectStorage();
  const service = new NormalizedDerivativeService(storage, 'test');
  if (bytes !== undefined && source !== undefined) {
    storage.put('ORIGINALS', source.storageKey, bytes, source.mediaType);
  }
  return { storage, service };
}

const codeOf = async (work: () => Promise<unknown>): Promise<string> => {
  try {
    await work();
  } catch (error: unknown) {
    return (error as { code?: string }).code ?? 'NO_CODE';
  }
  return 'NO_ERROR';
};

/** The stored derivative, or a failure naming the key that is missing. */
function requireObject(storage: InMemoryObjectStorage, key: string): Buffer {
  const body = storage.read('DERIVATIVES', key);
  if (body === undefined) throw new Error('no derivative object was written');
  return body;
}

const codeOfSync = (work: () => unknown): string => {
  try {
    work();
  } catch (error: unknown) {
    return (error as { code?: string }).code ?? 'NO_CODE';
  }
  return 'NO_ERROR';
};

describe('media admission', () => {
  const { service } = build();

  it('accepts the three raster types for every profile', () => {
    for (const profile of ['SIDE_BACKGROUND', 'TEMPLATE_ASSET', 'SESSION_UPLOAD'] as const) {
      for (const mediaType of ['image/jpeg', 'image/png', 'image/webp']) {
        expect(
          service.assertProcessableSource(profile, facts(Buffer.alloc(8), { mediaType })),
        ).toBe(mediaType);
      }
    }
  });

  it('answers Template SVG with the staged capability, not "unsupported"', () => {
    // Authorized by IMP-D044 and merely unavailable until G07 + W01B. Reporting
    // it as an unsupported type would make a later delivery look like a product
    // change.
    expect(
      codeOfSync(() =>
        service.assertProcessableSource(
          'TEMPLATE_ASSET',
          facts(Buffer.alloc(8), { mediaType: 'image/svg+xml' }),
        ),
      ),
    ).toBe('TEMPLATE_SVG_NORMALIZATION_NOT_AVAILABLE');
  });

  it('answers SVG for the other two profiles as profile-invalid, now and after W01B', () => {
    for (const profile of ['SIDE_BACKGROUND', 'SESSION_UPLOAD'] as const) {
      expect(
        codeOfSync(() =>
          service.assertProcessableSource(
            profile,
            facts(Buffer.alloc(8), { mediaType: 'image/svg+xml' }),
          ),
        ),
      ).toBe('NORMALIZATION_SOURCE_MEDIA_UNSUPPORTED');
    }
  });

  it('refuses any other media type, and never infers from an extension', () => {
    for (const mediaType of ['image/gif', 'image/tiff', 'application/pdf', 'text/plain', '']) {
      expect(
        codeOfSync(() =>
          service.assertProcessableSource(
            'SIDE_BACKGROUND',
            facts(Buffer.alloc(8), { mediaType, storageKey: `test/originals/${ASSET}/x.png` }),
          ),
        ),
      ).toBe('NORMALIZATION_SOURCE_MEDIA_UNSUPPORTED');
    }
  });

  it('refuses an over-limit source from the recorded size, before any read', () => {
    const limit = BigInt(NORMALIZATION_LIMITS.maxSourceBytes);
    expect(
      codeOfSync(() =>
        service.assertProcessableSource(
          'SIDE_BACKGROUND',
          facts(Buffer.alloc(8), { byteSize: limit }),
        ),
      ),
    ).toBe('NO_ERROR');
    expect(
      codeOfSync(() =>
        service.assertProcessableSource(
          'SIDE_BACKGROUND',
          facts(Buffer.alloc(8), { byteSize: limit + 1n }),
        ),
      ),
    ).toBe('NORMALIZATION_SOURCE_TOO_LARGE');
  });
});

describe('decoded limits, measured from real bytes', () => {
  const signal = new AbortController().signal;

  it('accepts an image exactly on the dimension boundary', async () => {
    const bytes = await png(NORMALIZATION_LIMITS.maxDecodedWidth, 8);
    const source = facts(bytes);
    const { service } = build(bytes, source);
    expect(await codeOf(() => service.verifySource('image/png', source, signal))).toBe('NO_ERROR');
  });

  it('refuses one pixel past the dimension boundary', async () => {
    const bytes = await png(NORMALIZATION_LIMITS.maxDecodedWidth + 1, 8);
    const source = facts(bytes);
    const { service } = build(bytes, source);
    expect(await codeOf(() => service.verifySource('image/png', source, signal))).toBe(
      'NORMALIZATION_DIMENSIONS_EXCEEDED',
    );
  });

  it('refuses a pixel budget overrun that stays inside both axes', () => {
    // 4096 × 4096 is exactly the budget, so a case that exceeds pixels without
    // exceeding an axis cannot exist under these two ceilings — asserted rather
    // than assumed, because a later loosening of one would silently create it.
    expect(NORMALIZATION_LIMITS.maxDecodedWidth * NORMALIZATION_LIMITS.maxDecodedHeight).toBe(
      NORMALIZATION_LIMITS.maxDecodedPixels,
    );
  });

  it('refuses bytes that no longer match the recorded checksum', async () => {
    const bytes = await png(64, 64);
    const source = facts(bytes, { checksum: `sha256:${'b'.repeat(64)}` });
    const { service } = build(bytes, source);
    expect(await codeOf(() => service.verifySource('image/png', source, signal))).toBe(
      'NORMALIZATION_SOURCE_INTEGRITY_MISMATCH',
    );
  });

  it('refuses an asset with no recorded checksum at all', async () => {
    const bytes = await png(64, 64);
    const source = facts(bytes, { checksum: null });
    const { service } = build(bytes, source);
    expect(await codeOf(() => service.verifySource('image/png', source, signal))).toBe(
      'NORMALIZATION_SOURCE_INTEGRITY_MISMATCH',
    );
  });

  it('refuses a container that disagrees with the recorded media type', async () => {
    const bytes = await png(64, 64);
    const source = facts(bytes, { mediaType: 'image/webp' });
    const { service } = build(bytes, source);
    expect(await codeOf(() => service.verifySource('image/webp', source, signal))).toBe(
      'NORMALIZATION_SOURCE_MEDIA_UNSUPPORTED',
    );
  });

  it('refuses undecodable bytes', async () => {
    const bytes = Buffer.from('not an image at all, but long enough to stream');
    const source = facts(bytes);
    const { service } = build(bytes, source);
    expect(await codeOf(() => service.verifySource('image/png', source, signal))).toBe(
      'NORMALIZATION_SOURCE_UNDECODABLE',
    );
  });
});

describe('the produced output', () => {
  const signal = new AbortController().signal;

  it('measures the quartet from the bytes it wrote, not from the source', async () => {
    const bytes = await png(200, 120);
    const source = facts(bytes);
    const { service, storage } = build(bytes, source);

    const output = await service.produce(source, signal);

    expect(output.widthPx).toBe(200);
    expect(output.heightPx).toBe(120);
    expect(output.mediaType).toBe('image/webp');
    // Not the source's type or size: the source is a PNG of a different length.
    expect(output.mediaType).not.toBe(source.mediaType);
    expect(output.byteSize).not.toBe(source.byteSize);

    const stored = requireObject(storage, output.storageKey);
    expect(BigInt(stored.length)).toBe(output.byteSize);
    const decoded = await sharp(stored).metadata();
    expect(decoded.format).toBe('webp');
    expect(decoded.width).toBe(output.widthPx);
    expect(decoded.height).toBe(output.heightPx);
  });

  it('is deterministic for the same input and policy', async () => {
    const bytes = await png(160, 90);
    const source = facts(bytes);
    const first = build(bytes, source);
    const second = build(bytes, source);

    const a = await first.service.produce(source, signal);
    const b = await second.service.produce(source, signal);
    expect(a.checksum).toBe(b.checksum);
    expect(a.byteSize).toBe(b.byteSize);
    expect(a.storageKey).toBe(b.storageKey);
  });

  it('writes to a deterministic private derivative key naming the kind', () => {
    const { service } = build();
    const key = service.derivativeKey(ASSET);
    expect(key).toContain(`/derivatives/${ASSET}/`);
    expect(key.endsWith(`${NORMALIZED_OUTPUT_POLICY.kind}.webp`)).toBe(true);
    expect(key.startsWith(service.derivativePrefix(ASSET))).toBe(true);
  });

  it('strips metadata and normalises colour, keeping alpha', async () => {
    const bytes = await sharp({
      create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } },
    })
      .withMetadata({ exif: { IFD0: { Copyright: 'fixture' } } })
      .png()
      .toBuffer();
    const source = facts(bytes);
    const { service, storage } = build(bytes, source);

    const output = await service.produce(source, signal);
    const decoded = await sharp(requireObject(storage, output.storageKey)).metadata();

    expect(decoded.hasAlpha).toBe(true);
    expect(decoded.exif).toBeUndefined();
    expect(decoded.space).toBe('srgb');
  });
});
