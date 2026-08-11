/**
 * Derivative generation against real Sharp and an in-memory store.
 *
 * The outputs are decoded back and inspected, so the assertions are about the
 * bytes that actually reached the store rather than about the options the
 * pipeline was configured with.
 */
import sharp from 'sharp';

import {
  CATALOG_PREVIEW_OUTPUT_POLICY,
  THUMBNAIL_OUTPUT_POLICY,
} from '../domain/asset-processing-policy';
import { CATALOG_INSPECTION_LANE } from '../domain/asset-inspection-lane';
import { AssetRejectedError } from '../domain/processing-rejection';
import type { InspectedSource } from '../domain/inspection-detail';
import type { AssetSourceFacts } from '../domain/repositories/asset-inspection.repository';
import { InMemoryObjectStorage } from '../tests/in-memory-object-storage';
import {
  checksumOf,
  exifRotatedJpeg,
  pngWithAlpha,
  tinyPng,
  truncatedPng,
  type SyntheticImage,
} from '../tests/image-fixtures';
import { DerivativeGenerationService } from './derivative-generation.service';
import { SourceVerificationService } from './source-verification.service';

const ASSET_ID = '0195f0a6-8f2a-7c3b-9d41-6a2f0b7c1d84';
const ORIGINAL_KEY = `test/originals/${ASSET_ID}/original.png`;

