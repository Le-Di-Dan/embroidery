/**
 * The Ready-Made branch of the Admin order workspace (`APP12-A02-C1`;
 * `913:337`, `914:361`).
 *
 * The assertions are about what the branch refuses to invent, and about what it
 * refuses to keep from the custom screen:
 *
 *  - it branches on `order.origin` and on nothing else;
 *  - no custom-only panel is **mounted** — not hidden, not disabled, not empty;
 *  - an unpriced order shows no obligation and no fabricated total;
 *  - the payable total is never composed in the browser from subtotal + fee;
 *  - a `PENDING` obligation offers a correction that says what it supersedes,
 *    and never that the customer gets longer to pay;
 *  - a `SATISFIED` obligation refuses the edit and states the rule;
 *  - the deadline is the reservation's own instant, and disappears with it.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import {
  adminOrderDetail,
  adminOrderPaymentRead,
  adminOrderShippingRead,
  adminPaymentAttemptVerify,
} from '@embroidery/api-client';

import { OrderDetailScreen } from '../../src/features/order-detail';
import { READY_MADE_DETAIL_COPY as COPY } from '../../src/features/order-detail/model/ready-made-detail-copy';
import { makeShippingDetail } from '../support/fulfillment-fixture';
import { envelope, makeCatalogItem, makeOrderDetail, ORDER_ID } from '../support/order-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock(`/orders/${'o1'}`).module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminOrderDetail: jest.fn(),
  adminOrderPaymentRead: jest.fn(),
  adminOrderShippingRead: jest.fn(),
  adminPaymentAttemptVerify: jest.fn(),
}));

const detailMock = adminOrderDetail as jest.MockedFunction<typeof adminOrderDetail>;
const paymentsMock = adminOrderPaymentRead as jest.MockedFunction<typeof adminOrderPaymentRead>;
const shippingMock = adminOrderShippingRead as jest.MockedFunction<typeof adminOrderShippingRead>;
const verifyMock = adminPaymentAttemptVerify as jest.MockedFunction<
  typeof adminPaymentAttemptVerify
>;

const FULL_AMOUNT = '1285000.00';
const MERCHANDISE = '1250000.00';
const DEADLINE = '2026-09-02T12:12:00.000Z';

/** A Ready-Made order: origin set, and the whole custom chain genuinely absent. */
const readyMadeOrder = (overrides: Record<string, unknown> = {}) =>
  makeOrderDetail({
    origin: 'READY_MADE',
    status: 'AWAITING_SHIPPING_FEE',
    totalAmount: MERCHANDISE,
    customRequestId: undefined,
    acceptedQuotationVersionId: undefined,
    currentApprovalSnapshotId: undefined,
    paymentDeadline: DEADLINE,
    items: [makeCatalogItem({ approvalSnapshotId: undefined })],
    ...overrides,
  });

/** The payment read for an order with nothing to collect yet. */
const unpricedPayments = () => ({
  orderId: ORDER_ID,
  orderCode: 'ORD-K7M2Q9XR4T',
  orderStatus: 'AWAITING_SHIPPING_FEE',
  origin: 'READY_MADE',
  attempts: [],
  reconciliations: [],
});

/** The payment read once a fee created the `FULL`. */
const fullPayments = (status: string, attempts: unknown[] = []) => ({
  orderId: ORDER_ID,
  orderCode: 'ORD-K7M2Q9XR4T',
  orderStatus: status === 'SATISFIED' ? 'READY_FOR_DELIVERY' : 'AWAITING_PAYMENT',
  origin: 'READY_MADE',
  currentObligation: {
    obligationId: '019f0000-0000-7000-8000-0000000000c1',
    kind: 'FULL',
    status,
    expectedAmount: FULL_AMOUNT,
    expectedCurrencyCode: 'VND',
    expectedTransferReference: 'ORDK7M2Q9XR4TFL',
  },
  attempts,
  reconciliations: [],
});

