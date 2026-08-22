/**
 * The two decisions inside `/truy-cap/duyet-thiet-ke`: the embedded step-up
 * that guards an approval, and the revision request that deliberately has no
 * guard at all (`APP6-S02` §7, §13, §18, §19).
 *
 * Five things are proved here and nowhere else:
 *
 * 1. the step-up stays on this route — a navigation to `/xac-minh-lien-he`
 *    would unmount the secure session and destroy the credential;
 * 2. the challenge is issued with `purpose: STEP_UP`, not the submission
 *    purpose the same machinery uses on `APP4-S01`;
 * 3. a completed verification **never** approves by itself — it triggers the
 *    mandatory re-read and then hands the decision back to the customer;
 * 4. a design, or a set of terms, that changed while the customer was verifying
 *    lands on the right one of two different frames;
 * 5. asking for a revision requires no step-up, no consent and no hash, and
 *    claims nothing about what happens next.
 */
import {
  publicDesignReviewApprove,
  publicDesignReviewCurrent,
  publicDesignReviewRequestRevision,
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

import { VERIFICATION_COPY } from '../../src/features/contact-verification/model/verification-copy';
import { DESIGN_REVIEW_COPY as COPY } from '../../src/features/secure-design-review/model/design-review-copy';
import { SecureDesignReviewScreen } from '../../src/features/secure-design-review/ui/secure-design-review-screen';
import { TEST_TOKEN, apiFailure, envelopeOf } from '../support/secure-link-fixture';
import {
  TEST_CODE,
  TEST_EMAIL,
  envelopeOf as verificationEnvelope,
  makeChallenge,
  makeStatus,
} from '../support/verification-fixture';
import {
  DOCUMENT_HASH,
  NEWER_DOCUMENT_HASH,
  NEWER_VERSION_ID,
  REPUBLISHED_CONTENT_HASH,
  VERSION_ID,
  makeApproved,
  makeReview,
  makeRevisionRequested,
  navigateToDesignReview,
  paymentAgreement,
  returnAgreement,
} from '../support/secure-design-review-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicDesignReviewCurrent: jest.fn(),
  publicDesignReviewApprove: jest.fn(),
  publicDesignReviewRequestRevision: jest.fn(),
  publicVerificationIssue: jest.fn(),
  publicVerificationResend: jest.fn(),
  publicVerificationSubmitAttempt: jest.fn(),
  publicVerificationReadStatus: jest.fn(),
}));

const currentMock = publicDesignReviewCurrent as jest.MockedFunction<
  typeof publicDesignReviewCurrent
>;
const approveMock = publicDesignReviewApprove as jest.MockedFunction<
  typeof publicDesignReviewApprove
>;
const reviseMock = publicDesignReviewRequestRevision as jest.MockedFunction<
  typeof publicDesignReviewRequestRevision
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
  navigateToDesignReview('');
  issueMock.mockResolvedValue(verificationEnvelope(makeChallenge()));
  attemptMock.mockResolvedValue(verificationEnvelope(makeStatus('VERIFIED')));
  statusMock.mockResolvedValue(verificationEnvelope(makeStatus('VERIFIED')));
  resendMock.mockResolvedValue(verificationEnvelope(makeChallenge()));
});

async function openReview() {
  navigateToDesignReview(`#t=${TEST_TOKEN}`);
  renderWithProviders(<SecureDesignReviewScreen />, { queryClient: createTestQueryClient() });
  await screen.findByRole('heading', { level: 1, name: COPY.titles.review });
}

function acceptAllTerms() {
  for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box);
}

