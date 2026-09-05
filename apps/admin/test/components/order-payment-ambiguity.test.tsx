/**
 * What happens when a financial mutation does not come back cleanly
 * (`APP7-A01`; `741:51`, `741:87`).
 *
 * The discriminating case is the first one: the verification's transport dies
 * with no status line, the server had in fact committed, and the screen has to
 * arrive at the truth by *reading* rather than by concluding. A UI that reported
 * "xác nhận thất bại" here would tell an operator to re-collect a deposit that
 * has already been paid.
 *
 * The others are its neighbours: an unchanged state must invite an explicit
 * re-send rather than perform one, a 5xx is just as ambiguous as a dropped
 * socket, and a `409` must reconcile to the winner instead of insisting.
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
  adminPaymentAttemptVerify,
} from '@embroidery/api-client';

import { paymentTerminologyFor } from '../../src/features/order-detail/model/payment-terminology';
import { OrderDetailScreen } from '../../src/features/order-detail';
import { ORDER_DETAIL_COPY as COPY } from '../../src/features/order-detail/model/order-detail-copy';
import { makeApiClientError, makeNetworkError } from '../support/api-error';
import {
  envelope,
  makeAttempt,
  makeOrderDetail,
  makePayments,
  makeVerifiedDecision,
  EXPECTED_AMOUNT,
  EXPECTED_REFERENCE,
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

/**
 * The committed truth an earlier, unanswered call would have produced.
 *
 * The obligation's state moved under `currentObligation` in `APP12-A02-C1`;
 * the fact asserted is unchanged — the deposit is satisfied and its attempt
 * succeeded.
 */
const settledPayments = () =>
  envelope(
    makePayments({
      currentObligation: {
        obligationId: '019d0000-0000-7000-8000-000000000001',
        kind: 'DEPOSIT',
        status: 'SATISFIED',
        expectedAmount: EXPECTED_AMOUNT,
        expectedCurrencyCode: 'VND',
        expectedTransferReference: EXPECTED_REFERENCE,
      },
      orderStatus: 'DEPOSIT_PAID',
      attempts: [makeAttempt({ status: 'SUCCEEDED' })],
    }),
  );

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
  detailMock.mockResolvedValue(envelope(makeOrderDetail()));
  paymentsMock.mockResolvedValue(envelope(makePayments()));
  verifyMock.mockResolvedValue(envelope(makeVerifiedDecision()));
});

const submitVerify = async () => {
  renderWithProviders(<OrderDetailScreen orderId={ORDER_ID} />);
  await user.click(await screen.findByTestId('open-verify-dialog'));
  await screen.findByTestId('verify-dialog');
  await user.type(screen.getByTestId('verify-observed-amount'), '5100000');
  await user.type(screen.getByTestId('verify-observed-reference'), 'ORDK7M2Q9XR4TDC');
  await user.type(screen.getByTestId('verify-note'), 'Đối chiếu sao kê.');
  await user.click(screen.getByTestId('verify-submit'));
};

