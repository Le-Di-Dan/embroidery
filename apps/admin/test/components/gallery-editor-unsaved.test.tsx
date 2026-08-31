/**
 * Unsaved-change protection in the gallery editor (`APP11-A02`).
 *
 * The editor holds two independent kinds of unsaved work — authoring edits and
 * the image arrangement — and an operator can have either without the other.
 * Protecting one and not the other would silently discard exactly the half that
 * was not checked, so these tests exercise both.
 *
 * A pristine editor must never intercept, and hydration must never register as
 * an edit: an interceptor that fired on a screen nobody had touched would train
 * operators to click through it.
 */
import {
  createNavigationMock as mockCreateNavigationMock,
  createUser,
  renderWithProviders,
  screen,
  waitFor,
} from '@embroidery/frontend-testing';
import { adminGalleryAssetPreview, adminGalleryEntryDetail } from '@embroidery/api-client';

import { GalleryEditorScreen } from '../../src/features/gallery-editor';
import { GALLERY_EDITOR_COPY } from '../../src/features/gallery-editor/model/gallery-editor-copy';
import { GALLERY_MEDIA_COPY } from '../../src/features/gallery-editor/model/gallery-media-copy';
import { installObjectUrl } from '../support/object-url';
import {
  EDITOR_ENTRY_ID,
  GALLERY_ASSET_ID,
  GALLERY_ASSET_ID_2,
  envelope,
  makeDetail,
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
  adminGalleryAssetPreview: jest.fn(),
}));

const detailMock = adminGalleryEntryDetail as jest.MockedFunction<typeof adminGalleryEntryDetail>;
const previewMock = adminGalleryAssetPreview as jest.MockedFunction<
  typeof adminGalleryAssetPreview
>;

installObjectUrl('gallery-unsaved');

beforeEach(() => {
  jest.clearAllMocks();
  detailMock.mockResolvedValue(envelope(makeDetail()));
  previewMock.mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
});

const render = () => renderWithProviders(<GalleryEditorScreen entryId={EDITOR_ENTRY_ID} />);

const BACK = GALLERY_EDITOR_COPY.detail.backToList;

describe('leaving a pristine editor', () => {
  it('navigates immediately, because there is nothing to lose', async () => {
    const user = createUser();
    render();
    await user.click(await screen.findByText(BACK));

    // Hydration is not an edit: the dirty flags diff against the record the
    // screen was seeded from, so seeding cannot itself register a change.
    expect(screen.queryByTestId('gallery-unsaved-dialog')).toBeNull();
    await waitFor(() => {
      expect(mockNav.router.push).toHaveBeenCalledWith('/gallery');
    });
  });
});

describe('leaving with unsaved authoring edits', () => {
  it('asks before discarding, and stays put when the operator says no', async () => {
    const user = createUser();
    render();
    await user.type(await screen.findByTestId('gallery-authoring-title-input'), ' thêm');
    await user.click(screen.getByText(BACK));

    const dialog = await screen.findByTestId('gallery-unsaved-dialog');
    expect(dialog).toHaveTextContent(GALLERY_EDITOR_COPY.unsaved.body);
    expect(mockNav.router.push).not.toHaveBeenCalled();

    await user.click(screen.getByText(GALLERY_EDITOR_COPY.unsaved.stay));
    expect(screen.queryByTestId('gallery-unsaved-dialog')).toBeNull();
    expect(mockNav.router.push).not.toHaveBeenCalled();
    // The edit is still there — staying costs nothing.
    expect(screen.getByTestId('gallery-authoring-title-input')).toHaveValue(
      'Áo thun thêu hoa sen thêm',
    );
  });

  it('leaves only on an explicit choice to discard', async () => {
    const user = createUser();
    render();
    await user.type(await screen.findByTestId('gallery-authoring-title-input'), ' thêm');
    await user.click(screen.getByText(BACK));
    await user.click(await screen.findByText(GALLERY_EDITOR_COPY.unsaved.leave));

    await waitFor(() => {
      expect(mockNav.router.push).toHaveBeenCalledWith('/gallery');
    });
  });

  it('stops asking once the edit is undone', async () => {
    const user = createUser();
    render();
    const title = await screen.findByTestId('gallery-authoring-title-input');
    await user.type(title, ' thêm');
    await user.click(screen.getByText(GALLERY_EDITOR_COPY.authoring.discard));
    await user.click(screen.getByText(BACK));

    expect(screen.queryByTestId('gallery-unsaved-dialog')).toBeNull();
    await waitFor(() => {
      expect(mockNav.router.push).toHaveBeenCalledWith('/gallery');
    });
  });
});

describe('leaving with an unsaved image arrangement', () => {
  it('is protected too, even with the authoring form untouched', async () => {
    detailMock.mockResolvedValue(envelope(withAssets([GALLERY_ASSET_ID, GALLERY_ASSET_ID_2])));
    const user = createUser();
    render();
    await screen.findAllByTestId('gallery-media-row');
    await user.click(screen.getByRole('button', { name: /Di chuyển trước: Ảnh 2/ }));
    await user.click(screen.getByText(BACK));

    expect(await screen.findByTestId('gallery-unsaved-dialog')).toBeInTheDocument();
    expect(mockNav.router.push).not.toHaveBeenCalled();
  });

  it('stops asking once the arrangement is discarded', async () => {
    detailMock.mockResolvedValue(envelope(withAssets([GALLERY_ASSET_ID, GALLERY_ASSET_ID_2])));
    const user = createUser();
    render();
    await screen.findAllByTestId('gallery-media-row');
    await user.click(screen.getByRole('button', { name: /Di chuyển trước: Ảnh 2/ }));
    await user.click(screen.getByText(GALLERY_MEDIA_COPY.section.discard));
    await user.click(screen.getByText(BACK));

    expect(screen.queryByTestId('gallery-unsaved-dialog')).toBeNull();
  });
});
