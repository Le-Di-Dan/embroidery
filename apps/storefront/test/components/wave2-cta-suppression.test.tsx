/**
 * Wave-2 customer CTA suppression on released Wave-1 surfaces (`APP12-G02-C1`).
 *
 * `APP12-G02` withheld the seven Wave-2 customer routes at the server
 * (`src/proxy.ts`) and suppressed the one header navigation item that pointed at
 * them. It left nine further call-to-action sites on released pages still
 * offering `/yeu-cau/moi` — an address the gate answers with a deliberate `404`.
 * This suite is the regression guard for the correction.
 *
 * ## What is asserted, and why it is asserted this way
 *
 * Two properties, one per release state, over the **rendered** tree rather than
 * over source text:
 *
 * 1. with the capability withheld, no composition on a released page emits an
 *    anchor whose target `isWithheldWave2Route` recognises;
 * 2. with it released, every delivered CTA comes back — same target, same label.
 *
 * (2) matters as much as (1). A suppression that could not be reversed would be
 * a deletion wearing a flag, and the flag-on path is the one a release actually
 * takes. Both are checked against the *same* route policy the server gate uses,
 * so a route added to the withheld set is covered here without this file being
 * edited.
 *
 * The check is deliberately "no withheld anchor", not "no `/yeu-cau/moi`
 * anchor". `/yeu-cau/moi` is the only one any Wave-1 page links today, but the
 * defect class is a released page offering *any* withheld route, and a literal
 * would stop catching it the moment a checkpoint linked a different one.
 *
 * This is presentation, never enforcement. `release-isolation-gate.test.ts`
 * owns the gate itself, and nothing here would keep a visitor who types the URL
 * out of anything.
 */
import { renderWithProviders, screen, within } from '@embroidery/frontend-testing';
import type { ReactElement } from 'react';

import {
  ContentPageScreen,
  FAQ_PAGE,
  LOCAL_PAGE,
  SERVICE_PAGE,
  getStorefrontPolicy,
  type ContentPage,
} from '../../src/features/content-pages';
import { GalleryDetailCommission } from '../../src/features/gallery-detail/components/gallery-detail-commission';
import { HomepageCommissionCta } from '../../src/features/homepage/components/homepage-commission-cta';
import { HomepageHero } from '../../src/features/homepage/components/homepage-hero';
import { HomepageScreen } from '../../src/features/homepage/components/homepage-screen';
import { HOMEPAGE_COPY } from '../../src/features/homepage/model/homepage-copy';
import { isWithheldWave2Route } from '../../src/features/release-isolation';
import { StorePresentationBlock } from '../../src/features/store-presentation/components/store-presentation-block';
import { STORE_PRESENTATION_COPY } from '../../src/features/store-presentation/model/store-presentation-copy';
import { StorefrontShell } from '../../src/features/storefront-shell';
import { withCustomEmbroideryRelease } from '../support/release-flag';

/**
 * The Homepage's one async server component. Stubbed to nothing: it emits
 * Product-detail links exclusively, none of which is a Wave-2 route, and
 * `homepage.test.tsx` already holds it under test with real fixture data.
 */
jest.mock('../../src/features/homepage/components/homepage-works-lane', () => ({
  HomepageWorksLane: () => null,
}));

function policy(slug: string): ContentPage {
  const page = getStorefrontPolicy(slug);
  if (page === undefined) throw new Error(`no policy for slug: ${slug}`);
  return page;
}

/** Every `href` the rendered tree actually emits, in document order. */
function anchorTargets(container: HTMLElement): string[] {
  return [...container.querySelectorAll('a')]
    .map((anchor) => anchor.getAttribute('href'))
    .filter((href): href is string => href !== null);
}

/** The related-links section of a content page, which every page has exactly one of. */
function linksSectionOf(page: ContentPage) {
  const section = page.sections.find((candidate) => candidate.kind === 'links');
  if (section === undefined || section.kind !== 'links') {
    throw new Error(`no links section on ${page.path}`);
  }
  return section;
}

/**
 * The released compositions a Wave-1 visitor can reach, and the route each one
 * renders on. The shell is listed first because it composes the header
 * navigation and the footer store-presentation block onto **every** page: one
 * component, eleven routes, which is why a component count and a page count are
 * different numbers throughout the `G02-C1` report.
 */
