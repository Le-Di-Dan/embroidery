import { BRAND_NAME, VI_MESSAGES, hydrateMessages, messageView } from '@embroidery/i18n';
import {
  STOREFRONT_CUSTOM_REQUEST_ROUTE,
  STOREFRONT_DISCOVER_ROUTE,
  STOREFRONT_FAQ_ROUTE,
  STOREFRONT_GALLERY_ROUTE,
  STOREFRONT_SERVICE_ROUTE,
  STOREFRONT_STORE_ROUTE,
} from '../../storefront-shell/model/storefront-navigation';
import type { ContentPage } from './content-page';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/content.json`, under `service`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const serviceMessage = messageView(
  hydrateMessages(VI_MESSAGES.content, { brand: BRAND_NAME }),
  'service',
);

/**
 * `/dich-vu` — the Service page (`APP11-S05`).
 *
 * Design authority: `FIG-APP11-CONTENT-SERVICE-DESKTOP` `864:677`, an instance
 * of the shared template `863:677` keeping hero, body and internal links.
 *
 * ## Every sentence here is traceable
 *
 * The journey below is the delivered APP5→APP9 product, described in the
 * customer's words:
 *
 * ```text
 * gửi yêu cầu           docs/01 §5   (APP5 custom request intake)
 * báo giá thủ công      docs/01 §6   (manual quotation: breakdown, validity,
 *                                     40% deposit / 60% remainder, price frozen)
 * duyệt thiết kế        docs/01 §7   (manual digitizing, unlimited revisions,
 *                                     each revision is a new version, approval
 *                                     through the secure link)
 * đặt cọc 40%           docs/01 §8, docs/04 BR-005 (after approval)
 * sản xuất              docs/01 §9, docs/06 (production states)
 * thanh toán 60%        docs/01 §8   (before delivery)
 * giao / nhận           docs/01 §10  (Admin-entered fee and carrier name only)
 * ```
 *
 * ## What is deliberately absent
 *
 * No delivery-day guarantee, capacity figure, turnaround time, price, minimum
 * order, certification, years in business or order count: none of them is
 * canonical anywhere in this repository, and a Service page is exactly where an
 * invented one would read as a commitment. No internal lifecycle or status name
 * appears — `docs/06`'s state machine is operator vocabulary, and a customer
 * reading `PRODUCTION_COMPLETED` learns nothing.
 *
 * Nothing here starts a second intake flow. Every outbound link is a delivered
 * public route, composed from the shell's constants.
 */
export const SERVICE_PAGE: ContentPage = {
  id: 'service',
  path: STOREFRONT_SERVICE_ROUTE,
  eyebrow: serviceMessage.text('eyebrow'),
  heading: serviceMessage.text('heading'),
  lead: serviceMessage.text('lead'),
  metaTitle: serviceMessage.text('metaTitle'),
  metaDescription: serviceMessage.text('metaDescription'),
  sections: [
    // The Wave-1 page (`APP12-V02` §7.1, §8). Short, and every exit it offers
    // is a released route. The three Wave-2 sections below it document a
    // commission the release cannot take, and are withheld rather than deleted
    // so releasing the capability restores the page it was reviewed as.
    //
    // §7.1 also permits "a short statement that commissions open later", and
    // this page deliberately does not carry one. `APP12-RELEASE-WAVE-AUTHORITY`
    // §7 forbids publishing the roadmap on a public surface, the Homepage
    // already omits its commission section whole rather than announcing it, and
    // a Service page that promises a service for an unnamed later date is the
    // same unfulfillable promise `V01-UX-001` recorded, just further off. From
    // outside, Wave 2 is simply not there.
    {
      kind: 'prose',
      id: 'craft',
      release: 'wave1',
      heading: serviceMessage.text('sections.craft.heading'),
      paragraphs: serviceMessage.list('sections.craft.paragraphs'),
      bullets: serviceMessage.list('sections.craft.bullets'),
    },
    {
      kind: 'prose',
      id: 'how-to-buy',
      release: 'wave1',
      heading: serviceMessage.text('sections.how-to-buy.heading'),
      paragraphs: serviceMessage.list('sections.how-to-buy.paragraphs'),
      bullets: serviceMessage.list('sections.how-to-buy.bullets'),
    },
    {
      kind: 'links',
      id: 'service-next-wave1',
      release: 'wave1',
      heading: serviceMessage.text('sections.service-next-wave1.heading'),
      links: [
        {
          id: 'discover',
          label: serviceMessage.text('sections.service-next-wave1.links.discover.label'),
          href: STOREFRONT_DISCOVER_ROUTE,
          hint: serviceMessage.text('sections.service-next-wave1.links.discover.hint'),
        },
        {
          id: 'gallery',
          label: serviceMessage.text('sections.service-next-wave1.links.gallery.label'),
          href: STOREFRONT_GALLERY_ROUTE,
          hint: serviceMessage.text('sections.service-next-wave1.links.gallery.hint'),
        },
        {
          id: 'faq',
          label: serviceMessage.text('sections.service-next-wave1.links.faq.label'),
          href: STOREFRONT_FAQ_ROUTE,
          hint: serviceMessage.text('sections.service-next-wave1.links.faq.hint'),
        },
      ],
    },
    {
      kind: 'prose',
      id: 'what-we-do',
      release: 'wave2',
      heading: serviceMessage.text('sections.what-we-do.heading'),
      paragraphs: serviceMessage.list('sections.what-we-do.paragraphs'),
      bullets: serviceMessage.list('sections.what-we-do.bullets'),
    },
    {
      kind: 'prose',
      id: 'journey',
      release: 'wave2',
      heading: serviceMessage.text('sections.journey.heading'),
      paragraphs: serviceMessage.list('sections.journey.paragraphs'),
      bullets: serviceMessage.list('sections.journey.bullets'),
    },
    {
      kind: 'prose',
      id: 'before-you-start',
      release: 'wave2',
      heading: serviceMessage.text('sections.before-you-start.heading'),
      paragraphs: serviceMessage.list('sections.before-you-start.paragraphs'),
      bullets: serviceMessage.list('sections.before-you-start.bullets'),
    },
    {
      kind: 'links',
      id: 'service-next',
      release: 'wave2',
      heading: serviceMessage.text('sections.service-next.heading'),
      links: [
        {
          id: 'discover',
          label: serviceMessage.text('sections.service-next.links.discover.label'),
          href: STOREFRONT_DISCOVER_ROUTE,
          hint: serviceMessage.text('sections.service-next.links.discover.hint'),
        },
        {
          id: 'gallery',
          label: serviceMessage.text('sections.service-next.links.gallery.label'),
          href: STOREFRONT_GALLERY_ROUTE,
          hint: serviceMessage.text('sections.service-next.links.gallery.hint'),
        },
        {
          id: 'commission',
          label: serviceMessage.text('sections.service-next.links.commission.label'),
          // The commission intake is a deliberate 404 while Wave 2 is withheld.
          release: 'wave2',
          href: STOREFRONT_CUSTOM_REQUEST_ROUTE,
          hint: serviceMessage.text('sections.service-next.links.commission.hint'),
        },
        {
          id: 'faq',
          label: serviceMessage.text('sections.service-next.links.faq.label'),
          href: STOREFRONT_FAQ_ROUTE,
          hint: serviceMessage.text('sections.service-next.links.faq.hint'),
        },
        {
          id: 'store',
          label: serviceMessage.text('sections.service-next.links.store.label'),
          href: STOREFRONT_STORE_ROUTE,
          hint: serviceMessage.text('sections.service-next.links.store.hint'),
        },
      ],
    },
  ],
};
