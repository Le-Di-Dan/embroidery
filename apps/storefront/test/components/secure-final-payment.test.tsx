/**
 * `/truy-cap/thanh-toan-con-lai` — the customer's remaining balance and the
 * order's completion status (`APP9-S01` §27).
 *
 * Nine cases, one per required proof. Two of them are about what the page
 * *cannot* show — carrier and tracking data, and a derived balance — and both
 * are asserted against the whole rendered document rather than against a
 * selector, because the claim is "nowhere on this page", not "not in this
 * element".
 *
 * `publicSecureLinkResolve` is mocked alongside the real calls purely so the
 * suite can assert it is never reached: chaining B06 in front of B02 would
 * authorize the same credential twice.
 *
 * jsdom implements neither `createObjectURL` nor `revokeObjectURL`, so both are
 * installed as spies — which is convenient, because the QR case needs to observe
 * that the rendered image came from the blob the operation returned.
 */
import {
  CustomerFinalPaymentResponseFinalPaymentStatus,
  CustomerFinalPaymentResponseOrderStatus,
  publicOrderDepositEvidenceStatus,
  publicOrderDepositEvidenceUpload,
  publicOrderFinalPaymentCurrent,
  publicOrderFinalPaymentInitiate,
  publicOrderFinalPaymentQr,
  publicSecureLinkResolve,
} from '@embroidery/api-client';
import { fireEvent, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';

import { SECURE_LINK_COPY } from '../../src/features/secure-link-access/model/secure-link-copy';
import { SECURE_FINAL_PAYMENT_COPY as COPY } from '../../src/features/secure-final-payment/model/final-payment-copy';
import { SecureFinalPaymentScreen } from '../../src/features/secure-final-payment/ui/secure-final-payment-screen';
import {
  ACCOUNT_NUMBER,
  ATTEMPT_ID,
  DERIVED_DEPOSIT,
  DERIVED_TOTAL,
  FINAL_PAYMENT_AMOUNT,
  ORDER_CODE,
  TRANSFER_REFERENCE,
  makeAttempt,
  makeEvidenceItem,
  makeEvidenceList,
  makeFinalPayment,
  makeImageFile,
  makeNotPayable,
  makeSettled,
  navigateToFinalPayment,
} from '../support/secure-final-payment-fixture';
import { SHORT_TOKEN, TEST_TOKEN, envelopeOf } from '../support/secure-link-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicOrderFinalPaymentCurrent: jest.fn(),
  publicOrderFinalPaymentInitiate: jest.fn(),
  publicOrderFinalPaymentQr: jest.fn(),
  publicOrderDepositEvidenceStatus: jest.fn(),
  publicOrderDepositEvidenceUpload: jest.fn(),
  publicSecureLinkResolve: jest.fn(),
}));

const currentMock = publicOrderFinalPaymentCurrent as jest.MockedFunction<
  typeof publicOrderFinalPaymentCurrent
>;
const initiateMock = publicOrderFinalPaymentInitiate as jest.MockedFunction<
  typeof publicOrderFinalPaymentInitiate
>;
const qrMock = publicOrderFinalPaymentQr as jest.MockedFunction<typeof publicOrderFinalPaymentQr>;
const evidenceStatusMock = publicOrderDepositEvidenceStatus as jest.MockedFunction<
  typeof publicOrderDepositEvidenceStatus
>;
const evidenceUploadMock = publicOrderDepositEvidenceUpload as jest.MockedFunction<
  typeof publicOrderDepositEvidenceUpload
>;
const resolveMock = publicSecureLinkResolve as jest.MockedFunction<typeof publicSecureLinkResolve>;

const OBJECT_URL = 'blob:secure-final-payment/qr-1';

/** The exact balance as the page must print it: grouped, never recomputed. */
const RENDERED_AMOUNT = '7.650.000';

/**
 * Every carrier and tracking fact the Admin side stores.
 *
 * None of them is on `CustomerFinalPaymentResponse`, so none can reach the page.
 * The list is asserted absent anyway, because §15 is a product promise and a
 * future edit that widened the projection must fail here rather than ship.
 */
