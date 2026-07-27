/**
 * The collection and its continuation contract (`APP2-D02` / IMP-D031).
 *
 * The generated client is the mocked boundary — the feature service, the query
 * hook and the components all run their real code, so what is asserted here is
 * the request the screen actually issues and the DOM it actually renders.
 */
import {
  createUser,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import { adminAssetList } from '@embroidery/api-client';

import { AssetCollection } from '../../src/features/assets/components/asset-collection';
import { ASSET_COPY } from '../../src/features/assets/model/asset-copy';
import { makeApiClientError } from '../support/api-error';
import { makeAsset, makePage } from '../support/asset-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminAssetList: jest.fn(),
}));

const listMock = adminAssetList as jest.MockedFunction<typeof adminAssetList>;

const PNG = makeAsset({ assetId: 'a-1', mediaType: 'image/png', status: 'ACCEPTED' });
const JPEG = makeAsset({ assetId: 'a-2', mediaType: 'image/jpeg', status: 'INSPECTING' });
const WEBP = makeAsset({ assetId: 'a-3', mediaType: 'image/webp', status: 'REJECTED' });

function envelope(page: ReturnType<typeof makePage>) {
  return {
    success: true,
    code: 'ASSET_LIST_READ',
    message: 'ok',
    data: page,
    meta: { requestId: 'req-1', timestamp: '2026-07-27T00:00:00.000Z' },
  } as never;
}

