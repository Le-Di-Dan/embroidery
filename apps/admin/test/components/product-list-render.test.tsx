/**
 * What the read-only Admin Product List actually renders (`APP2-A02`).
 *
 * The generated client is the mocked boundary — the feature service, the query
 * hook and the components all run their real code, so what is asserted here is
 * the request the screen issues and the DOM it produces.
 *
 * Both viewports are in the DOM at once (the stylesheet hides one with
 * `display: none`, which jsdom does not apply), so every assertion is scoped to
 * the table or to the card list rather than to the document.
 */
import { renderWithProviders, screen, waitFor, within } from '@embroidery/frontend-testing';
import { adminProductList } from '@embroidery/api-client';

import { ProductCollection } from '../../src/features/products/components/product-collection';
import { PRODUCT_COPY } from '../../src/features/products/model/product-copy';
import {
  DEFAULT_PRODUCT_FILTERS,
  type ProductFilters,
} from '../../src/features/products/model/product-filters';
import { makeApiClientError } from '../support/api-error';
import { makeProduct, makeProductPage, productEnvelope } from '../support/product-fixture';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminProductList: jest.fn(),
}));

const listMock = adminProductList as jest.MockedFunction<typeof adminProductList>;

const DRAFT = makeProduct({
  productId: 'p-1',
  name: 'Gấu bông thêu tay',
  status: 'DRAFT',
  category: { name: 'Thú bông', slug: 'thu-bong' },
});
const PUBLISHED = makeProduct({
  productId: 'p-2',
  name: 'Khăn tay thêu sen đỏ',
  status: 'PUBLISHED',
  category: { name: 'Khăn', slug: 'khan' },
});
const ARCHIVED = makeProduct({
  productId: 'p-3',
  name: 'Áo dài chấm bi',
  status: 'ARCHIVED',
  category: { name: 'Quần áo', slug: 'quan-ao' },
});

function renderCollection(filters: ProductFilters = DEFAULT_PRODUCT_FILTERS) {
  return renderWithProviders(<ProductCollection filters={filters} />);
}

function table() {
  return screen.getByRole('table');
}

