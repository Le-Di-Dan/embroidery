/**
 * The secure-link credential and the verification code must exist only in
 * ephemeral component-local memory (`APP6-S01` §6, §7, §17).
 *
 * Adapted from the `APP5-S02` secrecy proof, and stricter in one way that
 * matters: this landing is the first that **retains** the credential past a
 * successful read, because the customer's later accept or reject is authorised
 * by the same grant and the fragment is already gone. Retention is exactly the
 * change that could leak, so the sweep below runs at every point in the
 * decision — after the read, while a confirmation is open, during a step-up,
 * and after the decision commits.
 *
 * Each assertion names the surface it inspects rather than trusting a comment:
 * the TanStack query and mutation caches, `localStorage`, `sessionStorage`,
 * `document.cookie`, the URL, `history.state`, the rendered DOM and everything
 * written to the console.
 *
 * The token and code literals live in the fixtures and deliberately never
 * appear in the completion report.
 */
import {
  publicQuotationAccept,
  publicQuotationCurrent,
  publicVerificationIssue,
  publicVerificationReadStatus,
  publicVerificationResend,
  publicVerificationSubmitAttempt,
} from '@embroidery/api-client';
import {
  createTestQueryClient,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import type { QueryClient } from '@tanstack/react-query';

import { SecureQuotationScreen } from '../../src/features/secure-quotation/ui/secure-quotation-screen';
import { SECURE_QUOTATION_COPY as COPY } from '../../src/features/secure-quotation/model/secure-quotation-copy';
import { SECURE_LINK_COPY } from '../../src/features/secure-link-access/model/secure-link-copy';
import { SecureLinkQueryProvider } from '../../src/features/secure-link-access/ui/secure-link-query-provider';
import { VERIFICATION_COPY } from '../../src/features/contact-verification/model/verification-copy';
import { TEST_TOKEN, apiFailure, envelopeOf, networkFailure } from '../support/secure-link-fixture';
import {
  TEST_CODE,
  TEST_EMAIL,
  envelopeOf as verificationEnvelope,
  makeChallenge,
  makeStatus,
} from '../support/verification-fixture';
import {
  makeAccepted,
  makeQuotation,
  navigateToQuotation,
} from '../support/secure-quotation-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicQuotationCurrent: jest.fn(),
  publicQuotationAccept: jest.fn(),
  publicVerificationIssue: jest.fn(),
  publicVerificationResend: jest.fn(),
  publicVerificationSubmitAttempt: jest.fn(),
  publicVerificationReadStatus: jest.fn(),
}));

const currentMock = publicQuotationCurrent as jest.MockedFunction<typeof publicQuotationCurrent>;
const acceptMock = publicQuotationAccept as jest.MockedFunction<typeof publicQuotationAccept>;
const issueMock = publicVerificationIssue as jest.MockedFunction<typeof publicVerificationIssue>;
const attemptMock = publicVerificationSubmitAttempt as jest.MockedFunction<
  typeof publicVerificationSubmitAttempt
>;
const statusMock = publicVerificationReadStatus as jest.MockedFunction<
  typeof publicVerificationReadStatus
>;
const resendMock = publicVerificationResend as jest.MockedFunction<typeof publicVerificationResend>;

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
  issueMock.mockResolvedValue(verificationEnvelope(makeChallenge()));
  attemptMock.mockResolvedValue(verificationEnvelope(makeStatus('VERIFIED')));
  statusMock.mockResolvedValue(verificationEnvelope(makeStatus('VERIFIED')));
  resendMock.mockResolvedValue(verificationEnvelope(makeChallenge()));
  navigateToQuotation(`#t=${TEST_TOKEN}`);
});

afterEach(() => {
  for (const method of CONSOLE_METHODS) {
    (console as unknown as Record<string, unknown>)[method] = originalConsole.get(method);
  }
  window.localStorage.clear();
  window.sessionStorage.clear();
});

function renderScreen(queryClient: QueryClient = createTestQueryClient()) {
  return renderWithProviders(<SecureQuotationScreen />, { queryClient });
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
        .map((entry) => entry.state),
    ),
  ].join('\n');
}

