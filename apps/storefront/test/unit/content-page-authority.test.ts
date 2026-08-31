/**
 * @jest-environment node
 *
 * What the static content pages may and may not say (`APP11-S05`).
 *
 * These are content-integrity assertions, not snapshot tests. They do not check
 * that a sentence reads well — that is review's job — but that no page ships a
 * design placeholder, a fabricated business fact or a link to a route that does
 * not exist. Those three are the failure modes that survive a careful read and
 * only surface in production.
 */
import {
  FAQ_PAGE,
  LOCAL_PAGE,
  SERVICE_PAGE,
  STOREFRONT_POLICY_PAGES,
  getStorefrontPolicy,
  hasCanonicalStoreFacts,
  resolveStoreFacts,
  type ContentPage,
} from '../../src/features/content-pages';

const ALL_PAGES: readonly ContentPage[] = [
  SERVICE_PAGE,
  FAQ_PAGE,
  LOCAL_PAGE,
  ...STOREFRONT_POLICY_PAGES,
];

/** Every visible string on a page, flattened. */
function textOf(page: ContentPage): string[] {
  const parts = [page.eyebrow, page.heading, page.lead, page.metaTitle, page.metaDescription];

  for (const section of page.sections) {
    parts.push(section.heading);
    switch (section.kind) {
      case 'prose':
        parts.push(...section.paragraphs, ...(section.bullets ?? []));
        break;
      case 'faq':
        for (const item of section.items) parts.push(item.question, ...item.answer);
        break;
      case 'store-info':
        parts.push(section.fallback);
        break;
      case 'links':
        for (const link of section.links) {
          parts.push(link.label);
          if (link.hint !== undefined) parts.push(link.hint);
        }
        break;
    }
  }
  return parts;
}

/** Every internal href a page emits. */
function hrefsOf(page: ContentPage): string[] {
  return page.sections.flatMap((section) =>
    section.kind === 'links' ? section.links.map((link) => link.href) : [],
  );
}

describe('the seven pages are one system', () => {
  it('covers Service, FAQ, Local and the four policies', () => {
    expect(ALL_PAGES).toHaveLength(7);
    expect(ALL_PAGES.map((page) => page.path)).toEqual([
      '/dich-vu',
      '/cau-hoi-thuong-gap',
      '/cua-hang',
      '/chinh-sach/giao-hang',
      '/chinh-sach/thanh-toan',
      '/chinh-sach/doi-tra',
      '/chinh-sach/bao-mat',
    ]);
  });

  it('gives every page one heading, a lead and complete public metadata', () => {
    for (const page of ALL_PAGES) {
      expect(page.heading.trim()).not.toHaveLength(0);
      expect(page.lead.trim()).not.toHaveLength(0);
      expect(page.metaTitle.trim()).not.toHaveLength(0);
      expect(page.metaDescription.trim()).not.toHaveLength(0);
    }
  });

  it('closes every page with an internal-links block', () => {
    for (const page of ALL_PAGES) {
      expect(page.sections.at(-1)?.kind).toBe('links');
    }
  });

  it('instantiates each optional block exactly where D01 approved it', () => {
    const kinds = (page: ContentPage) => page.sections.map((section) => section.kind);

    // FAQ accordion: only the FAQ page.
    expect(kinds(FAQ_PAGE)).toContain('faq');
    for (const page of ALL_PAGES.filter((candidate) => candidate !== FAQ_PAGE)) {
      expect(kinds(page)).not.toContain('faq');
    }
    // Store information: only the Local page.
    expect(kinds(LOCAL_PAGE)).toContain('store-info');
    for (const page of ALL_PAGES.filter((candidate) => candidate !== LOCAL_PAGE)) {
      expect(kinds(page)).not.toContain('store-info');
    }
  });
});

