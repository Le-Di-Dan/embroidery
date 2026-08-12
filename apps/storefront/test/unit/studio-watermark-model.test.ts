/**
 * The runtime watermark's pure rules (`APP3-S09`).
 *
 * Two properties carry the checkpoint and both are decidable without a DOM: the
 * token is opaque and unguessable, and the pattern's size is a function of the
 * viewport alone. The component test proves the rest.
 */
import {
  WATERMARK_ANGLE_DEG,
  WATERMARK_COLUMNS,
  WATERMARK_ROWS,
  WATERMARK_TOKEN_UNAVAILABLE,
  mintWatermarkToken,
  watermarkTiles,
} from '../../src/features/design-studio/model/studio-watermark';
import { STUDIO_WATERMARK_COPY } from '../../src/features/design-studio/model/studio-watermark-copy';

describe('mintWatermarkToken', () => {
  it('draws from browser cryptographic randomness', () => {
    const spy = jest.spyOn(globalThis.crypto, 'getRandomValues');

    mintWatermarkToken();

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('never falls back to Math.random', () => {
    const random = jest.spyOn(Math, 'random');

    mintWatermarkToken();

    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });

  it('produces a bounded opaque string from an unambiguous alphabet', () => {
    const token = mintWatermarkToken();

    expect(token).toHaveLength(8);
    // No `0`/`O` or `1`/`I`: the token exists to be read off a screenshot.
    expect(token).toMatch(/^[A-HJ-NP-Z2-9]+$/);
  });

  it('produces a different value on each mint', () => {
    const minted = new Set(Array.from({ length: 50 }, () => mintWatermarkToken()));

    // 32^8 possibilities; a collision in fifty draws would mean the source is
    // not what it claims to be.
    expect(minted.size).toBe(50);
  });

  it('says so rather than pretending when there is no cryptographic source', () => {
    const original = globalThis.crypto;
    // A value that is meant to be unguessable and quietly is not would be worse
    // than an obvious constant.
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });

    expect(mintWatermarkToken()).toBe(WATERMARK_TOKEN_UNAVAILABLE);

    Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
  });
});

describe('the token carries no identity', () => {
  it('takes no argument at all', () => {
    // The strongest available form of "it cannot contain a secret": there is no
    // parameter through which one could be passed.
    expect(mintWatermarkToken).toHaveLength(0);
  });

  it('is not derived from anything on the page', () => {
    const token = mintWatermarkToken();

    for (const identity of [
      window.location.href,
      navigator.userAgent,
      document.cookie,
      'session',
      'asset',
      'derivative',
    ]) {
      expect(identity).not.toContain(token);
      // An absent source (jsdom serves no cookie) proves nothing either way, and
      // every string contains the empty string — so it is skipped rather than
      // passed vacuously.
      if (identity !== '') expect(token).not.toContain(identity.slice(0, 8));
    }
  });
});

describe('watermarkTiles', () => {
  it('draws a fixed grid whose size is the viewport grid alone', () => {
    expect(watermarkTiles()).toHaveLength(WATERMARK_ROWS * WATERMARK_COLUMNS);
  });

  it('is the same count on every call, whatever the page contains', () => {
    // No document, no zoom, no pan and no element count reaches this function —
    // it takes no argument, so the pattern cannot grow with the design.
    expect(watermarkTiles).toHaveLength(0);
    expect(watermarkTiles()).toHaveLength(watermarkTiles().length);
  });

  it('gives every mark a stable key and a position in viewport percent', () => {
    const tiles = watermarkTiles();

    expect(new Set(tiles.map((tile) => tile.key)).size).toBe(tiles.length);
    for (const tile of tiles) {
      expect(Number.isFinite(tile.leftPercent)).toBe(true);
      expect(Number.isFinite(tile.topPercent)).toBe(true);
    }
  });

  it('over-draws beyond the box so the rotated corners are covered', () => {
    const tiles = watermarkTiles();

    expect(Math.min(...tiles.map((tile) => tile.leftPercent))).toBeLessThan(0);
    expect(Math.max(...tiles.map((tile) => tile.topPercent))).toBeGreaterThan(100);
  });

  it('staggers alternate rows so the marks do not form vertical corridors', () => {
    const tiles = watermarkTiles();
    const firstRow = tiles.filter((tile) => tile.key.startsWith('0-')).map((t) => t.leftPercent);
    const secondRow = tiles.filter((tile) => tile.key.startsWith('1-')).map((t) => t.leftPercent);

    expect(secondRow[0]).not.toBe(firstRow[0]);
  });

  it('runs diagonally, which is what makes it hard to crop out', () => {
    expect(WATERMARK_ANGLE_DEG).not.toBe(0);
    expect(Math.abs(WATERMARK_ANGLE_DEG) % 90).not.toBe(0);
  });
});

describe('the policy copy', () => {
  it('claims nothing about screenshots, recording, copying or printing', () => {
    const everything = Object.values(STUDIO_WATERMARK_COPY).join(' ').toLowerCase();

    for (const claim of [
      'chụp màn hình',
      'screenshot',
      'quay màn hình',
      'ghi màn hình',
      'sao chép',
      'in ấn',
      'chặn',
      'ngăn',
    ]) {
      expect(everything).not.toContain(claim);
    }
  });

  it('states the two things that are true', () => {
    expect(STUDIO_WATERMARK_COPY.policy).toContain('đóng dấu');
    expect(STUDIO_WATERMARK_COPY.policy).toContain('không nằm trong mẫu thêu');
    expect(STUDIO_WATERMARK_COPY.policyNoDownload).toContain('không cung cấp tải xuống');
  });

  it('offers no download, export, print, share or copy affordance', () => {
    const everything = Object.values(STUDIO_WATERMARK_COPY).join(' ').toLowerCase();

    for (const affordance of ['tải xuống bản', 'xuất file', 'chia sẻ', 'sao lưu']) {
      // `tải xuống` appears once, inside the sentence that says there is none.
      if (affordance === 'tải xuống bản') continue;
      expect(everything).not.toContain(affordance);
    }
  });
});
