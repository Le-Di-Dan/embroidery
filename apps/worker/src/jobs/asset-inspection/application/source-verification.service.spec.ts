/**
 * Source verification against real Sharp and an in-memory store.
 *
 * Docker-free but not decode-free: every fixture is a genuinely decodable file,
 * because the point of these cases is what libvips actually reports, not what a
 * stub was told to say.
 */
import { AssetRejectedError } from '../domain/processing-rejection';
import { AssetInspectionContradictionError } from '../domain/inspection-contradiction';
import type { AssetSourceFacts } from '../domain/repositories/asset-inspection.repository';
import { WorkerJobError } from '../../../runtime/errors/worker-job-error';
import { InMemoryObjectStorage } from '../tests/in-memory-object-storage';
import {
  animatedWebp,
  exifRotatedJpeg,
  garbage,
  jpeg,
  overDimensionLimitPng,
  overPixelLimitPng,
  pngWithAlpha,
  staticWebp,
  truncatedPng,
  type SyntheticImage,
} from '../tests/image-fixtures';
import { SourceVerificationService } from './source-verification.service';

const KEY = 'test/originals/0195f0a6-8f2a-7c3b-9d41-6a2f0b7c1d84/original.png';

function facts(image: SyntheticImage, overrides: Partial<AssetSourceFacts> = {}): AssetSourceFacts {
  return {
    assetId: '0195f0a6-8f2a-7c3b-9d41-6a2f0b7c1d84',
    storageKey: KEY,
    mediaType: image.mediaType,
    byteSize: BigInt(image.byteSize),
    checksum: image.checksum,
    ...overrides,
  };
}