describe('no placeholder reaches production copy', () => {
  it.each(ALL_PAGES.map((page) => [page.path, page] as const))(
    '%s carries no TBD, lorem, bracketed note or example domain',
    (_path, page) => {
      for (const text of textOf(page)) {
        expect(text).not.toMatch(/TBD|lorem ipsum|example\.(com|test|org)|XXX|\bTODO\b/i);
        // The D01 placeholders were bracketed design notes: `[Địa chỉ xưởng — …]`.
        expect(text).not.toMatch(/\[[^\]]*chưa có[^\]]*\]/i);
        expect(text.trim()).not.toHaveLength(0);
      }
    },
  );
});

describe('no unsupported business or legal claim is invented', () => {
  /**
   * Each pattern is a claim no approved repository document makes. A return
   * window and a refund deadline are the two most likely to be added by
   * well-meaning edit, which is why they are asserted rather than trusted.
   */
  it.each(ALL_PAGES.map((page) => [page.path, page] as const))(
    '%s promises none',
    (_path, page) => {
      for (const text of textOf(page)) {
        expect(text).not.toMatch(/miễn phí (đổi trả|vận chuyển|giao hàng)/i);
        expect(text).not.toMatch(/hoàn tiền (100|trong \d)/i);
        expect(text).not.toMatch(/\d+\s*ngày\s*(đổi trả|hoàn tiền|bảo hành)/i);
        expect(text).not.toMatch(/cam kết hoàn tiền|đổi trả vô điều kiện/i);
        expect(text).not.toMatch(/giao hàng toàn quốc|giao trong \d+\s*(giờ|ngày)/i);
        expect(text).not.toMatch(/\d+\s*năm kinh nghiệm|\d+\+?\s*khách hàng|chứng nhận ISO/i);
      }
    },
  );

  it('states the two payment figures the business rules actually lock', () => {
    const paymentPolicy = getStorefrontPolicy('thanh-toan');
    expect(paymentPolicy).toBeDefined();

    const payment = textOf(paymentPolicy as ContentPage).join(' ');

    expect(payment).toContain('40%');
    expect(payment).toContain('60%');
    // Never claims a bank or provider confirms the transfer automatically.
    expect(payment).not.toMatch(/tự động xác nhận|webhook|cổng thanh toán tự động/i);
  });
});

describe('no content page publishes an unavailable store fact', () => {
  it('has no canonical store value today, so it renders none', () => {
    expect(resolveStoreFacts()).toEqual([]);
    expect(hasCanonicalStoreFacts()).toBe(false);
  });

  it('never hard-codes an address, phone number or e-mail in page copy', () => {
    for (const page of ALL_PAGES) {
      for (const text of textOf(page)) {
        // A Vietnamese phone number, and any e-mail address.
        expect(text).not.toMatch(/(?:\+84|0)\d[\d\s.-]{7,}/);
        expect(text).not.toMatch(/[\w.-]+@[\w.-]+\.\w{2,}/);
      }
    }
  });
});

describe('every internal link points at a delivered route', () => {
  const DELIVERED = new Set([
    '/kham-pha',
    '/bo-suu-tap',
    '/yeu-cau/moi',
    '/dich-vu',
    '/cau-hoi-thuong-gap',
    '/cua-hang',
    '/chinh-sach/giao-hang',
    '/chinh-sach/thanh-toan',
    '/chinh-sach/doi-tra',
    '/chinh-sach/bao-mat',
  ]);

  it.each(ALL_PAGES.map((page) => [page.path, page] as const))(
    '%s links only there',
    (_p, page) => {
      for (const href of hrefsOf(page)) {
        expect(DELIVERED.has(href)).toBe(true);
      }
    },
  );

  it('never links to the policy parent, which has no page', () => {
    for (const page of ALL_PAGES) {
      expect(hrefsOf(page)).not.toContain('/chinh-sach');
    }
  });

  it('never links to a rejected alias', () => {
    for (const page of ALL_PAGES) {
      for (const href of hrefsOf(page)) {
        expect(href).not.toMatch(/^\/(faq|lien-he|store|policy|chinh-sach)$/);
      }
    }
  });
});
