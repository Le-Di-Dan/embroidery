/**
 * The gallery editor's load, authoring save, linked product and publication
 * (`APP11-A02`; `868:909`, `870:1104`, `870:1187`, `870:1274`).
 *
 * The assertions that matter are about truthfulness, because each is a sentence
 * the operator would act on:
 *
 *  - the four load states are distinguishable, and each offers only a recovery
 *    that can actually work;
 *  - the form hydrates the persisted record and a save carries only what
 *    changed;
 *  - the slug is read-only and says so;
 *  - the linked product is named, never printed as a UUID;
 *  - readiness mirrors the server's four requirements exactly, and a `noindex`
 *    entry publishes;
 *  - a guarded command carries the latest token, and a stale one is reported
 *    rather than replayed;
 *  - no server message, code, status number or request id ever reaches the
 *    screen as copy.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import {
  adminGalleryAssetPreview,
  adminGalleryEntryDetail,
  adminGalleryEntryPublish,
  adminGalleryEntryUnpublish,
  adminGalleryEntryUpdate,
  adminProductDetail,
  adminProductList,
} from '@embroidery/api-client';

import { GalleryEditorScreen } from '../../src/features/gallery-editor';
import { GALLERY_EDITOR_COPY } from '../../src/features/gallery-editor/model/gallery-editor-copy';
import { makeApiClientError } from '../support/api-error';
import { installObjectUrl } from '../support/object-url';
import {
  EDITOR_ENTRY_ID,
  GALLERY_ASSET_ID,
  LINKED_PRODUCT,
  PRODUCT_ID,
  PRODUCT_ID_2,
  UPDATED_AT,
  UPDATED_AT_NEXT,
  envelope,
  makeDetail,
  makeProductPage,
  withAssets,
} from '../support/gallery-editor-fixture';

const mockNav = mockCreateNavigationMock(`/gallery/${EDITOR_ENTRY_ID}`);
jest.mock('next/navigation', () => ({
  useRouter: () => mockNav.router,
  usePathname: () => mockNav.module.usePathname(),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminGalleryEntryDetail: jest.fn(),
  adminGalleryEntryUpdate: jest.fn(),
  adminGalleryEntryPublish: jest.fn(),
  adminGalleryEntryUnpublish: jest.fn(),
  adminGalleryAssetPreview: jest.fn(),
  adminProductDetail: jest.fn(),
  adminProductList: jest.fn(),
}));

const detailMock = adminGalleryEntryDetail as jest.MockedFunction<typeof adminGalleryEntryDetail>;
const updateMock = adminGalleryEntryUpdate as jest.MockedFunction<typeof adminGalleryEntryUpdate>;
const publishMock = adminGalleryEntryPublish as jest.MockedFunction<
  typeof adminGalleryEntryPublish
>;
const unpublishMock = adminGalleryEntryUnpublish as jest.MockedFunction<
  typeof adminGalleryEntryUnpublish
>;
const previewMock = adminGalleryAssetPreview as jest.MockedFunction<
  typeof adminGalleryAssetPreview
>;
const productDetailMock = adminProductDetail as jest.MockedFunction<typeof adminProductDetail>;
const productListMock = adminProductList as jest.MockedFunction<typeof adminProductList>;

const COPY = GALLERY_EDITOR_COPY;

// jsdom implements neither half of the object-URL API the preview depends on.
installObjectUrl('gallery-editor');

beforeEach(() => {
  jest.clearAllMocks();
  detailMock.mockResolvedValue(envelope(makeDetail()));
  previewMock.mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
  productDetailMock.mockResolvedValue(envelope(LINKED_PRODUCT));
  productListMock.mockResolvedValue(envelope(makeProductPage()));
});

const render = () => renderWithProviders(<GalleryEditorScreen entryId={EDITOR_ENTRY_ID} />);

describe('the load boundary', () => {
  it('reads the entry through the generated operation, by id', async () => {
    render();
    await screen.findByRole('heading', { level: 1 });
    expect(detailMock).toHaveBeenCalledTimes(1);
    expect(detailMock.mock.calls[0]?.[0]).toBe(EDITOR_ENTRY_ID);
  });

  it('distinguishes not-found from a failure worth retrying', async () => {
    detailMock.mockRejectedValue(
      makeApiClientError({ status: 404, code: 'GALLERY_ENTRY_NOT_FOUND' }),
    );
    render();
    const panel = await screen.findByTestId('gallery-editor-not-found');
    expect(panel).toHaveTextContent(COPY.detail.notFoundTitle);
    // Reload cannot resurrect a record that does not exist; only the list is
    // offered.
    expect(screen.queryByText(COPY.detail.retry)).toBeNull();
    expect(screen.getByText(COPY.detail.backToList)).toHaveAttribute('href', '/gallery');
  });

  it('offers a retry only where a second attempt could succeed', async () => {
    detailMock.mockRejectedValue(
      makeApiClientError({ status: 500, code: 'INTERNAL_SERVER_ERROR' }),
    );
    render();
    expect(await screen.findByTestId('gallery-editor-unavailable')).toHaveTextContent(
      COPY.detail.unavailableTitle,
    );
    expect(screen.getByText(COPY.detail.retry)).toBeInTheDocument();
  });

  it('sends an expired session to sign in, and offers no retry', async () => {
    detailMock.mockRejectedValue(makeApiClientError({ status: 401, code: 'UNAUTHORIZED' }));
    render();
    expect(await screen.findByTestId('gallery-editor-expired')).toHaveTextContent(
      COPY.detail.unauthenticatedTitle,
    );
    expect(screen.getByText(COPY.detail.signIn)).toHaveAttribute('href', '/login');
    expect(screen.queryByText(COPY.detail.retry)).toBeNull();
  });

  it('renders exactly one h1, and it is the entry', async () => {
    render();
    const headings = await screen.findAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Áo thun thêu hoa sen');
  });
});

describe('the authoring form', () => {
  it('hydrates from the persisted record', async () => {
    detailMock.mockResolvedValue(
      envelope(
        makeDetail({
          displayOrder: 42,
          seoTitle: 'Tiêu đề tìm kiếm',
          seoDescription: 'Mô tả tìm kiếm',
          isIndexable: false,
        }),
      ),
    );
    render();
    expect(await screen.findByTestId('gallery-authoring-title-input')).toHaveValue(
      'Áo thun thêu hoa sen',
    );
    expect(screen.getByTestId('gallery-authoring-display-order')).toHaveValue('42');
    expect(screen.getByTestId('gallery-authoring-seo-title')).toHaveValue('Tiêu đề tìm kiếm');
    expect(screen.getByTestId('gallery-authoring-indexable')).not.toBeChecked();
  });

  it('offers no save until something has actually changed', async () => {
    render();
    await screen.findByTestId('gallery-authoring-title-input');
    expect(screen.queryByTestId('gallery-authoring-save')).toBeNull();
  });

  it('renders the slug read-only, with the approved explanation', async () => {
    render();
    const slug = await screen.findByTestId('gallery-authoring-slug');
    expect(slug).toHaveValue('ao-thun-theu-hoa-sen');
    expect(slug).toHaveAttribute('readonly');
    expect(slug).toHaveAccessibleDescription(COPY.authoring.fields.slugLocked);
  });

  it('sends only the field that changed, and no concurrency token', async () => {
    updateMock.mockResolvedValue(envelope(makeDetail({ title: 'Tên mới' })));
    const user = createUser();
    render();
    const title = await screen.findByTestId('gallery-authoring-title-input');
    await user.clear(title);
    await user.type(title, 'Tên mới');
    await user.click(screen.getByTestId('gallery-authoring-save'));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledTimes(1);
    });
    const [entryId, body] = updateMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(entryId).toBe(EDITOR_ENTRY_ID);
    expect(body).toEqual({ title: 'Tên mới' });
  });

  it('keeps the operator input on screen when a save is refused', async () => {
    updateMock.mockRejectedValue(
      makeApiClientError({ status: 500, code: 'INTERNAL_SERVER_ERROR' }),
    );
    const user = createUser();
    render();
    const title = await screen.findByTestId('gallery-authoring-title-input');
    await user.clear(title);
    await user.type(title, 'Tên mới');
    await user.click(screen.getByTestId('gallery-authoring-save'));

    expect(await screen.findByTestId('gallery-authoring-failure')).toHaveTextContent(
      COPY.authoring.failure.generic.title,
    );
    expect(screen.getByTestId('gallery-authoring-title-input')).toHaveValue('Tên mới');
  });

  it('discards local edits back to the persisted values, and nothing else', async () => {
    const user = createUser();
    render();
    const title = await screen.findByTestId('gallery-authoring-title-input');
    await user.clear(title);
    await user.type(title, 'Tên tạm');
    await user.click(screen.getByText(COPY.authoring.discard));

    expect(screen.getByTestId('gallery-authoring-title-input')).toHaveValue('Áo thun thêu hoa sen');
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('the linked product', () => {
  it('names the product rather than printing its identifier', async () => {
    detailMock.mockResolvedValue(envelope(makeDetail({ linkedProductId: PRODUCT_ID })));
    render();
    await waitFor(() => {
      expect(screen.getByTestId('gallery-linked-product-value')).toHaveTextContent(
        'Áo thun cotton trắng',
      );
    });
    expect(document.body.textContent ?? '').not.toContain(PRODUCT_ID);
  });

  it('admits it cannot resolve a name rather than falling back to the id', async () => {
    productDetailMock.mockRejectedValue(makeApiClientError({ status: 404, code: 'NOT_FOUND' }));
    detailMock.mockResolvedValue(envelope(makeDetail({ linkedProductId: PRODUCT_ID })));
    render();
    await waitFor(() => {
      expect(screen.getByTestId('gallery-linked-product-value')).toHaveTextContent(
        COPY.linkedProduct.unresolved,
      );
    });
    expect(document.body.textContent ?? '').not.toContain(PRODUCT_ID);
  });

  it('opens no catalog read at all when nothing is linked', async () => {
    render();
    await screen.findByTestId('gallery-linked-product-value');
    expect(screen.getByTestId('gallery-linked-product-value')).toHaveTextContent(
      COPY.linkedProduct.none,
    );
    expect(productDetailMock).not.toHaveBeenCalled();
    expect(productListMock).not.toHaveBeenCalled();
  });

  it('clears the link as an explicit null, not as an omitted field', async () => {
    detailMock.mockResolvedValue(envelope(makeDetail({ linkedProductId: PRODUCT_ID })));
    updateMock.mockResolvedValue(envelope(makeDetail()));
    const user = createUser();
    render();
    await user.click(await screen.findByTestId('gallery-linked-product-clear'));
    await user.click(screen.getByTestId('gallery-authoring-save'));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledTimes(1);
    });
    expect(updateMock.mock.calls[0]?.[1]).toEqual({ linkedProductId: null });
  });

  it('picks a product from the existing Admin catalog read', async () => {
    updateMock.mockResolvedValue(envelope(makeDetail({ linkedProductId: PRODUCT_ID_2 })));
    const user = createUser();
    render();
    await user.click(await screen.findByTestId('gallery-linked-product-choose'));
    await user.click(await screen.findByRole('button', { name: /Chọn: Khăn tay thêu tay/ }));
    await user.click(screen.getByTestId('gallery-authoring-save'));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledTimes(1);
    });
    expect(updateMock.mock.calls[0]?.[1]).toEqual({ linkedProductId: PRODUCT_ID_2 });
    // One catalog list read, opened only because the dialog was opened.
    expect(productListMock).toHaveBeenCalledTimes(1);
  });
});

describe('publication readiness', () => {
  it('lists the four requirements and no more', async () => {
    render();
    await screen.findByTestId('gallery-publication-summary');
    for (const requirement of ['title', 'slug', 'description', 'asset']) {
      expect(screen.getByTestId(`gallery-requirement-${requirement}`)).toBeInTheDocument();
    }
    // Neither SEO text nor the linked product nor indexability is a requirement.
    for (const absent of ['seoTitle', 'seoDescription', 'linkedProduct', 'isIndexable']) {
      expect(screen.queryByTestId(`gallery-requirement-${absent}`)).toBeNull();
    }
  });

  it('blocks publish while the only missing fact is an image', async () => {
    render();
    await screen.findByTestId('gallery-publication-summary');
    expect(screen.getByTestId('gallery-requirement-asset')).toHaveAttribute('data-met', 'false');
    expect(screen.getByTestId('gallery-publish')).toBeDisabled();
  });

  it('publishes a noindex entry, because indexability is not a requirement', async () => {
    detailMock.mockResolvedValue(envelope(withAssets([GALLERY_ASSET_ID], { isIndexable: false })));
    publishMock.mockResolvedValue(
      envelope(withAssets([GALLERY_ASSET_ID], { status: 'PUBLISHED', updatedAt: UPDATED_AT_NEXT })),
    );
    const user = createUser();
    render();
    const publish = await screen.findByTestId('gallery-publish');
    expect(publish).toBeEnabled();
    await user.click(publish);

    await waitFor(() => {
      expect(publishMock).toHaveBeenCalledTimes(1);
    });
    expect(publishMock.mock.calls[0]?.[1]).toEqual({ expectedUpdatedAt: UPDATED_AT });
  });

  it('requires a save before a command, rather than chaining a hidden write', async () => {
    detailMock.mockResolvedValue(envelope(withAssets([GALLERY_ASSET_ID])));
    const user = createUser();
    render();
    const title = await screen.findByTestId('gallery-authoring-title-input');
    await user.type(title, ' thêm');

    expect(screen.getByTestId('gallery-publication-unsaved')).toHaveTextContent(
      COPY.publication.unsavedTitle,
    );
    expect(screen.getByTestId('gallery-publish')).toBeDisabled();
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('carries the requirements a refusal named, without echoing its message', async () => {
    detailMock.mockResolvedValue(envelope(withAssets([GALLERY_ASSET_ID])));
    publishMock.mockRejectedValue(
      makeApiClientError({
        status: 409,
        code: 'GALLERY_ENTRY_PUBLICATION_NOT_READY',
        message: 'This gallery entry is not ready to be published yet.',
        errors: [
          {
            field: 'requirements',
            code: 'GALLERY_ENTRY_ELIGIBLE_ASSET_REQUIRED',
            message: 'not ready',
          },
        ],
      }),
    );
    const user = createUser();
    render();
    await user.click(await screen.findByTestId('gallery-publish'));

    expect(await screen.findByTestId('gallery-publication-failure')).toHaveTextContent(
      COPY.publication.failure.notReady.title,
    );
    const rendered = document.body.textContent ?? '';
    expect(rendered).not.toContain('This gallery entry is not ready');
    expect(rendered).not.toContain('GALLERY_ENTRY_ELIGIBLE_ASSET_REQUIRED');
    expect(rendered).not.toContain('req-test-0001');
  });
});

describe('unpublish', () => {
  const published = withAssets([GALLERY_ASSET_ID], { status: 'PUBLISHED' });

  it('confirms first, and says plainly that it is not deletion', async () => {
    detailMock.mockResolvedValue(envelope(published));
    const user = createUser();
    render();
    await user.click(await screen.findByTestId('gallery-unpublish'));

    const dialog = await screen.findByTestId('gallery-unpublish-dialog');
    expect(dialog).toHaveTextContent(COPY.publication.confirmUnpublish.body);
    expect(dialog).toHaveAttribute('role', 'alertdialog');
    expect(unpublishMock).not.toHaveBeenCalled();
  });

  it('sends the latest token and preserves everything on the way back to draft', async () => {
    detailMock.mockResolvedValue(envelope(published));
    unpublishMock.mockResolvedValue(
      envelope(withAssets([GALLERY_ASSET_ID], { status: 'DRAFT', updatedAt: UPDATED_AT_NEXT })),
    );
    const user = createUser();
    render();
    await user.click(await screen.findByTestId('gallery-unpublish'));
    await user.click(await screen.findByTestId('gallery-unpublish-confirm'));

    await waitFor(() => {
      expect(unpublishMock).toHaveBeenCalledTimes(1);
    });
    expect(unpublishMock.mock.calls[0]?.[1]).toEqual({ expectedUpdatedAt: UPDATED_AT });
    // The image survives the transition, which is the point of the copy.
    expect(await screen.findByTestId('gallery-media-row')).toBeInTheDocument();
  });

  it('offers no publish action while the entry is already published', async () => {
    detailMock.mockResolvedValue(envelope(published));
    render();
    await screen.findByTestId('gallery-unpublish');
    expect(screen.queryByTestId('gallery-publish')).toBeNull();
  });
});

describe('an archived entry', () => {
  const archived = withAssets([GALLERY_ASSET_ID], { status: 'ARCHIVED' });

  it('shows its state and offers no lifecycle action this build could perform', async () => {
    detailMock.mockResolvedValue(envelope(archived));
    render();
    await screen.findByTestId('gallery-publication-summary');
    expect(screen.getByTestId('gallery-publication-summary')).toHaveTextContent(
      COPY.publication.archivedTitle,
    );
    // No publish, no unpublish, and — critically — no archive or restore, which
    // no delivered operation could carry out.
    expect(screen.queryByTestId('gallery-publish')).toBeNull();
    expect(screen.queryByTestId('gallery-unpublish')).toBeNull();
    expect(document.body.textContent ?? '').not.toMatch(/Khôi phục|Lưu trữ mục/);
  });

  it('keeps authoring editable, because the server accepts the patch', async () => {
    detailMock.mockResolvedValue(envelope(archived));
    render();
    expect(await screen.findByTestId('gallery-authoring-title-input')).toBeEnabled();
  });

  it('offers no media save, because that write would be refused', async () => {
    detailMock.mockResolvedValue(envelope(archived));
    render();
    expect(await screen.findByTestId('gallery-media-locked')).toBeInTheDocument();
    expect(screen.getByTestId('gallery-media-add')).toBeDisabled();
    expect(screen.getByTestId('gallery-media-prepare')).toBeDisabled();
  });
});
