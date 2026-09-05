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
 * (`packages/i18n/messages/vi/content.json`, under `policies.privacy`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const policiesPrivacyMessage = messageView(
  hydrateMessages(VI_MESSAGES.content, { brand: BRAND_NAME }),
  'policies.privacy',
);

/**
 * `/chinh-sach/bao-mat` — the privacy policy (`APP11-S05`).
 *
 * ## Only the categories the delivered flows visibly collect
 *
 * ```text
 * contact details        docs/01 §4  (e-mail or phone, verified before a
 *                                     secure link is issued)
 * request details        docs/01 §5  (product, variant, quantity, area, size,
 *                                     colours, notes)
 * uploaded files         docs/01 §5  (design artwork; APP7 transfer evidence)
 * order and payment      docs/01 §6, §8
 * operational messages   docs/01 §4  (notifications carrying the secure link)
 * ```
 *
 * Each is something the customer themselves typed, uploaded or received, so the
 * page tells them nothing about the system they could not already observe.
 *
 * ## The claims this page will not make
 *
 * No retention period, no zero-retention claim, no data-residency statement, no
 * encryption or certification claim, no third-party sharing schedule and no
 * cookie policy. None of them is fixed by an approved document, each is the kind
 * of assertion a regulator or a customer would hold the store to, and
 * `docs/09-SECURITY-AND-ABUSE-PREVENTION.md` is an internal control document
 * rather than a published privacy commitment.
 *
 * It also describes **no security implementation detail** — no token lifetime,
 * no storage topology, no control name. A privacy page exists to tell a customer
 * what is collected and why; the mechanism is not theirs to audit and publishing
 * it only helps someone attacking it.
 *
 * The one operational statement made is the one the customer is already relying
 * on and must understand: the link they were sent is private to them, is
 * time-limited, and can be revoked (`docs/01` §4).
 */
export const PRIVACY_POLICY: ContentPage = {
  id: 'policy-privacy',
  path: buildStorefrontPolicyPath(POLICY_SLUG.privacy),
  eyebrow: policiesPrivacyMessage.text('eyebrow'),
  heading: policiesPrivacyMessage.text('heading'),
  lead: policiesPrivacyMessage.text('lead'),
  metaTitle: policiesPrivacyMessage.text('metaTitle'),
  metaDescription: policiesPrivacyMessage.text('metaDescription'),
  trail: { parentLabel: policiesPrivacyMessage.text('trail.parentLabel') },
  sections: [
    {
      kind: 'prose',
      id: 'what',
      heading: policiesPrivacyMessage.text('sections.what.heading'),
      paragraphs: policiesPrivacyMessage.list('sections.what.paragraphs'),
      bullets: policiesPrivacyMessage.list('sections.what.bullets'),
    },
    {
      kind: 'prose',
      id: 'why',
      heading: policiesPrivacyMessage.text('sections.why.heading'),
      paragraphs: policiesPrivacyMessage.list('sections.why.paragraphs'),
      bullets: policiesPrivacyMessage.list('sections.why.bullets'),
    },
    {
      kind: 'prose',
      id: 'secure-link',
      heading: policiesPrivacyMessage.text('sections.secure-link.heading'),
      paragraphs: policiesPrivacyMessage.list('sections.secure-link.paragraphs'),
    },
    {
      kind: 'prose',
      id: 'design-files',
      heading: policiesPrivacyMessage.text('sections.design-files.heading'),
      paragraphs: policiesPrivacyMessage.list('sections.design-files.paragraphs'),
    },
    {
      kind: 'prose',
      id: 'contact',
      heading: policiesPrivacyMessage.text('sections.contact.heading'),
      paragraphs: policiesPrivacyMessage.list('sections.contact.paragraphs'),
    },
    {
      kind: 'links',
      id: 'privacy-related',
      heading: policiesPrivacyMessage.text('sections.privacy-related.heading'),
      links: [
        {
          id: 'policy-payment',
          label: policiesPrivacyMessage.text('sections.privacy-related.links.policy-payment.label'),
          href: buildStorefrontPolicyPath(POLICY_SLUG.payment),
        },
        {
          id: 'policy-returns',
          label: policiesPrivacyMessage.text('sections.privacy-related.links.policy-returns.label'),
          href: buildStorefrontPolicyPath(POLICY_SLUG.returns),
        },
        {
          id: 'service',
          label: policiesPrivacyMessage.text('sections.privacy-related.links.service.label'),
          href: STOREFRONT_SERVICE_ROUTE,
        },
        {
          id: 'faq',
          label: policiesPrivacyMessage.text('sections.privacy-related.links.faq.label'),
          href: STOREFRONT_FAQ_ROUTE,
        },
        {
          id: 'store',
          label: policiesPrivacyMessage.text('sections.privacy-related.links.store.label'),
          href: STOREFRONT_STORE_ROUTE,
        },
      ],
    },
  ],
};
