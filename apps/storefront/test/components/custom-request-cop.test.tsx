/**
 * The customer-owned branch of `APP5-S01`, plus the three shared mechanisms the
 * catalog suite does not exercise: the retained verified challenge, the upload
 * gate, and submit-once.
 *
 * The upload assertions are deliberately about the *seam*: that the header
 * `APP5-B02` arbitrates by reaches the generated operation's per-call config,
 * and that `bindable` — not a state comparison — is what lets an id into a
 * submission.
 */
import {
  publicCustomRequestAssetStatus,
  publicCustomRequestAssetUpload,
  publicCustomRequestSubmit,
  publicVerificationIssue,
  publicVerificationSubmitAttempt,
  VerificationChallengeStatusResponseState,
} from '@embroidery/api-client';
import {
  createNavigationMock as mockCreateNavigationMock,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import { useRouter } from 'next/navigation';

import { VERIFICATION_COPY } from '../../src/features/contact-verification/model/verification-copy';
import { CUSTOM_REQUEST_COPY } from '../../src/features/custom-request/model/custom-request-copy';
import { CustomRequestScreen } from '../../src/features/custom-request/ui/custom-request-screen';
import {
  ACCEPTED_STATUS,
  envelopeFailure,
  envelopeOf,
  INSPECTING_STATUS,
  makeImageFile,
  makeIntake,
  makeSubmission,
  networkFailure,
  REJECTED_STATUS,
  REQUEST_CODE,
} from '../support/custom-request-fixture';
import {
  CHALLENGE_ID,
  makeChallenge,
  makeStatus,
  TEST_EMAIL,
} from '../support/verification-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/yeu-cau/moi').module);

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicCustomRequestAssetUpload: jest.fn(),
  publicCustomRequestAssetStatus: jest.fn(),
  publicCustomRequestSubmit: jest.fn(),
  publicVerificationIssue: jest.fn(),
  publicVerificationSubmitAttempt: jest.fn(),
}));

const uploadMock = publicCustomRequestAssetUpload as jest.MockedFunction<
  typeof publicCustomRequestAssetUpload
>;
const statusMock = publicCustomRequestAssetStatus as jest.MockedFunction<
  typeof publicCustomRequestAssetStatus
>;
const submitMock = publicCustomRequestSubmit as jest.MockedFunction<
  typeof publicCustomRequestSubmit
>;
const issueMock = publicVerificationIssue as jest.MockedFunction<typeof publicVerificationIssue>;
const attemptMock = publicVerificationSubmitAttempt as jest.MockedFunction<
  typeof publicVerificationSubmitAttempt
>;

const router = useRouter() as unknown as { push: jest.Mock };

/**
 * The per-call headers of one upload attempt.
 *
 * Axios types `headers` loosely enough that indexing it yields `any`, so it is
 * narrowed once here rather than in each assertion — an `any` in a test is a
 * hole in exactly the check the test exists to make.
 */
function uploadHeaders(callIndex: number): Record<string, unknown> {
  const options = uploadMock.mock.calls[callIndex]?.[3];
  return options?.config?.headers ?? {};
}

const button = (name: string) => screen.getByRole('button', { name });
const itemNameField = () =>
  screen.getByRole('textbox', { name: CUSTOM_REQUEST_COPY.customerOwned.nameLabel });
const quantityField = () =>
  screen.getByRole('textbox', { name: CUSTOM_REQUEST_COPY.quantity.quantityLabel });

beforeEach(() => {
  jest.clearAllMocks();
  globalThis.localStorage.clear();
  globalThis.history.replaceState({}, '', '/yeu-cau/moi');
  issueMock.mockResolvedValue(envelopeOf(makeChallenge()));
  attemptMock.mockResolvedValue(
    envelopeOf(makeStatus(VerificationChallengeStatusResponseState.VERIFIED)),
  );
});

/** Step 1 on the customer-owned branch, filled in the approved order. */
function describeItem(): void {
  renderWithProviders(<CustomRequestScreen />);
  fireEvent.click(
    screen.getByRole('radio', { name: new RegExp(CUSTOM_REQUEST_COPY.chooser.customerOwned) }),
  );
  fireEvent.change(itemNameField(), { target: { value: 'Áo khoác jean' } });
  fireEvent.change(quantityField(), { target: { value: '1' } });
}

