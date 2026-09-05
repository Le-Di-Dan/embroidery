import { VI_MESSAGES, hydrateMessages, messageView } from '@embroidery/i18n';
import { BRAND_NAME } from '@embroidery/ui';
import {
  STOREFRONT_CUSTOM_REQUEST_ROUTE,
  STOREFRONT_FAQ_ROUTE,
  STOREFRONT_SERVICE_ROUTE,
  buildStorefrontPolicyPath,
} from '../../../storefront-shell/model/storefront-navigation';
import type { ContentPage } from '../content-page';
import { POLICY_SLUG } from './policy-slugs';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/content.json`, under `policies.payment`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const policiesPaymentMessage = messageView(
  hydrateMessages(VI_MESSAGES.content, { brand: BRAND_NAME }),
  'policies.payment',
);

/**
 * `/chinh-sach/thanh-toan` — the payment policy (`APP11-S05`).
 *
 * ## Every number here is quoted, not chosen
 *
 * ```text
 * 40% deposit after design approval    docs/01 §8, docs/04 BR-005
 * 60% remainder before hand-over       docs/01 §8
 * quotation is versioned, has a validity period, has a breakdown,
 *   and is not changed by a later price list      docs/01 §6
 * manual Admin reconciliation                     docs/01 §8
 * never treat a payment as successful on a
 *   client redirect alone                         docs/01 §8, CLAUDE.md §9
 * ```
 *
 * ## Bank transfer only, because that is what is delivered
 *
 * `docs/01` §8 lists MoMo and ZaloPay as *desired* methods alongside bank
 * transfer. APP7 and APP9 delivered the bank-transfer path — a QR for the exact
 * quoted amount, optional transfer evidence, and operator verification. A policy
 * page listing two wallets a customer cannot actually pay with would be a
 * published promise the checkout cannot keep, so this page describes the
 * delivered method and does not enumerate the roadmap.
 *
 * ## Verification is described as manual, because it is
 *
 * The page states plainly that the workshop confirms each transfer. Saying a
 * bank or provider webhook confirms it automatically would be false *and* would
 * contradict the rule that a redirect alone never means success. Nothing here
 * exposes an internal transfer reference beyond what the customer already sees
 * in their own payment screen.
 */
export const PAYMENT_POLICY: ContentPage = {
  id: 'policy-payment',
  path: buildStorefrontPolicyPath(POLICY_SLUG.payment),
  eyebrow: policiesPaymentMessage.text('eyebrow'),
  heading: policiesPaymentMessage.text('heading'),
  lead: policiesPaymentMessage.text('lead'),
  metaTitle: policiesPaymentMessage.text('metaTitle'),
  metaDescription: policiesPaymentMessage.text('metaDescription'),
  trail: { parentLabel: policiesPaymentMessage.text('trail.parentLabel') },
  sections: [
    {
      kind: 'prose',
      id: 'when',
      heading: policiesPaymentMessage.text('sections.0.heading'),
      paragraphs: policiesPaymentMessage.list('sections.0.paragraphs'),
      bullets: policiesPaymentMessage.list('sections.0.bullets'),
    },
    {
      kind: 'prose',
      id: 'quotation',
      heading: policiesPaymentMessage.text('sections.1.heading'),
      paragraphs: policiesPaymentMessage.list('sections.1.paragraphs'),
    },
    {
      kind: 'prose',
      id: 'method',
      heading: policiesPaymentMessage.text('sections.2.heading'),
      paragraphs: policiesPaymentMessage.list('sections.2.paragraphs'),
    },
    {
      kind: 'prose',
      id: 'verification',
      heading: policiesPaymentMessage.text('sections.3.heading'),
      paragraphs: policiesPaymentMessage.list('sections.3.paragraphs'),
    },
    {
      kind: 'prose',
      id: 'security',
      heading: policiesPaymentMessage.text('sections.4.heading'),
      paragraphs: policiesPaymentMessage.list('sections.4.paragraphs'),
    },
    {
      kind: 'links',
      id: 'payment-related',
      heading: policiesPaymentMessage.text('sections.5.heading'),
      links: [
        {
          id: 'policy-shipping',
          label: policiesPaymentMessage.text('sections.5.links.0.label'),
          href: buildStorefrontPolicyPath(POLICY_SLUG.shipping),
        },
        {
          id: 'policy-returns',
          label: policiesPaymentMessage.text('sections.5.links.1.label'),
          href: buildStorefrontPolicyPath(POLICY_SLUG.returns),
        },
        {
          id: 'service',
          label: policiesPaymentMessage.text('sections.5.links.2.label'),
          href: STOREFRONT_SERVICE_ROUTE,
        },
        {
          id: 'faq',
          label: policiesPaymentMessage.text('sections.5.links.3.label'),
          href: STOREFRONT_FAQ_ROUTE,
        },
        {
          id: 'commission',
          label: policiesPaymentMessage.text('sections.5.links.4.label'),
          href: STOREFRONT_CUSTOM_REQUEST_ROUTE,
        },
      ],
    },
  ],
};
