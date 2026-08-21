'use client';

import { REQUEST_QUOTATION_COPY as COPY } from '../model/request-quotation-copy';
import type { ReadFailure } from '../model/request-quotation-failure';

/**
 * The bootstrap states that are not the workbench: loading (`686:3`), empty
 * (`686:62`) and unavailable (`686:104`).
 *
 * They live in one file because they are one decision — what the screen shows
 * before it can show a quotation — and keeping them together is what makes the
 * separation visible: the empty state is reachable only from a *successful*
 * read whose locator was null, and never while anything is still pending.
 */

/** `686:3` — the bootstrap skeleton. Never rendered beside an empty state. */
export function QuotationWorkbenchSkeleton() {
  return (
    <section
      className="request-quotation request-quotation--loading"
      data-testid="quotation-loading"
      aria-busy="true"
      aria-live="polite"
    >
      <p className="request-quotation__loading-label">{COPY.loading.label}</p>
      <div className="request-quotation__skeleton" aria-hidden="true">
        <span className="request-quotation__skeleton-bar request-quotation__skeleton-bar--wide" />
        <span className="request-quotation__skeleton-bar" />
        <span className="request-quotation__skeleton-bar" />
        <span className="request-quotation__skeleton-bar request-quotation__skeleton-bar--wide" />
      </div>
    </section>
  );
}

const READ_FAILURE_COPY: Readonly<Record<ReadFailure, string>> = {
  missing: COPY.error.missing,
  unauthenticated: COPY.error.unauthenticated,
  retryable: COPY.error.retryable,
};

interface UnavailableProps {
  readonly failure: ReadFailure;
  readonly heading?: string;
  readonly onRetry: () => void;
}

/**
 * `686:104` — a read failed.
 *
 * The classification alone picks the sentence. No server message, code, request
 * id, SQL or transport detail is rendered, and a retry is offered for every
 * band: even a terminal refusal leaves the operator a way to ask again rather
 * than a dead screen, and asking again is harmless.
 */
export function QuotationWorkbenchUnavailable({ failure, heading, onRetry }: UnavailableProps) {
  return (
    <section
      className="request-quotation request-quotation--error"
      data-testid="quotation-error"
      role="alert"
    >
      <h2 className="request-quotation__error-heading">{heading ?? COPY.error.heading}</h2>
      <p className="request-quotation__error-body">{READ_FAILURE_COPY[failure]}</p>
      <button className="request-quotation__button" type="button" onClick={onRetry}>
        {COPY.error.retry}
      </button>
    </section>
  );
}

interface EmptyProps {
  readonly onCreate: () => void;
  readonly disabled: boolean;
}

/**
 * `686:62` — the request has no quotation.
 *
 * Reached from exactly one condition: the request context read **succeeded** and
 * its `quotationId` locator was null. It is never reached from a pending
 * bootstrap and never from a failed history read, both of which have their own
 * state above.
 */
export function QuotationEmptyState({ onCreate, disabled }: EmptyProps) {
  return (
    <section className="request-quotation__empty" data-testid="quotation-empty">
      <h2 className="request-quotation__empty-heading">{COPY.empty.heading}</h2>
      <p className="request-quotation__empty-body">{COPY.empty.body}</p>
      <button
        className="request-quotation__button request-quotation__button--primary"
        type="button"
        onClick={onCreate}
        disabled={disabled}
      >
        {COPY.empty.action}
      </button>
    </section>
  );
}
