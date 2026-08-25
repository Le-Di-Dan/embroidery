'use client';

import Link from 'next/link';

import { LOGIN_ROUTE } from '../../../config/routes';
import { ADMIN_PRODUCTION_ROUTE } from '../../production-queue';
import { PRODUCTION_JOB_COPY as COPY } from '../model/production-job-copy';
import type { ProductionJobReadFailure } from '../model/production-job-failure';

interface ProductionJobFailureStateProps {
  readonly failure: ProductionJobReadFailure;
  readonly onRetry: () => void;
}

/**
 * Why the job could not be shown (`787:3` rows 9 and 11 for the read side).
 *
 * Each state carries a Vietnamese title and an action sentence; the technical
 * code rides inside the body as an engineer-facing annotation, never as the only
 * copy an operator gets. Nothing here renders the server's `message`: the
 * classification picks the sentence, so no server prose, SQL fragment or stack
 * can reach the screen.
 *
 * The offered action follows what the failure permits:
 *
 * - **notFound** — the job does not exist at that address, so the only useful
 *   move is back to the queue. A retry is offered beside it because the answer
 *   may be stale rather than the id wrong.
 * - **unauthenticated** — nothing but signing in again will help, so no retry is
 *   offered: none could succeed.
 * - **forbidden** — the request reached the API from a source it does not
 *   accept; repeating it from the same place would be refused identically.
 * - **retryable** — the sanitised platform failure, the one band where a second
 *   attempt can genuinely differ. It states that nothing was changed, because a
 *   failed `GET` changes nothing.
 *
 * A failure is never rendered as an empty job. A specification card full of
 * dashes while nothing is known would be a claim about what is being produced
 * that this screen cannot make.
 */
export function ProductionJobFailureState({ failure, onRetry }: ProductionJobFailureStateProps) {
  if (failure === 'unauthenticated') {
    return (
      <section
        className="job-panel job-panel--warning"
        role="alert"
        data-testid="production-job-error"
      >
        <p className="job-panel__title">{COPY.states.unauthenticatedTitle}</p>
        <p className="job-panel__body">{COPY.states.unauthenticatedBody}</p>
        <Link className="job-panel__action" href={LOGIN_ROUTE}>
          {COPY.states.signIn}
        </Link>
      </section>
    );
  }

  if (failure === 'forbidden') {
    return (
      <section
        className="job-panel job-panel--error"
        role="alert"
        data-testid="production-job-error"
      >
        <p className="job-panel__title">{COPY.states.forbiddenTitle}</p>
        <p className="job-panel__body">{COPY.states.forbiddenBody}</p>
      </section>
    );
  }

  if (failure === 'notFound') {
    return (
      <section
        className="job-panel job-panel--error"
        role="alert"
        data-testid="production-job-error"
      >
        <p className="job-panel__title">{COPY.states.notFoundTitle}</p>
        <p className="job-panel__body">{COPY.states.notFoundBody}</p>
        <div className="job-panel__actions">
          <Link className="job-panel__action" href={ADMIN_PRODUCTION_ROUTE}>
            {COPY.states.backToQueue}
          </Link>
          <button
            type="button"
            className="job-panel__action"
            data-testid="production-job-retry"
            onClick={onRetry}
          >
            {COPY.states.retry}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="job-panel job-panel--error" role="alert" data-testid="production-job-error">
      <p className="job-panel__title">{COPY.states.errorTitle}</p>
      <p className="job-panel__body">{COPY.states.errorBody}</p>
      <button
        type="button"
        className="job-panel__action"
        data-testid="production-job-retry"
        onClick={onRetry}
      >
        {COPY.states.retry}
      </button>
    </section>
  );
}
