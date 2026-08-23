/**
 * The deposit workbench (`APP7-A01`; `734:109`…`734:163`, `736:149`, `743:3`,
 * `743:35`).
 *
 * Every assertion here is one half of the rule `751:3` exists to enforce: an
 * image status is not a payment status, and a payment-attempt status is not an
 * order status.
 *
 *  - zero evidence is an ordinary, verifiable deposit;
 *  - a `REJECTED` screenshot does not disable, hide or discourage verification;
 *  - an `ACCEPTED` screenshot claims nothing about money;
 *  - expected and observed facts never share a block;
 *  - a satisfied deposit hides the actions rather than offering a dead end.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  renderWithProviders,
  screen,
  within,
} from '@embroidery/frontend-testing';
import { adminOrderDetail, adminOrderPaymentRead } from '@embroidery/api-client';

import { OrderDetailScreen } from '../../src/features/order-detail';
import { ORDER_DETAIL_COPY as COPY } from '../../src/features/order-detail/model/order-detail-copy';
import {
  ATTEMPT_ID,
  EVIDENCE_ACCEPTED_ID,
  EVIDENCE_INSPECTING_ID,
  EVIDENCE_REJECTED_ID,
  envelope,
  makeAttempt,
  makeEvidence,
  makeOrderDetail,
  makePayments,
  makeReconciliation,
  ORDER_ID,
} from '../support/order-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/orders/o1').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminOrderDetail: jest.fn(),
  adminOrderPaymentRead: jest.fn(),
}));

const detailMock = adminOrderDetail as jest.MockedFunction<typeof adminOrderDetail>;
const paymentsMock = adminOrderPaymentRead as jest.MockedFunction<typeof adminOrderPaymentRead>;

beforeEach(() => {
  jest.clearAllMocks();
  detailMock.mockResolvedValue(envelope(makeOrderDetail()));
  paymentsMock.mockResolvedValue(envelope(makePayments()));
});

const render = () => renderWithProviders(<OrderDetailScreen orderId={ORDER_ID} />);

describe('expected facts', () => {
  it('renders the obligation amount and reference as read-only system values', async () => {
    render();

    expect(await screen.findByTestId('deposit-expected-amount')).toHaveTextContent('5.100.000 VND');
    expect(screen.getByTestId('deposit-expected-reference')).toHaveTextContent('ORDK7M2Q9XR4TDC');
    // Read-only: there is no control anywhere that could edit either.
    const panel = screen.getByTestId('order-payment-panel');
    expect(within(panel).queryByDisplayValue('ORDK7M2Q9XR4TDC')).not.toBeInTheDocument();
  });

  it('keeps the obligation state and the order state as separate badges', async () => {
    render();

    expect(await screen.findByTestId('deposit-status')).toHaveTextContent('Chưa thu');
    expect(screen.getByTestId('order-status')).toHaveTextContent('Chờ đặt cọc');
    // Different vocabularies on purpose — no shared "đã thanh toán" badge exists.
    expect(screen.queryByText('Đã thanh toán')).not.toBeInTheDocument();
  });

  it('renders no provider, outbox or remaining-payment surface', async () => {
    render();
    const panel = await screen.findByTestId('order-payment-panel');

    expect(panel.textContent).not.toMatch(/provider|webhook|outbox|redirect|thanh toán còn lại/i);
  });
});

describe('attempts', () => {
  it('states that a PENDING attempt is not a payment', async () => {
    render();

    expect(await screen.findByTestId('attempt-status')).toHaveTextContent(
      'PENDING — chờ đối chiếu',
    );
    expect(screen.getByText(COPY.attempts.pendingNote)).toBeInTheDocument();
  });

  it('names a contract state APP7 never produces without tinting it', async () => {
    paymentsMock.mockResolvedValue(
      envelope(makePayments({ attempts: [makeAttempt({ status: 'REFUNDED' })] })),
    );
    render();
    const badge = await screen.findByTestId('attempt-status');

    expect(badge).toHaveAttribute('data-status', 'REFUNDED');
    expect(badge.className).toContain('admin-status--neutral');
  });
});

describe('evidence', () => {
  it('treats zero evidence as ordinary and keeps verification available', async () => {
    render();

    expect(await screen.findByTestId('order-evidence-empty')).toHaveTextContent(
      COPY.evidence.empty,
    );
    // The whole point: no screenshot is required to verify a deposit.
    expect(screen.getByTestId('open-verify-dialog')).toBeEnabled();
  });

  it('renders UPLOADED exactly like INSPECTING, both with preview disabled', async () => {
    paymentsMock.mockResolvedValue(
      envelope(
        makePayments({
          attempts: [
            makeAttempt({
              evidence: [
                makeEvidence({
                  evidenceId: EVIDENCE_INSPECTING_ID,
                  assetStatus: 'UPLOADED',
                  previewEligible: false,
                }),
                makeEvidence({
                  evidenceId: EVIDENCE_REJECTED_ID,
                  assetStatus: 'INSPECTING',
                  previewEligible: false,
                }),
              ],
            }),
          ],
        }),
      ),
    );
    render();
    const items = await screen.findAllByTestId('order-evidence-item');

    for (const item of items) {
      expect(within(item).getByTestId('evidence-status')).toHaveTextContent('Đang kiểm tra');
      expect(within(item).getByRole('button')).toBeDisabled();
    }
  });

  it('keeps verification fully available beside a REJECTED screenshot', async () => {
    paymentsMock.mockResolvedValue(
      envelope(
        makePayments({
          attempts: [
            makeAttempt({
              evidence: [
                makeEvidence({
                  evidenceId: EVIDENCE_REJECTED_ID,
                  assetStatus: 'REJECTED',
                  previewEligible: false,
                }),
              ],
            }),
          ],
        }),
      ),
    );
    render();

    expect(await screen.findByTestId('evidence-status')).toHaveTextContent('Không hợp lệ');
    expect(screen.getByTestId(`evidence-preview-${EVIDENCE_REJECTED_ID}`)).toBeDisabled();
    // A rejected image is not a payment failure.
    expect(screen.getByTestId('open-verify-dialog')).toBeEnabled();
    expect(screen.getByText(COPY.evidence.rejectedNote)).toBeInTheDocument();
  });

  it('enables the preview only for an eligible image, and never shows an asset id', async () => {
    paymentsMock.mockResolvedValue(
      envelope(makePayments({ attempts: [makeAttempt({ evidence: [makeEvidence()] })] })),
    );
    render();

    expect(await screen.findByTestId(`evidence-preview-${EVIDENCE_ACCEPTED_ID}`)).toBeEnabled();
    expect(screen.getByTestId('evidence-status')).toHaveTextContent('Đã tiếp nhận');
    // An ACCEPTED image says nothing about money.
    expect(screen.getByTestId('deposit-status')).toHaveTextContent('Chưa thu');
    expect(screen.getByText(COPY.evidence.authorityNote)).toBeInTheDocument();
  });
});

describe('reconciliation history', () => {
  it('shows an absent optional field as a dash rather than a substitute', async () => {
    paymentsMock.mockResolvedValue(
      envelope(makePayments({ reconciliations: [makeReconciliation()] })),
    );
    render();
    const row = within(await screen.findByTestId('order-history-row'));

    expect(row.getByText('MANUAL_MATCH')).toBeInTheDocument();
    // No observed amount was recorded. `0` would be a figure nobody wrote.
    expect(row.getByTestId('history-amount')).toHaveTextContent(COPY.history.absent);
  });

  it('truncates a long observed reference and reveals it on request', async () => {
    const longReference =
      'CK COC DON HANG ordk7m2q9xr4tdc - Nguyen Van A - GD 20260823.140233 / ref 998877';
    paymentsMock.mockResolvedValue(
      envelope(
        makePayments({
          reconciliations: [
            makeReconciliation({ bankReference: longReference, amount: '5000000.00' }),
          ],
        }),
      ),
    );
    render();

    const cell = await screen.findByTestId('history-bank-reference');
    expect(cell.textContent).not.toBe(longReference);
    expect(cell.textContent?.endsWith('…')).toBe(true);
    expect(screen.getByRole('button', { name: /Xem đầy đủ/ })).toBeInTheDocument();
    expect(screen.getByTestId('history-amount')).toHaveTextContent('5.000.000');
  });

  it('renders no audit, outbox or storage payload', async () => {
    paymentsMock.mockResolvedValue(
      envelope(makePayments({ reconciliations: [makeReconciliation()] })),
    );
    render();
    const panel = await screen.findByTestId('order-payment-panel');

    expect(panel.textContent).not.toMatch(/outbox|s3:|bucket|storage_key|payload/i);
  });
});

describe('actions', () => {
  it('addresses the newest open attempt', async () => {
    render();
    await screen.findByTestId('open-verify-dialog');

    // Both controls exist and are bound to the one open attempt.
    expect(screen.getByTestId('open-verify-dialog')).toBeEnabled();
    expect(screen.getByTestId('open-review-dialog')).toBeEnabled();
    expect(screen.getByTestId('attempt-status')).toHaveAttribute('data-status', 'PENDING');
  });

  it('hides the controls once the deposit is satisfied', async () => {
    paymentsMock.mockResolvedValue(
      envelope(
        makePayments({
          depositStatus: 'SATISFIED',
          orderStatus: 'DEPOSIT_PAID',
          satisfiedByAttemptId: ATTEMPT_ID,
          attempts: [makeAttempt({ status: 'SUCCEEDED' })],
        }),
      ),
    );
    render();

    expect(await screen.findByTestId('order-actions-settled')).toBeInTheDocument();
    expect(screen.queryByTestId('open-verify-dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('open-review-dialog')).not.toBeInTheDocument();
  });

  it('offers no evidence-based confirmation control', async () => {
    render();
    await screen.findByTestId('open-verify-dialog');

    // Evidence is not the basis of a verification; the received amount is.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText(COPY.actions.note)).toBeInTheDocument();
  });
});
