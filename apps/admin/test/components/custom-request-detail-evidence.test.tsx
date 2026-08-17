/**
 * Private evidence delivery on the Admin detail screen (`APP5-A02` §8, §9;
 * `665:115`).
 *
 * Two things are being proved, and the second is the one that matters most:
 *
 *  - `APP5-B06` is called through the generated client with the **pair** of ids,
 *    and only for the two evidence roles;
 *  - every object URL that is created is revoked — on replacement, on unmount
 *    and when the bytes go away. A leaked handle keeps a customer's private
 *    photograph readable long after the screen stopped showing it.
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
  adminCustomRequestAssetGet,
  adminCustomRequestDetail,
  adminCustomRequestTransition,
} from '@embroidery/api-client';

import { CustomRequestDetailScreen } from '../../src/features/custom-request-detail';
import { CUSTOM_REQUEST_DETAIL_COPY as COPY } from '../../src/features/custom-request-detail/model/custom-request-detail-copy';
import { makeApiClientError } from '../support/api-error';
import { installObjectUrl, type ObjectUrlRecorder } from '../support/object-url';
import {
  COP_ASSET_ID,
  detailEnvelope,
  DETAIL_REQUEST_ID,
  makeAsset,
  makeCopDetail,
  mutationEnvelope,
  REFERENCE_ASSET_ID,
} from '../support/custom-request-detail-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/requests/r1').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminCustomRequestDetail: jest.fn(),
  adminCustomRequestAssetGet: jest.fn(),
  adminCustomRequestTransition: jest.fn(),
}));

const detailMock = adminCustomRequestDetail as jest.MockedFunction<typeof adminCustomRequestDetail>;
const assetMock = adminCustomRequestAssetGet as jest.MockedFunction<
  typeof adminCustomRequestAssetGet
>;
const transitionMock = adminCustomRequestTransition as jest.MockedFunction<
  typeof adminCustomRequestTransition
>;

let objectUrls: ObjectUrlRecorder;

const jpeg = (size: number) => new Blob([new Uint8Array(size)], { type: 'image/jpeg' });

beforeEach(() => {
  jest.clearAllMocks();
  objectUrls = installObjectUrl('evidence');
  detailMock.mockResolvedValue(detailEnvelope(makeCopDetail()));
  assetMock.mockResolvedValue(jpeg(8));
  transitionMock.mockResolvedValue(mutationEnvelope());
});

const render = () =>
  renderWithProviders(<CustomRequestDetailScreen requestId={DETAIL_REQUEST_ID} />);

describe('the B06 boundary', () => {
  it('opens a COP image through the generated operation, addressed by request and asset', async () => {
    render();
    await screen.findByTestId('request-evidence-image');
    expect(assetMock).toHaveBeenCalledTimes(1);
    expect(assetMock.mock.calls[0]?.[0]).toBe(DETAIL_REQUEST_ID);
    expect(assetMock.mock.calls[0]?.[1]).toBe(COP_ASSET_ID);
  });

  it('opens a REFERENCE image too, and one call per asset', async () => {
    detailMock.mockResolvedValue(
      detailEnvelope(
        makeCopDetail({
          assets: [makeAsset(), makeAsset({ assetId: REFERENCE_ASSET_ID, role: 'REFERENCE' })],
        }),
      ),
    );
    render();
    await waitFor(() => {
      expect(screen.getAllByTestId('request-evidence-image')).toHaveLength(2);
    });
    expect(assetMock).toHaveBeenCalledTimes(2);
    expect(assetMock.mock.calls.map((call) => call[1]).sort()).toEqual(
      [COP_ASSET_ID, REFERENCE_ASSET_ID].sort(),
    );
  });

  it('never requests an ATTACHMENT or a tombstoned asset', async () => {
    detailMock.mockResolvedValue(
      detailEnvelope(
        makeCopDetail({
          assets: [
            makeAsset({ assetId: 'a-attach', role: 'ATTACHMENT' }),
            makeAsset({ assetId: 'a-tomb', mimeType: undefined }),
          ],
        }),
      ),
    );
    render();
    await screen.findByTestId('request-evidence-list');
    // Both are listed — the association is real — and neither is fetched.
    expect(screen.getAllByTestId('request-evidence-item')).toHaveLength(2);
    expect(assetMock).not.toHaveBeenCalled();
  });

  it('exposes no storage location, key or token anywhere on the page', async () => {
    render();
    await screen.findByTestId('request-evidence-image');
    const markup = document.body.innerHTML;
    for (const leak of ['s3', 'bucket', 'storage_key', 'presign', 'X-Amz', 'token']) {
      expect(markup.toLowerCase()).not.toContain(leak.toLowerCase());
    }
  });
});

describe('the object-URL lifecycle', () => {
  it('renders the blob through an object URL and revokes it on unmount', async () => {
    const view = render();
    const image = await screen.findByTestId('request-evidence-image');
    expect(image).toHaveAttribute('src', objectUrls.created[0]);
    expect(objectUrls.revoked).toHaveLength(0);

    view.unmount();
    expect(objectUrls.revoked).toEqual([objectUrls.created[0]]);
  });

  it('revokes the previous handle when the bytes are replaced', async () => {
    render();
    await screen.findByTestId('request-evidence-image');
    const first = objectUrls.created[0] as string;

    // A replacement blob: the detail re-reads with a different asset id, so the
    // figure's query key changes and its bytes are replaced.
    assetMock.mockResolvedValue(jpeg(16));
    detailMock.mockResolvedValue(
      detailEnvelope(makeCopDetail({ assets: [makeAsset({ assetId: REFERENCE_ASSET_ID })] })),
    );
    await createUser().click(screen.getByTestId('moderation-action-start-review'));

    await waitFor(() => {
      expect(objectUrls.created.length).toBeGreaterThan(1);
    });
    expect(objectUrls.revoked).toContain(first);
  });

  it('never puts an object URL in storage or in the URL', async () => {
    render();
    await screen.findByTestId('request-evidence-image');
    const handle = objectUrls.created[0] as string;
    expect(window.localStorage.getItem('evidence')).toBeNull();
    expect(JSON.stringify(window.sessionStorage)).not.toContain(handle);
    expect(window.location.href).not.toContain('blob:');
  });
});

describe('one image failing', () => {
  it('does not fail the page, and discloses nothing about why', async () => {
    assetMock.mockRejectedValue(
      makeApiClientError({ status: 404, code: 'ASSET_NOT_FOUND', message: 'tombstoned' }),
    );
    render();
    const state = await screen.findByTestId('request-evidence-state');
    await waitFor(() => {
      expect(state).toHaveTextContent(COPY.evidence.unavailable);
    });
    // The rest of the detail is still there and still moderatable.
    expect(screen.getByTestId('request-detail')).toBeInTheDocument();
    expect(screen.getByTestId('moderation-actions')).toBeInTheDocument();
    expect(state).not.toHaveTextContent('tombstoned');
    // A refusal will be refused again, so no retry is offered.
    expect(screen.queryByTestId('request-evidence-retry')).not.toBeInTheDocument();
  });

  it('offers one bounded manual retry on a transient failure, and never loops', async () => {
    assetMock.mockRejectedValue(
      makeApiClientError({ status: 503, code: 'UPSTREAM', message: 'provider down' }),
    );
    render();
    const state = await screen.findByTestId('request-evidence-state');
    await waitFor(() => {
      expect(state).toHaveTextContent(COPY.evidence.retryable);
    });
    expect(screen.getByTestId('request-evidence-retry')).toBeInTheDocument();

    const callsAfterFailure = assetMock.mock.calls.length;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 80);
    });
    // No automatic retry: the count is unchanged until the operator asks.
    expect(assetMock).toHaveBeenCalledTimes(callsAfterFailure);
  });

  it('keeps the other images when one fails', async () => {
    detailMock.mockResolvedValue(
      detailEnvelope(
        makeCopDetail({
          assets: [makeAsset(), makeAsset({ assetId: REFERENCE_ASSET_ID, role: 'REFERENCE' })],
        }),
      ),
    );
    const gone = makeApiClientError({ status: 404, code: 'GONE' });
    assetMock.mockImplementation((_requestId: unknown, assetId: unknown) => {
      if (assetId === COP_ASSET_ID) throw gone;
      return Promise.resolve(jpeg(8));
    });
    render();
    await screen.findByTestId('request-evidence-image');
    expect(screen.getAllByTestId('request-evidence-image')).toHaveLength(1);
    expect(screen.getByTestId('request-evidence-state')).toHaveTextContent(
      COPY.evidence.unavailable,
    );
  });
});

describe('evidence accessibility', () => {
  it('describes an image by role and position, never by asset id', async () => {
    render();
    const image = await screen.findByTestId('request-evidence-image');
    const alt = image.getAttribute('alt') ?? '';
    expect(alt).toContain(COPY.evidence.roleCopImage);
    expect(alt).not.toContain(COP_ASSET_ID);
  });
});
