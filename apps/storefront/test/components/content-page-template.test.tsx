/**
 * The shared content-page template, rendered (`APP11-S05`).
 *
 * One template renders all seven pages, so these assertions are made against the
 * template with real page definitions rather than against a fixture: what breaks
 * here is what a visitor would see break.
 */
import { createUser, renderWithProviders, screen } from '@embroidery/frontend-testing';

import {
  ContentPageScreen,
  FAQ_PAGE,
  LOCAL_PAGE,
  SERVICE_PAGE,
  STOREFRONT_POLICY_PAGES,
  getStorefrontPolicy,
  type ContentPage,
} from '../../src/features/content-pages';

const ALL_PAGES = [SERVICE_PAGE, FAQ_PAGE, LOCAL_PAGE, ...STOREFRONT_POLICY_PAGES];

/**
 * One policy page, by slug and narrowed. Indexing `STOREFRONT_POLICY_PAGES`
 * would work at runtime but yields `ContentPage | undefined` under
 * `noUncheckedIndexedAccess`, and naming the slug says which policy is meant
 * far better than a position does.
 */
function policy(slug: string): ContentPage {
  const page = getStorefrontPolicy(slug);
  if (page === undefined) throw new Error(`no policy for slug: ${slug}`);
  return page;
}

describe('semantic page structure', () => {
  it.each(ALL_PAGES.map((page) => [page.path, page] as const))(
    '%s renders exactly one H1, and it is the page heading',
    (_path, page) => {
      renderWithProviders(<ContentPageScreen page={page} />);

      const headings = screen.getAllByRole('heading', { level: 1 });
      expect(headings).toHaveLength(1);
      expect(headings[0]).toHaveTextContent(page.heading);
    },
  );

  it('never skips a heading level: H1, then section H2s', () => {
    renderWithProviders(<ContentPageScreen page={FAQ_PAGE} />);

    // The FAQ questions are controls, not headings: nesting an <h3> inside the
    // summary suppressed the trigger's own button mapping (see the disclosure
    // component). The outline is H1 then section H2s, which skips no level.
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
  });

  it('renders body copy as real DOM text, not as an image', () => {
    renderWithProviders(<ContentPageScreen page={policy('bao-mat')} />);

    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(screen.getByText(/Thông tin Nét Thêu thu thập/)).toBeInTheDocument();
  });

  it('renders the policy parent as text, never as a link', () => {
    renderWithProviders(<ContentPageScreen page={policy('giao-hang')} />);

    // `/chinh-sach` has no page, so the label must not be an anchor anywhere.
    for (const link of screen.getAllByRole('link')) {
      expect(link).not.toHaveAttribute('href', '/chinh-sach');
    }
  });
});

describe('the FAQ disclosure', () => {
  /**
   * The trigger states its own semantics rather than relying on the user-agent
   * mapping for `<summary>`, because live acceptance measured that mapping and
   * found Chromium exposing the summary as a generic node with no expanded
   * state. So `role`, `aria-expanded` and `aria-controls` are asserted here as
   * authored attributes — which is exactly what they are — and the native
   * toggling underneath is asserted through the element's own `open`.
   */
  function triggersIn(container: HTMLElement): HTMLElement[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>('summary.content-page__faq-question'),
    );
  }

  /** The first disclosure trigger, narrowed — an empty list is itself a failure. */
  function firstTrigger(container: HTMLElement): HTMLElement {
    const [trigger] = triggersIn(container);
    if (trigger === undefined) throw new Error('the FAQ rendered no disclosure trigger');
    return trigger;
  }

  it('exposes every question as a button controlling a stable panel', () => {
    const { container } = renderWithProviders(<ContentPageScreen page={FAQ_PAGE} />);
    const triggers = triggersIn(container);

    expect(triggers).toHaveLength(9);
    for (const trigger of triggers) {
      expect(trigger).toHaveAttribute('role', 'button');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');

      // The controlled panel must actually exist, or the reference is a lie.
      const panelId = trigger.getAttribute('aria-controls');
      expect(panelId).not.toBeNull();
      expect(container.querySelector(`#${panelId ?? ''}`)).not.toBeNull();
    }
  });

  it('keeps aria-expanded in step with the element on open and close', async () => {
    const user = createUser();
    const { container } = renderWithProviders(<ContentPageScreen page={FAQ_PAGE} />);

    const trigger = firstTrigger(container);
    const item = trigger.closest('details');

    expect(item).not.toBeNull();
    expect(item).not.toHaveAttribute('open');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(item).toHaveAttribute('open');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.click(trigger);
    expect(item).not.toHaveAttribute('open');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps every answer in the DOM while collapsed', () => {
    renderWithProviders(<ContentPageScreen page={FAQ_PAGE} />);

    // Nine questions, nine answers, none removed by being closed — a crawler and
    // an un-hydrated visitor read the whole page.
    const items = FAQ_PAGE.sections.flatMap((section) =>
      section.kind === 'faq' ? section.items : [],
    );

    expect(items).toHaveLength(9);
    for (const item of items) {
      const [firstParagraph] = item.answer;
      expect(firstParagraph).toBeDefined();
      expect(screen.getByText(firstParagraph as string)).toBeInTheDocument();
    }
  });

  it('nests no interactive control inside a disclosure trigger', () => {
    const { container } = renderWithProviders(<ContentPageScreen page={FAQ_PAGE} />);

    for (const trigger of triggersIn(container)) {
      expect(trigger.querySelectorAll('a, button, input, select, textarea')).toHaveLength(0);
    }
  });
});

describe('the store-information block', () => {
  it('renders the truthful fallback while no store fact is canonical', () => {
    renderWithProviders(<ContentPageScreen page={LOCAL_PAGE} />);

    expect(screen.getByText(/sẽ được cập nhật tại đây/)).toBeInTheDocument();
  });

  it('renders no empty fact row, no placeholder and no tel:/mailto: link', () => {
    const { container } = renderWithProviders(<ContentPageScreen page={LOCAL_PAGE} />);

    expect(container.querySelectorAll('.content-page__store-fact')).toHaveLength(0);
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
  });
});

describe('related internal links', () => {
  it('gives every link a descriptive accessible name and a real href', () => {
    renderWithProviders(<ContentPageScreen page={SERVICE_PAGE} />);

    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);

    for (const link of links) {
      expect(link).toHaveAttribute('href', expect.stringMatching(/^\//));
      expect(link.textContent?.trim()).not.toHaveLength(0);
      // No "xem thêm" / "tại đây": a link list must be usable out of context.
      expect(link.textContent?.trim().toLowerCase()).not.toBe('tại đây');
    }
  });
});
