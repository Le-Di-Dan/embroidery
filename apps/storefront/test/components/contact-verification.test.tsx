/**
 * Every state the approved `APP4-S01` design draws, reached the way a customer
 * reaches it (`APP4-S01` §22).
 *
 * The suite mocks the **generated operations** at the feature boundary rather
 * than Axios or a URL, so a route rename would break the mock rather than pass
 * silently, and nothing here asserts against a hand-written path.
 *
 * `fireEvent` rather than `user-event`, following the repository's fake-timer
 * convention: the cooldown is driven by `jest.advanceTimersByTime`, and this
 * project's `createUser()` takes no `advanceTimers` option, so a `user-event`
 * session would wait on a clock the test controls.
 */
import { act } from 'react';
import {
  publicVerificationIssue,
  publicVerificationReadStatus,
  publicVerificationResend,
  publicVerificationSubmitAttempt,
} from '@embroidery/api-client';
import { fireEvent, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';

import { ContactVerificationScreen } from '../../src/features/contact-verification/ui/contact-verification-screen';
import { VERIFICATION_COPY } from '../../src/features/contact-verification/model/verification-copy';
import {
  apiCodedFailure,
  apiFailure,
  envelopeOf,
  makeChallenge,
  makeStatus,
  networkFailure,
  MASKED_EMAIL,
  NOW_MS,
  REPLACEMENT_CHALLENGE_ID,
  TEST_CODE,
  TEST_EMAIL,
  TEST_PHONE,
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

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW_MS });
});

afterEach(() => {
  jest.useRealTimers();
});

function renderScreen() {
  return renderWithProviders(<ContactVerificationScreen />);
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

/** Contact entry → a live challenge, which most states start from. */
async function reachCodeEntry(): Promise<void> {
  issueMock.mockResolvedValue(envelopeOf(makeChallenge()));
  renderScreen();
  type(contactField(), TEST_EMAIL);
  fireEvent.click(button(VERIFICATION_COPY.contactEntry.submit));
  await waitFor(() => expect(codeField()).toBeInTheDocument());
}

describe('APP4-S01 — contact entry', () => {
  it('renders the approved default state with one page heading', () => {
    renderScreen();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      VERIFICATION_COPY.pageTitle,
    );
    expect(screen.getByText(VERIFICATION_COPY.contactEntry.title)).toBeInTheDocument();
    expect(contactField()).toBeInTheDocument();
    expect(screen.getByText(VERIFICATION_COPY.emailField.help)).toBeInTheDocument();
  });

  it('rejects an implausible contact without calling the API', async () => {
    renderScreen();

    type(contactField(), 'ban@vidu');
    fireEvent.click(button(VERIFICATION_COPY.contactEntry.submit));

    expect(await screen.findByText(VERIFICATION_COPY.emailField.invalid)).toBeInTheDocument();
    expect(contactField()).toHaveAttribute('aria-invalid', 'true');
    // The client check exists to save a round trip, so it must not make one.
    expect(issueMock).not.toHaveBeenCalled();
  });

  it('shows the submitting state while the request is in flight', async () => {
    type IssueResult = Awaited<ReturnType<typeof publicVerificationIssue>>;
    let release: ((value: IssueResult) => void) | undefined;
    issueMock.mockReturnValue(
      new Promise<IssueResult>((resolve) => {
        release = resolve;
      }),
    );
    renderScreen();

    type(contactField(), TEST_EMAIL);
    fireEvent.click(button(VERIFICATION_COPY.contactEntry.submit));

    const busy = await screen.findByRole('button', {
      name: VERIFICATION_COPY.contactEntry.submitting,
    });
    expect(busy).toBeDisabled();
    release?.(envelopeOf(makeChallenge()));
  });

  it('sends the contact exactly as typed, always as EMAIL', async () => {
    await reachCodeEntry();

    expect(issueMock).toHaveBeenCalledWith(
      expect.objectContaining({ contact: TEST_EMAIL, contactKind: 'EMAIL', purpose: 'SUBMISSION' }),
      expect.anything(),
    );
  });
});

/**
 * `APP12-N01.S01` §19 — the negative half, proved mechanically rather than by
 * reading the component.
 *
 * These assertions are about what the customer *cannot* reach. Each one would
 * have passed before this checkpoint only by accident, and each fails the moment
 * a phone-verification affordance comes back in any form: a chooser, a second
 * field, a stray SMS sentence, or a request naming a channel.
 */
