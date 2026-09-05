/**
 * `/truy-cap/don-hang` — the secure Ready-Made order surface (`APP12-S03` §40,
 * §41).
 *
 * The eight approved variants driven through a real render, plus the secrecy
 * and truth-separation proofs that only a mounted component can make.
 *
 * Several assertions are made against the **whole rendered document** rather
 * than against a selector, because the claim is "nowhere on this page" — no
 * tracking, no derived total, no token, no payment-success wording — and a
 * scoped query would pass while the string sat somewhere else.
 *
 * `publicSecureLinkResolve` is mocked alongside the real calls purely so the
 * suite can assert it is never reached: chaining it in front of `APP12-B04`'s
 * read would authorize the same credential twice (§7).
 *
 * jsdom implements neither `createObjectURL` nor `revokeObjectURL`, so both are
 * installed as spies — which is convenient, because the QR case needs to
 * observe that the rendered image came from the blob the operation returned.
 */
import {
  ReadyMadeOrderAccessResponseStatus,
  publicOrderDepositEvidenceStatus,
  publicOrderDepositEvidenceUpload,
  publicOrderFullPaymentCurrent,
  publicOrderFullPaymentInitiate,
  publicOrderFullPaymentQr,
  publicReadyMadeOrderCurrent,
  publicSecureLinkResolve,
} from '@embroidery/api-client';
import { fireEvent, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';

import { SECURE_LINK_COPY } from '../../src/features/secure-link-access/model/secure-link-copy';
import { ORDER_ACCESS_COPY as COPY } from '../../src/features/secure-ready-made-order/model/order-access-copy';
import { MAX_EVIDENCE_PER_ATTEMPT } from '../../src/features/secure-ready-made-order/model/transfer-evidence';
import { SecureOrderScreen } from '../../src/features/secure-ready-made-order/ui/secure-order-screen';
import {
  ATTEMPT_ID,
  CORRECTED_FULL_DISPLAY,
  FULL_PAYMENT_DISPLAY,
  ORDER_CODE,
  TRANSFER_REFERENCE,
  makeAttempt,
  makeAwaitingFee,
  makeCancelled,
  makeCorrectedFullPayment,
  makeEvidenceItem,
  makeEvidenceList,
  makeExpired,
  makeFullPayment,
  makeFulfilment,
  makeImageFile,
  makeOrder,
  navigateToOrderAccess,
} from '../support/secure-ready-made-order-fixture';
import { SHORT_TOKEN, TEST_TOKEN, apiFailure, envelopeOf } from '../support/secure-link-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicReadyMadeOrderCurrent: jest.fn(),
  publicOrderFullPaymentCurrent: jest.fn(),
  publicOrderFullPaymentInitiate: jest.fn(),
  publicOrderFullPaymentQr: jest.fn(),
  publicOrderDepositEvidenceStatus: jest.fn(),
  publicOrderDepositEvidenceUpload: jest.fn(),
  publicSecureLinkResolve: jest.fn(),
}));

const orderMock = publicReadyMadeOrderCurrent as jest.MockedFunction<
  typeof publicReadyMadeOrderCurrent
>;
const fullMock = publicOrderFullPaymentCurrent as jest.MockedFunction<
  typeof publicOrderFullPaymentCurrent
>;
const initiateMock = publicOrderFullPaymentInitiate as jest.MockedFunction<
  typeof publicOrderFullPaymentInitiate
>;
const qrMock = publicOrderFullPaymentQr as jest.MockedFunction<typeof publicOrderFullPaymentQr>;
const evidenceStatusMock = publicOrderDepositEvidenceStatus as jest.MockedFunction<
  typeof publicOrderDepositEvidenceStatus
>;
const evidenceUploadMock = publicOrderDepositEvidenceUpload as jest.MockedFunction<
  typeof publicOrderDepositEvidenceUpload
>;
const resolveMock = publicSecureLinkResolve as jest.MockedFunction<typeof publicSecureLinkResolve>;

const OBJECT_URL = 'blob:secure-ready-made-order/qr-1';

