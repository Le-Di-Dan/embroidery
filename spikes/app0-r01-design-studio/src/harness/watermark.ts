/**
 * Watermark is *preview policy*, not document content (D-008, 05 §10, 09 §6).
 *
 * Consequences proven by the spike:
 *  - it is created from a policy object supplied at mount/load time, never read
 *    from or written to the design document;
 *  - it is non-selectable, non-deletable and topmost in every engine;
 *  - reloading a document regenerates it, because the document never carried it;
 *  - the marker is an opaque session/request token — never raw PII.
 *
 * This is deterrence and value reduction, not screenshot prevention (D-009).
 */

export interface WatermarkPolicy {
  /** Opaque session/request marker. Never an email, phone or customer name. */
  readonly marker: string;
  readonly tileWidthPx: number;
  readonly tileHeightPx: number;
  readonly angleDeg: number;
  readonly opacity: number;
  readonly fontSizePx: number;
  readonly lightHex: string;
  readonly darkHex: string;
}

export const WATERMARK_NODE_NAME = 'spike-watermark';

/** Regex the tests use to prove no raw PII reaches the marker. */
const PII_PATTERNS = [/@/, /\+?\d{7,}/];

export function createWatermarkPolicy(sessionToken: string): WatermarkPolicy {
  for (const pattern of PII_PATTERNS) {
    if (pattern.test(sessionToken)) {
      throw new Error('Watermark marker looks like raw PII; use an opaque session token.');
    }
  }
  return {
    marker: `PREVIEW ${sessionToken}`,
    tileWidthPx: 180,
    tileHeightPx: 120,
    angleDeg: -30,
    opacity: 0.28,
    fontSizePx: 16,
    lightHex: '#ffffff',
    darkHex: '#111111',
  };
}

export interface WatermarkTile {
  readonly xPx: number;
  readonly yPx: number;
}

/** Tile positions covering the whole preview, oversized so rotation still fills. */
export function watermarkTiles(
  policy: WatermarkPolicy,
  widthPx: number,
  heightPx: number,
): WatermarkTile[] {
  const tiles: WatermarkTile[] = [];
  const overscan = Math.max(policy.tileWidthPx, policy.tileHeightPx);
  for (let y = -overscan; y < heightPx + overscan; y += policy.tileHeightPx) {
    for (let x = -overscan; x < widthPx + overscan; x += policy.tileWidthPx) {
      tiles.push({ xPx: x, yPx: y });
    }
  }
  return tiles;
}