function cardList() {
  return screen.getByRole('list', { name: PRODUCT_COPY.page.collectionLabel });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('initial list states', () => {
  it('shows the loading status first and never an empty state while loading', () => {
    listMock.mockReturnValue(new Promise(() => undefined));
    renderCollection();

    expect(screen.getByRole('status')).toHaveTextContent(PRODUCT_COPY.list.loading);
    expect(screen.queryByText(PRODUCT_COPY.list.emptyTitle)).not.toBeInTheDocument();
    expect(screen.queryByText(PRODUCT_COPY.list.filteredEmptyTitle)).not.toBeInTheDocument();
  });

  it('shows the unfiltered empty state only when the server answered with no items', async () => {
    listMock.mockResolvedValue(productEnvelope(makeProductPage([])));
    renderCollection();

    expect(await screen.findByText(PRODUCT_COPY.list.emptyTitle)).toBeInTheDocument();
    expect(screen.getByText(PRODUCT_COPY.list.emptyDescription)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the filtered empty state when a filter is active', async () => {
    listMock.mockResolvedValue(productEnvelope(makeProductPage([])));
    renderCollection({ status: 'PUBLISHED', category: 'all' });

    expect(await screen.findByText(PRODUCT_COPY.list.filteredEmptyTitle)).toBeInTheDocument();
    expect(screen.getByText(PRODUCT_COPY.list.filteredEmptyDescription)).toBeInTheDocument();
    expect(screen.queryByText(PRODUCT_COPY.list.emptyTitle)).not.toBeInTheDocument();
  });

  it('shows the unavailable state — not an empty state — when the first page fails', async () => {
    listMock.mockRejectedValue(makeApiClientError({ status: 500, code: 'INTERNAL_SERVER_ERROR' }));
    renderCollection();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(PRODUCT_COPY.list.unavailableTitle)).toBeInTheDocument();
    expect(screen.queryByText(PRODUCT_COPY.list.emptyTitle)).not.toBeInTheDocument();
    expect(
      within(alert).getByRole('button', { name: PRODUCT_COPY.list.unavailableRetry }),
    ).toBeInTheDocument();
  });

  it('never renders a raw server message, code or request id on failure', async () => {
    listMock.mockRejectedValue(
      makeApiClientError({
        status: 500,
        code: 'PRODUCT_LIST_EXPLODED',
        message: 'relation "products" does not exist',
      }),
    );
    const { container } = renderCollection();
    await screen.findByRole('alert');

    expect(container.textContent).not.toContain('PRODUCT_LIST_EXPLODED');
    expect(container.textContent).not.toContain('relation');
    expect(container.textContent).not.toContain('req-test-0001');
  });

  it('requests the first page with the contract limit, no cursor and no filter params', async () => {
    listMock.mockResolvedValue(productEnvelope(makeProductPage([DRAFT])));
    renderCollection();
    await screen.findByRole('table');

    expect(listMock).toHaveBeenCalledTimes(1);
    expect(listMock.mock.calls[0]?.[0]).toEqual({ limit: 20 });
  });
});

describe('truthful projection', () => {
  it('carries drafts, published and archived products alike', async () => {
    listMock.mockResolvedValue(productEnvelope(makeProductPage([DRAFT, PUBLISHED, ARCHIVED])));
    renderCollection();

    const rows = within(await screen.findByRole('table')).getAllByRole('row');
    // One header row plus one row per product; archived is not hidden.
    expect(rows).toHaveLength(4);
    const body = within(table());
    expect(body.getByText(PRODUCT_COPY.status.draft)).toBeInTheDocument();
    expect(body.getByText(PRODUCT_COPY.status.published)).toBeInTheDocument();
    expect(body.getByText(PRODUCT_COPY.status.archived)).toBeInTheDocument();
  });

  it('renders the approved category labels from the slug, not the server name', async () => {
    const misnamed = makeProduct({
      productId: 'p-9',
      name: 'Khăn lụa',
      category: { name: 'A stale server label', slug: 'khan' },
    });
    listMock.mockResolvedValue(productEnvelope(makeProductPage([misnamed])));
    renderCollection();

    const body = within(await screen.findByRole('table'));
    expect(body.getByText(PRODUCT_COPY.category.khan)).toBeInTheDocument();
    expect(body.queryByText('A stale server label')).not.toBeInTheDocument();
  });

  it('falls back safely for an unrecognised status or category', async () => {
    const odd = makeProduct({
      productId: 'p-8',
      name: 'Sản phẩm lạ',
      status: 'PENDING_REVIEW' as never,
      category: { name: 'Đồ gốm', slug: 'do-gom' as never },
    });
    listMock.mockResolvedValue(productEnvelope(makeProductPage([odd])));
    renderCollection();

    const body = within(await screen.findByRole('table'));
    expect(body.getAllByText(PRODUCT_COPY.status.unknown).length).toBeGreaterThan(0);
    expect(body.queryByText('PENDING_REVIEW')).not.toBeInTheDocument();
    expect(body.queryByText('do-gom')).not.toBeInTheDocument();
    expect(body.queryByText('Đồ gốm')).not.toBeInTheDocument();
  });

  it('renders only the approved fields — never price, slug, timestamps or ids', async () => {
    listMock.mockResolvedValue(productEnvelope(makeProductPage([DRAFT])));
    const { container } = renderCollection();
    await screen.findByRole('table');

    const text = container.textContent ?? '';
    expect(text).toContain(DRAFT.name);
    expect(text).not.toContain(DRAFT.basePriceAmount);
    expect(text).not.toContain('1.250.000');
    expect(text).not.toContain('VND');
    expect(text).not.toContain(DRAFT.slug);
    expect(text).not.toContain(DRAFT.productId);
    expect(text).not.toContain(DRAFT.updatedAt);
    expect(text).not.toContain(DRAFT.createdAt);
  });

  it('renders a generic placeholder and issues no media request of any kind', async () => {
    listMock.mockResolvedValue(productEnvelope(makeProductPage([DRAFT])));
    const { container } = renderCollection();
    await screen.findByRole('table');

    const placeholders = screen.getAllByRole('img', { name: PRODUCT_COPY.media.placeholder });
    // One in the table, one in the card list.
    expect(placeholders).toHaveLength(2);
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toMatch(/https?:|blob:|\/api\/|minio|s3/i);
    expect(listMock).toHaveBeenCalledTimes(1);
  });
});

describe('desktop and mobile presentations', () => {
  it('renders a semantic table with the approved columns plus the A03 action', async () => {
    listMock.mockResolvedValue(productEnvelope(makeProductPage([PUBLISHED])));
    renderCollection();

    const headers = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      PRODUCT_COPY.columns.product,
      PRODUCT_COPY.columns.category,
      PRODUCT_COPY.columns.status,
      PRODUCT_COPY.actions.columnLabel,
    ]);
  });

  it('renders the same products as a labelled mobile card collection', async () => {
    listMock.mockResolvedValue(productEnvelope(makeProductPage([PUBLISHED, DRAFT])));
    renderCollection();

    const items = within(
      await screen.findByRole('list', {
        name: PRODUCT_COPY.page.collectionLabel,
      }),
    ).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText(PUBLISHED.name)).toBeInTheDocument();
    expect(
      within(items[0] as HTMLElement).getByText(PRODUCT_COPY.status.published),
    ).toBeInTheDocument();
  });

  it('states every status as text, never as colour alone', async () => {
    listMock.mockResolvedValue(productEnvelope(makeProductPage([DRAFT, PUBLISHED, ARCHIVED])));
    renderCollection();
    await screen.findByRole('table');

    for (const badge of [...cardList().querySelectorAll('.product-status')]) {
      expect(badge.textContent?.trim()).not.toBe('');
      expect(badge.querySelector('.product-status__dot')).toHaveAttribute('aria-hidden', 'true');
    }
  });
});

