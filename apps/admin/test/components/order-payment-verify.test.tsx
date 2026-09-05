/**
 * The deposit verification form and its two outcomes (`APP7-A01`; `737:3`,
 * `737:57`, `740:3`, `740:56`).
 *
 * The load-bearing assertions:
 *
 *  - all three fields are required, and the shape check mirrors exactly the one
 *    expression the contract publishes;
 *  - the observed reference carries **no** pattern, maximum length, uppercasing
 *    or trimming — the value reaches the wire byte-for-byte as typed;
 *  - the observed fields are never prefilled from the expected ones;
 *  - an exact match renders the authoritative success, all three facts together;
 *  - a `REQUIRES_REVIEW` **200** renders a durable business outcome and never
 *    the words "xác nhận thất bại".
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import {
  adminOrderDetail,
  adminOrderPaymentRead,
  adminPaymentAttemptVerify,
} from '@embroidery/api-client';

import { paymentTerminologyFor } from '../../src/features/order-detail/model/payment-terminology';
import { OrderDetailScreen } from '../../src/features/order-detail';
import { ORDER_DETAIL_COPY as COPY } from '../../src/features/order-detail/model/order-detail-copy';
import {
  ATTEMPT_ID,
  envelope,
  makeAttempt,
  makeOrderDetail,
  makePayments,
  makeReviewDecision,
  makeVerifiedDecision,
  ORDER_ID,
} from '../support/order-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/orders/o1').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminOrderDetail: jest.fn(),
  adminOrderPaymentRead: jest.fn(),
  adminPaymentAttemptVerify: jest.fn(),
}));

/** The custom branch keeps the deposit wording APP7 shipped (§24). */
const CUSTOM_TERMS = paymentTerminologyFor('CUSTOM');

const detailMock = adminOrderDetail as jest.MockedFunction<typeof adminOrderDetail>;
const paymentsMock = adminOrderPaymentRead as jest.MockedFunction<typeof adminOrderPaymentRead>;
const verifyMock = adminPaymentAttemptVerify as jest.MockedFunction<
  typeof adminPaymentAttemptVerify
>;

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
  detailMock.mockResolvedValue(envelope(makeOrderDetail()));
  paymentsMock.mockResolvedValue(envelope(makePayments()));
  verifyMock.mockResolvedValue(envelope(makeVerifiedDecision()));
});

const render = () => renderWithProviders(<OrderDetailScreen orderId={ORDER_ID} />);

const openVerify = async () => {
  render();
  await user.click(await screen.findByTestId('open-verify-dialog'));
  return screen.findByTestId('verify-dialog');
};

const fill = async (values: { amount: string; reference: string; note: string }) => {
  await user.type(screen.getByTestId('verify-observed-amount'), values.amount);
  await user.type(screen.getByTestId('verify-observed-reference'), values.reference);
  await user.type(screen.getByTestId('verify-note'), values.note);
};

describe('the form contract', () => {
  it('requires all three fields and sends nothing until they are present', async () => {
    await openVerify();

    await user.click(screen.getByTestId('verify-submit'));

    expect(await screen.findByTestId('verify-validation')).toBeInTheDocument();
    expect(verifyMock).not.toHaveBeenCalled();
    for (const id of ['verify-observed-amount', 'verify-observed-reference', 'verify-note']) {
      expect(screen.getByTestId(id)).toHaveAttribute('aria-invalid', 'true');
    }
  });

  it('links each error to its own control rather than only to the summary', async () => {
    await openVerify();
    await user.click(screen.getByTestId('verify-submit'));

    const amount = await screen.findByTestId('verify-observed-amount');
    const describedBy = amount.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      COPY.validation.required,
    );
  });

  it('mirrors exactly the published amount expression, neither loosened nor tightened', async () => {
    await openVerify();
    await fill({ amount: '5.100.000', reference: 'x', note: 'y' });
    await user.click(screen.getByTestId('verify-submit'));

    expect(await screen.findByTestId('verify-validation')).toBeInTheDocument();
    expect(verifyMock).not.toHaveBeenCalled();

    await user.clear(screen.getByTestId('verify-observed-amount'));
    await user.type(screen.getByTestId('verify-observed-amount'), '5100000.00');
    await user.click(screen.getByTestId('verify-submit'));

    await waitFor(() => {
      expect(verifyMock).toHaveBeenCalledTimes(1);
    });
  });

  it('never prefills an observed field from an expected one', async () => {
    await openVerify();

    expect(screen.getByTestId('verify-observed-amount')).toHaveValue('');
    expect(screen.getByTestId('verify-observed-reference')).toHaveValue('');
    expect(screen.getByTestId('verify-note')).toHaveValue('');
    // The expected facts are on screen, read-only, in their own block.
    expect(screen.getByTestId('verify-expected-reference')).toHaveTextContent('ORDK7M2Q9XR4TDC');
    expect(screen.getByTestId('verify-expected-amount')).toHaveTextContent('5.100.000 VND');
  });
});

