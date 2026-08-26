/**
 * `APP8-E01` case **E01-03** — the Admin Inventory screen's contract handoff.
 *
 * The Admin half of journey `J1`. `E01-01` and `E01-02` proved, against a real
 * database, that the delivered `APP8-B01` routes anchor stock and commit one
 * audited adjustment. This case proves the screen an operator actually uses
 * consumes **those** operations and re-reads **their** answer.
 *
 * The values here are not invented: they are the figures the `J1` acceptance run
 * committed — an anchor at zero, a `+100` adjustment with a reason, and the
 * server's recomputed `100 / 0 / 0 / 100` afterwards. Rendering the screen
 * against server truth rather than a designer's numbers is the whole point of
 * the case.
 *
 * Deliberately **not** re-proved here (accepted `APP8-A01` evidence, unchanged):
 * the local delta/reason validation, the duplicate-submit guard, the
 * negative-stock `409` refusal UX, the never-counted empty state, the low-stock
 * banner, the ledger truncation notice and every render/error permutation.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import * as apiClient from '@embroidery/api-client';
import { adminSkuStockAdjust, adminSkuStockGet, adminSkuStockLedger } from '@embroidery/api-client';

import { SkuStockScreen } from '../../src/features/sku-stock';
import {
  envelope,
  makeNewAnchorStock,
  makeStock,
  SKU_ID,
  SKU_STOCK_ID,
} from '../support/sku-stock-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/kho/skus/sku').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminSkuStockGet: jest.fn(),
  adminSkuStockLedger: jest.fn(),
  adminSkuStockAdjust: jest.fn(),
}));

const stockMock = adminSkuStockGet as jest.MockedFunction<typeof adminSkuStockGet>;
const ledgerMock = adminSkuStockLedger as jest.MockedFunction<typeof adminSkuStockLedger>;
const adjustMock = adminSkuStockAdjust as jest.MockedFunction<typeof adminSkuStockAdjust>;

/** The anchor `E01-01` read: a real SKU that has never been counted. */
const ANCHOR = makeNewAnchorStock();

/**
 * The state `E01-02` committed: `+100` on hand, nothing held, nothing reserved.
 *
 * No threshold, because the server sent none — `lowStockThreshold` is absent on
 * a SKU nobody has configured one for, and a fixture that supplied it would let
 * the screen pass a test the real API could not satisfy.
 */
const AFTER_COUNT = ((): typeof ANCHOR => {
  const { lowStockThreshold: _absent, ...stock } = makeStock({
    quantityOnHand: 100,
    heldQuantity: 0,
    reservedQuantity: 0,
    available: 100,
    lowStock: false,
  });
  return stock;
})();

const OPENING_REASON = 'Kiểm kho đầu kỳ tháng 8';

const EMPTY_LEDGER = {
  skuId: SKU_ID,
  skuStockId: SKU_STOCK_ID,
  entries: [],
  truncated: false,
} as const;

const COUNTED_LEDGER = {
  skuId: SKU_ID,
  skuStockId: SKU_STOCK_ID,
  entries: [
    {
      entryKind: 'ADJUSTMENT',
      quantity: 100,
      onHandDelta: 100,
      reason: OPENING_REASON,
      occurredAt: '2026-08-26T00:48:16.518Z',
    },
  ],
  truncated: false,
} as const;

beforeEach(() => {
  jest.clearAllMocks();
  stockMock.mockResolvedValue(envelope(ANCHOR));
  ledgerMock.mockResolvedValue(envelope(EMPTY_LEDGER));
  adjustMock.mockResolvedValue(envelope(AFTER_COUNT));
});

describe('E01-03 — the Admin Inventory screen consumes the delivered B01 contract', () => {
  it('reads authoritative stock and its ledger through the two published read operations', async () => {
    renderWithProviders(<SkuStockScreen skuId={SKU_ID} />);

    await screen.findByTestId('stock-metrics');

    expect(stockMock.mock.calls[0]?.[0]).toBe(SKU_ID);
    expect(ledgerMock.mock.calls[0]?.[0]).toBe(SKU_ID);

    // Server truth, rendered as sent: an anchor at zero is an ordinary answer.
    expect(screen.getByTestId('stock-metric-on-hand')).toHaveTextContent('0');
    expect(screen.getByTestId('stock-metric-available')).toHaveTextContent('0');
    // The identifiers are abbreviated on screen and carried in full on `title`.
    expect(screen.getByTestId('stock-sku-id')).toHaveAttribute('title', SKU_ID);
    expect(screen.getByTestId('stock-anchor-id').getAttribute('title')).toContain(SKU_STOCK_ID);
  });

  it('re-reads both authoritative queries after a committed adjustment', async () => {
    const user = createUser();
    renderWithProviders(<SkuStockScreen skuId={SKU_ID} />);
    await screen.findByTestId('stock-metrics');

    const readsBefore = stockMock.mock.calls.length;
    const ledgerReadsBefore = ledgerMock.mock.calls.length;

    await user.click(screen.getByTestId('open-adjustment-dialog'));
    await screen.findByTestId('adjustment-dialog');
    await user.type(screen.getByTestId('adjustment-delta'), '100');
    await user.type(screen.getByTestId('adjustment-reason'), OPENING_REASON);

    // The stock the ledger will describe once the write lands.
    stockMock.mockResolvedValue(envelope(AFTER_COUNT));
    ledgerMock.mockResolvedValue(envelope(COUNTED_LEDGER));

    await user.click(screen.getByTestId('adjustment-submit'));

    await waitFor(() => {
      expect(adjustMock).toHaveBeenCalledTimes(1);
    });
    // Exactly the published command: a signed delta and the operator's reason.
    expect(adjustMock.mock.calls[0]?.slice(0, 2)).toEqual([
      SKU_ID,
      { delta: 100, reason: OPENING_REASON },
    ]);

    // Both authoritative reads are issued again — the screen does not keep the
    // mutation's receipt as the new truth, and it does not leave the ledger
    // describing a stock level that no longer exists.
    await waitFor(() => {
      expect(stockMock.mock.calls.length).toBeGreaterThan(readsBefore);
      expect(ledgerMock.mock.calls.length).toBeGreaterThan(ledgerReadsBefore);
    });

    await waitFor(() => {
      expect(screen.getByTestId('stock-metric-on-hand')).toHaveTextContent('100');
    });
    expect(screen.getByTestId('stock-metric-available')).toHaveTextContent('100');
  });

  it('offers no capability the delivered inventory contract does not publish', () => {
    renderWithProviders(<SkuStockScreen skuId={SKU_ID} />);

    // The whole delivered Admin inventory surface is three operations. A screen
    // that could edit a low-stock threshold or place a manual reservation would
    // be promising an operation the API does not expose — and the generated
    // client is the honest place to ask, because it is the contract.
    const published = Object.keys(apiClient).filter((name) => name.startsWith('adminSkuStock'));
    expect(published.sort()).toEqual([
      'adminSkuStockAdjust',
      'adminSkuStockGet',
      'adminSkuStockLedger',
    ]);

    expect(screen.queryByTestId('stock-threshold-edit')).toBeNull();
    expect(screen.queryByTestId('stock-reserve')).toBeNull();
    expect(screen.queryByTestId('stock-release')).toBeNull();
  });
});
