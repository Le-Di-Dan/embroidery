/**
 * One way to print an instant, shared by both applications.
 *
 * `V01-UX-021` found the two applications printing the same class of instant in
 * two different and individually ambiguous formats, so a staff member reading an
 * order beside the customer's own page had to work out which convention each
 * screen was using. The fix is not a utility in each app that happens to agree
 * today; it is one declared format that both read.
 *
 * `dd/MM/yyyy · HH:mm` is the `APP12-V02` §30 canonical shape. It is
 * unambiguous for a Vietnamese reader (day first), unambiguous for anyone else
 * (a four-digit year rules out a US reading of the first two fields), and 24-hour
 * so there is no am/pm to lose.
 *
 * **Timezone semantics are untouched.** These are presentation formats. What
 * instant an order carries, and in which zone it is stored, is business data and
 * `APP12-V02` §30 explicitly forbids changing it here.
 */

/** The IANA zone every customer- and operator-facing instant is printed in. */
export const DISPLAY_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/**
 * next-intl `formats.dateTime` entries, addressable by name from a component:
 * `format.dateTime(value, 'dateTime')`.
 */
export const DATE_TIME_FORMATS = {
  /** `05/09/2026` — a date with no time of day. */
  date: {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: DISPLAY_TIME_ZONE,
  },
  /** `14:32` — a time of day with no date. */
  time: {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: DISPLAY_TIME_ZONE,
  },
  /**
   * `05/09/2026, 14:32` — the full instant.
   *
   * `Intl` joins the two halves with a comma; the product prints them joined by
   * a middle dot. `formatDisplayInstant` below owns that join so the separator
   * is written once rather than in every call site that wants the canonical
   * shape.
   */
  dateTime: {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: DISPLAY_TIME_ZONE,
  },
} as const;

export const INTL_FORMATS = { dateTime: DATE_TIME_FORMATS } as const;

/** The separator between the date half and the time half. */
export const DISPLAY_INSTANT_SEPARATOR = ' · ';

/**
 * The canonical instant string, for the many callers that are not components.
 *
 * Built from two `Intl.DateTimeFormat` passes rather than one, because the
 * single-pass output puts a locale-chosen comma between the halves and the
 * separator is a product decision, not a locale one.
 *
 * An unparseable value returns `null` instead of `Invalid Date`: a screen that
 * shows nothing where a timestamp belongs is a visible gap, and a screen that
 * shows `Invalid Date` is a defect that reads as content.
 */
export function formatDisplayInstant(value: Date | string | number, locale = 'vi'): string | null {
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) return null;

  const date = new Intl.DateTimeFormat(locale, DATE_TIME_FORMATS.date).format(instant);
  const time = new Intl.DateTimeFormat(locale, DATE_TIME_FORMATS.time).format(instant);
  return `${date}${DISPLAY_INSTANT_SEPARATOR}${time}`;
}

/** The date half alone, for a surface that genuinely has no time of day. */
export function formatDisplayDate(value: Date | string | number, locale = 'vi'): string | null {
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  return new Intl.DateTimeFormat(locale, DATE_TIME_FORMATS.date).format(instant);
}