const FORBIDDEN_LOGISTICS = [
  'carrier',
  'tracking',
  'vận chuyển',
  'đơn vị giao',
  'mã vận đơn',
  'theo dõi',
];

beforeEach(() => {
  jest.clearAllMocks();
  navigateToFinalPayment(`#t=${TEST_TOKEN}`);
  currentMock.mockResolvedValue(envelopeOf(makeFinalPayment()));
  initiateMock.mockResolvedValue(envelopeOf(makeAttempt()));
  qrMock.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  evidenceStatusMock.mockResolvedValue(envelopeOf(makeEvidenceList()));

  Object.defineProperty(URL, 'createObjectURL', {
    value: jest.fn().mockReturnValue(OBJECT_URL),
    configurable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', { value: jest.fn(), configurable: true });
});

function renderScreen() {
  return renderWithProviders(<SecureFinalPaymentScreen />);
}

/** Opens the instructions the way a customer does: one press on the one button. */
async function openInstructions() {
  const result = renderScreen();
  fireEvent.click(await screen.findByRole('button', { name: COPY.preAttempt.startAction }));
  await screen.findByRole('heading', { level: 2, name: COPY.instructions.panelTitle });
  return result;
}

describe('APP9-S01 case 1 — an unusable secure link', () => {
  it('renders the one generic unavailable card and leaks no order existence', async () => {
    // A malformed fragment never reaches the server at all, which is the point:
    // if a syntactically bad token looked different from a revoked one, fragment
    // syntax would become a probe.
    navigateToFinalPayment(`#t=${SHORT_TOKEN}`);

    const { container } = renderScreen();

    await screen.findByRole('heading', { level: 1, name: SECURE_LINK_COPY.unavailable.title });
    expect(currentMock).not.toHaveBeenCalled();
    expect(resolveMock).not.toHaveBeenCalled();
    // Nothing about an order, a balance or a bank appears — the card takes no
    // prop describing why, and there is no order in scope to describe.
    const text = container.textContent ?? '';
    expect(text).not.toContain(ORDER_CODE);
    expect(text).not.toContain(RENDERED_AMOUNT);
    expect(text).not.toContain(ACCOUNT_NUMBER);
    expect(text).not.toContain(TEST_TOKEN);
  });
});

describe('APP9-S01 case 2 — the balance is not payable', () => {
  it('offers neither QR nor initiation, and shows no figure at all', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeNotPayable()));

    const { container } = renderScreen();

    await screen.findByRole('heading', { level: 2, name: COPY.notPayable.cardTitle });
    expect(screen.getByText(COPY.notPayable.note)).toBeInTheDocument();

    // No control the server would refuse, and no request that would be refused.
    expect(
      screen.queryByRole('button', { name: COPY.preAttempt.startAction }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: COPY.qr.download })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(qrMock).not.toHaveBeenCalled();
    });
    expect(initiateMock).not.toHaveBeenCalled();

    // The read carried the true amount; the screen prints none of it.
    expect(container.textContent ?? '').not.toContain(RENDERED_AMOUNT);
    expect(container.textContent ?? '').not.toContain(ACCOUNT_NUMBER);
  });
});

describe('APP9-S01 case 3 — the balance is payable', () => {
  it('renders the exact server amount with the bank instructions, and derives nothing', async () => {
    const { container } = renderScreen();

    // Before the attempt, the frozen figure is already the anchor.
    await screen.findByRole('heading', { level: 2, name: COPY.preAttempt.summaryTitle });
    expect(screen.getAllByText(new RegExp(RENDERED_AMOUNT)).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: COPY.preAttempt.startAction }));
    await screen.findByRole('heading', { level: 2, name: COPY.instructions.panelTitle });

    const text = container.textContent ?? '';
    expect(text).toContain(RENDERED_AMOUNT);
    expect(text).toContain(ACCOUNT_NUMBER);
    expect(text).toContain(TRANSFER_REFERENCE);
    expect(text).toContain('NGAN HANG DEMO — MINH HOA');
    expect(text).toContain('CONG TY TNHH NET THEU (DEMO)');
    expect(text).toContain(ORDER_CODE);

    // No `total − deposit` anywhere: neither operand was ever on the wire, and
    // neither appears on the page in any form.
    expect(text).not.toContain(DERIVED_TOTAL);
    expect(text).not.toContain(DERIVED_DEPOSIT);
    // And no coercion of the raw decimal string into a float's rendering.
    expect(text).not.toContain('7650000');
    expect(text).not.toContain(`${FINAL_PAYMENT_AMOUNT} VND`);
  });
});

