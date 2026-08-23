'use client';

import { DepositAttemptResponseStatus, type DepositAttemptResponse } from '@embroidery/api-client';

import { SECURE_DEPOSIT_COPY as COPY } from '../model/secure-deposit-copy';
import { DepositNote } from './deposit-note';
import { DepositStatusPill } from './deposit-status-pill';

/**
 * `749:26` — the attempt is finished, and only a new one moves forward.
 *
 * ## The same attempt is never reset
 *
 * There is no control here that touches this attempt. The button opens a
 * **new** one, with a new idempotency key and an empty evidence set of its own,
 * which is what `APP7-B03`'s LC-16 retry means and what §22 requires. The note
 * says exactly that to the customer, because "start again" is otherwise easy to
 * read as "try this one again".
 *
 * ## The warning that costs money if it is missing
 *
 * A customer who already transferred against the previous instructions must not
 * transfer again. Nothing about a dead attempt stops a real transfer from
 * arriving at the bank — the reference and the account are still perfectly
 * valid there — so the only safeguard available to this screen is the sentence
 * telling them to call the workshop instead of paying twice.
 */
interface AttemptTerminalCardProps {
  readonly attempt: DepositAttemptResponse;
  readonly starting: boolean;
  readonly onStartNew: () => void;
}

export function AttemptTerminalCard({ attempt, starting, onStartNew }: AttemptTerminalCardProps) {
  const expired = attempt.status === DepositAttemptResponseStatus.EXPIRED;
  return (
    <section className="secure-deposit__card" aria-labelledby="secure-deposit-terminal">
      <DepositStatusPill tone="DANGER" label={COPY.terminal.badge} />
      <h2 className="secure-deposit__card-title" id="secure-deposit-terminal">
        {expired ? COPY.terminal.expiredTitle : COPY.terminal.title}
      </h2>
      <p className="secure-deposit__body">{COPY.terminal.body}</p>
      <DepositNote tone="WARNING">{COPY.terminal.warning}</DepositNote>
      <DepositNote tone="INFO">{COPY.terminal.note}</DepositNote>
      <button
        type="button"
        className="secure-deposit__button secure-deposit__button--primary"
        onClick={onStartNew}
        disabled={starting}
      >
        {starting ? COPY.preAttempt.starting : COPY.terminal.action}
      </button>
    </section>
  );
}
