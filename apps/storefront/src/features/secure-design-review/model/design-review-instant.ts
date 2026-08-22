/**
 * The two instants this screen shows a customer, in their own locale.
 *
 * `APP6-B10` and `APP6-B11` publish every timestamp as an ISO-8601 UTC string,
 * which is exactly right on the wire and unreadable on a page: a customer
 * confirming *when the workshop sent this design* should not be shown
 * `2026-08-21T15:09:01.979Z`. This was caught in the browser rather than in
 * jsdom, because a test asserting "the subtitle contains the sent instant"
 * passes just as well against the raw string.
 *
 * Declared here rather than shared, following `APP6-S01` and `APP5-S02`, both
 * of which keep their own. The locale and zone are a *presentation* decision of
 * one customer surface; hoisting them into a shared module would make a change
 * for one screen a change for every screen, and none of the three is entitled
 * to make that call for the others.
 *
 * A value that cannot be parsed renders as an empty string rather than as
 * `Invalid Date`. Nothing on this screen depends on an instant being present —
 * the version id and the document hash are what a decision binds — so an
 * unreadable timestamp must degrade to silence, never to a word that looks like
 * an error the customer caused.
 *
 * No arithmetic anywhere: nothing here counts days, compares against `now` or
 * decides whether something has lapsed. A design version has no validity window
 * (only a quotation does), so there is nothing for this module to compute.
 */
const DISPLAY_LOCALE = 'vi-VN';
const DISPLAY_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/** `21/08/2026` — the day the workshop sent the version. */
export function formatReviewDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    timeZone: DISPLAY_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

/**
 * `21/08/2026 · 22:09` — the instant a decision committed.
 *
 * The minute matters here and not on the date above: this is evidence of when
 * the customer's own approval or revision request was recorded, and it is the
 * value they would quote to the workshop.
 */
export function formatReviewInstant(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  const time = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    timeZone: DISPLAY_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
  return `${formatReviewDate(iso)} · ${time}`;
}
