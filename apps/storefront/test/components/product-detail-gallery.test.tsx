import { fireEvent, renderWithProviders, screen, within } from '@embroidery/frontend-testing';

import { DetailGallery } from '../../src/features/product-detail/components/detail-gallery';
import type { ProductDetailMedia } from '../../src/features/product-detail';

const NAME = 'Gấu bông thêu tay';

function media(count: number): ProductDetailMedia[] {
  return Array.from({ length: count }, (_, index) => ({
    url: `/api/public/products/x/media/m-${index + 1}/catalog-preview`,
    width: 1250,
    height: 1250,
    // Deliberately a different address and a different size from the preview
    // above: the whole point of `APP12-M01-B1` is that the strip must not be
    // served the stage's derivative, and a fixture that reused one value could
    // not tell the two apart.
    thumbnailUrl: `/api/public/products/x/media/m-${index + 1}/thumbnail`,
    thumbnailWidth: 480,
    thumbnailHeight: 480,
  }));
}

function thumbnails(): HTMLElement[] {
  return screen.getAllByRole('button', { name: /^Xem ảnh/ });
}

describe('gallery selection', () => {
  it('shows the first media item initially, in server order', () => {
    renderWithProviders(<DetailGallery media={media(3)} name={NAME} />);

    const image = screen.getByAltText(`${NAME} — ảnh 1 trên 3`);
    expect(image).toHaveAttribute('src', '/api/public/products/x/media/m-1/catalog-preview');
  });

  it('selects by click and exposes the state without relying on colour', () => {
    renderWithProviders(<DetailGallery media={media(3)} name={NAME} />);

    fireEvent.click(thumbnails()[2] as HTMLElement);

    expect(screen.getByAltText(`${NAME} — ảnh 3 trên 3`)).toBeInTheDocument();
    expect(thumbnails()[2]).toHaveAttribute('aria-current', 'true');
    expect(thumbnails()[0]).not.toHaveAttribute('aria-current');
  });

  it('moves selection with Arrow keys and jumps with Home/End', () => {
    renderWithProviders(<DetailGallery media={media(4)} name={NAME} />);
    const strip = screen.getByRole('list', { name: 'Ảnh tác phẩm' });

    fireEvent.keyDown(strip, { key: 'ArrowRight' });
    expect(screen.getByAltText(`${NAME} — ảnh 2 trên 4`)).toBeInTheDocument();

    fireEvent.keyDown(strip, { key: 'End' });
    expect(screen.getByAltText(`${NAME} — ảnh 4 trên 4`)).toBeInTheDocument();

    fireEvent.keyDown(strip, { key: 'ArrowLeft' });
    expect(screen.getByAltText(`${NAME} — ảnh 3 trên 4`)).toBeInTheDocument();

    fireEvent.keyDown(strip, { key: 'Home' });
    expect(screen.getByAltText(`${NAME} — ảnh 1 trên 4`)).toBeInTheDocument();
  });

  it('does not run off either end of the gallery', () => {
    renderWithProviders(<DetailGallery media={media(2)} name={NAME} />);
    const strip = screen.getByRole('list', { name: 'Ảnh tác phẩm' });

    fireEvent.keyDown(strip, { key: 'ArrowLeft' });
    expect(screen.getByAltText(`${NAME} — ảnh 1 trên 2`)).toBeInTheDocument();

    fireEvent.keyDown(strip, { key: 'ArrowRight' });
    fireEvent.keyDown(strip, { key: 'ArrowRight' });
    expect(screen.getByAltText(`${NAME} — ảnh 2 trên 2`)).toBeInTheDocument();
  });

  it('keeps the strip to one Tab stop with a roving tabindex', () => {
    renderWithProviders(<DetailGallery media={media(3)} name={NAME} />);

    expect(thumbnails()[0]).toHaveAttribute('tabindex', '0');
    expect(thumbnails()[1]).toHaveAttribute('tabindex', '-1');
  });
});

