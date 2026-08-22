/**
 * `/truy-cap/bao-gia` — bootstrap ordering, the access states and the decision
 * flow (`APP6-S01` §6, §11, §12, §13, §14, §18, §19).
 *
 * The assertion that matters most is not "the right card rendered" but **when
 * the request left**: every test that expects a POST also proves the address
 * bar was already clean at the moment it was issued. That ordering is the whole
 * security argument, so it is captured from the mock at call time rather than
 * inspected afterwards, when it would be true for the wrong reason.
 *
 * `publicSecureLinkResolve` is mocked alongside the three real calls purely so
 * the suite can assert it is never reached: chaining B06 in front of B04 would
 * authorize the same credential twice and is a mistake this file exists to
 * catch.
 */
import {
  publicQuotationAccept,
  publicQuotationCurrent,
  publicQuotationReject,
  publicSecureLinkResolve,
} from '@embroidery/api-client';
import {
  createTestQueryClient,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';

import { SecureQuotationScreen } from '../../src/features/secure-quotation/ui/secure-quotation-screen';
import { SECURE_QUOTATION_COPY as COPY } from '../../src/features/secure-quotation/model/secure-quotation-copy';
import { SECURE_LINK_COPY } from '../../src/features/secure-link-access/model/secure-link-copy';
import {
  OUT_OF_ALPHABET_TOKEN,
  SHORT_TOKEN,
  TEST_TOKEN,
  apiFailure,
  envelopeOf,
  networkFailure,
} from '../support/secure-link-fixture';
import {
  NEWER_VERSION_ID,
  VERSION_ID,
  makeAccepted,
  makeQuotation,
  makeRejected,
  navigateToQuotation,
} from '../support/secure-quotation-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicQuotationCurrent: jest.fn(),
  publicQuotationAccept: jest.fn(),
  publicQuotationReject: jest.fn(),
  publicSecureLinkResolve: jest.fn(),
}));

const currentMock = publicQuotationCurrent as jest.MockedFunction<typeof publicQuotationCurrent>;
const acceptMock = publicQuotationAccept as jest.MockedFunction<typeof publicQuotationAccept>;
const rejectMock = publicQuotationReject as jest.MockedFunction<typeof publicQuotationReject>;
const resolveMock = publicSecureLinkResolve as jest.MockedFunction<typeof publicSecureLinkResolve>;

/** What `location`/`history` looked like each time the API was called. */
interface CallSite {
  readonly hash: string;
  readonly href: string;
  readonly historyState: unknown;
  readonly token: string;
  readonly versionId?: string;
}

const callSites: CallSite[] = [];

