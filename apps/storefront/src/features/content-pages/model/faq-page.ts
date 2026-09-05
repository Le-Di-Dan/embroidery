import { VI_MESSAGES, hydrateMessages, messageView } from '@embroidery/i18n';
import { BRAND_NAME } from '@embroidery/ui';
import {
  STOREFRONT_CUSTOM_REQUEST_ROUTE,
  STOREFRONT_FAQ_ROUTE,
  STOREFRONT_GALLERY_ROUTE,
  STOREFRONT_SERVICE_ROUTE,
  STOREFRONT_STORE_ROUTE,
  buildStorefrontPolicyPath,
} from '../../storefront-shell/model/storefront-navigation';
import type { ContentPage } from './content-page';
import { POLICY_SLUG } from './policies/policy-slugs';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/content.json`, under `faq`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const faqMessage = messageView(hydrateMessages(VI_MESSAGES.content, { brand: BRAND_NAME }), 'faq');

/**
 * `/cau-hoi-thuong-gap` — the FAQ page (`APP11-S05`).
 *
 * Design authority: `FIG-APP11-CONTENT-FAQ-DESKTOP` `864:779`, the template
 * instance that keeps the `[OPTIONAL]` FAQ accordion and drops media and store
 * information.
 *
 * ## The questions are the product's, not a keyword list
 *
 * Each one is a question the delivered flows actually raise — how a request
 * starts, what to prepare, how review works, when money moves, how the item is
 * handed over, where past work lives. `docs/08` §7 forbids mass-generated
 * low-value content, and a FAQ padded with questions nobody asks to catch search
 * traffic is precisely that.
 *
 * Every answer is bounded by the same authority the Service page and the
 * policies use. In particular there is **no** turnaround time, no return window,
 * no refund deadline and no shipping guarantee, because no canonical document
 * states one. Where a subject has a policy page, the answer summarises and links
 * rather than restating — one wording, one place to correct it.
 *
 * ## Answers stay in the DOM
 *
 * `ContentFaqSection` carries full answer text, and the disclosure component
 * renders every answer into the markup whether or not it is expanded. A crawler
 * and a visitor whose JavaScript has not arrived both read the whole page
 * (`docs/08` §5: never render critical SEO text only behind client code).
 */
export const FAQ_PAGE: ContentPage = {
  id: 'faq',
  path: STOREFRONT_FAQ_ROUTE,
  eyebrow: faqMessage.text('eyebrow'),
  heading: faqMessage.text('heading'),
  lead: faqMessage.text('lead'),
  metaTitle: faqMessage.text('metaTitle'),
  metaDescription: faqMessage.text('metaDescription'),
  sections: [
    {
      kind: 'faq',
      id: 'faq-list',
      heading: faqMessage.text('sections.0.heading'),
      items: [
        {
          id: 'how-to-start',
          question: faqMessage.text('sections.0.items.0.question'),
          answer: faqMessage.list('sections.0.items.0.answer'),
        },
        {
          id: 'what-to-prepare',
          question: faqMessage.text('sections.0.items.1.question'),
          answer: faqMessage.list('sections.0.items.1.answer'),
        },
        {
          id: 'own-product',
          question: faqMessage.text('sections.0.items.2.question'),
          answer: faqMessage.list('sections.0.items.2.answer'),
        },
        {
          id: 'design-review',
          question: faqMessage.text('sections.0.items.3.question'),
          answer: faqMessage.list('sections.0.items.3.answer'),
        },
        {
          id: 'quotation',
          question: faqMessage.text('sections.0.items.4.question'),
          answer: faqMessage.list('sections.0.items.4.answer'),
        },
        {
          id: 'payment',
          question: faqMessage.text('sections.0.items.5.question'),
          answer: faqMessage.list('sections.0.items.5.answer'),
        },
        {
          id: 'delivery',
          question: faqMessage.text('sections.0.items.6.question'),
          answer: faqMessage.list('sections.0.items.6.answer'),
        },
        {
          id: 'revisions',
          question: faqMessage.text('sections.0.items.7.question'),
          answer: faqMessage.list('sections.0.items.7.answer'),
        },
        {
          id: 'see-examples',
          question: faqMessage.text('sections.0.items.8.question'),
          answer: faqMessage.list('sections.0.items.8.answer'),
        },
      ],
    },
    {
      kind: 'links',
      id: 'faq-next',
      heading: faqMessage.text('sections.1.heading'),
      links: [
        {
          id: 'service',
          label: faqMessage.text('sections.1.links.0.label'),
          href: STOREFRONT_SERVICE_ROUTE,
          hint: faqMessage.text('sections.1.links.0.hint'),
        },
        {
          id: 'gallery',
          label: faqMessage.text('sections.1.links.1.label'),
          href: STOREFRONT_GALLERY_ROUTE,
          hint: faqMessage.text('sections.1.links.1.hint'),
        },
        {
          id: 'commission',
          label: faqMessage.text('sections.1.links.2.label'),
          href: STOREFRONT_CUSTOM_REQUEST_ROUTE,
        },
        {
          id: 'policy-payment',
          label: faqMessage.text('sections.1.links.3.label'),
          href: buildStorefrontPolicyPath(POLICY_SLUG.payment),
        },
        {
          id: 'policy-shipping',
          label: faqMessage.text('sections.1.links.4.label'),
          href: buildStorefrontPolicyPath(POLICY_SLUG.shipping),
        },
        {
          id: 'store',
          label: faqMessage.text('sections.1.links.5.label'),
          href: STOREFRONT_STORE_ROUTE,
        },
      ],
    },
  ],
};
