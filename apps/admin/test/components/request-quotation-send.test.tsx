/**
 * The exact version a send is bound to, the money it renders, and what the
 * screen refuses to do (`APP6-A01` §8, §13, §14, §15, §16; `686:104`, `687:3`,
 * `687:144`, `689:3`, `689:162`, `690:3`, `690:92`).
 *
 * The properties under test:
 *
 *  - every figure is the server's stored string, never recomputed;
 *  - an immutable version offers no editing and no send;
 *  - the send names the version the operator confirmed, carries no body, and
 *    never fires twice;
 *  - a replay is reported as a replay, and a stale refusal re-reads and stops;
 *  - an accepted quotation offers no re-quote and claims no payment or order.
 */
import { act } from 'react';

import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import {
  adminCustomRequestDetail,
  adminQuotationAddVersion,
  adminQuotationSendVersion,
  adminQuotationVersionDetail,
  adminQuotationVersionHistory,
} from '@embroidery/api-client';

import { QuotationWorkbenchScreen } from '../../src/features/request-quotation';
import { REQUEST_QUOTATION_COPY as COPY } from '../../src/features/request-quotation/model/request-quotation-copy';
import { makeApiClientError } from '../support/api-error';
import {
  AWKWARD_TOTAL_RENDERED,
  envelope,
  makeCatalogRequest,
  makeDrafted,
  makeHeader,
  makeHistory,
  makeLineItem,
  makeSent,
  makeVersion,
  makeVersionDetail,
  QUOTATION_ID,
  QUOTATION_REQUEST_ID,
  VERSION_1_ID,
  VERSION_2_ID,
} from '../support/request-quotation-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/requests/r1/quotation').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminCustomRequestDetail: jest.fn(),
  adminQuotationCreate: jest.fn(),
  adminQuotationAddVersion: jest.fn(),
  adminQuotationVersionHistory: jest.fn(),
  adminQuotationVersionDetail: jest.fn(),
  adminQuotationSendVersion: jest.fn(),
}));

const contextMock = adminCustomRequestDetail as jest.MockedFunction<
  typeof adminCustomRequestDetail
>;
const historyMock = adminQuotationVersionHistory as jest.MockedFunction<
  typeof adminQuotationVersionHistory
>;
const detailMock = adminQuotationVersionDetail as jest.MockedFunction<
  typeof adminQuotationVersionDetail
>;
const sendMock = adminQuotationSendVersion as jest.MockedFunction<typeof adminQuotationSendVersion>;
const addVersionMock = adminQuotationAddVersion as jest.MockedFunction<
  typeof adminQuotationAddVersion
>;

beforeEach(() => {
  jest.clearAllMocks();
  contextMock.mockResolvedValue(
    envelope(makeCatalogRequest({ quotationId: QUOTATION_ID })) as never,
  );
  historyMock.mockResolvedValue(envelope(makeHistory()) as never);
  detailMock.mockResolvedValue(envelope(makeVersionDetail()) as never);
  sendMock.mockResolvedValue(envelope(makeSent()) as never);
  addVersionMock.mockResolvedValue(envelope(makeDrafted()) as never);
});

const render = () =>
  renderWithProviders(<QuotationWorkbenchScreen requestId={QUOTATION_REQUEST_ID} />);

async function openSendDialog(user: ReturnType<typeof createUser>) {
  await screen.findByTestId('quotation-version-panel');
  await user.click(screen.getByTestId('quotation-send-open'));
  return screen.findByTestId('quotation-send-dialog');
}