describe('a lost response', () => {
  it('refetches the current truth and renders the committed success', async () => {
    // The mutation's answer never arrives, but the write landed.
    verifyMock.mockRejectedValue(makeNetworkError());
    paymentsMock
      .mockResolvedValueOnce(envelope(makePayments()))
      .mockResolvedValue(settledPayments());

    await submitVerify();

    const outcome = await screen.findByTestId('payment-outcome');
    expect(outcome).toHaveAttribute('data-outcome', 'verified');
    expect(outcome.querySelector('.payment-outcome__title')).toHaveTextContent(
      CUSTOM_TERMS.outcomeSuccessTitle,
    );
    // The outcome was recovered, not reported — the screen says so.
    expect(screen.getByTestId('payment-outcome-replayed')).toBeInTheDocument();
    // And it never claimed a failure on the way there.
    expect(screen.queryByTestId('payment-failed')).not.toBeInTheDocument();
    // Exactly one write was attempted. Nothing retried the mutation.
    expect(verifyMock).toHaveBeenCalledTimes(1);
  });

  it('treats a 5xx the same way, because a generic 5xx proves nothing', async () => {
    verifyMock.mockRejectedValue(makeApiClientError({ status: 500, code: 'INTERNAL_ERROR' }));
    paymentsMock
      .mockResolvedValueOnce(envelope(makePayments()))
      .mockResolvedValue(settledPayments());

    await submitVerify();

    expect(await screen.findByTestId('payment-outcome')).toHaveAttribute(
      'data-outcome',
      'verified',
    );
    expect(screen.queryByTestId('payment-failed')).not.toBeInTheDocument();
  });

  it('recovers a mismatch that committed just as truthfully', async () => {
    verifyMock.mockRejectedValue(makeNetworkError());
    paymentsMock
      .mockResolvedValueOnce(envelope(makePayments()))
      .mockResolvedValue(
        envelope(makePayments({ attempts: [makeAttempt({ status: 'REQUIRES_REVIEW' })] })),
      );

    await submitVerify();

    expect(await screen.findByTestId('payment-outcome')).toHaveAttribute(
      'data-outcome',
      'requiresReview',
    );
  });

  it('says the state is unchanged and offers a re-send rather than performing one', async () => {
    verifyMock.mockRejectedValue(makeNetworkError());
    // Nothing moved: the earlier call may never have reached the server.
    paymentsMock.mockResolvedValue(envelope(makePayments()));

    await submitVerify();

    const unchanged = await screen.findByTestId('payment-unchanged');
    expect(unchanged).toHaveTextContent(COPY.ambiguity.unchangedTitle);
    expect(screen.queryByTestId('payment-outcome')).not.toBeInTheDocument();
    // Still exactly one attempt: no automatic resubmit of a financial mutation.
    expect(verifyMock).toHaveBeenCalledTimes(1);

    // The typed values survived, so re-sending is re-sending *the same values* —
    // which the contract converges on rather than double-writing.
    expect(screen.getByTestId('verify-observed-amount')).toHaveValue('5100000');
    expect(screen.getByTestId('verify-observed-reference')).toHaveValue('ORDK7M2Q9XR4TDC');
    expect(screen.getByTestId('verify-submit')).toBeEnabled();

    await user.click(screen.getByTestId('verify-submit'));
    await waitFor(() => {
      expect(verifyMock).toHaveBeenCalledTimes(2);
    });
    expect(verifyMock.mock.calls[1]?.[1]).toEqual(verifyMock.mock.calls[0]?.[1]);
  });

  it('locks the submit control while it is re-checking', async () => {
    verifyMock.mockRejectedValue(makeNetworkError());
    let resolvePayments: (value: unknown) => void = () => undefined;
    paymentsMock.mockResolvedValueOnce(envelope(makePayments())).mockReturnValue(
      new Promise((resolve) => {
        resolvePayments = resolve;
      }) as never,
    );

    await submitVerify();

    const reconciling = await screen.findByTestId('payment-reconciling');
    expect(reconciling).toHaveTextContent(COPY.ambiguity.checking);
    expect(screen.getByTestId('verify-submit')).toBeDisabled();

    resolvePayments(settledPayments());
    await screen.findByTestId('payment-outcome');
  });
});

describe('a concurrent conflict', () => {
  it('reconciles to the winner instead of insisting', async () => {
    verifyMock.mockRejectedValue(
      makeApiClientError({ status: 409, code: 'PAYMENT_ATTEMPT_STALE' }),
    );
    paymentsMock
      .mockResolvedValueOnce(envelope(makePayments()))
      .mockResolvedValue(settledPayments());

    await submitVerify();

    const stale = await screen.findByTestId('payment-stale');
    expect(stale).toHaveTextContent(COPY.stale.title);
    // The reloaded truth is what is on screen behind the dialog.
    await waitFor(() => {
      expect(screen.getByTestId('deposit-status')).toHaveTextContent('Đã thu đủ');
    });
    expect(verifyMock).toHaveBeenCalledTimes(1);
  });

  it('exposes no lock, transaction or version language to the operator', async () => {
    verifyMock.mockRejectedValue(
      makeApiClientError({
        status: 409,
        code: 'ROW_LOCK_TIMEOUT',
        message: 'could not obtain lock on relation payment_attempts',
      }),
    );

    await submitVerify();

    const stale = await screen.findByTestId('payment-stale');
    expect(stale.textContent).not.toMatch(/lock|transaction|version|relation|payment_attempts/i);
    expect(document.body.textContent).not.toContain('could not obtain lock');
  });

  it('does not keep a stale payload for a resubmit', async () => {
    verifyMock.mockRejectedValue(makeApiClientError({ status: 409, code: 'STALE' }));

    await submitVerify();
    await screen.findByTestId('payment-stale');

    // The values were written about a state the attempt has left, so they are
    // not re-offered for a one-click resend.
    expect(screen.queryByTestId('verify-observed-amount')).toHaveValue('5100000');
    expect(verifyMock).toHaveBeenCalledTimes(1);
  });
});

describe('an ordinary refusal', () => {
  it('is still reported as a refusal, with the operator text kept', async () => {
    verifyMock.mockRejectedValue(
      makeApiClientError({ status: 400, code: 'VALIDATION_FAILED', message: 'observedAmount' }),
    );

    await submitVerify();

    const failed = await screen.findByTestId('payment-failed');
    expect(failed).toHaveTextContent(COPY.failure.decisionInvalidTitle);
    expect(screen.getByTestId('verify-observed-amount')).toHaveValue('5100000');
    // A 4xx is not ambiguous: no reconciliation read was triggered by it.
    expect(paymentsMock).toHaveBeenCalledTimes(1);
  });
});