/**
 * Every carrier and tracking fact the Admin side stores.
 *
 * None of them is on `ReadyMadeOrderAccessResponse`, so none can reach the page.
 * The list is asserted absent anyway, because §28 and §53 are product promises
 * and a future edit that widened the projection must fail here rather than ship.
 */
const FORBIDDEN_LOGISTICS = ['carrier', 'tracking', 'mã vận đơn', 'đơn vị giao', 'theo dõi đơn'];

beforeEach(() => {
  jest.clearAllMocks();
  navigateToOrderAccess(`#t=${TEST_TOKEN}`);
  orderMock.mockResolvedValue(envelopeOf(makeOrder()));
  fullMock.mockResolvedValue(envelopeOf(makeFullPayment()));
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
  return renderWithProviders(<SecureOrderScreen />);
}

/**
 * Waits for the authorized branch, whichever variant it settles on.
 *
 * The `h1` is state-aware since `APP12-V02` §17.1 (`V01-UX-012`): the page used
 * to be headed `Thanh toán đơn hàng` in all nine states, including the four in
 * which there is nothing left to pay. So the wait is for *any* level-1 heading
 * the catalog can produce rather than for one fixed string — which is also what
 * makes this helper usable from the terminal-state cases below.
 */
async function renderAuthorized() {
  const result = renderScreen();
  const headings = Object.values(COPY.headings);
  await screen.findByRole('heading', {
    level: 1,
    name: (name: string) => headings.includes(name),
  });
  return result;
}

/**
 * The file input's accessible name.
 *
 * `APP12-V02` §18 split the tile's one string in two: the quota is fine print
 * above the control and the control itself carries the verb. The native chrome
 * used to supply that verb — `Choose File`, in English, on a Vietnamese payment
 * surface (`V01-UX-014`) — and the input is clipped behind its label now.
 *
 * What this suite asserts is unchanged and is the property that matters: the
 * input is still reachable *by its label*, which is only true while it is a
 * real, labelled, focusable file input rather than a styled `<div>`.
 */
function evidenceLabel(): string {
  return COPY.evidence.chooseAction;
}

/** The quota, still stated — now as fine print rather than as the control. */
function evidenceQuotaText(): string {
  return `${COPY.evidence.choosePrefix} ${MAX_EVIDENCE_PER_ATTEMPT}${COPY.evidence.chooseSuffix}`;
}

/** Opens the transfer details the way a customer does: one press, one button. */
async function openInstructions() {
  const result = await renderAuthorized();
  fireEvent.click(await screen.findByRole('button', { name: COPY.attempt.start }));
  await screen.findByRole('heading', { level: 2, name: COPY.transfer.title });
  return result;
}

// ---------------------------------------------------------------------------
// The secure carrier
// ---------------------------------------------------------------------------

describe('secure link — the credential and its one carrier (§41)', () => {
  it('strips the fragment before the first request leaves', async () => {
    let hashWhenObserved = 'not-called';
    orderMock.mockImplementation(() => {
      hashWhenObserved = window.location.hash;
      return Promise.resolve(envelopeOf(makeOrder()));
    });

    await renderAuthorized();

    // The address bar is already clean at the moment the request is made — not
    // afterwards, and not by the time the assertion runs.
    expect(hashWhenObserved).toBe('');
    expect(window.location.hash).toBe('');
  });

  it('never chains the resolver in front of the authorized read (§7)', async () => {
    await renderAuthorized();
    expect(resolveMock).not.toHaveBeenCalled();
    expect(orderMock).toHaveBeenCalledTimes(1);
  });

  it('sends the token in a request body, never in a URL or a header', async () => {
    await renderAuthorized();
    const [body, config] = orderMock.mock.calls[0] ?? [];
    expect(body).toEqual({ token: TEST_TOKEN });
    expect(JSON.stringify(config ?? {})).not.toContain(TEST_TOKEN);
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/truy-cap/don-hang');
  });

  it('leaves the token in no storage, no history state and no DOM node', async () => {
    await renderAuthorized();

    expect(window.localStorage.getItem('token')).toBeNull();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(JSON.stringify(window.history.state)).not.toContain(TEST_TOKEN);
    expect(document.documentElement.outerHTML).not.toContain(TEST_TOKEN);
    expect(document.cookie).not.toContain(TEST_TOKEN);
  });

  it('makes no request at all for a malformed fragment, and shows the same card', async () => {
    // A malformed fragment never reaches the server, which is the point: if a
    // syntactically bad token looked different from a revoked one, fragment
    // syntax would become a probe (§10).
    navigateToOrderAccess(`#t=${SHORT_TOKEN}`);
    renderScreen();

    await screen.findByRole('heading', { name: SECURE_LINK_COPY.unavailable.title });
    expect(orderMock).not.toHaveBeenCalled();
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it('renders one indistinguishable unavailable card for a refused token', async () => {
    orderMock.mockRejectedValue(apiFailure(404, 'SECURE_LINK_UNAVAILABLE'));
    renderScreen();

    await screen.findByRole('heading', { name: SECURE_LINK_COPY.unavailable.title });
    // No cause-specific wording: not expired, not revoked, not wrong order.
    const page = document.body.textContent ?? '';
    expect(page).not.toMatch(/hết hạn liên kết|thu hồi|sai đơn|không hợp lệ/i);
    expect(page).not.toContain(ORDER_CODE);
  });
});

// ---------------------------------------------------------------------------
// The eight variants
// ---------------------------------------------------------------------------

describe('AWAITING_SHIPPING_FEE (§17)', () => {
  beforeEach(() => {
    orderMock.mockResolvedValue(envelopeOf(makeAwaitingFee()));
  });

  it('shows no total, no QR and no initiation, and says the fee is pending', async () => {
    await renderAuthorized();

    expect(screen.getByText(COPY.states.AWAITING_SHIPPING_FEE.pill)).toBeInTheDocument();
    expect(screen.getByText(COPY.amount.pendingFee)).toBeInTheDocument();
    expect(screen.queryByText(FULL_PAYMENT_DISPLAY)).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: COPY.qr.alt })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: COPY.attempt.start })).not.toBeInTheDocument();
  });

  it('reads no obligation at all, so no predictable 404 is spent (§14)', async () => {
    await renderAuthorized();
    expect(fullMock).not.toHaveBeenCalled();
    expect(qrMock).not.toHaveBeenCalled();
    expect(initiateMock).not.toHaveBeenCalled();
    expect(evidenceStatusMock).not.toHaveBeenCalled();
  });

  it('prints no zero fee — absent is not free', async () => {
    await renderAuthorized();
    expect(screen.queryByText(COPY.amount.feeLabel)).not.toBeInTheDocument();
    // The digit boundary matters: the subtotal row legitimately ends in
    // `…000 VND`. What must never appear is a standalone zero fee.
    expect(document.body.textContent ?? '').not.toMatch(/(?<![\d.])0\s*VND/);
  });
});

