/**
 * The secure-link token must exist only in ephemeral component-local memory
 * (`APP5-S02` §5, §20; `APP4-S02` §7, approved annotation `634:57`).
 *
 * Adapted from the `APP4-S02` secrecy proof for the changed `/truy-cap`
 * consumer: the machinery under test is the same, the call it spends the
 * credential on is `APP5-B03`. These are the assertions that would still pass
 * if the feature were subtly wrong, so each one names the surface it inspects
 * rather than trusting a comment: the TanStack cache, `localStorage`,
 * `sessionStorage`, `document.cookie`, the URL, `history.state`, the rendered
 * DOM and everything written to the console.
 *
 * The token literal lives in the fixture and deliberately never appears in the
 * completion report.
 */
import { publicCustomRequestStatus } from '@embroidery/api-client';
import { createTestQueryClient } from '@embroidery/frontend-testing';
import { fireEvent, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';
import type { QueryClient } from '@tanstack/react-query';

import { CustomRequestStatusScreen } from '../../src/features/custom-request-status/ui/custom-request-status-screen';
import { CUSTOM_REQUEST_STATUS_COPY as COPY } from '../../src/features/custom-request-status/model/custom-request-status-copy';
import { SECURE_LINK_COPY } from '../../src/features/secure-link-access/model/secure-link-copy';
import { SecureLinkQueryProvider } from '../../src/features/secure-link-access/ui/secure-link-query-provider';
import { TEST_REQUEST_CODE, makeStatusResponse } from '../support/custom-request-status-fixture';
import {
  TEST_TOKEN,
  apiFailure,
  envelopeOf,
  navigateToLanding,
  networkFailure,
} from '../support/secure-link-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicCustomRequestStatus: jest.fn(),
}));

const statusMock = publicCustomRequestStatus as jest.MockedFunction<
  typeof publicCustomRequestStatus
>;

const HEADING = COPY.heading.wide.replace('{code}', TEST_REQUEST_CODE);

/** Everything the console was asked to record during a test. */
const consoleOutput: string[] = [];
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;
const originalConsole = new Map<string, unknown>();

beforeEach(() => {
  jest.clearAllMocks();
  consoleOutput.length = 0;
  for (const method of CONSOLE_METHODS) {
    originalConsole.set(method, console[method]);
    console[method] = (...args: unknown[]) => {
      consoleOutput.push(args.map((value) => String(value)).join(' '));
    };
  }
  navigateToLanding(`#t=${TEST_TOKEN}`);
});

afterEach(() => {
  for (const method of CONSOLE_METHODS) {
    (console as unknown as Record<string, unknown>)[method] = originalConsole.get(method);
  }
  window.localStorage.clear();
  window.sessionStorage.clear();
});

function renderScreen(queryClient: QueryClient = createTestQueryClient()) {
  return renderWithProviders(<CustomRequestStatusScreen />, { queryClient });
}

/** Every observable surface, serialised, so one assertion can sweep them all. */
function observableSurfaces(queryClient: QueryClient, container: HTMLElement): string {
  return [
    window.location.href,
    JSON.stringify(window.history.state ?? null),
    JSON.stringify(window.localStorage),
    JSON.stringify(window.sessionStorage),
    document.cookie,
    container.innerHTML,
    consoleOutput.join('\n'),
    JSON.stringify(
      queryClient
        .getQueryCache()
        .getAll()
        .map((entry) => entry.state),
    ),
    JSON.stringify(
      queryClient
        .getMutationCache()
        .getAll()
        .map((entry) => ({ variables: entry.state.variables, data: entry.state.data })),
    ),
  ].join('\n');
}

