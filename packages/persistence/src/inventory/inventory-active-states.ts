/**
 * Which hold and reservation states still consume stock (`APP12-B01`).
 *
 * `available = quantity_on_hand − Σ active holds − Σ active reservations` is the
 * DB4 §Inventory balance formula, and "active" in it is exactly one state on
 * each side of LC-17: a hold that is `HELD` and a reservation that is
 * `RESERVED`. Every other member of `INVENTORY_SOFT_HOLD_STATES` and
 * `INVENTORY_RESERVATION_STATES` is terminal — `CONVERTED`, `RELEASED`,
 * `EXPIRED`, `CONSUMED` — and a terminal row is history, not a claim on stock.
 *
 * Named here rather than written as a literal at each call site because the
 * arithmetic now has two readers: {@link StockAnchor}, which computes it for one
 * SKU under the anchor lock before a write, and the `APP12-B01` public
 * availability snapshot, which computes it in bulk for a Catalog read. Two
 * copies of the word `'HELD'` is two definitions of what stock is available, and
 * the day one of them gains a state the other does not, a customer is shown
 * inventory the writer will refuse.
 *
 * This is a transcription of the delivered lifecycle, not a new authority: LC-17
 * and the partial unique indexes `uq_inventory_soft_holds__request_stock__held`
 * and `uq_inventory_reservations__order_stock__reserved` already single out
 * these two states physically.
 */
import type { InventoryReservationState, InventorySoftHoldState } from '@embroidery/database';

/** The one soft-hold state that still withholds quantity (LC-17, hold side). */
export const ACTIVE_SOFT_HOLD_STATE: InventorySoftHoldState = 'HELD';

/** The one reservation state that still withholds quantity (LC-17, reservation side). */
export const ACTIVE_RESERVATION_STATE: InventoryReservationState = 'RESERVED';
