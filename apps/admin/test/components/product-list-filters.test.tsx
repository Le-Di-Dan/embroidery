/**
 * The two approved filters and the request they produce (`498:272`).
 *
 * `next/navigation` is mocked with a *mutable* search string so a filter change
 * can be replayed the way the App Router would: the component calls
 * `router.replace`, the URL changes, the screen re-renders. That is what makes
 * the reset assertions meaningful rather than a restatement of the query key.
 */
import { createUser, renderWithProviders, screen, waitFor } from '@embroidery/frontend-testing';
import { adminProductList, adminCategoryList } from '@embroidery/api-client';

import { ProductListScreen } from '../../src/features/products/components/product-list-screen';
import { PRODUCT_COPY } from '../../src/features/products/model/product-copy';
import {
  categoryEnvelope,
  CATEGORY_FIXTURES,
  makeCategory,
  makeProduct,
  makeProductPage,
  productEnvelope,
} from '../support/product-fixture';

// The factory owns its own state so it can be referenced before the test
// module body has evaluated (jest.mock is hoisted above every import).
jest.mock('next/navigation', () => {
  const state = { search: '' };
  const router = { replace: jest.fn(), push: jest.fn(), refresh: jest.fn(), prefetch: jest.fn() };
  return {
    __state: state,
    __router: router,
    useRouter: () => router,
    usePathname: () => '/products',
    useSearchParams: () => new URLSearchParams(state.search),
  };
});

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminProductList: jest.fn(),
  adminCategoryList: jest.fn(),
}));

import * as navigation from 'next/navigation';

const navState = (navigation as unknown as { __state: { search: string } }).__state;
const navRouter = (navigation as unknown as { __router: { replace: jest.Mock } }).__router;
const listMock = adminProductList as jest.MockedFunction<typeof adminProductList>;
// The filter chips are the Admin inventory, in every lifecycle state
// (`APP12-A01`).
const categoryMock = adminCategoryList as jest.MockedFunction<typeof adminCategoryList>;

const DRAFT = makeProduct({ productId: 'p-1', name: 'Gấu bông thêu tay', status: 'DRAFT' });

function statusSelect() {
  return screen.getByLabelText(PRODUCT_COPY.filters.statusLabel);
}

function categorySelect() {
  return screen.getByLabelText(PRODUCT_COPY.filters.categoryLabel);
}

beforeEach(() => {
  jest.clearAllMocks();
  navState.search = '';
  listMock.mockResolvedValue(productEnvelope(makeProductPage([DRAFT])));
  categoryMock.mockResolvedValue(categoryEnvelope());
});

describe('filter controls', () => {
  it('renders exactly two labelled filters, in the approved order', async () => {
    renderWithProviders(<ProductListScreen />);
    await screen.findByRole('table');

    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(2);
    expect(selects[0]).toBe(statusSelect());
    expect(selects[1]).toBe(categorySelect());
  });

  it('offers the approved status options and the database categories, defaulting to "all"', async () => {
    renderWithProviders(<ProductListScreen />);
    await screen.findByRole('table');

    // Status is a closed lifecycle vocabulary — code owns it.
    expect([...statusSelect().querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      PRODUCT_COPY.filters.statusAll,
      PRODUCT_COPY.status.draft,
      PRODUCT_COPY.status.published,
      PRODUCT_COPY.status.archived,
    ]);
    // Categories are data — the database owns them.
    await waitFor(() => {
      expect([...categorySelect().querySelectorAll('option')].map((o) => o.textContent)).toEqual([
        PRODUCT_COPY.filters.categoryAll,
        'Mũ lưỡi trai',
        'Túi vải',
      ]);
    });
    expect(statusSelect()).toHaveValue('all');
    expect(categorySelect()).toHaveValue('all');
  });

  it('offers a category the build never knew, with no source change', async () => {
    categoryMock.mockResolvedValue(
      categoryEnvelope([
        ...CATEGORY_FIXTURES,
        makeCategory({
          id: '019c0000-0000-7000-8000-0000000022b9',
          slug: 'danh-muc-moi',
          name: 'Danh mục hoàn toàn mới',
          displayOrder: 9,
        }),
      ]),
    );
    renderWithProviders(<ProductListScreen />);
    await screen.findByRole('table');

    await waitFor(() => {
      expect([...categorySelect().querySelectorAll('option')].map((o) => o.value)).toContain(
        'danh-muc-moi',
      );
    });
  });

  it('offers "all" alone, never a remembered list, when the inventory read fails', async () => {
    categoryMock.mockRejectedValue(new Error('boom'));
    renderWithProviders(<ProductListScreen />);
    await screen.findByRole('table');

    await waitFor(() => {
      expect([...categorySelect().querySelectorAll('option')]).toHaveLength(1);
    });
    for (const historical of ['Thú bông', 'Khăn', 'Quần áo', 'Khác']) {
      expect(categorySelect().textContent).not.toContain(historical);
    }
  });

  it('adds no search, sort, price, date or owner control', async () => {
    const { container } = renderWithProviders(<ProductListScreen />);
    await screen.findByRole('table');

    expect(screen.queryAllByRole('searchbox')).toHaveLength(0);
    expect(container.querySelector('input')).toBeNull();
    expect(container.textContent).not.toContain('Tìm kiếm');
    expect(container.textContent).not.toContain('Sắp xếp');
    expect(container.textContent).not.toContain('Giá');
    // No "clear all": the approved design defines none.
    expect(container.textContent).not.toContain('Xoá tất cả');
  });

  it('keeps the filters visible and usable while a page is loading', () => {
    listMock.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<ProductListScreen />);

    expect(statusSelect()).toBeEnabled();
    expect(categorySelect()).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent(PRODUCT_COPY.list.loading);
  });
});

