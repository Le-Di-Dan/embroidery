/**
 * `/truy-cap` — the four approved states and the bootstrap ordering that
 * produces them (`APP4-S02` §23).
 *
 * The assertion that matters most is not "the right card rendered" but **when
 * the request left**: every test that expects a POST also proves the address bar
 * was already clean at the moment it was issued. That ordering is the whole
 * security argument of the checkpoint, so it is captured from the mock at call
 * time rather than inspected afterwards, when it would be true for the wrong
 * reason.
 */
import { publicSecureLinkResolve } from '@embroidery/api-client';
import { createTestQueryClient } from '@embroidery/frontend-testing';
import { fireEvent, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';

import { SecureLinkScreen } from '../../src/features/secure-link-access/ui/secure-link-screen';
import { SECURE_LINK_COPY } from '../../src/features/secure-link-access/model/secure-link-copy';
import {
  OUT_OF_ALPHABET_TOKEN,
  SHORT_TOKEN,
  TEST_TOKEN,
  apiFailure,
  envelopeOf,
  makeGrant,
  navigateToLanding,
  networkFailure,
} from '../support/secure-link-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicSecureLinkResolve: jest.fn(),
}));

const resolveMock = publicSecureLinkResolve as jest.MockedFunction<typeof publicSecureLinkResolve>;

/** What `location`/`history` looked like each time the API was called. */
interface CallSite {
  readonly hash: string;
  readonly href: string;
  readonly historyState: unknown;
  readonly token: string;
}

const callSites: CallSite[] = [];

function recordCallSite(body: { token: string }): void {
  callSites.push({
    hash: window.location.hash,
    href: window.location.href,
    historyState: window.history.state,
    token: body.token,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  callSites.length = 0;
  navigateToLanding('');
});

function renderScreen() {
  return renderWithProviders(<SecureLinkScreen />, { queryClient: createTestQueryClient() });
}

describe('APP4-S02 — fragment bootstrap', () => {
  it('captures the canonical fragment, strips it, and only then calls B06', async () => {
    navigateToLanding(`#t=${TEST_TOKEN}`);
    resolveMock.mockImplementation((body) => {
      recordCallSite(body);
      return Promise.resolve(envelopeOf(makeGrant()));
    });

    renderScreen();

    await waitFor(() => expect(resolveMock).toHaveBeenCalledTimes(1));

    // One request, and the URL was already clean when it was made.
    expect(callSites).toHaveLength(1);
    expect(callSites[0]?.hash).toBe('');
    expect(callSites[0]?.href).not.toContain(TEST_TOKEN);
    expect(JSON.stringify(callSites[0]?.historyState ?? null)).not.toContain(TEST_TOKEN);
  });

  it('sends the token in the request body exactly once', async () => {
    navigateToLanding(`#t=${TEST_TOKEN}`);
    resolveMock.mockImplementation((body) => {
      recordCallSite(body);
      return Promise.resolve(envelopeOf(makeGrant()));
    });

    renderScreen();

    await waitFor(() => expect(resolveMock).toHaveBeenCalledTimes(1));
    expect(callSites[0]?.token).toBe(TEST_TOKEN);
    // The generated operation takes the body first; nothing else carries it.
    expect(resolveMock.mock.calls[0]?.[0]).toEqual({ token: TEST_TOKEN });
  });

  it('leaves the browser URL clean after bootstrap', async () => {
    navigateToLanding(`#t=${TEST_TOKEN}`);
    resolveMock.mockResolvedValue(envelopeOf(makeGrant()));

    renderScreen();

    await waitFor(() => expect(window.location.hash).toBe(''));
    expect(window.location.pathname).toBe('/truy-cap');
    expect(window.location.search).toBe('');
  });

  it('makes no request when the fragment is missing, and shows the unavailable state', async () => {
    renderScreen();

    await screen.findByText(SECURE_LINK_COPY.unavailable.alertTitle);
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a wrong key', '#token=abc'],
    ['a short token', `#t=${SHORT_TOKEN}`],
    ['an out-of-alphabet token', `#t=${OUT_OF_ALPHABET_TOKEN}`],
    ['an empty value', '#t='],
    ['extra parameters', `#t=${TEST_TOKEN}&debug=1`],
  ])('makes no request for %s, and strips it anyway', async (_label, fragment) => {
    navigateToLanding(fragment);

    renderScreen();

    await screen.findByText(SECURE_LINK_COPY.unavailable.alertTitle);
    expect(resolveMock).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });

  it('never reads a token from the query string', async () => {
    window.history.replaceState(null, '', `/truy-cap?t=${TEST_TOKEN}`);

    renderScreen();

    await screen.findByText(SECURE_LINK_COPY.unavailable.alertTitle);
    expect(resolveMock).not.toHaveBeenCalled();
  });
});

describe('APP4-S02 — authorized', () => {
  beforeEach(() => {
    navigateToLanding(`#t=${TEST_TOKEN}`);
  });

  it('renders the approved authorized shell on success', async () => {
    resolveMock.mockResolvedValue(envelopeOf(makeGrant()));

    renderScreen();

    // Both approved wordings are present; CSS chooses. Exactly one heading.
    await screen.findByText(SECURE_LINK_COPY.authorized.title.wide);
    expect(screen.getByText(SECURE_LINK_COPY.authorized.title.narrow)).toBeInTheDocument();
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getByText(SECURE_LINK_COPY.authorized.slotTitle.wide)).toBeInTheDocument();
  });

  it('puts no field of the grant on screen', async () => {
    const grant = makeGrant();
    resolveMock.mockResolvedValue(envelopeOf(grant));

    const { container } = renderScreen();

    await screen.findByText(SECURE_LINK_COPY.authorized.title.wide);
    for (const value of [grant.customRequestId, grant.expiresAt, grant.scopeKind]) {
      expect(container.textContent).not.toContain(value);
    }
  });

  it('renders no APP5 business content or action', async () => {
    resolveMock.mockResolvedValue(envelopeOf(makeGrant()));

    const { container } = renderScreen();

    await screen.findByText(SECURE_LINK_COPY.authorized.title.wide);
    // No control other than the informational shell: nothing to approve, pay or submit.
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('form')).toHaveLength(0);
    expect(container.querySelectorAll('a')).toHaveLength(0);
    // The handoff slot is a labelled placeholder and stays exactly that: the
    // approved note *names* quotation, design approval and payment only to say
    // APP4 shows none of them.
    expect(screen.getByText(SECURE_LINK_COPY.authorized.slotNote.wide)).toBeInTheDocument();
  });

  it('renders exactly one landmark section and no second main', async () => {
    resolveMock.mockResolvedValue(envelopeOf(makeGrant()));

    const { container } = renderScreen();

    await screen.findByText(SECURE_LINK_COPY.authorized.title.wide);
    expect(container.querySelectorAll('main')).toHaveLength(0);
    expect(container.querySelectorAll('header')).toHaveLength(0);
    expect(container.querySelectorAll('footer')).toHaveLength(0);
  });
});

