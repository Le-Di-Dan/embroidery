/**
 * Routing one attempt to manual reconciliation (`APP7-A01`; `740:111`).
 *
 * What is being proved:
 *
 *  - `reviewReason` is required and the two observed fields are not;
 *  - an empty optional box is **omitted** from the body rather than sent as `''`
 *    or as a fabricated `0`;
 *  - the caller sends no status, no admin id and no expected value;
 *  - the result comes from a refetch, never from a locally assumed success.
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
  adminPaymentAttemptReview,
} from '@embroidery/api-client';

import { OrderDetailScreen } from '../../src/features/order-detail';
import { ORDER_DETAIL_COPY as COPY } from '../../src/features/order-detail/model/order-detail-copy';
import {
  ATTEMPT_ID,
  envelope,
  makeAttempt,
  makeOrderDetail,
  makePayments,
  makeReviewDecision,
  ORDER_ID,
} from '../support/order-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/orders/o1').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminOrderDetail: jest.fn(),
  adminOrderPaymentRead: jest.fn(),
  adminPaymentAttemptReview: jest.fn(),
}));

const detailMock = adminOrderDetail as jest.MockedFunction<typeof adminOrderDetail>;
const paymentsMock = adminOrderPaymentRead as jest.MockedFunction<typeof adminOrderPaymentRead>;
const reviewMock = adminPaymentAttemptReview as jest.MockedFunction<
  typeof adminPaymentAttemptReview
>;

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
  detailMock.mockResolvedValue(envelope(makeOrderDetail()));
  paymentsMock.mockResolvedValue(envelope(makePayments()));
  reviewMock.mockResolvedValue(envelope(makeReviewDecision()));
});

const openReview = async () => {
  renderWithProviders(<OrderDetailScreen orderId={ORDER_ID} />);
  await user.click(await screen.findByTestId('open-review-dialog'));
  return screen.findByTestId('review-dialog');
};

const lastBody = () =>
  (
    reviewMock.mock.calls[reviewMock.mock.calls.length - 1] as unknown as [
      string,
      Record<string, unknown>,
    ]
  )[1];

describe('the form contract', () => {
  it('requires the reason and sends nothing without it', async () => {
    await openReview();

    await user.click(screen.getByTestId('review-submit'));

    expect(await screen.findByTestId('review-validation')).toBeInTheDocument();
    expect(reviewMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('review-reason')).toHaveAttribute('aria-invalid', 'true');
  });

  it('treats both observed fields as optional', async () => {
    await openReview();

    await user.type(screen.getByTestId('review-reason'), 'Chưa thấy tiền về sau 24 giờ.');
    await user.click(screen.getByTestId('review-submit'));

    await waitFor(() => {
      expect(reviewMock).toHaveBeenCalledTimes(1);
    });
    expect(reviewMock.mock.calls[0]?.[0]).toBe(ATTEMPT_ID);
  });

  it('omits an empty observation rather than recording a fabricated zero', async () => {
    await openReview();
    await user.type(screen.getByTestId('review-reason'), 'Chưa thấy giao dịch nào.');
    await user.click(screen.getByTestId('review-submit'));

    await waitFor(() => {
      expect(reviewMock).toHaveBeenCalledTimes(1);
    });
    const body = lastBody();
    expect(body['reviewReason']).toBe('Chưa thấy giao dịch nào.');
    // Absent, not `''` and not `0`: nobody observed a figure.
    expect('observedAmount' in body).toBe(false);
    expect('observedTransferReference' in body).toBe(false);
  });

  it('records an observation when the operator actually has one', async () => {
    await openReview();
    await user.type(screen.getByTestId('review-reason'), 'Thấy một khoản lệch.');
    await user.type(screen.getByTestId('review-observed-amount'), '5000000');
    await user.type(screen.getByTestId('review-observed-reference'), 'CK COC DON HANG - NVA');
    await user.click(screen.getByTestId('review-submit'));

    await waitFor(() => {
      expect(reviewMock).toHaveBeenCalledTimes(1);
    });
    const body = lastBody();
    expect(body['observedAmount']).toBe('5000000');
    // Free text, submitted verbatim on this endpoint too.
    expect(body['observedTransferReference']).toBe('CK COC DON HANG - NVA');
  });

  it('refuses a malformed observed amount before a round trip', async () => {
    await openReview();
    await user.type(screen.getByTestId('review-reason'), 'r');
    await user.type(screen.getByTestId('review-observed-amount'), '5.000.000');
    await user.click(screen.getByTestId('review-submit'));

    expect(await screen.findByTestId('review-validation')).toBeInTheDocument();
    expect(reviewMock).not.toHaveBeenCalled();
  });

  it('sends no caller-owned status, admin id or expected value', async () => {
    await openReview();
    await user.type(screen.getByTestId('review-reason'), 'r');
    await user.click(screen.getByTestId('review-submit'));

    await waitFor(() => {
      expect(reviewMock).toHaveBeenCalledTimes(1);
    });
    const body = lastBody();
    // The endpoint itself means REQUIRES_REVIEW; there is nothing to choose.
    expect(Object.keys(body)).toEqual(['reviewReason']);
  });

  it('declares no pattern or maxLength on the optional reference either', async () => {
    await openReview();
    const control = screen.getByTestId('review-observed-reference');

    expect(control).not.toHaveAttribute('pattern');
    expect(control).not.toHaveAttribute('maxLength');
  });
});

describe('the result', () => {
  it('renders the recorded outcome and re-reads the payment truth', async () => {
    paymentsMock.mockResolvedValueOnce(envelope(makePayments())).mockResolvedValue(
      envelope(
        makePayments({
          attempts: [makeAttempt({ status: 'REQUIRES_REVIEW', reviewReason: 'Chưa thấy tiền.' })],
        }),
      ),
    );
    await openReview();
    await user.type(screen.getByTestId('review-reason'), 'Chưa thấy tiền.');
    await user.click(screen.getByTestId('review-submit'));

    const outcome = await screen.findByTestId('payment-outcome');
    expect(outcome).toHaveAttribute('data-outcome', 'requiresReview');
    expect(outcome.querySelector('.payment-outcome__title')).toHaveTextContent(
      COPY.outcome.reviewRecordedTitle,
    );
    // The deposit and the order are unchanged — a review settles nothing.
    expect(outcome).toHaveTextContent('Chưa thu');
    expect(outcome).toHaveTextContent('Chờ đặt cọc');
    expect(paymentsMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('never shows a locally assumed success before the re-read resolves', async () => {
    let resolveReview: (value: unknown) => void = () => undefined;
    reviewMock.mockReturnValue(
      new Promise((resolve) => {
        resolveReview = resolve;
      }) as never,
    );
    await openReview();
    await user.type(screen.getByTestId('review-reason'), 'r');
    await user.click(screen.getByTestId('review-submit'));

    // In flight: no outcome at all, and the control cannot be pressed again.
    expect(screen.queryByTestId('payment-outcome')).not.toBeInTheDocument();
    expect(screen.getByTestId('review-submit')).toBeDisabled();

    resolveReview(envelope(makeReviewDecision()));
    await screen.findByTestId('payment-outcome');
    expect(reviewMock).toHaveBeenCalledTimes(1);
  });
});
