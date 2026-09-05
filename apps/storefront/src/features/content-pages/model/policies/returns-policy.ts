import { BRAND_NAME, VI_MESSAGES, hydrateMessages, messageView } from '@embroidery/i18n';
import {
  STOREFRONT_FAQ_ROUTE,
  STOREFRONT_SERVICE_ROUTE,
  STOREFRONT_STORE_ROUTE,
  buildStorefrontPolicyPath,
} from '../../../storefront-shell/model/storefront-navigation';
import type { ContentPage } from '../content-page';
import { POLICY_SLUG } from './policy-slugs';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/content.json`, under `policies.returns`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const policiesReturnsMessage = messageView(
  hydrateMessages(VI_MESSAGES.content, { brand: BRAND_NAME }),
  'policies.returns',
);

/**
 * `/chinh-sach/doi-tra` — the returns policy (`APP11-S05`).
 *
 * ## The hardest page in S05, and why it is the shortest on numbers
 *
 * `docs/01-PRODUCT-REQUIREMENTS.md` §2.1 requires a `Chính sách đổi trả` page.
 * It, `docs/02`, `docs/04-BUSINESS-RULES.md` and `docs/06` then say **nothing**
 * about a return window, a refund deadline, a restocking rule, an exchange
 * entitlement or a cancellation right. The audit that established this is
 * recorded in the S05 completion report §E.
 *
 * So there is no authority for `7 ngày đổi trả`, `hoàn tiền trong 30 ngày`,
 * `miễn phí đổi trả`, `hoàn tiền tự động` or `đổi trả vô điều kiện`, and every
 * one of them is absent. A return window is not a detail an implementation
 * checkpoint may pick: it is a commercial and consumer-law commitment, it is the
 * single most quoted line of any returns policy, and a number invented here
 * would silently become the store's published position — enforceable against the
 * Product Owner, who never chose it.
 *
 * ## What a truthful page can still say
 *
 * A process, not a promise: personalised work is made to one customer's
 * specification and cannot be resold, which is the honest reason a blanket
 * change-of-mind return is not offered; the approved design is the reference
 * against which a complaint is judged, which is precisely why the approval step
 * exists; and a defect is reviewed case by case against that approved design and
 * applicable consumer obligations.
 *
 * The last clause is deliberately a *reference* to statutory obligations rather
 * than a statement of what they are. Naming a specific Vietnamese consumer-law
 * entitlement would be a legal claim beyond repository authority; acknowledging
 * that such obligations apply and are not displaced by this page is the
 * conservative direction to be wrong in, and it costs the customer nothing.
 */
export const RETURNS_POLICY: ContentPage = {
  id: 'policy-returns',
  path: buildStorefrontPolicyPath(POLICY_SLUG.returns),
  eyebrow: policiesReturnsMessage.text('eyebrow'),
  heading: policiesReturnsMessage.text('heading'),
  lead: policiesReturnsMessage.text('lead'),
  metaTitle: policiesReturnsMessage.text('metaTitle'),
  metaDescription: policiesReturnsMessage.text('metaDescription'),
  trail: { parentLabel: policiesReturnsMessage.text('trail.parentLabel') },
  sections: [
    {
      kind: 'prose',
      id: 'nature',
      heading: policiesReturnsMessage.text('sections.nature.heading'),
      paragraphs: policiesReturnsMessage.list('sections.nature.paragraphs'),
    },
    {
      kind: 'prose',
      id: 'before-production',
      heading: policiesReturnsMessage.text('sections.before-production.heading'),
      paragraphs: policiesReturnsMessage.list('sections.before-production.paragraphs'),
    },
    {
      kind: 'prose',
      id: 'if-something-is-wrong',
      heading: policiesReturnsMessage.text('sections.if-something-is-wrong.heading'),
      paragraphs: policiesReturnsMessage.list('sections.if-something-is-wrong.paragraphs'),
      bullets: policiesReturnsMessage.list('sections.if-something-is-wrong.bullets'),
    },
    {
      kind: 'prose',
      id: 'statutory',
      heading: policiesReturnsMessage.text('sections.statutory.heading'),
      paragraphs: policiesReturnsMessage.list('sections.statutory.paragraphs'),
    },
    {
      kind: 'links',
      id: 'returns-related',
      heading: policiesReturnsMessage.text('sections.returns-related.heading'),
      links: [
        {
          id: 'service',
          label: policiesReturnsMessage.text('sections.returns-related.links.service.label'),
          href: STOREFRONT_SERVICE_ROUTE,
        },
        {
          id: 'policy-shipping',
          label: policiesReturnsMessage.text(
            'sections.returns-related.links.policy-shipping.label',
          ),
          href: buildStorefrontPolicyPath(POLICY_SLUG.shipping),
        },
        {
          id: 'policy-payment',
          label: policiesReturnsMessage.text('sections.returns-related.links.policy-payment.label'),
          href: buildStorefrontPolicyPath(POLICY_SLUG.payment),
        },
        {
          id: 'faq',
          label: policiesReturnsMessage.text('sections.returns-related.links.faq.label'),
          href: STOREFRONT_FAQ_ROUTE,
        },
        {
          id: 'store',
          label: policiesReturnsMessage.text('sections.returns-related.links.store.label'),
          href: STOREFRONT_STORE_ROUTE,
        },
      ],
    },
  ],
};