describe('APP12-N01.S01 — email is the only verification channel', () => {
  it('offers no method chooser and no second contact field', () => {
    renderScreen();

    // No radio, no checkbox, no select, and exactly one text input on the card.
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.queryAllByRole('group')).toHaveLength(0);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);

    // The one field is an email field by type, mode and autofill hint — a `tel`
    // input is what a phone affordance would have to become.
    const field = contactField();
    expect(field).toHaveAttribute('type', 'email');
    expect(field).toHaveAttribute('inputmode', 'email');
    expect(field).toHaveAttribute('autocomplete', 'email');
  });

  it('says nothing about a phone number, an SMS or a message', () => {
    renderScreen();

    const page = document.body.textContent ?? '';
    for (const forbidden of ['điện thoại', 'SMS', 'tin nhắn', 'Zalo']) {
      expect(page).not.toContain(forbidden);
    }
  });

  it('never issues a challenge for a phone number, even when one is typed', async () => {
    issueMock.mockResolvedValue(envelopeOf(makeChallenge()));
    renderScreen();

    // The field accepts the keystrokes — nothing filters input — but a phone
    // number is not a plausible email, so the client refuses it and no request
    // is made. There is no control that could have made it a PHONE request.
    type(contactField(), TEST_PHONE);
    fireEvent.click(button(VERIFICATION_COPY.contactEntry.submit));

    expect(await screen.findByText(VERIFICATION_COPY.emailField.invalid)).toBeInTheDocument();
    expect(issueMock).not.toHaveBeenCalled();
  });

  it('answers an unsupported-channel refusal with the email-only notice', async () => {
    // Defence in depth: no control here can provoke this refusal, so the test
    // supplies the envelope directly. What it proves is the mapping — that the
    // refusal is not rendered as "that email is malformed", which is what the
    // bare 422 beneath it maps to.
    issueMock.mockRejectedValue(apiCodedFailure(422, 'VERIFICATION_CHANNEL_UNSUPPORTED'));
    renderScreen();

    type(contactField(), TEST_EMAIL);
    fireEvent.click(button(VERIFICATION_COPY.contactEntry.submit));

    expect(
      await screen.findByText(VERIFICATION_COPY.alerts.channelUnsupported.title),
    ).toBeInTheDocument();
    expect(screen.queryByText(VERIFICATION_COPY.emailField.invalid)).not.toBeInTheDocument();
    // The refusal is a notice on the card the remedy lives on, so the field is
    // still there and still holds what the customer typed.
    expect(contactField()).toHaveValue(TEST_EMAIL);
  });

  it('shows no raw backend or provider text when a refusal is rendered', async () => {
    issueMock.mockRejectedValue(apiCodedFailure(422, 'VERIFICATION_CHANNEL_UNSUPPORTED'));
    renderScreen();

    type(contactField(), TEST_EMAIL);
    fireEvent.click(button(VERIFICATION_COPY.contactEntry.submit));
    await screen.findByText(VERIFICATION_COPY.alerts.channelUnsupported.title);

    const page = document.body.textContent ?? '';
    for (const leak of [
      'VERIFICATION_CHANNEL_UNSUPPORTED',
      'Refused.',
      'SMTP',
      '422',
      'req-test',
    ]) {
      expect(page).not.toContain(leak);
    }
  });
});