beforeEach(() => {
  jest.clearAllMocks();
  detailMock.mockResolvedValue(envelope(readyMadeOrder()));
  paymentsMock.mockResolvedValue(envelope(unpricedPayments()));
  shippingMock.mockResolvedValue(envelope(makeShippingDetail({ feeAmount: null })));
});

describe('the origin branch', () => {
  it('renders the Ready-Made composition and mounts no custom-only panel', async () => {
    renderWithProviders(<OrderDetailScreen orderId={ORDER_ID} />);

    expect(await screen.findByTestId('order-detail-origin')).toBeInTheDocument();

    // `BR-031` — the four custom-only sections are absent, and the absence is
    // stated once rather than drawn as empty cards.
    expect(screen.getByTestId('order-detail-omitted')).toHaveTextContent(COPY.frozen.omitted);

    // Not hidden and not disabled: **not mounted**. Each of these test ids is
    // rendered by a delivered custom-only panel.
    for (const customOnly of [
      'open-final-payment',
      'remaining-payment',
      'deposit-expected-amount',
      'deposit-satisfied-by',
      'open-verify-dialog',
    ]) {
      expect(screen.queryByTestId(customOnly)).not.toBeInTheDocument();
    }
  });

  it('keeps the custom composition when the origin says CUSTOM', async () => {
    detailMock.mockResolvedValue(envelope(makeOrderDetail()));
    paymentsMock.mockResolvedValue(
      envelope({
        orderId: ORDER_ID,
        orderCode: 'ORD-K7M2Q9XR4T',
        orderStatus: 'AWAITING_DEPOSIT',
        origin: 'CUSTOM',
        currentObligation: {
          obligationId: '019d0000-0000-7000-8000-000000000001',
          kind: 'DEPOSIT',
          status: 'PENDING',
          expectedAmount: '5100000.00',
          expectedCurrencyCode: 'VND',
          expectedTransferReference: 'ORDK7M2Q9XR4TDC',
        },
        attempts: [],
        reconciliations: [],
      }),
    );

    renderWithProviders(<OrderDetailScreen orderId={ORDER_ID} />);

    // The custom deposit workbench, and none of the Ready-Made branch.
    expect(await screen.findByTestId('deposit-expected-amount')).toBeInTheDocument();
    expect(screen.queryByTestId('order-detail-omitted')).not.toBeInTheDocument();
    expect(screen.queryByTestId('shipping-fee-input')).not.toBeInTheDocument();
  });
});

describe('before the shipping fee', () => {
  it('shows no obligation and fabricates no payable total', async () => {
    renderWithProviders(<OrderDetailScreen orderId={ORDER_ID} />);

    // A real order with nothing to collect, not a failure.
    expect(await screen.findByTestId('full-payment-empty')).toHaveTextContent(
      COPY.payment.emptyBody,
    );

    // The row exists so the operator knows the total is coming, and its value
    // says so. Composing `subtotal + typed fee` here is what §18 forbids.
    expect(screen.getByTestId('shipping-fee-payable')).toHaveTextContent(
      COPY.shipping.payableUnknown,
    );
    expect(screen.getByTestId('shipping-fee-payable')).not.toHaveTextContent('1.285.000');
  });

  it('opens the fee field empty, because NULL is unpriced and not zero', async () => {
    renderWithProviders(<OrderDetailScreen orderId={ORDER_ID} />);

    expect(await screen.findByTestId('shipping-fee-input')).toHaveValue('');
  });

  it('renders the reservation deadline it was given, not one it computed', async () => {
    renderWithProviders(<OrderDetailScreen orderId={ORDER_ID} />);

    const deadline = await screen.findByTestId('order-detail-deadline');
    expect(deadline.querySelector('time')).toHaveAttribute('dateTime', DEADLINE);
  });

  it('stops showing a deadline once nothing is reserved', async () => {
    detailMock.mockResolvedValue(envelope(readyMadeOrder({ paymentDeadline: undefined })));

    renderWithProviders(<OrderDetailScreen orderId={ORDER_ID} />);

    const deadline = await screen.findByTestId('order-detail-deadline');
    expect(deadline).toHaveTextContent(COPY.frozen.paymentDeadlineAbsent);
    expect(deadline.querySelector('time')).toBeNull();
  });
});

