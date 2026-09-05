'use client';

/**
 * `/support/customer-access/merge/{caseId}` — the authoritative merge case.
 *
 * ### Everything on this screen comes from `caseId`
 *
 * Nothing is carried over from the selection screen, which is what makes a
 * direct visit and a browser refresh behave identically to arriving from an
 * open. The case id in the path is an opaque identifier and grants nothing on
 * its own: `APP10-B02` and `APP10-B03` re-check the Admin session on every
 * request.
 *
 * ### Three server states, and no fourth invented one
 *
 * `REQUESTED`, `EXECUTED`, `REJECTED` — the whole published lifecycle. There is
 * no local `APPROVED`, `READY`, `PREVIEWED` or `CONFIRMED`: a dialog being open
 * is a dialog being open, and it is never rendered as a state of the case. After
 * either decision the case is **re-read** and the screen renders what came back.
 *
 * ### The preview is a REQUESTED-only surface
 *
 * `consequencePreview` is recomputed from current rows on every read, including
 * for a decided case — so after an execution it describes what is live *now*,
 * which is close to nothing, and after a rejection it describes a merge that
 * never happened. Showing either beside a decided status would relabel a fresh
 * reading as a record of what moved. `FIG-APP10-A02-PREVIEW-SEMANTICS` forbids
 * exactly that, and the completed state says in place why no figures appear.
 *
 * ### The completed state is deliberately small
 *
 * State, case reference, both masked cards, the decision instant, and a way
 * back. No merge-event timeline — `customer_merge_events` is written by
 * `APP10-B03` and published by no HTTP operation — and no unmerge, which does
 * not exist. The rejected state likewise shows no historical rejection reason:
 * the case row keeps one reason column and it holds the *opening* reason.
 */
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { AdminCustomerMergeCaseResponseStatus } from '@embroidery/api-client';

import { ADMIN_CUSTOMER_ACCESS_ROUTE } from '../../customer-access-support';
import { useMergeCase } from '../hooks/use-merge-case';
import { useExecuteMerge, useRejectMerge } from '../hooks/use-merge-decision';
import { CUSTOMER_MERGE_COPY } from '../model/customer-merge-copy';
import { BusinessProfileBlocker } from './business-profile-blocker';
import { MergeCaseSummary } from './merge-case-summary';
import { MergeConsequencePreview } from './merge-consequence-preview';
import { MergeExecuteDialog } from './merge-execute-dialog';
import { MergeRejectDialog } from './merge-reject-dialog';

const COPY = CUSTOMER_MERGE_COPY;

interface MergeCaseScreenProps {
  readonly mergeCaseId: string;
}

