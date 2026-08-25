'use client';

import { PRODUCTION_TRANSITION_COPY as COPY } from '../model/production-transition-copy';
import { TRANSITION_TARGET_OF, type ProductionJobAction } from '../model/production-job-actions';

interface ProductionTransitionEffectsProps {
  readonly action: ProductionJobAction;
  /** The state the job holds on the last authoritative read. */
  readonly fromStatus: string;
}

interface EffectRow {
  readonly subject: string;
  readonly from: string;
  readonly to: string;
  /** Tone of the destination token, so the direction of travel is legible. */
  readonly tone: 'neutral' | 'warning' | 'success' | 'error' | 'info';
}

/**
 * What the command does, as the confirmation frames draw it (`786:10`,
 * `786:46`, `786:80`, `786:120`).
 *
 * Every row is a statement about the *server's* transaction — job, order and
 * Catalog reservation move together or not at all — and none of them is a
 * prediction this screen computes. The order and reservation tokens are the
 * ones the contract documents for each command:
 *
 * - **start** consumes the reserved Catalog stock and moves the order to
 *   `IN_PRODUCTION`;
 * - **complete** moves the order to `PRODUCTION_COMPLETED` and touches no
 *   inventory, so no reservation row is drawn at all;
 * - **cancel** leaves the order's commercial state unchanged, and moves the
 *   reservation only when it was still reserved — from `STARTED` the consumed
 *   stock stays consumed, which the row states by naming the same token twice.
 */
function effectsOf(action: ProductionJobAction, fromStatus: string): readonly EffectRow[] {
  const job: EffectRow = {
    subject: COPY.common.rowJob,
    from: fromStatus,
    to: TRANSITION_TARGET_OF[action],
    tone: action === 'cancel' ? 'error' : action === 'complete' ? 'success' : 'warning',
  };

  if (action === 'start') {
    return [
      job,
      {
        subject: COPY.common.rowOrder,
        from: 'DEPOSIT_PAID',
        to: 'IN_PRODUCTION',
        tone: 'warning',
      },
      { subject: COPY.common.rowReservation, from: 'RESERVED', to: 'CONSUMED', tone: 'info' },
    ];
  }

  if (action === 'complete') {
    return [
      job,
      {
        subject: COPY.common.rowOrder,
        from: 'IN_PRODUCTION',
        to: 'PRODUCTION_COMPLETED',
        tone: 'success',
      },
    ];
  }

  const startedFrom = fromStatus === 'STARTED';
  return [
    job,
    {
      subject: COPY.common.rowReservation,
      from: startedFrom ? 'CONSUMED' : 'RESERVED',
      to: startedFrom ? 'CONSUMED' : 'RELEASED',
      tone: 'neutral',
    },
    {
      subject: COPY.common.rowOrder,
      from: COPY.common.orderUnchanged,
      to: COPY.common.orderUnchanged,
      tone: 'neutral',
    },
  ];
}

export function ProductionTransitionEffects({
  action,
  fromStatus,
}: ProductionTransitionEffectsProps) {
  return (
    <div className="job-effects" data-testid="production-transition-effects">
      <p className="job-effects__title">{COPY.common.effectsTitle}</p>
      <ul className="job-effects__list">
        {effectsOf(action, fromStatus).map((row) => (
          <li className="job-effects__row" key={row.subject}>
            <span className="job-effects__subject">{row.subject}</span>
            <span className="job-effects__from">{row.from}</span>
            <span className="job-effects__arrow" aria-hidden="true">
              →
            </span>
            <span className={`job-effects__to job-effects__to--${row.tone}`}>{row.to}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
