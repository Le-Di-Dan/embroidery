/**
 * How the published inventory numbers are turned into what the operator reads
 * (`775:3`, `775:101`, `775:63`).
 *
 * ### It presents, it does not compute
 *
 * There is no availability arithmetic in this module. `available` arrives from
 * the server, computed under the `sku_stocks` row lock, and this file only
 * decides which tone it is rendered in. A second client-side
 * `onHand − held − reserved` would be a rival source of truth that disagrees
 * with the server the moment a reservation lands between two renders.
 *
 * ### A negative availability is a valid state
 *
 * `775:151` renders `−3` in the error tone because it deserves attention, not
 * because it is corrupt: reservations exceeding on-hand is an ordinary
 * consequence of the reservation model. Nothing is clamped to zero and nothing
 * is labelled invalid.
 *
 * ### Tone is never the message
 *
 * Every tone here accompanies a written label or a signed number, so an
 * operator who cannot distinguish the tints still reads the fact — the same
 * rule `AdminStatusBadge` follows.
 */
import type { AdminStatusTone } from '../../../shared/status/admin-status-badge';

/** U+2212 MINUS SIGN — the glyph `775:180` uses, not a hyphen. */
const MINUS = '−';

/**
 * The tone of the `available` metric. Negative is notable, not invalid.
 *
 * The return type is narrowed to the two tones this metric can actually take,
 * so a card cannot be handed a tint the stylesheet has no rule for.
 */
export function availableTone(available: number): Extract<AdminStatusTone, 'success' | 'error'> {
  return available < 0 ? 'error' : 'success';
}

/**
 * The low-stock pill, or `null` when there is nothing truthful to assert.
 *
 * With no `lowStockThreshold` configured the server's `lowStock` is always
 * `false` (the published field description says so), which is the absence of a
 * judgement rather than a healthy one. Rendering "Đủ tồn" there would attribute
 * to the server an assessment it did not make, so the pill is omitted and
 * `776:53`'s note carries the explanation instead — matching `776:3`, which
 * draws no pill.
 */
export type StockPillKind = 'healthy' | 'lowStock';

export function stockPillKind(input: {
  readonly lowStock: boolean;
  readonly lowStockThreshold?: number | undefined;
}): StockPillKind | null {
  if (input.lowStock) return 'lowStock';
  return input.lowStockThreshold === undefined ? null : 'healthy';
}

/**
 * One ledger row's on-hand effect, as `775:73`/`775:79`/`775:85` render it:
 * `+20` in the success tone, `−25` in the error tone, a bare `0` in neutral for
 * a hold or reservation whose goods never left the shelf.
 *
 * The sign is part of the text, so the column reads correctly with no colour at
 * all.
 */
export interface OnHandDeltaPresentation {
  readonly label: string;
  readonly tone: 'positive' | 'negative' | 'neutral';
}

export function presentOnHandDelta(onHandDelta: number): OnHandDeltaPresentation {
  if (onHandDelta > 0) return { label: `+${onHandDelta}`, tone: 'positive' };
  if (onHandDelta < 0) return { label: `${MINUS}${Math.abs(onHandDelta)}`, tone: 'negative' };
  return { label: '0', tone: 'neutral' };
}

/** A signed quantity for prose — the refusal sentence and the preview. */
export function signedQuantity(value: number): string {
  return value < 0 ? `${MINUS}${Math.abs(value)}` : `${value}`;
}
