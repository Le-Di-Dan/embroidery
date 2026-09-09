'use client';

import { useId } from 'react';

import { VERIFICATION_COPY } from '../model/verification-copy';
import type { VerificationUiState } from '../model/verification-state';
import { VerificationAlert } from './verification-alert';

/**
 * Contact entry (`623:3`), its invalid state (`623:27`), its submitting state
 * (`623:51`) and the rate-limited state that keeps the same card (`625:173`).
 *
 * One card for those frames because that is how they are drawn: the field,
 * button and caption are identical, and what changes is the field's error, the
 * button's label and whether an alert sits above the field.
 *
 * ## There is no contact-kind control (`APP12-N01.S01`)
 *
 * The approved frames draw an EMAIL/PHONE radio group above the field, and this
 * card used to render it. `CUSTOMER_OTP_CHANNEL = EMAIL_ONLY` retired it: the
 * server refuses a phone challenge, so a chooser could only offer an option
 * that fails. The group is gone rather than disabled or hidden — a hidden radio
 * is still a control, still focusable in some assistive-technology modes, and
 * still a `name` a native form submission could write into a URL.
 *
 * The departure from the approved design is deliberate and recorded as
 * `FU-APP12-N01-S01-02`: the frames predate the locked channel decision, and
 * `APP12-N01`'s product authority outranks them (`CLAUDE.md` §2).
 *
 * What removing it also removes: the group's `<legend>`, so nothing is left as
 * an orphaned label, and the field's own `<label>` is now the only labelling
 * relationship on the card.
 */

/** The one-off notice above the field, when the server refused the request. */
export type ContactEntryAlert = 'RATE_LIMITED' | 'CHANNEL_UNSUPPORTED';

/**
 * Which notice, if any, belongs above the field for the frame on screen.
 *
 * One mapping shared by all seven surfaces that mount this card, so a state
 * that must raise an alert cannot be silently dropped by the one dialog whose
 * author did not know about it — which is precisely how the previous
 * `rateLimited` boolean would have absorbed `CHANNEL_UNSUPPORTED`.
 */
export function contactEntryAlertOf(uiState: VerificationUiState): ContactEntryAlert | undefined {
  if (uiState === 'RATE_LIMITED') return 'RATE_LIMITED';
  if (uiState === 'CHANNEL_UNSUPPORTED') return 'CHANNEL_UNSUPPORTED';
  return undefined;
}

interface ContactEntryCardProps {
  readonly contact: string;
  readonly invalid: boolean;
  readonly submitting: boolean;
  readonly alert: ContactEntryAlert | undefined;
  readonly onContactChange: (contact: string) => void;
  readonly onSubmit: () => void;
}

const ALERT_COPY = {
  RATE_LIMITED: VERIFICATION_COPY.alerts.rateLimited,
  CHANNEL_UNSUPPORTED: VERIFICATION_COPY.alerts.channelUnsupported,
} as const;

export function ContactEntryCard({
  contact,
  invalid,
  submitting,
  alert,
  onContactChange,
  onSubmit,
}: ContactEntryCardProps) {
  const fieldId = useId();
  const helpId = `${fieldId}-help`;
  const errorId = `${fieldId}-error`;
  const field = VERIFICATION_COPY.emailField;
  const alertCopy = alert === undefined ? undefined : ALERT_COPY[alert];

  return (
    <form
      className="contact-verification__card"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      noValidate
    >
      <h2 className="contact-verification__title">{VERIFICATION_COPY.contactEntry.title}</h2>
      <p className="contact-verification__body">{VERIFICATION_COPY.contactEntry.body}</p>

      {alertCopy === undefined ? null : (
        <VerificationAlert tone="warn" title={alertCopy.title} body={alertCopy.body} />
      )}

      <div className="contact-verification__field">
        <label className="contact-verification__label" htmlFor={fieldId}>
          {field.label}
        </label>
        <input
          id={fieldId}
          className={`contact-verification__input${
            invalid ? ' contact-verification__input--invalid' : ''
          }`}
          // `type="email"` gives the right mobile keyboard; validation stays
          // ours, because the browser's own bubble is neither the approved copy
          // nor associated with the field the way `634:141` requires.
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={field.placeholder}
          value={contact}
          disabled={submitting}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : helpId}
          onChange={(event) => onContactChange(event.target.value)}
        />
        {invalid ? (
          <p id={errorId} className="contact-verification__error" role="alert">
            {field.invalid}
          </p>
        ) : (
          <p id={helpId} className="contact-verification__help">
            {field.help}
          </p>
        )}
      </div>

      <button className="contact-verification__submit" type="submit" disabled={submitting}>
        {submitting
          ? VERIFICATION_COPY.contactEntry.submitting
          : VERIFICATION_COPY.contactEntry.submit}
      </button>
      <p className="contact-verification__caption">{VERIFICATION_COPY.contactEntry.caption}</p>
    </form>
  );
}
