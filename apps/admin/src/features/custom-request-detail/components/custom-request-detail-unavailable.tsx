'use client';

import Link from 'next/link';

import { ADMIN_REQUESTS_ROUTE } from '../../custom-request-queue';
import { CUSTOM_REQUEST_DETAIL_COPY as COPY } from '../model/custom-request-detail-copy';
import type { DetailFailure } from '../model/custom-request-detail-failure';

interface CustomRequestDetailUnavailableProps {
  readonly failure: DetailFailure;
  readonly onRetry: () => void;
}

/**
 * The two states in which there is no request to render
 * (`FIG-APP5-A02-DETAIL-DESKTOP-NOTFOUND`, `667:30`).
 *
 * `missing` and `retryable` are told apart because the advice differs: a request
 * that does not exist will not appear on a retry, and a dependency failure may.
 * What is *not* told apart is why it is missing — "không tồn tại hoặc không
 * thuộc quyền xem của bạn" is one sentence covering both, because splitting it
 * would tell an operator whose session cannot read a request that the request is
 * nevertheless real.
 *
 * A 401 renders nothing of its own. The Admin shell owns session expiry and
 * shows its approved modal; a second, competing "please log in" panel here would
 * be a screen arguing with the shell about what happened.
 */
export function CustomRequestDetailUnavailable({
  failure,
  onRetry,
}: CustomRequestDetailUnavailableProps) {
  const missing = failure === 'missing';

  return (
    <section className="request-detail request-detail--unavailable">
      <div
        className="request-detail__failure"
        role="alert"
        data-testid={missing ? 'request-detail-not-found' : 'request-detail-error'}
      >
        <h1 className="request-detail__failure-title">
          {missing ? COPY.states.notFoundTitle : COPY.states.errorTitle}
        </h1>
        {/* Bounded copy: the classification picks the sentence, so no server
            message, error code, SQL fragment or stack reaches the operator. */}
        <p className="request-detail__failure-body">
          {missing ? COPY.states.notFoundBody : COPY.states.errorBody}
        </p>
        <div className="request-detail__failure-actions">
          {missing ? null : (
            <button
              type="button"
              className="request-detail__action"
              data-testid="request-detail-retry"
              onClick={onRetry}
            >
              {COPY.states.retry}
            </button>
          )}
          <Link className="request-detail__link" href={ADMIN_REQUESTS_ROUTE}>
            {COPY.page.backToQueue}
          </Link>
        </div>
      </div>
    </section>
  );
}
