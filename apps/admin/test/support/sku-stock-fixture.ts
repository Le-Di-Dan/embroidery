/**
 * SKU stock fixtures shaped exactly like the `APP8-B01` contract.
 *
 * The optional fields are **omitted by default**, because that is what the
 * server actually sends: `lowStockThreshold` is absent when none is configured,
 * and `reason` is absent on every movement that is not an `ADJUSTMENT`. A
 * fixture that always supplied them would let the screen pass a test the real
 * API could never satisfy.
 *
 * `available` is a **fixture value**, never computed from the other three by
 * the helpers. The server computes it under the row lock, so a fixture that
 * derived it would quietly assert the client's arithmetic instead of the
 * contract's answer — and the negative-availability case exists precisely
 * because on-hand minus holds minus reservations is a figure the client must
 * not be trusted to reproduce.
 *
 * All values are synthetic: the identifiers follow the `APP8-D01`
 * non-production set, and no real SKU, order, admin account or storage
 * identifier appears anywhere.
 */
import type {
  AdminSkuStockLedgerEntryResponse,
  AdminSkuStockLedgerResponse,
  AdminSkuStockResponse,
} from '@embroidery/api-client';

export const SKU_ID = '019a2b3c-0000-7000-8000-000000006021';
export const SKU_STOCK_ID = '019a2b3c-0000-7000-8000-000000007011';

export function makeStock(overrides: Partial<AdminSkuStockResponse> = {}): AdminSkuStockResponse {
  return {
    skuId: SKU_ID,
    skuStockId: SKU_STOCK_ID,
    quantityOnHand: 40,
    heldQuantity: 5,
    reservedQuantity: 10,
    available: 25,
    lowStock: false,
    lowStockThreshold: 10,
    ...overrides,
  };
}

/** `775:101` — reservations exceed on-hand, so availability is legitimately below zero. */
export function makeNegativeAvailableStock(): AdminSkuStockResponse {
  return makeStock({
    quantityOnHand: 8,
    heldQuantity: 4,
    reservedQuantity: 7,
    available: -3,
    lowStock: true,
    lowStockThreshold: 10,
  });
}

/** `776:3` — the anchor was created on this read and nothing has ever moved. */
export function makeNewAnchorStock(): AdminSkuStockResponse {
  const stock = makeStock({
    quantityOnHand: 0,
    heldQuantity: 0,
    reservedQuantity: 0,
    available: 0,
    lowStock: false,
  });
  // No threshold is configured on a SKU nobody has counted yet.
  const { lowStockThreshold: _absent, ...withoutThreshold } = stock;
  return withoutThreshold;
}

export function makeAdjustmentEntry(
  overrides: Partial<AdminSkuStockLedgerEntryResponse> = {},
): AdminSkuStockLedgerEntryResponse {
  return {
    entryKind: 'ADJUSTMENT',
    quantity: 20,
    onHandDelta: 20,
    reason: 'Kiểm kho tháng 8 — nhập bù thiếu hụt',
    occurredAt: '2026-08-25T02:14:00.000Z',
    ...overrides,
  };
}

/** A reservation: the goods never left the shelf, so `onHandDelta` is 0 and no reason exists. */
export function makeReservationEntry(): AdminSkuStockLedgerEntryResponse {
  return {
    entryKind: 'RESERVED',
    quantity: 25,
    onHandDelta: 0,
    occurredAt: '2026-08-24T03:41:00.000Z',
  };
}

export function makeConsumedEntry(): AdminSkuStockLedgerEntryResponse {
  return {
    entryKind: 'CONSUMED',
    quantity: 25,
    onHandDelta: -25,
    occurredAt: '2026-08-24T09:02:00.000Z',
  };
}

export function makeLedger(
  overrides: Partial<AdminSkuStockLedgerResponse> = {},
): AdminSkuStockLedgerResponse {
  return {
    skuId: SKU_ID,
    skuStockId: SKU_STOCK_ID,
    entries: [makeAdjustmentEntry(), makeConsumedEntry(), makeReservationEntry()],
    truncated: false,
    ...overrides,
  };
}

/** `776:47` — an empty array is an ordinary answer, not an error. */
export function makeEmptyLedger(): AdminSkuStockLedgerResponse {
  return makeLedger({ entries: [], truncated: false });
}

export function envelope<TData>(data: TData) {
  return {
    success: true,
    code: 'OK',
    message: 'ok',
    data,
    meta: { requestId: 'req-app8-a01', timestamp: '2026-08-25T03:00:00.000Z' },
  } as never;
}
