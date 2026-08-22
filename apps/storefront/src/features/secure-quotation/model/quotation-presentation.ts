/**
 * What the quotation card says, for one `APP6-S01` state (`700:3` … `702:129`).
 *
 * The approved frames are one card whose badge, headline, sub-line, alert and
 * small print change together — they are not five separate screens. So this is
 * one pure mapping rather than five components each deciding its own words:
 * given the read and which frame is showing, it answers with the strings, and a
 * test can assert the whole projection at once instead of scraping the DOM.
 *
 * Two rules hold everywhere below.
 *
 * **Money is never touched.** Amounts are formatted by `exact-money.ts`, which
 * does string work only. Nothing here adds, subtracts, rounds or re-derives a
 * figure, and the deposit's complementary share — *Phần còn lại 60%* on
 * `700:51` — is deliberately not reproduced, because it exists only by
 * subtracting one percentage from another (§16).
 *
 * **Time is the server's.** `expired` is `APP6-B04`'s own derivation at the
 * instant of the read and is taken as given; the browser clock never decides
 * whether an offer is live. It is used for one thing only — the *còn N ngày*
 * courtesy on the badge, which is a rounding of the remaining window and is
 * simply omitted when the clock disagrees with the server or `validUntil` is
 * absent. A fast clock can therefore drop a hint; it can never hide a live
 * offer or resurrect a lapsed one.
 */
import type {
  CustomerQuotationLineItemResponse,
  CustomerQuotationResponse,
} from '@embroidery/api-client';

import { formatExactMoney, formatExactPercent, isZeroAmount } from './exact-money';
import { SECURE_QUOTATION_COPY as COPY } from './secure-quotation-copy';
import type { QuoteUiState } from './secure-quotation-state';

/**
 * Fixed rather than left to the reader's locale.
 *
 * `700:11` is drawn as `26/08/2026` and `701:155` as `20/08/2026 · 08:31`, and
 * these instants are discussed over the phone with the workshop — they must
 * read the same to both people.
 */
const DISPLAY_LOCALE = 'vi-VN';
const DISPLAY_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const MS_PER_DAY = 86_400_000;

export type BadgeTone = 'SUCCESS' | 'WARNING' | 'ERROR' | 'NEUTRAL';

/** One line of the table, already in the words and figures it is drawn with. */
export interface QuotationLineView {
  readonly key: string;
  readonly description: string;
  readonly kind: string;
  readonly quantity: number;
  readonly unitPrice: string;
  readonly lineTotal: string;
}

export interface QuotationTotalRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export interface QuotationPresentation {
  readonly badge: string;
  readonly badgeTone: BadgeTone;
  readonly title: string;
  readonly subtitle: string;
  readonly note: string;
  readonly lines: QuotationLineView[];
  readonly totals: QuotationTotalRow[];
  readonly depositLabel: string;
  readonly depositAmount: string;
  readonly remainingLabel: string;
  readonly remainingAmount: string;
  readonly totalAmount: string;
}

