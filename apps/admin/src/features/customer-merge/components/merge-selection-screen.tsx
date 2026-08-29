'use client';

/**
 * `/support/customer-access/merge` — choosing the pair and opening the case.
 *
 * The approved selection frames (`835:3` empty, `835:82` both resolved,
 * `840:3` same customer, `840:19` open refused).
 *
 * ### There is no way in here except two exact contacts
 *
 * No customer list, no directory, no duplicate-candidate browser, no bulk
 * selection and no merge queue — the API publishes no operation that could serve
 * any of them, and the design draws none. Discovery is the operator's own
 * knowledge of two contacts, resolved one slot at a time.
 *
 * ### Opening moves nothing, and the screen says so
 *
 * The note sits beside the submit button rather than in a tooltip, because the
 * whole safety property of this workflow is that the decision and the execution
 * are two separate acts by the same person.
 *
 * ### The same-customer guard blocks locally and defers globally
 *
 * When both slots resolve to one Customer the open action is disabled and the
 * approved explanation is shown. `APP10-B02` refuses the pair itself; this guard
 * only avoids spending a request to be told what both cards already show, and
 * nothing here sends a knowingly invalid open to harvest an error message.
 */
import { useState } from 'react';
import Link from 'next/link';

import { ADMIN_CUSTOMER_ACCESS_ROUTE } from '../../customer-access-support';
import { useOpenMergeCase } from '../hooks/use-open-merge-case';
import { useParticipantSelection } from '../hooks/use-participant-selection';
import { CUSTOMER_MERGE_COPY } from '../model/customer-merge-copy';
import { MERGE_REASON_MAX_LENGTH } from '../model/merge-reason';
import { ParticipantSlot } from './participant-slot';

const COPY = CUSTOMER_MERGE_COPY;

const OPEN_FAILURE_COPY = {
  validation: COPY.openFailure.validation,
  'participant-missing': COPY.openFailure.participantMissing,
  conflict: COPY.openFailure.conflict,
  unauthenticated: COPY.openFailure.unauthenticated,
  forbidden: COPY.openFailure.forbidden,
  generic: COPY.openFailure.generic,
} as const;

const PROBLEM_COPY = {
  blank: COPY.open.reasonBlank,
  'too-long': COPY.open.reasonTooLong,
} as const;

export function MergeSelectionScreen() {
  const selection = useParticipantSelection();
  const open = useOpenMergeCase();
  const [reason, setReason] = useState('');

  const blocked = selection.sameCustomer;
  const canSubmit = selection.bothChosen && !blocked && !open.running;

  return (
    <section className="customer-merge">
      <header className="customer-merge__header">
        <h1 className="customer-merge__title">{COPY.page.title}</h1>
        <p className="customer-merge__subtitle">{COPY.page.subtitle}</p>
        <Link className="customer-merge__back" href={ADMIN_CUSTOMER_ACCESS_ROUTE}>
          {COPY.page.backToSupport}
        </Link>
      </header>

      <h2 className="customer-merge__section-title">{COPY.selection.heading}</h2>
      <p className="customer-merge__note">{COPY.selection.intro}</p>

      <div className="customer-merge__slots">
        <ParticipantSlot
          role="survivor"
          customerId={selection.survivorCustomerId}
          busy={selection.resolving === 'survivor'}
          failure={selection.failure.survivor}
          onResolve={(kind, contact) => {
            selection.resolve('survivor', kind, contact);
          }}
          onClear={() => {
            selection.clear('survivor');
          }}
        />
        <ParticipantSlot
          role="loser"
          customerId={selection.loserCustomerId}
          busy={selection.resolving === 'loser'}
          failure={selection.failure.loser}
          onResolve={(kind, contact) => {
            selection.resolve('loser', kind, contact);
          }}
          onClear={() => {
            selection.clear('loser');
          }}
        />
      </div>

      {blocked ? (
        <p className="customer-merge__error" role="alert" data-testid="merge-same-customer">
          {COPY.selection.sameCustomer}
        </p>
      ) : null}

      <section className="customer-merge__open" aria-labelledby="merge-open-heading">
        <h2 className="customer-merge__section-title" id="merge-open-heading">
          {COPY.open.heading}
        </h2>
        <label className="admin-field__label" htmlFor="merge-open-reason">
          {COPY.open.reasonLabel}
        </label>
        <textarea
          id="merge-open-reason"
          className="customer-merge__reason"
          data-testid="merge-open-reason"
          value={reason}
          rows={3}
          maxLength={MERGE_REASON_MAX_LENGTH}
          disabled={open.running}
          aria-describedby="merge-open-reason-hint"
          aria-invalid={open.problem !== null}
          onChange={(event) => {
            setReason(event.target.value);
            if (open.problem !== null) open.clearProblem();
          }}
        />
        <p className="customer-merge__hint" id="merge-open-reason-hint">
          {COPY.open.reasonHint}
        </p>
        {open.problem === null ? null : (
          <p className="customer-merge__error" role="alert" data-testid="merge-open-problem">
            {PROBLEM_COPY[open.problem]}
          </p>
        )}

        <button
          type="button"
          className="customer-merge__primary"
          data-testid="merge-open-submit"
          disabled={!canSubmit}
          onClick={() => {
            if (selection.survivorCustomerId === null || selection.loserCustomerId === null) return;
            open.submit(selection.survivorCustomerId, selection.loserCustomerId, reason);
          }}
        >
          {open.running ? COPY.open.submitting : COPY.open.submit}
        </button>
        <p className="customer-merge__note">{COPY.open.nothingMovedNote}</p>

        {open.failure === null ? null : (
          <p className="customer-merge__error" role="alert" data-testid="merge-open-failure">
            {OPEN_FAILURE_COPY[open.failure]}
          </p>
        )}
      </section>
    </section>
  );
}
