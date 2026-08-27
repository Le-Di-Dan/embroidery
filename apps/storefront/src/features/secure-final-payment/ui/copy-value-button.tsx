'use client';

import { useCallback, useRef, useState } from 'react';

import { SECURE_FINAL_PAYMENT_COPY as COPY } from '../model/final-payment-copy';

/**
 * One copy control, for one exact server value (`816:41`, `816:47`, `816:59`).
 *
 * ## The value is copied, never adjusted
 *
 * What reaches the clipboard is the string this component was handed — the
 * server's own amount digits, its own transfer reference, its own account
 * number. Nothing here trims, upper-cases, strips spaces or re-groups digits.
 * The transfer reference in particular is fifteen characters the server derived
 * from the order code and the `RM` obligation kind, and a client that "tidied"
 * it would produce a transfer the workshop cannot match to a balance — the `RM`
 * suffix is the only thing distinguishing it from the deposit memo on the same
 * order.
 *
 * ## Copying is not a mutation
 *
 * No request is made and no state moves. That is worth stating because the
 * control sits inside a payment screen where almost everything else is guarded:
 * this one is safe to press as often as the customer likes.
 *
 * ## Accessibility
 *
 * The button's accessible name says *what* it copies — "Sao chép số tài khoản",
 * not "Sao chép" — because three of them appear on one screen and a screen
 * reader tabbing between them would otherwise hear the same word three times.
 * Success is announced through a polite live region rather than by changing an
 * icon's colour, and the visible short label stays "Sao chép" so the approved
 * layout is unchanged.
 *
 * A clipboard that refuses — an insecure context, a denied permission, an
 * embedded browser without the API — reports the failure and tells the customer
 * they can select the value by hand. It never fails silently, because a copy
 * button that appears to work is worse than one that says it did not.
 */
interface CopyValueButtonProps {
  /** The exact string to place on the clipboard. */
  readonly value: string;
  /** The accessible name, naming the field. */
  readonly label: string;
  /** What the live region says once it is done. */
  readonly doneMessage: string;
}

export function CopyValueButton({ value, label, doneMessage }: CopyValueButtonProps) {
  const [feedback, setFeedback] = useState('');
  const valueRef = useRef(value);
  valueRef.current = value;

  const onCopy = useCallback(async () => {
    const clipboard = navigator.clipboard;
    if (clipboard === undefined) {
      setFeedback(COPY.copy.failed);
      return;
    }
    try {
      await clipboard.writeText(valueRef.current);
      setFeedback(doneMessage);
    } catch {
      setFeedback(COPY.copy.failed);
    }
  }, [doneMessage]);

  return (
    <span className="secure-final-payment__copy">
      <button
        type="button"
        className="secure-final-payment__copy-button"
        aria-label={label}
        onClick={() => {
          void onCopy();
        }}
      >
        <span className="secure-final-payment__copy-symbol" aria-hidden="true">
          ⧉
        </span>
        {COPY.copy.short}
      </button>
      <span className="secure-final-payment__visually-hidden" aria-live="polite">
        {feedback}
      </span>
    </span>
  );
}