/** Step 2: APP4's own flow, driven by its own copy. */
async function verifyContact(): Promise<void> {
  fireEvent.click(button(CUSTOM_REQUEST_COPY.steps.continueToVerify));
  fireEvent.change(
    await screen.findByRole('textbox', { name: VERIFICATION_COPY.emailField.label }),
    { target: { value: TEST_EMAIL } },
  );
  fireEvent.click(button(VERIFICATION_COPY.contactEntry.submit));
  fireEvent.change(
    await screen.findByRole('textbox', { name: VERIFICATION_COPY.codeEntry.fieldLabel }),
    { target: { value: '012345' } },
  );
  fireEvent.click(button(VERIFICATION_COPY.codeEntry.submit));
  await screen.findByLabelText(CUSTOM_REQUEST_COPY.upload.chooseCopImage);
}

function attachItemPhoto(): void {
  const input = screen.getByLabelText(CUSTOM_REQUEST_COPY.upload.chooseCopImage);
  fireEvent.change(input, { target: { files: [makeImageFile()] } });
}

async function reachReviewWithAcceptedPhoto(): Promise<void> {
  uploadMock.mockResolvedValue(envelopeOf(makeIntake()));
  statusMock.mockResolvedValue(envelopeOf(ACCEPTED_STATUS));
  describeItem();
  await verifyContact();
  attachItemPhoto();
  await screen.findByText(CUSTOM_REQUEST_COPY.upload.accepted);
  await waitFor(() => expect(button(CUSTOM_REQUEST_COPY.submit.action)).toBeEnabled());
}

describe('APP5-S01 — customer-owned step 1', () => {
  it('requires an item name before the flow may continue', () => {
    renderWithProviders(<CustomRequestScreen />);
    fireEvent.click(
      screen.getByRole('radio', { name: new RegExp(CUSTOM_REQUEST_COPY.chooser.customerOwned) }),
    );

    fireEvent.click(button(CUSTOM_REQUEST_COPY.steps.continueToVerify));

    expect(screen.getByText(CUSTOM_REQUEST_COPY.customerOwned.nameRequired)).toBeInTheDocument();
    expect(itemNameField()).toHaveAttribute('aria-invalid', 'true');
    // Still on step 1: no verification was requested.
    expect(issueMock).not.toHaveBeenCalled();
  });

  it('renders no catalog control on this branch', () => {
    describeItem();

    expect(screen.queryByText(CUSTOM_REQUEST_COPY.catalog.variantLegend)).not.toBeInTheDocument();
    expect(screen.queryByText(CUSTOM_REQUEST_COPY.catalog.heading)).not.toBeInTheDocument();
  });
});

describe('APP5-S01 — verification gates step 3', () => {
  it('offers no uploader and no submit before a contact is verified', () => {
    describeItem();

    expect(
      screen.queryByLabelText(CUSTOM_REQUEST_COPY.upload.chooseCopImage),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: CUSTOM_REQUEST_COPY.submit.action }),
    ).not.toBeInTheDocument();
  });

  it('retains the verified challenge id APP4 drops, and scopes both calls by it', async () => {
    uploadMock.mockResolvedValue(envelopeOf(makeIntake()));
    statusMock.mockResolvedValue(envelopeOf(ACCEPTED_STATUS));
    submitMock.mockResolvedValue(envelopeOf(makeSubmission()));

    describeItem();
    await verifyContact();
    attachItemPhoto();

    // The upload is addressed by the challenge APP4 has already forgotten.
    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    expect(uploadMock.mock.calls[0]![0]).toBe(CHALLENGE_ID);

    await screen.findByText(CUSTOM_REQUEST_COPY.upload.accepted);
    const submit = button(CUSTOM_REQUEST_COPY.submit.action);
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    expect(submitMock.mock.calls[0]![0].challengeId).toBe(CHALLENGE_ID);
  });
});

