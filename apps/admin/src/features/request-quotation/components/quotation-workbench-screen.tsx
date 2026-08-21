'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';

import { REQUEST_QUOTATION_COPY as COPY } from '../model/request-quotation-copy';
import { classifyReadFailure, type DraftingFailure } from '../model/request-quotation-failure';
import { lineKindsFor, toCreateBody, toVersionBody } from '../model/quotation-authoring-form';
import type { AuthoringForm } from '../model/quotation-authoring-form';
import {
  isAcceptedQuotation,
  isCustomerCurrent,
  isSendable,
  resolveSelectedVersion,
  subjectKindOf,
} from '../model/quotation-presentation';
import { useQuotationDrafting } from '../hooks/use-quotation-drafting';
import { useQuotationSend } from '../hooks/use-quotation-send';
import {
  useRequestContextQuery,
  useVersionDetailQuery,
  useVersionHistoryQuery,
} from '../hooks/use-quotation-queries';
import { QuotationAcceptedOutcome } from './quotation-accepted-outcome';
import { QuotationAuthoringForm } from './quotation-authoring-form';
import { QuotationRequestContext } from './quotation-request-context';
import { QuotationSendDialog } from './quotation-send-dialog';
import { QuotationVersionHistory } from './quotation-version-history';
import { QuotationVersionPanel } from './quotation-version-panel';
import {
  QuotationEmptyState,
  QuotationWorkbenchSkeleton,
  QuotationWorkbenchUnavailable,
} from './quotation-workbench-states';

interface WorkbenchScreenProps {
  readonly requestId: string;
}

const DRAFTING_FAILURE_COPY: Readonly<Record<DraftingFailure, string>> = {
  exists: COPY.validation.conflictExists,
  rejected: COPY.validation.rejected,
  stale: COPY.validation.stale,
  unauthenticated: COPY.validation.unauthenticated,
  missing: COPY.validation.stale,
  retryable: COPY.validation.retryable,
};

/**
 * `/requests/{requestId}/quotation` — the Admin quotation workbench.
 *
 * Composition plus two pieces of local state: which version the operator has
 * selected, and which version a send dialog is open for. Every fact on the page
 * comes from a query, and every mutation is followed by a re-read — so the
 * screen holds no shadow copy of a total, a status or a version list.
 *
 * ### The bootstrap is strictly ordered, and the three states stay apart
 *
 * The request context is read first; its `quotationId` decides everything after
 * it. While that read is pending the screen is *loading* — never empty. Only a
 * **successful** context read whose locator is null produces the empty state. A
 * failed history read is its own failure and is never rendered as "no quotation
 * yet".
 *
 * ### The selected version is not the customer-current version
 *
 * `resolveSelectedVersion` picks what this screen shows — an explicit pick, else
 * the newest DRAFT, else the newest version. `isCustomerCurrent` answers the
 * different question of what the customer sees, from the header pointer, and is
 * null until the first send. The two are never conflated.
 */
export function QuotationWorkbenchScreen({ requestId }: WorkbenchScreenProps) {
  const requestDetailHref = `/requests/${requestId}`;
  const context = useRequestContextQuery(requestId);
  const [pickedVersionId, setPickedVersionId] = useState<string | null>(null);
  const [sendDialogVersionId, setSendDialogVersionId] = useState<string | null>(null);

  // The locator, straight from the read. Never from a mutation kept in memory,
  // never from storage, never from the request status.
  const quotationId = context.data?.quotationId ?? null;

  const history = useVersionHistoryQuery(quotationId);

  // Clearing the manual pick is the whole job: with no pick,
  // `resolveSelectedVersion` falls back to the newest DRAFT, which is the
  // version that was just written. The quotation id itself becomes durable
  // through the context re-read the hook performs, never through this state.
  const onDraftSettled = useCallback(() => {
    setPickedVersionId(null);
  }, []);

  const drafting = useQuotationDrafting({ requestId, onDraftSettled });

  if (context.isPending) {
    return <QuotationWorkbenchSkeleton />;
  }

  if (context.isError || context.data === undefined) {
    return (
      <QuotationWorkbenchUnavailable
        failure={classifyReadFailure(context.error)}
        onRetry={() => {
          void context.refetch();
        }}
      />
    );
  }

  const detail = context.data;
  const subjectKind = subjectKindOf(detail);
  const kinds = lineKindsFor(subjectKind);
  const draftingIssue =
    drafting.outcome.kind === 'failure'
      ? DRAFTING_FAILURE_COPY[drafting.outcome.failure]
      : drafting.outcome.kind === 'reconciled'
        ? COPY.validation.conflictExists
        : null;

  return (
    <section className="request-quotation" data-testid="quotation-workbench">
      <header className="request-quotation__header">
        <Link className="request-quotation__link" href={requestDetailHref}>
          {COPY.page.backToRequest}
        </Link>
        <h1 className="request-quotation__title">{COPY.page.title(detail.code)}</h1>
        <p className="request-quotation__subtitle">{COPY.page.subtitle}</p>
      </header>

      <div className="request-quotation__columns">
        <div className="request-quotation__main">
          {quotationId === null ? (
            <>
              <QuotationEmptyState
                onCreate={() => {
                  drafting.reset();
                }}
                disabled={drafting.running}
              />
              <QuotationAuthoringForm
                kinds={kinds}
                submitLabel={COPY.form.submitCreate}
                running={drafting.running}
                serverIssue={draftingIssue}
                onSubmit={(form: AuthoringForm) => {
                  drafting.createFirst(toCreateBody(requestId, form));
                }}
              />
            </>
          ) : (
            <QuotationBody
              quotationId={quotationId}
              requestId={requestId}
              requestDetailHref={requestDetailHref}
              kinds={kinds}
              history={history}
              pickedVersionId={pickedVersionId}
              onPick={setPickedVersionId}
              sendDialogVersionId={sendDialogVersionId}
              onOpenSendDialog={setSendDialogVersionId}
              drafting={drafting}
              draftingIssue={draftingIssue}
            />
          )}
        </div>

        <QuotationRequestContext detail={detail} subjectKind={subjectKind} />
      </div>
    </section>
  );
}