describe('gallery counter', () => {
  // The visible readout and the sentence beside it are asserted separately on
  // purpose. They are two different strings for two different audiences, and a
  // test that only looked for one of them would pass while the other was
  // missing — which is precisely the state the page was in before `M01.S1`.
  function counter(): HTMLElement {
    return screen.getByText('1 / 20').closest('p') as HTMLElement;
  }

  it('states the position visually and in words, from the first render', () => {
    renderWithProviders(<DetailGallery media={media(20)} name={NAME} />);

    expect(screen.getByText('1 / 20')).toBeInTheDocument();
    expect(within(counter()).getByText('Ảnh 1 trên 20')).toBeInTheDocument();
  });

  it('hides the numerals from assistive technology, which would read them badly', () => {
    renderWithProviders(<DetailGallery media={media(20)} name={NAME} />);

    expect(screen.getByText('1 / 20')).toHaveAttribute('aria-hidden', 'true');
  });

  it('updates both readouts the moment another image is chosen', () => {
    renderWithProviders(<DetailGallery media={media(20)} name={NAME} />);

    fireEvent.click(thumbnails()[6] as HTMLElement);

    expect(screen.getByText('7 / 20')).toBeInTheDocument();
    expect(screen.getByText('Ảnh 7 trên 20')).toBeInTheDocument();
    expect(screen.queryByText('1 / 20')).not.toBeInTheDocument();
  });

  it('follows keyboard selection as well as clicks', () => {
    renderWithProviders(<DetailGallery media={media(20)} name={NAME} />);
    const strip = screen.getByRole('list', { name: 'Ảnh tác phẩm' });

    fireEvent.keyDown(strip, { key: 'End' });

    expect(screen.getByText('20 / 20')).toBeInTheDocument();
  });

  it('omits the counter entirely for a single image', () => {
    renderWithProviders(<DetailGallery media={media(1)} name={NAME} />);

    expect(screen.queryByText('1 / 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Ảnh 1 trên 1')).not.toBeInTheDocument();
  });

  it('reuses the lightbox position string rather than introducing a second one', () => {
    // Opening the large view must not produce two differently-worded statements
    // of the same position. `D1` §M made this one string; this is the assertion
    // that keeps it one.
    renderWithProviders(<DetailGallery media={media(20)} name={NAME} />);
    fireEvent.click(thumbnails()[2] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: /^Mở ảnh 3 /u }));

    expect(screen.getAllByText('Ảnh 3 trên 20')).toHaveLength(2);
  });
});