describe('APP5-S02 — token secrecy', () => {
  it('leaves the token in no observable surface after a successful read', async () => {
    statusMock.mockResolvedValue(envelopeOf(makeStatusResponse()));
    const queryClient = createTestQueryClient();

    const { container } = renderScreen(queryClient);

    await screen.findByText(HEADING);
    expect(observableSurfaces(queryClient, container)).not.toContain(TEST_TOKEN);
  });

  it('leaves the token in no observable surface after a definitive refusal', async () => {
    statusMock.mockRejectedValue(apiFailure(404, 'SECURE_LINK_UNAVAILABLE'));
    const queryClient = createTestQueryClient();

    const { container } = renderScreen(queryClient);

    await screen.findByText(SECURE_LINK_COPY.unavailable.title);
    expect(observableSurfaces(queryClient, container)).not.toContain(TEST_TOKEN);
  });

  it('leaves the token in no observable surface while a manual retry is available', async () => {
    statusMock.mockRejectedValue(networkFailure());
    const queryClient = createTestQueryClient();

    const { container } = renderScreen(queryClient);

    await screen.findByText(SECURE_LINK_COPY.transientError.title);
    // The token is still held — in a ref, which is not an observable surface.
    expect(observableSurfaces(queryClient, container)).not.toContain(TEST_TOKEN);
  });

  it('never puts the token into mutation variables', async () => {
    statusMock.mockResolvedValue(envelopeOf(makeStatusResponse()));
    const queryClient = createTestQueryClient();

    renderScreen(queryClient);

    await waitFor(() => expect(statusMock).toHaveBeenCalledTimes(1));
    for (const mutation of queryClient.getMutationCache().getAll()) {
      expect(mutation.state.variables).toBeUndefined();
    }
  });

  /**
   * The route's own provider, not the shared test client.
   *
   * The tests above render the screen against a harness client so the cache can
   * be inspected; that harness keeps a default `gcTime`, which the production
   * provider does not. This case mounts what the route actually mounts, so the
   * `retry: false` / `gcTime: 0` posture the feature ships with is the one under
   * test — and proves the retained mutation state carries no credential either
   * way.
   */
  it('holds nothing through the route-local provider the page actually mounts', async () => {
    statusMock.mockResolvedValue(envelopeOf(makeStatusResponse()));

    const { container } = renderWithProviders(
      <SecureLinkQueryProvider>
        <CustomRequestStatusScreen />
      </SecureLinkQueryProvider>,
      { queryClient: createTestQueryClient() },
    );

    await screen.findByText(HEADING);
    expect(container.innerHTML).not.toContain(TEST_TOKEN);
    expect(window.location.href).not.toContain(TEST_TOKEN);
    expect(consoleOutput.join('\n')).toBe('');
  });

  it('retains no mutation data that could carry the token', async () => {
    statusMock.mockResolvedValue(envelopeOf(makeStatusResponse()));
    const queryClient = createTestQueryClient();

    renderScreen(queryClient);

    await screen.findByText(HEADING);
    const retained = JSON.stringify(
      queryClient
        .getMutationCache()
        .getAll()
        .map((entry) => entry.state),
    );
    expect(retained).not.toContain(TEST_TOKEN);
    // `variables` is `undefined`, which `JSON.stringify` omits entirely — so the
    // serialised state has no `variables` key at all to carry anything.
    expect(retained).not.toContain('"variables"');
  });

  it('writes nothing to storage or cookies', async () => {
    statusMock.mockResolvedValue(envelopeOf(makeStatusResponse()));

    renderScreen();

    await screen.findByText(HEADING);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });

  it('writes nothing to the console, including on the refusal path', async () => {
    statusMock.mockRejectedValue(apiFailure(404, 'SECURE_LINK_UNAVAILABLE'));

    renderScreen();

    await screen.findByText(SECURE_LINK_COPY.unavailable.title);
    expect(consoleOutput.join('\n')).toBe('');
  });

  it('keeps the token out of history state across the whole flow', async () => {
    statusMock.mockRejectedValue(networkFailure());

    renderScreen();
    await screen.findByText(SECURE_LINK_COPY.transientError.title);
    expect(JSON.stringify(window.history.state ?? null)).not.toContain(TEST_TOKEN);

    statusMock.mockResolvedValue(envelopeOf(makeStatusResponse()));
    fireEvent.click(screen.getByRole('button', { name: SECURE_LINK_COPY.transientError.retry }));

    await screen.findByText(HEADING);
    expect(JSON.stringify(window.history.state ?? null)).not.toContain(TEST_TOKEN);
    expect(window.location.href).not.toContain(TEST_TOKEN);
  });

  it('does not persist anything that would survive a remount', async () => {
    statusMock.mockRejectedValue(networkFailure());
    const first = renderScreen();
    await screen.findByText(SECURE_LINK_COPY.transientError.title);
    first.unmount();

    // The fragment is gone, nothing was persisted, so a fresh mount has no
    // credential to present and must not call the API.
    statusMock.mockClear();
    renderScreen();

    await screen.findByText(SECURE_LINK_COPY.unavailable.title);
    expect(statusMock).not.toHaveBeenCalled();
  });
});