describe('APP9-S01 case 4 — the QR', () => {
  it('comes from the final-payment operation and says a transfer is not yet verified', async () => {
    const { container } = await openInstructions();

    await waitFor(() => {
      expect(qrMock).toHaveBeenCalledTimes(1);
    });
    const [qrBody] = qrMock.mock.calls[0] ?? [];
    expect(qrBody?.token).toBe(TEST_TOKEN);

    const image = await screen.findByAltText(COPY.qr.alt);
    expect(image).toHaveAttribute('src', OBJECT_URL);

    // The disclaimer is primary, inside the panel the customer is scanning from.
    expect(screen.getByText(COPY.qr.truth)).toBeInTheDocument();
    // No provider checkout, no webhook, no bank polling. One QR request, ever.
    expect(container.textContent ?? '').not.toContain('http');
    expect(qrMock).toHaveBeenCalledTimes(1);
  });
});

describe('APP9-S01 case 5 — opening one attempt', () => {
  it('calls the final-payment initiation, with an idempotency key, only when payable', async () => {
    await openInstructions();

    expect(initiateMock).toHaveBeenCalledTimes(1);
    const [initiateBody, options] = initiateMock.mock.calls[0] ?? [];
    expect(initiateBody?.token).toBe(TEST_TOKEN);
    // The key is supplied by the caller and travels as a header; there is no
    // second idempotency scheme on this route.
    expect(options?.config?.headers).toHaveProperty('Idempotency-Key');
    // The DEPOSIT lane is unreachable from this surface: no deposit operation
    // exists in this feature's transport, and the body carries no obligation.
    expect(Object.keys(initiateBody ?? {})).toEqual(['token']);
    expect(resolveMock).not.toHaveBeenCalled();
  });
});

describe('APP9-S01 case 6 — optional transfer evidence', () => {
  it('is bound to the current attempt and never says "đặt cọc"', async () => {
    evidenceStatusMock.mockResolvedValue(envelopeOf(makeEvidenceList([makeEvidenceItem()])));
    evidenceUploadMock.mockResolvedValue(
      envelopeOf({
        assetStatus: 'INSPECTING',
        byteSize: 2_516_582,
        evidenceId: '3f2504e0-4f89-41d3-9a0c-0305e82c3502',
        mediaType: 'image/jpeg',
        replayed: false,
      } as never),
    );

    const { container } = await openInstructions();

    await screen.findByRole('heading', { level: 2, name: COPY.evidence.title });
    await waitFor(() => {
      expect(evidenceStatusMock).toHaveBeenCalled();
    });
    // The attempt id came from the accepted initiation, not from anywhere else.
    const [statusBody] = evidenceStatusMock.mock.calls[0] ?? [];
    expect(statusBody?.attemptId).toBe(ATTEMPT_ID);

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input as HTMLInputElement, { target: { files: [makeImageFile()] } });

    await waitFor(() => {
      expect(evidenceUploadMock).toHaveBeenCalledTimes(1);
    });
    const [uploadBody] = evidenceUploadMock.mock.calls[0] ?? [];
    expect(uploadBody?.attemptId).toBe(ATTEMPT_ID);

    // The route is deposit-named; the screen is not. Neutral copy, and the
    // approved sentence that an image is not a confirmed payment.
    const text = container.textContent ?? '';
    expect(text).toContain(COPY.evidence.title);
    expect(text).toContain(COPY.evidence.dropzoneTitle);
    expect(text).toContain(COPY.evidence.notProof);
    expect(text.toLowerCase()).not.toContain('đặt cọc');
    expect(text.toLowerCase()).not.toContain('tiền cọc');
  });
});