describe('every figure is the server’s, rendered as stored', () => {
  it('renders the frozen line total rather than quantity × unit price', async () => {
    render();
    const panel = await screen.findByTestId('quotation-version-panel');
    // The fixture's line total is deliberately not 12 × 102880.66. A screen that
    // multiplied would print a different string in this cell and fail here.
    const cells = within(panel).getAllByRole('cell');
    expect(cells[cells.length - 1]).toHaveTextContent(`${AWKWARD_TOTAL_RENDERED} ₫`);
  });

  it('renders the stored total, deposit and remainder without re-deriving them', async () => {
    detailMock.mockResolvedValue(
      envelope(
        makeVersionDetail(
          makeVersion({
            subtotalAmount: '1200000.00',
            shippingFeeAmount: '50000.00',
            manualAdjustmentAmount: '0.00',
            totalAmount: '1250000.00',
            depositPercent: '37.50',
            depositAmount: '468750.00',
            remainingAmount: '781250.00',
          }),
        ),
      ) as never,
    );
    render();

    const totals = await screen.findByTestId('quotation-totals');
    expect(within(totals).getByText('1.250.000 ₫')).toBeInTheDocument();
    expect(within(totals).getByText('468.750 ₫')).toBeInTheDocument();
    expect(within(totals).getByText('781.250 ₫')).toBeInTheDocument();
    // The share this version was priced at, not today's policy.
    expect(within(totals).getByText('37.5%')).toBeInTheDocument();
  });

  it('shows a value it cannot account for verbatim instead of rounding it away', async () => {
    detailMock.mockResolvedValue(
      envelope(makeVersionDetail(makeVersion({ totalAmount: '1234567.89' }))) as never,
    );
    render();
    const totals = await screen.findByTestId('quotation-totals');
    expect(within(totals).getByTestId('quotation-total')).toHaveTextContent('1234567.89 ₫');
  });

  it('reads the exact version it was asked for, never a substitute', async () => {
    render();
    await screen.findByTestId('quotation-version-panel');
    expect(detailMock).toHaveBeenCalledTimes(1);
    expect(detailMock.mock.calls[0]?.[0]).toBe(QUOTATION_ID);
    expect(detailMock.mock.calls[0]?.[1]).toBe(VERSION_1_ID);
  });
});

describe('an immutable version', () => {
  const sentOnly = makeHistory(
    [makeVersion({ status: 'SENT', sentAt: '2026-08-16T04:00:00.000Z' })],
    makeHeader({ quotationStatus: 'SENT', currentVersionId: VERSION_1_ID }),
  );

  beforeEach(() => {
    historyMock.mockResolvedValue(envelope(sentOnly) as never);
    detailMock.mockResolvedValue(
      envelope(
        makeVersionDetail(
          makeVersion({ status: 'SENT', sentAt: '2026-08-16T04:00:00.000Z' }),
          makeHeader({ quotationStatus: 'SENT', currentVersionId: VERSION_1_ID }),
        ),
      ) as never,
    );
  });

  it('says so, and offers no send for it', async () => {
    render();
    await screen.findByTestId('quotation-version-panel');
    expect(screen.getByTestId('quotation-readonly-notice')).toHaveTextContent(
      COPY.version.readOnlyNotice,
    );
    expect(screen.queryByTestId('quotation-send-open')).not.toBeInTheDocument();
  });

  it('still offers a new version, because a re-price is an append and not an edit', async () => {
    const user = createUser();
    render();
    await screen.findByTestId('quotation-version-panel');

    const form = screen.getByTestId('quotation-form');
    expect(within(form).getByTestId('quotation-form-submit')).toHaveTextContent(
      COPY.form.submitVersion,
    );
    await user.type(within(form).getByLabelText(COPY.form.quantityTotal), '12');
    await user.type(within(form).getByLabelText(COPY.form.lineDescription), 'Thêu lại');
    await user.type(within(form).getByLabelText(COPY.form.lineUnitPrice), '120000');
    await user.click(within(form).getByTestId('quotation-form-submit'));

    await waitFor(() => {
      expect(addVersionMock).toHaveBeenCalledTimes(1);
    });
    expect(addVersionMock.mock.calls[0]?.[0]).toBe(QUOTATION_ID);
  });

  it('marks the customer-current version from the header pointer', async () => {
    render();
    const history = await screen.findByTestId('quotation-history');
    expect(within(history).getByText(COPY.version.current)).toBeInTheDocument();
  });
});