const RELEASED_COMPOSITIONS: readonly (readonly [string, () => ReactElement])[] = [
  ['the shell, on every released route', () => <StorefrontShell>Nội dung</StorefrontShell>],
  ['/ — the Homepage', () => <HomepageScreen />],
  ['/ — the Hero', () => <HomepageHero />],
  ['/ — the Commission CTA', () => <HomepageCommissionCta />],
  ['/bo-suu-tap/[slug] — the commission block', () => <GalleryDetailCommission />],
  ['the footer store-presentation block', () => <StorePresentationBlock />],
  ['/dich-vu', () => <ContentPageScreen page={SERVICE_PAGE} />],
  ['/cau-hoi-thuong-gap', () => <ContentPageScreen page={FAQ_PAGE} />],
  ['/cua-hang', () => <ContentPageScreen page={LOCAL_PAGE} />],
  ['/chinh-sach/thanh-toan', () => <ContentPageScreen page={policy('thanh-toan')} />],
  ['/chinh-sach/giao-hang', () => <ContentPageScreen page={policy('giao-hang')} />],
  ['/chinh-sach/doi-tra', () => <ContentPageScreen page={policy('doi-tra')} />],
  ['/chinh-sach/bao-mat', () => <ContentPageScreen page={policy('bao-mat')} />],
];

describe('with Wave 2 withheld, no released surface advertises a withheld route', () => {
  it.each(RELEASED_COMPOSITIONS)('%s offers none', (_name, render) => {
    withCustomEmbroideryRelease(false, () => {
      const { container } = renderWithProviders(render());
      expect(anchorTargets(container).filter(isWithheldWave2Route)).toEqual([]);
    });
  });

  /**
   * The suppression removes the action, and never leaves a dead one behind. A
   * `#` or an empty `href` would satisfy the assertion above while giving the
   * visitor the same broken promise.
   */
  it.each(RELEASED_COMPOSITIONS)('%s ships no dead affordance in its place', (_name, render) => {
    withCustomEmbroideryRelease(false, () => {
      const { container } = renderWithProviders(render());
      for (const href of anchorTargets(container)) {
        expect(href).not.toBe('#');
        expect(href).not.toBe('');
      }
    });
  });

  /**
   * `APP12-RELEASE-WAVE-AUTHORITY.md` §7 forbids designing a disabled state for
   * an unreleased capability, and `APP12-G02-C1` §7 forbids inventing copy for
   * one. A page corrected here must therefore say nothing at all about Wave 2 —
   * not "coming soon", not "temporarily unavailable", not a date.
   *
   * The shell is the one composition excluded, and deliberately. Its primary
   * navigation has carried an `unavailable` affordance — a `Sắp ra mắt` tag on a
   * non-interactive item — since `APP1-S01A`, for `Studio` and `Nhật ký`, and
   * `APP12-G02` routed `Đặt thêu` through that **existing** branch rather than
   * designing a new one. That is exactly the exemption §7 grants: an approved
   * unavailable-state component reused with no design change. It is also not a
   * link, so the sweep above still passes on it. Nothing this correction added
   * uses that affordance, and this assertion is what keeps it that way.
   */
  it.each(RELEASED_COMPOSITIONS.slice(1))('%s publishes no release plan', (_name, render) => {
    withCustomEmbroideryRelease(false, () => {
      const { container } = renderWithProviders(render());
      expect(container.textContent ?? '').not.toMatch(
        /sắp ra mắt|sắp có|coming soon|tạm ngưng|tạm dừng|chưa khả dụng|đang phát triển/i,
      );
    });
  });
});