describe('APP4-S02 — unavailable, without enumeration', () => {
  beforeEach(() => {
    navigateToLanding(`#t=${TEST_TOKEN}`);
  });

  it('renders the canonical unavailable state for a 404', async () => {
    resolveMock.mockRejectedValue(apiFailure(404, 'SECURE_LINK_UNAVAILABLE'));

    renderScreen();

    await screen.findByText(SECURE_LINK_COPY.unavailable.title);
    expect(screen.getByText(SECURE_LINK_COPY.unavailable.alertBody)).toBeInTheDocument();
  });

  /**
   * The six causes the server collapses. They cannot be told apart here — that
   * is the assertion. Each fixture is a plausible backend message riding the
   * same published 404 contract, and all six are compared against **each other**
   * rather than against a stored snapshot: a snapshot would prove they each
   * match a file, this proves they are indistinguishable.
   */
  it('renders byte-identical output for all six collapsed causes', async () => {
    const causes = [
      'no such token',
      'grant expired',
      'grant revoked',
      'grant superseded',
      'target mismatch',
      'scope mismatch',
    ];
    const rendered: string[] = [];

    for (const message of causes) {
      resolveMock.mockRejectedValue(apiFailure(404, 'SECURE_LINK_UNAVAILABLE', message));
      const view = renderScreen();
      await screen.findByText(SECURE_LINK_COPY.unavailable.title);
      expect(view.container.textContent).not.toContain(message);
      rendered.push(view.container.innerHTML);
      view.unmount();
    }

    expect(new Set(rendered).size).toBe(1);
  });

  it('carries no cause-specific copy and makes no second diagnostic request', async () => {
    resolveMock.mockRejectedValue(apiFailure(404, 'SECURE_LINK_UNAVAILABLE'));

    const { container } = renderScreen();

    await screen.findByText(SECURE_LINK_COPY.unavailable.title);
    expect(container.textContent).not.toMatch(
      /đã hết hạn\.|đã bị thu hồi|đã bị huỷ|sai tài khoản|sai yêu cầu|không hợp lệ|token/i,
    );
    expect(resolveMock).toHaveBeenCalledTimes(1);
  });

  it('shows the same screen for a missing fragment as for a 404', async () => {
    resolveMock.mockRejectedValue(apiFailure(404, 'SECURE_LINK_UNAVAILABLE'));
    const rejected = renderScreen();
    await screen.findByText(SECURE_LINK_COPY.unavailable.title);
    const withVerdict = rejected.container.textContent;
    rejected.unmount();

    navigateToLanding('');
    const noToken = renderScreen();
    await screen.findByText(SECURE_LINK_COPY.unavailable.title);

    expect(noToken.container.textContent).toBe(withVerdict);
  });
});

