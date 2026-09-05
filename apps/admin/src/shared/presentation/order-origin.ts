/**
 * How an order's origin is named to an operator, for the whole Admin app
 * (`APP12-A02-C1`; `912:337` queue badge and filter, `913:337` detail badge).
 *
 * It sits in shared scope for the reason `order-status.ts` does: the queue and
 * the detail both name the same fact, and an order that read `Bán sẵn` in the
 * list and something else in the detail would be two orders as far as the
 * operator is concerned.
 *
 * ## `origin` is the fact, and the only one
 *
 * The value comes from `orders.origin` (`COL-TBL043-12`), published by every
 * Admin order read since `APP12-A02-C1`. Nothing here derives it from a status,
 * from a missing `customRequestId` or from which payment obligation the order
 * carries — those are consequences of the origin, never substitutes for it, and
 * a helper that inferred one would be a second discriminator living in the
 * browser.
 *
 * ## Not colour-only
 *
 * Each origin carries a **symbol and a word** as well as a tone, so the badge
 * is legible without colour vision and in a monochrome print of the queue.
 * `912:337` draws exactly that: `◆ Bán sẵn` and `✎ Thêu riêng`.
 *
 * ## Total by construction
 *
 * `presentOrderOrigin` accepts `unknown` and always returns a presentation. An
 * origin the contract gains later degrades to a neutral fallback rather than
 * putting a raw English enum member on an otherwise Vietnamese page — and,
 * more importantly, rather than silently rendering as `Thêu riêng` and telling
 * an operator an order is something it is not.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';
import type { AdminStatusTone } from '../status/admin-status-badge';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin-orders.json`, under `originLabels`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const originLabelsMessage = messageView(VI_MESSAGES.adminOrders, 'originLabels');

/** The label both applications use for a value the server did not classify. */
const commonMessage = messageView(VI_MESSAGES.common);

export interface OriginPresentation {
  /** The stored value when this build has a label for it, else `UNKNOWN`. */
  readonly token: string;
  readonly label: string;
  readonly tone: AdminStatusTone;
  readonly symbol: string;
  readonly known: boolean;
}

interface OriginStyle {
  readonly label: string;
  readonly tone: AdminStatusTone;
  readonly symbol: string;
}

/** The two origins, labelled and tinted exactly as `912:337` draws them. */
const ORDER_ORIGIN_STYLES: Readonly<Record<string, OriginStyle>> = {
  READY_MADE: { label: originLabelsMessage.text('READY_MADE.label'), tone: 'info', symbol: '◆' },
  CUSTOM: { label: originLabelsMessage.text('CUSTOM.label'), tone: 'neutral', symbol: '✎' },
};

/** The neutral fallback, for an origin this build has no approved label for. */
export const UNKNOWN_ORDER_ORIGIN_LABEL = commonMessage.text('value.unknown');

export function presentOrderOrigin(origin: unknown): OriginPresentation {
  const style = typeof origin === 'string' ? ORDER_ORIGIN_STYLES[origin] : undefined;
  if (style === undefined) {
    return {
      token: 'UNKNOWN',
      label: UNKNOWN_ORDER_ORIGIN_LABEL,
      tone: 'neutral',
      symbol: '○',
      known: false,
    };
  }
  return { token: origin as string, ...style, known: true };
}

/** The label alone, for prose that names an origin inline. */
export function orderOriginLabel(origin: unknown): string {
  return presentOrderOrigin(origin).label;
}
