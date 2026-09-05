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
    {
      kind: 'prose',
      id: 'handover',
      heading: policiesShippingMessage.text('sections.0.heading'),
      paragraphs: policiesShippingMessage.list('sections.0.paragraphs'),
      bullets: policiesShippingMessage.list('sections.0.bullets'),
    },
    {
      kind: 'prose',
      id: 'fee',
      heading: policiesShippingMessage.text('sections.1.heading'),
      paragraphs: policiesShippingMessage.list('sections.1.paragraphs'),
    },
    {
      kind: 'prose',
      id: 'timing',
      heading: policiesShippingMessage.text('sections.2.heading'),
      paragraphs: policiesShippingMessage.list('sections.2.paragraphs'),
    },
    {
      kind: 'prose',
      id: 'tracking',
      heading: policiesShippingMessage.text('sections.3.heading'),
      paragraphs: policiesShippingMessage.list('sections.3.paragraphs'),
    },
    {
      kind: 'prose',
      id: 'on-arrival',
      heading: policiesShippingMessage.text('sections.4.heading'),
      paragraphs: policiesShippingMessage.list('sections.4.paragraphs'),
    },
    {
      kind: 'links',
      id: 'shipping-related',
      heading: policiesShippingMessage.text('sections.5.heading'),
      links: [
        {
          id: 'policy-payment',
          label: policiesShippingMessage.text('sections.5.links.0.label'),
          href: buildStorefrontPolicyPath(POLICY_SLUG.payment),
        },
        {
          id: 'policy-returns',
          label: policiesShippingMessage.text('sections.5.links.1.label'),
          href: buildStorefrontPolicyPath(POLICY_SLUG.returns),
        },
        {
          id: 'faq',
          label: policiesShippingMessage.text('sections.5.links.2.label'),
          href: STOREFRONT_FAQ_ROUTE,
        },
        {
          id: 'store',
          label: policiesShippingMessage.text('sections.5.links.3.label'),
          href: STOREFRONT_STORE_ROUTE,
        },
        {
          id: 'commission',
          label: policiesShippingMessage.text('sections.5.links.4.label'),
          href: STOREFRONT_CUSTOM_REQUEST_ROUTE,
        },
      ],
    },
  ],
};
