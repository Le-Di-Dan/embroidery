/**
 * The verification code must exist only in ephemeral component-local memory
 * (`APP4-S01` §15, §23; approved annotation `634:57`).
 *
 * These are the assertions that would still pass if the feature were subtly
 * wrong, so each one names the surface it inspects rather than trusting a
 * comment: the TanStack cache, `localStorage`, `sessionStorage`, `document.
 * cookie`, the URL, `history.state` and everything written to the console.
 *
 * The code literal lives in the fixture and deliberately never appears in the
 * completion report.
 */
import { act } from 'react';
import {
  publicVerificationIssue,
  publicVerificationReadStatus,
  publicVerificationResend,
  publicVerificationSubmitAttempt,
} from '@embroidery/api-client';
import { createTestQueryClient } from '@embroidery/frontend-testing';
import { fireEvent, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';
import type { QueryClient } from '@tanstack/react-query';

import { ContactVerificationScreen } from '../../src/features/contact-verification/ui/contact-verification-screen';
import { VERIFICATION_COPY } from '../../src/features/contact-verification/model/verification-copy';
import {
  apiFailure,
  envelopeOf,
  makeChallenge,
  makeStatus,
  NOW_MS,
  REPLACEMENT_CHALLENGE_ID,
  TEST_CODE,
  TEST_EMAIL,
} from '../support/verification-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicVerificationIssue: jest.fn(),
  publicVerificationResend: jest.fn(),
  publicVerificationSubmitAttempt: jest.fn(),
  publicVerificationReadStatus: jest.fn(),
}));

const issueMock = publicVerificationIssue as jest.MockedFunction<typeof publicVerificationIssue>;
const resendMock = publicVerificationResend as jest.MockedFunction<typeof publicVerificationResend>;
const attemptMock = publicVerificationSubmitAttempt as jest.MockedFunction<
  typeof publicVerificationSubmitAttempt
>;
const statusMock = publicVerificationReadStatus as jest.MockedFunction<
  typeof publicVerificationReadStatus
>;

/** Everything the console was asked to record during a test. */
const consoleOutput: string[] = [];
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW_MS });
  consoleOutput.length = 0;
  for (const method of CONSOLE_METHODS) {
    jest.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleOutput.push(args.map(String).join(' '));
    });
  }
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

let queryClient: QueryClient;

function renderScreen() {
  queryClient = createTestQueryClient();
  return renderWithProviders(<ContactVerificationScreen />, { queryClient });
}

const contactField = () =>
  screen.getByRole('textbox', { name: VERIFICATION_COPY.emailField.label });
const codeField = () =>
  screen.getByRole('textbox', { name: VERIFICATION_COPY.codeEntry.fieldLabel });
const button = (name: string) => screen.getByRole('button', { name });

/** Advance the fake clock inside act() so React flushes the resulting tick. */
function advance(ms: number): void {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

function type(field: HTMLElement, value: string): void {
  fireEvent.change(field, { target: { value } });
}

async function reachCodeEntry(): Promise<void> {
  issueMock.mockResolvedValue(envelopeOf(makeChallenge()));
  renderScreen();
  type(contactField(), TEST_EMAIL);
  fireEvent.click(button(VERIFICATION_COPY.contactEntry.submit));
  await waitFor(() => expect(codeField()).toBeInTheDocument());
}

function submitCode(): void {
  type(codeField(), TEST_CODE);
  fireEvent.click(button(VERIFICATION_COPY.codeEntry.submit));
}

/**
 * Every place a retained secret could be observed, serialized together.
 *
 * The query cache is dumped through `getAll()` rather than a public helper: a
 * mutation that carried the code as a variable would show it here, which is
 * exactly the failure `mutate()`-without-variables prevents.
 */
function observableSurfaces(): string {
  const cache = JSON.stringify(
    queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => ({ state: mutation.state })),
  );
  const queries = JSON.stringify(
    queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.state),
  );
  return [
    cache,
    queries,
    JSON.stringify({ ...localStorage }),
    JSON.stringify({ ...sessionStorage }),
    document.cookie,
    window.location.href,
    JSON.stringify(window.history.state ?? {}),
    consoleOutput.join('\n'),
  ].join('\n');
}

/** Fails with a useful name rather than a bare boolean. */
function expectNoCodeAnywhere(): void {
  expect(observableSurfaces()).not.toContain(TEST_CODE);
}

describe('APP4-S01 — the code is submitted correctly', () => {
  it('sends the six-character string, leading zero intact', async () => {
    await reachCodeEntry();
    attemptMock.mockResolvedValue(envelopeOf(makeStatus('VERIFIED')));

    submitCode();

    await waitFor(() => expect(attemptMock).toHaveBeenCalled());
    expect(attemptMock.mock.calls[0]?.[1]).toEqual({ code: TEST_CODE });
    expect(TEST_CODE.startsWith('0')).toBe(true);
  });
});