describe('releasing Wave 2 restores every delivered CTA unchanged', () => {
  it('brings back the Homepage hero ask and the Commission CTA', () => {
    withCustomEmbroideryRelease(true, () => {
      const hero = renderWithProviders(<HomepageHero />);
      expect(
        within(hero.container).getByRole('link', { name: HOMEPAGE_COPY.hero.commissionAction }),
      ).toHaveAttribute('href', '/yeu-cau/moi');

      const cta = renderWithProviders(<HomepageCommissionCta />);
      expect(
        within(cta.container).getByRole('link', { name: HOMEPAGE_COPY.commission.action }),
      ).toHaveAttribute('href', '/yeu-cau/moi');
      // The section, not only its button: heading and safety steps return too.
      expect(
        within(cta.container).getByRole('heading', { name: HOMEPAGE_COPY.commission.heading }),
      ).toBeInTheDocument();
      expect(
        within(cta.container).getByRole('list', { name: HOMEPAGE_COPY.commission.stepsLabel }),
      ).toBeInTheDocument();
    });
  });

  it('brings back the gallery-entry commission block', () => {
    withCustomEmbroideryRelease(true, () => {
      const { container } = renderWithProviders(<GalleryDetailCommission />);
      expect(within(container).getByRole('link')).toHaveAttribute('href', '/yeu-cau/moi');
    });
  });

  it('brings back the footer contact action without touching its prose', () => {
    const withheldProse = withCustomEmbroideryRelease(false, () => {
      const { container } = renderWithProviders(<StorePresentationBlock />);
      expect(within(container).queryByRole('link', { name: 'Gửi yêu cầu thêu' })).toBeNull();
      // The column keeps its sentence and its heading either way; only the
      // action is release-dependent.
      return within(container).getByText(STORE_PRESENTATION_COPY.contact.fallback).textContent;
    });

    withCustomEmbroideryRelease(true, () => {
      const { container } = renderWithProviders(<StorePresentationBlock />);
      expect(within(container).getByRole('link', { name: 'Gửi yêu cầu thêu' })).toHaveAttribute(
        'href',
        '/yeu-cau/moi',
      );
      expect(
        within(container).getByText(STORE_PRESENTATION_COPY.contact.fallback).textContent,
      ).toBe(withheldProse);
    });
  });

  /**
   * The five content pages whose related-links block lists the request route.
   * The other two policies never listed it, so they are absent here and their
   * link counts are unaffected in both states — asserted by the withheld sweep
   * above, which covers all seven.
   */
  const CONTENT_PAGES_WITH_A_COMMISSION_LINK: readonly (readonly [string, ContentPage])[] = [
    ['/dich-vu', SERVICE_PAGE],
    ['/cau-hoi-thuong-gap', FAQ_PAGE],
    ['/cua-hang', LOCAL_PAGE],
    ['/chinh-sach/thanh-toan', policy('thanh-toan')],
    ['/chinh-sach/giao-hang', policy('giao-hang')],
  ];

  it.each(CONTENT_PAGES_WITH_A_COMMISSION_LINK)(
    '%s drops exactly one related link and restores it',
    (_path, page) => {
      const withheldCount = withCustomEmbroideryRelease(false, () => {
        const { container } = renderWithProviders(<ContentPageScreen page={page} />);
        expect(within(container).queryByRole('link', { name: 'Gửi yêu cầu thêu' })).toBeNull();
        return anchorTargets(container).length;
      });

      withCustomEmbroideryRelease(true, () => {
        const { container } = renderWithProviders(<ContentPageScreen page={page} />);
        expect(within(container).getByRole('link', { name: 'Gửi yêu cầu thêu' })).toHaveAttribute(
          'href',
          '/yeu-cau/moi',
        );
        // Exactly one link differs between the two states — the block is
        // filtered, not rebuilt, so nothing else may appear or disappear.
        expect(anchorTargets(container)).toHaveLength(withheldCount + 1);
      });

      // And the definition itself is untouched, in both states: the model stays
      // the authority for what the page links to.
      expect(linksSectionOf(page).links.some((link) => link.href === '/yeu-cau/moi')).toBe(true);
    },
  );

  /**
   * The related-links block still has something to show on every page it
   * renders on. A block reduced to a heading over an empty list would pass the
   * withheld sweep and still be a defect.
   */
  it.each(CONTENT_PAGES_WITH_A_COMMISSION_LINK)('%s keeps a usable links block', (_path, page) => {
    withCustomEmbroideryRelease(false, () => {
      renderWithProviders(<ContentPageScreen page={page} />);
      const block = screen.getByRole('region', { name: linksSectionOf(page).heading });
      expect(within(block).getAllByRole('link').length).toBeGreaterThanOrEqual(4);
    });
  });
});