/** Opens the review, ticks the terms, approves, confirms, lands on the step-up. */
async function reachStepUp() {
  approveMock.mockRejectedValue(apiFailure(403, 'REVERIFICATION_REQUIRED'));
  await openReview();
  acceptAllTerms();
  fireEvent.click(screen.getByTestId('design-review-approve'));
  fireEvent.click(await screen.findByTestId('design-review-approve-confirm'));
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

describe('APP6-S02 — embedded step-up', () => {
  it('opens inside the same route rather than navigating to the verification page', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeReview()));
    await reachStepUp();

    expect(window.location.pathname).toBe('/truy-cap/duyet-thiet-ke');
    expect(screen.getByRole('dialog')).toHaveTextContent(COPY.stepUp.title);
    // The review is still mounted behind the scrim, not replaced.
    expect(screen.getByRole('heading', { level: 1, name: COPY.titles.review })).toBeInTheDocument();
  });

  it('issues the challenge with the step-up purpose', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeReview()));
    await reachStepUp();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: TEST_EMAIL } });
    fireEvent.click(screen.getByRole('button', { name: VERIFICATION_COPY.contactEntry.submit }));

    await waitFor(() => {
      expect(issueMock).toHaveBeenCalledTimes(1);
    });
    expect(issueMock.mock.calls[0]?.[0]).toMatchObject({ purpose: 'STEP_UP' });
  });

  it('re-reads the review after verification and never approves on its own', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeReview()));
    await reachStepUp();
    expect(currentMock).toHaveBeenCalledTimes(1);

    await completeVerification();

    // The mandatory re-read happened…
    await waitFor(() => {
      expect(currentMock).toHaveBeenCalledTimes(2);
    });
    // …and the customer is back at the confirmation, not at a committed
    // approval. Verification is evidence, never consent.
    expect(await screen.findByText(COPY.approveConfirm.title)).toBeInTheDocument();
    expect(approveMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('design-review-approved')).toBeNull();
  });

  it('commits only when the customer approves again, against the same exact decision', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeReview()));
    await reachStepUp();
    await completeVerification();
    await screen.findByText(COPY.approveConfirm.title);

    approveMock.mockReset();
    approveMock.mockResolvedValue(envelopeOf(makeApproved()));
    fireEvent.click(screen.getByTestId('design-review-approve-confirm'));

    expect(await screen.findByTestId('design-review-approved')).toBeInTheDocument();
    expect(approveMock.mock.calls[0]?.[0]).toMatchObject({
      versionId: VERSION_ID,
      documentHash: DOCUMENT_HASH,
    });
  });

  it('clears the approval intent when the design changed while the customer verified', async () => {
    currentMock.mockResolvedValueOnce(envelopeOf(makeReview())).mockResolvedValueOnce(
      envelopeOf(
        makeReview({
          designVersionId: NEWER_VERSION_ID,
          documentHash: NEWER_DOCUMENT_HASH,
          version: 3,
        }),
      ),
    );
    await reachStepUp();
    await completeVerification();

    expect(await screen.findByText(COPY.mismatch.title)).toBeInTheDocument();
    expect(screen.queryByTestId('design-review-approved')).toBeNull();
    expect(approveMock).toHaveBeenCalledTimes(1);
  });

  /*
   * The same hash on a *new* version id is still a design change. Comparing on
   * the id alone, or the hash alone, would let one of the two through.
   */
  it('treats a changed hash on the same version id as a design change', async () => {
    currentMock
      .mockResolvedValueOnce(envelopeOf(makeReview()))
      .mockResolvedValueOnce(envelopeOf(makeReview({ documentHash: NEWER_DOCUMENT_HASH })));
    await reachStepUp();
    await completeVerification();

    expect(await screen.findByText(COPY.mismatch.title)).toBeInTheDocument();
  });

  it('calls a terms-only change a terms change, not a version mismatch', async () => {
    currentMock.mockResolvedValueOnce(envelopeOf(makeReview())).mockResolvedValueOnce(
      envelopeOf(
        makeReview({
          agreements: [
            paymentAgreement({ contentHash: REPUBLISHED_CONTENT_HASH, content: 'Nội dung mới.' }),
            returnAgreement(),
          ],
        }),
      ),
    );
    await reachStepUp();
    await completeVerification();

    expect(await screen.findByText(COPY.termsChanged.title)).toBeInTheDocument();
    expect(screen.queryByText(COPY.mismatch.title)).toBeNull();
    // And every box must be ticked again before approval is offered.
    expect(screen.getByTestId('design-review-approve')).toBeDisabled();
    expect(approveMock).toHaveBeenCalledTimes(1);
  });

  it('leaves the decision unmade when the customer dismisses the step-up', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeReview()));
    await reachStepUp();

    fireEvent.click(screen.getByRole('button', { name: COPY.stepUp.cancel }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(approveMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('design-review-approved')).toBeNull();
  });
});

