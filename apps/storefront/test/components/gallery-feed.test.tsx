/**
 * The public gallery feed's rendered behaviour (`APP11-S02`).
 *
 * These cover what an editorial keyset feed gets wrong in production: replacing
 * instead of appending, re-sorting what the curator ordered, replaying a failed
 * cursor automatically, letting one withdrawn image take the page down, and
 * leaking an operator's internal facts onto a public card.
 */
import { publicGalleryEntryList } from '@embroidery/api-client';
import {
  createUser,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@embroidery/frontend-testing';

import { GalleryFeedScreen } from '../../src/features/gallery-feed/components/gallery-feed-screen';
import { GALLERY_COPY } from '../../src/features/gallery-feed/model/gallery-copy';
import { galleryEnvelope, makeGalleryEntry, makeGalleryPage } from '../support/gallery-fixture';

/** The shape every activated card action must have: feed route + one slug. */
const GALLERY_DETAIL_HREF = new RegExp('^/bo-suu-tap/[a-z0-9-]+$');

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicGalleryEntryList: jest.fn(),
}));

const listMock = publicGalleryEntryList as jest.MockedFunction<typeof publicGalleryEntryList>;

/** Curated server order: display_order ASC, id ASC. Never alphabetical. */
const PAGE_ONE = [
  makeGalleryEntry({ slug: 'ky-niem', title: 'Kỷ niệm được giữ lại', displayOrder: 0 }),
  makeGalleryEntry({ slug: 'ao-cuoi', title: 'Áo cưới thêu tay', displayOrder: 1 }),
  makeGalleryEntry({ slug: 'bien-thang-tu', title: 'Biển tháng Tư', displayOrder: 2 }),
];
const PAGE_TWO = [makeGalleryEntry({ slug: 'dong-song', title: 'Dòng sông cũ', displayOrder: 3 })];

beforeEach(() => {
  listMock.mockReset();
});

function renderFeed() {
  return renderWithProviders(<GalleryFeedScreen />);
}

function feedTitles(): string[] {
  const list = screen.getByRole('list', { name: GALLERY_COPY.feedLabel });
  return within(list)
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent ?? '');
}

describe('gallery feed — projection and order', () => {
  it('renders one collection of cards in server order', async () => {
    listMock.mockResolvedValue(galleryEnvelope(makeGalleryPage(PAGE_ONE)));
    renderFeed();

    await waitFor(() =>
      expect(feedTitles()).toEqual(['Kỷ niệm được giữ lại', 'Áo cưới thêu tay', 'Biển tháng Tư']),
    );
    // One DOM collection, not a tree per viewport and not per-column arrays.
    expect(screen.getAllByRole('list', { name: GALLERY_COPY.feedLabel })).toHaveLength(1);
  });

  it('never re-sorts the curated order, even when it is not alphabetical', async () => {
    // The server order below is deliberately reverse-alphabetical, so any local
    // sort — by title, or by a measured card height — would change it.
    listMock.mockResolvedValue(
      galleryEnvelope(
        makeGalleryPage([
          makeGalleryEntry({ slug: 'z', title: 'Zét', displayOrder: 0 }),
          makeGalleryEntry({ slug: 'm', title: 'Mờ', displayOrder: 1 }),
          makeGalleryEntry({ slug: 'a', title: 'Ánh', displayOrder: 2 }),
        ]),
      ),
    );
    renderFeed();

    await waitFor(() => expect(feedTitles()).toEqual(['Zét', 'Mờ', 'Ánh']));
  });

  it('shows cover, title and description only — no internal or commerce facts', async () => {
    listMock.mockResolvedValue(galleryEnvelope(makeGalleryPage([makeGalleryEntry()])));
    renderFeed();

    await waitFor(() => expect(screen.getByText('Kỷ niệm được giữ lại')).toBeInTheDocument());
    expect(
      screen.getByText('Những tấm khăn thêu tay ghi lại một mốc thời gian của gia đình.'),
    ).toBeInTheDocument();

    // The fixture carries all five dropped fields; none may surface.
    const feed = screen.getByRole('list', { name: GALLERY_COPY.feedLabel });
    const text = feed.textContent ?? '';
    expect(text).not.toContain('0199c0de');
    expect(text).not.toMatch(/\b6\b/); // assetCount
    expect(text).not.toMatch(/isIndexable|displayOrder|noindex/i);
    // No linked-product lookup and therefore no commerce chrome.
    expect(screen.queryByText(/VND|₫/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mua|giỏ hàng/i })).not.toBeInTheDocument();
  });

  it('renders a published noindex entry exactly like any other', async () => {
    listMock.mockResolvedValue(
      galleryEnvelope(
        makeGalleryPage([
          makeGalleryEntry({ slug: 'an', title: 'Không lập chỉ mục', isIndexable: false }),
        ]),
      ),
    );
    renderFeed();

    // isIndexable is an SEO directive, not a visibility flag.
    await waitFor(() => expect(feedTitles()).toEqual(['Không lập chỉ mục']));
  });
});

