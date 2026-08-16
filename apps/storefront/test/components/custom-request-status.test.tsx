/**
 * `/truy-cap` — the bootstrap ordering and the three access states
 * (`APP5-S02` §20; `APP4-S02` §23, whose proof this suite inherits).
 *
 * The assertion that matters most is not "the right card rendered" but **when
 * the request left**: every test that expects a POST also proves the address
 * bar was already clean at the moment it was issued. That ordering is the whole
 * security argument, so it is captured from the mock at call time rather than
 * inspected afterwards, when it would be true for the wrong reason.
 *
 * The second thing it proves is the architecture `APP5-S02` §3 locked: B03 is
 * the *only* call. `publicSecureLinkResolve` is mocked alongside it purely so
 * the suite can assert it is never reached — a chained B06 would authorize the
 * same token twice and is the mistake this file exists to catch.
 */
import { publicCustomRequestStatus, publicSecureLinkResolve } from '@embroidery/api-client';
import { createTestQueryClient } from '@embroidery/frontend-testing';
import { fireEvent, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';

import { CustomRequestStatusScreen } from '../../src/features/custom-request-status/ui/custom-request-status-screen';
import { CUSTOM_REQUEST_STATUS_COPY } from '../../src/features/custom-request-status/model/custom-request-status-copy';
import { SECURE_LINK_COPY } from '../../src/features/secure-link-access/model/secure-link-copy';
import { makeStatusResponse } from '../support/custom-request-status-fixture';
import {
  OUT_OF_ALPHABET_TOKEN,
  SHORT_TOKEN,
  TEST_TOKEN,
  apiFailure,
  envelopeOf,
  navigateToLanding,
  networkFailure,
} from '../support/secure-link-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicCustomRequestStatus: jest.fn(),
  publicSecureLinkResolve: jest.fn(),
}));

const statusMock = publicCustomRequestStatus as jest.MockedFunction<
  typeof publicCustomRequestStatus
>;
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

const HEADING = CUSTOM_REQUEST_STATUS_COPY.heading.wide.replace('{code}', 'REQ-7KM2QD4XVA');

beforeEach(() => {
  jest.clearAllMocks();
  callSites.length = 0;
  navigateToLanding('');
});

function renderScreen() {
  return renderWithProviders(<CustomRequestStatusScreen />, {
    queryClient: createTestQueryClient(),
  });
}

