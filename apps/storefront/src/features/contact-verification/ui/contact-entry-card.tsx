'use client';

import { useId } from 'react';

import { CONTACT_KINDS, type ContactKind } from '../model/contact-draft';
import { CONTACT_FIELD_COPY, VERIFICATION_COPY } from '../model/verification-copy';
import { VerificationAlert } from './verification-alert';

/**
 * Contact entry (`623:3`), its invalid state (`623:27`), its submitting state
 * (`623:51`) and the rate-limited state that keeps the same card (`625:173`).
 *
 * One card for four frames because that is how they are drawn: the tabs, field,
 * button and caption are identical, and what changes is the field's error, the
 * button's label and whether an alert sits above the field.
 *
 * The contact-kind control is a **radio group**, not two buttons: it is a choice
 * between mutually exclusive options, so arrow-key navigation and the group
 * label come from the platform rather than from re-implemented key handling.
 */
interface ContactEntryCardProps {
  readonly contactKind: ContactKind;
  readonly contact: string;
  readonly invalid: boolean;
  readonly submitting: boolean;
  readonly rateLimited: boolean;
  readonly onContactKindChange: (kind: ContactKind) => void;
  readonly onContactChange: (contact: string) => void;
  readonly onSubmit: () => void;
}

export function ContactEntryCard({
  contactKind,
  contact,
  invalid,
  submitting,
  rateLimited,
  onContactKindChange,
  onContactChange,
  onSubmit,
}: ContactEntryCardProps) {
  const fieldId = useId();
  const helpId = `${fieldId}-help`;
  const errorId = `${fieldId}-error`;
  const field = CONTACT_FIELD_COPY[contactKind];

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

      {rateLimited ? (
        <VerificationAlert
          tone="warn"
          title={VERIFICATION_COPY.alerts.rateLimited.title}
          body={VERIFICATION_COPY.alerts.rateLimited.body}
        />
      ) : null}

      <fieldset className="contact-verification__tabs">
        <legend className="contact-verification__visually-hidden">
          {VERIFICATION_COPY.contactKind.legend}
        </legend>
        {CONTACT_KINDS.map((kind) => (
          <label
            key={kind}
            className={`contact-verification__tab${
              kind === contactKind ? ' contact-verification__tab--active' : ''
            }`}
          >
            <input
              className="contact-verification__visually-hidden"
              type="radio"
              name={`${fieldId}-kind`}
              value={kind}
              checked={kind === contactKind}
              disabled={submitting}
              onChange={() => onContactKindChange(kind)}
            />
            {VERIFICATION_COPY.contactKind[kind]}
          </label>
        ))}
      </fieldset>

      <div className="contact-verification__field">
        <label className="contact-verification__label" htmlFor={fieldId}>
          {field.label}
        </label>
        <input
          id={fieldId}
          className={`contact-verification__input${
            invalid ? ' contact-verification__input--invalid' : ''
          }`}
          // `type="email"`/`type="tel"` give the right mobile keyboard; validation
          // stays ours, because the browser's own bubble is neither the approved
          // copy nor associated with the field the way `634:141` requires.
          type={contactKind === 'EMAIL' ? 'email' : 'tel'}
          inputMode={contactKind === 'EMAIL' ? 'email' : 'tel'}
          autoComplete={contactKind === 'EMAIL' ? 'email' : 'tel'}
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