function loadMoreButton() {
  return screen.getByRole('button', { name: ASSET_COPY.continuation.action });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('initial list states', () => {
  it('shows the loading status first and never the empty state while loading', () => {
    listMock.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<AssetCollection />);

    expect(screen.getByRole('status')).toHaveTextContent(ASSET_COPY.list.loading);
    expect(screen.queryByText(ASSET_COPY.list.emptyTitle)).not.toBeInTheDocument();
  });

  it('shows the empty state only when the server answered with no items', async () => {
    listMock.mockResolvedValue(envelope(makePage([])));
    renderWithProviders(<AssetCollection />);

    expect(await screen.findByText(ASSET_COPY.list.emptyTitle)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows the unavailable state — not the empty state — when the first page fails', async () => {
    listMock.mockRejectedValue(makeApiClientError({ status: 500, code: 'INTERNAL_SERVER_ERROR' }));
    renderWithProviders(<AssetCollection />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(ASSET_COPY.list.unavailableTitle)).toBeInTheDocument();
    expect(screen.queryByText(ASSET_COPY.list.emptyTitle)).not.toBeInTheDocument();
    expect(
      within(alert).getByRole('button', { name: ASSET_COPY.list.unavailableRetry }),
    ).toBeInTheDocument();
  });

  it('requests the first page with the contract limit and no cursor', async () => {
    listMock.mockResolvedValue(envelope(makePage([PNG])));
    renderWithProviders(<AssetCollection />);
    await screen.findByRole('list');

    expect(listMock).toHaveBeenCalledTimes(1);
    expect(listMock.mock.calls[0]?.[0]).toEqual({ limit: 20 });
  });

  it('renders server-backed identity and status, and no filename', async () => {
    listMock.mockResolvedValue(envelope(makePage([PNG, JPEG, WEBP])));
    renderWithProviders(<AssetCollection />);

    const list = await screen.findByRole('list');
    expect(within(list).getByText('Ảnh PNG')).toBeInTheDocument();
    expect(within(list).getByText('Ảnh JPEG')).toBeInTheDocument();
    expect(within(list).getByText('Ảnh WebP')).toBeInTheDocument();
    expect(within(list).getByText('Sẵn sàng')).toBeInTheDocument();
    expect(within(list).getByText('Đang xử lý')).toBeInTheDocument();
    expect(within(list).getByText('Không thể sử dụng')).toBeInTheDocument();
    expect(list.textContent).not.toContain(PNG.checksum);
    expect(list.textContent).not.toContain(PNG.assetId);
    expect(list.textContent).not.toMatch(/\.png|\.jpg|\.webp/i);
    expect(list.textContent).not.toContain('image/png');
  });
});

describe('continuation', () => {
  it('offers the control only while a further page exists', async () => {
    listMock.mockResolvedValue(envelope(makePage([PNG])));
    renderWithProviders(<AssetCollection />);
    await screen.findByRole('list');

    expect(
      screen.queryByRole('button', { name: ASSET_COPY.continuation.action }),
    ).not.toBeInTheDocument();
  });

  it('never renders a total count or a page number', async () => {
    listMock.mockResolvedValue(envelope(makePage([PNG, JPEG])));
    const { container } = renderWithProviders(<AssetCollection />);
    await screen.findByRole('list');

    // The forbidden shapes are "6 / 42", "Tổng cộng 42" and "Trang 1 / 7". The
    // spaced slash keeps a dd/MM/yyyy date from matching.
    expect(container.textContent).not.toMatch(/\d+\s+\/\s+\d+|Tổng cộng|Trang \d/);
  });

  it('appends the next page, keeps the earlier rows and announces once', async () => {
    listMock
      .mockResolvedValueOnce(envelope(makePage([PNG], 'cursor-2')))
      .mockResolvedValueOnce(envelope(makePage([JPEG])));
    const user = createUser();
    renderWithProviders(<AssetCollection />);
    await screen.findByText('Ảnh PNG');

    await user.click(loadMoreButton());

    await waitFor(() => {
      expect(screen.getByText('Ảnh JPEG')).toBeInTheDocument();
    });
    // The earlier row is still there — the page was appended, not replaced.
    expect(screen.getByText('Ảnh PNG')).toBeInTheDocument();
    expect(listMock.mock.calls[1]?.[0]).toEqual({ limit: 20, cursor: 'cursor-2' });
    // The collection is exhausted, so the control is gone.
    expect(
      screen.queryByRole('button', { name: ASSET_COPY.continuation.action }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(ASSET_COPY.continuation.loaded)).toBeInTheDocument();
  });

  it('keeps every row visible while the next page is loading', async () => {
    let releaseSecondPage: (() => void) | undefined;
    listMock.mockResolvedValueOnce(envelope(makePage([PNG], 'cursor-2'))).mockReturnValueOnce(
      new Promise((resolve) => {
        releaseSecondPage = () => resolve(envelope(makePage([JPEG])));
      }) as never,
    );
    const user = createUser();
    renderWithProviders(<AssetCollection />);
    await screen.findByText('Ảnh PNG');

    await user.click(loadMoreButton());

    const pending = await screen.findByRole('button', { name: ASSET_COPY.continuation.loading });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    // No skeleton swap: the accumulated collection stays on screen.
    expect(screen.getByText('Ảnh PNG')).toBeInTheDocument();
    expect(screen.getByRole('list')).toBeInTheDocument();

    releaseSecondPage?.();
    await screen.findByText('Ảnh JPEG');
  });

  it('keeps the rows on a continuation failure and retries the very same cursor', async () => {
    listMock
      .mockResolvedValueOnce(envelope(makePage([PNG], 'cursor-2')))
      .mockRejectedValueOnce(makeApiClientError({ status: 503, code: 'ASSET_STORAGE_UNAVAILABLE' }))
      .mockResolvedValueOnce(envelope(makePage([JPEG])));
    const user = createUser();
    renderWithProviders(<AssetCollection />);
    await screen.findByText('Ảnh PNG');

    await user.click(loadMoreButton());

    expect(await screen.findByText(ASSET_COPY.continuation.errorMessage)).toBeInTheDocument();
    // Not the full-page unavailable state, and not a reset to page one.
    expect(screen.getByText('Ảnh PNG')).toBeInTheDocument();
    expect(screen.queryByText(ASSET_COPY.list.unavailableTitle)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: ASSET_COPY.continuation.retry }));

    await screen.findByText('Ảnh JPEG');
    expect(listMock.mock.calls[1]?.[0]).toEqual({ limit: 20, cursor: 'cursor-2' });
    expect(listMock.mock.calls[2]?.[0]).toEqual({ limit: 20, cursor: 'cursor-2' });
  });

  it('renders a repeated asset once without reordering the collection', async () => {
    listMock
      .mockResolvedValueOnce(envelope(makePage([PNG, JPEG], 'cursor-2')))
      .mockResolvedValueOnce(envelope(makePage([JPEG, WEBP])));
    const user = createUser();
    renderWithProviders(<AssetCollection />);
    await screen.findByText('Ảnh PNG');

    await user.click(loadMoreButton());
    await screen.findByText('Ảnh WebP');

    expect(screen.getAllByText('Ảnh JPEG')).toHaveLength(1);
    const titles = screen
      .getAllByRole('listitem')
      .map((row) => row.querySelector('p')?.textContent);
    expect(titles).toEqual(['Ảnh PNG', 'Ảnh JPEG', 'Ảnh WebP']);
  });
});