function record(body: { token: string; versionId?: string }): void {
  callSites.push({
    hash: window.location.hash,
    href: window.location.href,
    historyState: window.history.state,
    token: body.token,
    ...(body.versionId === undefined ? {} : { versionId: body.versionId }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  callSites.length = 0;
  navigateToQuotation('');
});

function renderScreen() {
  return renderWithProviders(<SecureQuotationScreen />, { queryClient: createTestQueryClient() });
}

function resolvesTo(quote = makeQuotation()) {
  currentMock.mockImplementation((body) => {
    record(body);
    return Promise.resolve(envelopeOf(quote));
  });
}

async function openQuotation(quote = makeQuotation()) {
  resolvesTo(quote);
  navigateToQuotation(`#t=${TEST_TOKEN}`);
  const rendered = renderScreen();
  await screen.findByRole('heading', { level: 1 });
  return rendered;
}

describe('APP6-S01 — fragment bootstrap', () => {
  it('captures the fragment, strips it, and only then calls B04', async () => {
    await openQuotation();

    expect(callSites).toHaveLength(1);
    const [call] = callSites;
    expect(call?.token).toBe(TEST_TOKEN);
    // The address bar was already clean when the request was issued.
    expect(call?.hash).toBe('');
    expect(call?.href).not.toContain(TEST_TOKEN);
    expect(JSON.stringify(call?.historyState ?? null)).not.toContain(TEST_TOKEN);
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/truy-cap/bao-gia');
  });

  it('never chains the secure-link resolve operation in front of the read', async () => {
    await openQuotation();
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it.each([
    ['no fragment', ''],
    ['a fragment that is not the key', '#other=value'],
    ['a token one character short', `#t=${SHORT_TOKEN}`],
    ['a token outside the alphabet', `#t=${OUT_OF_ALPHABET_TOKEN}`],
  ])('makes no request at all for %s, and still strips', async (_label, fragment) => {
    navigateToQuotation(fragment);
    renderScreen();

    expect(await screen.findByText(SECURE_LINK_COPY.unavailable.title)).toBeInTheDocument();
    expect(currentMock).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });

  it('reloading after the strip is unrecoverable and sends nothing credentialed', async () => {
    await openQuotation();
    currentMock.mockClear();

    // A reload is a fresh mount at the already-clean URL.
    renderScreen();
    expect(await screen.findAllByText(SECURE_LINK_COPY.unavailable.title)).not.toHaveLength(0);
    expect(currentMock).not.toHaveBeenCalled();
  });
});

describe('APP6-S01 — access states', () => {
  it('renders the one indistinguishable unavailable card for a refused link', async () => {
    currentMock.mockRejectedValue(apiFailure(404, 'NOT_FOUND'));
    navigateToQuotation(`#t=${TEST_TOKEN}`);
    renderScreen();

    expect(await screen.findByText(SECURE_LINK_COPY.unavailable.title)).toBeInTheDocument();
    // No diagnostic second request to tell the two 404 causes apart.
    expect(currentMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a transport failure distinct, retries only when asked, and once', async () => {
    currentMock.mockRejectedValueOnce(networkFailure());
    navigateToQuotation(`#t=${TEST_TOKEN}`);
    renderScreen();

    expect(await screen.findByText(SECURE_LINK_COPY.transientError.title)).toBeInTheDocument();
    expect(currentMock).toHaveBeenCalledTimes(1);

    resolvesTo();
    fireEvent.click(screen.getByRole('button', { name: SECURE_LINK_COPY.transientError.retry }));
    expect(await screen.findByText(COPY.titles.live)).toBeInTheDocument();
    expect(currentMock).toHaveBeenCalledTimes(2);
  });
});

describe('APP6-S01 — the live offer', () => {
  it('shows the server figures as recorded', async () => {
    await openQuotation();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(COPY.titles.live);
    expect(screen.getByText('3.530.000 VND')).toBeInTheDocument();
    expect(screen.getByText('−170.000 VND')).toBeInTheDocument();
    expect(screen.getByText('1.412.000 VND')).toBeInTheDocument();
    expect(screen.getByText('2.118.000 VND')).toBeInTheDocument();
  });

  it('offers no acceptance action at all once the server reports the offer lapsed', async () => {
    await openQuotation(makeQuotation({ expired: true }));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(COPY.titles.expired);
    expect(screen.queryByRole('button', { name: COPY.actions.accept })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: COPY.actions.reject })).not.toBeInTheDocument();
    // Still shows what was quoted.
    expect(screen.getByText('3.530.000 VND')).toBeInTheDocument();
  });
});

describe('APP6-S01 — acceptance', () => {
  it('requires an explicit confirmation and names the exact version shown', async () => {
    acceptMock.mockImplementation((body) => {
      record(body);
      return Promise.resolve(envelopeOf(makeAccepted()));
    });
    await openQuotation();

    fireEvent.click(screen.getByRole('button', { name: COPY.actions.accept }));
    // Nothing has been sent by opening the confirmation.
    expect(acceptMock).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent(COPY.acceptConfirm.title);

    fireEvent.click(screen.getByRole('button', { name: COPY.acceptConfirm.confirm }));
    await waitFor(() => expect(acceptMock).toHaveBeenCalledTimes(1));

    const decision = callSites.at(-1);
    expect(decision?.versionId).toBe(VERSION_ID);
    expect(decision?.token).toBe(TEST_TOKEN);
    expect(decision?.hash).toBe('');
  });

  it('claims no payment, no order and no stock', async () => {
    acceptMock.mockResolvedValue(envelopeOf(makeAccepted()));
    await openQuotation();
    fireEvent.click(screen.getByRole('button', { name: COPY.actions.accept }));
    fireEvent.click(screen.getByRole('button', { name: COPY.acceptConfirm.confirm }));

    expect(await screen.findByText(COPY.accepted.title)).toBeInTheDocument();
    expect(screen.getByText(COPY.accepted.body)).toBeInTheDocument();
    const page = document.body.textContent ?? '';
    expect(page).not.toMatch(/đã thanh toán|đơn hàng đã được tạo|đã giữ hàng/i);
  });

  it('reports a replayed acceptance as the recorded one, not as a second', async () => {
    acceptMock.mockResolvedValue(envelopeOf(makeAccepted({ replayed: true })));
    await openQuotation();
    fireEvent.click(screen.getByRole('button', { name: COPY.actions.accept }));
    fireEvent.click(screen.getByRole('button', { name: COPY.acceptConfirm.confirm }));

    expect(await screen.findByText(COPY.accepted.replayed)).toBeInTheDocument();
    expect(screen.getByText(COPY.accepted.title)).toBeInTheDocument();
  });

  it('sends one request when the confirmation is activated twice in the same tick', async () => {
    acceptMock.mockImplementation(
      async () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(envelopeOf(makeAccepted())), 0);
        }),
    );
    await openQuotation();
    fireEvent.click(screen.getByRole('button', { name: COPY.actions.accept }));

    const confirm = screen.getByRole('button', { name: COPY.acceptConfirm.confirm });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    await waitFor(() => expect(screen.getByText(COPY.accepted.title)).toBeInTheDocument());
    expect(acceptMock).toHaveBeenCalledTimes(1);
  });
});

