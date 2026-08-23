'use client';

import { useState } from 'react';

import { ORDER_DETAIL_COPY as COPY } from '../model/order-detail-copy';

interface LongTextValueProps {
  readonly value: string;
  /** Names what is being revealed, so the control is distinguishable in a list. */
  readonly label: string;
  readonly testId?: string;
}

/**
 * A stored value that may be long and unstructured — an observed bank memo above
 * all (`743:83`).
 *
 * ## Truncation is a **presentation** of a read-only value, never an edit
 *
 * `APP7-B04` puts no length bound on `observedTransferReference`, so a
 * reconciliation row can carry a whole sentence off a bank statement. In a table
 * that has to be shortened or the column becomes unreadable — but the value the
 * server holds is never altered, and the full text is always one click away.
 * Nothing on the *submitting* side truncates anything: the operator's text goes
 * to the server exactly as typed. This component only ever renders history.
 *
 * ## Keyboard-reachable, because a long reference is the thing operators check
 *
 * A real `<button>` with an accessible name that says what it reveals, per
 * `753:120`. The revealed text is selectable so it can be copied into a banking
 * portal, and it wraps rather than scrolling sideways inside its cell.
 *
 * A value short enough to show whole is shown whole, with no control at all: an
 * affordance that expands nothing is noise.
 */
const TRUNCATE_AT = 48;

export function LongTextValue({ value, label, testId }: LongTextValueProps) {
  const [revealed, setRevealed] = useState(false);
  const needsTruncation = value.length > TRUNCATE_AT;

  if (!needsTruncation) {
    return (
      <span
        className="order-long-text__value"
        {...(testId === undefined ? {} : { 'data-testid': testId })}
      >
        {value}
      </span>
    );
  }

  return (
    <span className="order-long-text">
      <span
        className="order-long-text__value"
        {...(testId === undefined ? {} : { 'data-testid': testId })}
      >
        {revealed ? value : `${value.slice(0, TRUNCATE_AT)}…`}
      </span>
      <button
        type="button"
        className="order-long-text__toggle"
        aria-expanded={revealed}
        aria-label={`${revealed ? COPY.history.hide : COPY.history.reveal}: ${label}`}
        onClick={() => setRevealed((current) => !current)}
      >
        {revealed ? COPY.history.hide : COPY.history.reveal}
      </button>
    </span>
  );
}
