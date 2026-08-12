/**
 * The runtime watermark's token and tiling (`APP3-S09`).
 *
 * ## Runtime-only, and that is architectural rather than a convention
 *
 * Nothing in this file describes a `DesignDocument`. `APP3-P01` has no watermark
 * element, no watermark root field and no watermark coordinates, and this module
 * adds none — so a watermark cannot be serialized, cannot enter the canonical
 * hash, cannot appear in `APP3-S04`'s layer list, cannot be selected by
 * `APP3-S02`, cannot be transformed by `APP3-S03` and will not be saved by
 * `APP3-S10`. That is not enforced by a rule somewhere; it is unrepresentable,
 * because the document type is closed and this is not part of it.
 *
 * ## The token
 *
 * A bounded opaque string, minted **once per Studio runtime** from the browser's
 * cryptographic randomness. It is a marking, not a credential:
 *
 * - it carries no name, email, phone, IP, user agent, Session id or secret,
 *   storage key, `assetId` or `derivativeId` — there is no code path by which one
 *   could reach it, because nothing is passed in;
 * - it is never sent to an API, never persisted, never logged, and grants
 *   nothing. `docs/09-SECURITY-AND-ABUSE-PREVENTION.md` §6 asks for a "dynamic
 *   request/session identifier" as one *layered* control, and an opaque runtime
 *   value is the form of that which cannot leak the thing it identifies;
 * - it changes on a genuine reload, which is what makes a leaked screenshot
 *   attributable to a session without the screenshot containing a session.
 *
 * `Math.random()` is deliberately not a fallback. A value that is meant to be
 * unguessable and is quietly not would be worse than an obvious refusal, so an
 * environment without `crypto.getRandomValues` gets a constant marked as such —
 * the watermark still appears, and it does not pretend to be unique.
 */

/** Characters the token is drawn from: unambiguous when read off a screenshot. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Long enough to be worth reading, short enough to tile. */
const TOKEN_LENGTH = 8;

/**
 * What an environment with no cryptographic randomness gets.
 *
 * Rendered exactly like a real token so the watermark is never absent, and
 * deliberately constant so it cannot be mistaken for one.
 */
export const WATERMARK_TOKEN_UNAVAILABLE = 'XEMTRUOC';

/**
 * The rotation of the repeated marks, in degrees.
 *
 * Diagonal, because `docs/05-DESIGN-STUDIO-SPEC.md` §10 asks for a watermark
 * that is "difficult to crop out": an axis-aligned band can be cropped away
 * along its own edge, and a diagonal one cannot be cropped without taking
 * artwork with it.
 */
export const WATERMARK_ANGLE_DEG = -30;

/**
 * How many marks the pattern draws — a fixed grid, and fixed is the point.
 *
 * The count depends on the viewport tile size alone. It does not depend on the
 * number of elements in the document, the zoom factor, the pan offset or the
 * number of image layers, so a hundred-element design at 400 % has exactly the
 * same watermark DOM as an empty one at fit.
 */
export const WATERMARK_ROWS = 7;
export const WATERMARK_COLUMNS = 5;

/** One repeated mark. Position is a percentage of the *viewport*, never the document. */
export interface WatermarkTile {
  readonly key: string;
  /** Left offset, in percent of the overlay box. */
  readonly leftPercent: number;
  /** Top offset, in percent of the overlay box. */
  readonly topPercent: number;
}

/**
 * Mints one opaque runtime token.
 *
 * Called once per Studio runtime by `useStudioWatermarkToken`; calling it twice
 * returns two different values, which is why nothing else may call it.
 */
export function mintWatermarkToken(): string {
  const random = globalThis.crypto;
  if (random === undefined || typeof random.getRandomValues !== 'function') {
    return WATERMARK_TOKEN_UNAVAILABLE;
  }
  const bytes = random.getRandomValues(new Uint8Array(TOKEN_LENGTH));
  let token = '';
  for (const byte of bytes) token += ALPHABET[byte % ALPHABET.length];
  return token;
}

/**
 * The fixed grid of marks.
 *
 * Rows are offset by half a column so the marks interlock rather than forming
 * clean vertical corridors a crop could follow. The grid is over-drawn beyond
 * the box on both axes because the whole pattern is rotated, and a grid that
 * stopped at the edges would leave the rotated corners bare — which is exactly
 * where a crop starts.
 */
export function watermarkTiles(): readonly WatermarkTile[] {
  const tiles: WatermarkTile[] = [];
  const columnStep = 100 / WATERMARK_COLUMNS;
  const rowStep = 100 / WATERMARK_ROWS;

  for (let row = 0; row < WATERMARK_ROWS; row += 1) {
    for (let column = 0; column < WATERMARK_COLUMNS; column += 1) {
      const stagger = row % 2 === 0 ? 0 : columnStep / 2;
      tiles.push({
        key: `${String(row)}-${String(column)}`,
        // Over-drawn: the grid runs from -25 % to 125 % so the rotated corners
        // are covered.
        leftPercent: -25 + (column * columnStep + stagger) * 1.5,
        topPercent: -25 + row * rowStep * 1.5,
      });
    }
  }
  return tiles;
}
