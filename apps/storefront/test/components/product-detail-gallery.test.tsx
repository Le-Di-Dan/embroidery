import { fireEvent, renderWithProviders, screen, within } from '@embroidery/frontend-testing';

import { DetailGallery } from '../../src/features/product-detail/components/detail-gallery';
import type { ProductDetailMedia } from '../../src/features/product-detail';

const NAME = 'Gấu bông thêu tay';

function media(count: number): ProductDetailMedia[] {
  return Array.from({ length: count }, (_, index) => ({
    url: `/api/public/products/x/media/m-${index + 1}/catalog-preview`,
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