describe('AWAITING_PAYMENT (§15, §18, §19)', () => {
  it('shows the exact obligation figure with its two supporting rows', async () => {
    await renderAuthorized();

    expect(screen.getByText(COPY.states.AWAITING_PAYMENT.pill)).toBeInTheDocument();
    // Awaited: the obligation is a second read, issued only once the projection
    // reports the order payable.
    expect(await screen.findByText(FULL_PAYMENT_DISPLAY)).toBeInTheDocument();
    expect(screen.getByText(COPY.amount.merchandiseLabel)).toBeInTheDocument();
    expect(screen.getByText(COPY.amount.feeLabel)).toBeInTheDocument();
  });

  it('reads the obligation, and offers the initiation without firing it', async () => {
    await renderAuthorized();

    expect(fullMock).toHaveBeenCalledTimes(1);
    // §19: no initiation on mount. The customer presses the control.
    expect(initiateMock).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: COPY.attempt.start })).toBeEnabled();
  });

  it('opens one attempt per activation, with a server-derived body', async () => {
    await openInstructions();

    expect(initiateMock).toHaveBeenCalledTimes(1);
    const [body, config] = initiateMock.mock.calls[0] ?? [];
    // §19, §25: no client-supplied amount, reference, obligation kind or order.
    expect(body).toEqual({ token: TEST_TOKEN });
    const headers = (config as { config?: { headers?: Record<string, string> } })?.config?.headers;
    expect(headers?.['Idempotency-Key']).toEqual(expect.any(String));
  });

  it('renders the QR, the bank details and the textual fallback together', async () => {
    await openInstructions();

    // Exactly one QR panel is mounted. Two would put two identical images in the
    // accessibility tree and two download buttons in the tab order, whatever the
    // stylesheet then hid.
    const image = await screen.findByRole('img', { name: COPY.qr.alt });
    expect(image).toHaveAttribute('src', OBJECT_URL);
    expect(screen.getAllByRole('img', { name: COPY.qr.alt })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: COPY.qr.download })).toHaveLength(1);
    // §57 — every datum the code encodes is also printed as text.
    expect(screen.getByText(TRANSFER_REFERENCE)).toBeInTheDocument();
    expect(screen.getByText(COPY.qr.hint)).toBeInTheDocument();
  });

  it('never claims the payment is verified, however far the customer gets', async () => {
    await openInstructions();
    const page = document.body.textContent ?? '';
    expect(page).toContain(COPY.qr.truth);
    expect(page).not.toMatch(/đã thanh toán thành công|thanh toán hoàn tất|đã nhận tiền/i);
  });
});

