/**
 * How a category's lifecycle state is named to an operator (`APP12-A01`).
 *
 * ## Three values, and there is no fourth
 *
 * `AdminCategoryResponseStatus` publishes the whole vocabulary — `DRAFT`,
 * `PUBLISHED`, `ARCHIVED` — and `APP12-C02` owns every move between them. This
 * is a closed rule vocabulary, not a taxonomy: it names *states*, never
 * categories, so nothing here becomes a compiled category value.
 *
 * ## Colour is never the message
 *
 * Each presentation carries a symbol and a text label as well as a tone, so the
 * state is readable without distinguishing the tints — which is what the shared
 * `AdminStatusBadge` renders and what §15 requires of this screen. The symbols
 * are the shared `753:120` vocabulary rather than a second set: a draft
 * category and a draft product should not be marked differently for no reason.
 *
 * ## The tones are the ones `915:342` binds
 *
 * `Đang hiển thị` binds `Color/Status/Success`, `Nháp` binds
 * `Color/Border/Secondary` — the badge's own default — and `Đã lưu trữ` binds
 * `Color/Text/Tertiary`, which is why the shared badge gained a `muted` tone
 * rather than borrowing `warning`. An archived category is not a warning: it is
 * a record that has been closed, and the frame draws it receding.
 *
 * The gallery names its own `ARCHIVED` `warning` (`866:905`). The two are not
 * reconciled here: each screen implements the frame that was approved for it,
 * and a cross-surface tone review is `APP12-V01`'s question, not this
 * checkpoint's to decide unilaterally.
 *
 * ## Feature scope, deliberately
 *
 * This stays inside the category capability because the category screen is its
 * only caller — the same rule `gallery-status` followed until a second real
 * caller landed (CLAUDE.md §5). The product screens name a category by its
 * **name**, never by its lifecycle state.
 */
import { AdminCategoryResponseStatus } from '@embroidery/api-client';

import type { AdminStatusTone } from '../../../shared/status/admin-status-badge';
import { STATUS_SYMBOLS } from '../../../shared/presentation/order-status';

export interface CategoryStatusPresentation {
  /** The stored value when this build has a label for it, else `UNKNOWN`. */
  readonly token: string;
  readonly label: string;
  readonly tone: AdminStatusTone;
  readonly symbol: string;
  readonly known: boolean;
}

interface StatusStyle {
  readonly label: string;
  readonly tone: AdminStatusTone;
  readonly symbol: string;
}

const CATEGORY_STATUS_STYLES: Readonly<Record<string, StatusStyle>> = {
  /** `915:413` / `915:414` */
  [AdminCategoryResponseStatus.DRAFT]: {
    label: 'Nháp',
    tone: 'neutral',
    symbol: STATUS_SYMBOLS.idle,
  },
  /** `915:386` / `915:387` */
  [AdminCategoryResponseStatus.PUBLISHED]: {
    label: 'Đang hiển thị',
    tone: 'success',
    symbol: STATUS_SYMBOLS.succeeded,
  },
  /** `915:422` / `915:423` */
  [AdminCategoryResponseStatus.ARCHIVED]: {
    label: 'Đã lưu trữ',
    tone: 'muted',
    symbol: STATUS_SYMBOLS.ended,
  },
};

/** The neutral fallback, for a state this build has no approved label for. */
export const UNKNOWN_CATEGORY_STATUS_LABEL = 'Không xác định';

/**
 * Total by construction: accepts `unknown` and always returns a presentation.
 *
 * A state the contract gains later degrades to the neutral fallback rather than
 * putting a raw English enum member on an otherwise Vietnamese page. `known`
 * lets a caller decide whether an action is safe to offer for a state it cannot
 * name — and the answer is always no.
 */
export function presentCategoryStatus(status: unknown): CategoryStatusPresentation {
  const style = typeof status === 'string' ? CATEGORY_STATUS_STYLES[status] : undefined;
  if (style === undefined) {
    return {
      token: 'UNKNOWN',
      label: UNKNOWN_CATEGORY_STATUS_LABEL,
      tone: 'neutral',
      symbol: STATUS_SYMBOLS.idle,
      known: false,
    };
  }
  return { token: status as string, ...style, known: true };
}