describe('once a FULL obligation exists', () => {
  it('shows the server amount and the FL reference, never a composed total', async () => {
    detailMock.mockResolvedValue(envelope(readyMadeOrder({ status: 'AWAITING_PAYMENT' })));
    paymentsMock.mockResolvedValue(envelope(fullPayments('PENDING')));
    shippingMock.mockResolvedValue(envelope(makeShippingDetail({ feeAmount: '35000.00' })));

    renderWithProviders(<OrderDetailScreen orderId={ORDER_ID} />);

    expect(await screen.findByTestId('full-payment-amount')).toHaveTextContent('1.285.000');
    // The FULL memo, not the deposit's.
    expect(screen.getByTestId('full-payment-reference')).toHaveTextContent('ORDK7M2Q9XR4TFL');
    expect(screen.getByTestId('full-payment-no-attempt')).toBeInTheDocument();
  });

  it('warns that a correction supersedes, and never promises more time to pay', async () => {
    detailMock.mockResolvedValue(envelope(readyMadeOrder({ status: 'AWAITING_PAYMENT' })));
    paymentsMock.mockResolvedValue(envelope(fullPayments('PENDING')));
    shippingMock.mockResolvedValue(envelope(makeShippingDetail({ feeAmount: '35000.00' })));

    renderWithProviders(<OrderDetailScreen orderId={ORDER_ID} />);

    const warning = await screen.findByTestId('shipping-fee-supersede-warning');
    expect(warning).toHaveTextContent(COPY.shipping.correctWarning);
    // The deadline fiction §39 forbids: no claim that the window is extended.
    expect(warning).not.toHaveTextContent(/gia hạn|thêm thời gian|kéo dài/i);
    expect(screen.getByTestId('shipping-fee-submit')).toHaveTextContent(COPY.shipping.correct);
  });

  it('refuses the edit once the FULL is satisfied, and states the rule', async () => {
    detailMock.mockResolvedValue(envelope(readyMadeOrder({ status: 'READY_FOR_DELIVERY' })));
    paymentsMock.mockResolvedValue(envelope(fullPayments('SATISFIED')));
    shippingMock.mockResolvedValue(envelope(makeShippingDetail({ feeAmount: '35000.00' })));

    renderWithProviders(<OrderDetailScreen orderId={ORDER_ID} />);

    const refusal = await screen.findByTestId('shipping-fee-refused');
    expect(refusal).toHaveTextContent(COPY.shipping.refusedTitle);
    expect(refusal).toHaveTextContent(COPY.shipping.refusedBody);
    // Not a disabled input — the control is gone, and the rule is stated.
    expect(screen.queryByTestId('shipping-fee-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('shipping-fee-submit')).not.toBeInTheDocument();
  });

  it('offers verification only against an open attempt on the live obligation', async () => {
    detailMock.mockResolvedValue(envelope(readyMadeOrder({ status: 'AWAITING_PAYMENT' })));
    paymentsMock.mockResolvedValue(
      envelope(
        fullPayments('PENDING', [
          {
            attemptId: '019f0000-0000-7000-8000-0000000000d1',
            method: 'BANK_TRANSFER',
            status: 'PENDING',
            amount: FULL_AMOUNT,
            currencyCode: 'VND',
            createdAt: '2026-09-01T12:00:00.000Z',
            updatedAt: '2026-09-01T12:00:00.000Z',
            evidence: [],
          },
        ]),
      ),
    );
    shippingMock.mockResolvedValue(envelope(makeShippingDetail({ feeAmount: '35000.00' })));

    renderWithProviders(<OrderDetailScreen orderId={ORDER_ID} />);

    expect(await screen.findByTestId('full-attempt-status')).toHaveTextContent('PENDING');
    expect(screen.getByTestId('full-payment-verify')).toBeInTheDocument();
  });

  it('keeps the verification dialog open after the payment settles', async () => {
    // The defect the live journeys caught: gating the dialog on "is there still
    // an actionable attempt" unmounts it at the exact moment the verification
    // succeeds — the operator submits and watches the outcome panel vanish
    // before they can read it. The dialog is held open by the **attempt id**
    // captured when it opened, so a settling payment cannot close it.
    const user = createUser();
    detailMock.mockResolvedValue(envelope(readyMadeOrder({ status: 'AWAITING_PAYMENT' })));
    const pendingAttempt = {
      attemptId: '019f0000-0000-7000-8000-0000000000d1',
      method: 'BANK_TRANSFER',
      status: 'PENDING',
      amount: FULL_AMOUNT,
      currencyCode: 'VND',
      createdAt: '2026-09-01T12:00:00.000Z',
      updatedAt: '2026-09-01T12:00:00.000Z',
      evidence: [],
    };
    paymentsMock.mockResolvedValue(envelope(fullPayments('PENDING', [pendingAttempt])));
    shippingMock.mockResolvedValue(envelope(makeShippingDetail({ feeAmount: '35000.00' })));

    // The verification succeeds, and the re-read that follows it reports the
    // obligation SATISFIED — so by the time the outcome is rendered there is no
    // actionable attempt left on the panel behind the dialog.
    verifyMock.mockResolvedValue(
      envelope({
        attemptId: pendingAttempt.attemptId,
        attemptStatus: 'SUCCEEDED',
        depositStatus: 'SATISFIED',
        orderStatus: 'READY_FOR_DELIVERY',
        reconciliationAction: 'MANUAL_MATCH',
        replayed: false,
      }),
    );

    renderWithProviders(<OrderDetailScreen orderId={ORDER_ID} />);
    await user.click(await screen.findByTestId('full-payment-verify'));
    expect(await screen.findByTestId('verify-dialog')).toBeInTheDocument();

    paymentsMock.mockResolvedValue(
      envelope(fullPayments('SATISFIED', [{ ...pendingAttempt, status: 'SUCCEEDED' }])),
    );

    await user.type(screen.getByTestId('verify-observed-amount'), '1285000');
    await user.type(screen.getByTestId('verify-observed-reference'), 'ORDK7M2Q9XR4TFL');
    await user.type(screen.getByTestId('verify-note'), 'Đối chiếu sao kê.');
    await user.click(screen.getByTestId('verify-submit'));

    // The outcome is on screen — which it could not be if the dialog had
    // unmounted when the attempt stopped being actionable.
    const outcome = await screen.findByTestId('payment-outcome');
    expect(outcome).toHaveAttribute('data-outcome', 'verified');
    expect(screen.getByTestId('verify-dialog')).toBeInTheDocument();

    // And the panel behind it has caught up: the control is gone, not disabled.
    await waitFor(() => {
      expect(screen.queryByTestId('full-payment-verify')).not.toBeInTheDocument();
    });
  });

  it('offers no verification once the obligation is satisfied', async () => {
    detailMock.mockResolvedValue(envelope(readyMadeOrder({ status: 'READY_FOR_DELIVERY' })));
    paymentsMock.mockResolvedValue(
      envelope(
        fullPayments('SATISFIED', [
          {
            attemptId: '019f0000-0000-7000-8000-0000000000d1',
            method: 'BANK_TRANSFER',
            status: 'SUCCEEDED',
            amount: FULL_AMOUNT,
            currencyCode: 'VND',
            createdAt: '2026-09-01T12:00:00.000Z',
            updatedAt: '2026-09-01T12:30:00.000Z',
            evidence: [],
          },
        ]),
      ),
    );
    shippingMock.mockResolvedValue(envelope(makeShippingDetail({ feeAmount: '35000.00' })));

    renderWithProviders(<OrderDetailScreen orderId={ORDER_ID} />);

    expect(await screen.findByTestId('full-payment-settled')).toBeInTheDocument();
    // The work is done, so the money-moving control is gone rather than
    // disabled — even if another operator did it.
    expect(screen.queryByTestId('full-payment-verify')).not.toBeInTheDocument();
  });
});
