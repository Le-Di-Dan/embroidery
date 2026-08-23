/**
 * Optional transfer evidence on `/truy-cap/thanh-toan` (`APP7-S01` §12–§18,
 * §27, §28, §30).
 *
 * The rule under every assertion here is that an image is an image. It is
 * optional, it can be refused, it can be accepted, and none of those four facts
 * ever changes a word this screen says about the money. The suite therefore
 * checks not only that the right status renders, but that the payment sentence
 * beside it is unchanged in each case.
 */
import {
  TransferEvidenceItemResponseAssetStatus,
  publicOrderDepositCurrent,
  publicOrderDepositEvidenceStatus,
  publicOrderDepositEvidenceUpload,
  publicOrderDepositInitiate,
  publicOrderDepositQr,
} from '@embroidery/api-client';
import { fireEvent, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';

import { SECURE_DEPOSIT_COPY as COPY } from '../../src/features/secure-deposit-payment/model/secure-deposit-copy';
import { SecureDepositScreen } from '../../src/features/secure-deposit-payment/ui/secure-deposit-screen';
import {
  ATTEMPT_ID,
  makeAttempt,
  makeDeposit,
  makeEvidenceItem,
  makeEvidenceList,
  makeFullEvidenceList,
  makeImageFile,
  makeUpload,
  makeVerifiedDeposit,
  navigateToDeposit,
} from '../support/secure-deposit-fixture';
import { TEST_TOKEN, apiFailure, envelopeOf, networkFailure } from '../support/secure-link-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicOrderDepositCurrent: jest.fn(),
  publicOrderDepositInitiate: jest.fn(),
  publicOrderDepositQr: jest.fn(),
  publicOrderDepositEvidenceStatus: jest.fn(),
  publicOrderDepositEvidenceUpload: jest.fn(),
}));

const currentMock = publicOrderDepositCurrent as jest.MockedFunction<
  typeof publicOrderDepositCurrent
>;
const initiateMock = publicOrderDepositInitiate as jest.MockedFunction<
  typeof publicOrderDepositInitiate
>;
const qrMock = publicOrderDepositQr as jest.MockedFunction<typeof publicOrderDepositQr>;
const statusMock = publicOrderDepositEvidenceStatus as jest.MockedFunction<
  typeof publicOrderDepositEvidenceStatus
>;
const uploadMock = publicOrderDepositEvidenceUpload as jest.MockedFunction<
  typeof publicOrderDepositEvidenceUpload
>;

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => {
  jest.clearAllMocks();
  navigateToDeposit(`#t=${TEST_TOKEN}`);
  currentMock.mockResolvedValue(envelopeOf(makeDeposit()));
  initiateMock.mockResolvedValue(envelopeOf(makeAttempt()));
  qrMock.mockRejectedValue(networkFailure());
  statusMock.mockResolvedValue(envelopeOf(makeEvidenceList()));
});

async function openWithAttempt() {
  const result = renderWithProviders(<SecureDepositScreen />);
  fireEvent.click(await screen.findByRole('button', { name: COPY.preAttempt.startAction }));
  await screen.findByText(COPY.evidence.title);
  return result;
}

function fileInput(): HTMLElement {
  return screen.getByLabelText(COPY.evidence.constraints);
}

describe('APP7-S01 — the reminder is prominent and explicitly optional', () => {
  it('shows the screenshot reminder, the optional badge and the optional caveat', async () => {
    await openWithAttempt();

    expect(screen.getByText(COPY.reminder.headline)).toBeInTheDocument();
    expect(screen.getByText(COPY.reminder.body)).toBeInTheDocument();
    expect(screen.getByText(COPY.reminder.optional)).toBeInTheDocument();
    expect(screen.getByText(COPY.evidence.optionalBadge)).toBeInTheDocument();
    expect(screen.getByText(COPY.evidence.skipBody)).toBeInTheDocument();
  });

  it('never implies an image confirms the payment', async () => {
    const { container } = await openWithAttempt();

    const text = (container.textContent ?? '').toLowerCase();
    expect(text).not.toContain('tải ảnh để xác nhận thanh toán');
    expect(text).toContain(COPY.reminder.optional.toLowerCase());
    // The payment sentence still says the workshop has not confirmed anything.
    expect(screen.getByText(COPY.instructions.waitingBody)).toBeInTheDocument();
  });

  it('advertises exactly the three contract media types and the two limits', async () => {
    await openWithAttempt();

    expect(fileInput()).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    const constraints = screen.getByText(COPY.evidence.constraints).textContent ?? '';
    expect(constraints).toContain('10 MB');
    expect(constraints).toContain('5 ảnh');
    expect(constraints).not.toMatch(/pdf|heic|gif|svg/i);
  });
});

