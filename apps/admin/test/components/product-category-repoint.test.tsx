/**
 * The Product screens' category repoint (`APP12-A01` §13).
 *
 * `APP12-C02` gave categories a lifecycle and left this to A01: the Product
 * screens must stop reading `publicCategory_list` and read `adminCategory_list`
 * instead — and then *use the states differently*, which is the whole point of
 * changing the read.
 *
 *  - **Authoring** offers only `PUBLISHED` categories, because that is the only
 *    state `CategoryResolver` accepts on save. A draft or archived option would
 *    be a choice the write path is guaranteed to refuse.
 *  - **The filter** offers every state, because it finds products that already
 *    live somewhere. A product left under an archived category must stay
 *    findable by the one fact that distinguishes it.
 *
 * The two sit in one file because the single interesting claim is that one read
 * serves both audiences with different rules, and a test per file would hide it.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import { adminCategoryList, adminProductList, publicCategoryList } from '@embroidery/api-client';

import * as navigation from 'next/navigation';

import { ProductCreateScreen, ProductListScreen } from '../../src/features/products';
import { PRODUCT_COPY } from '../../src/features/products/model/product-copy';
import { PRODUCT_FORM_COPY } from '../../src/features/products/model/product-form-copy';
import {
  CATEGORY_FIXTURES,
  categoryEnvelope,
  makeCategory,
  makeProduct,
  makeProductPage,
  productEnvelope,
} from '../support/product-fixture';

// The factory owns its own router so it can be referenced before the test
// module body has evaluated (jest.mock is hoisted above every import).
jest.mock('next/navigation', () => {
  const nav = mockCreateNavigationMock('/products');
  return { ...nav.module, __router: nav.router };
});
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminCategoryList: jest.fn(),
  publicCategoryList: jest.fn(),
  adminProductList: jest.fn(),
}));

const navRouter = (navigation as unknown as { __router: { replace: jest.Mock } }).__router;
const categoryMock = adminCategoryList as jest.MockedFunction<typeof adminCategoryList>;
const publicMock = publicCategoryList as jest.MockedFunction<typeof publicCategoryList>;
const listMock = adminProductList as jest.MockedFunction<typeof adminProductList>;

/** Published, archived, and a draft — one row in each state the contract has. */
const EVERY_STATE = [
  ...CATEGORY_FIXTURES,
  makeCategory({
    id: '019c0000-0000-7000-8000-0000000022b3',
    slug: 'qua-tang-doanh-nghiep',
    name: 'Quà tặng doanh nghiệp',
    status: 'DRAFT',
    isIndexable: false,
    displayOrder: 9,
  }),
];

beforeEach(() => {
  jest.clearAllMocks();
  categoryMock.mockResolvedValue(categoryEnvelope(EVERY_STATE));
  listMock.mockResolvedValue(productEnvelope(makeProductPage([makeProduct({ productId: 'p-1' })])));
});

function optionValues(select: HTMLElement): string[] {
  return [...select.querySelectorAll('option')].map((option) => option.value);
}

describe('product authoring', () => {
  it('reads the Admin inventory, never the public one', async () => {
    renderWithProviders(<ProductCreateScreen />);
    await waitFor(() => expect(categoryMock).toHaveBeenCalled());
    expect(publicMock).not.toHaveBeenCalled();
  });

  it('offers only PUBLISHED categories as assignable options', async () => {
    renderWithProviders(<ProductCreateScreen />);
    const select = screen.getByLabelText(PRODUCT_FORM_COPY.fields.categoryLabel);

    await waitFor(() => {
      // The placeholder plus the one published row. The archived `tui-vai` and
      // the draft `qua-tang-doanh-nghiep` are not choices the save would accept.
      expect(optionValues(select)).toEqual(['', 'mu-luoi-trai']);
    });
    expect(select.textContent).not.toContain('Túi vải');
    expect(select.textContent).not.toContain('Quà tặng doanh nghiệp');
  });

  it('offers a category the build never knew, with no source change', async () => {
    categoryMock.mockResolvedValue(
      categoryEnvelope([
        ...EVERY_STATE,
        makeCategory({
          id: '019c0000-0000-7000-8000-0000000022b4',
          slug: 'danh-muc-moi',
          name: 'Danh mục hoàn toàn mới',
          displayOrder: 11,
        }),
      ]),
    );
    renderWithProviders(<ProductCreateScreen />);
    const select = screen.getByLabelText(PRODUCT_FORM_COPY.fields.categoryLabel);

    await waitFor(() => expect(optionValues(select)).toContain('danh-muc-moi'));
    expect(select.textContent).toContain('Danh mục hoàn toàn mới');
  });

  it('offers the placeholder alone — never a remembered list — when the read fails', async () => {
    categoryMock.mockRejectedValue(new Error('boom'));
    renderWithProviders(<ProductCreateScreen />);
    const select = screen.getByLabelText(PRODUCT_FORM_COPY.fields.categoryLabel);

    await waitFor(() => expect(optionValues(select)).toEqual(['']));
    for (const historical of ['Thú bông', 'Khăn', 'Quần áo', 'Khác']) {
      expect(select.textContent).not.toContain(historical);
    }
  });
});

describe('product list filter', () => {
  it('offers every lifecycle state, archived included', async () => {
    renderWithProviders(<ProductListScreen />);
    const select = screen.getByLabelText(PRODUCT_COPY.filters.categoryLabel);

    await waitFor(() => {
      expect(optionValues(select)).toEqual([
        'all',
        'mu-luoi-trai',
        'tui-vai',
        'qua-tang-doanh-nghiep',
      ]);
    });
    // Labelled by the row's own name, valued by its slug — the wire key is
    // unchanged and no status ever reaches the request.
    expect(select.textContent).toContain('Túi vải');
  });

  it('keeps the server ordering rather than re-sorting alphabetically', async () => {
    renderWithProviders(<ProductListScreen />);
    const select = screen.getByLabelText(PRODUCT_COPY.filters.categoryLabel);

    await waitFor(() => expect(optionValues(select)).toHaveLength(4));
    // Server order is displayOrder 7, 8, 9. Alphabetical would put
    // "Mũ lưỡi trai" after "Quà tặng doanh nghiệp".
    expect(optionValues(select).slice(1)).toEqual([
      'mu-luoi-trai',
      'tui-vai',
      'qua-tang-doanh-nghiep',
    ]);
  });

  it('filters by an archived category like any other', async () => {
    renderWithProviders(<ProductListScreen />);
    const select = screen.getByLabelText(PRODUCT_COPY.filters.categoryLabel);
    await waitFor(() => expect(optionValues(select)).toHaveLength(4));

    await createUser().selectOptions(select, 'tui-vai');

    // The screen owns the address; the request built from it is covered by the
    // filter test's replaying navigation mock. What matters here is that an
    // archived slug travels as an ordinary `category` value with no status
    // qualifier and no special casing.
    await waitFor(() =>
      expect(navRouter.replace).toHaveBeenCalledWith('/products?category=tui-vai', {
        scroll: false,
      }),
    );
  });
});
