/**
 * `/truy-cap/thanh-toan` — the access states, the deposit facts and the attempt
 * lifecycle (`APP7-S01` §5, §6, §7, §11, §19, §20, §22, §23).
 *
 * The assertion that matters most is not "the right card rendered" but **when
 * the request left**: every test that expects a POST also proves the address bar
 * was already clean at the moment it was issued. That ordering is the whole
 * security argument, so it is captured from the mock at call time rather than
 * inspected afterwards, when it would be true for the wrong reason.
 *
 * `publicSecureLinkResolve` is mocked alongside the real calls purely so the
 * suite can assert it is never reached: chaining B06 in front of B03 would
 * authorize the same credential twice and is a mistake this file exists to
 * catch.
 */
import {
  DepositAttemptResponseStatus,
  publicOrderDepositCurrent,
  publicOrderDepositEvidenceStatus,
  publicOrderDepositInitiate,
  publicOrderDepositQr,
  publicSecureLinkResolve,
} from '@embroidery/api-client';
import { fireEvent, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';

import { SECURE_LINK_COPY } from '../../src/features/secure-link-access/model/secure-link-copy';
import { SECURE_DEPOSIT_COPY as COPY } from '../../src/features/secure-deposit-payment/model/secure-deposit-copy';
import { SecureDepositScreen } from '../../src/features/secure-deposit-payment/ui/secure-deposit-screen';
import {
  ACCOUNT_NUMBER,
  DEPOSIT_AMOUNT,
  ORDER_CODE,
  TRANSFER_REFERENCE,
  makeAttempt,
  makeDeposit,
  makeEvidenceList,
  makeVerifiedDeposit,
  navigateToDeposit,
} from '../support/secure-deposit-fixture';
import {
  OUT_OF_ALPHABET_TOKEN,
  SHORT_TOKEN,
  TEST_TOKEN,
  apiFailure,
  envelopeOf,
  networkFailure,
} from '../support/secure-link-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicOrderDepositCurrent: jest.fn(),
  publicOrderDepositInitiate: jest.fn(),
  publicOrderDepositQr: jest.fn(),
  publicOrderDepositEvidenceStatus: jest.fn(),
  publicOrderDepositEvidenceUpload: jest.fn(),
  publicSecureLinkResolve: jest.fn(),
}));

const currentMock = publicOrderDepositCurrent as jest.MockedFunction<
  typeof publicOrderDepositCurrent
>;
const initiateMock = publicOrderDepositInitiate as jest.MockedFunction<
  typeof publicOrderDepositInitiate
>;
const qrMock = publicOrderDepositQr as jest.MockedFunction<typeof publicOrderDepositQr>;
const evidenceMock = publicOrderDepositEvidenceStatus as jest.MockedFunction<
  typeof publicOrderDepositEvidenceStatus
>;
const resolveMock = publicSecureLinkResolve as jest.MockedFunction<typeof publicSecureLinkResolve>;

