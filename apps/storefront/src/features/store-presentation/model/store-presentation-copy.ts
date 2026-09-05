import { VI_MESSAGES, hydrateMessages, messageView } from '@embroidery/i18n';
import { BRAND_NAME } from '@embroidery/ui';
import {
  STOREFRONT_CUSTOM_REQUEST_ROUTE,
  STOREFRONT_FAQ_ROUTE,
  STOREFRONT_GALLERY_ROUTE,
  STOREFRONT_SERVICE_ROUTE,
  buildStorefrontPolicyPath,
} from '../../storefront-shell/model/storefront-navigation';
import { POLICY_IDS, POLICY_SLUG } from '../../content-pages';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/storefront.json`, under `storePresentation`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const storePresentationMessage = messageView(
  hydrateMessages(VI_MESSAGES.storefront, { brand: BRAND_NAME }),
  'storePresentation',
);

/**
 * The footer store-presentation block's content (`APP11-S05`, closing
 * `FU-APP10-D01-05`).
 *
 * Design authority: `FIG-APP11-FOOTER-STORE-SUPPLEMENT` `872:1029` (Desktop
 * 1440), `-TABLET` `888:1006` (1024), `-MOBILE` `888:1058` (390) and the
 * responsive-authority annotation `889:1030`.
 *
 * ## Four columns, in one order, at every width
 *
 * `889:1030` §D.1 fixes the order as store identity → contact → service &
 * support → policies, identical at all three widths, and requires that source
 * order equal visual order so keyboard order needs no correction. That is why
 * the columns are an ordered array here and the stylesheet reflows them with
 * grid track counts alone — never with CSS `order`, which would leave a keyboard
 * user tabbing through the footer in an order nobody can see.
 *
 * ## Column 4 is generated, not transcribed
 *
 * The policy links come from `POLICY_IDS` through `buildStorefrontPolicyPath`,
 * so the footer advertises exactly the four policies that resolve — a fifth
 * policy would appear here automatically, and a hand-typed slug that no longer
 * resolves cannot. `889:1030` also requires the four to stay in one column at
 * every width, which is why they are one column's `links` rather than a flat
 * list the layout could wrap across two.
 *
 * ## No Zalo or Messenger link
 *
 * `889:1030` is explicit that external contact is **not** a footer column at any
 * width — it lives only in the floating dock (`APP10-E01`). Publishing the same
 * two URLs twice on every page is exactly what moving them to the dock was
 * meant to stop, so column 2 names the channels in prose and links to none.
 *
 * ## No store facts here
 *
 * Address, opening hours, phone and e-mail are resolved from
 * `resolveStoreFacts()` at render time, not written here, so the footer and the
 * Local page publish the same values under the same rule. None is canonical
 * today, so none is rendered — and no placeholder replaces them.
 */
export const STORE_PRESENTATION_COPY = {
  /** Names the region. The block is a `<section>`, not a second `<footer>`. */
  regionLabel: storePresentationMessage.text('regionLabel'),
  identity: {
    heading: storePresentationMessage.text('identity.heading'),
    descriptor: storePresentationMessage.text('identity.descriptor'),
    /*
     * There is deliberately no fallback sentence and no visit action here any
     * more (`V01-UX-027`, `APP12-V02` §11).
     *
     * The column used to publish "Thông tin địa chỉ và giờ mở cửa sẽ được cập
     * nhật." on every route, immediately above a `Ghé xưởng` link inviting the
     * customer to come in person. A public site that admits its own address is
     * missing, next to an invitation to visit it, undercuts the tone of
     * everything around it — and §11 forbids both halves: no "sẽ cập nhật" as
     * production copy, and no invitation to an address nobody has.
     *
     * The store facts are still external pre-R01 input. When one becomes
     * canonical, `resolveStoreFacts()` publishes the rows here with no change
     * to this file, and the visit action is a separate Product Owner decision
     * rather than something that returns by accident.
     */
  },
  contact: {
    heading: storePresentationMessage.text('contact.heading'),
    /**
     * Shown when no phone or e-mail is canonical. It routes the visitor to
     * channels that genuinely exist rather than apologising for the gap, and it
     * describes the dock without duplicating its links.
     */
    fallback: storePresentationMessage.text('contact.fallback'),
    /**
     * The same column once the commission intake is released: the request form
     * becomes the fastest way to reach the workshop, and the sentence says so.
     * Wave 1 has no such form, so it names only the channels that exist.
     */
    commissionFallback: storePresentationMessage.text('contact.commissionFallback'),
    action: storePresentationMessage.text('contact.action'),
    actionHref: STOREFRONT_CUSTOM_REQUEST_ROUTE,
  },
  service: {
    heading: storePresentationMessage.text('service.heading'),
    links: [
      {
        id: 'service',
        label: storePresentationMessage.text('service.links.0.label'),
        href: STOREFRONT_SERVICE_ROUTE,
      },
      {
        id: 'faq',
        label: storePresentationMessage.text('service.links.1.label'),
        href: STOREFRONT_FAQ_ROUTE,
      },
      {
        id: 'gallery',
        label: storePresentationMessage.text('service.links.2.label'),
        href: STOREFRONT_GALLERY_ROUTE,
      },
    ],
  },
  policies: {
    heading: storePresentationMessage.text('policies.heading'),
    /** Labels for the four canonical policies, keyed by id. */
    labels: {
      shipping: storePresentationMessage.text('policies.labels.shipping'),
      payment: storePresentationMessage.text('policies.labels.payment'),
      returns: storePresentationMessage.text('policies.labels.returns'),
      privacy: storePresentationMessage.text('policies.labels.privacy'),
    },
  },
} as const;

/** One footer link. */
export interface StorePresentationLink {
  readonly id: string;
  readonly label: string;
  readonly href: string;
}

/**
 * The policy column, composed from the canonical set rather than transcribed.
 * Order is `POLICY_IDS`, which is the approved footer and sitemap order.
 */
export const STORE_PRESENTATION_POLICY_LINKS: readonly StorePresentationLink[] = POLICY_IDS.map(
  (id) => ({
    id: `policy-${id}`,
    label: STORE_PRESENTATION_COPY.policies.labels[id],
    href: buildStorefrontPolicyPath(POLICY_SLUG[id]),
  }),
);