function formatDate(iso: string | null): string {
  if (iso === null) return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    timeZone: DISPLAY_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

export function formatInstant(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  const time = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    timeZone: DISPLAY_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
  return `${formatDate(iso)} · ${time}`;
}

/**
 * Whole days left in the validity window, or `undefined`.
 *
 * A courtesy on the badge and nothing more. It is `undefined` whenever the
 * answer would be misleading — no `validUntil`, an unparsable one, or a browser
 * clock already past it while the server still calls the offer live — so the
 * badge falls back to the date alone rather than printing *còn 0 ngày* beside
 * an offer that is open.
 */
export function remainingDays(validUntil: string | null, nowMs: number): number | undefined {
  if (validUntil === null) return undefined;
  const until = Date.parse(validUntil);
  if (Number.isNaN(until)) return undefined;
  const remaining = until - nowMs;
  if (remaining <= 0) return undefined;
  return Math.ceil(remaining / MS_PER_DAY);
}

function lineKindLabel(lineKind: string): string {
  const labels: Record<string, string> = COPY.lineKinds;
  return labels[lineKind] ?? lineKind;
}

function lineViews(
  lineItems: CustomerQuotationLineItemResponse[],
  currencyCode: string,
): QuotationLineView[] {
  return lineItems.map((line) => ({
    // The position is unique within the version (CST-037), so it is a stable
    // key that discloses nothing — unlike a database id, which this response
    // does not carry for exactly that reason.
    key: `line-${line.position}`,
    description: line.description,
    kind: lineKindLabel(line.lineKind),
    quantity: line.quantity,
    unitPrice: formatExactMoney(line.unitPriceAmount, currencyCode),
    lineTotal: formatExactMoney(line.lineTotalAmount, currencyCode),
  }));
}

/**
 * The totals block, skipping the rows that carry no information.
 *
 * A zero adjustment and a zero shipping fee are omitted rather than printed as
 * `0`: the approved frame shows them because its sample has both, and a row
 * that always reads zero trains the reader to stop looking at the one time it
 * does not. Whether they are zero is decided by reading the digits, never by
 * converting the string to a number.
 */
function totalRows(quote: CustomerQuotationResponse): QuotationTotalRow[] {
  const rows: QuotationTotalRow[] = [
    {
      key: 'subtotal',
      label: COPY.totals.subtotal,
      value: formatExactMoney(quote.subtotalAmount, quote.currencyCode),
    },
  ];
  if (!isZeroAmount(quote.manualAdjustmentAmount)) {
    rows.push({
      key: 'adjustment',
      label: COPY.totals.manualAdjustment,
      value: formatExactMoney(quote.manualAdjustmentAmount, quote.currencyCode),
    });
  }
  if (!isZeroAmount(quote.shippingFeeAmount)) {
    rows.push({
      key: 'shipping',
      label: COPY.totals.shippingFee,
      value: formatExactMoney(quote.shippingFeeAmount, quote.currencyCode),
    });
  }
  return rows;
}

interface Headline {
  readonly badge: string;
  readonly badgeTone: BadgeTone;
  readonly title: string;
  readonly subtitle: string;
  readonly note: string;
}

function liveBadge(quote: CustomerQuotationResponse, nowMs: number): string {
  const until = formatDate(quote.validUntil);
  if (until === '') return COPY.badges.liveUnknown;
  const days = remainingDays(quote.validUntil, nowMs);
  return days === undefined ? COPY.badges.live(until) : COPY.badges.liveWithDays(until, days);
}

/**
 * The headline for the frame on screen.
 *
 * `ACCEPTED` and `REJECTED` take their instant from the decision response when
 * this mount is the one that made the decision. The read itself carries no
 * decision timestamp, so a quotation found already decided is dated by nothing
 * rather than by a nearby field that means something else.
 */
function headlineOf(
  uiState: QuoteUiState,
  quote: CustomerQuotationResponse,
  nowMs: number,
  decidedAt: string | undefined,
): Headline {
  if (uiState === 'ACCEPTED') {
    return {
      badge:
        decidedAt === undefined
          ? COPY.badges.acceptedUndated
          : COPY.badges.accepted(formatInstant(decidedAt)),
      badgeTone: 'SUCCESS',
      title: COPY.titles.accepted,
      subtitle: COPY.subtitles.accepted(quote.quotationCode),
      note: COPY.notes.accepted,
    };
  }
  if (uiState === 'REJECTED') {
    return {
      badge:
        decidedAt === undefined
          ? COPY.badges.rejectedUndated
          : COPY.badges.rejected(formatInstant(decidedAt)),
      badgeTone: 'ERROR',
      title: COPY.titles.rejected,
      subtitle: COPY.subtitles.rejected(quote.quotationCode),
      note: COPY.notes.rejected,
    };
  }
  if (uiState === 'STALE') {
    return {
      badge: COPY.badges.stale,
      badgeTone: 'WARNING',
      title: COPY.titles.stale,
      subtitle: COPY.subtitles.stale(quote.quotationCode, quote.version),
      note: COPY.notes.stale,
    };
  }
  if (uiState === 'EXPIRED') {
    const until = formatDate(quote.validUntil);
    return {
      badge: until === '' ? COPY.badges.expiredUnknown : COPY.badges.expired(until),
      badgeTone: 'ERROR',
      title: COPY.titles.expired,
      subtitle: COPY.subtitles.expired(quote.quotationCode),
      note: COPY.notes.expired,
    };
  }
  return {
    badge: liveBadge(quote, nowMs),
    badgeTone: 'SUCCESS',
    title: COPY.titles.live,
    subtitle: COPY.subtitles.live(quote.quotationCode, quote.version, quote.quantityTotal),
    note: COPY.notes.live,
  };
}

/** The whole card, as one value. */
export function quotationPresentation(
  quote: CustomerQuotationResponse,
  uiState: QuoteUiState,
  nowMs: number,
  decidedAt?: string,
): QuotationPresentation {
  const headline = headlineOf(uiState, quote, nowMs, decidedAt);
  return {
    ...headline,
    lines: lineViews(quote.lineItems, quote.currencyCode),
    totals: totalRows(quote),
    depositLabel: COPY.totals.deposit(formatExactPercent(quote.depositPercent)),
    depositAmount: formatExactMoney(quote.depositAmount, quote.currencyCode),
    remainingLabel: COPY.totals.remaining,
    remainingAmount: formatExactMoney(quote.remainingAmount, quote.currencyCode),
    totalAmount: formatExactMoney(quote.totalAmount, quote.currencyCode),
  };
}