/** What `location`/`history` looked like each time the API was called. */
interface CallSite {
  readonly hash: string;
  readonly href: string;
  readonly historyState: unknown;
  readonly token: string;
  readonly idempotencyKey: unknown;
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const callSites: CallSite[] = [];

function record(token: string, idempotencyKey?: unknown): void {
  callSites.push({
    hash: window.location.hash,
    href: window.location.href,
    historyState: window.history.state,
    token,
    idempotencyKey,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  callSites.length = 0;
  navigateToDeposit('');
  qrMock.mockRejectedValue(networkFailure());
  evidenceMock.mockResolvedValue(envelopeOf(makeEvidenceList()));
});

function renderScreen() {
  return renderWithProviders(<SecureDepositScreen />);
}

describe('APP7-S01 — the secure route reuses the delivered shell', () => {
  it('reads the deposit with the fragment token, after the URL is already clean', async () => {
    currentMock.mockImplementation((body) => {
      record(body.token);
      return Promise.resolve(envelopeOf(makeDeposit()));
    });
    navigateToDeposit(`#t=${TEST_TOKEN}`);

    renderScreen();

    await screen.findByRole('heading', { level: 1, name: COPY.instructions.title });
    expect(callSites).toHaveLength(1);
    const [site] = callSites;
    expect(site?.token).toBe(TEST_TOKEN);
    // The strip happened before the request function was ever invoked.
    expect(site?.hash).toBe('');
    expect(site?.href).not.toContain(TEST_TOKEN);
    expect(JSON.stringify(site?.historyState ?? null)).not.toContain(TEST_TOKEN);
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it.each([
    ['no fragment', ''],
    ['a short token', `#t=${SHORT_TOKEN}`],
    ['an out-of-alphabet token', `#t=${OUT_OF_ALPHABET_TOKEN}`],
    ['a different key', `#token=${TEST_TOKEN}`],
  ])('renders the one unavailable card for %s, and makes no request', async (_label, fragment) => {
    navigateToDeposit(fragment);

    renderScreen();

    await screen.findByRole('heading', { level: 1, name: SECURE_LINK_COPY.unavailable.title });
    expect(currentMock).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });

  it('reuses the transient card, with its one manual retry, for a lost request', async () => {
    currentMock.mockRejectedValueOnce(networkFailure());
    currentMock.mockResolvedValueOnce(envelopeOf(makeDeposit()));
    navigateToDeposit(`#t=${TEST_TOKEN}`);

    renderScreen();

    await screen.findByRole('heading', { level: 1, name: SECURE_LINK_COPY.transientError.title });
    expect(currentMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: SECURE_LINK_COPY.transientError.retry }));

    await screen.findByRole('heading', { level: 1, name: COPY.instructions.title });
    expect(currentMock).toHaveBeenCalledTimes(2);
  });

  it('never renders the raw credential anywhere in the authorized document', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeDeposit()));
    navigateToDeposit(`#t=${TEST_TOKEN}`);

    const { container } = renderScreen();

    await screen.findByRole('heading', { level: 1, name: COPY.instructions.title });
    expect(container.innerHTML).not.toContain(TEST_TOKEN);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe('APP7-S01 — the deposit facts are the server’s, unedited', () => {
  beforeEach(() => {
    currentMock.mockResolvedValue(envelopeOf(makeDeposit()));
    navigateToDeposit(`#t=${TEST_TOKEN}`);
  });

  it('opens on the before-initiation frame with the obligation’s own amount', async () => {
    renderScreen();

    await screen.findByText(COPY.preAttempt.startTitle);
    expect(screen.getByText(ORDER_CODE)).toBeInTheDocument();
    expect(screen.getByText('5.100.000 VND')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: COPY.preAttempt.startAction })).toBeEnabled();
  });

  it('shows no order total and no percentage, so nothing could have been derived', async () => {
    const { container } = renderScreen();

    await screen.findByText(COPY.preAttempt.startTitle);
    // 40 % of 12.750.000 is the figure a screen that recomputed would print.
    expect(container.textContent).not.toContain('40%');
    expect(container.textContent).not.toContain('12.750.000');
  });

  it('renders the amount, reference and account as text with no editable control', async () => {
    initiateMock.mockResolvedValue(envelopeOf(makeAttempt()));
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: COPY.preAttempt.startAction }));
    await screen.findByText(COPY.instructions.panelTitle);

    expect(screen.getByText(TRANSFER_REFERENCE)).toBeInTheDocument();
    expect(screen.getByText(ACCOUNT_NUMBER)).toBeInTheDocument();
    // No input, textarea or contenteditable carries a payment fact: the values
    // are `dd` and `span` text, which is a stronger guarantee than `readOnly`.
    for (const input of screen.queryAllByRole('textbox')) {
      expect(input).not.toHaveValue(TRANSFER_REFERENCE);
      expect(input).not.toHaveValue(DEPOSIT_AMOUNT);
    }
  });

  it('copies the exact server strings, unnormalized', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    initiateMock.mockResolvedValue(envelopeOf(makeAttempt()));
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: COPY.preAttempt.startAction }));
    await screen.findByText(COPY.instructions.panelTitle);

    fireEvent.click(screen.getByRole('button', { name: COPY.copy.amount }));
    fireEvent.click(screen.getByRole('button', { name: COPY.copy.reference }));
    fireEvent.click(screen.getByRole('button', { name: COPY.copy.accountNumber }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(3));
    expect(writeText).toHaveBeenNthCalledWith(1, DEPOSIT_AMOUNT);
    expect(writeText).toHaveBeenNthCalledWith(2, TRANSFER_REFERENCE);
    expect(writeText).toHaveBeenNthCalledWith(3, ACCOUNT_NUMBER);
    await screen.findByText(COPY.copy.doneReference);
  });
});

