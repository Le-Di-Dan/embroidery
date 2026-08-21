'use client';

import Link from 'next/link';

import type { ReadFailure } from '../model/request-design-case-failure';
import { REQUEST_DESIGN_CASE_COPY as COPY } from '../model/request-design-case-copy';
import { ADMIN_REQUEST_DETAIL_ROUTE } from '../model/request-design-case-route';

/** `698:3` — the loading state, distinct from every other empty screen. */
export function DesignCaseLoading() {
  return (
    <section
      className="request-design-case__state"
      aria-busy="true"
      data-testid="design-case-loading"
    >
      <p role="status">{COPY.states.loading}</p>
    </section>
  );
}

interface DesignCaseErrorProps {
  readonly failure: ReadFailure;
  readonly onRetry: () => void;
}

/**
 * `698:63` — the load-error state.
 *
 * Four classifications, four sentences, and **no server string in any of them**.
 * The message, business code, SQL fragment, constraint name and request id are
 * all withheld: this is a private Admin endpoint, and none of them would help
 * the operator while every one of them is a disclosure.
 *
 * Retry is offered only where retrying could work. A request that does not
 * exist, one the operator may not read, and a design case that does not resolve
 * will each be refused identically next time — offering a button that cannot
 * help is worse than saying so.
 */
export function DesignCaseError({ failure, onRetry }: DesignCaseErrorProps) {
  const body =
    failure === 'missing'
      ? COPY.states.errorMissing
      : failure === 'unresolvable'
        ? COPY.states.errorUnresolvable
        : failure === 'unauthenticated'
          ? COPY.states.errorUnauthenticated
          : COPY.states.errorRetryable;

  return (
    <section className="request-design-case__state" role="alert" data-testid="design-case-error">
      <h2 className="request-design-case__state-title">{COPY.states.errorTitle}</h2>
      <p>{body}</p>
      {failure === 'retryable' ? (
        <button
          className="request-design-case__button"
          type="button"
          onClick={onRetry}
          data-testid="design-case-retry"
        >
          {COPY.states.retry}
        </button>
      ) : null}
    </section>
  );
}

interface DesignCaseGateProps {
  readonly requestId: string;
  /** True when `APP6-B06`'s own transition control is the operator's next step. */
  readonly awaitsTransition: boolean;
}

/**
 * `698:97` — the pre-digitizing gate.
 *
 * A truthful statement of what the server permits, not a disabled button that
 * waits for a `409`: `APP6-B08` authors a version only while the request is
 * `DIGITIZING` or `DESIGN_REVIEW`, so in every earlier state the workbench says
 * so and offers nothing.
 *
 * ### It does not duplicate `APP6-B06`'s control
 *
 * When the request is `QUOTE_ACCEPTED` the next step is the `DIGITIZING`
 * transition — and that command lives on the request detail screen, which
 * `APP6-D01` §7.3 makes its home. This gate **links there** rather than
 * reproducing it: a second control for one move would be a second authority for
 * it. There is no target selector here at all, and `DESIGN_REVIEW` and
 * `APPROVED` appear nowhere as things an operator could choose.
 */
export function DesignCaseGate({ requestId, awaitsTransition }: DesignCaseGateProps) {
  return (
    <section className="request-design-case__state" data-testid="design-case-gate">
      <h2 className="request-design-case__state-title">{COPY.gate.title}</h2>
      <p>{COPY.gate.body}</p>
      {awaitsTransition ? (
        <>
          <p>{COPY.gate.quoteAcceptedHint}</p>
          <Link
            className="request-design-case__button"
            href={ADMIN_REQUEST_DETAIL_ROUTE(requestId)}
          >
            {COPY.gate.goToRequest}
          </Link>
        </>
      ) : null}
    </section>
  );
}