describe('PAYMENT_UNDER_REVIEW (§12C, §13, §22)', () => {
  it('is reached only from a real attempt, and keeps the instructions on screen', async () => {
    await renderAuthorized();
    // Before the attempt the page is plainly AWAITING_PAYMENT.
    expect(screen.getByText(COPY.states.AWAITING_PAYMENT.pill)).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: COPY.attempt.start }));

    expect(await screen.findByText(COPY.states.PAYMENT_UNDER_REVIEW.pill)).toBeInTheDocument();
    // `911:328` — the instructions do not disappear when the pill changes.
    expect(
      screen.getByRole('heading', { level: 2, name: COPY.transfer.title }),
    ).toBeInTheDocument();
  });

  it('invents no order state — the server is still told nothing new', async () => {
    await openInstructions();
    // §13: the client owns no lifecycle. Only the delivered calls were made, and
    // none of them carries a status the browser chose.
    for (const call of initiateMock.mock.calls) {
      expect(JSON.stringify(call[0])).not.toMatch(/PAYMENT_UNDER_REVIEW|EXPIRED|PAID/);
    }
  });
});

describe('READY_FOR_DELIVERY, DELIVERED, COMPLETED (§28, §30, §53)', () => {
  it.each([
    [ReadyMadeOrderAccessResponseStatus.READY_FOR_DELIVERY, 'READY_FOR_DELIVERY'],
    [ReadyMadeOrderAccessResponseStatus.DELIVERED, 'DELIVERED'],
    [ReadyMadeOrderAccessResponseStatus.COMPLETED, 'COMPLETED'],
  ] as const)('renders %s with no payment action left', async (status, variant) => {
    orderMock.mockResolvedValue(envelopeOf(makeFulfilment(status)));
    await renderAuthorized();

    expect(screen.getByText(COPY.states[variant].pill)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: COPY.attempt.start })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: COPY.qr.alt })).not.toBeInTheDocument();
    expect(qrMock).not.toHaveBeenCalled();
    expect(fullMock).not.toHaveBeenCalled();
  });

  it('shows no tracking UI on a delivered order', async () => {
    orderMock.mockResolvedValue(
      envelopeOf(makeFulfilment(ReadyMadeOrderAccessResponseStatus.DELIVERED)),
    );
    await renderAuthorized();

    const page = (document.body.textContent ?? '').toLowerCase();
    for (const forbidden of FORBIDDEN_LOGISTICS) {
      expect(page).not.toContain(forbidden);
    }
  });

  it('drops the reservation deadline once no live reservation stands', async () => {
    orderMock.mockResolvedValue(
      envelopeOf(makeFulfilment(ReadyMadeOrderAccessResponseStatus.READY_FOR_DELIVERY)),
    );
    await renderAuthorized();
    expect(screen.queryByText(new RegExp(COPY.deadline.prefix))).not.toBeInTheDocument();
  });
});

