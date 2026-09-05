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
    // The Wave-1 answers (`APP12-V02` §7.1, §7.2). `V01-UX-001` found this page
    // answering "when do I pay?" with the 40/60 deposit split, which no Wave-1
    // order uses — the customer most likely to ask had just bought a ready-made
    // item. The Wave-2 list below is withheld rather than deleted.
    {
      kind: 'faq',
      id: 'faq-list-wave1',
      release: 'wave1',
      heading: faqMessage.text('sections.faq-list-wave1.heading'),
      items: [
        {
          id: 'what-to-buy',
          question: faqMessage.text('sections.faq-list-wave1.items.what-to-buy.question'),
          answer: faqMessage.list('sections.faq-list-wave1.items.what-to-buy.answer'),
        },
        {
          id: 'how-to-order',
          question: faqMessage.text('sections.faq-list-wave1.items.how-to-order.question'),
          answer: faqMessage.list('sections.faq-list-wave1.items.how-to-order.answer'),
        },
        {
          id: 'when-to-pay',
          question: faqMessage.text('sections.faq-list-wave1.items.when-to-pay.question'),
          answer: faqMessage.list('sections.faq-list-wave1.items.when-to-pay.answer'),
        },
        {
          id: 'how-to-pay',
          question: faqMessage.text('sections.faq-list-wave1.items.how-to-pay.question'),
          answer: faqMessage.list('sections.faq-list-wave1.items.how-to-pay.answer'),
        },
        {
          id: 'shipping-fee',
          question: faqMessage.text('sections.faq-list-wave1.items.shipping-fee.question'),
          answer: faqMessage.list('sections.faq-list-wave1.items.shipping-fee.answer'),
        },
        {
          id: 'track-order',
          question: faqMessage.text('sections.faq-list-wave1.items.track-order.question'),
          answer: faqMessage.list('sections.faq-list-wave1.items.track-order.answer'),
        },
        {
          id: 'see-work',
          question: faqMessage.text('sections.faq-list-wave1.items.see-work.question'),
          answer: faqMessage.list('sections.faq-list-wave1.items.see-work.answer'),
        },
      ],
    },
    {
      kind: 'faq',
      id: 'faq-list',
      release: 'wave2',
      heading: faqMessage.text('sections.faq-list.heading'),
      items: [
        {
          id: 'how-to-start',
          question: faqMessage.text('sections.faq-list.items.how-to-start.question'),
          answer: faqMessage.list('sections.faq-list.items.how-to-start.answer'),
        },
        {
          id: 'what-to-prepare',
          question: faqMessage.text('sections.faq-list.items.what-to-prepare.question'),
          answer: faqMessage.list('sections.faq-list.items.what-to-prepare.answer'),
        },
        {
          id: 'own-product',
          question: faqMessage.text('sections.faq-list.items.own-product.question'),
          answer: faqMessage.list('sections.faq-list.items.own-product.answer'),
        },
        {
          id: 'design-review',
          question: faqMessage.text('sections.faq-list.items.design-review.question'),
          answer: faqMessage.list('sections.faq-list.items.design-review.answer'),
        },
        {
          id: 'quotation',
          question: faqMessage.text('sections.faq-list.items.quotation.question'),
          answer: faqMessage.list('sections.faq-list.items.quotation.answer'),
        },
        {
          id: 'payment',
          question: faqMessage.text('sections.faq-list.items.payment.question'),
          answer: faqMessage.list('sections.faq-list.items.payment.answer'),
        },
        {
          id: 'delivery',
          question: faqMessage.text('sections.faq-list.items.delivery.question'),
          answer: faqMessage.list('sections.faq-list.items.delivery.answer'),
        },
        {
          id: 'revisions',
          question: faqMessage.text('sections.faq-list.items.revisions.question'),
          answer: faqMessage.list('sections.faq-list.items.revisions.answer'),
        },
        {
          id: 'see-examples',
          question: faqMessage.text('sections.faq-list.items.see-examples.question'),
          answer: faqMessage.list('sections.faq-list.items.see-examples.answer'),
        },
      ],
    },
    {
      kind: 'links',
      id: 'faq-next',
      heading: faqMessage.text('sections.faq-next.heading'),
      links: [
        {
          id: 'service',
          label: faqMessage.text('sections.faq-next.links.service.label'),
          href: STOREFRONT_SERVICE_ROUTE,
          hint: faqMessage.text('sections.faq-next.links.service.hint'),
        },
        {
          id: 'gallery',
          label: faqMessage.text('sections.faq-next.links.gallery.label'),
          href: STOREFRONT_GALLERY_ROUTE,
          hint: faqMessage.text('sections.faq-next.links.gallery.hint'),
        },
        {
          id: 'commission',
          label: faqMessage.text('sections.faq-next.links.commission.label'),
          // The commission intake is a deliberate 404 while Wave 2 is withheld.
          release: 'wave2',
          href: STOREFRONT_CUSTOM_REQUEST_ROUTE,
        },
        {
          id: 'policy-payment',
          label: faqMessage.text('sections.faq-next.links.policy-payment.label'),
          href: buildStorefrontPolicyPath(POLICY_SLUG.payment),
        },
        {
          id: 'policy-shipping',
          label: faqMessage.text('sections.faq-next.links.policy-shipping.label'),
          href: buildStorefrontPolicyPath(POLICY_SLUG.shipping),
        },
        {
          id: 'store',
          label: faqMessage.text('sections.faq-next.links.store.label'),
          href: STOREFRONT_STORE_ROUTE,
        },
      ],
    },
  ],
};