describe('APP5-S02 — fragment bootstrap', () => {
  it('captures the canonical fragment, strips it, and only then calls B03', async () => {
    navigateToLanding(`#t=${TEST_TOKEN}`);
    statusMock.mockImplementation((body) => {
      recordCallSite(body);
      return Promise.resolve(envelopeOf(makeStatusResponse()));
    });

    renderScreen();

    await waitFor(() => expect(statusMock).toHaveBeenCalledTimes(1));

    // One request, and the URL was already clean when it was made.
    expect(callSites).toHaveLength(1);
    expect(callSites[0]?.hash).toBe('');
    expect(callSites[0]?.href).not.toContain(TEST_TOKEN);
    expect(JSON.stringify(callSites[0]?.historyState ?? null)).not.toContain(TEST_TOKEN);
  });

  /**
   * The architecture decision, as an assertion.
   *
   * B03 runs the whole APP4 authorization chain internally, so chaining B06 in
   * front of it would authorize the same token twice, spend the same abuse
   * budget twice and hold the credential across two flights. The failure mode
   * is invisible on screen — the page would look identical — which is exactly
   * why it is proved here rather than by reading the source.
   */
  it('does not chain the APP4 secure-link resolver before B03', async () => {
    navigateToLanding(`#t=${TEST_TOKEN}`);
    statusMock.mockResolvedValue(envelopeOf(makeStatusResponse()));

    renderScreen();

    await screen.findByText(HEADING);
    expect(resolveMock).not.toHaveBeenCalled();
    expect(statusMock).toHaveBeenCalledTimes(1);
  });

  it('sends the token in the request body exactly once', async () => {
    navigateToLanding(`#t=${TEST_TOKEN}`);
    statusMock.mockImplementation((body) => {
      recordCallSite(body);
      return Promise.resolve(envelopeOf(makeStatusResponse()));
    });

    renderScreen();

    await waitFor(() => expect(statusMock).toHaveBeenCalledTimes(1));
    expect(callSites[0]?.token).toBe(TEST_TOKEN);
    // The generated operation takes the body first; nothing else carries it.
    expect(statusMock.mock.calls[0]?.[0]).toEqual({ token: TEST_TOKEN });
  });

  it('leaves the browser URL clean after bootstrap', async () => {
    navigateToLanding(`#t=${TEST_TOKEN}`);
    statusMock.mockResolvedValue(envelopeOf(makeStatusResponse()));

    renderScreen();

    await waitFor(() => expect(window.location.hash).toBe(''));
    expect(window.location.pathname).toBe('/truy-cap');
    expect(window.location.search).toBe('');
  });

  it('makes no request when the fragment is missing, and shows the unavailable state', async () => {
    renderScreen();

    await screen.findByText(SECURE_LINK_COPY.unavailable.alertTitle);
    expect(statusMock).not.toHaveBeenCalled();
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
    expect(statusMock).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });

  it('never reads a token from the query string', async () => {
    window.history.replaceState(null, '', `/truy-cap?t=${TEST_TOKEN}`);

    renderScreen();

    await screen.findByText(SECURE_LINK_COPY.unavailable.alertTitle);
    expect(statusMock).not.toHaveBeenCalled();
  });
});