describe('CANCELLED and EXPIRED (§29, §30)', () => {
  it('renders a generic cancellation when no reason was recorded', async () => {
    orderMock.mockResolvedValue(envelopeOf(makeCancelled()));
    await renderAuthorized();

    expect(screen.getByText(COPY.states.CANCELLED.pill)).toBeInTheDocument();
    expect(screen.queryByText(COPY.states.EXPIRED.pill)).not.toBeInTheDocument();
    expect(screen.getByText(COPY.states.CANCELLED.body)).toBeInTheDocument();
  });

  it('renders the expiry variant from terminationReason alone', async () => {
    orderMock.mockResolvedValue(envelopeOf(makeExpired()));
    await renderAuthorized();

    expect(screen.getByText(COPY.states.EXPIRED.pill)).toBeInTheDocument();
    expect(screen.queryByText(COPY.states.CANCELLED.pill)).not.toBeInTheDocument();
  });

  it.each([
    ['cancelled', makeCancelled],
    ['expired', makeExpired],
  ])('offers no payable control on a %s order', async (_label, make) => {
    orderMock.mockResolvedValue(envelopeOf(make()));
    await renderAuthorized();

    expect(screen.queryByRole('button', { name: COPY.attempt.start })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: COPY.qr.alt })).not.toBeInTheDocument();
    expect(qrMock).not.toHaveBeenCalled();
    expect(initiateMock).not.toHaveBeenCalled();
    expect(evidenceUploadMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Fee correction, evidence, and the two facts about time
// ---------------------------------------------------------------------------

describe('fee correction — stale attempt isolation (§24)', () => {
  it('follows the successor obligation and strands the predecessor’s attempt', async () => {
    await openInstructions();
    expect(screen.getByText(FULL_PAYMENT_DISPLAY)).toBeInTheDocument();

    // An operator corrects the fee. The next read of the obligation answers with
    // the recomposed figure; the order projection's two rows are unchanged, so a
    // screen that summed them would still print the old total.
    fullMock.mockResolvedValue(envelopeOf(makeCorrectedFullPayment()));
    fireEvent.focus(window);

    await waitFor(() => {
      expect(screen.getByText(CORRECTED_FULL_DISPLAY)).toBeInTheDocument();
    });
    expect(screen.queryByText(FULL_PAYMENT_DISPLAY)).not.toBeInTheDocument();
    // The stale attempt is not presented as the successor's, and the customer is
    // told the amount moved.
    expect(screen.getByText(COPY.attempt.superseded)).toBeInTheDocument();
  });

  it('does not migrate the predecessor’s evidence onto the successor', async () => {
    evidenceStatusMock.mockResolvedValue(envelopeOf(makeEvidenceList([makeEvidenceItem()])));
    await openInstructions();
    await waitFor(() => expect(evidenceStatusMock).toHaveBeenCalled());
    const before = evidenceStatusMock.mock.calls.length;

    fullMock.mockResolvedValue(envelopeOf(makeCorrectedFullPayment()));
    fireEvent.focus(window);
    await waitFor(() => expect(screen.getByText(CORRECTED_FULL_DISPLAY)).toBeInTheDocument());

    // No further evidence read is issued against the stranded attempt, and the
    // intake is not offered for it either.
    expect(evidenceStatusMock.mock.calls.length).toBe(before);
    for (const [body] of evidenceStatusMock.mock.calls) {
      expect(body).toEqual({ accessToken: TEST_TOKEN, attemptId: ATTEMPT_ID });
    }
  });
});

describe('transfer evidence — truth separation (§21, §22, §23)', () => {
  it('binds every evidence call to the attempt this session opened', async () => {
    await openInstructions();
    await waitFor(() => expect(evidenceStatusMock).toHaveBeenCalled());

    expect(evidenceStatusMock).toHaveBeenCalledWith(
      { accessToken: TEST_TOKEN, attemptId: ATTEMPT_ID },
      expect.anything(),
    );
  });

  it('offers no intake before an attempt exists', async () => {
    await renderAuthorized();
    expect(screen.queryByLabelText(evidenceLabel())).not.toBeInTheDocument();
    expect(screen.queryByText(evidenceQuotaText())).not.toBeInTheDocument();
    expect(evidenceStatusMock).not.toHaveBeenCalled();
  });

  it('uploads through the delivered attempt-scoped operation', async () => {
    evidenceUploadMock.mockResolvedValue(
      envelopeOf({ evidenceId: 'e-1', assetStatus: 'UPLOADED' }) as never,
    );
    await openInstructions();

    const input = await screen.findByLabelText(evidenceLabel());
    fireEvent.change(input, { target: { files: [makeImageFile()] } });

    await waitFor(() => expect(evidenceUploadMock).toHaveBeenCalledTimes(1));
    const [body] = evidenceUploadMock.mock.calls[0] ?? [];
    expect(body).toMatchObject({ accessToken: TEST_TOKEN, attemptId: ATTEMPT_ID });
  });

  it('never lets an accepted image read as a verified payment', async () => {
    evidenceStatusMock.mockResolvedValue(
      envelopeOf(makeEvidenceList([makeEvidenceItem({ assetStatus: 'ACCEPTED' })])),
    );
    await openInstructions();

    expect(await screen.findByText(COPY.evidenceStatus.ACCEPTED.label)).toBeInTheDocument();
    const page = document.body.textContent ?? '';
    expect(page).toContain(COPY.evidence.truth);
    expect(page).not.toMatch(/đã thanh toán thành công|thanh toán hoàn tất/i);
    // The order pill is still the waiting one; an image moved nothing.
    expect(screen.getByText(COPY.states.PAYMENT_UNDER_REVIEW.pill)).toBeInTheDocument();
  });
});

describe('deadline and access expiry are different facts (§25)', () => {
  it('labels each with its own sentence, and neither as the other', async () => {
    await renderAuthorized();

    expect(screen.getByText(new RegExp(COPY.deadline.prefix))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(COPY.access.expiryPrefix))).toBeInTheDocument();
    expect(COPY.deadline.prefix).not.toBe(COPY.access.expiryPrefix);
  });

  it('shows no countdown — nothing on this route re-renders because time passed', async () => {
    await renderAuthorized();
    expect(document.body.textContent ?? '').not.toMatch(/còn \d+|\d+ giây|\d+ phút nữa/);
  });
});

describe('mid-session secure-link death (§31)', () => {
  it('clears every authorized fact from the screen, not just the failing call', async () => {
    initiateMock.mockRejectedValue(apiFailure(404, 'SECURE_LINK_UNAVAILABLE'));
    await renderAuthorized();
    expect(screen.getByText(ORDER_CODE, { exact: false })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: COPY.attempt.start }));

    await screen.findByRole('heading', { name: SECURE_LINK_COPY.unavailable.title });
    const page = document.body.textContent ?? '';
    expect(page).not.toContain(ORDER_CODE);
    expect(page).not.toContain(FULL_PAYMENT_DISPLAY);
    expect(page).not.toContain(TRANSFER_REFERENCE);
  });
});

describe('accessibility (§38)', () => {
  it('renders exactly one h1, and the shell announces the settled state', async () => {
    await renderAuthorized();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    // Two polite regions announce it — the shell's and the content's — which is
    // the composition APP4 established and not a duplicate heading.
    expect(screen.getAllByText(COPY.live.authorized).length).toBeGreaterThan(0);
  });

  it('names every copy control by the field it copies', async () => {
    await openInstructions();
    expect(screen.getByRole('button', { name: COPY.copy.accountNumber })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: COPY.copy.reference })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: COPY.copy.amount })).toBeInTheDocument();
  });

  it('states the status in words, never by colour alone', async () => {
    orderMock.mockResolvedValue(envelopeOf(makeExpired()));
    await renderAuthorized();
    // The pill's text carries the whole meaning; the symbol is decorative.
    expect(screen.getByText(COPY.states.EXPIRED.pill)).toBeInTheDocument();
  });
});
