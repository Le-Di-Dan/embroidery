'use client';

import { PRODUCTION_TRANSITION_COPY as COPY } from '../model/production-transition-copy';
import type { ProductionJobAction } from '../model/production-job-actions';

interface ProductionTransitionNotesProps {
  readonly action: ProductionJobAction;
  /** The state the job holds on the last authoritative read. */
  readonly fromStatus: string;
  /** True when the order has no Catalog line at all (`required = false`). */
  readonly customerOwnedOnly: boolean;
}

interface Note {
  readonly title: string;
  readonly body: string;
  readonly tone: 'plain' | 'warning' | 'error';
}

/**
 * The standing notes each confirmation carries (`786:25`…`786:33`,
 * `786:56`…`786:64`, `786:75`…`786:97`, `786:115`…`786:137`).
 *
 * These are the load-bearing sentences of the whole checkpoint, so they are
 * assembled in one place where they can be read together:
 *
 * - **start** states that reserved Catalog stock is consumed and that the step
 *   is one-way, that the server re-decides legality at the moment of the click
 *   and may refuse, and — for a customer-owned-only order — that consuming
 *   nothing is normal rather than a failure.
 * - **complete** states that no inventory moves and that APP8 stops at
 *   `PRODUCTION_COMPLETED`: remaining payment, shipping and settlement belong to
 *   a later phase and get no control here, before or after success.
 * - **cancel from PLANNED** states that this is the production job and not the
 *   customer order — no `CANCELLING`, no refund, no payout — and that a hold
 *   still standing is released.
 * - **cancel from STARTED** states that consumed stock is **not** restored, and
 *   that returning it would be a separate audited inventory adjustment this
 *   screen does not offer.
 */
function notesOf(
  action: ProductionJobAction,
  fromStatus: string,
  customerOwnedOnly: boolean,
): readonly Note[] {
  if (action === 'start') {
    return [
      { title: COPY.start.consumeTitle, body: COPY.start.consumeBody, tone: 'warning' },
      { title: COPY.start.refusalTitle, body: COPY.start.refusalBody, tone: 'plain' },
      ...(customerOwnedOnly
        ? [{ title: COPY.start.copTitle, body: COPY.start.copBody, tone: 'plain' as const }]
        : []),
    ];
  }

  if (action === 'complete') {
    return [
      { title: COPY.complete.noInventoryTitle, body: COPY.complete.noInventoryBody, tone: 'plain' },
      { title: COPY.complete.stopTitle, body: COPY.complete.stopBody, tone: 'plain' },
      { title: COPY.complete.refusalTitle, body: COPY.complete.refusalBody, tone: 'plain' },
    ];
  }

  if (fromStatus === 'STARTED') {
    return [
      { title: COPY.cancel.noRestoreTitle, body: COPY.cancel.noRestoreBody, tone: 'error' },
      {
        title: COPY.cancel.stillNotOrderTitle,
        body: COPY.cancel.stillNotOrderBody,
        tone: 'warning',
      },
    ];
  }

  return [
    { title: COPY.cancel.scopeTitle, body: COPY.cancel.scopeBody, tone: 'error' },
    { title: COPY.cancel.releaseTitle, body: COPY.cancel.releaseBody, tone: 'plain' },
  ];
}

export function ProductionTransitionNotes({
  action,
  fromStatus,
  customerOwnedOnly,
}: ProductionTransitionNotesProps) {
  return (
    <div className="job-notes" data-testid="production-transition-notes">
      {notesOf(action, fromStatus, customerOwnedOnly).map((note) => (
        <div className={`job-note job-note--${note.tone}`} key={note.title}>
          <p className="job-note__title">{note.title}</p>
          <p className="job-note__body">{note.body}</p>
        </div>
      ))}
    </div>
  );
}

/** The three standing notes of the submitting state (`786:189`…`786:197`). */
export function ProductionSubmittingNotes() {
  return (
    <div className="job-notes" data-testid="production-transition-submitting">
      <div className="job-note job-note--info">
        <p className="job-note__title">{COPY.common.submittingLockTitle}</p>
        <p className="job-note__body">{COPY.common.submittingLockBody}</p>
      </div>
      <div className="job-note job-note--plain">
        <p className="job-note__title">{COPY.common.submittingDropTitle}</p>
        <p className="job-note__body">{COPY.common.submittingDropBody}</p>
      </div>
      <div className="job-note job-note--plain">
        <p className="job-note__title">{COPY.common.submittingOptimisticTitle}</p>
        <p className="job-note__body">{COPY.common.submittingOptimisticBody}</p>
      </div>
    </div>
  );
}
