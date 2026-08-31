/**
 * The create bootstrap, and the two staged `APP11-A01` actions it restores
 * (`APP11-A02`; `866:905`, `867:907`).
 *
 * The assertions that matter are about truthfulness, because each is a sentence
 * the operator would act on:
 *
 *  - the create request carries the five fields the contract requires and
 *    nothing else — no status, no images, no archive timestamp;
 *  - the slug is visible, editable and validated before anything is sent;
 *  - a taken address is reported as a taken address, and every value the
 *    operator typed is still on screen;
 *  - success navigates using the **id the server returned**, never the slug
 *    that was typed;
 *  - the list's rows are real links to the editor, one per row, and no row is a
 *    clickable div.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';
import { adminGalleryEntryCreate, adminGalleryEntryList } from '@embroidery/api-client';

import { GalleryCreateAction } from '../../src/features/gallery-editor';
import { GALLERY_EDITOR_COPY } from '../../src/features/gallery-editor/model/gallery-editor-copy';
import { GalleryListScreen } from '../../src/features/gallery-list';
import { GALLERY_LIST_COPY } from '../../src/features/gallery-list/model/gallery-list-copy';
import { makeApiClientError } from '../support/api-error';
import { ENTRY_ID, envelope, makeEntry, makeListPage } from '../support/gallery-fixture';
import { EDITOR_ENTRY_ID, makeDetail } from '../support/gallery-editor-fixture';

const mockNav = mockCreateNavigationMock('/gallery');
/**
 * The URL's query string, per test. The filter lives in the URL, so the two
 * empty states are distinguished by this and by nothing else — which is exactly
 * how the screen distinguishes them.
 */
let mockSearch = '';
// Every reference is inside an arrow body, never in the factory itself: the
// factory runs while this module's own imports are still being resolved, which
// is before `mockNav` is initialized.
jest.mock('next/navigation', () => ({
  useRouter: () => mockNav.router,
  usePathname: () => mockNav.module.usePathname(),
  useSearchParams: () => new URLSearchParams(mockSearch),
}));
jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  adminGalleryEntryList: jest.fn(),
  adminGalleryAssetPreview: jest.fn(),
  adminGalleryEntryCreate: jest.fn(),
}));

const listMock = adminGalleryEntryList as jest.MockedFunction<typeof adminGalleryEntryList>;
const createMock = adminGalleryEntryCreate as jest.MockedFunction<typeof adminGalleryEntryCreate>;

const COPY = GALLERY_EDITOR_COPY.create;

beforeEach(() => {
  jest.clearAllMocks();
  mockSearch = '';
  listMock.mockResolvedValue(envelope(makeListPage([makeEntry()])));
  createMock.mockResolvedValue(envelope(makeDetail()));
});

const renderList = () =>
  renderWithProviders(<GalleryListScreen createAction={<GalleryCreateAction />} />);

async function openDialog() {
  const user = createUser();
  renderWithProviders(<GalleryCreateAction />);
  await user.click(screen.getByTestId('gallery-create-action'));
  return user;
}

/** Fills every required field with values the contract accepts. */
async function fillValidForm(user: ReturnType<typeof createUser>) {
  await user.type(screen.getByTestId('gallery-create-title'), 'Bộ sưu tập mùa hè');
  await user.type(screen.getByTestId('gallery-create-slug'), 'bo-suu-tap-mua-he');
  await user.type(screen.getByTestId('gallery-create-description'), 'Các mẫu thêu mùa hè.');
}