describe('gallery feed — cover media', () => {
  it('renders the cover from the server-composed delivery path, never a built URL', async () => {
    listMock.mockResolvedValue(
      galleryEnvelope(makeGalleryPage([makeGalleryEntry({ slug: 'ky-niem' })])),
    );
    renderFeed();

    const image = await screen.findByRole('img', { name: 'Kỷ niệm được giữ lại' });
    expect(image).toHaveAttribute(
      'src',
      '/api/public/gallery-entries/ky-niem/assets/0199c0de-0000-7000-8000-0000000000a1/thumbnail',
    );
    // Relative and same-origin: no host, bucket, signature or expiry.
    expect(image.getAttribute('src')).toMatch(/^\/api\/public\/gallery-entries\//);
  });

  it('derives the accessible name from the title alone', async () => {
    listMock.mockResolvedValue(
      galleryEnvelope(makeGalleryPage([makeGalleryEntry({ title: 'Áo dài mùa cưới' })])),
    );
    renderFeed();

    // ALT_TEXT_MODEL = DERIVED_NOT_PERSISTED: no alt column exists to read, and
    // nothing is invented beyond the title the operator authored.
    const image = await screen.findByRole('img', { name: 'Áo dài mùa cưới' });
    expect(image).toHaveAttribute('alt', 'Áo dài mùa cưới');
  });

  it('keeps a failed cover local to its own card', async () => {
    listMock.mockResolvedValue(
      galleryEnvelope(
        makeGalleryPage([
          makeGalleryEntry({ slug: 'a', title: 'Ảnh hỏng' }),
          makeGalleryEntry({ slug: 'b', title: 'Ảnh còn tốt' }),
        ]),
      ),
    );
    renderFeed();

    const broken = await screen.findByRole('img', { name: 'Ảnh hỏng' });
    fireEvent.error(broken);

    // The failed card degrades to the accessible placeholder…
    await screen.findByRole('img', { name: GALLERY_COPY.card.imageUnavailable });
    // …the other card keeps its image, and the feed itself is untouched.
    expect(screen.getByRole('img', { name: 'Ảnh còn tốt' })).toBeInTheDocument();
    expect(feedTitles()).toEqual(['Ảnh hỏng', 'Ảnh còn tốt']);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('gallery feed — states', () => {
  it('announces initial loading politely behind a gallery-shaped skeleton', () => {
    listMock.mockReturnValue(new Promise(() => undefined) as never);
    renderFeed();

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(GALLERY_COPY.initialLoading);
    // The placeholder tiles are hidden from assistive tech; the words carry it.
    expect(screen.queryByRole('list', { name: GALLERY_COPY.feedLabel })).not.toBeInTheDocument();
  });

  it('states an empty gallery as a fact, with no operator or checkpoint copy', async () => {
    listMock.mockResolvedValue(galleryEnvelope(makeGalleryPage([])));
    renderFeed();

    await screen.findByText(GALLERY_COPY.empty);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/tạo|quản trị|admin|APP11|sắp ra mắt/i)).not.toBeInTheDocument();
  });

  it('surfaces an initial failure as an alert carrying no server detail', async () => {
    listMock.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 503'), {
        response: { status: 503, data: { message: 'upstream gallery pool exhausted' } },
      }),
    );
    renderFeed();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(GALLERY_COPY.initialError.heading);
    expect(alert.textContent ?? '').not.toMatch(/503|upstream|cursor|request/i);
  });

  it('refetches the first page when the initial retry is pressed', async () => {
    const user = createUser();
    listMock.mockRejectedValueOnce(new Error('down'));
    renderFeed();

    await screen.findByRole('alert');
    listMock.mockResolvedValue(galleryEnvelope(makeGalleryPage(PAGE_ONE)));
    await user.click(screen.getByRole('button', { name: GALLERY_COPY.initialError.action }));

    await waitFor(() => expect(feedTitles()).toHaveLength(3));
  });
});