describe('APP9-S01 case 7 — waiting, then verified', () => {
  it('waits on the workshop while PENDING and shows the settled state once the read says so', async () => {
    const { container, unmount } = await openInstructions();

    // Waiting: the obligation is still PENDING, so nothing claims payment and
    // there is no "I have transferred" control to claim it with.
    expect(screen.getByText(COPY.instructions.waitingBody)).toBeInTheDocument();
    expect(container.textContent ?? '').not.toContain(COPY.settled.paid.cardTitle);
    expect(screen.queryByRole('button', { name: /đã chuyển khoản/i })).not.toBeInTheDocument();
    unmount();

    // Verified: only an Admin produces this, and the read is what reports it.
    jest.clearAllMocks();
    currentMock.mockResolvedValue(envelopeOf(makeSettled()));
    navigateToFinalPayment(`#t=${TEST_TOKEN}`);
    const second = renderScreen();

    await screen.findByRole('heading', { level: 2, name: COPY.settled.paid.cardTitle });
    // Twice, and deliberately: the status pill beside the heading (`818:46`)
    // and the step the order has reached in the progress (`818:61`).
    expect(screen.getAllByText('Đang chuẩn bị giao')).toHaveLength(2);
    // No payment control survives verification, and no QR is fetched for it.
    expect(
      screen.queryByRole('button', { name: COPY.preAttempt.startAction }),
    ).not.toBeInTheDocument();
    expect(qrMock).not.toHaveBeenCalled();
    expect(second.container.textContent ?? '').toContain(COPY.order.paidRemainingLabel);
  });
});

describe('APP9-S01 case 8 — DELIVERED', () => {
  it('renders the delivered state with no carrier or tracking data of any kind', async () => {
    currentMock.mockResolvedValue(
      envelopeOf(makeSettled(CustomerFinalPaymentResponseOrderStatus.DELIVERED)),
    );

    const { container } = renderScreen();

    await screen.findByRole('heading', { level: 2, name: COPY.settled.delivered.cardTitle });
    expect(screen.getAllByText('Đã giao')).toHaveLength(2);

    const text = (container.textContent ?? '').toLowerCase();
    for (const forbidden of FORBIDDEN_LOGISTICS) {
      expect(text).not.toContain(forbidden.toLowerCase());
    }
    // No shipment timeline and no estimate: the progress is four labels.
    expect(screen.getAllByRole('listitem').length).toBe(4);
  });
});

describe('APP9-S01 case 9 — COMPLETED', () => {
  it('renders the terminal state with no refund, return or cancellation action', async () => {
    currentMock.mockResolvedValue(
      envelopeOf(makeSettled(CustomerFinalPaymentResponseOrderStatus.COMPLETED)),
    );

    const { container } = renderScreen();

    await screen.findByRole('heading', { level: 2, name: COPY.settled.completed.cardTitle });
    expect(screen.getAllByText('Hoàn tất')).toHaveLength(2);

    const text = (container.textContent ?? '').toLowerCase();
    // `PO-APP9-001 = OPTION A — DEFER`: not offered, and not a disabled stub.
    for (const forbidden of ['hoàn tiền', 'huỷ đơn', 'hủy đơn', 'đổi trả', 'trả hàng']) {
      expect(text).not.toContain(forbidden);
    }
    // The only buttons a terminal order may carry are none at all.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    // And the shipping-fee acknowledgement command is not surfaced anywhere.
    expect(text).not.toContain('phí vận chuyển');
  });
});

describe('APP9-S01 — the obligation state the package draws no frame for', () => {
  it('is shown neutrally rather than guessed at', async () => {
    currentMock.mockResolvedValue(
      envelopeOf(
        makeFinalPayment({
          finalPaymentStatus: CustomerFinalPaymentResponseFinalPaymentStatus.CANCELLED,
          payable: false,
        }),
      ),
    );

    renderScreen();

    await screen.findByRole('heading', { level: 2, name: COPY.otherState.cardTitle });
    // Neither "we will bill you later" nor "this is paid" — both would be wrong.
    expect(screen.queryByText(COPY.notPayable.body)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 2, name: COPY.settled.paid.cardTitle }),
    ).not.toBeInTheDocument();
  });
});