describe('SourceVerificationService', () => {
  let storage: InMemoryObjectStorage;
  let service: SourceVerificationService;
  let controller: AbortController;

  beforeEach(() => {
    storage = new InMemoryObjectStorage();
    service = new SourceVerificationService(storage);
    controller = new AbortController();
  });

  async function verify(image: SyntheticImage, overrides: Partial<AssetSourceFacts> = {}) {
    storage.put('ORIGINALS', KEY, image.bytes, image.mediaType);
    return service.verify(facts(image, overrides), controller.signal);
  }

  async function rejectionCodeFor(
    image: SyntheticImage,
    overrides: Partial<AssetSourceFacts> = {},
  ): Promise<string> {
    try {
      await verify(image, overrides);
    } catch (error: unknown) {
      if (error instanceof AssetRejectedError) {
        return error.rejectionCode;
      }
      throw error;
    }
    throw new Error('Expected a deterministic rejection.');
  }

  it('accepts a PNG and reports what was decoded', async () => {
    const image = await pngWithAlpha(1200, 800);

    await expect(verify(image)).resolves.toEqual({
      mediaType: 'image/png',
      format: 'png',
      byteSize: image.byteSize,
      checksum: image.checksum,
      width: 1200,
      height: 800,
      orientedWidth: 1200,
      orientedHeight: 800,
      channels: 4,
      pages: 1,
    });
  });

  it('accepts a JPEG', async () => {
    const result = await verify(await jpeg(900, 600));

    expect(result.format).toBe('jpeg');
    expect(result.channels).toBe(3);
  });

  it('accepts a static WebP', async () => {
    const result = await verify(await staticWebp(640, 480));

    expect(result.format).toBe('webp');
    expect(result.pages).toBe(1);
  });

  it('reports oriented dimensions for an EXIF-rotated source', async () => {
    // The stored image is 200×100; orientation 6 means a viewer sees 100×200,
    // and every limit has to be applied to what the viewer sees.
    const result = await verify(await exifRotatedJpeg(200, 100));

    expect({ width: result.width, height: result.height }).toEqual({ width: 200, height: 100 });
    expect({ w: result.orientedWidth, h: result.orientedHeight }).toEqual({ w: 100, h: 200 });
  });

  it('rejects a source whose recorded size disagrees with the object', async () => {
    const image = await pngWithAlpha(200, 200);

    await expect(rejectionCodeFor(image, { byteSize: BigInt(image.byteSize + 1) })).resolves.toBe(
      'ORIGINAL_INTEGRITY_MISMATCH',
    );
  });

  it('abandons an object that is longer than its recorded size', async () => {
    const image = await pngWithAlpha(200, 200);

    await expect(rejectionCodeFor(image, { byteSize: BigInt(64) })).resolves.toBe(
      'ORIGINAL_INTEGRITY_MISMATCH',
    );
  });

  it('rejects a source whose recorded checksum disagrees with the bytes', async () => {
    const image = await pngWithAlpha(200, 200);

    await expect(rejectionCodeFor(image, { checksum: `sha256:${'0'.repeat(64)}` })).resolves.toBe(
      'ORIGINAL_INTEGRITY_MISMATCH',
    );
  });

  it('rejects a source that decodes as a different format than recorded', async () => {
    const image = await jpeg(100, 100);

    // The row (and the object key's extension, and every consumer) says PNG.
    await expect(
      rejectionCodeFor({ ...image, mediaType: 'image/png' }, { mediaType: 'image/png' }),
    ).resolves.toBe('SOURCE_MEDIA_TYPE_MISMATCH');
  });

  it('rejects an undecodable object', async () => {
    await expect(rejectionCodeFor(garbage())).resolves.toBe('DECODE_FAILED');
  });

  it('rejects an animated WebP', async () => {
    await expect(rejectionCodeFor(await animatedWebp())).resolves.toBe(
      'ANIMATED_IMAGE_UNSUPPORTED',
    );
  });

  it('rejects a source over the 40-megapixel ceiling with the pixel code', async () => {
    // Not `DECODE_FAILED`: the header parses perfectly, and recording "could
    // not decode" for a 48-megapixel upload would tell an operator nothing.
    await expect(rejectionCodeFor(await overPixelLimitPng())).resolves.toBe('PIXEL_LIMIT_EXCEEDED');
  });

  it('rejects a source over the 12,000-pixel edge with the dimension code', async () => {
    await expect(rejectionCodeFor(await overDimensionLimitPng())).resolves.toBe(
      'DIMENSION_LIMIT_EXCEEDED',
    );
  });

  it('rejects an unsupported source media type without reading the object', async () => {
    const image = await pngWithAlpha(50, 50);

    await expect(rejectionCodeFor(image, { mediaType: 'image/gif' })).resolves.toBe(
      'SOURCE_FORMAT_UNSUPPORTED',
    );
    expect(storage.calls).toHaveLength(0);
  });

  it('stops on an asset with no recorded checksum', async () => {
    const image = await pngWithAlpha(50, 50);
    storage.put('ORIGINALS', KEY, image.bytes, image.mediaType);

    await expect(
      service.verify(facts(image, { checksum: null }), controller.signal),
    ).rejects.toBeInstanceOf(AssetInspectionContradictionError);
  });

  it('passes a truncated file that still hashes to its recorded facts', async () => {
    // Integrity is about "is this the file the row describes", not "is it
    // good". A corrupt object that was uploaded corrupt gets past this stage
    // and is caught by the decode in generation.
    const image = await truncatedPng();

    await expect(verify(image)).resolves.toMatchObject({ format: 'png' });
  });

  it('treats an unreachable store as retryable, not as a verdict on the file', async () => {
    const image = await pngWithAlpha(50, 50);
    storage.put('ORIGINALS', KEY, image.bytes, image.mediaType);
    storage.failWith('get', 'PROVIDER_UNAVAILABLE');

    await expect(service.verify(facts(image), controller.signal)).rejects.toMatchObject({
      errorClass: 'JOB_DEPENDENCY_UNAVAILABLE',
    });
  });

  it('treats a missing original as retryable', async () => {
    const image = await pngWithAlpha(50, 50);

    // The row says the object exists, so a store that cannot serve it is
    // lagging or broken — never a reason to record a verdict about the image.
    await expect(service.verify(facts(image), controller.signal)).rejects.toBeInstanceOf(
      WorkerJobError,
    );
  });

  it('treats a stream that dies mid-read as retryable', async () => {
    const image = await pngWithAlpha(400, 400);
    storage.put('ORIGINALS', KEY, image.bytes, image.mediaType);
    storage.midStreamReadFailure = true;

    await expect(service.verify(facts(image), controller.signal)).rejects.toMatchObject({
      errorClass: 'JOB_TRANSIENT_FAILURE',
    });
  });

  it('reports an already-aborted attempt as a handler timeout', async () => {
    const image = await pngWithAlpha(50, 50);
    storage.put('ORIGINALS', KEY, image.bytes, image.mediaType);
    controller.abort();

    await expect(service.verify(facts(image), controller.signal)).rejects.toMatchObject({
      errorClass: 'JOB_HANDLER_TIMEOUT',
    });
  });

  it('reads the original at most twice', async () => {
    await verify(await pngWithAlpha(600, 400));

    expect(storage.calls.filter((call) => call.operation === 'get')).toHaveLength(2);
  });
});
