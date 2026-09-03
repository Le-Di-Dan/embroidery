/**
 * The Admin category management screen (`APP12-A01`; `915:342`, `916:343`).
 *
 * The assertions are the sentences an operator would act on:
 *
 *  - the whole taxonomy is rendered, in server order, with no state hidden;
 *  - a DRAFT slug is editable and a PUBLISHED slug is visibly, explainedly
 *    locked;
 *  - an ARCHIVED category offers nothing at all — no edit, no relist, no delete;
 *  - publish and archive go through the transitions collection, never a status
 *    PATCH, and always carry the record's own `expectedUpdatedAt`;
 *  - an archive refusal states the *current* count and where to go next;
 *  - a version conflict neither retries nor overwrites nor discards the edits;
 *  - no server message, code, status number or request id reaches the screen.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  renderWithProviders,
  screen,
  createUser,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import {
  adminCategoryCreate,
  adminCategoryList,
  adminCategoryTransition,
  adminCategoryUpdate,
} from '@embroidery/api-client';

import { CategoryManagementScreen } from '../../src/features/categories';
import { CATEGORY_COPY } from '../../src/features/categories/model/category-copy';
import { makeApiClientError } from '../support/api-error';
import {
  CATEGORY_ID_PUBLISHED,
  UPDATED_AT,
  envelope,
  makeArchivedCategory,
  makeCategoryRecord,
  makeDraftCategory,
  makeInventory,
  makePublishedCategory,
} from '../support/category-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/categories').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminCategoryList: jest.fn(),
  adminCategoryCreate: jest.fn(),
  adminCategoryUpdate: jest.fn(),
  adminCategoryTransition: jest.fn(),
}));

const listMock = adminCategoryList as jest.MockedFunction<typeof adminCategoryList>;
const createMock = adminCategoryCreate as jest.MockedFunction<typeof adminCategoryCreate>;
const updateMock = adminCategoryUpdate as jest.MockedFunction<typeof adminCategoryUpdate>;
const transitionMock = adminCategoryTransition as jest.MockedFunction<
  typeof adminCategoryTransition
>;

beforeEach(() => {
  jest.clearAllMocks();
  listMock.mockResolvedValue(envelope(makeInventory()));
});

async function openCategory(name: string) {
  const user = createUser();
  renderWithProviders(<CategoryManagementScreen />);
  await screen.findByRole('button', { name });
  await user.click(screen.getByRole('button', { name }));
  return user;
}

describe('category list', () => {
  it('renders every lifecycle state, in the order the server sent', async () => {
    renderWithProviders(<CategoryManagementScreen />);

    const rows = await screen.findAllByTestId(/^category-row-/);
    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual([
      'category-row-ao-thun',
      'category-row-qua-tang-doanh-nghiep',
      'category-row-khac',
    ]);

    expect(screen.getByTestId('category-status-ao-thun')).toHaveTextContent('Đang hiển thị');
    expect(screen.getByTestId('category-status-qua-tang-doanh-nghiep')).toHaveTextContent('Nháp');
    expect(screen.getByTestId('category-status-khac')).toHaveTextContent('Đã lưu trữ');
  });

  it('reads the Admin inventory and never the public one', async () => {
    renderWithProviders(<CategoryManagementScreen />);
    await screen.findAllByTestId(/^category-row-/);
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it('shows the published-product count and applies indexability only when published', async () => {
    renderWithProviders(<CategoryManagementScreen />);
    await screen.findAllByTestId(/^category-row-/);

    expect(screen.getByTestId('category-count-ao-thun')).toHaveTextContent('12');
    const published = within(screen.getByTestId('category-row-ao-thun'));
    expect(published.getByText(CATEGORY_COPY.table.indexableYes)).toBeInTheDocument();
    // A draft's indexability is not a promise the sitemap is keeping.
    const draft = within(screen.getByTestId('category-row-qua-tang-doanh-nghiep'));
    expect(draft.getByText(CATEGORY_COPY.table.indexableNotApplicable)).toBeInTheDocument();
  });

  it('never renders a category UUID', async () => {
    const { container } = renderWithProviders(<CategoryManagementScreen />);
    await screen.findAllByTestId(/^category-row-/);
    expect(container.textContent).not.toContain(CATEGORY_ID_PUBLISHED);
  });

  it('reports a failed read as a failure, never as an empty taxonomy', async () => {
    listMock.mockRejectedValue(
      makeApiClientError({ status: 500, code: 'INTERNAL', message: 'internal detail' }),
    );
    renderWithProviders(<CategoryManagementScreen />);

    const error = await screen.findByTestId('category-list-error');
    expect(error).toHaveTextContent(CATEGORY_COPY.failure.generic);
    expect(error.textContent).not.toContain('internal detail');
    expect(screen.queryByTestId('category-list-empty')).not.toBeInTheDocument();
  });

  it('makes the whole list unavailable — with no retry — when the taxonomy is too large', async () => {
    listMock.mockRejectedValue(
      makeApiClientError({
        status: 409,
        code: 'CATEGORY_INVENTORY_TOO_LARGE',
        message: 'too many rows',
      }),
    );
    renderWithProviders(<CategoryManagementScreen />);

    const error = await screen.findByTestId('category-list-error');
    expect(error).toHaveTextContent(CATEGORY_COPY.failure.inventoryTooLarge);
    expect(within(error).queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('create', () => {
  it('sends the exact four-field body and offers no publish shortcut', async () => {
    createMock.mockResolvedValue(envelope(makeCategoryRecord()));
    const user = createUser();
    renderWithProviders(<CategoryManagementScreen />);
    await screen.findAllByTestId(/^category-row-/);

    await user.click(screen.getByTestId('category-create'));
    await user.type(screen.getByTestId('category-name'), 'Quà tặng doanh nghiệp');
    await user.type(screen.getByTestId('category-slug'), 'qua-tang-doanh-nghiep');
    await user.clear(screen.getByTestId('category-display-order'));
    await user.type(screen.getByTestId('category-display-order'), '30');

    // No publish and no archive exist before the record does.
    expect(screen.queryByTestId('category-publish')).not.toBeInTheDocument();
    expect(screen.queryByTestId('category-archive')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('category-save'));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0]?.[0]).toEqual({
      name: 'Quà tặng doanh nghiệp',
      slug: 'qua-tang-doanh-nghiep',
      isIndexable: false,
      displayOrder: 30,
    });
  });

  it('does not derive the slug from the name', async () => {
    const user = createUser();
    renderWithProviders(<CategoryManagementScreen />);
    await screen.findAllByTestId(/^category-row-/);

    await user.click(screen.getByTestId('category-create'));
    await user.type(screen.getByTestId('category-name'), 'Quà tặng doanh nghiệp');
    expect(screen.getByTestId('category-slug')).toHaveValue('');
  });
});

describe('edit and slug lock', () => {
  it('leaves a DRAFT slug editable', async () => {
    await openCategory('Quà tặng doanh nghiệp');
    expect(screen.getByTestId('category-slug')).toBeEnabled();
    expect(screen.getByText(CATEGORY_COPY.form.slugHelp)).toBeInTheDocument();
  });

  it('locks a PUBLISHED slug, keeps it visible, and says why', async () => {
    await openCategory('Áo thun');

    const slug = screen.getByTestId('category-slug');
    expect(slug).toBeDisabled();
    expect(slug).toHaveValue('ao-thun');
    expect(screen.getByText(CATEGORY_COPY.form.slugLockedChip)).toBeInTheDocument();
    expect(screen.getByText(CATEGORY_COPY.form.slugLockedHelp)).toBeInTheDocument();
    // Name, indexability and order stay editable.
    expect(screen.getByTestId('category-name')).toBeEnabled();
    expect(screen.getByTestId('category-indexable')).toBeEnabled();
    expect(screen.getByTestId('category-display-order')).toBeEnabled();
  });

  it('sends only what changed, with the record’s own token', async () => {
    updateMock.mockResolvedValue(envelope(makeCategoryRecord({ name: 'Áo phông' })));
    const user = await openCategory('Áo thun');

    await user.clear(screen.getByTestId('category-name'));
    await user.type(screen.getByTestId('category-name'), 'Áo phông');
    await user.click(screen.getByTestId('category-save'));

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock.mock.calls[0]?.[0]).toBe(CATEGORY_ID_PUBLISHED);
    expect(updateMock.mock.calls[0]?.[1]).toEqual({
      expectedUpdatedAt: UPDATED_AT,
      name: 'Áo phông',
    });
  });

  it('sends nothing at all when the form is unchanged', async () => {
    const user = await openCategory('Áo thun');
    await user.click(screen.getByTestId('category-save'));
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('shows a duplicate slug on the slug field, not as a page banner', async () => {
    updateMock.mockRejectedValue(
      makeApiClientError({
        status: 409,
        code: 'CATEGORY_SLUG_CONFLICT',
        message: 'duplicate key value violates unique constraint',
      }),
    );
    const user = await openCategory('Quà tặng doanh nghiệp');

    await user.clear(screen.getByTestId('category-slug'));
    await user.type(screen.getByTestId('category-slug'), 'ao-thun');
    await user.click(screen.getByTestId('category-save'));

    await screen.findByText(CATEGORY_COPY.failure.slugConflict);
    expect(screen.queryByTestId('category-panel-error')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('duplicate key');
  });

  it('makes an ARCHIVED category read-only, with no relist, restore or delete', async () => {
    await openCategory('Khác');

    expect(screen.getByTestId('category-archived-notice')).toBeInTheDocument();
    for (const field of ['category-name', 'category-slug', 'category-display-order']) {
      expect(screen.getByTestId(field)).toBeDisabled();
    }
    expect(screen.getByTestId('category-indexable')).toBeDisabled();
    expect(screen.queryByTestId('category-save')).not.toBeInTheDocument();
    expect(screen.queryByTestId('category-publish')).not.toBeInTheDocument();
    expect(screen.queryByTestId('category-archive')).not.toBeInTheDocument();
    // The row is still in the list: archiving is not deletion.
    expect(screen.getByTestId('category-row-khac')).toBeInTheDocument();
  });
});

describe('transitions', () => {
  it('publishes a DRAFT through the transitions collection, never a status PATCH', async () => {
    transitionMock.mockResolvedValue(envelope(makeCategoryRecord({ status: 'PUBLISHED' })));
    const user = await openCategory('Quà tặng doanh nghiệp');

    await user.click(screen.getByTestId('category-publish'));

    await waitFor(() => expect(transitionMock).toHaveBeenCalledTimes(1));
    expect(transitionMock.mock.calls[0]?.[1]).toEqual({
      action: 'PUBLISH',
      expectedUpdatedAt: UPDATED_AT,
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('offers archive only on a PUBLISHED category', async () => {
    await openCategory('Áo thun');
    expect(screen.getByTestId('category-archive')).toBeInTheDocument();
    expect(screen.queryByTestId('category-publish')).not.toBeInTheDocument();
  });

  it('refuses an archive with the latest count and a safe next action', async () => {
    transitionMock.mockRejectedValue(
      makeApiClientError({
        status: 409,
        code: 'CATEGORY_ARCHIVE_BLOCKED_BY_PUBLISHED_PRODUCTS',
        message: 'products.category_id still referenced',
      }),
    );
    // The refusal re-reads the inventory; the count moved while the operator looked.
    listMock
      .mockResolvedValueOnce(envelope(makeInventory()))
      .mockResolvedValue(
        envelope(
          makeInventory([
            makePublishedCategory({ publishedProductCount: 7 }),
            makeDraftCategory(),
            makeArchivedCategory(),
          ]),
        ),
      );

    const user = await openCategory('Áo thun');
    await user.click(screen.getByTestId('category-archive'));

    const refusal = await screen.findByTestId('category-archive-refusal');
    await waitFor(() => expect(refusal).toHaveTextContent('Còn 7 sản phẩm'));
    expect(within(refusal).getByRole('link', { name: 'Xem 7 sản phẩm' })).toHaveAttribute(
      'href',
      '/products?status=PUBLISHED&category=ao-thun',
    );
    expect(refusal.textContent).not.toContain('category_id');
    // Nothing was done to the products, and the category is still published.
    expect(updateMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('category-status-ao-thun')).toHaveTextContent('Đang hiển thị');
  });
});

describe('version conflict', () => {
  it('neither retries, overwrites, nor discards the operator’s edits', async () => {
    updateMock.mockRejectedValue(
      makeApiClientError({
        status: 409,
        code: 'CATEGORY_VERSION_CONFLICT',
        message: 'expectedUpdatedAt is stale',
      }),
    );
    const user = await openCategory('Áo thun');

    await user.clear(screen.getByTestId('category-name'));
    await user.type(screen.getByTestId('category-name'), 'Áo phông');
    await user.click(screen.getByTestId('category-save'));

    const conflict = await screen.findByTestId('category-conflict');
    expect(conflict).toHaveTextContent(CATEGORY_COPY.conflict.title);
    // Exactly one attempt: no blind retry.
    expect(updateMock).toHaveBeenCalledTimes(1);
    // The edits are still on screen, untouched.
    expect(screen.getByTestId('category-name')).toHaveValue('Áo phông');
    // There is no overwrite affordance of any kind.
    expect(within(conflict).getAllByRole('button')).toHaveLength(2);
    expect(conflict.textContent).not.toContain('expectedUpdatedAt');

    await user.click(within(conflict).getByRole('button', { name: CATEGORY_COPY.conflict.reload }));
    await waitFor(() => expect(listMock.mock.calls.length).toBeGreaterThan(1));
  });
});
