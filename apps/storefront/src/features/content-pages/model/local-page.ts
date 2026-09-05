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
 * (`packages/i18n/messages/vi/content.json`, under `store`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const storeMessage = messageView(
  hydrateMessages(VI_MESSAGES.content, { brand: BRAND_NAME }),
  'store',
);

/**
 * `/cua-hang` — the Local/store page (`APP11-S05`).
 *
 * Design authority: `FIG-APP11-CONTENT-LOCAL-DESKTOP` `864:881`, the template
 * instance that keeps the `[OPTIONAL]` store-information block.
 *
 * ## Singular, because there is one store
 *
 * `docs/02-SCOPE-AND-BOUNDARIES.md` §2 lists multi-branch as explicitly out of
 * scope. There is therefore no store id, no store list, no branch selector and
 * no `/cua-hang/[slug]`, and no map provider is loaded — a map is a third-party
 * dependency and an embedded frame in exchange for a pin the page has no
 * canonical coordinates for anyway.
 *
 * ## The page ships without the four facts it was drawn around
 *
 * `resolveStoreFacts()` returns nothing today (see `store-facts.ts` for the
 * audit), and **no row is drawn for a fact that has no canonical value** — not
 * a placeholder, not `TBD`, not a plausible-looking invention.
 *
 * The block therefore does not render at all. It used to render a fallback
 * sentence saying the address and opening hours would arrive later;
 * `V01-UX-027` recorded that as published placeholder copy and `APP12-V02` §11
 * forbids it, so the section is omitted and the page's other three carry it.
 *
 * That is why the copy below never depends on those values. It says what is
 * genuinely true and useful without them — that this is one workshop, that work
 * is by appointment through the request flow, and where to go next — so a
 * visitor is routed to a channel that works rather than left at a page that
 * says only that it cannot tell them anything. When the Product Owner supplies
 * the values, they appear here and in the footer with no change to this file.
 */
export const LOCAL_PAGE: ContentPage = {
  id: 'local',
  path: STOREFRONT_STORE_ROUTE,
  eyebrow: storeMessage.text('eyebrow'),
  heading: storeMessage.text('heading'),
  lead: storeMessage.text('lead'),
  metaTitle: storeMessage.text('metaTitle'),
  metaDescription: storeMessage.text('metaDescription'),
  sections: [
    {
      kind: 'store-info',
      id: 'store-facts',
      heading: storeMessage.text('sections.store-facts.heading'),
    },
    {
      kind: 'prose',
      id: 'visiting',
      heading: storeMessage.text('sections.visiting.heading'),
      paragraphs: storeMessage.list('sections.visiting.paragraphs'),
    },
    {
      kind: 'prose',
      id: 'contact-channels',
      heading: storeMessage.text('sections.contact-channels.heading'),
      paragraphs: storeMessage.list('sections.contact-channels.paragraphs'),
    },
    {
      kind: 'links',
      id: 'local-next',
      heading: storeMessage.text('sections.local-next.heading'),
      links: [
        {
          id: 'commission',
          label: storeMessage.text('sections.local-next.links.commission.label'),
          // The commission intake is a deliberate 404 while Wave 2 is withheld.
          release: 'wave2',
          href: STOREFRONT_CUSTOM_REQUEST_ROUTE,
          hint: storeMessage.text('sections.local-next.links.commission.hint'),
        },
        {
          id: 'service',
          label: storeMessage.text('sections.local-next.links.service.label'),
          href: STOREFRONT_SERVICE_ROUTE,
          hint: storeMessage.text('sections.local-next.links.service.hint'),
        },
        {
          id: 'gallery',
          label: storeMessage.text('sections.local-next.links.gallery.label'),
          href: STOREFRONT_GALLERY_ROUTE,
          hint: storeMessage.text('sections.local-next.links.gallery.hint'),
        },
        {
          id: 'discover',
          label: storeMessage.text('sections.local-next.links.discover.label'),
          href: STOREFRONT_DISCOVER_ROUTE,
          hint: storeMessage.text('sections.local-next.links.discover.hint'),
        },
        {
          id: 'faq',
          label: storeMessage.text('sections.local-next.links.faq.label'),
          href: STOREFRONT_FAQ_ROUTE,
        },
      ],
    },
  ],
};