describe('the send is bound to one exact version', () => {
  const twoDrafts = makeHistory([
    makeVersion({ versionId: VERSION_1_ID, version: 1 }),
    makeVersion({ versionId: VERSION_2_ID, version: 2 }),
  ]);

  it('sends the version the operator selected, not the newest one', async () => {
    const user = createUser();
    historyMock.mockResolvedValue(envelope(twoDrafts) as never);
    render();

    // Default selection is the newest DRAFT (version 2). Pick version 1.
    const row = await screen.findByTestId('quotation-history-row-1');
    await user.click(within(row).getByRole('button', { name: COPY.version.selectLabel }));
    await waitFor(() => {
      expect(screen.getByTestId('quotation-history-row-1')).toHaveAttribute('aria-current', 'true');
    });

    await user.click(screen.getByTestId('quotation-send-open'));
    await screen.findByTestId('quotation-send-dialog');
    await user.click(screen.getByTestId('quotation-send-confirm'));

    await waitFor(() => {
      expect(sendMock).toHaveBeenCalledTimes(1);
    });
    expect(sendMock.mock.calls[0]?.[1]).toBe(VERSION_1_ID);
    expect(sendMock.mock.calls[0]?.[1]).not.toBe(VERSION_2_ID);
  });

  it('names the confirmed version in the dialog sentence', async () => {
    const user = createUser();
    historyMock.mockResolvedValue(envelope(twoDrafts) as never);
    render();

    const dialog = await openSendDialog(user);
    expect(dialog).toHaveTextContent(COPY.send.dialogBody(2));
  });

  it('carries no body — the version is named entirely in the path', async () => {
    const user = createUser();
    render();
    await openSendDialog(user);
    act(() => {
      screen.getByTestId('quotation-send-confirm').click();
    });

    await waitFor(() => {
      expect(sendMock).toHaveBeenCalledTimes(1);
    });
    const call = sendMock.mock.calls[0] ?? [];
    expect(call).toHaveLength(3);
    expect(typeof call[0]).toBe('string');
    expect(typeof call[1]).toBe('string');
    // The third argument is the transport options object, and it carries no
    // payload of any kind.
    expect(Object.keys(call[2] ?? {}).sort()).toEqual(['instance']);
  });

  it('never sends without an explicit confirmation', async () => {
    const user = createUser();
    render();
    await screen.findByTestId('quotation-version-panel');
    expect(sendMock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('quotation-send-open'));
    await screen.findByTestId('quotation-send-dialog');
    expect(sendMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: COPY.send.cancel }));
    await waitFor(() => {
      expect(screen.queryByTestId('quotation-send-dialog')).not.toBeInTheDocument();
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('fires once for a double-click, ahead of the disabled attribute', async () => {
    const user = createUser();
    let release: ((value: unknown) => void) | undefined;
    sendMock.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }) as never,
    );
    render();
    await openSendDialog(user);

    // Three discrete clicks in one tick. `disabled` applies a render later, so
    // the second and third reach the handler with the button still enabled —
    // the ref guard is what stops them.
    // One `act` around all three, so they land in a single tick: an `act` per
    // click would let `disabled` apply between them and the button itself would
    // swallow the second, proving nothing about the guard.
    const confirm = screen.getByTestId('quotation-send-confirm');
    act(() => {
      confirm.click();
      confirm.click();
      confirm.click();
    });

    await waitFor(() => {
      expect(sendMock).toHaveBeenCalledTimes(1);
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    release?.(envelope(makeSent()));
    await waitFor(() => {
      expect(screen.getByTestId('quotation-send-result')).toBeInTheDocument();
    });
  });
});

describe('the send outcomes', () => {
  it('reports a first send as sent, and re-reads the request as well', async () => {
    const user = createUser();
    render();
    await openSendDialog(user);
    await user.click(screen.getByTestId('quotation-send-confirm'));

    const result = await screen.findByTestId('quotation-send-result');
    expect(result).toHaveTextContent(COPY.send.successHeading);
    // The request may have moved to QUOTED. The screen re-reads it rather than
    // synthesizing that status.
    await waitFor(() => {
      expect(contextMock).toHaveBeenCalledTimes(2);
    });
    expect(historyMock.mock.calls.length).toBeGreaterThan(1);
  });

  it('reports a replay as a replay, and never as a second send', async () => {
    const user = createUser();
    sendMock.mockResolvedValue(envelope(makeSent({ replayed: true })) as never);
    render();
    await openSendDialog(user);
    await user.click(screen.getByTestId('quotation-send-confirm'));

    const result = await screen.findByTestId('quotation-send-result');
    expect(result).toHaveTextContent(COPY.send.replayHeading);
    expect(result).toHaveTextContent(COPY.send.replayBody);
    expect(result).not.toHaveTextContent(COPY.send.successHeading);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('re-reads and stops on a stale refusal — no resend, no substitute version', async () => {
    const user = createUser();
    sendMock.mockRejectedValue(
      makeApiClientError({
        status: 409,
        code: 'QUOTATION_VERSION_NOT_SENDABLE',
        message: 'Version 1 is SUPERSEDED.',
      }),
    );
    render();
    await openSendDialog(user);
    await user.click(screen.getByTestId('quotation-send-confirm'));

    const failure = await screen.findByTestId('quotation-send-failure');
    expect(failure).toHaveTextContent(COPY.send.staleHeading);
    expect(failure).toHaveTextContent(COPY.send.staleBody);
    // Re-read both, then wait for a fresh decision.
    await waitFor(() => {
      expect(contextMock).toHaveBeenCalledTimes(2);
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain('SUPERSEDED.');
    expect(document.body.textContent).not.toContain('QUOTATION_VERSION_NOT_SENDABLE');
  });

  it('reports an unavailable pricing policy as a dependency failure, not the operator’s error', async () => {
    const user = createUser();
    sendMock.mockRejectedValue(
      makeApiClientError({ status: 503, code: 'QUOTATION_POLICY_UNAVAILABLE' }),
    );
    render();
    await openSendDialog(user);
    await user.click(screen.getByTestId('quotation-send-confirm'));

    const failure = await screen.findByTestId('quotation-send-failure');
    expect(failure).toHaveTextContent(COPY.send.failureHeading);
    expect(failure).toHaveTextContent(COPY.send.failureBody);
    // Nothing was sent, so nothing is re-read beyond the initial load.
    expect(contextMock).toHaveBeenCalledTimes(1);
  });
});

describe('an accepted quotation', () => {
  beforeEach(() => {
    const header = makeHeader({ quotationStatus: 'ACCEPTED', currentVersionId: VERSION_1_ID });
    historyMock.mockResolvedValue(
      envelope(
        makeHistory(
          [makeVersion({ status: 'ACCEPTED', acceptedAt: '2026-08-17T02:00:00.000Z' })],
          header,
        ),
      ) as never,
    );
    detailMock.mockResolvedValue(
      envelope(
        makeVersionDetail(
          makeVersion({ status: 'ACCEPTED', acceptedAt: '2026-08-17T02:00:00.000Z' }),
          header,
          [makeLineItem()],
        ),
      ) as never,
    );
  });

  it('offers no re-quote, because no reopen edge exists to serve one', async () => {
    render();
    await screen.findByTestId('quotation-accepted');
    expect(screen.queryByTestId('quotation-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quotation-send-open')).not.toBeInTheDocument();
  });

  it('claims no payment, no order and no reserved stock', async () => {
    render();
    const accepted = await screen.findByTestId('quotation-accepted');
    expect(accepted).toHaveTextContent(COPY.accepted.heading);
    for (const forbidden of ['thanh toán', 'đơn hàng', 'tồn kho', 'đặt cọc đã']) {
      expect(accepted.textContent ?? '').not.toContain(forbidden);
    }
  });

  it('points at the surface that owns the next lifecycle move rather than duplicating it', async () => {
    render();
    const accepted = await screen.findByTestId('quotation-accepted');
    const link = within(accepted).getByRole('link', { name: COPY.accepted.nextStepLink });
    expect(link).toHaveAttribute('href', `/requests/${QUOTATION_REQUEST_ID}`);
    expect(within(accepted).queryByRole('button')).not.toBeInTheDocument();
  });

  it('still shows the accepted figures, exactly as they were priced', async () => {
    render();
    const totals = await screen.findByTestId('quotation-totals');
    expect(within(totals).getByTestId('quotation-total')).toHaveTextContent(
      `${AWKWARD_TOTAL_RENDERED} ₫`,
    );
  });
});
