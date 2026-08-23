/**
 * Private transfer-evidence delivery on the Admin order workspace (`APP7-A01`;
 * `742:3`, `743:3`).
 *
 * Two things are being proved, and the second matters most:
 *
 *  - `APP7-B06` is called through the generated client by **`evidenceId`**, only
 *    for images the payment read marked eligible, and never by an asset id —
 *    which the contract does not publish and no route accepts;
 *  - every object URL that is created is revoked: on replacement, on close and
 *    on unmount. A leaked handle keeps a customer's private banking screenshot
 *    readable long after the screen stopped showing it.
 *
 * The recorder in `installObjectUrl` encodes a counter in the url, so a stale
 * handle is distinguishable from a fresh one.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import {
  adminOrderDetail,
  adminOrderPaymentRead,
  adminPaymentEvidenceGet,
} from '@embroidery/api-client';

import { OrderDetailScreen } from '../../src/features/order-detail';
import { ORDER_DETAIL_COPY as COPY } from '../../src/features/order-detail/model/order-detail-copy';
import { makeApiClientError } from '../support/api-error';
import { installObjectUrl, type ObjectUrlRecorder } from '../support/object-url';
import {
  EVIDENCE_ACCEPTED_ID,
  EVIDENCE_INSPECTING_ID,
  EVIDENCE_REJECTED_ID,
  envelope,
  makeAttempt,
  makeEvidence,
  makeOrderDetail,
  makePayments,
  ORDER_ID,
} from '../support/order-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/orders/o1').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminOrderDetail: jest.fn(),
  adminOrderPaymentRead: jest.fn(),
  adminPaymentEvidenceGet: jest.fn(),
}));

const detailMock = adminOrderDetail as jest.MockedFunction<typeof adminOrderDetail>;
const paymentsMock = adminOrderPaymentRead as jest.MockedFunction<typeof adminOrderPaymentRead>;
const evidenceMock = adminPaymentEvidenceGet as jest.MockedFunction<typeof adminPaymentEvidenceGet>;

let user: ReturnType<typeof createUser>;
let objectUrls: ObjectUrlRecorder;

const jpeg = (size: number) => new Blob([new Uint8Array(size)], { type: 'image/jpeg' });

/** One accepted image, plus the two states that must never be requested. */
const mixedEvidence = () =>
  envelope(
    makePayments({
      attempts: [
        makeAttempt({
          evidence: [
            makeEvidence(),
            makeEvidence({
              evidenceId: EVIDENCE_INSPECTING_ID,
              assetStatus: 'INSPECTING',
              previewEligible: false,
            }),
            makeEvidence({
              evidenceId: EVIDENCE_REJECTED_ID,
              assetStatus: 'REJECTED',
              previewEligible: false,
            }),
          ],
        }),
      ],
    }),
  );

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
  objectUrls = installObjectUrl('payment-evidence');
  detailMock.mockResolvedValue(envelope(makeOrderDetail()));
  paymentsMock.mockResolvedValue(mixedEvidence());
  evidenceMock.mockResolvedValue(jpeg(8));
});

const render = () => renderWithProviders(<OrderDetailScreen orderId={ORDER_ID} />);

const openPreview = async () => {
  render();
  await user.click(await screen.findByTestId(`evidence-preview-${EVIDENCE_ACCEPTED_ID}`));
  return screen.findByTestId('evidence-preview-dialog');
};

describe('the B06 boundary', () => {
  it('requests nothing until an eligible image is actually opened', async () => {
    render();
    await screen.findByTestId('order-evidence-list');

    // Listing evidence must not download it: three associations, zero requests.
    expect(evidenceMock).not.toHaveBeenCalled();
  });

  it('opens an accepted image addressed by its evidence id', async () => {
    await openPreview();
    await screen.findByTestId('evidence-preview-image');

    expect(evidenceMock).toHaveBeenCalledTimes(1);
    expect(evidenceMock.mock.calls[0]?.[0]).toBe(EVIDENCE_ACCEPTED_ID);
  });

  it('never requests an ineligible image, whatever its state', async () => {
    render();
    await screen.findByTestId('order-evidence-list');

    // Both are listed — the association is real — and neither can be opened.
    expect(screen.getByTestId(`evidence-preview-${EVIDENCE_INSPECTING_ID}`)).toBeDisabled();
    expect(screen.getByTestId(`evidence-preview-${EVIDENCE_REJECTED_ID}`)).toBeDisabled();
    expect(evidenceMock).not.toHaveBeenCalled();
  });

  it('exposes no asset id, storage address or download affordance', async () => {
    await openPreview();
    await screen.findByTestId('evidence-preview-image');

    const dialog = screen.getByTestId('evidence-preview-dialog');
    expect(dialog.textContent).not.toMatch(/assetId|s3:|bucket|storage|token/i);
    expect(dialog.querySelector('a[download]')).toBeNull();
    // The only address on this path is the association id, and it is not
    // rendered as operator-facing text either.
    expect(dialog.textContent).not.toContain(EVIDENCE_ACCEPTED_ID);
  });

  it('navigates only between eligible images', async () => {
    paymentsMock.mockResolvedValue(
      envelope(
        makePayments({
          attempts: [
            makeAttempt({
              evidence: [
                makeEvidence(),
                makeEvidence({
                  evidenceId: EVIDENCE_INSPECTING_ID,
                  assetStatus: 'INSPECTING',
                  previewEligible: false,
                }),
                makeEvidence({ evidenceId: EVIDENCE_REJECTED_ID, assetStatus: 'ACCEPTED' }),
              ],
            }),
          ],
        }),
      ),
    );
    await openPreview();
    await screen.findByTestId('evidence-preview-image');

    // Two eligible of three associations — the blocked one is not in the chain.
    expect(screen.getByTestId('evidence-preview-position')).toHaveTextContent('1 / 2');
    await user.click(screen.getByTestId('evidence-preview-next'));

    await waitFor(() => {
      expect(evidenceMock).toHaveBeenCalledTimes(2);
    });
    expect(evidenceMock.mock.calls[1]?.[0]).toBe(EVIDENCE_REJECTED_ID);
  });
});

