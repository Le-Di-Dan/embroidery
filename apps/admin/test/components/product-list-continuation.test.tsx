/**
 * Cursor continuation for the product list (`498:272` — Tải thêm sản phẩm).
 *
 * The properties under test are the ones a keyset list gets wrong in
 * production: appending instead of replacing, retrying the *same* cursor rather
 * than restarting, keeping the accumulated items through a failure, and never
 * inventing a total or a page number the contract does not expose.
 */
import {
  createUser,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import { adminProductList } from '@embroidery/api-client';

import { ProductCollection } from '../../src/features/products/components/product-collection';
import { PRODUCT_COPY } from '../../src/features/products/model/product-copy';
import { DEFAULT_PRODUCT_FILTERS } from '../../src/features/products/model/product-filters';
import { makeApiClientError } from '../support/api-error';
import { makeProduct, makeProductPage, productEnvelope } from '../support/product-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminProductList: jest.fn(),
}));

const listMock = adminProductList as jest.MockedFunction<typeof adminProductList>;

const PAGE_ONE = [
  makeProduct({ productId: 'p-1', name: 'Gấu bông thêu tay' }),
  makeProduct({ productId: 'p-2', name: 'Khăn tay thêu sen đỏ' }),
];
const PAGE_TWO = [makeProduct({ productId: 'p-3', name: 'Áo dài chấm bi' })];

function renderCollection() {
  return renderWithProviders(<ProductCollection filters={DEFAULT_PRODUCT_FILTERS} />);
}

function loadMoreButton() {
  return screen.getByRole('button', { name: PRODUCT_COPY.continuation.action });
}

