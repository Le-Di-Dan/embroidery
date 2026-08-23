import type { DepositAttemptResponse } from '@embroidery/api-client';

import { SECURE_DEPOSIT_COPY as COPY } from '../model/secure-deposit-copy';
import { DepositStatusPill } from './deposit-status-pill';

/**
 * `751:174` — a stored attempt value this phase does not produce.
 *
 * `PROCESSING`, `REFUNDED` and `PARTIALLY_REFUNDED` are in the contract's
 * enumeration and APP7 creates none of them; `SUCCEEDED` reaches here only in
 * the window before the reconciling read confirms the obligation. The approved
 * rule for meeting any of them is to **show the code neutrally rather than guess
 * at its meaning** — a `default:` that fell through to the instructions would
 * invent a meaning, and one that fell through to the terminal card would invent
 * a worse one and invite a second transfer.
 *
 * The raw code is displayed because it is the one thing that is certainly true,
 * and it is what the workshop will ask for if the customer calls. It is an
 * attempt status from a published enumeration, not an identifier, so nothing
 * about the customer or their order leaks by printing it.
 */
interface AttemptUndrawnCardProps {
  readonly attempt: DepositAttemptResponse;
}

export function AttemptUndrawnCard({ attempt }: AttemptUndrawnCardProps) {
  return (
    <section className="secure-deposit__card" aria-labelledby="secure-deposit-undrawn">
      <DepositStatusPill tone="NEUTRAL" label={attempt.status} />
      <h2 className="secure-deposit__card-title" id="secure-deposit-undrawn">
        {COPY.undrawn.title}
      </h2>
      <p className="secure-deposit__body">{COPY.undrawn.body}</p>
      <dl className="secure-deposit__facts">
        <div className="secure-deposit__fact">
          <dt className="secure-deposit__fact-label">{COPY.undrawn.codeLabel}</dt>
          <dd className="secure-deposit__fact-value">{attempt.status}</dd>
        </div>
      </dl>
    </section>
  );
}