describe('APP4-S02 — transient failure and manual retry', () => {
  beforeEach(() => {
    navigateToLanding(`#t=${TEST_TOKEN}`);
  });

  it.each([
    ['a network failure', networkFailure()],
    ['a 503', apiFailure(503, 'SERVICE_UNAVAILABLE')],
    ['a 429', apiFailure(429, 'RATE_LIMITED')],
    ['a 500', apiFailure(500, 'INTERNAL_ERROR')],
  ])('renders the transient error state for %s', async (_label, failure) => {
    resolveMock.mockRejectedValue(failure);

    renderScreen();

    await screen.findByText(SECURE_LINK_COPY.transientError.title);
    expect(screen.getByRole('button', { name: SECURE_LINK_COPY.transientError.retry }));
  });

  it('does not retry automatically', async () => {
    resolveMock.mockRejectedValue(networkFailure());

    renderScreen();

    await screen.findByText(SECURE_LINK_COPY.transientError.title);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(resolveMock).toHaveBeenCalledTimes(1);
  });

  it('sends exactly one new request with the same token when retry is pressed', async () => {
    resolveMock.mockImplementation((body) => {
      recordCallSite(body);
      return Promise.reject(networkFailure());
    });

    renderScreen();
    await screen.findByText(SECURE_LINK_COPY.transientError.title);

    resolveMock.mockImplementation((body) => {
      recordCallSite(body);
      return Promise.resolve(envelopeOf(makeGrant()));
    });
    fireEvent.click(screen.getByRole('button', { name: SECURE_LINK_COPY.transientError.retry }));

    await screen.findByText(SECURE_LINK_COPY.authorized.title.wide);
    expect(callSites).toHaveLength(2);
    expect(callSites[1]?.token).toBe(TEST_TOKEN);
    // The fragment is never restored to make the retry possible.
    expect(callSites[1]?.hash).toBe('');
    expect(window.location.hash).toBe('');
  });

  it('does not retry after a definitive verdict cleared the token', async () => {
    resolveMock.mockRejectedValue(apiFailure(404, 'SECURE_LINK_UNAVAILABLE'));

    renderScreen();

    await screen.findByText(SECURE_LINK_COPY.unavailable.title);
    expect(
      screen.queryByRole('button', { name: SECURE_LINK_COPY.transientError.retry }),
    ).toBeNull();
  });
});

describe('APP4-S02 — accessibility', () => {
  it('announces the bootstrap state politely and keeps one h1 per state', async () => {
    navigateToLanding(`#t=${TEST_TOKEN}`);
    resolveMock.mockResolvedValue(envelopeOf(makeGrant()));

    const { container } = renderScreen();

    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe(SECURE_LINK_COPY.live.bootstrap);
    expect(document.querySelectorAll('h1')).toHaveLength(1);

    await screen.findByText(SECURE_LINK_COPY.authorized.title.wide);
    expect(live?.textContent).toBe(SECURE_LINK_COPY.live.authorized);
    expect(document.querySelectorAll('h1')).toHaveLength(1);
  });

  it('moves focus to the heading once resolution settles', async () => {
    navigateToLanding(`#t=${TEST_TOKEN}`);
    resolveMock.mockRejectedValue(apiFailure(404, 'SECURE_LINK_UNAVAILABLE'));

    renderScreen();

    await screen.findByText(SECURE_LINK_COPY.unavailable.title);
    await waitFor(() => expect(document.activeElement?.tagName).toBe('H1'));
  });

  it('renders no token entry field anywhere', async () => {
    navigateToLanding(`#t=${TEST_TOKEN}`);
    resolveMock.mockResolvedValue(envelopeOf(makeGrant()));

    const { container } = renderScreen();

    await screen.findByText(SECURE_LINK_COPY.authorized.title.wide);
    expect(container.querySelectorAll('input')).toHaveLength(0);
    expect(container.querySelectorAll('textarea')).toHaveLength(0);
  });
});