describe('APP4-S01 — the code does not survive settlement', () => {
  it('is absent from every observable surface after a successful attempt', async () => {
    await reachCodeEntry();
    attemptMock.mockResolvedValue(envelopeOf(makeStatus('VERIFIED')));

    submitCode();
    await screen.findByText(VERIFICATION_COPY.alerts.success.title);

    expectNoCodeAnywhere();
  });

  it('is absent from every observable surface after a mismatch', async () => {
    await reachCodeEntry();
    attemptMock.mockRejectedValue(apiFailure(422));
    statusMock.mockResolvedValue(envelopeOf(makeStatus('ISSUED')));

    submitCode();
    await screen.findByText(VERIFICATION_COPY.alerts.mismatch);

    // A refusal is the case where a retained variable would be most tempting —
    // "keep it so the customer can correct one digit" — and is exactly what the
    // approved design does not do.
    expectNoCodeAnywhere();
    expect(codeField()).toHaveValue('');
  });

  it('leaves no mutation variables behind at all', async () => {
    await reachCodeEntry();
    attemptMock.mockResolvedValue(envelopeOf(makeStatus('VERIFIED')));

    submitCode();
    await screen.findByText(VERIFICATION_COPY.alerts.success.title);

    // Stronger than "does not contain the code": the mutation never carried
    // variables, so there is nothing for a future change to start putting there.
    for (const mutation of queryClient.getMutationCache().getAll()) {
      expect(mutation.state.variables).toBeUndefined();
    }
  });
});

describe('APP4-S01 — the code is cleared on every exit', () => {
  it('clears on a successful resend, which also replaces the challenge', async () => {
    await reachCodeEntry();
    resendMock.mockResolvedValue(
      envelopeOf(makeChallenge({ challengeId: REPLACEMENT_CHALLENGE_ID })),
    );

    type(codeField(), TEST_CODE);
    advance(60_000);
    await waitFor(() => expect(button(VERIFICATION_COPY.resend.action)).toBeEnabled());
    fireEvent.click(button(VERIFICATION_COPY.resend.action));

    await screen.findByText(VERIFICATION_COPY.alerts.resent.title);
    expect(codeField()).toHaveValue('');
    expectNoCodeAnywhere();
  });

  it('clears when the challenge expires', async () => {
    await reachCodeEntry();
    attemptMock.mockRejectedValue(apiFailure(422));
    statusMock.mockResolvedValue(envelopeOf(makeStatus('EXPIRED')));

    submitCode();
    await screen.findByText(VERIFICATION_COPY.alerts.expired.title);

    expectNoCodeAnywhere();
  });

  it('clears when the attempt budget is spent', async () => {
    await reachCodeEntry();
    attemptMock.mockRejectedValue(apiFailure(429));
    statusMock.mockResolvedValue(envelopeOf(makeStatus('FAILED')));

    submitCode();
    await screen.findByText(VERIFICATION_COPY.alerts.locked.title);

    expectNoCodeAnywhere();
  });

  it('clears on unmount', async () => {
    await reachCodeEntry();
    const view = renderWithProviders(<ContactVerificationScreen />, { queryClient });

    type(codeField(), TEST_CODE);
    view.unmount();

    expectNoCodeAnywhere();
  });
});

describe('APP4-S01 — the code never reaches a persistent or shared surface', () => {
  it('writes nothing to storage or cookies at any point in the flow', async () => {
    await reachCodeEntry();
    type(codeField(), TEST_CODE);

    // Mid-flight, before settlement: the strictest moment, because this is when
    // the value genuinely exists.
    expect(JSON.stringify({ ...localStorage })).not.toContain(TEST_CODE);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(TEST_CODE);
    expect(document.cookie).not.toContain(TEST_CODE);
    // Nothing at all is persisted by this flow, not merely "not the code".
    expect(Object.keys(localStorage)).toHaveLength(0);
    expect(Object.keys(sessionStorage)).toHaveLength(0);
  });

  it('keeps the URL and history free of the code and the challenge', async () => {
    await reachCodeEntry();
    attemptMock.mockResolvedValue(envelopeOf(makeStatus('VERIFIED')));

    submitCode();
    await screen.findByText(VERIFICATION_COPY.alerts.success.title);

    expect(window.location.href).not.toContain(TEST_CODE);
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
    expect(JSON.stringify(window.history.state ?? {})).not.toContain(TEST_CODE);
  });

  it('logs nothing containing the code, including on a refusal', async () => {
    await reachCodeEntry();
    attemptMock.mockRejectedValue(apiFailure(422));
    statusMock.mockResolvedValue(envelopeOf(makeStatus('ISSUED')));

    submitCode();
    await screen.findByText(VERIFICATION_COPY.alerts.mismatch);

    // The error path is where a stray `console.error(error)` would carry the
    // request body — and where a normalizer that echoed the payload would show.
    expect(consoleOutput.join('\n')).not.toContain(TEST_CODE);
    expect(consoleOutput.join('\n')).not.toContain(TEST_EMAIL);
  });
});
