/**
 * How a gallery entry's lifecycle state is named to an operator.
 *
 * ## Three values, and there is no fourth
 *
 * `AdminGalleryEntryListStatus` publishes the whole vocabulary — `DRAFT`,
 * `PUBLISHED`, `ARCHIVED` — and `APP11-B02` owns every transition between them.
 * There is deliberately no `SCHEDULED`, `HIDDEN`, `PENDING_REVIEW` or `DELETED`
 * here: `gallery_entries` has no such state, and a label for one would be this
 * screen inventing a lifecycle the server cannot report.
 *
 * ## Colour is never the message
 *
 * The presentation carries a symbol and a text label as well as a tone, so the
 * state is readable without distinguishing the tints — which is what the
 * shared `AdminStatusBadge` renders and what accessibility requires of this
 * screen.
 *
 * ## Feature scope, on purpose
 *
 * This stays inside the gallery-list capability because the list is its only
 * caller (CLAUDE.md §5). `APP11-A02`'s editor names the same three states, and
 * the `production-status` precedent is the one to follow when it lands: promote
 * to `src/shared/presentation` on the checkpoint that gives it a second real
 * caller, not before.
 */
import type { AdminGalleryEntryListStatus } from '@embroidery/api-client';

import type { AdminStatusTone } from '../../../shared/status/admin-status-badge';
import { STATUS_SYMBOLS } from '../../../shared/presentation/order-status';

export type GalleryStatusValue =
  (typeof AdminGalleryEntryListStatus)[keyof typeof AdminGalleryEntryListStatus];

export interface GalleryStatusPresentation {
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

/**
 * The three states, with the tone and symbol `866:905` draws.
 *
 * The symbols come from the shared `753:120` vocabulary rather than a second
 * set: a draft gallery entry and a draft product should not be marked
 * differently for no reason.
 */
const GALLERY_STATUS_STYLES: Readonly<Record<string, StatusStyle>> = {
  DRAFT: { label: 'Bản nháp', tone: 'neutral', symbol: STATUS_SYMBOLS.idle },
  PUBLISHED: { label: 'Đã xuất bản', tone: 'success', symbol: STATUS_SYMBOLS.succeeded },
  ARCHIVED: { label: 'Đã lưu trữ', tone: 'warning', symbol: STATUS_SYMBOLS.ended },
};

/** The neutral fallback, for a state this build has no approved label for. */
export const UNKNOWN_GALLERY_STATUS_LABEL = 'Không xác định';

/**
 * Total by construction: accepts `unknown` and always returns a presentation.
 * A state the contract gains later degrades to the neutral fallback rather than
 * putting a raw English enum member on an otherwise Vietnamese page.
 */
export function presentGalleryStatus(status: unknown): GalleryStatusPresentation {
  const style = typeof status === 'string' ? GALLERY_STATUS_STYLES[status] : undefined;
  if (style === undefined) {
    return {
      token: 'UNKNOWN',
      label: UNKNOWN_GALLERY_STATUS_LABEL,
      tone: 'neutral',
      symbol: STATUS_SYMBOLS.idle,
      known: false,
    };
  }
  return { token: status as string, ...style, known: true };
}

/** The label alone, for prose that names a state inline. */
export function galleryStatusLabel(status: unknown): string {
  return presentGalleryStatus(status).label;
}