describe('observedTransferReference is never touched', () => {
  it('declares no pattern, no maxLength and no uppercase transform', async () => {
    await openVerify();
    const control = screen.getByTestId('verify-observed-reference');

    expect(control).not.toHaveAttribute('pattern');
    expect(control).not.toHaveAttribute('maxLength');
    expect(control).not.toHaveAttribute('minLength');
    // A visual uppercase would misrepresent what is about to be submitted.
    expect(control.style.textTransform).toBe('');
  });

  it('submits a long, mixed-case, punctuated reference byte-for-byte', async () => {
    const messy =
      '  ck coc DON hang ordk7m2q9xr4tdc - Nguyen Van A / GD 20260823.140233 ref#998877  ';
    await openVerify();
    await user.type(screen.getByTestId('verify-observed-amount'), '5100000');
    await user.type(screen.getByTestId('verify-observed-reference'), messy);
    await user.type(screen.getByTestId('verify-note'), 'Đối chiếu sao kê.');
    await user.click(screen.getByTestId('verify-submit'));

    await waitFor(() => {
      expect(verifyMock).toHaveBeenCalledTimes(1);
    });
    const [attemptId, body] = verifyMock.mock.calls[0] as unknown as [
      string,
      { observedTransferReference: string; observedAmount: string; note: string },
    ];
    expect(attemptId).toBe(ATTEMPT_ID);
    // Not uppercased, not trimmed, not stripped, not truncated at 15 or 2000.
    expect(body.observedTransferReference).toBe(messy);
    expect(body.observedAmount).toBe('5100000');
  });

  it('accepts a reference far longer than any bound the UI might have invented', async () => {
    const long = 'A'.repeat(2400);
    await openVerify();
    await user.type(screen.getByTestId('verify-observed-amount'), '5100000');
    // `paste` rather than `type`, so a 2400-character value does not take 2400
    // keystrokes — the control's acceptance is what is under test.
    await user.click(screen.getByTestId('verify-observed-reference'));
    await user.paste(long);
    await user.type(screen.getByTestId('verify-note'), 'n');
    await user.click(screen.getByTestId('verify-submit'));

    await waitFor(() => {
      expect(verifyMock).toHaveBeenCalledTimes(1);
    });
    const [, body] = verifyMock.mock.calls[0] as unknown as [
      string,
      { observedTransferReference: string },
    ];
    expect(body.observedTransferReference).toHaveLength(2400);
  });
});

