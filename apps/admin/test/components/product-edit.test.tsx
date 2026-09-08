/**
 * Edit/detail mode — `/products/[productId]`.
 *
 * Asserted at the generated-client boundary, so the PATCH body under test is
 * exactly what `adminProduct_update` would receive. The stale-token behaviour
 * in particular is tested here rather than against a URL: the whole point is
 * which token value crosses the boundary, and how many times.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import { adminProductDetail, adminProductUpdate } from '@embroidery/api-client';

import { ProductDetailScreen } from '../../src/features/products/components/product-detail-screen';
import { PRODUCT_FORM_COPY } from '../../src/features/products/model/product-form-copy';
import { makeApiClientError } from '../support/api-error';
import {
  makeProductDetail,
  makeProductMedia,
  productDetailEnvelope,
} from '../support/product-fixture';

jest.mock('next/navigation', () => mockCreateNavigationMock('/products/p-1').module);
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminProductDetail: jest.fn(),
  adminProductUpdate: jest.fn(),
}));

const detailMock = adminProductDetail as jest.MockedFunction<typeof adminProductDetail>;
const updateMock = adminProductUpdate as jest.MockedFunction<typeof adminProductUpdate>;

const TOKEN = '2026-07-28T09:16:00.000Z';
const PRODUCT_ID = '01920000-0000-7000-8000-000000000001';

let user: ReturnType<typeof createUser>;

beforeEach(() => {
  jest.clearAllMocks();
  user = createUser();
});

function renderDetail() {
  return renderWithProviders(<ProductDetailScreen productId={PRODUCT_ID} />);
}

async function renderLoadedDraft(overrides = {}) {
  detailMock.mockResolvedValue(productDetailEnvelope(makeProductDetail(overrides)));
  const result = renderDetail();
  await screen.findByLabelText(PRODUCT_FORM_COPY.fields.nameLabel);
  return result;
}

function updateBody(): Record<string, unknown> {
  const call = updateMock.mock.calls[0] as unknown as [string, Record<string, unknown>];
  return call[1];
}

describe('detail loading states', () => {
  it('shows the loading state before the record arrives', () => {
    detailMock.mockReturnValue(new Promise(() => {}) as never);
    renderDetail();

    expect(screen.getByRole('status')).toHaveTextContent(PRODUCT_FORM_COPY.detail.loading);
  });

  it('renders the editable draft once loaded', async () => {
    await renderLoadedDraft();

    expect(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel)).toHaveValue(
      'Khăn tay thêu sen đỏ',
    );
    expect(screen.getByLabelText(PRODUCT_FORM_COPY.fields.priceLabel)).toHaveValue('450000');
  });

  it('distinguishes a missing product from a failing one', async () => {
    detailMock.mockRejectedValue(makeApiClientError({ status: 404, code: 'PRODUCT_NOT_FOUND' }));
    renderDetail();

    expect(await screen.findByText(PRODUCT_FORM_COPY.detail.notFoundTitle)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: PRODUCT_FORM_COPY.detail.backToList })).toHaveAttribute(
      'href',
      '/products',
    );
  });

  it('offers a retry for a transient failure', async () => {
    detailMock.mockRejectedValueOnce(makeApiClientError({ status: 503, code: 'UNAVAILABLE' }));
    detailMock.mockResolvedValue(productDetailEnvelope(makeProductDetail()));
    renderDetail();

    await user.click(await screen.findByRole('button', { name: PRODUCT_FORM_COPY.detail.retry }));
    expect(await screen.findByLabelText(PRODUCT_FORM_COPY.fields.nameLabel)).toBeInTheDocument();
  });

  /**
   * This asserted that a PUBLISHED product rendered the "not editable" panel,
   * and it was right while `APP2-B02` was the only Product write there was.
   * `APP12-M01.B2` added one bounded operation for exactly this state, so a
   * published product now renders its media editor with the commercial fields
   * locked — proved in `product-published-media.test.tsx`. ARCHIVED is what
   * still reaches the read-only panel, and it is asserted here instead.
   */
  it('renders an archived product read-only instead of pretending it is missing', async () => {
    detailMock.mockResolvedValue(productDetailEnvelope(makeProductDetail({ status: 'ARCHIVED' })));
    renderDetail();

    expect(await screen.findByText(PRODUCT_FORM_COPY.detail.notEditableTitle)).toBeInTheDocument();
    expect(screen.queryByLabelText(PRODUCT_FORM_COPY.fields.nameLabel)).not.toBeInTheDocument();
  });

  it('never leaks a raw backend message or request id', async () => {
    detailMock.mockRejectedValue(
      makeApiClientError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'relation "products" does not exist',
      }),
    );
    const { container } = renderDetail();

    await screen.findByText(PRODUCT_FORM_COPY.detail.unavailableTitle);
    expect(container.textContent).not.toContain('relation "products"');
    expect(container.textContent).not.toContain('req-test-0001');
  });
});