describe('staged action ownership', () => {
  // `APP2-A03` restored exactly two entry points. Everything else stays absent:
  // the capability behind each of these words still does not exist.
  const FORBIDDEN = ['Xuất bản', 'Gỡ xuất bản', 'Lưu trữ', 'Xoá', 'Xóa', 'Tìm kiếm'];

  it('renders no publication, archive, delete or search control', async () => {
    listMock.mockResolvedValue(productEnvelope(makeProductPage([DRAFT, PUBLISHED, ARCHIVED])));
    const { container } = renderCollection();
    await screen.findByRole('table');

    for (const label of FORBIDDEN) {
      expect(container.textContent).not.toContain(label);
    }
    expect(screen.queryAllByRole('searchbox')).toHaveLength(0);
    expect(container.querySelector('input')).toBeNull();
    // The collection itself carries no button; the only controls are the
    // per-row edit links, and continuation when the server offers a cursor.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('offers one edit link per product, in both presentations', async () => {
    listMock.mockResolvedValue(productEnvelope(makeProductPage([DRAFT, PUBLISHED])));
    renderCollection();
    await screen.findByRole('table');

    const rows = [DRAFT, PUBLISHED];
    for (const product of rows) {
      // One in the table, one in the card list — both are always in the DOM and
      // the stylesheet shows exactly one.
      const links = screen.getAllByRole('link', {
        name: `${PRODUCT_COPY.actions.edit}: ${product.name}`,
      });
      expect(links).toHaveLength(2);
      for (const link of links) {
        expect(link).toHaveAttribute('href', `/products/${product.productId}`);
      }
    }
  });

  it('offers the create action from the genuinely empty state', async () => {
    listMock.mockResolvedValue(productEnvelope(makeProductPage([])));
    renderCollection();
    await screen.findByText(PRODUCT_COPY.list.emptyTitle);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    const create = screen.getByRole('link', { name: PRODUCT_COPY.actions.create });
    expect(create).toHaveAttribute('href', '/products/new');
  });

  it('does not suggest creating a product when a filter hid them all', async () => {
    listMock.mockResolvedValue(productEnvelope(makeProductPage([])));
    renderCollection({ status: 'DRAFT', category: 'all' });
    await screen.findByText(PRODUCT_COPY.list.filteredEmptyTitle);

    expect(
      screen.queryByRole('link', { name: PRODUCT_COPY.actions.create }),
    ).not.toBeInTheDocument();
  });

  it('retries the first page from the unavailable state without changing the request', async () => {
    listMock.mockRejectedValueOnce(
      makeApiClientError({ status: 503, code: 'SERVICE_UNAVAILABLE' }),
    );
    listMock.mockResolvedValue(productEnvelope(makeProductPage([DRAFT])));
    renderCollection();

    (await screen.findByRole('button', { name: PRODUCT_COPY.list.unavailableRetry })).click();

    await waitFor(() => {
      expect(listMock).toHaveBeenCalledTimes(2);
    });
    expect(listMock.mock.calls[1]?.[0]).toEqual({ limit: 20 });
  });
});
