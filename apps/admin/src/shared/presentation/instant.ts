/**
 * The server's ISO instant in the product's one display form.
 *
 * ## Why this is now a delegation
 *
 * This module used to call `Intl.DateTimeFormat('vi-VN', { dateStyle: 'short',
 * timeStyle: 'short' })`, which renders `08:12 5/9/26` — a two-digit year with
 * no signalled day/month order — while the customer's own page rendered the same
 * class of instant as `08:12 ngày 06/09/2026`, and four further Admin surfaces
 * hand-rolled three more variants. `V01-UX-021` recorded an operator on the
 * phone to a customer reading two different renderings of one fact.
 *
 * `APP12-V02` §30 makes `dd/MM/yyyy · HH:mm` canonical and puts it in
 * `@embroidery/i18n`, so the two applications cannot drift apart again: there is
 * one declared format rather than one utility per app that happens to agree
 * today. This file survives as the Admin's import site and nothing else.
 *
 * The zone is the workshop's (`Asia/Ho_Chi_Minh`) rather than the viewer's,
 * which is the point: an operator and a customer discussing a stock-hold
 * deadline must be reading the same clock. Presentation only — §30 forbids
 * changing what instant anything stores.
 *
 * The raw value is preserved in the caller's `dateTime` attribute either way, so
 * an unparseable instant degrades to being shown verbatim rather than to
 * "Invalid Date".
 */
import { formatDisplayDate, formatDisplayInstant } from '@embroidery/i18n';

export function formatInstant(iso: string): string {
  return formatDisplayInstant(iso) ?? iso;
}

/** The date half alone, for a row that genuinely carries no time of day. */
export function formatDate(iso: string): string {
  return formatDisplayDate(iso) ?? iso;
}