type HistoryQuery = ReturnType<typeof useVersionHistoryQuery>;
type DraftingState = ReturnType<typeof useQuotationDrafting>;

interface QuotationBodyProps {
  readonly quotationId: string;
  readonly requestId: string;
  readonly requestDetailHref: string;
  readonly kinds: ReturnType<typeof lineKindsFor>;
  readonly history: HistoryQuery;
  readonly pickedVersionId: string | null;
  readonly onPick: (versionId: string) => void;
  readonly sendDialogVersionId: string | null;
  readonly onOpenSendDialog: (versionId: string | null) => void;
  readonly drafting: DraftingState;
  readonly draftingIssue: string | null;
}

/**
 * The quotation half of the screen, once a locator exists.
 *
 * Split out because the workbench above owns bootstrap and this owns the
 * quotation — and because the send hook needs a non-null `quotationId`, which is
 * a fact this component's props carry and the parent's do not.
 */
function QuotationBody({
  quotationId,
  requestId,
  requestDetailHref,
  kinds,
  history,
  pickedVersionId,
  onPick,
  sendDialogVersionId,
  onOpenSendDialog,
  drafting,
  draftingIssue,
}: QuotationBodyProps) {
  const onVersionSettled = useCallback(
    (versionId: string) => {
      onPick(versionId);
      onOpenSendDialog(null);
    },
    [onOpenSendDialog, onPick],
  );

  const send = useQuotationSend({ requestId, quotationId, onVersionSettled });

  const versions = history.data?.versions ?? [];
  const selected = resolveSelectedVersion(versions, pickedVersionId);
  const versionDetail = useVersionDetailQuery(quotationId, selected?.versionId ?? null);

  if (history.isPending) {
    return <QuotationWorkbenchSkeleton />;
  }

  if (history.isError || history.data === undefined) {
    return (
      <QuotationWorkbenchUnavailable
        failure={classifyReadFailure(history.error)}
        heading={COPY.error.historyHeading}
        onRetry={() => {
          void history.refetch();
        }}
      />
    );
  }

  const header = history.data.quotation;
  const accepted = isAcceptedQuotation(header);

  return (
    <>
      {send.outcome.kind === 'sent' ? (
        <div
          className="request-quotation__outcome"
          role="status"
          data-testid="quotation-send-result"
        >
          <p className="request-quotation__outcome-title">
            {send.outcome.replayed ? COPY.send.replayHeading : COPY.send.successHeading}
          </p>
          <p>{send.outcome.replayed ? COPY.send.replayBody : COPY.send.successBody}</p>
        </div>
      ) : null}

      {send.outcome.kind === 'failure' ? (
        <div
          className="request-quotation__outcome request-quotation__outcome--alert"
          role="alert"
          data-testid="quotation-send-failure"
        >
          <p className="request-quotation__outcome-title">
            {send.outcome.failure === 'stale' ? COPY.send.staleHeading : COPY.send.failureHeading}
          </p>
          <p>
            {send.outcome.failure === 'stale'
              ? COPY.send.staleBody
              : send.outcome.failure === 'unauthenticated'
                ? COPY.send.unauthenticated
                : COPY.send.failureBody}
          </p>
        </div>
      ) : null}

      {accepted ? <QuotationAcceptedOutcome requestDetailHref={requestDetailHref} /> : null}

      {selected === undefined ? null : (
        <>
          {versionDetail.isSuccess ? (
            <QuotationVersionPanel
              version={versionDetail.data.version}
              lineItems={versionDetail.data.lineItems}
              customerCurrent={isCustomerCurrent(header, versionDetail.data.version)}
            />
          ) : versionDetail.isError ? (
            <QuotationWorkbenchUnavailable
              failure={classifyReadFailure(versionDetail.error)}
              heading={COPY.error.versionHeading}
              onRetry={() => {
                void versionDetail.refetch();
              }}
            />
          ) : (
            <QuotationWorkbenchSkeleton />
          )}

          {isSendable(selected) && !accepted ? (
            <button
              className="request-quotation__button request-quotation__button--primary"
              type="button"
              disabled={send.running}
              aria-busy={send.running}
              data-testid="quotation-send-open"
              onClick={() => {
                send.reset();
                onOpenSendDialog(selected.versionId);
              }}
            >
              {COPY.send.action}
            </button>
          ) : null}
        </>
      )}

      <QuotationVersionHistory
        header={header}
        versions={versions}
        selectedVersionId={selected?.versionId ?? null}
        onSelect={onPick}
      />

      {accepted ? null : (
        <QuotationAuthoringForm
          kinds={kinds}
          submitLabel={COPY.form.submitVersion}
          running={drafting.running}
          serverIssue={draftingIssue}
          onSubmit={(form: AuthoringForm) => {
            drafting.addVersion(quotationId, toVersionBody(form));
          }}
        />
      )}

      {sendDialogVersionId === null ? null : (
        <QuotationSendDialog
          versionId={sendDialogVersionId}
          versionNumber={
            versions.find((version) => version.versionId === sendDialogVersionId)?.version ?? 0
          }
          running={send.running}
          onConfirm={(versionId: string) => {
            send.run(versionId);
          }}
          onDismiss={() => {
            onOpenSendDialog(null);
          }}
        />
      )}
    </>
  );
}
