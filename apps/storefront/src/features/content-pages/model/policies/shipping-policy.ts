import { VI_MESSAGES, hydrateMessages, messageView } from '@embroidery/i18n';
import { BRAND_NAME } from '@embroidery/ui';
import {
  STOREFRONT_CUSTOM_REQUEST_ROUTE,
  STOREFRONT_FAQ_ROUTE,
  STOREFRONT_STORE_ROUTE,
  buildStorefrontPolicyPath,
} from '../../../storefront-shell/model/storefront-navigation';
import type { ContentPage } from '../content-page';
import { POLICY_SLUG } from './policy-slugs';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/content.json`, under `policies.shipping`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const policiesShippingMessage = messageView(
  hydrateMessages(VI_MESSAGES.content, { brand: BRAND_NAME }),
  'policies.shipping',
);

/**
 * `/chinh-sach/giao-hang` — the shipping policy (`APP11-S05`).
 *
 * ## Bounded by what shipping actually is in this product
 *
 * `docs/01-PRODUCT-REQUIREMENTS.md` §10 is unusually explicit about the limits,
 * and they are the substance of this page:
 *
 * ```text
 * in scope   Admin enters the shipping fee
 *            Admin may record a carrier name and an internal waybill code
 * excluded   carrier API integration
 *            third-party fee calculation
 *            customer-facing journey tracking
 *            any shipping adapter
 * ```
 *
 * `docs/02` §2 repeats "Shipping provider API" and "Shipping tracking" as
 * explicitly out of scope. So this policy promises no carrier, no delivery
 * window, no nationwide coverage, no tracking page and no free shipping — not
 * as caution, but because each of those would describe a capability the product
 * deliberately does not have.
 *
 * What it can say truthfully: the fee is quoted before you pay, hand-over
 * happens once the order is complete, collection at the workshop is available,
 * and the remaining balance is settled before the item leaves.
 */
export const SHIPPING_POLICY: ContentPage = {
  id: 'policy-shipping',
  path: buildStorefrontPolicyPath(POLICY_SLUG.shipping),
  eyebrow: policiesShippingMessage.text('eyebrow'),
  heading: policiesShippingMessage.text('heading'),
  lead: policiesShippingMessage.text('lead'),
  metaTitle: policiesShippingMessage.text('metaTitle'),
  metaDescription: policiesShippingMessage.text('metaDescription'),
  trail: { parentLabel: policiesShippingMessage.text('trail.parentLabel') },
  sections: [
    // The Wave-1 fee and hand-over (`APP12-V02` §7.2). The fee is set by the
    // workshop **after** the order and shown before payment (`BR-029`); the
    // Wave-2 sections below place it inside a quotation, which is true only
    // once commissions are released.
    {
      kind: 'prose',
      id: 'fee-wave1',
      release: 'wave1',
      heading: policiesShippingMessage.text('sections.fee-wave1.heading'),
      paragraphs: policiesShippingMessage.list('sections.fee-wave1.paragraphs'),
    },
    {
      kind: 'prose',
      id: 'timing-wave1',
      release: 'wave1',
      heading: policiesShippingMessage.text('sections.timing-wave1.heading'),
      paragraphs: policiesShippingMessage.list('sections.timing-wave1.paragraphs'),
    },
    {
      kind: 'prose',
      id: 'handover',
      heading: policiesShippingMessage.text('sections.handover.heading'),
      paragraphs: policiesShippingMessage.list('sections.handover.paragraphs'),
      bullets: policiesShippingMessage.list('sections.handover.bullets'),
    },
    {
      kind: 'prose',
      id: 'fee',
      release: 'wave2',
      heading: policiesShippingMessage.text('sections.fee.heading'),
      paragraphs: policiesShippingMessage.list('sections.fee.paragraphs'),
    },
    {
      kind: 'prose',
      id: 'timing',
      release: 'wave2',
      heading: policiesShippingMessage.text('sections.timing.heading'),
      paragraphs: policiesShippingMessage.list('sections.timing.paragraphs'),
    },
    {
      kind: 'prose',
      id: 'tracking',
      heading: policiesShippingMessage.text('sections.tracking.heading'),
      paragraphs: policiesShippingMessage.list('sections.tracking.paragraphs'),
    },
    {
      kind: 'prose',
      id: 'on-arrival',
      heading: policiesShippingMessage.text('sections.on-arrival.heading'),
      paragraphs: policiesShippingMessage.list('sections.on-arrival.paragraphs'),
    },
    {
      kind: 'links',
      id: 'shipping-related',
      heading: policiesShippingMessage.text('sections.shipping-related.heading'),
      links: [
        {
          id: 'policy-payment',
          label: policiesShippingMessage.text(
            'sections.shipping-related.links.policy-payment.label',
          ),
          href: buildStorefrontPolicyPath(POLICY_SLUG.payment),
        },
        {
          id: 'policy-returns',
          label: policiesShippingMessage.text(
            'sections.shipping-related.links.policy-returns.label',
          ),
          href: buildStorefrontPolicyPath(POLICY_SLUG.returns),
        },
        {
          id: 'faq',
          label: policiesShippingMessage.text('sections.shipping-related.links.faq.label'),
          href: STOREFRONT_FAQ_ROUTE,
        },
        {
          id: 'store',
          label: policiesShippingMessage.text('sections.shipping-related.links.store.label'),
          href: STOREFRONT_STORE_ROUTE,
        },
        {
          id: 'commission',
          label: policiesShippingMessage.text('sections.shipping-related.links.commission.label'),
          // The commission intake is a deliberate 404 while Wave 2 is withheld.
          release: 'wave2',
          href: STOREFRONT_CUSTOM_REQUEST_ROUTE,
        },
      ],
    },
  ],
};