describe('DerivativeGenerationService', () => {
  let storage: InMemoryObjectStorage;
  let generation: DerivativeGenerationService;
  let verification: SourceVerificationService;
  let controller: AbortController;

  beforeEach(() => {
    storage = new InMemoryObjectStorage();
    generation = new DerivativeGenerationService(storage, 'test');
    verification = new SourceVerificationService(storage);
    controller = new AbortController();
  });

  function facts(image: SyntheticImage): AssetSourceFacts {
    return {
      assetId: ASSET_ID,
      storageKey: ORIGINAL_KEY,
      mediaType: image.mediaType,
      byteSize: BigInt(image.byteSize),
      checksum: image.checksum,
    };
  }

  async function seed(image: SyntheticImage): Promise<{
    source: AssetSourceFacts;
    inspected: InspectedSource;
  }> {
    storage.put('ORIGINALS', ORIGINAL_KEY, image.bytes, image.mediaType);
    const source = facts(image);
    return {
      source,
      inspected: await verification.verify(source, CATALOG_INSPECTION_LANE, controller.signal),
    };
  }

  describe('deterministic keys', () => {
    it('namespaces both outputs by environment, asset and kind', () => {
      expect(generation.derivativeKey(ASSET_ID, 'THUMBNAIL')).toBe(
        `test/derivatives/${ASSET_ID}/THUMBNAIL.webp`,
      );
      expect(generation.derivativeKey(ASSET_ID, 'CATALOG_PREVIEW')).toBe(
        `test/derivatives/${ASSET_ID}/CATALOG_PREVIEW.webp`,
      );
    });

    it('scopes the cleanup prefix to one asset', () => {
      expect(generation.derivativePrefix(ASSET_ID)).toBe(`test/derivatives/${ASSET_ID}/`);
    });
  });

  it('writes a WebP thumbnail inside its bounding box', async () => {
    const { source, inspected } = await seed(await pngWithAlpha(1200, 800));

    const result = await generation.generate({
      source,
      inspected,
      policy: THUMBNAIL_OUTPUT_POLICY,
      signal: controller.signal,
    });

    expect(result).toMatchObject({
      kind: 'THUMBNAIL',
      mediaType: 'image/webp',
      width: 480,
      height: 320,
      isWatermarked: false,
      storageKey: `test/derivatives/${ASSET_ID}/THUMBNAIL.webp`,
    });
    expect(result.byteSize).toBeGreaterThan(0);
    expect(result.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('writes a WebP catalog preview inside its own, larger box', async () => {
    const { source, inspected } = await seed(await pngWithAlpha(4000, 2000));

    const result = await generation.generate({
      source,
      inspected,
      policy: CATALOG_PREVIEW_OUTPUT_POLICY,
      signal: controller.signal,
    });

    expect({ width: result.width, height: result.height }).toEqual({ width: 1920, height: 960 });
  });

  it('records the checksum of the bytes that actually reached the store', async () => {
    const { source, inspected } = await seed(await pngWithAlpha(600, 400));

    const result = await generation.generate({
      source,
      inspected,
      policy: THUMBNAIL_OUTPUT_POLICY,
      signal: controller.signal,
    });

    const stored = storage.read('DERIVATIVES', result.storageKey);
    expect(stored).toBeDefined();
    expect(stored?.length).toBe(result.byteSize);
    // Hashed here from the stored object, not from the pipeline's report: the
    // record must describe the bytes a reader will actually get back.
    expect(result.checksum).toBe(checksumOf(stored ?? Buffer.alloc(0)));
  });

  it('preserves alpha and strips every metadata block', async () => {
    const { source, inspected } = await seed(await pngWithAlpha(500, 500));

    const result = await generation.generate({
      source,
      inspected,
      policy: THUMBNAIL_OUTPUT_POLICY,
      signal: controller.signal,
    });
    const output = await sharp(storage.read('DERIVATIVES', result.storageKey)).metadata();

    expect(output.format).toBe('webp');
    expect(output.hasAlpha).toBe(true);
    expect(output.exif).toBeUndefined();
    expect(output.icc).toBeUndefined();
    expect(output.xmp).toBeUndefined();
    expect(output.iptc).toBeUndefined();
  });

  it('normalises to sRGB', async () => {
    const { source, inspected } = await seed(await pngWithAlpha(300, 300));

    const result = await generation.generate({
      source,
      inspected,
      policy: THUMBNAIL_OUTPUT_POLICY,
      signal: controller.signal,
    });
    const output = await sharp(storage.read('DERIVATIVES', result.storageKey)).metadata();

    expect(output.space).toBe('srgb');
  });

  it('never enlarges a source smaller than the box', async () => {
    const { source, inspected } = await seed(await tinyPng());

    const result = await generation.generate({
      source,
      inspected,
      policy: CATALOG_PREVIEW_OUTPUT_POLICY,
      signal: controller.signal,
    });

    expect({ width: result.width, height: result.height }).toEqual({ width: 40, height: 30 });
  });

  it('applies EXIF orientation before resizing', async () => {
    const image = await exifRotatedJpeg(200, 100);
    storage.put('ORIGINALS', ORIGINAL_KEY, image.bytes, image.mediaType);
    const source = facts(image);
    const inspected = await verification.verify(source, CATALOG_INSPECTION_LANE, controller.signal);

    const result = await generation.generate({
      source,
      inspected,
      policy: THUMBNAIL_OUTPUT_POLICY,
      signal: controller.signal,
    });

    // The stored image is 200×100; a viewer sees 100×200, and so does the
    // derivative. A pipeline that skipped `autoOrient` would produce 200×100.
    expect({ width: result.width, height: result.height }).toEqual({ width: 100, height: 200 });
  });

  it('rejects an original whose pixel data will not decode', async () => {
    const image = await truncatedPng();
    storage.put('ORIGINALS', ORIGINAL_KEY, image.bytes, image.mediaType);
    const source = facts(image);
    const inspected = await verification.verify(source, CATALOG_INSPECTION_LANE, controller.signal);

    await expect(
      generation.generate({
        source,
        inspected,
        policy: THUMBNAIL_OUTPUT_POLICY,
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(AssetRejectedError);
  });

  it('treats an upload failure as retryable, not as a verdict on the image', async () => {
    const { source, inspected } = await seed(await pngWithAlpha(300, 200));
    storage.failWith('put', 'PROVIDER_UNAVAILABLE');

    await expect(
      generation.generate({
        source,
        inspected,
        policy: THUMBNAIL_OUTPUT_POLICY,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ errorClass: 'JOB_DEPENDENCY_UNAVAILABLE' });
  });

  it('treats a source read that dies mid-stream as retryable', async () => {
    const { source, inspected } = await seed(await pngWithAlpha(800, 600));
    storage.midStreamReadFailure = true;

    await expect(
      generation.generate({
        source,
        inspected,
        policy: THUMBNAIL_OUTPUT_POLICY,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ errorClass: 'JOB_TRANSIENT_FAILURE' });
  });

  it('closes the pipeline and reports a timeout when the attempt is aborted', async () => {
    const { source, inspected } = await seed(await pngWithAlpha(2000, 2000));
    const attempt = generation.generate({
      source,
      inspected,
      policy: CATALOG_PREVIEW_OUTPUT_POLICY,
      signal: controller.signal,
    });
    controller.abort();

    await expect(attempt).rejects.toMatchObject({ errorClass: 'JOB_HANDLER_TIMEOUT' });
  });

  it('refuses to start once the attempt is already aborted', async () => {
    const { source, inspected } = await seed(await pngWithAlpha(100, 100));
    controller.abort();

    await expect(
      generation.generate({
        source,
        inspected,
        policy: THUMBNAIL_OUTPUT_POLICY,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ errorClass: 'JOB_HANDLER_TIMEOUT' });
    expect(storage.keys('DERIVATIVES')).toEqual([]);
  });

  it('reads the original exactly once per output', async () => {
    const { source, inspected } = await seed(await pngWithAlpha(600, 400));
    const before = storage.calls.filter((call) => call.operation === 'get').length;

    await generation.generate({
      source,
      inspected,
      policy: THUMBNAIL_OUTPUT_POLICY,
      signal: controller.signal,
    });

    expect(storage.calls.filter((call) => call.operation === 'get')).toHaveLength(before + 1);
  });
});
