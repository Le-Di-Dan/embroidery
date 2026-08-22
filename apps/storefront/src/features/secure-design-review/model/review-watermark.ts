/**
 * The runtime watermark's token and tiling on the review surface (`APP6-S02`
 * §11, reproducing `APP3-S09`'s delivered treatment; `609:263`, `609:371`).
 *
 * ## Runtime-only, and that is architectural rather than a convention
 *
 * Nothing in this file describes a `DesignDocument`. `APP3-P01` has no
 * watermark element, no watermark root field and no watermark coordinates, and
 * this module adds none — so the watermark cannot be serialized, cannot enter
 * the canonical hash `documentHash` was computed over, and cannot become part
 * of what an approval binds. That is not enforced by a rule somewhere; it is
 * unrepresentable, because the document type is closed and this is not part of
 * it.
 *
 * ## Why the values are `APP3-S09`'s and not `APP6-D01`'s measurements
 *
 * `APP6-D01` §5 records the watermark as *reproduced at its exact delivered
 * treatment, read from the live APP3 node* — the drawn frame is a reproduction
 * of the runtime, so the runtime is the authority when the two are read to
 * different numbers (D01 measures the Figma reproduction at 18° and a 160 × 130
 * tile; the delivered runtime tiles by percentage at −30°). Following the
 * drawing here would give the customer a *different* watermark from the one the
 * Studio shows them on the same artwork, which is the one thing a mark meant to
 * be recognisable must not do. Recorded as
 * `FU-APP6-S02-WATERMARK-DRAWN-VS-DELIVERED-01`.
 *
 * ## The token
 *
 * A bounded opaque string, minted **once per mounted review**, from the
 * browser's cryptographic randomness. It is a marking, not a credential:
 *
 * - it carries no name, email, phone, IP, user agent, grant, request id, design
 *   version id, document hash, agreement id or secure-link token — there is no
 *   code path by which one could reach it, because nothing is passed in;
 * - it is never sent to an API, never persisted, never logged, and grants
 *   nothing;
 * - it changes on a genuine reload, which is what makes a leaked screenshot
 *   attributable to a viewing without the screenshot containing one.
 *
 * `Math.random()` is deliberately not a fallback. A value meant to be
 * unguessable and quietly not would be worse than an obvious refusal, so an
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
export const REVIEW_WATERMARK_TOKEN_UNAVAILABLE = 'XEMTRUOC';

/**
 * The rotation of the repeated marks, in degrees.
 *
 * Diagonal, because `docs/05-DESIGN-STUDIO-SPEC.md` §10 asks for a watermark
 * that is "difficult to crop out": an axis-aligned band can be cropped away
 * along its own edge, and a diagonal one cannot be cropped without taking
 * artwork with it.
 */
export const REVIEW_WATERMARK_ANGLE_DEG = -30;

/**
 * How many marks the pattern draws — a fixed grid, and fixed is the point.
 *
 * The count depends on the viewport tile size alone, never on the number of
 * elements in the document, so a hundred-element design has exactly the same
 * watermark DOM as an empty one.
 */
export const REVIEW_WATERMARK_ROWS = 7;
export const REVIEW_WATERMARK_COLUMNS = 5;

/** One repeated mark. Position is a percentage of the *preview box*. */
export interface ReviewWatermarkTile {
  readonly key: string;
  /** Left offset, in percent of the overlay box. */
  readonly leftPercent: number;
  /** Top offset, in percent of the overlay box. */
  readonly topPercent: number;
}

/**
 * Mints one opaque runtime token.
 *
 * Called once per mounted review; calling it twice returns two different
 * values, which is why nothing else may call it.
 */
export function mintReviewWatermarkToken(): string {
  const random = globalThis.crypto;
  if (typeof random?.getRandomValues !== 'function') {
    return REVIEW_WATERMARK_TOKEN_UNAVAILABLE;
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
export function reviewWatermarkTiles(): readonly ReviewWatermarkTile[] {
  const tiles: ReviewWatermarkTile[] = [];
  const columnStep = 100 / REVIEW_WATERMARK_COLUMNS;
  const rowStep = 100 / REVIEW_WATERMARK_ROWS;

  for (let row = 0; row < REVIEW_WATERMARK_ROWS; row += 1) {
    for (let column = 0; column < REVIEW_WATERMARK_COLUMNS; column += 1) {
      const stagger = row % 2 === 0 ? 0 : columnStep / 2;
      tiles.push({
        key: `${String(row)}-${String(column)}`,
        // Over-drawn: the grid runs from -25 % so the rotated corners are covered.
        leftPercent: -25 + (column * columnStep + stagger) * 1.5,
        topPercent: -25 + row * rowStep * 1.5,
      });
    }
  }
  return tiles;
}
