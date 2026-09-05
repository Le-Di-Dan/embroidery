import { VI_MESSAGES, hydrateMessages, messageView } from '@embroidery/i18n';
import { BRAND_NAME } from '@embroidery/ui';
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
    {
      kind: 'prose',
      id: 'what-we-do',
      heading: serviceMessage.text('sections.0.heading'),
      paragraphs: serviceMessage.list('sections.0.paragraphs'),
      bullets: serviceMessage.list('sections.0.bullets'),
    },
    {
      kind: 'prose',
      id: 'journey',
      heading: serviceMessage.text('sections.1.heading'),
      paragraphs: serviceMessage.list('sections.1.paragraphs'),
      bullets: serviceMessage.list('sections.1.bullets'),
    },
    {
      kind: 'prose',
      id: 'before-you-start',
      heading: serviceMessage.text('sections.2.heading'),
      paragraphs: serviceMessage.list('sections.2.paragraphs'),
      bullets: serviceMessage.list('sections.2.bullets'),
    },
    {
      kind: 'links',
      id: 'service-next',
      heading: serviceMessage.text('sections.3.heading'),
      links: [
        {
          id: 'discover',
          label: serviceMessage.text('sections.3.links.0.label'),
          href: STOREFRONT_DISCOVER_ROUTE,
          hint: serviceMessage.text('sections.3.links.0.hint'),
        },
        {
          id: 'gallery',
          label: serviceMessage.text('sections.3.links.1.label'),
          href: STOREFRONT_GALLERY_ROUTE,
          hint: serviceMessage.text('sections.3.links.1.hint'),
        },
        {
          id: 'commission',
          label: serviceMessage.text('sections.3.links.2.label'),
          href: STOREFRONT_CUSTOM_REQUEST_ROUTE,
          hint: serviceMessage.text('sections.3.links.2.hint'),
        },
        {
          id: 'faq',
          label: serviceMessage.text('sections.3.links.3.label'),
          href: STOREFRONT_FAQ_ROUTE,
          hint: serviceMessage.text('sections.3.links.3.hint'),
        },
        {
          id: 'store',
          label: serviceMessage.text('sections.3.links.4.label'),
          href: STOREFRONT_STORE_ROUTE,
          hint: serviceMessage.text('sections.3.links.4.hint'),
        },
      ],
    },
  ],
};