describe('the object URL lifetime', () => {
  it('revokes the handle when the dialog is closed', async () => {
    await openPreview();
    await screen.findByTestId('evidence-preview-image');

    expect(objectUrls.created).toHaveLength(1);
    expect(objectUrls.revoked).toHaveLength(0);

    await user.click(screen.getByTestId('evidence-preview-close'));

    await waitFor(() => {
      expect(objectUrls.revoked).toEqual(objectUrls.created);
    });
  });

  it('revokes the previous handle when another image replaces it', async () => {
    paymentsMock.mockResolvedValue(
      envelope(
        makePayments({
          attempts: [
            makeAttempt({
              evidence: [
                makeEvidence(),
                makeEvidence({ evidenceId: EVIDENCE_REJECTED_ID, assetStatus: 'ACCEPTED' }),
              ],
            }),
          ],
        }),
      ),
    );
    evidenceMock.mockResolvedValueOnce(jpeg(8)).mockResolvedValue(jpeg(16));

    await openPreview();
    await screen.findByTestId('evidence-preview-image');
    const first = objectUrls.created[0];

    await user.click(screen.getByTestId('evidence-preview-next'));

    await waitFor(() => {
      expect(objectUrls.created).toHaveLength(2);
    });
    // The stale handle is gone; the fresh one is still live.
    expect(objectUrls.revoked).toContain(first);
    expect(objectUrls.revoked).not.toContain(objectUrls.created[1]);
  });

  it('revokes the handle on unmount', async () => {
    // Not `openPreview`: this test owns the render so it can unmount it, which
    // is what a navigation away from the order actually does.
    const view = renderWithProviders(<OrderDetailScreen orderId={ORDER_ID} />);
    await user.click(await screen.findByTestId(`evidence-preview-${EVIDENCE_ACCEPTED_ID}`));
    await screen.findByTestId('evidence-preview-image');

    expect(objectUrls.created).toHaveLength(1);
    expect(objectUrls.revoked).toHaveLength(0);

    view.unmount();

    // Every handle that was ever created is gone — not "most of them".
    expect(objectUrls.revoked).toEqual(objectUrls.created);
  });

  it('never persists the handle outside the component that renders it', async () => {
    await openPreview();
    const image = await screen.findByTestId('evidence-preview-image');
    const url = image.getAttribute('src') ?? '';

    expect(url.startsWith('blob:')).toBe(true);
    expect(window.localStorage.getItem('evidence')).toBeNull();
    expect(window.location.href).not.toContain('blob:');
    expect(JSON.stringify(window.sessionStorage)).not.toContain('blob:');
  });
});

describe('preview failures never touch payment state', () => {
  it('re-reads the payment metadata on a 404, because previewEligible may be stale', async () => {
    evidenceMock.mockRejectedValue(
      makeApiClientError({ status: 404, code: 'PAYMENT_EVIDENCE_NOT_FOUND' }),
    );
    await openPreview();

    expect(await screen.findByTestId('evidence-preview-state')).toHaveTextContent(
      COPY.evidence.unavailable,
    );
    // One read on mount, one because the eligibility hint is now suspect.
    await waitFor(() => {
      expect(paymentsMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    // A refusal will be refused again, so no retry is offered.
    expect(screen.queryByTestId('evidence-preview-retry')).not.toBeInTheDocument();
  });

  it('offers one manual retry on a 503 and does not re-read metadata', async () => {
    evidenceMock.mockRejectedValue(
      makeApiClientError({ status: 503, code: 'SERVICE_UNAVAILABLE' }),
    );
    await openPreview();

    expect(await screen.findByTestId('evidence-preview-state')).toHaveTextContent(
      COPY.evidence.temporary,
    );
    expect(screen.getByTestId('evidence-preview-retry')).toBeInTheDocument();
    expect(paymentsMock).toHaveBeenCalledTimes(1);
  });

  it('writes no payment state on any preview failure', async () => {
    evidenceMock.mockRejectedValue(makeApiClientError({ status: 404, code: 'NOT_FOUND' }));
    await openPreview();
    await screen.findByTestId('evidence-preview-state');

    // The deposit and the order are exactly where they were. Opening an image
    // is a read, and a failed read is not a reason to write anything.
    expect(screen.getByTestId('deposit-status')).toHaveTextContent('Chưa thu');
    expect(screen.getByTestId('order-status')).toHaveTextContent('Chờ đặt cọc');
  });

  it('leaks no server text into the failure sentence', async () => {
    evidenceMock.mockRejectedValue(
      makeApiClientError({
        status: 503,
        code: 'PAYMENT_EVIDENCE_UNAVAILABLE',
        message: 'object store byte count mismatch for key evidence/2026/08/abc',
      }),
    );
    await openPreview();

    const state = await screen.findByTestId('evidence-preview-state');
    expect(state.textContent).not.toMatch(/object store|byte count|evidence\/2026/);
  });
});
