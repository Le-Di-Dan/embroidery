/**
 * The audited stock adjustment, start to finish (`APP8-A01`; `777:3`, `777:33`,
 * `777:60`, `777:83`, `777:99`).
 *
 * The load-bearing assertions:
 *
 *  - the body on the wire is exactly `{ delta, reason }` — a signed integer and
 *    the reason as typed, with no absolute quantity and no server-owned field;
 *  - a zero delta, a fractional delta and a blank reason are stopped locally and
 *    **nothing is sent**, with each error announced on its own control;
 *  - a duplicate submit cannot reach the wire twice;
 *  - success re-reads both queries and reports the server's two records rather
 *    than the operator's arithmetic;
 *  - a `409` renders the approved refusal, states that nothing was written,
 *    re-reads the authoritative stock, keeps the entered values, and never
 *    clamps the delta or retries.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import { adminSkuStockAdjust, adminSkuStockGet, adminSkuStockLedger } from '@embroidery/api-client';

import { SkuStockScreen } from '../../src/features/sku-stock';
import { SKU_STOCK_COPY as COPY } from '../../src/features/sku-stock/model/sku-stock-copy';
import { makeApiClientError, makeNetworkError } from '../support/api-error';
import { envelope, makeLedger, makeStock, SKU_ID } from '../support/sku-stock-fixture';

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

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
  stockMock.mockResolvedValue(envelope(makeStock()));
  ledgerMock.mockResolvedValue(envelope(makeLedger()));
  adjustMock.mockResolvedValue(envelope(makeStock({ quantityOnHand: 60, available: 45 })));
});

const openDialog = async () => {
  renderWithProviders(<SkuStockScreen skuId={SKU_ID} />);
  await user.click(await screen.findByTestId('open-adjustment-dialog'));
  return screen.findByTestId('adjustment-dialog');
};

const fill = async (delta: string, reason: string) => {
  if (delta !== '') await user.type(screen.getByTestId('adjustment-delta'), delta);
  if (reason !== '') await user.type(screen.getByTestId('adjustment-reason'), reason);
};

describe('the command on the wire', () => {
  it('sends exactly the signed delta and the reason as typed', async () => {
    await openDialog();
    await fill('20', 'Kiểm kho tháng 8');
    await user.click(screen.getByTestId('adjustment-submit'));

    await waitFor(() => {
      expect(adjustMock).toHaveBeenCalledTimes(1);
    });
    expect(adjustMock.mock.calls[0]?.[0]).toBe(SKU_ID);
    expect(adjustMock.mock.calls[0]?.[1]).toEqual({ delta: 20, reason: 'Kiểm kho tháng 8' });
  });

  it('sends a negative delta as a negative number, never as a magnitude', async () => {
    await openDialog();
    await fill('-12', 'Hàng hỏng khi kiểm tra chất lượng');
    await user.click(screen.getByTestId('adjustment-submit'));

    await waitFor(() => {
      expect(adjustMock).toHaveBeenCalledTimes(1);
    });
    expect(adjustMock.mock.calls[0]?.[1]).toEqual({
      delta: -12,
      reason: 'Hàng hỏng khi kiểm tra chất lượng',
    });
  });

  it('offers no absolute-quantity control', async () => {
    await openDialog();
    // Two fields, and they are the whole command.
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
  });

  it('cannot be sent twice by a duplicate submit', async () => {
    let release: ((value: unknown) => void) | undefined;
    adjustMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }) as never,
    );

    await openDialog();
    await fill('5', 'Kiểm kho');
    const submit = screen.getByTestId('adjustment-submit');
    await user.click(submit);

    expect(await screen.findByTestId('adjustment-pending')).toBeInTheDocument();
    expect(submit).toBeDisabled();
    await user.click(submit);

    expect(adjustMock).toHaveBeenCalledTimes(1);

    // Let the single in-flight write finish, so the assertion is about one
    // request that settled rather than one that was abandoned mid-test.
    release?.(envelope(makeStock({ quantityOnHand: 45, available: 30 })));
    expect(await screen.findByTestId('adjustment-success')).toBeInTheDocument();
    expect(adjustMock).toHaveBeenCalledTimes(1);
  });
});

describe('input the contract refuses', () => {
  it('stops a zero delta locally and sends nothing', async () => {
    await openDialog();
    await fill('0', 'Kiểm kho');
    await user.click(screen.getByTestId('adjustment-submit'));

    expect(await screen.findByTestId('adjustment-validation')).toBeInTheDocument();
    expect(adjustMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('adjustment-delta')).toHaveAttribute('aria-invalid', 'true');
  });

  it('stops a fractional delta rather than truncating it', async () => {
    await openDialog();
    await fill('-2.5', 'Kiểm kho');
    await user.click(screen.getByTestId('adjustment-submit'));

    expect(await screen.findByTestId('adjustment-validation')).toBeInTheDocument();
    expect(adjustMock).not.toHaveBeenCalled();
  });

  it('stops a blank reason, including a whitespace-only one', async () => {
    await openDialog();
    await fill('5', '   ');
    await user.click(screen.getByTestId('adjustment-submit'));

    expect(await screen.findByTestId('adjustment-validation')).toBeInTheDocument();
    expect(adjustMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('adjustment-reason')).toHaveAttribute('aria-invalid', 'true');
  });

  it('links each error to its own control rather than only to the summary', async () => {
    await openDialog();
    await user.click(screen.getByTestId('adjustment-submit'));

    const delta = await screen.findByTestId('adjustment-delta');
    const describedBy = delta.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      COPY.validation.deltaRequired,
    );
  });
});

describe('a successful adjustment', () => {
  it('reports the server records and re-reads both queries', async () => {
    await openDialog();
    await fill('20', 'Kiểm kho tháng 8');
    await user.click(screen.getByTestId('adjustment-submit'));

    const success = await screen.findByTestId('adjustment-success');
    expect(success).toHaveTextContent(COPY.success.noteBody(40, 60, 25, 45));

    // Both reads are re-issued; neither metric is patched from the delta.
    await waitFor(() => {
      expect(stockMock).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(ledgerMock).toHaveBeenCalledTimes(2);
    });
  });

  it('renders the refreshed server figures on the page behind it', async () => {
    stockMock
      .mockResolvedValueOnce(envelope(makeStock()))
      .mockResolvedValue(envelope(makeStock({ quantityOnHand: 60, available: 45 })));

    await openDialog();
    await fill('20', 'Kiểm kho tháng 8');
    await user.click(screen.getByTestId('adjustment-submit'));

    await screen.findByTestId('adjustment-success');
    await waitFor(() => {
      expect(screen.getByTestId('stock-metric-on-hand')).toHaveTextContent('60');
    });
  });
});

describe('the negative-stock refusal', () => {
  beforeEach(() => {
    adjustMock.mockRejectedValue(
      makeApiClientError({ status: 409, code: 'INVENTORY_STOCK_WOULD_GO_NEGATIVE' }),
    );
    stockMock
      .mockResolvedValueOnce(envelope(makeStock({ quantityOnHand: 8, available: 1 })))
      .mockResolvedValue(envelope(makeStock({ quantityOnHand: 8, available: 1 })));
  });

  it('renders the approved refusal and says nothing was written', async () => {
    await openDialog();
    await fill('-20', 'Xuất kho bù đơn thiếu');
    await user.click(screen.getByTestId('adjustment-submit'));

    const refusal = await screen.findByTestId('adjustment-refusal');
    expect(screen.getByTestId('adjustment-refusal-title')).toHaveTextContent(
      COPY.refusal.negativeTitle,
    );
    await waitFor(() => {
      expect(refusal).toHaveTextContent(COPY.refusal.negativeBody(8, -20, '−12'));
    });
  });

  it('leaves the page aligned with authoritative stock and clamps nothing', async () => {
    await openDialog();
    await fill('-20', 'Xuất kho bù đơn thiếu');
    await user.click(screen.getByTestId('adjustment-submit'));

    await screen.findByTestId('adjustment-refusal');
    // The stock read is re-issued so the quoted figure is current...
    await waitFor(() => {
      expect(stockMock).toHaveBeenCalledTimes(2);
    });
    // ...the metrics still show the server's on-hand, unchanged by the refusal...
    expect(screen.getByTestId('stock-metric-on-hand')).toHaveTextContent('8');
    // ...and no second attempt was made on the operator's behalf.
    expect(adjustMock).toHaveBeenCalledTimes(1);

    // The entered delta survives, unshrunk, for the operator to decide about.
    await user.click(screen.getByTestId('adjustment-edit-delta'));
    expect(await screen.findByTestId('adjustment-delta')).toHaveValue('-20');
  });
});

describe('a transport that never answered', () => {
  it('reports the outcome as unknown and offers no resend', async () => {
    adjustMock.mockRejectedValue(makeNetworkError());

    await openDialog();
    await fill('5', 'Kiểm kho');
    await user.click(screen.getByTestId('adjustment-submit'));

    const refusal = await screen.findByTestId('adjustment-refusal');
    expect(refusal).toHaveTextContent(COPY.refusal.ambiguousTitle);
    await waitFor(() => {
      expect(stockMock).toHaveBeenCalledTimes(2);
    });
    expect(adjustMock).toHaveBeenCalledTimes(1);
  });
});
