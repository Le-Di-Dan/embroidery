/**
 * Step-up re-verification inside `/truy-cap/bao-gia` (`APP6-S01` §8, §9).
 *
 * Four things are proved here and nowhere else:
 *
 * 1. the flow stays on this route — a navigation to `/xac-minh-lien-he` would
 *    unmount the secure session and destroy the credential;
 * 2. the challenge is issued with `purpose: STEP_UP`, not the submission
 *    purpose the same machinery uses on `APP4-S01`;
 * 3. a completed verification **never** accepts by itself — it triggers the
 *    mandatory re-read and then hands the decision back to the customer;
 * 4. a version that changed while the customer was verifying lands on the stale
 *    frame rather than accepting a price they never saw.
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

import { SecureQuotationScreen } from '../../src/features/secure-quotation/ui/secure-quotation-screen';
import { SECURE_QUOTATION_COPY as COPY } from '../../src/features/secure-quotation/model/secure-quotation-copy';
import { VERIFICATION_COPY } from '../../src/features/contact-verification/model/verification-copy';
import { TEST_TOKEN, apiFailure, envelopeOf } from '../support/secure-link-fixture';
import {
  TEST_CODE,
  TEST_EMAIL,
  envelopeOf as verificationEnvelope,
  makeChallenge,
  makeStatus,
} from '../support/verification-fixture';
import {
  NEWER_VERSION_ID,
  VERSION_ID,
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

beforeEach(() => {
  jest.clearAllMocks();
  navigateToQuotation('');
  issueMock.mockResolvedValue(verificationEnvelope(makeChallenge()));
  attemptMock.mockResolvedValue(verificationEnvelope(makeStatus('VERIFIED')));
  statusMock.mockResolvedValue(verificationEnvelope(makeStatus('VERIFIED')));
  resendMock.mockResolvedValue(verificationEnvelope(makeChallenge()));
});

/** Opens the quotation, presses accept, confirms, and lands on the step-up. */
async function reachStepUp() {
  acceptMock.mockRejectedValue(apiFailure(403, 'REVERIFICATION_REQUIRED'));
  navigateToQuotation(`#t=${TEST_TOKEN}`);
  renderWithProviders(<SecureQuotationScreen />, { queryClient: createTestQueryClient() });
  await screen.findByText(COPY.titles.live);

  fireEvent.click(screen.getByRole('button', { name: COPY.actions.accept }));
  fireEvent.click(screen.getByRole('button', { name: COPY.acceptConfirm.confirm }));
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

describe('APP6-S01 — embedded step-up', () => {
  it('opens inside the same route rather than navigating to the verification page', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeQuotation()));
    await reachStepUp();

    expect(window.location.pathname).toBe('/truy-cap/bao-gia');
    expect(screen.getByRole('dialog')).toHaveTextContent(COPY.stepUp.title);
    // The quotation is still mounted behind the scrim, not replaced.
    expect(screen.getByText(COPY.titles.live)).toBeInTheDocument();
  });

  it('issues the challenge with the step-up purpose', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeQuotation()));
    await reachStepUp();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: TEST_EMAIL } });
    fireEvent.click(screen.getByRole('button', { name: VERIFICATION_COPY.contactEntry.submit }));

    await waitFor(() => expect(issueMock).toHaveBeenCalledTimes(1));
    expect(issueMock.mock.calls[0]?.[0]).toMatchObject({ purpose: 'STEP_UP' });
  });

  it('re-reads the quotation after verification and never accepts on its own', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeQuotation()));
    await reachStepUp();
    expect(currentMock).toHaveBeenCalledTimes(1);

    await completeVerification();

    // The mandatory re-read happened…
    await waitFor(() => expect(currentMock).toHaveBeenCalledTimes(2));
    // …and the customer is back at the confirmation, not at a committed
    // acceptance. Verification is evidence, never consent.
    expect(await screen.findByText(COPY.acceptConfirm.title)).toBeInTheDocument();
    expect(acceptMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(COPY.accepted.title)).not.toBeInTheDocument();
  });

  it('commits only when the customer accepts again, against the same exact version', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeQuotation()));
    await reachStepUp();
    await completeVerification();
    await screen.findByText(COPY.acceptConfirm.title);

    acceptMock.mockReset();
    acceptMock.mockResolvedValue(envelopeOf(makeAccepted()));
    fireEvent.click(screen.getByRole('button', { name: COPY.acceptConfirm.confirm }));

    expect(await screen.findByText(COPY.accepted.title)).toBeInTheDocument();
    expect(acceptMock.mock.calls[0]?.[0]).toMatchObject({ versionId: VERSION_ID });
  });

  it('lands on the stale frame when the version changed while the customer verified', async () => {
    currentMock
      .mockResolvedValueOnce(envelopeOf(makeQuotation()))
      .mockResolvedValueOnce(
        envelopeOf(makeQuotation({ version: 3, versionId: NEWER_VERSION_ID })),
      );
    await reachStepUp();
    await completeVerification();

    expect(await screen.findByText(COPY.stale.title)).toBeInTheDocument();
    expect(screen.queryByText(COPY.accepted.title)).not.toBeInTheDocument();
    expect(acceptMock).toHaveBeenCalledTimes(1);
  });

  it('leaves the decision unmade when the customer dismisses the step-up', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeQuotation()));
    await reachStepUp();

    fireEvent.click(screen.getByRole('button', { name: COPY.stepUp.cancel }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: COPY.actions.accept })).toBeEnabled();
    expect(acceptMock).toHaveBeenCalledTimes(1);
  });
});