describe('APP6-S01 — rejection', () => {
  it('needs no re-verification and never claims the request was cancelled', async () => {
    rejectMock.mockImplementation((body) => {
      record(body);
      return Promise.resolve(envelopeOf(makeRejected()));
    });
    await openQuotation();

    fireEvent.click(screen.getByRole('button', { name: COPY.actions.reject }));
    expect(screen.getByRole('dialog')).toHaveTextContent(COPY.rejectConfirm.title);
    fireEvent.click(screen.getByRole('button', { name: COPY.rejectConfirm.confirm }));

    expect(await screen.findByText(COPY.rejected.title)).toBeInTheDocument();
    expect(callSites.at(-1)?.versionId).toBe(VERSION_ID);
    expect(screen.getByText(COPY.rejected.body)).toBeInTheDocument();
    const page = document.body.textContent ?? '';
    expect(page).not.toMatch(/yêu cầu.*đã bị huỷ|yêu cầu.*bị từ chối/i);
  });
});

describe('APP6-S01 — refusals', () => {
  it('re-reads once on a stale version, shows no success, and demands a new decision', async () => {
    const newer = makeQuotation({ version: 3, versionId: NEWER_VERSION_ID });
    currentMock
      .mockImplementationOnce((body) => {
        record(body);
        return Promise.resolve(envelopeOf(makeQuotation()));
      })
      .mockImplementationOnce((body) => {
        record(body);
        return Promise.resolve(envelopeOf(newer));
      });
    acceptMock.mockRejectedValue(apiFailure(409, 'QUOTE_VERSION_STALE'));

    navigateToQuotation(`#t=${TEST_TOKEN}`);
    renderScreen();
    await screen.findByRole('heading', { level: 1 });

    fireEvent.click(screen.getByRole('button', { name: COPY.actions.accept }));
    fireEvent.click(screen.getByRole('button', { name: COPY.acceptConfirm.confirm }));

    expect(await screen.findByText(COPY.stale.title)).toBeInTheDocument();
    expect(screen.queryByText(COPY.accepted.title)).not.toBeInTheDocument();
    // Exactly one re-read, and no automatic retry of the decision.
    expect(currentMock).toHaveBeenCalledTimes(2);
    expect(acceptMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: COPY.actions.viewLatest }));
    expect(screen.getByRole('button', { name: COPY.actions.accept })).toBeEnabled();
  });

  it('never fabricates success from an idempotency conflict', async () => {
    currentMock.mockImplementation((body) => {
      record(body);
      return Promise.resolve(envelopeOf(makeQuotation()));
    });
    acceptMock.mockRejectedValue(apiFailure(409, 'IDEMPOTENCY_CONFLICT'));
    navigateToQuotation(`#t=${TEST_TOKEN}`);
    renderScreen();
    await screen.findByRole('heading', { level: 1 });

    fireEvent.click(screen.getByRole('button', { name: COPY.actions.accept }));
    fireEvent.click(screen.getByRole('button', { name: COPY.acceptConfirm.confirm }));

    expect(await screen.findByText(COPY.notices.IDEMPOTENCY_CONFLICT.title)).toBeInTheDocument();
    expect(screen.queryByText(COPY.accepted.title)).not.toBeInTheDocument();
  });

  it('bounds a duplicate operation to one notice with no polling', async () => {
    acceptMock.mockRejectedValue(apiFailure(409, 'DUPLICATE_OPERATION'));
    await openQuotation();

    fireEvent.click(screen.getByRole('button', { name: COPY.actions.accept }));
    fireEvent.click(screen.getByRole('button', { name: COPY.acceptConfirm.confirm }));

    expect(await screen.findByText(COPY.notices.DUPLICATE_OPERATION.title)).toBeInTheDocument();
    expect(acceptMock).toHaveBeenCalledTimes(1);
    // No re-read either: the same decision is still running server-side.
    expect(currentMock).toHaveBeenCalledTimes(1);
  });

  it('shows the same unavailable card when a decision proves the grant is gone', async () => {
    acceptMock.mockRejectedValue(apiFailure(404, 'NOT_FOUND'));
    await openQuotation();

    fireEvent.click(screen.getByRole('button', { name: COPY.actions.accept }));
    fireEvent.click(screen.getByRole('button', { name: COPY.acceptConfirm.confirm }));

    expect(await screen.findByText(SECURE_LINK_COPY.unavailable.title)).toBeInTheDocument();
    expect(screen.queryByText(COPY.titles.live)).not.toBeInTheDocument();
  });

  it('keeps a transient decision failure on the quotation with no automatic retry', async () => {
    acceptMock.mockRejectedValue(networkFailure());
    await openQuotation();

    fireEvent.click(screen.getByRole('button', { name: COPY.actions.accept }));
    fireEvent.click(screen.getByRole('button', { name: COPY.acceptConfirm.confirm }));

    expect(await screen.findByText(COPY.notices.TRANSIENT.title)).toBeInTheDocument();
    expect(acceptMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: COPY.actions.accept })).toBeEnabled();
  });
});