describe('APP7-S01 — opening an attempt', () => {
  beforeEach(() => {
    currentMock.mockResolvedValue(envelopeOf(makeDeposit()));
    navigateToDeposit(`#t=${TEST_TOKEN}`);
  });

  it('opens none on mount: the route is not a reason to touch payment state', async () => {
    renderScreen();

    await screen.findByText(COPY.preAttempt.startTitle);
    expect(initiateMock).not.toHaveBeenCalled();
    expect(qrMock).not.toHaveBeenCalled();
    expect(evidenceMock).not.toHaveBeenCalled();
  });

  it('sends the token in a body and the key in a header, and claims no payment', async () => {
    initiateMock.mockImplementation((body, options) => {
      record(body.token, options?.config?.headers);
      return Promise.resolve(envelopeOf(makeAttempt()));
    });
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: COPY.preAttempt.startAction }));
    await screen.findByText(COPY.instructions.panelTitle);

    const site = callSites.at(-1);
    expect(site?.token).toBe(TEST_TOKEN);
    expect(site?.hash).toBe('');
    const headers = site?.idempotencyKey as Record<string, string> | undefined;
    expect(headers?.['Idempotency-Key']).toMatch(UUID_SHAPE);
    // PENDING is not paid, and the screen says so in the approved words.
    expect(screen.getByText(COPY.instructions.waitingBody)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /đã chuyển khoản/i })).not.toBeInTheDocument();
    expect(screen.queryByText(COPY.confirmed.title)).not.toBeInTheDocument();
  });

  it('asks for step-up only when the server does, and never navigates away', async () => {
    initiateMock.mockRejectedValueOnce(apiFailure(403, 'REVERIFICATION_REQUIRED'));
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: COPY.preAttempt.startAction }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(COPY.stepUp.title);
    expect(window.location.pathname).toBe('/truy-cap/thanh-toan');
    // No attempt was opened by the refusal itself.
    expect(screen.queryByText(COPY.instructions.panelTitle)).not.toBeInTheDocument();
  });

  it('opens exactly one attempt when the control is activated twice in a tick', async () => {
    initiateMock.mockResolvedValue(envelopeOf(makeAttempt()));
    renderScreen();

    const start = await screen.findByRole('button', { name: COPY.preAttempt.startAction });
    fireEvent.click(start);
    fireEvent.click(start);

    await screen.findByText(COPY.instructions.panelTitle);
    expect(initiateMock).toHaveBeenCalledTimes(1);
  });

  it('reports a conflict as a notice and keeps the customer on the same screen', async () => {
    initiateMock.mockRejectedValueOnce(apiFailure(409, 'DEPOSIT_NOT_PAYABLE'));
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: COPY.preAttempt.startAction }));

    await screen.findByText(COPY.initiateFailure.DEPOSIT_NOT_PAYABLE);
    expect(screen.getByText(COPY.preAttempt.startTitle)).toBeInTheDocument();
  });

  it('replaces the screen with the indistinguishable unavailable card on a 404', async () => {
    initiateMock.mockRejectedValueOnce(apiFailure(404, 'SECURE_LINK_UNAVAILABLE'));
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: COPY.preAttempt.startAction }));

    await screen.findByRole('heading', { level: 1, name: SECURE_LINK_COPY.unavailable.title });
  });
});

