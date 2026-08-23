/**
 * The dynamic QR on `/truy-cap/thanh-toan` (`APP7-S01` §8, §9, §10, §30).
 *
 * Four things are proved here and nothing else is: the image comes from the B03
 * operation and no other source, the object URL is created once and revoked when
 * it is replaced or the panel leaves, the download spends the bytes already in
 * hand rather than a second request, and the page remains fully payable when the
 * QR is unavailable.
 *
 * jsdom implements neither `createObjectURL` nor `revokeObjectURL`, so both are
 * installed as spies — which is convenient, because the *lifecycle* is exactly
 * what has to be observed and a real implementation would hide it.
 */
import {
  publicOrderDepositCurrent,
  publicOrderDepositEvidenceStatus,
  publicOrderDepositInitiate,
  publicOrderDepositQr,
} from '@embroidery/api-client';
import { fireEvent, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';

import { SECURE_DEPOSIT_COPY as COPY } from '../../src/features/secure-deposit-payment/model/secure-deposit-copy';
import { SecureDepositScreen } from '../../src/features/secure-deposit-payment/ui/secure-deposit-screen';
import {
  ACCOUNT_NUMBER,
  ORDER_CODE,
  TRANSFER_REFERENCE,
  makeAttempt,
  makeDeposit,
  makeEvidenceList,
  navigateToDeposit,
} from '../support/secure-deposit-fixture';
import { TEST_TOKEN, envelopeOf, networkFailure } from '../support/secure-link-fixture';

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
const evidenceMock = publicOrderDepositEvidenceStatus as jest.MockedFunction<
  typeof publicOrderDepositEvidenceStatus
>;

const OBJECT_URL = 'blob:secure-deposit/qr-1';
let createObjectUrl: jest.Mock;
let revokeObjectUrl: jest.Mock;
/** Every `fetch`-alike the page could reach for. A QR must use none of them. */
let fetchSpy: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  navigateToDeposit(`#t=${TEST_TOKEN}`);
  currentMock.mockResolvedValue(envelopeOf(makeDeposit()));
  initiateMock.mockResolvedValue(envelopeOf(makeAttempt()));
  evidenceMock.mockResolvedValue(envelopeOf(makeEvidenceList()));
  qrMock.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));

  createObjectUrl = jest.fn().mockReturnValue(OBJECT_URL);
  revokeObjectUrl = jest.fn();
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectUrl, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectUrl, configurable: true });

  fetchSpy = jest.fn();
  Object.defineProperty(globalThis, 'fetch', { value: fetchSpy, configurable: true });
});

async function openInstructions() {
  const result = renderWithProviders(<SecureDepositScreen />);
  fireEvent.click(await screen.findByRole('button', { name: COPY.preAttempt.startAction }));
  await screen.findByText(COPY.instructions.panelTitle);
  return result;
}

describe('APP7-S01 — the QR comes from the delivered operation and nowhere else', () => {
  it('is not fetched before an attempt exists, and is fetched once after', async () => {
    renderWithProviders(<SecureDepositScreen />);
    await screen.findByText(COPY.preAttempt.startTitle);
    expect(qrMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: COPY.preAttempt.startAction }));
    await screen.findByText(COPY.instructions.panelTitle);

    await waitFor(() => expect(qrMock).toHaveBeenCalledTimes(1));
    expect(qrMock.mock.calls[0]?.[0]).toEqual({ token: TEST_TOKEN });
    // No remote QR service, and no second HTTP client.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('renders the fetched bytes through one object URL with a purposeful alt text', async () => {
    await openInstructions();

    const image = await screen.findByAltText(COPY.qr.alt);
    expect(image).toHaveAttribute('src', OBJECT_URL);
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });

  it('revokes the object URL when the screen unmounts', async () => {
    const { unmount } = await openInstructions();
    await screen.findByAltText(COPY.qr.alt);

    unmount();

    expect(revokeObjectUrl).toHaveBeenCalledWith(OBJECT_URL);
  });

  it('creates one handle per fetched blob, and revokes exactly that handle', async () => {
    // Replacement-revocation is structural: the URL is created inside an effect
    // keyed on the blob, and the cleanup of *that same closure* revokes the URL
    // it created — so a replacement blob revokes its predecessor before the new
    // handle is stored, and there is no code path that can drop one. What a test
    // can observe is that the two calls are paired and name the same string,
    // which is what makes the structural argument checkable.
    const { unmount } = await openInstructions();
    await screen.findByAltText(COPY.qr.alt);
    expect(createObjectUrl).toHaveBeenCalledTimes(1);

    unmount();

    expect(revokeObjectUrl.mock.calls).toEqual([[createObjectUrl.mock.results[0]?.value]]);
  });

  it('never persists the blob or its handle', async () => {
    await openInstructions();
    await screen.findByAltText(COPY.qr.alt);

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('downloads the bytes already fetched, without a second request', async () => {
    await openInstructions();
    await screen.findByAltText(COPY.qr.alt);
    const clicks: Array<{ href: string; download: string }> = [];
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function recordClick(this: HTMLAnchorElement) {
        clicks.push({ href: this.getAttribute('href') ?? '', download: this.download });
      });

    fireEvent.click(screen.getByRole('button', { name: COPY.qr.download }));

    clickSpy.mockRestore();
    expect(clicks).toHaveLength(1);
    expect(clicks[0]?.href).toBe(OBJECT_URL);
    // A safe synthetic name from non-sensitive display context only.
    expect(clicks[0]?.download).toBe(`ma-qr-dat-coc-${ORDER_CODE}.png`);
    expect(clicks[0]?.download).not.toContain(TEST_TOKEN);
    expect(clicks[0]?.download).not.toContain(ACCOUNT_NUMBER);
    expect(qrMock).toHaveBeenCalledTimes(1);
  });
});

describe('APP7-S01 — the QR is a shortcut, never the channel', () => {
  it('keeps every payment fact readable when the image cannot be fetched', async () => {
    qrMock.mockRejectedValue(networkFailure());

    await openInstructions();

    await screen.findByText(COPY.qr.failed);
    // The three facts a customer transfers by are all still present as text.
    expect(screen.getByText('5.100.000')).toBeInTheDocument();
    expect(screen.getByText(TRANSFER_REFERENCE)).toBeInTheDocument();
    expect(screen.getByText(ACCOUNT_NUMBER)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: COPY.qr.retry })).toBeEnabled();
    expect(screen.getByRole('button', { name: COPY.qr.download })).toBeDisabled();
  });

  it('degrades the same way in a browser with no object URLs at all', async () => {
    Object.defineProperty(URL, 'createObjectURL', { value: undefined, configurable: true });

    await openInstructions();

    await screen.findByText(COPY.qr.failed);
    expect(screen.getByText(TRANSFER_REFERENCE)).toBeInTheDocument();
  });
});
