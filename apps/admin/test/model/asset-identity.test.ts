/**
 * Server-backed identity: the exact strings the approved design specifies, and
 * the guarantee that nothing else in the contract can become an asset's name.
 */
import {
  buildAssetMetaLine,
  formatAssetTimestamp,
  formatBinarySize,
  resolveAssetTitle,
} from '../../src/features/assets/model/asset-identity';
import { ASSET_COPY } from '../../src/features/assets/model/asset-copy';
import { makeAsset } from '../support/asset-fixture';

describe('asset title from media type', () => {
  it('maps every contract media type to its approved label', () => {
    expect(resolveAssetTitle('image/png')).toBe('Ảnh PNG');
    expect(resolveAssetTitle('image/jpeg')).toBe('Ảnh JPEG');
    expect(resolveAssetTitle('image/webp')).toBe('Ảnh WebP');
  });

  it('falls back to the neutral label and never renders a raw MIME string', () => {
    for (const value of ['image/avif', 'application/pdf', '', 'IMAGE/PNG', null, undefined, 42]) {
      expect(resolveAssetTitle(value)).toBe('Tài sản hình ảnh');
    }
  });
});

describe('binary size formatting', () => {
  it('formats bytes, kilobytes and megabytes with the vi-VN decimal comma', () => {
    expect(formatBinarySize(0)).toBe('0 B');
    expect(formatBinarySize(512)).toBe('512 B');
    expect(formatBinarySize(1024)).toBe('1 KB');
    // 1_004_032 / 1024 = 980.5
    expect(formatBinarySize(1_004_032)).toBe('980,5 KB');
    // 2_516_582 / 1024^2 ≈ 2.4
    expect(formatBinarySize(2_516_582)).toBe('2,4 MB');
    expect(formatBinarySize(3 * 1024 * 1024)).toBe('3 MB');
  });

  it('returns nothing usable for a value that is not a byte count', () => {
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, '2400000', null, undefined]) {
      expect(formatBinarySize(value)).toBeNull();
    }
  });
});

describe('timestamp formatting', () => {
  it('renders dd/MM/yyyy, HH:mm in local time on any host timezone', () => {
    // Constructed from local parts, so the expectation holds wherever the
    // suite runs — the formatter is what is under test, not the TZ database.
    const local = new Date(2026, 6, 27, 14, 35, 0);
    expect(formatAssetTimestamp(local.toISOString())).toBe('27/07/2026, 14:35');

    const padded = new Date(2026, 0, 5, 9, 4, 0);
    expect(formatAssetTimestamp(padded.toISOString())).toBe('05/01/2026, 09:04');
  });

  it('fails safely on an unusable timestamp without echoing the raw value', () => {
    for (const value of ['', 'not-a-date', null, undefined, 1_753_000_000_000]) {
      expect(formatAssetTimestamp(value)).toBeNull();
    }
  });
});

describe('secondary identity line', () => {
  it('joins size and timestamp with the approved separator', () => {
    const created = new Date(2026, 6, 27, 14, 35, 0).toISOString();
    expect(buildAssetMetaLine(2_516_582, created)).toBe('2,4 MB · 27/07/2026, 14:35');
  });

  it('shows the usable half alone when the other is unusable', () => {
    expect(buildAssetMetaLine(2_516_582, 'not-a-date')).toBe('2,4 MB');
    const created = new Date(2026, 6, 27, 14, 35, 0).toISOString();
    expect(buildAssetMetaLine(Number.NaN, created)).toBe('27/07/2026, 14:35');
  });

  it('falls back to bounded neutral copy when neither part is usable', () => {
    expect(buildAssetMetaLine(Number.NaN, 'nope')).toBe(ASSET_COPY.identity.metaUnavailable);
  });

  it('never derives identity from the checksum, the assetId or the storage-facing fields', () => {
    const asset = makeAsset();
    const rendered = [
      resolveAssetTitle(asset.mediaType),
      buildAssetMetaLine(asset.byteSize, asset.createdAt),
    ].join(' ');
    expect(rendered).not.toContain(asset.checksum);
    expect(rendered).not.toContain(asset.assetId);
    expect(rendered).not.toContain(asset.assetId.slice(0, 8));
    expect(rendered).not.toContain(asset.classification);
    expect(rendered).not.toContain(asset.kind);
    expect(rendered).not.toContain('image/png');
  });
});