describe('APP7-S01 — the customer-safe attempt states', () => {
  beforeEach(() => {
    currentMock.mockResolvedValue(envelopeOf(makeDeposit()));
    navigateToDeposit(`#t=${TEST_TOKEN}`);
  });

  async function openAttemptAt(status: DepositAttemptResponseStatus) {
    initiateMock.mockResolvedValue(envelopeOf(makeAttempt({ status })));
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: COPY.preAttempt.startAction }));
  }

  it('shows the reconciliation state without a single internal detail', async () => {
    await openAttemptAt(DepositAttemptResponseStatus.REQUIRES_REVIEW);

    const title = await screen.findByText(COPY.review.title);
    const page = title.closest('section')?.parentElement;
    const text = page?.textContent ?? '';
    for (const leak of ['ghi chú', 'lý do', 'quan sát', 'nhân viên', 'đối chiếu nội bộ']) {
      expect(text.toLowerCase()).not.toContain(leak);
    }
    expect(screen.queryByText(COPY.confirmed.title)).not.toBeInTheDocument();
  });

  it.each([DepositAttemptResponseStatus.FAILED, DepositAttemptResponseStatus.EXPIRED])(
    'offers a new attempt for %s, and never resets the old one',
    async (status) => {
      await openAttemptAt(status);

      await screen.findByText(COPY.terminal.warning);
      const again = screen.getByRole('button', { name: COPY.terminal.action });

      initiateMock.mockResolvedValue(envelopeOf(makeAttempt()));
      fireEvent.click(again);

      await screen.findByText(COPY.instructions.panelTitle);
      // Two initiations, and the second carried a *different* key — which is
      // what makes it a new attempt rather than a replay of a dead one.
      expect(initiateMock).toHaveBeenCalledTimes(2);
      const keyOf = (index: number): unknown => {
        const headers = initiateMock.mock.calls[index]?.[1]?.config?.headers;
        return (headers as Record<string, unknown> | undefined)?.['Idempotency-Key'];
      };
      expect(keyOf(0)).not.toBe(keyOf(1));
    },
  );

  it('shows an undrawn contract value neutrally instead of guessing at it', async () => {
    await openAttemptAt(DepositAttemptResponseStatus.PROCESSING);

    await screen.findByText(COPY.undrawn.title);
    // Twice on purpose: once as the neutral badge, once as the labelled code row.
    expect(screen.getAllByText('PROCESSING')).toHaveLength(2);
    expect(screen.queryByText(COPY.confirmed.title)).not.toBeInTheDocument();
    expect(screen.queryByText(COPY.terminal.title)).not.toBeInTheDocument();
  });
});

describe('APP7-S01 — the confirmation is server truth or nothing', () => {
  it('renders on the verified deposit read alone, with no attempt in hand', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeVerifiedDeposit()));
    navigateToDeposit(`#t=${TEST_TOKEN}`);

    renderScreen();

    await screen.findByRole('heading', { level: 1, name: COPY.confirmed.title });
    expect(screen.getByText(COPY.confirmed.nextBody)).toBeInTheDocument();
    expect(initiateMock).not.toHaveBeenCalled();
  });

  it('claims no APP8 or APP9 progress', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeVerifiedDeposit()));
    navigateToDeposit(`#t=${TEST_TOKEN}`);

    const { container } = renderScreen();

    await screen.findByRole('heading', { level: 1, name: COPY.confirmed.title });
    for (const forbidden of [
      'đang sản xuất',
      'giữ tồn kho',
      'bắt đầu thêu',
      'sẵn sàng giao hàng',
      'còn lại',
      'hoàn tiền',
    ]) {
      expect((container.textContent ?? '').toLowerCase()).not.toContain(forbidden);
    }
  });

  it('re-reads the deposit once when an attempt reports SUCCEEDED, and waits for it', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeDeposit()));
    initiateMock.mockResolvedValue(
      envelopeOf(makeAttempt({ status: DepositAttemptResponseStatus.SUCCEEDED })),
    );
    navigateToDeposit(`#t=${TEST_TOKEN}`);

    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: COPY.preAttempt.startAction }));

    // The obligation is still PENDING, so no confirmation is claimed — and the
    // deposit is read exactly one more time to ask the authority.
    await screen.findByText(COPY.undrawn.title);
    await waitFor(() => expect(currentMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(COPY.confirmed.title)).not.toBeInTheDocument();
  });
});
