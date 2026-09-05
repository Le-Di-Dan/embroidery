/**
 * Every user-facing string on `/truy-cap` (`APP4-S02`).
 *
 * Read from the approved `APP4-D01` frames, not written here; node ids sit
 * beside each entry so a copy change is traceable to the design that authorized
 * it. Centralised because `CLAUDE.md` §5 forbids hard-coded user-facing copy
 * inside components.
 *
 * ### The rule that governs what may be said
 *
 * **Non-enumeration (`634:59`, `APP4-G01` PO-04).** The server collapses six
 * causes — unknown, expired, revoked, superseded, wrong target, wrong purpose —
 * into one identical `404`. The browser is not told which one, and could not
 * say even if it wanted to. So there is exactly one unavailable text here, and
 * it names no cause: the alert body lists *possibilities* in the customer's own
 * terms and commits to none of them, which is what `629:46` was drawn to say.
 *
 * Nothing below may grow an "đã hết hạn", "đã bị thu hồi", "sai tài khoản" or
 * "liên kết không hợp lệ" variant. A missing fragment, a malformed fragment and
 * a definitive 404 all render this same text (§13, §14).
 *
 * ### Why nothing here describes an authorized link
 *
 * The authorized state is the consumer's. `APP4-D01` drew it as an empty
 * handoff slot; `APP5-D01` fills that slot with the request itself and states
 * so explicitly (`661:335` — the resolve step is `APP4-S02`'s, the content is
 * built only after a valid grant). The three access states below are the ones
 * that say nothing about what the link opens, and they are the ones this module
 * still owns.
 *
 * The unavailable card diverges only in type size, so it carries one string per
 * entry; `634:119` states that state keeps its layout at both sizes.
 */

import { BRAND_NAME, VI_MESSAGES, hydrateMessages, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/orders.json`, under `secureLink`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const secureLinkMessage = messageView(
  hydrateMessages(VI_MESSAGES.orders, { brand: BRAND_NAME }),
  'secureLink',
);

export const SECURE_LINK_COPY = {
  /** `629:9` / `629:10` / `629:16` — bootstrap while the landing resolves. */
  bootstrap: {
    title: secureLinkMessage.text('bootstrap.title'),
    body: secureLinkMessage.text('bootstrap.body'),
    caption: secureLinkMessage.text('bootstrap.caption'),
  },

  /**
   * `629:43` … `629:49` desktop, `629:93` … `629:99` mobile — identical words at
   * both sizes, which is the design's own statement that this state must look
   * the same wherever it is read.
   */
  unavailable: {
    title: secureLinkMessage.text('unavailable.title'),
    alertTitle: secureLinkMessage.text('unavailable.alertTitle'),
    alertBody: secureLinkMessage.text('unavailable.alertBody'),
    body: secureLinkMessage.text('unavailable.body'),
  },

  /** `629:59` … `629:66` — transport uncertainty, kept distinct on purpose. */
  transientError: {
    title: secureLinkMessage.text('transientError.title'),
    alertTitle: secureLinkMessage.text('transientError.alertTitle'),
    alertBody: secureLinkMessage.text('transientError.alertBody'),
    retry: secureLinkMessage.text('transientError.retry'),
  },

  /** `629:48` / `629:65` / `629:98` — the one navigation out of every dead end. */
  home: secureLinkMessage.text('home'),

  /**
   * The polite live-region announcements (`634:145`, `634:146`).
   *
   * Every state change is announced, not only colour-signalled. The unavailable
   * announcement repeats the visible title and carries no cause, for the same
   * reason the visible copy does not.
   */
  live: {
    bootstrap: secureLinkMessage.text('live.bootstrap'),
    unavailable: secureLinkMessage.text('live.unavailable'),
    transientError: secureLinkMessage.text('live.transientError'),
  },

  /** The document title. Reused as the accessible page name. */
  pageTitle: secureLinkMessage.text('pageTitle'),
} as const;
