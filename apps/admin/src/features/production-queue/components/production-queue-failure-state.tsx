'use client';

import Link from 'next/link';

import { LOGIN_ROUTE } from '../../../config/routes';
import { PRODUCTION_QUEUE_COPY } from '../model/production-queue-copy';
import type { ProductionQueueFailure } from '../model/production-queue-failure';

interface ProductionQueueFailureStateProps {
  readonly failure: ProductionQueueFailure;
  readonly onRetry: () => void;
  readonly onBackToFirstPage: () => void;
}

/**
 * Why the queue could not be read (`782:241`, `782:247`, `782:253`).
 *
 * Each state carries a Vietnamese title and an action sentence; the technical
 * code rides inside the body as an engineer-facing annotation, never as the
 * only copy an operator gets. Nothing here renders the server's `message`: the
 * classification picks the sentence, so no server prose, SQL fragment or stack
 * can reach the screen.
 *
 * The offered action follows what the failure actually permits:
 *
 * - **cursorRejected** — the server will refuse that cursor however many times
 *   it is offered, so the only honest action is reading again from the first
 *   page, stated as such rather than the list silently restarting behind the
 *   operator's back.
 * - **unauthenticated** — nothing but signing in again will help, so no retry
 *   is offered. There is none that could succeed.
 * - **retryable** — the sanitised platform failure, the one band where a second
 *   attempt can genuinely differ. The body states that nothing was changed,
 *   because a failed read changes nothing and an operator should not be left
 *   wondering.
 *
 * A failure is never rendered as an empty queue. "Chưa có lệnh sản xuất nào"
 * while nothing is known would be a claim about the workshop this screen cannot
 * make.
 */
export function ProductionQueueFailureState({
  failure,
  onRetry,
  onBackToFirstPage,
}: ProductionQueueFailureStateProps) {
  if (failure === 'cursorRejected') {
    return (
      <section
        className="production-panel production-panel--warning"
        role="alert"
        data-testid="production-queue-error"
      >
        <p className="production-panel__title">{PRODUCTION_QUEUE_COPY.states.cursorErrorTitle}</p>
        <p className="production-panel__body">{PRODUCTION_QUEUE_COPY.states.cursorErrorBody}</p>
        <button
          type="button"
          className="production-panel__action"
          data-testid="production-queue-first-page"
          onClick={onBackToFirstPage}
        >
          {PRODUCTION_QUEUE_COPY.actions.backToFirstPage}
        </button>
      </section>
    );
  }

  if (failure === 'unauthenticated') {
    return (
      <section
        className="production-panel production-panel--warning"
        role="alert"
        data-testid="production-queue-error"
      >
        <p className="production-panel__title">
          {PRODUCTION_QUEUE_COPY.states.unauthenticatedTitle}
        </p>
        <p className="production-panel__body">{PRODUCTION_QUEUE_COPY.states.unauthenticatedBody}</p>
        <Link className="production-panel__action" href={LOGIN_ROUTE}>
          {PRODUCTION_QUEUE_COPY.actions.signIn}
        </Link>
      </section>
    );
  }

  return (
    <section
      className="production-panel production-panel--error"
      role="alert"
      data-testid="production-queue-error"
    >
      <p className="production-panel__title">{PRODUCTION_QUEUE_COPY.states.errorTitle}</p>
      <p className="production-panel__body">{PRODUCTION_QUEUE_COPY.states.errorBody}</p>
      <button
        type="button"
        className="production-panel__action"
        data-testid="production-queue-retry"
        onClick={onRetry}
      >
        {PRODUCTION_QUEUE_COPY.actions.retry}
      </button>
    </section>
  );
}
