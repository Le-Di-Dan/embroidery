/**
 * `/truy-cap/don-hang` after payment, and after a reload (`APP12-U01-C1` F2,
 * F4).
 *
 * The live U01 journey caught two false sentences on this surface:
 *
 *  - F2 — on `READY_FOR_DELIVERY` and `DELIVERED` the amount card still said
 *    the total would exist *once the fee was confirmed*, after the customer had
 *    paid it; on `COMPLETED` the card was empty. The satisfied obligation's own
 *    figure is on the projection, so the card now keeps it as history.
 *  - F4 — a reload of the bare path told the customer their link had been
 *    replaced by a newer one. It had not: the fragment was stripped on the
 *    first visit, and reopening the original email link still works.
 *
 * Kept apart from `secure-ready-made-order.test.tsx` so that suite stays inside
 * the 600-line test limit (`CLAUDE.md` §6).
 */
import {
  ReadyMadeOrderAccessResponseStatus,
  publicOrderFullPaymentCurrent,
  publicOrderFullPaymentInitiate,
  publicOrderFullPaymentQr,
  publicReadyMadeOrderCurrent,
  publicSecureLinkResolve,
} from '@embroidery/api-client';
import { renderWithProviders, screen } from '@embroidery/frontend-testing';

import { SECURE_LINK_COPY } from '../../src/features/secure-link-access/model/secure-link-copy';
import { ORDER_ACCESS_COPY as COPY } from '../../src/features/secure-ready-made-order/model/order-access-copy';
import { SecureOrderScreen } from '../../src/features/secure-ready-made-order/ui/secure-order-screen';
import {
  FULL_PAYMENT_DISPLAY,
  makeCancelled,
  makeFulfilment,
  navigateToOrderAccess,
} from '../support/secure-ready-made-order-fixture';
import { TEST_TOKEN, envelopeOf } from '../support/secure-link-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicReadyMadeOrderCurrent: jest.fn(),
  publicOrderFullPaymentCurrent: jest.fn(),
  publicOrderFullPaymentInitiate: jest.fn(),
  publicOrderFullPaymentQr: jest.fn(),
  publicSecureLinkResolve: jest.fn(),
}));

const orderMock = publicReadyMadeOrderCurrent as jest.MockedFunction<
  typeof publicReadyMadeOrderCurrent
>;
const fullMock = publicOrderFullPaymentCurrent as jest.Mock;
const initiateMock = publicOrderFullPaymentInitiate as jest.Mock;
const qrMock = publicOrderFullPaymentQr as jest.Mock;
const resolveMock = publicSecureLinkResolve as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  navigateToOrderAccess(`#t=${TEST_TOKEN}`);
});

async function renderAuthorized() {
  renderWithProviders(<SecureOrderScreen />);
  const headings = Object.values(COPY.headings);
  await screen.findByRole('heading', {
    level: 1,
    name: (name: string) => headings.includes(name),
  });
}

describe('F2 — a paid order keeps its exact total and asks for nothing', () => {
  it.each([
    ReadyMadeOrderAccessResponseStatus.READY_FOR_DELIVERY,
    ReadyMadeOrderAccessResponseStatus.DELIVERED,
    ReadyMadeOrderAccessResponseStatus.COMPLETED,
  ])('keeps the settled total on %s and never says a fee is pending', async (status) => {
    orderMock.mockResolvedValue(envelopeOf(makeFulfilment(status)));
    await renderAuthorized();

    // The satisfied obligation's own figure, verbatim — the fixture's
    // `payment.payableTotal`, which is the same string the customer paid.
    const settled = screen.getByTestId('secure-order-settled-total');
    expect(settled).toHaveTextContent(COPY.amount.settledLabel);
    expect(settled).toHaveTextContent(FULL_PAYMENT_DISPLAY);
    expect(
      screen.getByRole('heading', { level: 2, name: COPY.amount.summaryTitle }),
    ).toBeInTheDocument();

    const page = document.body.textContent ?? '';
    expect(page).not.toContain(COPY.amount.pendingFee);
    expect(page).not.toContain(COPY.amount.title);

    // Nothing to transfer: no copy-amount control, and no payment call at all —
    // the FULL read, the QR and the initiation all stay unissued after SATISFIED.
    expect(screen.queryByRole('button', { name: COPY.copy.amount })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: COPY.attempt.start })).not.toBeInTheDocument();
    expect(fullMock).not.toHaveBeenCalled();
    expect(initiateMock).not.toHaveBeenCalled();
    expect(qrMock).not.toHaveBeenCalled();
    // One read, once: no second poll was introduced to fetch the settled figure.
    expect(orderMock).toHaveBeenCalledTimes(1);
  });

  it('says no fee is pending on a cancelled order either', async () => {
    orderMock.mockResolvedValue(envelopeOf(makeCancelled()));
    await renderAuthorized();

    expect(document.body.textContent ?? '').not.toContain(COPY.amount.pendingFee);
    expect(screen.queryByTestId('secure-order-settled-total')).not.toBeInTheDocument();
  });
});

describe('F4 — a reload without the fragment claims no replacement link', () => {
  it('shows the one cause-neutral card and makes no request', async () => {
    // A reload of the bare path: no credential is in hand. The original email
    // link still works, so the card must not say it was replaced.
    navigateToOrderAccess('');
    renderWithProviders(<SecureOrderScreen />);

    await screen.findByRole('heading', { name: SECURE_LINK_COPY.unavailable.title });
    expect(orderMock).not.toHaveBeenCalled();
    expect(resolveMock).not.toHaveBeenCalled();

    const page = document.body.textContent ?? '';
    expect(page).toContain(SECURE_LINK_COPY.unavailable.alertBody);
    expect(page).not.toMatch(/đã được thay|thay bằng liên kết|liên kết mới nhất/i);
    // Still indistinguishable: no cause is named, so no oracle is created.
    expect(page).not.toMatch(/hết hạn liên kết|thu hồi|sai đơn|không hợp lệ/i);
  });
});