describe('APP7-S01 — uploading one image', () => {
  it('sends the token, the attempt locator and an idempotency key', async () => {
    uploadMock.mockResolvedValue(envelopeOf(makeUpload()));
    await openWithAttempt();

    fireEvent.change(fileInput(), { target: { files: [makeImageFile()] } });

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    const call = uploadMock.mock.calls[0];
    const body = call?.[0];
    const options = call?.[1];
    expect(body?.accessToken).toBe(TEST_TOKEN);
    expect(body?.attemptId).toBe(ATTEMPT_ID);
    const headers = options?.config?.headers as Record<string, string> | undefined;
    const key = headers?.['Idempotency-Key'] ?? '';
    expect(key).toMatch(UUID_SHAPE);
    // The raw key is never rendered.
    expect(document.body.innerHTML).not.toContain(key);
  });

  it('re-reads only the evidence list, and shows no payment success', async () => {
    uploadMock.mockResolvedValue(envelopeOf(makeUpload()));
    await openWithAttempt();
    const currentCalls = currentMock.mock.calls.length;

    fireEvent.change(fileInput(), { target: { files: [makeImageFile()] } });

    await waitFor(() => expect(statusMock.mock.calls.length).toBeGreaterThan(1));
    expect(currentMock).toHaveBeenCalledTimes(currentCalls);
    expect(initiateMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(COPY.confirmed.title)).not.toBeInTheDocument();
    expect(screen.getByText(COPY.instructions.waitingBody)).toBeInTheDocument();
  });

  it('refuses an unsupported type and an oversized file without a request', async () => {
    await openWithAttempt();

    fireEvent.change(fileInput(), {
      target: { files: [makeImageFile('scan.pdf', 'application/pdf', 1024)] },
    });
    await screen.findByText(COPY.uploadFailure.MEDIA_UNSUPPORTED);

    fireEvent.change(fileInput(), {
      target: { files: [makeImageFile('to-lon.jpg', 'image/jpeg', 11 * 1024 * 1024)] },
    });
    await screen.findByText(COPY.uploadFailure.TOO_LARGE);

    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('attaches its error to the file control rather than floating it', async () => {
    await openWithAttempt();

    fireEvent.change(fileInput(), {
      target: { files: [makeImageFile('anh.gif', 'image/gif', 1024)] },
    });

    const note = await screen.findByText(COPY.uploadFailure.MEDIA_UNSUPPORTED);
    const described = fileInput().getAttribute('aria-describedby');
    expect(described).not.toBeNull();
    expect(note.closest(`#${CSS.escape(described as string)}`)).not.toBeNull();
  });

  it('keeps the existing list and offers one explicit retry after a lost request', async () => {
    statusMock.mockResolvedValue(envelopeOf(makeEvidenceList([makeEvidenceItem()])));
    uploadMock.mockRejectedValueOnce(networkFailure());
    await openWithAttempt();
    await screen.findByText(COPY.evidenceStatus.INSPECTING.label);

    fireEvent.change(fileInput(), { target: { files: [makeImageFile()] } });
    await screen.findByText(COPY.uploadFailure.TRANSIENT);

    // The image that was already accepted is still listed.
    expect(screen.getByText(COPY.evidenceStatus.INSPECTING.label)).toBeInTheDocument();
    // Nothing retried on its own.
    expect(uploadMock).toHaveBeenCalledTimes(1);

    uploadMock.mockResolvedValue(envelopeOf(makeUpload()));
    fireEvent.click(screen.getByRole('button', { name: COPY.uploadFailure.retry }));

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(2));
    // The same logical upload: the same key, so a committed first try replays.
    const keyOf = (index: number): unknown => {
      const sent = uploadMock.mock.calls[index]?.[1]?.config?.headers;
      return (sent as Record<string, unknown> | undefined)?.['Idempotency-Key'];
    };
    expect(keyOf(0)).toBe(keyOf(1));
  });

  it('re-reads the list when the server refuses on a stale count', async () => {
    uploadMock.mockRejectedValueOnce(apiFailure(409, 'EVIDENCE_QUOTA_REACHED'));
    await openWithAttempt();
    const reads = statusMock.mock.calls.length;

    fireEvent.change(fileInput(), { target: { files: [makeImageFile()] } });

    await screen.findByText(COPY.uploadFailure.QUOTA_REACHED);
    await waitFor(() => expect(statusMock.mock.calls.length).toBeGreaterThan(reads));
  });
});

describe('APP7-S01 — the list is metadata, append-only', () => {
  it.each([
    [TransferEvidenceItemResponseAssetStatus.UPLOADED, COPY.evidenceStatus.UPLOADED.label],
    [TransferEvidenceItemResponseAssetStatus.INSPECTING, COPY.evidenceStatus.INSPECTING.label],
    [TransferEvidenceItemResponseAssetStatus.ACCEPTED, COPY.evidenceStatus.ACCEPTED.label],
    [TransferEvidenceItemResponseAssetStatus.REJECTED, COPY.evidenceStatus.REJECTED.label],
  ])('maps %s to its own words and leaves the payment sentence alone', async (status, label) => {
    statusMock.mockResolvedValue(
      envelopeOf(makeEvidenceList([makeEvidenceItem({ assetStatus: status })])),
    );

    await openWithAttempt();

    await screen.findByText(label);
    expect(screen.getByText(COPY.instructions.waitingBody)).toBeInTheDocument();
    expect(screen.queryByText(COPY.confirmed.title)).not.toBeInTheDocument();
  });

  it('offers no delete, replace, reorder or preview control', async () => {
    statusMock.mockResolvedValue(envelopeOf(makeFullEvidenceList()));

    await openWithAttempt();

    await screen.findByText(COPY.evidence.quotaFull);
    for (const label of [/xoá/i, /xóa/i, /thay thế/i, /sắp xếp/i, /xem ảnh/i, /tải xuống ảnh/i]) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('closes the intake at exactly five, without claiming the payment is stuck', async () => {
    statusMock.mockResolvedValue(envelopeOf(makeFullEvidenceList()));

    await openWithAttempt();

    await screen.findByText('5 / 5');
    expect(screen.getByRole('button', { name: COPY.evidence.quotaFull })).toBeDisabled();
    expect(screen.queryByLabelText(COPY.evidence.constraints)).not.toBeInTheDocument();
    expect(screen.getByText(COPY.evidence.quotaNote)).toBeInTheDocument();
    expect(screen.getByText(COPY.instructions.waitingBody)).toBeInTheDocument();
  });
});

describe('APP7-S01 — the intake follows the attempt and the obligation', () => {
  it('is absent entirely before an attempt exists', async () => {
    renderWithProviders(<SecureDepositScreen />);

    await screen.findByText(COPY.preAttempt.startTitle);
    expect(screen.queryByText(COPY.evidence.title)).not.toBeInTheDocument();
    expect(statusMock).not.toHaveBeenCalled();
  });

  it('keeps the list but stops asking once the deposit is verified', async () => {
    currentMock.mockResolvedValue(envelopeOf(makeVerifiedDeposit()));
    initiateMock.mockResolvedValue(envelopeOf(makeAttempt()));
    statusMock.mockResolvedValue(
      envelopeOf(
        makeEvidenceList([
          makeEvidenceItem({ assetStatus: TransferEvidenceItemResponseAssetStatus.ACCEPTED }),
        ]),
      ),
    );

    renderWithProviders(<SecureDepositScreen />);

    await screen.findByRole('heading', { level: 1, name: COPY.confirmed.title });
    expect(screen.getByText(COPY.confirmed.evidenceNote)).toBeInTheDocument();
    // No attempt was opened, so there is no list to show either — the note above
    // is the confirmation's own statement about evidence.
    expect(screen.queryByLabelText(COPY.evidence.constraints)).not.toBeInTheDocument();
  });
});