describe('APP5-S01 — upload seam (APP5-B02)', () => {
  it('sends the Idempotency-Key through the generated operation request options', async () => {
    uploadMock.mockResolvedValue(envelopeOf(makeIntake()));
    statusMock.mockResolvedValue(envelopeOf(ACCEPTED_STATUS));
    describeItem();
    await verifyContact();
    attachItemPhoto();

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    const [, body, params] = uploadMock.mock.calls[0]!;
    expect(body.file).toBeInstanceOf(File);
    expect(params).toEqual({ role: 'COP_IMAGE' });
    // Exactly one header, and it is the one `APP5-B02` arbitrates by.
    expect(Object.keys(uploadHeaders(0))).toEqual(['Idempotency-Key']);
    expect(typeof uploadHeaders(0)['Idempotency-Key']).toBe('string');
    // Content-Type is left to Axios so the multipart boundary survives.
    expect(uploadHeaders(0)).not.toHaveProperty('Content-Type');
  });

  it('reuses the same key when the customer retries one upload', async () => {
    uploadMock.mockRejectedValueOnce(networkFailure());
    describeItem();
    await verifyContact();
    attachItemPhoto();

    await screen.findByText(CUSTOM_REQUEST_COPY.uploadFailure.GENERIC);
    const firstKey = uploadHeaders(0)['Idempotency-Key'];

    uploadMock.mockResolvedValue(envelopeOf(makeIntake()));
    statusMock.mockResolvedValue(envelopeOf(ACCEPTED_STATUS));
    fireEvent.click(button(CUSTOM_REQUEST_COPY.upload.retry));

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(2));
    expect(uploadHeaders(1)['Idempotency-Key']).toBe(firstKey);
  });

  it('refuses an oversized file without making a request', async () => {
    describeItem();
    await verifyContact();

    const huge = new File([new Uint8Array(4)], 'to.png', { type: 'image/png' });
    Object.defineProperty(huge, 'size', { value: 11 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText(CUSTOM_REQUEST_COPY.upload.chooseCopImage), {
      target: { files: [huge] },
    });

    expect(
      await screen.findByText(CUSTOM_REQUEST_COPY.uploadFailure.TOO_LARGE),
    ).toBeInTheDocument();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('shows inspection in progress and blocks submission until it resolves', async () => {
    uploadMock.mockResolvedValue(envelopeOf(makeIntake()));
    statusMock.mockResolvedValue(envelopeOf(INSPECTING_STATUS));
    describeItem();
    await verifyContact();
    attachItemPhoto();

    expect(await screen.findByText(CUSTOM_REQUEST_COPY.upload.inspecting)).toBeInTheDocument();
    expect(button(CUSTOM_REQUEST_COPY.submit.action)).toBeDisabled();
  });

  it('keeps a rejected image out of the submission and says only a bounded reason', async () => {
    uploadMock.mockResolvedValue(envelopeOf(makeIntake()));
    statusMock.mockResolvedValue(envelopeOf(REJECTED_STATUS));
    describeItem();
    await verifyContact();
    attachItemPhoto();

    expect(await screen.findByText(CUSTOM_REQUEST_COPY.upload.rejected)).toBeInTheDocument();
    // The COP branch has no bindable item photo, so submission stays blocked.
    expect(button(CUSTOM_REQUEST_COPY.submit.action)).toBeDisabled();
  });

  it('treats an ACCEPTED-but-not-bindable id as unusable', async () => {
    uploadMock.mockResolvedValue(envelopeOf(makeIntake()));
    statusMock.mockResolvedValue(envelopeOf({ ...ACCEPTED_STATUS, bindable: false }));
    describeItem();
    await verifyContact();
    attachItemPhoto();

    await screen.findByText(CUSTOM_REQUEST_COPY.upload.accepted);
    // The published state says accepted; `bindable` says no, and `bindable` is
    // what decides whether the request may be submitted.
    expect(button(CUSTOM_REQUEST_COPY.submit.action)).toBeDisabled();
  });
});

describe('APP5-S01 — submission safety (656:74, 656:119, 656:213)', () => {
  it('sends a customer-owned payload with no catalog or session field', async () => {
    submitMock.mockResolvedValue(envelopeOf(makeSubmission()));
    await reachReviewWithAcceptedPhoto();

    fireEvent.click(button(CUSTOM_REQUEST_COPY.submit.action));

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    const [body] = submitMock.mock.calls[0]!;
    expect(body.customerOwnedProduct).toEqual({ name: 'Áo khoác jean' });
    expect(body).not.toHaveProperty('catalog');
    expect(JSON.stringify(body)).not.toContain('productVariantId');
    expect(JSON.stringify(body)).not.toContain('designSessionId');
    expect(body.assets).toEqual([{ assetId: 'asset-cop-0001', role: 'COP_IMAGE' }]);
  });

  it('fires one mutation for a double click', async () => {
    let release: (() => void) | undefined;
    submitMock.mockReturnValue(
      new Promise((resolve) => {
        release = () => {
          resolve(envelopeOf(makeSubmission()));
        };
      }),
    );
    await reachReviewWithAcceptedPhoto();

    const submit = button(CUSTOM_REQUEST_COPY.submit.action);
    // Both clicks land before React re-renders the button as disabled, which is
    // exactly the case the hook's synchronous in-flight ref exists for.
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(CUSTOM_REQUEST_COPY.submit.submitting)).toBeInTheDocument();
    // And still one after the render settles.
    expect(submitMock).toHaveBeenCalledTimes(1);
    expect(button(CUSTOM_REQUEST_COPY.submit.submitting)).toBeDisabled();
    release?.();
  });

  it('treats a replayed result as the success it is', async () => {
    // A replay is indistinguishable from the original: same code, same 201.
    submitMock.mockResolvedValue(envelopeOf(makeSubmission()));
    await reachReviewWithAcceptedPhoto();

    fireEvent.click(button(CUSTOM_REQUEST_COPY.submit.action));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(`/yeu-cau/da-gui?ma=${REQUEST_CODE}`),
    );
    expect(screen.queryByText(CUSTOM_REQUEST_COPY.submit.failed)).not.toBeInTheDocument();
  });

  it('offers a safe retry when the outcome is unknown, keeping what was entered', async () => {
    submitMock.mockRejectedValueOnce(networkFailure());
    await reachReviewWithAcceptedPhoto();

    fireEvent.click(button(CUSTOM_REQUEST_COPY.submit.action));

    expect(await screen.findByText(CUSTOM_REQUEST_COPY.submit.uncertain)).toBeInTheDocument();
    // Nothing was reset — the same body is still there to re-send.
    submitMock.mockResolvedValue(envelopeOf(makeSubmission()));
    fireEvent.click(button(CUSTOM_REQUEST_COPY.submit.retry));

    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(2));
    expect(submitMock.mock.calls[1]![0]).toEqual(submitMock.mock.calls[0]![0]);
  });

  it('recovers from an idempotency conflict without starting a request on its own', async () => {
    submitMock.mockRejectedValue(envelopeFailure(409, 'IDEMPOTENCY_CONFLICT'));
    await reachReviewWithAcceptedPhoto();

    fireEvent.click(button(CUSTOM_REQUEST_COPY.submit.action));

    expect(await screen.findByText(CUSTOM_REQUEST_COPY.submit.conflict)).toBeInTheDocument();
    // No retry is offered, and no fresh challenge was issued behind the scenes.
    expect(
      screen.queryByRole('button', { name: CUSTOM_REQUEST_COPY.submit.retry }),
    ).not.toBeInTheDocument();
    expect(button(CUSTOM_REQUEST_COPY.submit.conflictAction)).toBeInTheDocument();
    expect(issueMock).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('never renders the server’s own refusal prose', async () => {
    submitMock.mockRejectedValue(envelopeFailure(422, 'REQUEST_ASSET_NOT_BINDABLE'));
    await reachReviewWithAcceptedPhoto();

    fireEvent.click(button(CUSTOM_REQUEST_COPY.submit.action));

    expect(
      await screen.findByText(CUSTOM_REQUEST_COPY.submit.assetNotBindable),
    ).toBeInTheDocument();
    // The fixture's message carries a constraint name; §12 keeps it off screen.
    expect(document.body.textContent).not.toContain('fk_custom_requests__product_variant_id');
    expect(document.body.textContent).not.toContain('internal detail');
  });
});