describe('the create bootstrap', () => {
  it('is reachable from the list header', async () => {
    renderList();
    await screen.findByTestId('gallery-list-table');
    expect(screen.getByTestId('gallery-create-action')).toHaveTextContent(COPY.open);
  });

  it('sends exactly the five fields the contract requires', async () => {
    const user = await openDialog();
    await fillValidForm(user);
    await user.click(screen.getByTestId('gallery-create-submit'));

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledTimes(1);
    });
    const [body] = createMock.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(body).toEqual({
      title: 'Bộ sưu tập mùa hè',
      slug: 'bo-suu-tap-mua-he',
      description: 'Các mẫu thêu mùa hè.',
      displayOrder: 0,
      isIndexable: true,
    });
  });

  it('refuses to send an invalid slug and says which rule was broken', async () => {
    const user = await openDialog();
    await user.type(screen.getByTestId('gallery-create-title'), 'Bộ sưu tập');
    await user.type(screen.getByTestId('gallery-create-slug'), 'Bộ Sưu Tập');
    await user.type(screen.getByTestId('gallery-create-description'), 'Mô tả.');
    await user.click(screen.getByTestId('gallery-create-submit'));

    expect(createMock).not.toHaveBeenCalled();
    expect(await screen.findByTestId('gallery-validation')).toHaveTextContent(
      COPY.validation.slugInvalid,
    );
  });

  it('refuses an empty description, which no entry could ever publish without', async () => {
    const user = await openDialog();
    await user.type(screen.getByTestId('gallery-create-title'), 'Bộ sưu tập');
    await user.type(screen.getByTestId('gallery-create-slug'), 'bo-suu-tap');
    await user.click(screen.getByTestId('gallery-create-submit'));

    expect(createMock).not.toHaveBeenCalled();
    expect(await screen.findByTestId('gallery-validation')).toHaveTextContent(
      COPY.validation.descriptionRequired,
    );
  });

  it('suggests a slug into the visible field, where the operator can change it', async () => {
    const user = await openDialog();
    await user.type(screen.getByTestId('gallery-create-title'), 'Áo thun thêu hoa sen');
    await user.click(screen.getByTestId('gallery-create-suggest-slug'));

    const slug = screen.getByTestId('gallery-create-slug');
    expect(slug).toHaveValue('ao-thun-theu-hoa-sen');
    // Still an ordinary editable input, not a locked derived value.
    expect(slug).not.toHaveAttribute('readonly');
    await user.clear(slug);
    await user.type(slug, 'dia-chi-khac');
    expect(slug).toHaveValue('dia-chi-khac');
  });

  it('navigates with the id the server returned, never the slug that was typed', async () => {
    createMock.mockResolvedValue(
      envelope(makeDetail({ galleryEntryId: EDITOR_ENTRY_ID, slug: 'dia-chi-cua-server' })),
    );
    const user = await openDialog();
    await fillValidForm(user);
    await user.click(screen.getByTestId('gallery-create-submit'));

    await waitFor(() => {
      expect(mockNav.router.push).toHaveBeenCalledWith(`/gallery/${EDITOR_ENTRY_ID}`);
    });
    // Nothing addressed the slug — neither the one typed nor the one returned.
    for (const [target] of mockNav.router.push.mock.calls as [string][]) {
      expect(target).not.toContain('bo-suu-tap-mua-he');
      expect(target).not.toContain('dia-chi-cua-server');
    }
  });

  it('reports a taken address without discarding a single typed value', async () => {
    createMock.mockRejectedValue(
      makeApiClientError({ status: 409, code: 'GALLERY_ENTRY_SLUG_CONFLICT' }),
    );
    const user = await openDialog();
    await fillValidForm(user);
    await user.click(screen.getByTestId('gallery-create-submit'));

    const failure = await screen.findByTestId('gallery-create-failure');
    expect(failure).toHaveTextContent(COPY.failure.slugConflict.title);
    expect(failure).toHaveTextContent(COPY.failure.slugConflict.body);
    expect(screen.getByTestId('gallery-create-title')).toHaveValue('Bộ sưu tập mùa hè');
    expect(screen.getByTestId('gallery-create-slug')).toHaveValue('bo-suu-tap-mua-he');
    expect(mockNav.router.push).not.toHaveBeenCalled();
  });

  it('never renders a server message, code or request id', async () => {
    createMock.mockRejectedValue(
      makeApiClientError({
        status: 409,
        code: 'GALLERY_ENTRY_SLUG_CONFLICT',
        message: 'That gallery address is already in use.',
      }),
    );
    const user = await openDialog();
    await fillValidForm(user);
    await user.click(screen.getByTestId('gallery-create-submit'));

    await screen.findByTestId('gallery-create-failure');
    const rendered = document.body.textContent ?? '';
    expect(rendered).not.toContain('That gallery address');
    expect(rendered).not.toContain('GALLERY_ENTRY_SLUG_CONFLICT');
    expect(rendered).not.toContain('req-test-0001');
    expect(rendered).not.toContain('409');
  });

  it('offers no control for a field the create body does not accept', async () => {
    await openDialog();
    const dialog = screen.getByTestId('gallery-create-dialog');
    // Exactly five controls, which are the five required fields. The prose may
    // *mention* images and the linked product — it says where they are set —
    // but there is nothing here to set them with.
    const controls = [
      ...within(dialog).getAllByRole('textbox'),
      ...within(dialog).getAllByRole('checkbox'),
    ];
    expect(controls).toHaveLength(5);
    for (const control of controls) {
      const name = control.getAttribute('aria-label') ?? control.id;
      const label = dialog.querySelector(`label[for="${CSS.escape(name)}"]`)?.textContent ?? '';
      expect(label).not.toMatch(/Trạng thái|Ảnh|Lưu trữ|Sản phẩm/);
    }
    // And no lifecycle or media action hides among the buttons.
    for (const button of within(dialog).getAllByRole('button')) {
      expect(button.textContent ?? '').not.toMatch(/Xuất bản|Lưu trữ|Chọn ảnh/);
    }
  });
});

describe('the restored list navigation', () => {
  it('links every desktop row to the editor, exactly once', async () => {
    renderList();
    await screen.findByTestId('gallery-list-table');

    const link = screen.getByTestId('gallery-list-row-link');
    expect(link).toHaveAttribute('href', `/gallery/${ENTRY_ID}`);
    expect(link).toHaveAccessibleName(GALLERY_LIST_COPY.entry.openLabel('Áo thun thêu hoa sen'));
    // The row itself is not a second target.
    const row = screen.getByTestId('gallery-list-row');
    expect(within(row).getAllByRole('link')).toHaveLength(1);
  });

  it('links every mobile card to the editor without swallowing the whole card', async () => {
    renderList();
    await screen.findByTestId('gallery-list-card');

    const link = screen.getByTestId('gallery-list-card-link');
    expect(link).toHaveAttribute('href', `/gallery/${ENTRY_ID}`);
    const card = screen.getByTestId('gallery-list-card');
    expect(within(card).getAllByRole('link')).toHaveLength(1);
  });

  it('offers the create action in the unfiltered empty state and nowhere else', async () => {
    listMock.mockResolvedValue(envelope(makeListPage([])));
    renderList();
    await screen.findByTestId('gallery-list-empty');

    // Header and empty panel each carry one; both are the same control.
    expect(screen.getAllByTestId('gallery-create-action')).toHaveLength(2);
  });

  it('keeps the create action out of the filtered empty state', async () => {
    mockSearch = 'status=ARCHIVED';
    listMock.mockResolvedValue(envelope(makeListPage([])));
    renderList();
    await screen.findByTestId('gallery-list-filter-empty');

    // Only the header's. An operator who filtered to a state with no rows wants
    // to drop the filter, not create an entry.
    expect(screen.getAllByTestId('gallery-create-action')).toHaveLength(1);
    expect(screen.getByTestId('gallery-list-clear-filter')).toBeInTheDocument();
  });
});
