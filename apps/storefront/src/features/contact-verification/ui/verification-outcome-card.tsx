'use client';

import Link from 'next/link';

import { VERIFICATION_COPY } from '../model/verification-copy';
import { VerificationAlert, type AlertTone } from './verification-alert';

/**
 * The terminal cards: expired (`625:106`), lockout (`625:140`), success
 * (`625:193`) and recoverable error (`625:211`).
 *
 * One component because the four frames share a shape — a card title, an alert,
 * an optional destination line and one primary action — and differ only in tone,
 * copy and what the action does. Each frame's **title is distinct from its
 * alert title**, which is why both are rendered: `625:112` is "Mã đã hết hạn"
 * above an alert reading "Mã không còn hiệu lực".
 *
 * The expired and lockout frames keep showing the masked destination, because
 * both offer to send a new code and the customer needs to see where it will go.
 * The success frame shows it as confirmation of what was verified. All three
 * render the server's mask, never a locally derived one.
 *
 * Nothing here creates an account, a profile or a request: `APP5` owns whatever
 * follows a verified contact, and the approved package draws no handoff beyond
 * this button.
 */
export type OutcomeKind = 'EXPIRED' | 'LOCKED' | 'SUCCESS' | 'RECOVERABLE_ERROR';

const TONE: Readonly<Record<OutcomeKind, AlertTone>> = {
  EXPIRED: 'warn',
  LOCKED: 'error',
  SUCCESS: 'success',
  RECOVERABLE_ERROR: 'error',
};

const ALERT: Readonly<Record<OutcomeKind, { title: string; body: string }>> = {
  EXPIRED: VERIFICATION_COPY.alerts.expired,
  LOCKED: VERIFICATION_COPY.alerts.locked,
  SUCCESS: VERIFICATION_COPY.alerts.success,
  RECOVERABLE_ERROR: VERIFICATION_COPY.alerts.recoverableError,
};

interface VerificationOutcomeCardProps {
  readonly kind: OutcomeKind;
  /** Absent when no challenge was ever opened (a refused first issue). */
  readonly recipientMasked: string | undefined;
  readonly onAction: () => void;
  /**
   * Renders the action as a link instead of a button.
   *
   * Used by the success frame alone. `APP5` owns what follows a verified
   * contact and this checkpoint may not invent it, so the approved `Tiếp tục`
   * control leads out of the flow rather than to a screen S01 would have had to
   * make up (`FU-APP4-S01-SUCCESS-HANDOFF-01`).
   */
  readonly actionHref?: string;
}

export function VerificationOutcomeCard({
  kind,
  recipientMasked,
  onAction,
  actionHref,
}: VerificationOutcomeCardProps) {
  const outcome = VERIFICATION_COPY.outcome[kind];
  const alert = ALERT[kind];
  const showsDestination = recipientMasked !== undefined && kind !== 'RECOVERABLE_ERROR';

  return (
    <section className="contact-verification__card">
      <h2 className="contact-verification__title">{outcome.title}</h2>
      <VerificationAlert tone={TONE[kind]} title={alert.title} body={alert.body} />

      {showsDestination && outcome.destinationLead !== undefined ? (
        <p className="contact-verification__body">{outcome.destinationLead}</p>
      ) : null}
      {showsDestination ? (
        <p className="contact-verification__destination">{recipientMasked}</p>
      ) : null}

      {actionHref === undefined ? (
        <button className="contact-verification__submit" type="button" onClick={onAction}>
          {outcome.action}
        </button>
      ) : (
        <Link className="contact-verification__submit" href={actionHref}>
          {outcome.action}
        </Link>
      )}

      {kind === 'SUCCESS' ? (
        <p className="contact-verification__caption">{VERIFICATION_COPY.successCaption}</p>
      ) : null}
    </section>
  );
}
