import { renderWithProviders, screen, within } from '@embroidery/frontend-testing';

import { HomepageCollections } from '../../src/features/homepage/components/homepage-collections';
import { HomepageCommissionCta } from '../../src/features/homepage/components/homepage-commission-cta';
import { HomepageHero } from '../../src/features/homepage/components/homepage-hero';
import { HomepageScreen } from '../../src/features/homepage/components/homepage-screen';
import { HomepageStudioStory } from '../../src/features/homepage/components/homepage-studio-story';
import { HomepageWorksSections } from '../../src/features/homepage/components/homepage-works-sections';
import { HOMEPAGE_COPY } from '../../src/features/homepage/model/homepage-copy';
import {
  toHomepageWorks,
  type HomepageWorks,
} from '../../src/features/homepage/model/homepage-works';
import { makePublicPage, makePublicProduct } from '../support/discover-fixture';
import { withCustomEmbroideryRelease } from '../support/release-flag';

/**
 * The Homepage / store introduction (`APP11-S01`).
 *
 * `HomepageWorksLane` is the one async server component on the page; it is
 * replaced here by a synchronous stand-in that renders the **real** sections
 * with fixture data. That keeps `HomepageScreen`'s own composition — and
 * therefore the locked section order — genuinely under test, rather than
 * re-asserting an order this file assembled itself.
 */

function fixtureWorks(count: number): HomepageWorks {
  return toHomepageWorks(
    makePublicPage(
      Array.from({ length: count }, (_unused, index) =>
        makePublicProduct({ slug: `tac-pham-${index}`, name: `Tác phẩm ${index}` }),
      ),
    ),
  );
}

const READY = fixtureWorks(9);

jest.mock('../../src/features/homepage/components/homepage-works-lane', () => ({
  // The factory is hoisted above this file's imports, but the component it
  // returns is only *called* at render time — by which point `READY` and the
  // real sections module are both initialised. Nothing here is stubbed except
  // the `await`: the sections under the screen are the shipped ones.
  HomepageWorksLane: () => <HomepageWorksSections works={READY} />,
}));

describe('Homepage — approved composition', () => {
  /**
   * The locked six-section order is the **released** Homepage, so the release is
   * turned on for this assertion. `APP12-G02-C1` withholds the Commission CTA
   * section while Wave 2 is unreleased — the section is the ask end to end, and
   * `/yeu-cau/moi` is a deliberate `404` then — and the withheld composition is
   * asserted by `wave2-cta-suppression.test.tsx`. What is pinned here is that
   * releasing the capability restores the approved order exactly.
   */
  it('renders exactly the six approved sections, in the locked order', () => {
    withCustomEmbroideryRelease(true, () => {
      renderWithProviders(<HomepageScreen />);

      const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);
      expect(headings).toEqual([
        HOMEPAGE_COPY.featured.heading,
        HOMEPAGE_COPY.discover.heading,
        HOMEPAGE_COPY.collections.heading,
        HOMEPAGE_COPY.story.heading,
        HOMEPAGE_COPY.commission.heading,
      ]);
    });
  });

  it('has exactly one H1, and it is the Hero store introduction', () => {
    renderWithProviders(<HomepageScreen />);

    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(HOMEPAGE_COPY.hero.heading);
  });

  it('renders no Journal, blog or news section', () => {
    const { container } = renderWithProviders(<HomepageScreen />);
    expect(container.textContent).not.toMatch(/nhật ký|journal|blog|tin tức/i);
  });

  it('shows no CP0 scaffold or engineering copy', () => {
    const { container } = renderWithProviders(<HomepageScreen />);
    expect(container.textContent).not.toMatch(
      /Embroidery Commerce Storefront|checkpoint|scaffold|khởi tạo|APP11|TBD|Lorem ipsum|placeholder/i,
    );
  });
});

describe('Homepage — Hero', () => {
  it('offers the low-commitment move alongside the commission ask', () => {
    // Released: the co-presence rule `USER_FLOW_ARCHITECTURE` §6.3 states is
    // about the ask, so it can only be asserted where the ask exists.
    withCustomEmbroideryRelease(true, () => {
      renderWithProviders(<HomepageHero />);

      expect(screen.getByRole('link', { name: HOMEPAGE_COPY.hero.exploreAction })).toHaveAttribute(
        'href',
        '/kham-pha',
      );
      expect(
        screen.getByRole('link', { name: HOMEPAGE_COPY.hero.commissionAction }),
      ).toHaveAttribute('href', '/yeu-cau/moi');
    });
  });

  it('keeps the explore move when the commission ask is withheld', () => {
    withCustomEmbroideryRelease(false, () => {
      renderWithProviders(<HomepageHero />);

      expect(screen.getByRole('link', { name: HOMEPAGE_COPY.hero.exploreAction })).toHaveAttribute(
        'href',
        '/kham-pha',
      );
      expect(screen.getAllByRole('link')).toHaveLength(1);
    });
  });
});

