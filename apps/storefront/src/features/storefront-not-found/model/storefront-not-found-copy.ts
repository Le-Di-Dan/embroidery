/**
 * Vietnamese copy catalog for the Storefront not-found boundary (APP1-S01B).
 *
 * Design source: FIG-STOREFRONT-NOTFOUND (411:2337) / FIG-STOREFRONT-NOTFOUND-
 * MOBILE (411:3851) / FIG-STOREFRONT-SHELL-NOTES (412:2396), all
 * `APPROVED_FOR_IMPLEMENTATION` under FIG-APPROVAL-APP1-D02-STOREFRONT-001. The
 * heading, the "404" code, and both recovery labels are pinned by the accepted
 * D02 handoff; the explanatory sentence follows the approved "safe copy" intent
 * (see the APP1-S01B report §D) — it never claims the page was deleted and never
 * exposes technical detail (APP1-S01B §8, §20). Copy stays useful for a mistyped
 * URL, a stale external link, a removed page, and a future `notFound()` boundary.
 *
 * All user-facing strings live here (FRONTEND_CONVENTIONS §14); no route path,
 * status, or business value is hard-coded in the component.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/storefront.json`, under `notFound`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const notFoundMessage = messageView(VI_MESSAGES.storefront, 'notFound');

export const STOREFRONT_NOT_FOUND_COPY = {
  /** Decorative status code; rendered `aria-hidden` so it is never the a11y title. */
  code: '404',
  /** The single accessible page title (`<h1>`). */
  heading: notFoundMessage.text('heading'),
  /**
   * Safe explanation — "có thể" (may) keeps it honest across every 404 cause and
   * avoids asserting deletion. No path, request ID, or diagnostic is echoed.
   */
  explanation: notFoundMessage.text('explanation'),
  /** Primary recovery — links to the canonical home route. */
  primaryLabel: notFoundMessage.text('primaryLabel'),
  /**
   * Secondary recovery label (approved). It links to `/kham-pha` since
   * `APP2-S01` built the Discover area; the `Sắp ra mắt` tag and its
   * screen-reader "chưa khả dụng" suffix were retired with the same change,
   * because an available action must not describe itself as unavailable.
   */
  secondaryLabel: notFoundMessage.text('secondaryLabel'),
} as const;