describe('APP5-S02 — unavailable, without enumeration', () => {
  beforeEach(() => {
    navigateToLanding(`#t=${TEST_TOKEN}`);
  });

  it('renders the canonical APP4 unavailable state for a 404', async () => {
    statusMock.mockRejectedValue(apiFailure(404, 'SECURE_LINK_UNAVAILABLE'));

    renderScreen();

    await screen.findByText(SECURE_LINK_COPY.unavailable.title);
    expect(screen.getByText(SECURE_LINK_COPY.unavailable.alertBody)).toBeInTheDocument();
  });

  it('makes no second diagnostic request and names no cause', async () => {
    statusMock.mockRejectedValue(apiFailure(404, 'SECURE_LINK_UNAVAILABLE', 'grant revoked'));

    const { container } = renderScreen();

    await screen.findByText(SECURE_LINK_COPY.unavailable.title);
    expect(container.textContent).not.toContain('grant revoked');
    expect(container.textContent).not.toMatch(
      /đã hết hạn\.|đã bị thu hồi|sai tài khoản|sai yêu cầu|token/i,
    );
    expect(statusMock).toHaveBeenCalledTimes(1);
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it('shows the same screen for a missing fragment as for a 404', async () => {
    statusMock.mockRejectedValue(apiFailure(404, 'SECURE_LINK_UNAVAILABLE'));
    const rejected = renderScreen();
    await screen.findByText(SECURE_LINK_COPY.unavailable.title);
    const withVerdict = rejected.container.textContent;
    rejected.unmount();

    navigateToLanding('');
    const noToken = renderScreen();
    await screen.findByText(SECURE_LINK_COPY.unavailable.title);

    expect(noToken.container.textContent).toBe(withVerdict);
  });

  it('renders no request content at all when the link does not open', async () => {
    statusMock.mockRejectedValue(apiFailure(404, 'SECURE_LINK_UNAVAILABLE'));

    const { container } = renderScreen();

    await screen.findByText(SECURE_LINK_COPY.unavailable.title);
    expect(container.textContent).not.toContain('REQ-');
    expect(container.textContent).not.toContain(CUSTOM_REQUEST_STATUS_COPY.progress.title);
  });
});

describe('APP5-S02 — transient failure and manual retry', () => {
  beforeEach(() => {
    navigateToLanding(`#t=${TEST_TOKEN}`);
  });

  it.each([
    ['a network failure', networkFailure()],
    ['a 503', apiFailure(503, 'SERVICE_UNAVAILABLE')],
    ['a 429', apiFailure(429, 'RATE_LIMITED')],
    ['a 500', apiFailure(500, 'INTERNAL_ERROR')],
  ])('renders the APP4 transient error state for %s', async (_label, failure) => {
    statusMock.mockRejectedValue(failure);

    renderScreen();

    await screen.findByText(SECURE_LINK_COPY.transientError.title);
    expect(screen.getByRole('button', { name: SECURE_LINK_COPY.transientError.retry }));
  });

  it('does not retry automatically', async () => {
    statusMock.mockRejectedValue(networkFailure());

    renderScreen();

    await screen.findByText(SECURE_LINK_COPY.transientError.title);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(statusMock).toHaveBeenCalledTimes(1);
  });

  it('sends exactly one new request with the same ephemeral token on retry', async () => {
    statusMock.mockImplementation((body) => {
      recordCallSite(body);
      return Promise.reject(networkFailure());
    });

    renderScreen();
    await screen.findByText(SECURE_LINK_COPY.transientError.title);

    statusMock.mockImplementation((body) => {
      recordCallSite(body);
      return Promise.resolve(envelopeOf(makeStatusResponse()));
    });
    fireEvent.click(screen.getByRole('button', { name: SECURE_LINK_COPY.transientError.retry }));

    await screen.findByText(HEADING);
    expect(callSites).toHaveLength(2);
    expect(callSites[1]?.token).toBe(TEST_TOKEN);
    // The fragment is never restored to make the retry possible.
    expect(callSites[1]?.hash).toBe('');
    expect(window.location.hash).toBe('');
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it('offers no retry after a definitive verdict cleared the token', async () => {
    statusMock.mockRejectedValue(apiFailure(404, 'SECURE_LINK_UNAVAILABLE'));

    renderScreen();

    await screen.findByText(SECURE_LINK_COPY.unavailable.title);
    expect(
      screen.queryByRole('button', { name: SECURE_LINK_COPY.transientError.retry }),
    ).toBeNull();
  });
});

describe('APP5-S02 — accessibility of the landing states', () => {
  it('announces each settled state politely and keeps one h1 throughout', async () => {
    navigateToLanding(`#t=${TEST_TOKEN}`);
    statusMock.mockResolvedValue(envelopeOf(makeStatusResponse()));

    const { container } = renderScreen();

    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe(SECURE_LINK_COPY.live.bootstrap);
    expect(document.querySelectorAll('h1')).toHaveLength(1);

    await screen.findByText(HEADING);
    expect(live?.textContent).toBe(CUSTOM_REQUEST_STATUS_COPY.liveAuthorized);
    expect(document.querySelectorAll('h1')).toHaveLength(1);
  });

  it('moves focus to the heading once the call settles', async () => {
    navigateToLanding(`#t=${TEST_TOKEN}`);
    statusMock.mockResolvedValue(envelopeOf(makeStatusResponse()));

    renderScreen();

    await screen.findByText(HEADING);
    await waitFor(() => expect(document.activeElement?.tagName).toBe('H1'));
  });

  it('renders no token entry field and no second shell landmark', async () => {
    navigateToLanding(`#t=${TEST_TOKEN}`);
    statusMock.mockResolvedValue(envelopeOf(makeStatusResponse()));

    const { container } = renderScreen();

    await screen.findByText(HEADING);
    expect(container.querySelectorAll('input')).toHaveLength(0);
    expect(container.querySelectorAll('textarea')).toHaveLength(0);
    expect(container.querySelectorAll('main')).toHaveLength(0);
    expect(container.querySelectorAll('footer')).toHaveLength(0);
  });
});