describe('the two outcomes of a 200', () => {
  it('renders the authoritative success only when all three facts agree', async () => {
    paymentsMock.mockResolvedValueOnce(envelope(makePayments())).mockResolvedValue(
      envelope(
        makePayments({
          depositStatus: 'SATISFIED',
          orderStatus: 'DEPOSIT_PAID',
          attempts: [makeAttempt({ status: 'SUCCEEDED' })],
        }),
      ),
    );
    await openVerify();
    await fill({ amount: '5100000', reference: 'ORDK7M2Q9XR4TDC', note: 'khớp sao kê' });
    await user.click(screen.getByTestId('verify-submit'));

    const outcome = await screen.findByTestId('payment-outcome');
    expect(outcome).toHaveAttribute('data-outcome', 'verified');
    expect(outcome).toHaveTextContent(CUSTOM_TERMS.outcomeSuccessTitle);
    expect(within(outcome).getByTestId('outcome-attempt')).toHaveTextContent('SUCCEEDED');
    expect(within(outcome).getByTestId('outcome-deposit')).toHaveTextContent('Đã thu đủ');
    expect(within(outcome).getByTestId('outcome-order')).toHaveTextContent('Đã xác nhận cọc');
  });

  it('reports a mismatch as a durable business outcome, never as a failure', async () => {
    verifyMock.mockResolvedValue(envelope(makeReviewDecision()));
    paymentsMock.mockResolvedValueOnce(envelope(makePayments())).mockResolvedValue(
      envelope(
        makePayments({
          attempts: [makeAttempt({ status: 'REQUIRES_REVIEW', reviewReason: 'Số tiền lệch.' })],
        }),
      ),
    );
    await openVerify();
    await fill({ amount: '5000000', reference: 'CK COC DON HANG', note: 'lệch' });
    await user.click(screen.getByTestId('verify-submit'));

    const outcome = await screen.findByTestId('payment-outcome');
    expect(outcome).toHaveAttribute('data-outcome', 'requiresReview');
    // The heading is the business outcome, never a failure. The phrase "xác
    // nhận thất bại" does appear once on screen — inside the approved note that
    // *forbids* it — so the assertion is on the title element, not on the whole
    // document, which would be satisfied by the prohibition itself.
    expect(outcome.querySelector('.payment-outcome__title')).toHaveTextContent(
      COPY.outcome.reviewTitle,
    );
    expect(outcome.querySelector('.payment-outcome__badge')).toHaveTextContent(
      COPY.outcome.reviewBadge,
    );
    expect(screen.queryByTestId('payment-failed')).not.toBeInTheDocument();
    expect(within(outcome).getByTestId('outcome-deposit')).toHaveTextContent('Chưa thu');
    expect(within(outcome).getByTestId('outcome-order')).toHaveTextContent('Chờ đặt cọc');
  });

  it('does not claim a paid deposit from an attempt status alone', async () => {
    // Contradictory, and therefore exactly the case a screen must not guess at:
    // the attempt succeeded but nothing else moved.
    verifyMock.mockResolvedValue(
      envelope(makeVerifiedDecision({ depositStatus: 'PENDING', orderStatus: 'AWAITING_DEPOSIT' })),
    );
    await openVerify();
    await fill({ amount: '5100000', reference: 'ORDK7M2Q9XR4TDC', note: 'n' });
    await user.click(screen.getByTestId('verify-submit'));

    const outcome = await screen.findByTestId('payment-outcome');
    expect(outcome).toHaveAttribute('data-outcome', 'recorded');
    expect(outcome).not.toHaveTextContent(CUSTOM_TERMS.outcomeSuccessTitle);
  });

  it('re-reads the payment truth after a decision instead of trusting the receipt', async () => {
    await openVerify();
    await fill({ amount: '5100000', reference: 'ORDK7M2Q9XR4TDC', note: 'n' });
    await user.click(screen.getByTestId('verify-submit'));

    await screen.findByTestId('payment-outcome');
    // One read on mount, one after the decision settled.
    expect(paymentsMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(detailMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('drops a double-click before it can become a second write', async () => {
    let resolveVerify: (value: unknown) => void = () => undefined;
    verifyMock.mockReturnValue(
      new Promise((resolve) => {
        resolveVerify = resolve;
      }) as never,
    );
    await openVerify();
    await fill({ amount: '5100000', reference: 'ORDK7M2Q9XR4TDC', note: 'n' });

    const submit = screen.getByTestId('verify-submit');
    await user.click(submit);
    await user.click(submit);

    expect(verifyMock).toHaveBeenCalledTimes(1);
    resolveVerify(envelope(makeVerifiedDecision()));
    await screen.findByTestId('payment-outcome');
  });
});

describe('resolving a review', () => {
  it('reopens the same verification rather than offering a resolve endpoint', async () => {
    paymentsMock.mockResolvedValue(
      envelope(
        makePayments({
          attempts: [makeAttempt({ status: 'REQUIRES_REVIEW', reviewReason: 'Chờ đối soát.' })],
        }),
      ),
    );
    render();

    expect(await screen.findByTestId('order-requires-review')).toBeInTheDocument();
    expect(screen.getByTestId('open-verify-dialog')).toHaveTextContent(
      paymentTerminologyFor('CUSTOM').reopenSubmit,
    );
    // No third control, and no operation beyond verify/review exists to reach.
    const decisionService = jest.requireActual<Record<string, unknown>>(
      '../../src/features/order-detail/services/payment-decision.service',
    );
    expect(Object.keys(decisionService).sort()).toEqual([
      'reviewPaymentAttempt',
      'verifyPaymentAttempt',
    ]);
  });
});
