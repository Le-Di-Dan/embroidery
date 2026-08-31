import { renderWithProviders, screen, within } from '@embroidery/frontend-testing';

import { GalleryMasonry } from '../../src/features/gallery-feed/components/gallery-masonry';
import { flattenGalleryPages } from '../../src/features/gallery-feed/model/gallery-feed';
import { makeGalleryEntry, makeGalleryPage } from '../support/gallery-fixture';

/**
 * The `APP11-S03` card handoff.
 *
 * `APP11-S02` shipped the card as a deliberately non-interactive `<article>`
 * because no detail route existed. This proves the upgrade did exactly one
 * thing — gave each card one semantic detail action — and left the masonry
 * architecture, the visible content and the source order precisely as they
 * were.
 */

const CARDS = flattenGalleryPages([
  makeGalleryPage([
    makeGalleryEntry({ slug: 'ky-niem-duoc-giu-lai', title: 'Kỷ niệm được giữ lại' }),
    makeGalleryEntry({ slug: 'mua-he-thu-nhat', title: 'Mùa hè thứ nhất', displayOrder: 1 }),
    makeGalleryEntry({ slug: 'net-chi-mo', title: 'Nét chỉ mờ', displayOrder: 2 }),
  ]),
]);

describe('gallery card → gallery entry detail', () => {
  it('gives each card exactly one link to the canonical detail route', () => {
    renderWithProviders(<GalleryMasonry cards={CARDS} />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute('href', '/bo-suu-tap/ky-niem-duoc-giu-lai');
    expect(links[1]).toHaveAttribute('href', '/bo-suu-tap/mua-he-thu-nhat');
    expect(links[2]).toHaveAttribute('href', '/bo-suu-tap/net-chi-mo');
  });

  it('names each action by its entry, not by twelve identical labels', () => {
    renderWithProviders(<GalleryMasonry cards={CARDS} />);

    expect(screen.getAllByRole('link').map((link) => link.getAttribute('aria-label'))).toEqual([
      'Xem chi tiết mục Kỷ niệm được giữ lại',
      'Xem chi tiết mục Mùa hè thứ nhất',
      'Xem chi tiết mục Nét chỉ mờ',
    ]);
    // The visible label is still the short approved one.
    expect(screen.getAllByText('Xem chi tiết')).toHaveLength(3);
  });

  it('nests no second interactive control inside an action, and makes no clickable tile', () => {
    const { container } = renderWithProviders(<GalleryMasonry cards={CARDS} />);

    for (const link of screen.getAllByRole('link')) {
      expect(within(link).queryByRole('button')).toBeNull();
      expect(within(link).queryByRole('link')).toBeNull();
    }
    // The card itself is still an <article>, not an anchor or a click handler
    // on a div: UI05 draws a text link, not a tile-sized hit area.
    const card = container.querySelector('.gallery-feed__card');
    expect(card?.tagName).toBe('ARTICLE');
    expect(card?.closest('a')).toBeNull();
  });

  it('leaves the S02 feed exactly as delivered', () => {
    const { container } = renderWithProviders(<GalleryMasonry cards={CARDS} />);

    // One semantic collection, one card tree, source order = server order.
    expect(container.querySelectorAll('.gallery-feed__masonry')).toHaveLength(1);
    expect(
      [...container.querySelectorAll('.gallery-feed__card-title')].map((node) => node.textContent),
    ).toEqual(['Kỷ niệm được giữ lại', 'Mùa hè thứ nhất', 'Nét chỉ mờ']);
    // Cover, title and description are all still rendered.
    expect(container.querySelectorAll('.gallery-feed__card-image')).toHaveLength(3);
    expect(container.querySelectorAll('.gallery-feed__card-description')).toHaveLength(3);
  });

  it('still renders no internal fact on a card', () => {
    const { container } = renderWithProviders(<GalleryMasonry cards={CARDS} />);

    const text = container.textContent ?? '';
    expect(text).not.toContain('0199c0de');
    expect(text).not.toMatch(/\b6 ảnh\b/);
  });
});