describe('server-owned values stay read-only', () => {
  it('shows the slug as text with no input bound to it', async () => {
    const { container } = await renderLoadedDraft();

    expect(screen.getByText('khan-tay-theu-sen-do')).toBeInTheDocument();
    for (const input of [...container.querySelectorAll('input, select, textarea')]) {
      expect((input as HTMLInputElement).value).not.toBe('khan-tay-theu-sen-do');
    }
  });

  it('states that renaming does not move the public address', async () => {
    await renderLoadedDraft();

    expect(screen.getByText(PRODUCT_FORM_COPY.slug.note)).toBeInTheDocument();
  });

  it('renders status as a label, never as a select', async () => {
    const { container } = await renderLoadedDraft();

    const selects = [...container.querySelectorAll('select')];
    expect(selects).toHaveLength(1);
    expect(selects[0]).toHaveAccessibleName(PRODUCT_FORM_COPY.fields.categoryLabel);
  });

  it('never renders the category UUID, a storage key or a checksum', async () => {
    const { container } = await renderLoadedDraft({
      media: [makeProductMedia(0)],
    });

    expect(container.textContent).not.toContain('PRODUCTION_SENSITIVE');
    expect(container.textContent).not.toContain('CATALOG_MEDIA');
    expect(container.textContent).not.toMatch(/[0-9a-f]{64}/i);
  });
});

describe('save request', () => {
  it('sends only the changed field plus the concurrency token', async () => {
    updateMock.mockResolvedValue(
      productDetailEnvelope(makeProductDetail({ name: 'Tên mới', updatedAt: 'v2' })),
    );
    await renderLoadedDraft();

    const name = screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel);
    await user.clear(name);
    await user.type(name, 'Tên mới');
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.edit.save }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateBody()).toEqual({ expectedUpdatedAt: TOKEN, name: 'Tên mới' });
  });

  it('sends the exact expectedUpdatedAt from the loaded record', async () => {
    updateMock.mockResolvedValue(productDetailEnvelope(makeProductDetail({ updatedAt: 'v2' })));
    await renderLoadedDraft({ updatedAt: 'token-from-server' });

    await user.type(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel), 'X');
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.edit.save }));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(updateBody().expectedUpdatedAt).toBe('token-from-server');
  });

  it('addresses the product by its id', async () => {
    updateMock.mockResolvedValue(productDetailEnvelope(makeProductDetail({ updatedAt: 'v2' })));
    await renderLoadedDraft();

    await user.type(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel), 'X');
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.edit.save }));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(updateMock.mock.calls[0]?.[0]).toBe(PRODUCT_ID);
  });

  it('offers no save or cancel control until something has changed', async () => {
    await renderLoadedDraft();

    expect(screen.queryByRole('button', { name: PRODUCT_FORM_COPY.edit.save })).toBeNull();
    expect(screen.queryByRole('button', { name: PRODUCT_FORM_COPY.edit.cancel })).toBeNull();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('reveals both controls on the first edit and withdraws them when it is undone', async () => {
    await renderLoadedDraft();
    const name = screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel);

    await user.type(name, '!');
    expect(screen.getByRole('button', { name: PRODUCT_FORM_COPY.edit.save })).toBeEnabled();
    expect(screen.getByRole('button', { name: PRODUCT_FORM_COPY.edit.cancel })).toBeEnabled();

    // Typing back to the loaded value is not a change, so there is nothing to save.
    await user.type(name, '{backspace}');
    expect(screen.queryByRole('button', { name: PRODUCT_FORM_COPY.edit.save })).toBeNull();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('clears the description only when the operator empties it', async () => {
    updateMock.mockResolvedValue(productDetailEnvelope(makeProductDetail({ updatedAt: 'v2' })));
    await renderLoadedDraft();

    await user.clear(screen.getByLabelText(PRODUCT_FORM_COPY.fields.descriptionLabel));
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.edit.save }));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(updateBody()).toEqual({ expectedUpdatedAt: TOKEN, description: null });
  });

  it('leaves an untouched description out of the request', async () => {
    updateMock.mockResolvedValue(productDetailEnvelope(makeProductDetail({ updatedAt: 'v2' })));
    await renderLoadedDraft();

    await user.type(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel), '!');
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.edit.save }));

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(updateBody()).not.toHaveProperty('description');
  });

  it('shows the approved saving state while the request is in flight', async () => {
    let resolve: (value: unknown) => void = () => {};
    updateMock.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }) as never,
    );
    await renderLoadedDraft();

    await user.type(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel), '!');
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.edit.save }));

    expect(await screen.findByText(PRODUCT_FORM_COPY.edit.savingTitle)).toBeInTheDocument();
    resolve(productDetailEnvelope(makeProductDetail({ updatedAt: 'v2' })));
  });

  it('reconciles from the authoritative response, not from the typed values', async () => {
    updateMock.mockResolvedValue(
      productDetailEnvelope(makeProductDetail({ name: 'Tên máy chủ chuẩn hoá', updatedAt: 'v2' })),
    );
    await renderLoadedDraft();

    await user.type(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel), '!');
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.edit.save }));

    await waitFor(() =>
      expect(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel)).toHaveValue(
        'Tên máy chủ chuẩn hoá',
      ),
    );
  });

  it('uses the refreshed token on the next save', async () => {
    updateMock.mockResolvedValue(productDetailEnvelope(makeProductDetail({ updatedAt: 'v2' })));
    await renderLoadedDraft();

    const name = screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel);
    await user.type(name, '!');
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.edit.save }));
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));

    await user.type(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel), '?');
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.edit.save }));
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(2));

    const second = updateMock.mock.calls[1] as unknown as [string, { expectedUpdatedAt: string }];
    expect(second[1].expectedUpdatedAt).toBe('v2');
  });
});