describe('Homepage — work sections', () => {
  it('splits one bounded read into non-overlapping Featured and preview slices', () => {
    renderWithProviders(<HomepageWorksSections works={READY} />);

    const hrefs = screen
      .getAllByRole('link')
      .map((node) => node.getAttribute('href'))
      .filter((href): href is string => href !== null && href.startsWith('/san-pham/'));
    expect(hrefs).toHaveLength(9);
    expect(new Set(hrefs).size).toBe(9);
  });

  it('links every work to the canonical Product Detail route', () => {
    renderWithProviders(<HomepageWorksSections works={READY} />);
    expect(screen.getByRole('link', { name: /Tác phẩm 0/ })).toHaveAttribute(
      'href',
      '/san-pham/tac-pham-0',
    );
  });

  it('titles works below the section heading level', () => {
    renderWithProviders(<HomepageWorksSections works={READY} />);
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(9);
  });

  it('states the truth when the catalog is empty, keeping both sections present', () => {
    renderWithProviders(<HomepageWorksSections works={{ status: 'empty' }} />);

    expect(screen.getByText(HOMEPAGE_COPY.works.empty)).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
  });

  it('keeps a catalog failure local and leaks nothing about it', () => {
    const { container } = renderWithProviders(
      <HomepageWorksSections works={{ status: 'error' }} />,
    );

    expect(screen.getByText(HOMEPAGE_COPY.works.error)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/requestId|Axios|ECONNREFUSED|Internal Server/i);
    // The continuation into the feed survives the failure.
    expect(screen.getByRole('link', { name: HOMEPAGE_COPY.discover.action })).toHaveAttribute(
      'href',
      '/kham-pha',
    );
  });

  it('renders fewer real works rather than padding a short catalog', () => {
    renderWithProviders(<HomepageWorksSections works={fixtureWorks(1)} />);
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1);
  });
});

describe('Homepage — Collections', () => {
  it('continues into the gallery feed through exactly one anchor', () => {
    // `APP11-S01` shipped this section without an action because `/bo-suu-tap`
    // did not exist. `APP11-S02` built the route, so the staged action is now a
    // real link — one, to the feed itself.
    const { container } = renderWithProviders(<HomepageCollections />);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      HOMEPAGE_COPY.collections.heading,
    );
    const links = within(container).queryAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName(HOMEPAGE_COPY.collections.action);
    expect(links[0]).toHaveAttribute('href', '/bo-suu-tap');
  });

  it('links to the feed and never to one entry', () => {
    // `/bo-suu-tap/[slug]` is `APP11-S03`'s route and does not exist; a link to
    // it here would be a 404 on the Storefront's most-visited page.
    const { container } = renderWithProviders(<HomepageCollections />);

    for (const anchor of container.querySelectorAll('a')) {
      expect(anchor.getAttribute('href')).toBe('/bo-suu-tap');
    }
    // Still no cards, no gallery read and no schedule commentary.
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.textContent).not.toMatch(/sắp ra mắt|đang xây dựng|S0\d/i);
  });
});

describe('Homepage — Studio Story and Commission CTA', () => {
  it('carries the store introduction as DOM text, not as an image', () => {
    const { container } = renderWithProviders(<HomepageStudioStory />);

    for (const paragraph of HOMEPAGE_COPY.story.paragraphs) {
      expect(screen.getByText(paragraph)).toBeInTheDocument();
    }
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  it('claims no operational fact the repository cannot source', () => {
    const { container } = renderWithProviders(<HomepageStudioStory />);
    expect(container.textContent).not.toMatch(
      /thành lập|giờ mở cửa|hotline|\+84|chứng nhận|bảo hành|khách hàng đã/i,
    );
  });

  it('reaches the existing request flow and states approval before payment', () => {
    withCustomEmbroideryRelease(true, () => {
      renderWithProviders(<HomepageCommissionCta />);

      expect(screen.getByRole('link', { name: HOMEPAGE_COPY.commission.action })).toHaveAttribute(
        'href',
        '/yeu-cau/moi',
      );
      expect(
        screen.getByRole('list', { name: HOMEPAGE_COPY.commission.stepsLabel }),
      ).toBeInTheDocument();
      expect(screen.getByText(/duyệt thiết kế, đơn hàng được đặt cọc 40%/i)).toBeInTheDocument();
    });
  });

  it('invents no cart or checkout entry point', () => {
    withCustomEmbroideryRelease(true, () => {
      const { container } = renderWithProviders(<HomepageCommissionCta />);
      expect(container.innerHTML).not.toMatch(/\/(cart|checkout|gio-hang)\b/);
    });
  });
});
