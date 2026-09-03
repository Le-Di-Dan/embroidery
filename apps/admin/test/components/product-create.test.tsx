/**
 * Create mode — `/products/new`.
 *
 * Everything is asserted at the generated-client boundary: the mock stands in
 * for `adminProduct_create`, so the tests see the exact request the operation
 * would receive rather than a URL a fetch mock happened to match.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  renderWithProviders,
  screen,
  createUser,
  waitFor,
} from '@embroidery/frontend-testing';
import { adminProductCreate, adminProductUpdate, adminCategoryList } from '@embroidery/api-client';

import { ProductCreateScreen } from '../../src/features/products/components/product-create-screen';
import { PRODUCT_FORM_COPY } from '../../src/features/products/model/product-form-copy';
import { makeApiClientError } from '../support/api-error';
import {
  categoryEnvelope,
  makeProductDetail,
  productDetailEnvelope,
} from '../support/product-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/products/new').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminProductCreate: jest.fn(),
  adminProductUpdate: jest.fn(),
  adminCategoryList: jest.fn(),
}));

const createMock = adminProductCreate as jest.MockedFunction<typeof adminProductCreate>;
const updateMock = adminProductUpdate as jest.MockedFunction<typeof adminProductUpdate>;
// The form's category options are the Admin inventory, filtered to the
// assignable (PUBLISHED) rows (`APP12-A01`).
const categoryMock = adminCategoryList as jest.MockedFunction<typeof adminCategoryList>;

// `jest.mock` is hoisted above every const, so the mock router is read back from
// the mocked module at test time rather than captured in a binding the factory
// would touch before it is initialised.
const navigation: { push: jest.Mock } = jest
  .requireMock<{
    useRouter: () => { push: jest.Mock };
  }>('next/navigation')
  .useRouter();

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  categoryMock.mockResolvedValue(categoryEnvelope());
  user = createUser();
});

async function fillValidDraft() {
  // The options arrive from `adminCategoryList`; selecting before they render
  // would fail for a reason that has nothing to do with what is being tested.
  await waitFor(() => {
    expect(
      screen.getByLabelText(PRODUCT_FORM_COPY.fields.categoryLabel).querySelectorAll('option')
        .length,
    ).toBeGreaterThan(1);
  });
  await user.type(
    screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel),
    'Khăn tay thêu sen đỏ',
  );
  await user.selectOptions(
    screen.getByLabelText(PRODUCT_FORM_COPY.fields.categoryLabel),
    'mu-luoi-trai',
  );
}

describe('create mode fields', () => {
  it('renders exactly the three POST-supported fields', () => {
    renderWithProviders(<ProductCreateScreen />);

    expect(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(PRODUCT_FORM_COPY.fields.categoryLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(PRODUCT_FORM_COPY.fields.descriptionLabel)).toBeInTheDocument();

    // Price and media cannot be carried by the POST body, so they are absent
    // rather than present-and-disabled, which would imply they are captured.
    expect(screen.queryByLabelText(PRODUCT_FORM_COPY.fields.priceLabel)).not.toBeInTheDocument();
    expect(screen.queryByText(PRODUCT_FORM_COPY.groups.media)).not.toBeInTheDocument();
    expect(screen.queryByText(PRODUCT_FORM_COPY.media.pick)).not.toBeInTheDocument();
  });

  it('shows no slug, status, variant, SKU or publication control', () => {
    const { container } = renderWithProviders(<ProductCreateScreen />);

    for (const forbidden of [
      PRODUCT_FORM_COPY.slug.cardTitle,
      'Phiên bản',
      'SKU',
      'Điều kiện xuất bản',
      'Tới bước xuất bản',
      'Xuất bản',
      'Gỡ xuất bản',
      'Lưu trữ',
      'Xoá',
    ]) {
      expect(container.textContent).not.toContain(forbidden);
    }
  });

  // The category-option assertions moved to `product-category-repoint.test.tsx`
  // at `APP12-A01`: the options are now a *filtered* view of the Admin
  // inventory, and the interesting claim is which states are offered here and
  // which are offered to the list filter — one file, so the contrast is visible.

  it('offers the placeholder alone, never a remembered list, when the read fails', async () => {
    categoryMock.mockRejectedValue(new Error('boom'));
    renderWithProviders(<ProductCreateScreen />);
    const select = screen.getByLabelText(PRODUCT_FORM_COPY.fields.categoryLabel);

    await waitFor(() => {
      expect([...select.querySelectorAll('option')]).toHaveLength(1);
    });
    for (const historical of ['Thú bông', 'Khăn', 'Quần áo', 'Khác']) {
      expect(select.textContent).not.toContain(historical);
    }
  });

  it('never renders a category UUID', () => {
    const { container } = renderWithProviders(<ProductCreateScreen />);

    expect(container.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
  });
});

describe('create validation', () => {
  it('does not call the API when the name is empty', async () => {
    renderWithProviders(<ProductCreateScreen />);
    // The options arrive asynchronously now, so selecting one has to wait for
    // them — otherwise this test fails on the select rather than on validation.
    await waitFor(() => {
      expect(
        screen.getByLabelText(PRODUCT_FORM_COPY.fields.categoryLabel).querySelectorAll('option')
          .length,
      ).toBeGreaterThan(1);
    });
    await user.selectOptions(
      screen.getByLabelText(PRODUCT_FORM_COPY.fields.categoryLabel),
      'mu-luoi-trai',
    );
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.create.submit }));

    expect(createMock).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      PRODUCT_FORM_COPY.validation.nameRequired,
    );
  });

  it('does not call the API when no category is chosen', async () => {
    renderWithProviders(<ProductCreateScreen />);
    await user.type(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel), 'Khăn');
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.create.submit }));

    expect(createMock).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      PRODUCT_FORM_COPY.validation.categoryRequired,
    );
  });

  it('marks the invalid field itself, not only the summary', async () => {
    renderWithProviders(<ProductCreateScreen />);
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.create.submit }));

    await waitFor(() =>
      expect(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel)).toHaveAttribute(
        'aria-invalid',
        'true',
      ),
    );
  });
});

describe('create request', () => {
  it('sends exactly the three fields and no others', async () => {
    createMock.mockResolvedValue(productDetailEnvelope(makeProductDetail()));
    renderWithProviders(<ProductCreateScreen />);
    await fillValidDraft();
    await user.type(screen.getByLabelText(PRODUCT_FORM_COPY.fields.descriptionLabel), 'Mô tả ngắn');
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.create.submit }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    const [body] = createMock.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(Object.keys(body).sort()).toEqual(['categorySlug', 'description', 'name']);
    expect(body).toMatchObject({
      categorySlug: 'mu-luoi-trai',
      name: 'Khăn tay thêu sen đỏ',
      description: 'Mô tả ngắn',
    });
  });

  it('never sends a server-owned field', async () => {
    createMock.mockResolvedValue(productDetailEnvelope(makeProductDetail()));
    renderWithProviders(<ProductCreateScreen />);
    await fillValidDraft();
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.create.submit }));

    await waitFor(() => expect(createMock).toHaveBeenCalled());
    const [body] = createMock.mock.calls[0] as unknown as [Record<string, unknown>];
    for (const field of [
      'slug',
      'status',
      'currency',
      'currencyCode',
      'displayOrder',
      'basePriceAmount',
      'mediaAssetIds',
      'expectedUpdatedAt',
    ]) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it('issues one POST and no hidden PATCH behind it', async () => {
    createMock.mockResolvedValue(productDetailEnvelope(makeProductDetail()));
    renderWithProviders(<ProductCreateScreen />);
    await fillValidDraft();
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.create.submit }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('trims the name before sending it', async () => {
    createMock.mockResolvedValue(productDetailEnvelope(makeProductDetail()));
    renderWithProviders(<ProductCreateScreen />);
    await user.type(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel), '  Khăn  ');
    await user.selectOptions(
      screen.getByLabelText(PRODUCT_FORM_COPY.fields.categoryLabel),
      'mu-luoi-trai',
    );
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.create.submit }));

    await waitFor(() => expect(createMock).toHaveBeenCalled());
    const [body] = createMock.mock.calls[0] as unknown as [{ name: string }];
    expect(body.name).toBe('Khăn');
  });
});

describe('create outcome', () => {
  it('navigates to the authoritative product id the server returned', async () => {
    const created = makeProductDetail({ productId: 'server-owned-id' });
    createMock.mockResolvedValue(productDetailEnvelope(created));
    renderWithProviders(<ProductCreateScreen />);
    await fillValidDraft();
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.create.submit }));

    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/products/server-owned-id'));
  });

  it('shows a safe failure without leaking the backend message or request id', async () => {
    createMock.mockRejectedValue(
      makeApiClientError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'duplicate key value violates unique constraint "products_slug_key"',
      }),
    );
    const { container } = renderWithProviders(<ProductCreateScreen />);
    await fillValidDraft();
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.create.submit }));

    expect(await screen.findByText(PRODUCT_FORM_COPY.create.failedTitle)).toBeInTheDocument();
    expect(container.textContent).not.toContain('products_slug_key');
    expect(container.textContent).not.toContain('req-test-0001');
    expect(container.textContent).not.toContain('INTERNAL_ERROR');
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('stays on the form when the request fails', async () => {
    createMock.mockRejectedValue(makeApiClientError({ status: 503, code: 'UNAVAILABLE' }));
    renderWithProviders(<ProductCreateScreen />);
    await fillValidDraft();
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.create.submit }));

    await screen.findByText(PRODUCT_FORM_COPY.create.failedTitle);
    expect(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel)).toHaveValue(
      'Khăn tay thêu sen đỏ',
    );
  });
});

describe('create dirty state', () => {
  it('leaves a pristine form without interception', async () => {
    renderWithProviders(<ProductCreateScreen />);
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.create.cancel }));

    expect(screen.queryByText(PRODUCT_FORM_COPY.unsaved.title)).not.toBeInTheDocument();
    expect(navigation.push).toHaveBeenCalledWith('/products');
  });

  it('confirms before discarding typed input', async () => {
    renderWithProviders(<ProductCreateScreen />);
    await user.type(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel), 'Khăn');
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.create.cancel }));

    expect(await screen.findByRole('dialog')).toHaveTextContent(PRODUCT_FORM_COPY.unsaved.title);
    expect(navigation.push).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.unsaved.leave }));
    expect(navigation.push).toHaveBeenCalledWith('/products');
  });

  it('keeps the operator on the form when they choose to stay', async () => {
    renderWithProviders(<ProductCreateScreen />);
    await user.type(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel), 'Khăn');
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.create.cancel }));
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.unsaved.stay }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel)).toHaveValue('Khăn');
  });
});