describe('wire mapping', () => {
  it('omits both parameters when neither filter is narrowed', async () => {
    renderWithProviders(<ProductListScreen />);
    await screen.findByRole('table');

    expect(listMock.mock.calls[0]?.[0]).toEqual({ limit: 20 });
  });

  it.each([
    ['DRAFT', PRODUCT_COPY.status.draft],
    ['PUBLISHED', PRODUCT_COPY.status.published],
    ['ARCHIVED', PRODUCT_COPY.status.archived],
  ])('sends status=%s when that option is selected', async (wire, label) => {
    navState.search = `status=${wire}`;
    renderWithProviders(<ProductListScreen />);
    await screen.findByRole('table');

    expect(statusSelect()).toHaveValue(wire);
    expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
    expect(listMock.mock.calls[0]?.[0]).toEqual({ limit: 20, status: wire });
  });

  it.each([['thu-bong'], ['khan'], ['quan-ao'], ['khac']])(
    'sends categorySlug=%s when that option is selected',
    async (slug) => {
      navState.search = `category=${slug}`;
      renderWithProviders(<ProductListScreen />);
      await screen.findByRole('table');

      expect(listMock.mock.calls[0]?.[0]).toEqual({ limit: 20, categorySlug: slug });
    },
  );

  it('sends both parameters when both filters are narrowed', async () => {
    navState.search = 'status=PUBLISHED&category=khan';
    renderWithProviders(<ProductListScreen />);
    await screen.findByRole('table');

    expect(listMock.mock.calls[0]?.[0]).toEqual({
      limit: 20,
      status: 'PUBLISHED',
      categorySlug: 'khan',
    });
  });

  it('never sends the "all" sentinel as a parameter value', async () => {
    navState.search = 'status=all&category=all';
    renderWithProviders(<ProductListScreen />);
    await screen.findByRole('table');

    expect(listMock.mock.calls[0]?.[0]).toEqual({ limit: 20 });
  });
});

describe('unsafe URL values', () => {
  it.each([
    ['status=DELETED', 'nonsense status'],
    ['category=<script>alert(1)</script>', 'injected category'],
    ['status=&category=', 'blank values'],
    ['status=DRAFT&status=PUBLISHED', 'repeated status'],
  ])('normalizes %s safely and never echoes it (%s)', async (search) => {
    navState.search = search;
    const { container } = renderWithProviders(<ProductListScreen />);
    await screen.findByRole('table');

    const params = listMock.mock.calls[0]?.[0] as Record<string, unknown>;
    // A repeated but valid value keeps the first; anything else falls back.
    expect(Object.keys(params)).not.toContain('categorySlug');
    expect(params.status === undefined || params.status === 'DRAFT').toBe(true);
    expect(container.textContent).not.toContain('DELETED');
    expect(container.textContent).not.toContain('script');
  });
});

describe('changing a filter', () => {
  it('rewrites the URL in place rather than pushing a history entry', async () => {
    const user = createUser();
    renderWithProviders(<ProductListScreen />);
    await screen.findByRole('table');

    await user.selectOptions(statusSelect(), 'PUBLISHED');

    expect(navRouter.replace).toHaveBeenCalledWith('/products?status=PUBLISHED', {
      scroll: false,
    });
  });

  it('drops a filter from the URL when it returns to "all"', async () => {
    const user = createUser();
    navState.search = 'status=PUBLISHED';
    renderWithProviders(<ProductListScreen />);
    await screen.findByRole('table');

    await user.selectOptions(statusSelect(), 'all');

    expect(navRouter.replace).toHaveBeenCalledWith('/products', { scroll: false });
  });

  it('fetches a fresh first page and never merges pages across filters', async () => {
    const user = createUser();
    const FIRST = makeProduct({ productId: 'p-old', name: 'Sản phẩm trước khi lọc' });
    const SECOND = makeProduct({ productId: 'p-new', name: 'Sản phẩm sau khi lọc' });
    listMock.mockResolvedValueOnce(productEnvelope(makeProductPage([FIRST], 'cursor-1')));
    listMock.mockResolvedValue(productEnvelope(makeProductPage([SECOND])));

    const { rerender } = renderWithProviders(<ProductListScreen />);
    // Each product renders twice — once in the table, once in the card list.
    expect(await screen.findAllByText(FIRST.name)).toHaveLength(2);
    // The options arrive from the inventory read; selecting before they render
    // would fail for a reason unrelated to pagination.
    await waitFor(() => {
      expect(categorySelect().querySelectorAll('option').length).toBeGreaterThan(1);
    });

    await user.selectOptions(categorySelect(), 'mu-luoi-trai');
    // Replay what the router would do: the URL changed, so the screen re-renders.
    navState.search = 'category=mu-luoi-trai';
    rerender(<ProductListScreen />);

    await waitFor(() => {
      expect(screen.getAllByText(SECOND.name)).toHaveLength(2);
    });
    // The pre-filter product is gone, and the new request started from page one.
    expect(screen.queryAllByText(FIRST.name)).toHaveLength(0);
    const last = listMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(last).toEqual({ limit: 20, categorySlug: 'mu-luoi-trai' });
    expect(last.cursor).toBeUndefined();
    // The continuation offered under the previous filter is gone with it.
    expect(
      screen.queryByRole('button', { name: PRODUCT_COPY.continuation.action }),
    ).not.toBeInTheDocument();
  });
});