describe('APP6-S01 — credential secrecy', () => {
  it('leaves the credential in no observable surface after the read that retains it', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeQuotation()));
    const queryClient = createTestQueryClient();

    const { container } = renderScreen(queryClient);

    await screen.findByText(COPY.titles.live);
    expect(observableSurfaces(queryClient, container)).not.toContain(TEST_TOKEN);
  });

  it('leaves it in no observable surface while a confirmation is open', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeQuotation()));
    const queryClient = createTestQueryClient();

    const { container } = renderScreen(queryClient);
    await screen.findByText(COPY.titles.live);
    fireEvent.click(screen.getByRole('button', { name: COPY.actions.accept }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(observableSurfaces(queryClient, container)).not.toContain(TEST_TOKEN);
  });

  it('leaves it in no observable surface once a decision has committed', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeQuotation()));
    acceptMock.mockResolvedValue(envelopeOf(makeAccepted()));
    const queryClient = createTestQueryClient();

    const { container } = renderScreen(queryClient);
    await screen.findByText(COPY.titles.live);
    fireEvent.click(screen.getByRole('button', { name: COPY.actions.accept }));
    fireEvent.click(screen.getByRole('button', { name: COPY.acceptConfirm.confirm }));

    await screen.findByText(COPY.accepted.title);
    expect(observableSurfaces(queryClient, container)).not.toContain(TEST_TOKEN);
  });

  it('never puts the credential into mutation variables, on any of the three calls', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeQuotation()));
    acceptMock.mockResolvedValue(envelopeOf(makeAccepted()));
    const queryClient = createTestQueryClient();

    renderScreen(queryClient);
    await screen.findByText(COPY.titles.live);
    fireEvent.click(screen.getByRole('button', { name: COPY.actions.accept }));
    fireEvent.click(screen.getByRole('button', { name: COPY.acceptConfirm.confirm }));
    await screen.findByText(COPY.accepted.title);

    for (const mutation of queryClient.getMutationCache().getAll()) {
      expect(mutation.state.variables).toBeUndefined();
    }
  });

  it('keeps the verification code out of every surface during a step-up', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeQuotation()));
    acceptMock.mockRejectedValue(apiFailure(403, 'REVERIFICATION_REQUIRED'));
    const queryClient = createTestQueryClient();

    const { container } = renderScreen(queryClient);
    await screen.findByText(COPY.titles.live);
    fireEvent.click(screen.getByRole('button', { name: COPY.actions.accept }));
    fireEvent.click(screen.getByRole('button', { name: COPY.acceptConfirm.confirm }));
    await screen.findByText(COPY.stepUp.title);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: TEST_EMAIL } });
    fireEvent.click(screen.getByRole('button', { name: VERIFICATION_COPY.contactEntry.submit }));
    await screen.findByText(VERIFICATION_COPY.codeEntry.title);
    fireEvent.change(screen.getByLabelText(VERIFICATION_COPY.codeEntry.fieldLabel), {
      target: { value: TEST_CODE },
    });
    fireEvent.click(screen.getByRole('button', { name: VERIFICATION_COPY.codeEntry.submit }));
    await waitFor(() => expect(attemptMock).toHaveBeenCalledTimes(1));

    const surfaces = observableSurfaces(queryClient, container);
    expect(surfaces).not.toContain(TEST_TOKEN);
    // The code lives in the input's own state and a ref; the input's *value* is
    // a DOM property, not serialised markup, so `innerHTML` must not carry it.
    expect(surfaces).not.toContain(TEST_CODE);
  });

  it('writes nothing to storage, cookies or the console across the whole flow', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeQuotation()));
    acceptMock.mockResolvedValue(envelopeOf(makeAccepted()));

    renderScreen();
    await screen.findByText(COPY.titles.live);
    fireEvent.click(screen.getByRole('button', { name: COPY.actions.accept }));
    fireEvent.click(screen.getByRole('button', { name: COPY.acceptConfirm.confirm }));
    await screen.findByText(COPY.accepted.title);

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    expect(consoleOutput.join('\n')).toBe('');
  });

  it('writes nothing to the console on the refusal path either', async () => {
    currentMock.mockRejectedValue(apiFailure(404, 'NOT_FOUND'));

    renderScreen();

    await screen.findByText(SECURE_LINK_COPY.unavailable.title);
    expect(consoleOutput.join('\n')).toBe('');
  });

  it('holds nothing through the route-local provider the page actually mounts', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeQuotation()));

    const { container } = renderWithProviders(
      <SecureLinkQueryProvider>
        <SecureQuotationScreen />
      </SecureLinkQueryProvider>,
      { queryClient: createTestQueryClient() },
    );

    await screen.findByText(COPY.titles.live);
    expect(container.innerHTML).not.toContain(TEST_TOKEN);
    expect(window.location.href).not.toContain(TEST_TOKEN);
    expect(consoleOutput.join('\n')).toBe('');
  });

  it('persists nothing that would survive a remount, even while retaining', async () => {
    currentMock.mockRejectedValue(networkFailure());
    const first = renderScreen();
    await screen.findByText(SECURE_LINK_COPY.transientError.title);
    first.unmount();

    // The fragment is gone and nothing was persisted, so a fresh mount has no
    // credential to present and must not call the API.
    currentMock.mockClear();
    renderScreen();

    await screen.findByText(SECURE_LINK_COPY.unavailable.title);
    expect(currentMock).not.toHaveBeenCalled();
  });

  it('discloses no internal identifier the contract deliberately withholds', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeQuotation()));
    const { container } = renderScreen();

    await screen.findByText(COPY.titles.live);
    const markup = container.innerHTML;
    for (const forbidden of [
      'adjustmentReason',
      'stitchCount',
      'skuId',
      'customerId',
      'customRequestId',
      'quotationId',
      'grantId',
      'requestId',
    ]) {
      expect(markup).not.toContain(forbidden);
    }
    // The version id authorises the decision and is never shown.
    expect(markup).not.toContain(makeQuotation().versionId);
  });
});
