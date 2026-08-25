/**
 * The Admin SKU stock workspace: what it renders, and what it refuses to
 * invent (`APP8-A01`; `775:3`, `775:101`, `776:3`, `776:54`, `776:142`,
 * `777:125`, `789:3`).
 *
 * The load-bearing assertions:
 *
 *  - every metric is the server's figure, including a **negative** `available`,
 *    which is rendered as a number rather than clamped or flagged as corrupt;
 *  - `available` is never recomputed: a response whose `available` disagrees
 *    with `onHand − held − reserved` is rendered as published;
 *  - an absent `lowStockThreshold` produces no inferred threshold, no editable
 *    control and no health claim;
 *  - a never-counted SKU is a successful read with real zeros, not a failure
 *    and not a blank table;
 *  - `truncated` shows the bounded-history notice and **no** pagination
 *    affordance of any kind;
 *  - a 404 and a 500 are two different, correctly-worded answers, and neither
 *    renders a stock figure.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import { adminSkuStockGet, adminSkuStockLedger } from '@embroidery/api-client';

import { SkuStockScreen } from '../../src/features/sku-stock';
import { SKU_STOCK_COPY as COPY } from '../../src/features/sku-stock/model/sku-stock-copy';
import { makeApiClientError } from '../support/api-error';
import {
  envelope,
  makeEmptyLedger,
  makeLedger,
  makeNegativeAvailableStock,
  makeNewAnchorStock,
  makeStock,
  SKU_ID,
} from '../support/sku-stock-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock(`/kho/skus/${'sku'}`).module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminSkuStockGet: jest.fn(),
  adminSkuStockLedger: jest.fn(),
}));

const stockMock = adminSkuStockGet as jest.MockedFunction<typeof adminSkuStockGet>;
const ledgerMock = adminSkuStockLedger as jest.MockedFunction<typeof adminSkuStockLedger>;

beforeEach(() => {
  jest.clearAllMocks();
  stockMock.mockResolvedValue(envelope(makeStock()));
  ledgerMock.mockResolvedValue(envelope(makeLedger()));
});

const render = () => renderWithProviders(<SkuStockScreen skuId={SKU_ID} />);

describe('the normal render', () => {
  it('reads stock and the ledger for exactly this SKU, once each', async () => {
    render();

    expect(await screen.findByTestId('stock-metrics')).toBeInTheDocument();
    expect(stockMock).toHaveBeenCalledTimes(1);
    expect(stockMock.mock.calls[0]?.[0]).toBe(SKU_ID);
    expect(ledgerMock).toHaveBeenCalledTimes(1);
    expect(ledgerMock.mock.calls[0]?.[0]).toBe(SKU_ID);
  });

  it('renders the four published figures exactly as the server sent them', async () => {
    render();

    expect(await screen.findByTestId('stock-metric-on-hand')).toHaveTextContent('40');
    expect(screen.getByTestId('stock-metric-held')).toHaveTextContent('5');
    expect(screen.getByTestId('stock-metric-reserved')).toHaveTextContent('10');
    expect(screen.getByTestId('stock-metric-available')).toHaveTextContent('25');
  });

  it('renders `available` as published rather than recomputing it', async () => {
    // 40 − 5 − 10 would be 25. The server says 21, and the screen must say 21:
    // availability is computed under the row lock and this client has no
    // standing to correct it.
    stockMock.mockResolvedValue(envelope(makeStock({ available: 21 })));
    render();

    expect(await screen.findByTestId('stock-metric-available')).toHaveTextContent('21');
  });

  it('renders every published ledger field and nothing else', async () => {
    render();

    const rows = await screen.findAllByTestId('stock-ledger-row');
    expect(rows).toHaveLength(3);

    const adjustment = within(rows[0] as HTMLElement);
    expect(adjustment.getByText('ADJUSTMENT')).toBeInTheDocument();
    expect(adjustment.getByText('+20')).toBeInTheDocument();
    expect(adjustment.getByText('Kiểm kho tháng 8 — nhập bù thiếu hụt')).toBeInTheDocument();

    // A consumed movement removed goods; a reservation left them on the shelf.
    expect(within(rows[1] as HTMLElement).getByText('−25')).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText('0')).toBeInTheDocument();
  });

  it('shows an absent reason as absent rather than as an empty cell', async () => {
    render();

    const rows = await screen.findAllByTestId('stock-ledger-row');
    expect(within(rows[2] as HTMLElement).getByText(COPY.ledger.noReason)).toBeInTheDocument();
  });
});

describe('low stock and the threshold', () => {
  it('renders a negative availability as a number, not as a fault', async () => {
    stockMock.mockResolvedValue(envelope(makeNegativeAvailableStock()));
    render();

    expect(await screen.findByTestId('stock-metric-available')).toHaveTextContent('-3');
    // The low-stock banner explains the flag; nothing anywhere calls the
    // figure invalid, corrupt or an error.
    expect(screen.getByTestId('low-stock-banner')).toHaveTextContent(
      COPY.threshold.lowStockTitle(10),
    );
  });

  it('offers no way to author a threshold', async () => {
    render();

    await screen.findByTestId('stock-metrics');
    // The whole screen has exactly one control that writes, and it is the
    // adjustment. A threshold editor would be a second one.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('low-stock-note')).toHaveTextContent(COPY.threshold.configured(10));
  });

  it('infers nothing when no threshold is configured', async () => {
    stockMock.mockResolvedValue(envelope(makeNewAnchorStock()));
    ledgerMock.mockResolvedValue(envelope(makeLedger()));
    render();

    expect(await screen.findByTestId('low-stock-note')).toHaveTextContent(COPY.threshold.absent);
    // No pill either: with no threshold the server's `lowStock` is always
    // false, which is the absence of a judgement rather than a healthy one.
    expect(screen.queryByTestId('stock-availability-pill')).not.toBeInTheDocument();
  });
});

describe('the never-counted SKU', () => {
  it('reports real zeros and an ordinary empty history, not a failure', async () => {
    stockMock.mockResolvedValue(envelope(makeNewAnchorStock()));
    ledgerMock.mockResolvedValue(envelope(makeEmptyLedger()));
    render();

    expect(await screen.findByTestId('stock-never-counted')).toHaveTextContent(
      COPY.newAnchor.title,
    );
    expect(screen.getByTestId('stock-metric-on-hand')).toHaveTextContent('0');
    expect(screen.queryByTestId('stock-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('stock-ledger-table')).not.toBeInTheDocument();
  });

  it('submits nothing on its own to initialise the anchor', async () => {
    stockMock.mockResolvedValue(envelope(makeNewAnchorStock()));
    ledgerMock.mockResolvedValue(envelope(makeEmptyLedger()));
    render();

    await screen.findByTestId('stock-never-counted');
    // The first real quantity arrives only through an audited adjustment the
    // operator opens; the screen never auto-submits one.
    expect(screen.getByTestId('open-adjustment-dialog-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('adjustment-dialog')).not.toBeInTheDocument();
  });
});

describe('the truncated ledger', () => {
  it('shows the bounded-history notice and no pagination affordance', async () => {
    ledgerMock.mockResolvedValue(envelope(makeLedger({ truncated: true })));
    render();

    expect(await screen.findByTestId('stock-ledger-truncated')).toHaveTextContent(
      COPY.ledger.truncatedTitle,
    );
    for (const label of [/tải thêm/i, /load more/i, /trang sau/i, /next page/i]) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
  });

  it('renders no empty band when the history is complete', async () => {
    render();

    await screen.findByTestId('stock-ledger-table');
    expect(screen.queryByTestId('stock-ledger-truncated')).not.toBeInTheDocument();
  });
});

describe('loading and failure', () => {
  it('renders the approved skeleton while the stock read is in flight', async () => {
    stockMock.mockImplementation(() => new Promise(() => {}));
    render();

    const loading = await screen.findByTestId('stock-loading');
    expect(loading).toHaveTextContent(COPY.page.loading);
    expect(screen.queryByTestId('stock-metrics')).not.toBeInTheDocument();
  });

  it('maps a 404 to the not-found answer with no stock figure on screen', async () => {
    stockMock.mockRejectedValue(
      makeApiClientError({ status: 404, code: 'INVENTORY_SKU_NOT_FOUND' }),
    );
    render();

    const failure = await screen.findByTestId('stock-error');
    expect(failure).toHaveTextContent(COPY.failure.missingTitle);
    expect(screen.queryByTestId('stock-metrics')).not.toBeInTheDocument();
  });

  it('maps a generic server failure to a retryable answer', async () => {
    stockMock.mockRejectedValue(makeApiClientError({ status: 500, code: 'INTERNAL_ERROR' }));
    render();

    const failure = await screen.findByTestId('stock-error');
    expect(failure).toHaveTextContent(COPY.failure.retryTitle);
    expect(screen.getByTestId('stock-retry')).toBeInTheDocument();
  });

  it('maps a 401 to sign-in and offers no retry that could not succeed', async () => {
    stockMock.mockRejectedValue(makeApiClientError({ status: 401, code: 'UNAUTHENTICATED' }));
    render();

    const failure = await screen.findByTestId('stock-error');
    expect(failure).toHaveTextContent(COPY.failure.unauthenticatedTitle);
    expect(screen.queryByTestId('stock-retry')).not.toBeInTheDocument();
  });

  it('keeps the metrics readable when only the ledger fails', async () => {
    ledgerMock.mockRejectedValue(makeApiClientError({ status: 500, code: 'INTERNAL_ERROR' }));
    render();

    await waitFor(() => {
      expect(screen.getByTestId('stock-ledger-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('stock-metric-on-hand')).toHaveTextContent('40');
  });
});
