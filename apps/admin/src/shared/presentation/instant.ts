/**
 * The server's ISO instant in the operator's locale — the convention `APP3-A02`
 * set for Admin lists and `APP5-A01` reused, extracted here because the order
 * queue and the order detail both need it.
 *
 * The raw value is preserved in the caller's `dateTime` attribute either way, so
 * an unparseable instant degrades to being shown verbatim rather than to
 * "Invalid Date".
 */
const ADMIN_LOCALE = 'vi-VN';

export function formatInstant(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return new Intl.DateTimeFormat(ADMIN_LOCALE, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(at);
}