describe('APP6-S02 — requesting a revision', () => {
  async function openRevisionForm() {
    currentMock.mockResolvedValue(envelopeOf(makeReview()));
    await openReview();
    fireEvent.click(screen.getByTestId('design-review-request-revision'));
    await screen.findByText(COPY.revision.title);
  }

  it('is offered without any agreement being accepted', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeReview()));
    await openReview();

    expect(screen.getByTestId('design-review-approve')).toBeDisabled();
    expect(screen.getByTestId('design-review-request-revision')).toBeEnabled();
  });

  it('refuses empty and whitespace-only feedback without sending anything', async () => {
    await openRevisionForm();

    fireEvent.click(screen.getByTestId('design-review-revision-submit'));
    expect(await screen.findByText(COPY.revision.required)).toBeInTheDocument();
    expect(reviseMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('design-review-revision-feedback'), {
      target: { value: '    ' },
    });
    fireEvent.click(screen.getByTestId('design-review-revision-submit'));
    expect(reviseMock).not.toHaveBeenCalled();
  });

  it('sends the exact version and the trimmed feedback, and nothing else', async () => {
    reviseMock.mockResolvedValue(envelopeOf(makeRevisionRequested()));
    await openRevisionForm();

    fireEvent.change(screen.getByTestId('design-review-revision-feedback'), {
      target: { value: '  Chữ ngực trái cần lớn hơn.  ' },
    });
    fireEvent.click(screen.getByTestId('design-review-revision-submit'));

    await waitFor(() => {
      expect(reviseMock).toHaveBeenCalledTimes(1);
    });
    const body = reviseMock.mock.calls[0]?.[0];
    expect(body).toEqual({
      token: TEST_TOKEN,
      versionId: VERSION_ID,
      feedback: 'Chữ ngực trái cần lớn hơn.',
    });
    // Structurally impossible to carry either, and asserted anyway.
    expect(Object.keys(body ?? {})).not.toContain('documentHash');
    expect(Object.keys(body ?? {})).not.toContain('acceptedAgreements');
  });

  it('requires no step-up', async () => {
    reviseMock.mockResolvedValue(envelopeOf(makeRevisionRequested()));
    await openRevisionForm();

    fireEvent.change(screen.getByTestId('design-review-revision-feedback'), {
      target: { value: 'Đổi màu chỉ sang trắng.' },
    });
    fireEvent.click(screen.getByTestId('design-review-revision-submit'));

    await waitFor(() => {
      expect(reviseMock).toHaveBeenCalledTimes(1);
    });
    expect(issueMock).not.toHaveBeenCalled();
    expect(screen.queryByText(COPY.stepUp.title)).toBeNull();
  });

  it('sends one request when the form is submitted twice in the same tick', async () => {
    reviseMock.mockResolvedValue(envelopeOf(makeRevisionRequested()));
    await openRevisionForm();

    fireEvent.change(screen.getByTestId('design-review-revision-feedback'), {
      target: { value: 'Đổi màu chỉ sang trắng.' },
    });
    const submit = screen.getByTestId('design-review-revision-submit');
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => {
      expect(reviseMock).toHaveBeenCalledTimes(1);
    });
  });

  it('reports the committed decision and predicts nothing about what follows', async () => {
    reviseMock.mockResolvedValue(envelopeOf(makeRevisionRequested()));
    await openRevisionForm();

    fireEvent.change(screen.getByTestId('design-review-revision-feedback'), {
      target: { value: 'Đổi màu chỉ sang trắng.' },
    });
    fireEvent.click(screen.getByTestId('design-review-revision-submit'));

    const outcome = await screen.findByTestId('design-review-revision-requested');
    expect(outcome).toHaveTextContent(COPY.revisionRequested.scope);
    // No claim that a new draft exists, that the request moved, or that the
    // workshop agreed. The server's own status projection is not printed.
    const text = outcome.textContent ?? '';
    expect(text).not.toContain('DESIGN_REVIEW');
    expect(text).not.toContain('REVISION_REQUESTED');
    expect(text).not.toContain('bản mới đã');
  });

  it('reconciles once on a first-decision-wins conflict, without retrying', async () => {
    reviseMock.mockRejectedValue(apiFailure(409, 'INVALID_TRANSITION'));
    await openRevisionForm();

    fireEvent.change(screen.getByTestId('design-review-revision-feedback'), {
      target: { value: 'Đổi màu chỉ sang trắng.' },
    });
    fireEvent.click(screen.getByTestId('design-review-revision-submit'));

    expect(await screen.findByText(COPY.notices.INVALID_TRANSITION.title)).toBeInTheDocument();
    expect(reviseMock).toHaveBeenCalledTimes(1);
    expect(currentMock).toHaveBeenCalledTimes(2);
  });

  it('ends the session into the shared unavailable card when the grant is gone', async () => {
    reviseMock.mockRejectedValue(apiFailure(404, 'SECURE_LINK_UNAVAILABLE'));
    await openRevisionForm();

    fireEvent.change(screen.getByTestId('design-review-revision-feedback'), {
      target: { value: 'Đổi màu chỉ sang trắng.' },
    });
    fireEvent.click(screen.getByTestId('design-review-revision-submit'));

    await waitFor(() => {
      expect(screen.queryByTestId('design-review-revision-requested')).toBeNull();
    });
    expect(currentMock).toHaveBeenCalledTimes(1);
  });
});
