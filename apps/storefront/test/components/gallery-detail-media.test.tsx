import { fireEvent, renderWithProviders, screen, within } from '@embroidery/frontend-testing';

import { GalleryDetailMedia } from '../../src/features/gallery-detail/components/gallery-detail-media';
import { GalleryDetailRelatedProduct } from '../../src/features/gallery-detail/components/gallery-detail-related-product';
import { GalleryDetailScreen } from '../../src/features/gallery-detail';
import { toGalleryDetailView } from '../../src/features/gallery-detail';
import { makeGalleryDetail, GALLERY_DETAIL_SLUG } from '../support/gallery-fixture';

const TITLE = 'Kỷ niệm được giữ lại';

/** Media in the exact shape and order the API returns it. */
function media(count: number): { url: string }[] {
  return Array.from({ length: count }, (_, index) => ({
    url: `/api/public/gallery-entries/${GALLERY_DETAIL_SLUG}/assets/a-${index + 1}/catalog-preview`,
  }));
}

function thumbnails(): HTMLElement[] {
  return screen.getAllByRole('button', { name: /^Xem ảnh/ });
}

describe('ordered media selection', () => {
  it('shows the first returned image initially, in API order', () => {
    renderWithProviders(<GalleryDetailMedia media={media(3)} title={TITLE} />);

    const image = screen.getByAltText(`${TITLE} — ảnh 1 trên 3`);
    expect(image).toHaveAttribute(
      'src',
      `/api/public/gallery-entries/${GALLERY_DETAIL_SLUG}/assets/a-1/catalog-preview`,
    );
  });

  it('keeps the strip in API order and never re-sorts it', () => {
    renderWithProviders(<GalleryDetailMedia media={media(4)} title={TITLE} />);

    expect(thumbnails().map((button) => button.getAttribute('aria-label'))).toEqual([
      'Xem ảnh 1 trên 4',
      'Xem ảnh 2 trên 4',
      'Xem ảnh 3 trên 4',
      'Xem ảnh 4 trên 4',
    ]);
  });

  it('selects by click and exposes the state without relying on colour', () => {
    renderWithProviders(<GalleryDetailMedia media={media(3)} title={TITLE} />);

    fireEvent.click(thumbnails()[2] as HTMLElement);

    expect(screen.getByAltText(`${TITLE} — ảnh 3 trên 3`)).toBeInTheDocument();
    expect(thumbnails()[2]).toHaveAttribute('aria-current', 'true');
    expect(thumbnails()[0]).not.toHaveAttribute('aria-current');
  });

  it('moves selection with Arrow keys and jumps with Home/End', () => {
    renderWithProviders(<GalleryDetailMedia media={media(4)} title={TITLE} />);
    const strip = screen.getByRole('list', { name: 'Bộ ảnh của mục này' });

    fireEvent.keyDown(strip, { key: 'ArrowRight' });
    expect(screen.getByAltText(`${TITLE} — ảnh 2 trên 4`)).toBeInTheDocument();

    fireEvent.keyDown(strip, { key: 'End' });
    expect(screen.getByAltText(`${TITLE} — ảnh 4 trên 4`)).toBeInTheDocument();

    fireEvent.keyDown(strip, { key: 'Home' });
    expect(screen.getByAltText(`${TITLE} — ảnh 1 trên 4`)).toBeInTheDocument();
  });

  it('is one Tab stop: only the selected thumbnail is tabbable', () => {
    renderWithProviders(<GalleryDetailMedia media={media(3)} title={TITLE} />);

    expect(thumbnails().map((button) => button.getAttribute('tabindex'))).toEqual([
      '0',
      '-1',
      '-1',
    ]);
  });
});

describe('the single-image state', () => {
  it('renders the stage and its trigger but no strip and no position line', () => {
    renderWithProviders(<GalleryDetailMedia media={media(1)} title={TITLE} />);

    expect(screen.getByRole('button', { name: 'Mở ảnh 1 trong chế độ xem lớn' })).toBeVisible();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByText('Ảnh 1 trên 1')).toBeNull();
  });

  it('drops the position from the alt text, which would say nothing', () => {
    renderWithProviders(<GalleryDetailMedia media={media(1)} title={TITLE} />);

    expect(screen.getByAltText(TITLE)).toBeInTheDocument();
  });

  it('offers no previous/next control inside the lightbox either', () => {
    renderWithProviders(<GalleryDetailMedia media={media(1)} title={TITLE} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mở ảnh 1 trong chế độ xem lớn' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'Ảnh trước' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Ảnh sau' })).toBeNull();
  });
});