/** Rows in the desktop table, excluding the header row. */
function tableRowNames(): string[] {
  const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
  return rows.map((row) => within(row).getByRole('rowheader').textContent ?? '');
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('offering the control', () => {
  it('offers it only while a further page exists', async () => {
    listMock.mockResolvedValue(productEnvelope(makeProductPage(PAGE_ONE)));
    renderCollection();
    await screen.findByRole('table');

    expect(
      screen.queryByRole('button', { name: PRODUCT_COPY.continuation.action }),
    ).not.toBeInTheDocument();
  });

  it('withholds it when the server claims a next page but sends no usable cursor', async () => {
    listMock.mockResolvedValue(productEnvelope({ hasNext: true, items: PAGE_ONE, nextCursor: '' }));
    renderCollection();
    await screen.findByRole('table');

    expect(
      screen.queryByRole('button', { name: PRODUCT_COPY.continuation.action }),
    ).not.toBeInTheDocument();
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it('never renders a total, a page number or an infinite-scroll sentinel', async () => {
    listMock.mockResolvedValue(productEnvelope(makeProductPage(PAGE_ONE, 'cursor-1')));
    const { container } = renderCollection();
    await screen.findByRole('table');

    expect(container.textContent).not.toMatch(/\b\d+\s*\/\s*\d+\b/);
    expect(container.textContent).not.toContain('Trang');
    expect(container.textContent).not.toContain('Tổng');
    expect(container.querySelector('[data-infinite-scroll]')).toBeNull();
    // Nothing loads a second page on its own.
    expect(listMock).toHaveBeenCalledTimes(1);
  });
});

describe('appending a page', () => {
  it('sends the exact cursor the server issued and appends the result', async () => {
    const user = createUser();
    listMock.mockResolvedValueOnce(productEnvelope(makeProductPage(PAGE_ONE, 'cursor-1')));
    listMock.mockResolvedValueOnce(productEnvelope(makeProductPage(PAGE_TWO)));
    renderCollection();
    await screen.findByRole('table');

    await user.click(loadMoreButton());

    await waitFor(() => {
      expect(tableRowNames()).toHaveLength(3);
    });
    expect(listMock.mock.calls[1]?.[0]).toEqual({ limit: 20, cursor: 'cursor-1' });
    // Server order is preserved and the first page is still on screen.
    expect(tableRowNames()).toEqual([
      expect.stringContaining('Gấu bông thêu tay'),
      expect.stringContaining('Khăn tay thêu sen đỏ'),
      expect.stringContaining('Áo dài chấm bi'),
    ]);
    // Exhausted: the control is gone.
    expect(
      screen.queryByRole('button', { name: PRODUCT_COPY.continuation.action }),
    ).not.toBeInTheDocument();
  });

  it('keeps the first occurrence when a shifting keyset repeats a product', async () => {
    const user = createUser();
    const duplicate = makeProduct({ productId: 'p-2', name: 'Khăn tay thêu sen đỏ' });
    listMock.mockResolvedValueOnce(productEnvelope(makeProductPage(PAGE_ONE, 'cursor-1')));
    listMock.mockResolvedValueOnce(productEnvelope(makeProductPage([duplicate, ...PAGE_TWO])));
    renderCollection();
    await screen.findByRole('table');

    await user.click(loadMoreButton());

    await waitFor(() => {
      expect(tableRowNames()).toHaveLength(3);
    });
    expect(tableRowNames().filter((name) => name.includes('Khăn tay thêu sen đỏ'))).toHaveLength(1);
  });

  it('disables the control and announces the append politely', async () => {
    const user = createUser();
    let releaseSecondPage: (() => void) | undefined;
    listMock.mockResolvedValueOnce(productEnvelope(makeProductPage(PAGE_ONE, 'cursor-1')));
    listMock.mockReturnValueOnce(
      new Promise((resolve) => {
        releaseSecondPage = () => resolve(productEnvelope(makeProductPage(PAGE_TWO)));
      }) as never,
    );
    renderCollection();
    await screen.findByRole('table');

    await user.click(loadMoreButton());

    const busy = screen.getByRole('button', { name: PRODUCT_COPY.continuation.loading });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    // The accumulated items stay on screen throughout.
    expect(tableRowNames()).toHaveLength(2);

    releaseSecondPage?.();
    await waitFor(() => {
      expect(screen.getByText(PRODUCT_COPY.continuation.loaded)).toBeInTheDocument();
    });
    expect(screen.getByText(PRODUCT_COPY.continuation.loaded).closest('p')).toHaveAttribute(
      'aria-live',
      'polite',
    );
  });
});

describe('a failed continuation', () => {
  it('keeps the loaded products, reports the failure locally and retries the same cursor', async () => {
    const user = createUser();
    listMock.mockResolvedValueOnce(productEnvelope(makeProductPage(PAGE_ONE, 'cursor-1')));
    listMock.mockRejectedValueOnce(
      makeApiClientError({ status: 503, code: 'SERVICE_UNAVAILABLE' }),
    );
    listMock.mockResolvedValueOnce(productEnvelope(makeProductPage(PAGE_TWO)));
    renderCollection();
    await screen.findByRole('table');

    await user.click(loadMoreButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(PRODUCT_COPY.continuation.errorMessage);
    // Local to the control: the collection is intact and is not replaced by
    // the full-page unavailable state.
    expect(tableRowNames()).toHaveLength(2);
    expect(screen.queryByText(PRODUCT_COPY.list.unavailableTitle)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: PRODUCT_COPY.continuation.retry }));

    await waitFor(() => {
      expect(tableRowNames()).toHaveLength(3);
    });
    // The retry re-sent the very same cursor — it did not restart at page one.
    expect(listMock.mock.calls[2]?.[0]).toEqual({ limit: 20, cursor: 'cursor-1' });
    expect(listMock.mock.calls[1]?.[0]).toEqual(listMock.mock.calls[2]?.[0]);
  });

  it('never shows the empty state after a continuation failure', async () => {
    const user = createUser();
    listMock.mockResolvedValueOnce(productEnvelope(makeProductPage(PAGE_ONE, 'cursor-1')));
    listMock.mockRejectedValue(makeApiClientError({ status: 500, code: 'INTERNAL_SERVER_ERROR' }));
    renderCollection();
    await screen.findByRole('table');

    await user.click(loadMoreButton());
    await screen.findByRole('alert');

    expect(screen.queryByText(PRODUCT_COPY.list.emptyTitle)).not.toBeInTheDocument();
    expect(screen.queryByText(PRODUCT_COPY.list.filteredEmptyTitle)).not.toBeInTheDocument();
  });
});
