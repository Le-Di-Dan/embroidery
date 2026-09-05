/**
 * The canonical Vietnamese message repository, assembled from the JSON on disk.
 *
 * `messages/vi/*.json` is the authority `APP12-V02` §5A.2 requires: **one**
 * package holding every static human-facing sentence in the product, rather than
 * a Storefront copy and an Admin copy of the same text. This module is the only
 * place those files are read, so a namespace cannot be loaded twice through two
 * different paths and drift.
 *
 * The repository is split by namespace rather than kept as one file (§5A.2
 * forbids the single multi-thousand-line JSON). The split is by *audience and
 * domain*, which is the axis a Product Owner actually navigates:
 *
 * ```text
 * common         text both applications render — actions, states, formats
 * storefront     the public shell and the browse/product surfaces
 * checkout       the Ready-Made purchase flow and contact verification
 * orders         the customer's secure order surface
 * content        the editorial pages: services, FAQ, store, policies
 * seo            static browser/metadata copy
 * admin          the operator shell and the catalog/inventory screens
 * adminOrders    the operator order queue, order detail and fulfilment
 * adminSupport   customer access support and the merge workflow
 * adminWave2     operator screens for the withheld custom-embroidery capability
 * studio         the 2D Design Studio (withheld in Wave 1)
 * custom         the customer-side custom-commission journey (withheld in Wave 1)
 * ```
 *
 * Nothing here is loaded lazily. The messages are static JSON compiled into both
 * applications; a `fetch` would buy nothing and would make a server component's
 * first paint wait on I/O for a sentence that has not changed since the build.
 */
import adminOrders from '../messages/vi/admin-orders.json';
import adminSupport from '../messages/vi/admin-support.json';
import adminWave2 from '../messages/vi/admin-wave2.json';
import admin from '../messages/vi/admin.json';
import checkout from '../messages/vi/checkout.json';
import common from '../messages/vi/common.json';
import content from '../messages/vi/content.json';
import custom from '../messages/vi/custom.json';
import orders from '../messages/vi/orders.json';
import seo from '../messages/vi/seo.json';
import storefront from '../messages/vi/storefront.json';
import studio from '../messages/vi/studio.json';

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isSupportedLocale } from './locale';

/**
 * The namespace roots, in the shape next-intl expects: one top-level key per
 * namespace, so `useTranslations('storefront.shell.nav')` and
 * `getTranslations('adminOrders.queue')` address the same tree this module
 * exports to the typed copy views.
 */
export const VI_MESSAGES = {
  common,
  storefront,
  checkout,
  orders,
  content,
  seo,
  admin,
  adminOrders,
  adminSupport,
  adminWave2,
  studio,
  custom,
} as const;

/** The namespace names, for tests and for the key-integrity tooling. */
export const MESSAGE_NAMESPACES = Object.keys(VI_MESSAGES) as readonly (keyof typeof VI_MESSAGES)[];

export type Messages = typeof VI_MESSAGES;

/**
 * Every message for one locale.
 *
 * The parameter is not decoration. It is the seam a second locale arrives
 * through, and it fails loudly rather than silently serving Vietnamese to a
 * caller that asked for something else — a missing translation that renders as
 * the wrong language is the failure mode that survives review.
 */
export function getMessages(locale: string = DEFAULT_LOCALE): Messages {
  // Typed as `string` rather than `SupportedLocale` deliberately. With one
  // supported locale the narrower type makes the guard unreachable at compile
  // time and unwritable at all — and the caller that will actually get this
  // wrong is a framework integration handing over whatever it parsed from a
  // request, which is a `string` no matter what this signature says.
  if (!isSupportedLocale(locale)) {
    throw new Error(
      `[i18n] No message repository for locale "${locale}". Supported: ${SUPPORTED_LOCALES.join(', ')}.`,
    );
  }
  return VI_MESSAGES;
}