describe('gallery feed — continuation', () => {
  it('offers no control when the server reports no further page', async () => {
    listMock.mockResolvedValue(galleryEnvelope(makeGalleryPage(PAGE_ONE)));
    renderFeed();

    await waitFor(() => expect(feedTitles()).toHaveLength(3));
    expect(
      screen.queryByRole('button', { name: GALLERY_COPY.continuation.loadMore }),
    ).not.toBeInTheDocument();
    // No end-of-feed line, no total and no page number anywhere.
    expect(screen.queryByText(/trang \d|tổng cộng|\d+ mục/i)).not.toBeInTheDocument();
  });

  it('appends the next page and preserves every card already on screen', async () => {
    const user = createUser();
    listMock
      .mockResolvedValueOnce(galleryEnvelope(makeGalleryPage(PAGE_ONE, 'cursor-2')))
      .mockResolvedValueOnce(galleryEnvelope(makeGalleryPage(PAGE_TWO)));
    renderFeed();

    await waitFor(() => expect(feedTitles()).toHaveLength(3));
    await user.click(screen.getByRole('button', { name: GALLERY_COPY.continuation.loadMore }));

    await waitFor(() =>
      expect(feedTitles()).toEqual([
        'Kỷ niệm được giữ lại',
        'Áo cưới thêu tay',
        'Biển tháng Tư',
        'Dòng sông cũ',
      ]),
    );
    // The cursor travelled in the request, never in the browser URL.
    expect(listMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'cursor-2' }),
      expect.anything(),
    );
    expect(window.location.search).toBe('');
  });

  it('drops a repeated entry without moving the ones already rendered', async () => {
    const user = createUser();
    listMock
      .mockResolvedValueOnce(galleryEnvelope(makeGalleryPage(PAGE_ONE, 'cursor-2')))
      .mockResolvedValueOnce(
        galleryEnvelope(
          // 'ky-niem' resurfaces under the later cursor — an operator changed its
          // display_order between the two requests. First occurrence wins.
          makeGalleryPage([
            makeGalleryEntry({ slug: 'ky-niem', title: 'Kỷ niệm được giữ lại' }),
            ...PAGE_TWO,
          ]),
        ),
      );
    renderFeed();

    await waitFor(() => expect(feedTitles()).toHaveLength(3));
    await user.click(screen.getByRole('button', { name: GALLERY_COPY.continuation.loadMore }));

    await waitFor(() =>
      expect(feedTitles()).toEqual([
        'Kỷ niệm được giữ lại',
        'Áo cưới thêu tay',
        'Biển tháng Tư',
        'Dòng sông cũ',
      ]),
    );
  });

  it('keeps the loaded cards when a continuation fails, and retries the same cursor', async () => {
    const user = createUser();
    listMock
      .mockResolvedValueOnce(galleryEnvelope(makeGalleryPage(PAGE_ONE, 'cursor-2')))
      .mockRejectedValueOnce(new Error('boom'));
    renderFeed();

    await waitFor(() => expect(feedTitles()).toHaveLength(3));
    await user.click(screen.getByRole('button', { name: GALLERY_COPY.continuation.loadMore }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(GALLERY_COPY.continuation.error);
    // The failure is an addendum; the collection it sits under is intact.
    expect(feedTitles()).toHaveLength(3);

    listMock.mockResolvedValueOnce(galleryEnvelope(makeGalleryPage(PAGE_TWO)));
    await user.click(screen.getByRole('button', { name: GALLERY_COPY.continuation.retry }));

    await waitFor(() => expect(feedTitles()).toHaveLength(4));
    // The exact cursor that failed, not a restarted sequence.
    expect(listMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'cursor-2' }),
      expect.anything(),
    );
    expect(listMock).toHaveBeenCalledTimes(3);
  });

  it('never advances on its own — no observer, no scroll, no auto-load', async () => {
    listMock.mockResolvedValue(galleryEnvelope(makeGalleryPage(PAGE_ONE, 'cursor-2')));
    renderFeed();

    await waitFor(() => expect(feedTitles()).toHaveLength(3));
    window.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => {
      setTimeout(resolve, 40);
    });

    expect(listMock).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: GALLERY_COPY.continuation.loadMore }),
    ).toBeInTheDocument();
  });
});

describe('gallery feed — detail navigation activated by APP11-S03', () => {
  /**
   * This block asserted the opposite until `APP11-S03`: while
   * `/bo-suu-tap/[slug]` did not exist, a card carried no anchor and nothing
   * pretending to be one. The route landed together with the affordance — the
   * whole point of staging it — so the assertion inverts rather than being
   * deleted, and what it guards is unchanged: the card must offer one real
   * link and nothing that merely looks like one.
   *
   * The card's own semantics, order and content are covered by
   * `gallery-card-link.test.tsx`; this proves the activation survives the whole
   * feed's data path rather than a hand-built card list.
   */
  it('gives each card one real anchor to its entry, and no fake control', async () => {
    listMock.mockResolvedValue(galleryEnvelope(makeGalleryPage(PAGE_ONE)));
    const { container } = renderFeed();

    await waitFor(() => expect(feedTitles()).toHaveLength(3));
    const feed = screen.getByRole('list', { name: GALLERY_COPY.feedLabel });

    const links = within(feed).queryAllByRole('link');
    expect(links).toHaveLength(3);
    for (const link of links) {
      expect(link.tagName).toBe('A');
      expect(link.getAttribute('href')).toMatch(GALLERY_DETAIL_HREF);
    }
    // Still nothing pretending to be a control: no clickable div, no manual
    // tabindex, no role="link".
    expect(feed.querySelectorAll('[tabindex]')).toHaveLength(0);
    expect(feed.querySelectorAll('[role="link"]')).toHaveLength(0);
    // And no second, nested address for the same entry.
    expect(container.querySelectorAll('a[href^="/bo-suu-tap/"]')).toHaveLength(3);
  });
});