describe('per-image failure', () => {
  it('keeps a broken image local and leaves the rest of the strip usable', () => {
    renderWithProviders(<GalleryDetailMedia media={media(3)} title={TITLE} />);

    fireEvent.error(screen.getByAltText(`${TITLE} — ảnh 1 trên 3`));

    expect(
      screen.getByText(/Không tải được ảnh này\. Bạn vẫn có thể xem các ảnh khác/),
    ).toBeInTheDocument();
    // The other images are untouched and still selectable.
    fireEvent.click(thumbnails()[1] as HTMLElement);
    expect(screen.getByAltText(`${TITLE} — ảnh 2 trên 3`)).toBeInTheDocument();
  });

  it('remembers which image failed when the visitor comes back to it', () => {
    renderWithProviders(<GalleryDetailMedia media={media(3)} title={TITLE} />);

    fireEvent.error(screen.getByAltText(`${TITLE} — ảnh 1 trên 3`));
    fireEvent.click(thumbnails()[1] as HTMLElement);
    expect(screen.getByAltText(`${TITLE} — ảnh 2 trên 3`)).toBeInTheDocument();

    fireEvent.click(thumbnails()[0] as HTMLElement);
    expect(screen.getByText(/Không tải được ảnh này/)).toBeInTheDocument();
  });

  it('detects an image that already failed before hydration attached onError', () => {
    // The stage is server-rendered, so the load can finish — or fail — before
    // React attaches its handler; that event is then simply lost. The ref
    // callback checks the element's own state instead. jsdom reports
    // `complete: false` by default, so the pre-hydration condition is forced
    // here exactly as a real browser would report it for a 404 image.
    Object.defineProperty(HTMLImageElement.prototype, 'complete', {
      configurable: true,
      get() {
        return true;
      },
    });

    try {
      renderWithProviders(<GalleryDetailMedia media={media(2)} title={TITLE} />);
      expect(screen.getByText(/Không tải được ảnh này/)).toBeInTheDocument();
    } finally {
      // `naturalWidth` is 0 in jsdom, so restoring `complete` is what undoes it.
      Reflect.deleteProperty(HTMLImageElement.prototype, 'complete');
    }
  });
});

describe('the linked Product affordance', () => {
  it('links a public product to its canonical detail route, with no shop controls', () => {
    renderWithProviders(
      <GalleryDetailRelatedProduct
        product={{ slug: 'gau-bong-theu-tay', name: 'Gấu bông thêu tay' }}
      />,
    );

    const link = screen.getByRole('link', { name: /Gấu bông thêu tay/ });
    expect(link).toHaveAttribute('href', '/san-pham/gau-bong-theu-tay');
    // One link, nothing interactive nested inside it.
    expect(within(link).queryByRole('button')).toBeNull();
    expect(within(link).queryByRole('link')).toBeNull();
  });

  it('renders no thumbnail when the projection carries none', () => {
    const { container } = renderWithProviders(
      <GalleryDetailRelatedProduct product={{ slug: 'ao-theu-cuc', name: 'Áo thêu cúc' }} />,
    );

    // Not a fabricated address built from an id: no image element at all.
    expect(container.querySelector('img')).toBeNull();
  });

  it('degrades to text when the product thumbnail stops resolving mid-session', () => {
    renderWithProviders(
      <GalleryDetailRelatedProduct
        product={{
          slug: 'gau-bong-theu-tay',
          name: 'Gấu bông thêu tay',
          thumbnailUrl: '/api/public/products/gau-bong-theu-tay/media/m-1/thumbnail',
        }}
      />,
    );

    const image = screen.getByRole('link').querySelector('img');
    expect(image).not.toBeNull();
    fireEvent.error(image as HTMLImageElement);

    expect(screen.getByRole('link').querySelector('img')).toBeNull();
    // The link itself keeps working.
    expect(screen.getByRole('link', { name: /Gấu bông thêu tay/ })).toHaveAttribute(
      'href',
      '/san-pham/gau-bong-theu-tay',
    );
  });

  it('renders no Related Product section at all when the link is null', () => {
    renderWithProviders(
      <GalleryDetailScreen
        entry={toGalleryDetailView(makeGalleryDetail({ linkedProduct: null }))}
      />,
    );

    // Null covers both "never linked" and "linked but not public". A heading, a
    // placeholder or a greyed card would each announce that something is there,
    // which is exactly the fact the API refuses to disclose.
    expect(screen.queryByText('Tác phẩm liên quan')).toBeNull();
    expect(screen.queryByRole('link', { name: /Xem tác phẩm/ })).toBeNull();
    expect(screen.queryByText(/không khả dụng|chưa công bố|riêng tư/i)).toBeNull();
  });
});