describe('media states', () => {
  it('states the empty case and offers no zoom, thumbnails or lightbox', () => {
    renderWithProviders(<DetailGallery media={[]} name={NAME} />);

    expect(screen.getByText('Chưa có ảnh cho tác phẩm này')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mở ảnh/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Ảnh tác phẩm' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Nhấn vào ảnh/)).not.toBeInTheDocument();
  });

  it('omits the thumbnail strip for a single image but still allows zoom', () => {
    renderWithProviders(<DetailGallery media={media(1)} name={NAME} />);

    expect(screen.queryByRole('list', { name: 'Ảnh tác phẩm' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Mở ảnh 1 trong chế độ xem lớn' }),
    ).toBeInTheDocument();
  });

  it('reports a failed image honestly and substitutes nothing', () => {
    renderWithProviders(<DetailGallery media={media(3)} name={NAME} />);

    fireEvent.error(screen.getByAltText(`${NAME} — ảnh 1 trên 3`));

    expect(
      screen.getByText(
        'Không tải được ảnh này. Bạn vẫn có thể xem các ảnh khác và đọc câu chuyện.',
      ),
    ).toBeInTheDocument();
    // No replacement URL is invented and no other image is silently swapped in.
    expect(screen.queryByAltText(`${NAME} — ảnh 2 trên 3`)).not.toBeInTheDocument();
    expect(thumbnails()).toHaveLength(3);
  });

  it('tracks failure per image, so a broken one does not taint the rest', () => {
    renderWithProviders(<DetailGallery media={media(3)} name={NAME} />);

    fireEvent.error(screen.getByAltText(`${NAME} — ảnh 1 trên 3`));
    fireEvent.click(thumbnails()[1] as HTMLElement);

    expect(screen.getByAltText(`${NAME} — ảnh 2 trên 3`)).toBeInTheDocument();
    expect(screen.queryByText(/Không tải được ảnh này/)).not.toBeInTheDocument();
  });

  it('falls back to an accessible label when a thumbnail image fails', () => {
    renderWithProviders(<DetailGallery media={media(3)} name={NAME} />);

    const thumbImage = within(thumbnails()[1] as HTMLElement).getByRole('presentation', {
      hidden: true,
    });
    fireEvent.error(thumbImage);

    expect(
      within(thumbnails()[1] as HTMLElement).getByText('Ảnh không khả dụng'),
    ).toBeInTheDocument();
    expect(thumbnails()[1]).toHaveAccessibleName('Xem ảnh 2 trên 3');
  });
});

describe('lightbox', () => {
  function openLightbox(count = 3) {
    renderWithProviders(<DetailGallery media={media(count)} name={NAME} />);
    fireEvent.click(screen.getByRole('button', { name: /^Mở ảnh/ }));
    return screen.getByRole('dialog');
  }

  it('opens a real dialog with an accessible name', () => {
    const dialog = openLightbox();

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName(NAME);
  });

  it('moves focus into the dialog and returns it to the opener on close', () => {
    renderWithProviders(<DetailGallery media={media(3)} name={NAME} />);
    const opener = screen.getByRole('button', { name: /^Mở ảnh/ });
    opener.focus();

    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(opener);
  });

  it('closes on Escape', () => {
    openLightbox();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('traps Tab inside the dialog', () => {
    const dialog = openLightbox();
    const inside = within(dialog).getAllByRole('button');

    fireEvent.keyDown(document, { key: 'Tab' });

    expect(inside).toContain(document.activeElement);
  });

  it('navigates with Arrow keys and exposes the position as text', () => {
    const dialog = openLightbox();

    expect(within(dialog).getByText('Ảnh 1 trên 3')).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(within(dialog).getByText('Ảnh 2 trên 3')).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(within(dialog).getByText('Ảnh 1 trên 3')).toBeInTheDocument();
  });

  it('navigates with icon buttons that are still named in words', () => {
    // The visible words became an `aria-label`; they did not disappear. This is
    // the assertion that keeps an icon-only control from becoming an unnamed
    // one, which is how icon buttons usually fail.
    const dialog = openLightbox();
    const previous = within(dialog).getByRole('button', { name: 'Ảnh trước' });
    const next = within(dialog).getByRole('button', { name: 'Ảnh sau' });

    expect(previous).toHaveTextContent('');
    expect(next).toHaveTextContent('');
    // The chevron itself must never be announced: the button already is.
    expect(previous.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(next.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    // Two different glyphs, so "back" and "forward" are not the same picture.
    expect(previous.querySelector('polyline')?.getAttribute('points')).not.toBe(
      next.querySelector('polyline')?.getAttribute('points'),
    );
  });

  it('offers no previous/next for a single image', () => {
    const dialog = openLightbox(1);

    expect(within(dialog).queryByRole('button', { name: 'Ảnh trước' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Ảnh sau' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Đóng' })).toBeInTheDocument();
  });

  it('keeps close usable when the enlarged image fails', () => {
    const dialog = openLightbox();

    fireEvent.error(within(dialog).getByAltText(`${NAME} — ảnh 1 trên 3`));

    expect(within(dialog).getByText(/Không tải được ảnh này/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Đóng' })).toBeInTheDocument();
  });

  it('locks page scroll while open and restores it on close', () => {
    const dialog = openLightbox();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});

/**
 * `APP12-M01-B1` — the rendition policy, which is the whole reason the package
 * exists. The gallery renders one image at two very different scales, and
 * before B1 it asked for the large derivative both times.
 */
describe('gallery rendition policy', () => {
  it('serves the stage the preview and every strip control the thumbnail', () => {
    renderWithProviders(<DetailGallery media={media(3)} name={NAME} />);

    expect(screen.getByAltText(`${NAME} — ảnh 1 trên 3`)).toHaveAttribute(
      'src',
      '/api/public/products/x/media/m-1/catalog-preview',
    );

    const stripImages = thumbnails().map((button) => button.querySelector('img'));
    expect(stripImages).toHaveLength(3);
    for (const [index, image] of stripImages.entries()) {
      expect(image).toHaveAttribute('src', `/api/public/products/x/media/m-${index + 1}/thumbnail`);
    }
    // The defect stated as an absence: not one strip control may address the
    // derivative the stage uses.
    for (const image of stripImages) {
      expect(image?.getAttribute('src')).not.toContain('catalog-preview');
    }
  });

  it('gives each image the intrinsic size of the derivative it actually loads', () => {
    renderWithProviders(<DetailGallery media={media(2)} name={NAME} />);

    const stage = screen.getByAltText(`${NAME} — ảnh 1 trên 2`);
    expect(stage).toHaveAttribute('width', '1250');
    expect(stage).toHaveAttribute('height', '1250');

    const thumbnail = thumbnails()[0]?.querySelector('img');
    expect(thumbnail).toHaveAttribute('width', '480');
    expect(thumbnail).toHaveAttribute('height', '480');
  });

  it('loads the stage eagerly at high priority and defers every thumbnail', () => {
    renderWithProviders(<DetailGallery media={media(3)} name={NAME} />);

    const stage = screen.getByAltText(`${NAME} — ảnh 1 trên 3`);
    // The measured LCP element of this page (`APP12-H05` §G).
    expect(stage).toHaveAttribute('loading', 'eager');
    expect(stage.getAttribute('fetchpriority')).toBe('high');

    for (const button of thumbnails()) {
      expect(button.querySelector('img')).toHaveAttribute('loading', 'lazy');
    }
  });

  it('switches only the stage when a thumbnail is chosen, and never eagerly loads the rest', () => {
    renderWithProviders(<DetailGallery media={media(4)} name={NAME} />);

    fireEvent.click(thumbnails()[2] as HTMLElement);

    // The stage follows the selection to that image's *preview* derivative.
    expect(screen.getByAltText(`${NAME} — ảnh 3 trên 4`)).toHaveAttribute(
      'src',
      '/api/public/products/x/media/m-3/catalog-preview',
    );
    // And exactly one preview is in the document: the non-selected images are
    // present only as deferred thumbnails, which is what keeps a twenty-image
    // Product from fetching twenty full previews at first render.
    const previews = screen
      .getAllByRole('img', { hidden: true })
      .filter((image) => image.getAttribute('src')?.includes('catalog-preview'));
    expect(previews).toHaveLength(1);
  });

  it('falls back to the preview address when the server publishes no thumbnail', () => {
    // The legitimate state where the small derivative is not deliverable: the
    // control must still render an image rather than leaving a hole.
    const degraded: ProductDetailMedia[] = [
      {
        url: '/api/public/products/x/media/m-1/catalog-preview',
        thumbnailUrl: '/api/public/products/x/media/m-1/catalog-preview',
      },
      {
        url: '/api/public/products/x/media/m-2/catalog-preview',
        thumbnailUrl: '/api/public/products/x/media/m-2/thumbnail',
      },
    ];
    renderWithProviders(<DetailGallery media={degraded} name={NAME} />);

    const stripImages = thumbnails().map((button) => button.querySelector('img'));
    expect(stripImages[0]).toHaveAttribute(
      'src',
      '/api/public/products/x/media/m-1/catalog-preview',
    );
    expect(stripImages[1]).toHaveAttribute('src', '/api/public/products/x/media/m-2/thumbnail');
    // No size is claimed for a derivative that was never described.
    expect(stripImages[0]).not.toHaveAttribute('width');
  });
});