describe('APP4-S01 — code entry', () => {
  it('renders the masked destination and not the contact typed', async () => {
    await reachCodeEntry();

    expect(screen.getByText(MASKED_EMAIL)).toBeInTheDocument();
    // 623:107 — the destination is shown only in masked form.
    expect(screen.queryByText(TEST_EMAIL)).not.toBeInTheDocument();
  });

  it('keeps the verify action disabled until six digits are present', async () => {
    await reachCodeEntry();

    expect(button(VERIFICATION_COPY.codeEntry.submit)).toBeDisabled();
    type(codeField(), '01234');
    expect(button(VERIFICATION_COPY.codeEntry.submit)).toBeDisabled();
    type(codeField(), TEST_CODE);
    expect(button(VERIFICATION_COPY.codeEntry.submit)).toBeEnabled();
  });

  it('shows the verifying state while the attempt is in flight', async () => {
    await reachCodeEntry();
    type AttemptResult = Awaited<ReturnType<typeof publicVerificationSubmitAttempt>>;
    let release: ((value: AttemptResult) => void) | undefined;
    attemptMock.mockReturnValue(
      new Promise<AttemptResult>((resolve) => {
        release = resolve;
      }),
    );

    type(codeField(), TEST_CODE);
    fireEvent.click(button(VERIFICATION_COPY.codeEntry.submit));

    expect(
      await screen.findByRole('button', { name: VERIFICATION_COPY.codeEntry.submitting }),
    ).toBeDisabled();
    release?.(envelopeOf(makeStatus('VERIFIED')));
  });

  it('preserves a leading zero by submitting the code as a string', async () => {
    await reachCodeEntry();
    attemptMock.mockResolvedValue(envelopeOf(makeStatus('VERIFIED')));

    type(codeField(), TEST_CODE);
    fireEvent.click(button(VERIFICATION_COPY.codeEntry.submit));

    await waitFor(() => expect(attemptMock).toHaveBeenCalled());
    const body = attemptMock.mock.calls[0]?.[1];
    expect(body).toEqual({ code: TEST_CODE });
    expect(typeof (body as { code: unknown }).code).toBe('string');
  });
});

describe('APP4-S01 — refusals', () => {
  it('shows the mismatch state while the challenge is still answerable', async () => {
    await reachCodeEntry();
    attemptMock.mockRejectedValue(apiFailure(422));
    statusMock.mockResolvedValue(envelopeOf(makeStatus('ISSUED')));

    type(codeField(), TEST_CODE);
    fireEvent.click(button(VERIFICATION_COPY.codeEntry.submit));

    expect(await screen.findByText(VERIFICATION_COPY.alerts.mismatch)).toBeInTheDocument();
    // Still on the code field, and it has been emptied for the next try.
    expect(codeField()).toHaveValue('');
  });

  it('shows the lockout state when the attempt budget is spent', async () => {
    await reachCodeEntry();
    attemptMock.mockRejectedValue(apiFailure(429));
    statusMock.mockResolvedValue(envelopeOf(makeStatus('FAILED')));

    type(codeField(), TEST_CODE);
    fireEvent.click(button(VERIFICATION_COPY.codeEntry.submit));

    expect(await screen.findByText(VERIFICATION_COPY.alerts.locked.title)).toBeInTheDocument();
  });

  it('shows the expired state when the challenge died, not a mismatch', async () => {
    await reachCodeEntry();
    // The same 422 as a mismatch: only the status read separates them.
    attemptMock.mockRejectedValue(apiFailure(422));
    statusMock.mockResolvedValue(envelopeOf(makeStatus('EXPIRED')));

    type(codeField(), TEST_CODE);
    fireEvent.click(button(VERIFICATION_COPY.codeEntry.submit));

    expect(await screen.findByText(VERIFICATION_COPY.alerts.expired.title)).toBeInTheDocument();
    expect(screen.queryByText(VERIFICATION_COPY.alerts.mismatch)).not.toBeInTheDocument();
  });

  it('shows the rate-limited state when issuance is refused', async () => {
    issueMock.mockRejectedValue(apiFailure(429));
    renderScreen();

    type(contactField(), TEST_EMAIL);
    fireEvent.click(button(VERIFICATION_COPY.contactEntry.submit));

    expect(await screen.findByText(VERIFICATION_COPY.alerts.rateLimited.title)).toBeInTheDocument();
  });

  it('treats a temporarily unavailable service as the same approved frame', async () => {
    issueMock.mockRejectedValue(apiFailure(503));
    renderScreen();

    type(contactField(), TEST_EMAIL);
    fireEvent.click(button(VERIFICATION_COPY.contactEntry.submit));

    expect(await screen.findByText(VERIFICATION_COPY.alerts.rateLimited.title)).toBeInTheDocument();
  });

  it('shows the recoverable-error state for a transport failure', async () => {
    issueMock.mockRejectedValue(networkFailure());
    renderScreen();

    type(contactField(), TEST_EMAIL);
    fireEvent.click(button(VERIFICATION_COPY.contactEntry.submit));

    expect(
      await screen.findByText(VERIFICATION_COPY.alerts.recoverableError.title),
    ).toBeInTheDocument();
    // An infrastructure failure is not a verdict: the retry action is offered.
    expect(button(VERIFICATION_COPY.outcome.RECOVERABLE_ERROR.action)).toBeEnabled();
  });

  it('shows the success state and no account or profile UI', async () => {
    await reachCodeEntry();
    attemptMock.mockResolvedValue(envelopeOf(makeStatus('VERIFIED')));

    type(codeField(), TEST_CODE);
    fireEvent.click(button(VERIFICATION_COPY.codeEntry.submit));

    expect(await screen.findByText(VERIFICATION_COPY.alerts.success.title)).toBeInTheDocument();
    // A link, not a button: APP5 owns what follows, so the approved action
    // leads out of the flow rather than to a screen S01 would have invented.
    expect(
      screen.getByRole('link', { name: VERIFICATION_COPY.outcome.SUCCESS.action }),
    ).toBeInTheDocument();
    for (const forbidden of [/hồ sơ/i, /đăng nhập/i, /đăng ký/i]) {
      expect(screen.queryByText(forbidden)).not.toBeInTheDocument();
    }
  });
});