describe('version conflict', () => {
  async function triggerConflict() {
    updateMock.mockRejectedValue(
      makeApiClientError({
        status: 409,
        code: 'PRODUCT_VERSION_CONFLICT',
        message: 'expectedUpdatedAt 2026-07-28T09:16:00.000Z is stale',
      }),
    );
    await renderLoadedDraft();
    await user.type(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel), '!');
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.edit.save }));
    return screen.findByRole('dialog');
  }

  it('shows the approved conflict copy', async () => {
    const dialog = await triggerConflict();

    expect(dialog).toHaveTextContent(PRODUCT_FORM_COPY.conflict.title);
    expect(dialog).toHaveTextContent(PRODUCT_FORM_COPY.conflict.body);
    expect(
      within(dialog).getByRole('button', { name: PRODUCT_FORM_COPY.conflict.reload }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: PRODUCT_FORM_COPY.conflict.close }),
    ).toBeInTheDocument();
  });

  it('offers no force-save and never retries with the stale token', async () => {
    const dialog = await triggerConflict();

    const labels = within(dialog)
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(labels).toEqual([PRODUCT_FORM_COPY.conflict.close, PRODUCT_FORM_COPY.conflict.reload]);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it('never shows the timestamp, token value or request id as the explanation', async () => {
    const dialog = await triggerConflict();

    expect(dialog.textContent).not.toContain(TOKEN);
    expect(dialog.textContent).not.toContain('req-test-0001');
    expect(dialog.textContent).not.toContain('expectedUpdatedAt');
    expect(dialog.textContent).not.toContain('PRODUCT_VERSION_CONFLICT');
  });

  it('refetches the authoritative record on reload', async () => {
    await triggerConflict();
    detailMock.mockResolvedValue(
      productDetailEnvelope(makeProductDetail({ name: 'Bản mới nhất', updatedAt: 'v9' })),
    );

    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.conflict.reload }));

    await waitFor(() =>
      expect(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel)).toHaveValue('Bản mới nhất'),
    );
    expect(detailMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the operator’s edits on screen when they dismiss the dialog', async () => {
    await triggerConflict();
    await user.click(screen.getByRole('button', { name: PRODUCT_FORM_COPY.conflict.close }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText(PRODUCT_FORM_COPY.fields.nameLabel)).toHaveValue(
      'Khăn tay thêu sen đỏ!',
    );
  });
});

describe('excluded capabilities', () => {
  it('carries no variant, SKU or publication-readiness copy at all', async () => {
    const { container } = await renderLoadedDraft();

    // These have no field in any B02 operation, so the words must not exist.
    for (const forbidden of [
      'Phiên bản',
      'SKU',
      'Điều kiện xuất bản',
      'Tới bước xuất bản',
      'Gỡ xuất bản',
      'Lưu trữ',
      'Xoá',
      'Xóa',
    ]) {
      expect(container.textContent).not.toContain(forbidden);
    }
  });

  it('offers no archive or delete control', async () => {
    await renderLoadedDraft();

    // `APP2-A04` added a publication *entry point* here — a link to the screen
    // that owns the interaction — so "Xuất bản" is now legitimately present as
    // navigation. Archive and delete still have no approved surface
    // (`FU-APP2-PRODUCT-ARCHIVE-UI-01`) and must not appear in any form.
    for (const name of ['Gỡ xuất bản', 'Lưu trữ', 'Xoá', 'Xóa']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
    expect(screen.getByText(PRODUCT_FORM_COPY.edit.savePublishNote).closest('button')).toBeNull();
  });

  it('performs no lifecycle mutation itself — the entry point only navigates', async () => {
    await renderLoadedDraft();

    const entry = screen.getByTestId('publication-entry');
    expect(entry.tagName).toBe('A');
    expect(entry).toHaveAttribute('href', `/products/${PRODUCT_ID}/publication`);
    // Still a link, not a button: this screen never publishes anything.
    expect(screen.queryByRole('button', { name: 'Xuất bản' })).not.toBeInTheDocument();
  });

  it('cannot even import the archive operation from the client boundary', async () => {
    await renderLoadedDraft();

    // Withheld on purpose: archive has no approved surface, so it is absent
    // from the public api-client surface and unreachable from any screen.
    const client = jest.requireActual<Record<string, unknown>>('@embroidery/api-client');
    expect(client.adminProductArchive).toBeUndefined();
  });
});