export function MergeCaseScreen({ mergeCaseId }: MergeCaseScreenProps) {
  const [dialog, setDialog] = useState<'execute' | 'reject' | null>(null);

  const state = useMergeCase(mergeCaseId);
  const refetchCase = state.refetch;

  const execute = useExecuteMerge(mergeCaseId, refetchCase);
  const reject = useRejectMerge(mergeCaseId, refetchCase);

  const closeExecute = useCallback(() => {
    execute.reset();
    setDialog(null);
  }, [execute]);
  const closeReject = useCallback(() => {
    reject.reset();
    setDialog(null);
  }, [reject]);

  const mergeCase = state.mergeCase;

  if (state.missing) {
    return (
      <section className="customer-merge">
        <BackLink />
        <section className="customer-merge__empty" data-testid="merge-case-not-found">
          <h1 className="customer-merge__title">{COPY.caseDetail.notFound}</h1>
          <p className="customer-merge__note">{COPY.caseDetail.notFoundBody}</p>
        </section>
      </section>
    );
  }

  if (state.failed) {
    return (
      <section className="customer-merge">
        <BackLink />
        <section className="customer-merge__empty" data-testid="merge-case-load-error">
          <h1 className="customer-merge__title">{COPY.caseDetail.loadError}</h1>
          <p className="customer-merge__note">{COPY.caseDetail.loadErrorBody}</p>
          <button
            type="button"
            className="customer-merge__primary"
            data-testid="merge-case-retry"
            onClick={() => {
              void refetchCase();
            }}
          >
            {COPY.caseDetail.retry}
          </button>
        </section>
      </section>
    );
  }

  if (state.loading || mergeCase === undefined) {
    return (
      <section className="customer-merge">
        <p className="customer-merge__loading" data-testid="merge-case-loading">
          {COPY.caseDetail.loading}
        </p>
      </section>
    );
  }

  const requested = mergeCase.status === AdminCustomerMergeCaseResponseStatus.REQUESTED;
  const executed = mergeCase.status === AdminCustomerMergeCaseResponseStatus.EXECUTED;
  const rejected = mergeCase.status === AdminCustomerMergeCaseResponseStatus.REJECTED;
  const profileConflict = mergeCase.consequencePreview.businessProfile.conflict;

  const survivorName = mergeCase.survivor?.displayName ?? COPY.selection.displayNameEmpty;
  const loserName = mergeCase.loser?.displayName ?? COPY.selection.displayNameEmpty;

  return (
    <section className="customer-merge">
      <header className="customer-merge__header">
        <h1 className="customer-merge__title">{COPY.caseDetail.heading}</h1>
        <BackLink />
      </header>

      <MergeCaseSummary mergeCase={mergeCase} />

      {requested ? (
        <>
          {profileConflict ? <BusinessProfileBlocker /> : null}
          <MergeConsequencePreview preview={mergeCase.consequencePreview} />

          <div className="customer-merge__actions">
            <button
              type="button"
              className="customer-merge__danger"
              data-testid="merge-execute-open"
              // Disabled, not hidden: a missing button is indistinguishable from
              // a screen that failed to render one, and the blocker above says
              // why this one cannot be used.
              disabled={profileConflict}
              onClick={() => {
                execute.reset();
                setDialog('execute');
              }}
            >
              {COPY.execute.action}
            </button>
            <button
              type="button"
              className="customer-merge__secondary"
              data-testid="merge-reject-open"
              onClick={() => {
                reject.reset();
                setDialog('reject');
              }}
            >
              {COPY.reject.action}
            </button>
          </div>
        </>
      ) : (
        <p className="customer-merge__note" data-testid="merge-preview-withheld">
          {COPY.preview.noPreviewAfterDecision}
        </p>
      )}

      {executed ? (
        <section className="customer-merge__outcome" data-testid="merge-case-executed">
          <h2 className="customer-merge__section-title">{COPY.executed.heading}</h2>
          <p className="customer-merge__note">{COPY.executed.body}</p>
          <p className="customer-merge__note">{COPY.executed.noUndoNote}</p>
        </section>
      ) : null}

      {rejected ? (
        <section className="customer-merge__outcome" data-testid="merge-case-rejected">
          <h2 className="customer-merge__section-title">{COPY.rejected.heading}</h2>
          <p className="customer-merge__note">{COPY.rejected.body}</p>
        </section>
      ) : null}

      {dialog === 'execute' ? (
        <MergeExecuteDialog
          survivorName={survivorName}
          loserName={loserName}
          busy={execute.running}
          outcome={execute.outcome}
          failure={execute.failure}
          onConfirm={execute.run}
          onClose={closeExecute}
        />
      ) : null}

      {dialog === 'reject' ? (
        <MergeRejectDialog
          busy={reject.running}
          succeeded={reject.succeeded}
          problem={reject.problem}
          failure={reject.failure}
          onConfirm={reject.run}
          onClose={closeReject}
        />
      ) : null}
    </section>
  );
}

function BackLink() {
  return (
    <Link
      className="customer-merge__back"
      href={ADMIN_CUSTOMER_ACCESS_ROUTE}
      data-testid="merge-back-to-support"
    >
      {COPY.page.backToSupport}
    </Link>
  );
}
