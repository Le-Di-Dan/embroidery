import { fireEvent, renderWithProviders, screen, within } from '@embroidery/frontend-testing';

import { GalleryDetailMedia } from '../../src/features/gallery-detail/components/gallery-detail-media';
import { GALLERY_DETAIL_SLUG } from '../support/gallery-fixture';

/**
 * The accessible lightbox (`862:626` / `862:641`), whose behaviour `APP11-D01`
 * inherited verbatim from the approved Product Detail state board `537:38`.
 *
 * These assert the properties that make a dialog a dialog — announced role,
 * modality, focus that enters and is trapped, Escape, and focus returned to the
 * exact opener — rather than that a `<div>` appeared.
 */

const TITLE = 'Kỷ niệm được giữ lại';

function media(count: number): { url: string }[] {
  return Array.from({ length: count }, (_, index) => ({
    url: `/api/public/gallery-entries/${GALLERY_DETAIL_SLUG}/assets/a-${index + 1}/catalog-preview`,
  }));
}

function opener(): HTMLElement {
  return screen.getByRole('button', { name: /^Mở ảnh \d+ trong chế độ xem lớn/ });
}

function open(count = 3): HTMLElement {
  renderWithProviders(<GalleryDetailMedia media={media(count)} title={TITLE} />);
  const trigger = opener();
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

describe('lightbox modality', () => {
  it('is a real modal dialog with an accessible name', () => {
    open();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName(TITLE);
  });

  it('opens from a real button, never a clickable div', () => {
    renderWithProviders(<GalleryDetailMedia media={media(3)} title={TITLE} />);

    expect(opener().tagName).toBe('BUTTON');
    expect(opener()).toHaveAttribute('type', 'button');
  });

  it('moves focus into the dialog on open', () => {
    open();

    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('traps Tab inside the dialog', () => {
    open();
    const dialog = screen.getByRole('dialog');
    const controls = within(dialog).getAllByRole('button');

    for (let step = 0; step < controls.length + 2; step += 1) {
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('locks page scroll while open and restores it on close', () => {
    open();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('closes on Escape and returns focus to the exact opener', () => {
    const trigger = open();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on the Đóng control and returns focus to the exact opener', () => {
    const trigger = open();

    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe('lightbox navigation', () => {
  it('follows the API media order with ArrowRight and ArrowLeft', () => {
    open(3);
    const dialog = screen.getByRole('dialog');

    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(within(dialog).getByAltText(`${TITLE} — ảnh 2 trên 3`)).toHaveAttribute(
      'src',
      `/api/public/gallery-entries/${GALLERY_DETAIL_SLUG}/assets/a-2/catalog-preview`,
    );

    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(within(dialog).getByAltText(`${TITLE} — ảnh 1 trên 3`)).toHaveAttribute(
      'src',
      `/api/public/gallery-entries/${GALLERY_DETAIL_SLUG}/assets/a-1/catalog-preview`,
    );
  });

  it('exposes the position as text, never as a highlight alone', () => {
    open(3);
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByText('Ảnh 1 trên 3')).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(within(dialog).getByText('Ảnh 2 trên 3')).toBeInTheDocument();
  });

  it('stops at the ends rather than wrapping', () => {
    open(2);
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('button', { name: 'Ảnh trước' })).toBeDisabled();
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(within(dialog).getByRole('button', { name: 'Ảnh sau' })).toBeDisabled();
    // Arrowing past the end changes nothing rather than looping to the start.
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(within(dialog).getByAltText(`${TITLE} — ảnh 2 trên 2`)).toBeInTheDocument();
  });

  it('carries the page selection into the dialog and back out again', () => {
    renderWithProviders(<GalleryDetailMedia media={media(3)} title={TITLE} />);

    fireEvent.click(screen.getAllByRole('button', { name: /^Xem ảnh/ })[2] as HTMLElement);
    fireEvent.click(opener());

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByAltText(`${TITLE} — ảnh 3 trên 3`)).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đóng' }));

    // The stage follows what the visitor was looking at in the dialog.
    expect(screen.getByAltText(`${TITLE} — ảnh 2 trên 3`)).toBeInTheDocument();
  });
});

describe('a failure inside the dialog', () => {
  it('states itself and leaves every control working', () => {
    open(3);
    const dialog = screen.getByRole('dialog');

    fireEvent.error(within(dialog).getByAltText(`${TITLE} — ảnh 1 trên 3`));

    expect(within(dialog).getByText(/Không tải được ảnh này/)).toBeInTheDocument();
    // Never trapped in a modal showing nothing.
    expect(within(dialog).getByRole('button', { name: 'Đóng' })).toBeEnabled();
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(within(dialog).getByAltText(`${TITLE} — ảnh 2 trên 3`)).toBeInTheDocument();
  });
});