describe('APP4-S01 — resend', () => {
  it('counts down from the server instant and enables the action on time', async () => {
    await reachCodeEntry();

    // Semantically disabled during cooldown, not merely styled (634:147).
    expect(button(VERIFICATION_COPY.resend.action)).toBeDisabled();
    expect(screen.getByText(VERIFICATION_COPY.resend.cooldown('01:00'))).toBeInTheDocument();

    fireEvent.click(document.body);
    advance(13_000);
    expect(await screen.findByText(VERIFICATION_COPY.resend.cooldown('00:47'))).toBeInTheDocument();

    advance(47_000);
    await waitFor(() => expect(button(VERIFICATION_COPY.resend.action)).toBeEnabled());
  });

  it('calls the resend operation, never issue, and adopts the new challenge', async () => {
    await reachCodeEntry();
    issueMock.mockClear();
    resendMock.mockResolvedValue(
      envelopeOf(
        makeChallenge({
          challengeId: REPLACEMENT_CHALLENGE_ID,
          resendAvailableAt: new Date(NOW_MS + 120_000).toISOString(),
        }),
      ),
    );
    attemptMock.mockResolvedValue(envelopeOf(makeStatus('VERIFIED')));

    advance(60_000);
    await waitFor(() => expect(button(VERIFICATION_COPY.resend.action)).toBeEnabled());
    fireEvent.click(button(VERIFICATION_COPY.resend.action));

    expect(await screen.findByText(VERIFICATION_COPY.alerts.resent.title)).toBeInTheDocument();
    expect(resendMock).toHaveBeenCalledWith(expect.any(String), expect.anything());
    expect(issueMock).not.toHaveBeenCalled();

    // The replacement's identity replaces the old one: the next attempt answers
    // the new challenge, never the cancelled source.
    type(codeField(), TEST_CODE);
    fireEvent.click(button(VERIFICATION_COPY.codeEntry.submit));
    await waitFor(() => expect(attemptMock).toHaveBeenCalled());
    expect(attemptMock.mock.calls[0]?.[0]).toBe(REPLACEMENT_CHALLENGE_ID);
  });

  it('resolves a refused resend to the challenge state the server reports', async () => {
    await reachCodeEntry();
    resendMock.mockRejectedValue(apiFailure(422));
    statusMock.mockResolvedValue(envelopeOf(makeStatus('EXPIRED')));

    advance(60_000);
    await waitFor(() => expect(button(VERIFICATION_COPY.resend.action)).toBeEnabled());
    fireEvent.click(button(VERIFICATION_COPY.resend.action));

    expect(await screen.findByText(VERIFICATION_COPY.alerts.expired.title)).toBeInTheDocument();
  });
});

describe('APP4-S01 — non-enumeration', () => {
  it('never says whether the contact belongs to anyone', async () => {
    await reachCodeEntry();

    // The forbidden list from the approved annotation 634:59.
    const body = (document.body.textContent ?? '').toLowerCase();
    for (const forbidden of [
      'đã được đăng ký',
      'chưa được đăng ký',
      'không tìm thấy khách hàng',
      'đã tìm thấy tài khoản',
      'thuộc về người khác',
    ]) {
      expect(body).not.toContain(forbidden.toLowerCase());
    }
  });
});
