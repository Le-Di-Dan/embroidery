/**
 * Step-up re-verification inside `/truy-cap/thanh-toan` (`APP7-S01` §6, §14,
 * §22).
 *
 * Four things are proved here and nowhere else:
 *
 * 1. the flow stays on this route — a navigation to `/xac-minh-lien-he` would
 *    unmount the secure session and destroy the credential mid-payment;
 * 2. the challenge is issued with `purpose: STEP_UP`, through the same APP4
 *    machinery, with no second OTP mechanism anywhere in this feature;
 * 3. a completed verification is **evidence**, not payment: it resumes the same
 *    initiation with the same idempotency key, and claims nothing by itself;
 * 4. dismissing it leaves no attempt behind.
 */
import {
  publicOrderDepositCurrent,
  publicOrderDepositEvidenceStatus,
  publicOrderDepositInitiate,
  publicOrderDepositQr,
  publicVerificationIssue,
  publicVerificationReadStatus,
  publicVerificationResend,
  publicVerificationSubmitAttempt,
} from '@embroidery/api-client';
import { fireEvent, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';

import { VERIFICATION_COPY } from '../../src/features/contact-verification/model/verification-copy';
import { SECURE_DEPOSIT_COPY as COPY } from '../../src/features/secure-deposit-payment/model/secure-deposit-copy';
import { SecureDepositScreen } from '../../src/features/secure-deposit-payment/ui/secure-deposit-screen';
import {
  makeAttempt,
  makeDeposit,
  makeEvidenceList,
  navigateToDeposit,
} from '../support/secure-deposit-fixture';
import { TEST_TOKEN, apiFailure, envelopeOf, networkFailure } from '../support/secure-link-fixture';
import {
  TEST_CODE,
  TEST_EMAIL,
  envelopeOf as verificationEnvelope,
  makeChallenge,
  makeStatus,
} from '../support/verification-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicOrderDepositCurrent: jest.fn(),
  publicOrderDepositInitiate: jest.fn(),
  publicOrderDepositQr: jest.fn(),
  publicOrderDepositEvidenceStatus: jest.fn(),
  publicOrderDepositEvidenceUpload: jest.fn(),
  publicVerificationIssue: jest.fn(),
  publicVerificationResend: jest.fn(),
  publicVerificationSubmitAttempt: jest.fn(),
  publicVerificationReadStatus: jest.fn(),
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
const issueMock = publicVerificationIssue as jest.MockedFunction<typeof publicVerificationIssue>;
const attemptMock = publicVerificationSubmitAttempt as jest.MockedFunction<
  typeof publicVerificationSubmitAttempt
>;
const statusMock = publicVerificationReadStatus as jest.MockedFunction<
  typeof publicVerificationReadStatus
>;
const resendMock = publicVerificationResend as jest.MockedFunction<typeof publicVerificationResend>;

beforeEach(() => {
  jest.clearAllMocks();
  navigateToDeposit(`#t=${TEST_TOKEN}`);
  currentMock.mockResolvedValue(envelopeOf(makeDeposit()));
  qrMock.mockRejectedValue(networkFailure());
  evidenceMock.mockResolvedValue(envelopeOf(makeEvidenceList()));
  issueMock.mockResolvedValue(verificationEnvelope(makeChallenge()));
  attemptMock.mockResolvedValue(verificationEnvelope(makeStatus('VERIFIED')));
  statusMock.mockResolvedValue(verificationEnvelope(makeStatus('VERIFIED')));
  resendMock.mockResolvedValue(verificationEnvelope(makeChallenge()));
});

/** Opens the deposit, presses start, and lands on the step-up dialog. */
async function reachStepUp() {
  initiateMock.mockRejectedValue(apiFailure(403, 'REVERIFICATION_REQUIRED'));
  renderWithProviders(<SecureDepositScreen />);
  fireEvent.click(await screen.findByRole('button', { name: COPY.preAttempt.startAction }));
  await screen.findByText(COPY.stepUp.title);
}

/** Drives the embedded APP4 cards from contact entry to a verified code. */
async function completeVerification() {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: TEST_EMAIL } });
  fireEvent.click(screen.getByRole('button', { name: VERIFICATION_COPY.contactEntry.submit }));
  await screen.findByText(VERIFICATION_COPY.codeEntry.title);

  fireEvent.change(screen.getByLabelText(VERIFICATION_COPY.codeEntry.fieldLabel), {
    target: { value: TEST_CODE },
  });
  fireEvent.click(screen.getByRole('button', { name: VERIFICATION_COPY.codeEntry.submit }));
}

describe('APP7-S01 — embedded step-up', () => {
  it('opens inside the same route rather than navigating to the verification page', async () => {
    await reachStepUp();

    expect(window.location.pathname).toBe('/truy-cap/thanh-toan');
    expect(screen.getByRole('dialog')).toHaveTextContent(COPY.stepUp.title);
    // The deposit is still mounted behind the scrim, not replaced.
    expect(screen.getByText(COPY.preAttempt.startTitle)).toBeInTheDocument();
  });

  it('issues the challenge with the step-up purpose, through the APP4 machinery', async () => {
    await reachStepUp();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: TEST_EMAIL } });
    fireEvent.click(screen.getByRole('button', { name: VERIFICATION_COPY.contactEntry.submit }));

    await waitFor(() => expect(issueMock).toHaveBeenCalledTimes(1));
    expect(issueMock.mock.calls[0]?.[0]).toMatchObject({ purpose: 'STEP_UP' });
  });

  it('resumes the same initiation with the same key, and claims nothing by itself', async () => {
    await reachStepUp();
    expect(initiateMock).toHaveBeenCalledTimes(1);

    initiateMock.mockResolvedValue(envelopeOf(makeAttempt()));
    await completeVerification();

    await screen.findByText(COPY.instructions.panelTitle);
    expect(initiateMock).toHaveBeenCalledTimes(2);
    const keyOf = (call: number) =>
      (initiateMock.mock.calls[call]?.[1]?.config?.headers as Record<string, string>)[
        'Idempotency-Key'
      ];
    // One customer action that needed evidence half-way through — not two.
    expect(keyOf(0)).toBe(keyOf(1));
    // A verified code is not a payment: the attempt is PENDING and the screen
    // still says the workshop has to confirm.
    expect(screen.getByText(COPY.instructions.waitingBody)).toBeInTheDocument();
    expect(screen.queryByText(COPY.confirmed.title)).not.toBeInTheDocument();
  });

  it('leaves no attempt behind when the customer dismisses it', async () => {
    await reachStepUp();

    fireEvent.click(screen.getByRole('button', { name: COPY.stepUp.cancel }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: COPY.preAttempt.startAction })).toBeEnabled();
    expect(screen.queryByText(COPY.instructions.panelTitle)).not.toBeInTheDocument();
    expect(initiateMock).toHaveBeenCalledTimes(1);
  });
});
