'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import type { DesignVersionDetailResponse } from '@embroidery/api-client';

import { presentRequestStatus } from '../../../shared/presentation/request-status';
import { useCreateDesignVersion } from '../hooks/use-create-design-version';
import { useDesignAuthoring } from '../hooks/use-design-authoring';
import {
  useDesignVersionsQuery,
  useRequestContextQuery,
  useSubmittedSourceQuery,
} from '../hooks/use-design-case-queries';
import { useDesignVersionDetailQuery } from '../hooks/use-design-version-detail';
import { useSendDesignVersion } from '../hooks/use-send-design-version';
import { readWorkingDocument } from '../model/design-authoring-document';
import {
  allowsAuthoring,
  awaitsDigitizingTransition,
  presentInstant,
  resolveSelectedVersion,
  subjectKindOf,
} from '../model/design-case-presentation';
import { classifyReadFailure } from '../model/request-design-case-failure';
import { REQUEST_DESIGN_CASE_COPY as COPY } from '../model/request-design-case-copy';
import { ADMIN_REQUEST_DETAIL_ROUTE } from '../model/request-design-case-route';
import { CreateVersionDialog, type CreateSource } from './create-version-dialog';
import { DesignAuthoringSurface } from './design-authoring-surface';
import { DesignCaseError, DesignCaseGate, DesignCaseLoading } from './design-case-states';
import { CatalogSourcePanel, CustomerOwnedSourcePanel } from './design-source-panel';
import { DesignVersionHistory } from './design-version-history';
import { DesignVersionPanel } from './design-version-panel';
import { ReviewAlreadyActiveNotice, SendReviewDialog } from './send-review-dialog';

interface DesignCaseWorkbenchScreenProps {
  readonly requestId: string;
}

interface PendingSend {
  readonly versionId: string;
  readonly versionNumber: number;
}

/**
 * `/requests/{requestId}/design` — the Admin design-case workbench
 * (`APP6-A02`).
 *
 * Composes the approved frames and owns exactly one piece of local state per
 * genuinely local concern: which version is selected, which dialog is open, and
 * the in-memory working document. Every server fact is read through TanStack
 * Query and none of them is copied into React state — the screen renders what
 * the server says, and re-reads rather than predicting.
 *
 * ### The gate is truthful, not decorative
 *
 * `698:97` renders whenever the request is outside `DIGITIZING`/`DESIGN_REVIEW`,
 * because `APP6-B08` authors a version only in those two. No control that would
 * merely wait for a `409` is shown. The server stays the final authority, and a
 * refusal that arrives anyway is reconciled rather than argued with.
 *
 * ### `DESIGN_REVIEW` and `APPROVED` are never Admin-selectable
 *
 * There is no request-target selector on this screen at all, and no control that
 * names either state. Both are server projections. The `DIGITIZING` transition
 * belongs to `APP6-B06` on the request-detail screen, which the gate links to
 * rather than duplicating.
 */
export function DesignCaseWorkbenchScreen({ requestId }: DesignCaseWorkbenchScreenProps) {
  const context = useRequestContextQuery(requestId);
  const detail = context.data;

  const branch = detail === undefined ? 'UNKNOWN' : subjectKindOf(detail);
  const authoringAllowed = allowsAuthoring(detail?.status);

  // The two design reads run only once the request itself resolved: a request
  // that does not exist has no design thread to ask about, and issuing the calls
  // anyway would turn one refusal into three.
  const submitted = useSubmittedSourceQuery(requestId, detail !== undefined);
  const versionsQuery = useDesignVersionsQuery(requestId, detail !== undefined);
  const versions = useMemo(() => versionsQuery.data?.versions ?? [], [versionsQuery.data]);

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const selected = resolveSelectedVersion(versions, selectedVersionId);
  const selectedDetail = useDesignVersionDetailQuery(requestId, selected?.versionId ?? null);

  const authoring = useDesignAuthoring();
  const [createSource, setCreateSource] = useState<CreateSource | null>(null);
  const [pendingSend, setPendingSend] = useState<PendingSend | null>(null);

  const create = useCreateDesignVersion({
    requestId,
    onVersionCreated: (versionId) => {
      setSelectedVersionId(versionId);
      setCreateSource(null);
      authoring.close();
    },
  });

  const send = useSendDesignVersion({
    requestId,
    onVersionSettled: (versionId) => {
      setSelectedVersionId(versionId);
      setPendingSend(null);
    },
  });

  const openAuthoring = useCallback(
    (version: DesignVersionDetailResponse) => {
      authoring.openWith(version.document, {
        kind: 'predecessor',
        version: version.version,
        status: version.status,
      });
    },
    [authoring],
  );

  /**
   * Start a new DRAFT from the **exact** version the operator chose.
   *
   * The document comes from that version's own detail read — never from the
   * list, which carries none, and never from "the latest". This is what makes
   * `695:3`'s *"Chép từ v1"* line true rather than a guess.
   */
  const createFromVersion = useCallback((version: DesignVersionDetailResponse) => {
    const document = readWorkingDocument(version.document);
    setCreateSource(
      document === null
        ? { kind: 'absent' }
        : {
            kind: 'predecessor',
            document,
            version: version.version,
            status: version.status,
          },
    );
  }, []);

  /** Start a first Catalog version from the submitted source, when there is one. */
  const createFromSubmitted = useCallback(() => {
    const document =
      submitted.source === null ? null : readWorkingDocument(submitted.source.document);
    setCreateSource(document === null ? { kind: 'absent' } : { kind: 'submitted', document });
  }, [submitted.source]);

  const saveWorkingAsVersion = useCallback(() => {
    const working = authoring.document;
    setCreateSource(working === null ? { kind: 'absent' } : { kind: 'working', document: working });
  }, [authoring.document]);

  if (context.isPending) {
    return <DesignCaseLoading />;
  }
  if (context.isError || detail === undefined) {
    return (
      <DesignCaseError
        failure={classifyReadFailure(context.error)}
        onRetry={() => {
          void context.refetch();
        }}
      />
    );
  }

  const sendFailure = send.outcome.kind === 'failure' ? send.outcome.failure : null;
  const reviewAlreadyActive = sendFailure === 'reviewActive';

  return (
    <div className="request-design-case" data-testid="design-case-workbench">
      <header className="request-design-case__header">
        <div>
          <h1 className="request-design-case__title">{COPY.page.title(detail.code)}</h1>
          <p className="request-design-case__hint">{COPY.page.subtitle}</p>
        </div>
        <Link className="request-design-case__button" href={ADMIN_REQUEST_DETAIL_ROUTE(requestId)}>
          {COPY.page.backToRequest}
        </Link>
      </header>

      <div className="request-design-case__layout">
        <main className="request-design-case__main">
          {!authoringAllowed ? (
            <DesignCaseGate
              requestId={requestId}
              awaitsTransition={awaitsDigitizingTransition(detail.status)}
            />
          ) : null}

          {reviewAlreadyActive ? <ReviewAlreadyActiveNotice onDismiss={send.reset} /> : null}

          <section className="request-design-case__card">
            <h2 className="request-design-case__section-title">{COPY.sections.source}</h2>
            {branch === 'CUSTOMER_OWNED' ? (
              <CustomerOwnedSourcePanel requestId={requestId} assets={detail.assets ?? []} />
            ) : (
              <CatalogSourcePanel
                source={submitted.source}
                absent={submitted.absent}
                isLoading={submitted.isLoading}
                isError={submitted.isError}
                onRetry={submitted.retry}
              />
            )}
            {authoringAllowed ? (
              <div className="request-design-case__actions">
                <button
                  className="request-design-case__button"
                  type="button"
                  onClick={createFromSubmitted}
                  data-testid="design-create-open"
                >
                  {COPY.create.open}
                </button>
              </div>
            ) : null}
          </section>

          <section className="request-design-case__card">
            <h2 className="request-design-case__section-title">{COPY.sections.versions}</h2>
            {versionsQuery.isError ? (
              <DesignCaseError
                failure={classifyReadFailure(versionsQuery.error)}
                onRetry={() => {
                  void versionsQuery.refetch();
                }}
              />
            ) : (
              <DesignVersionHistory
                versions={versions}
                selectedVersionId={selected?.versionId ?? null}
                isLoading={versionsQuery.isPending}
                onSelect={setSelectedVersionId}
              />
            )}
          </section>

          <section className="request-design-case__card">
            <h2 className="request-design-case__section-title">{COPY.sections.selected}</h2>
            <DesignVersionPanel
              summary={selected}
              detail={selectedDetail.data}
              detailLoading={selectedDetail.isPending && selected !== undefined}
              requestStatus={detail.status}
              onOpenAuthoring={openAuthoring}
              onCreateFrom={createFromVersion}
              onSend={(versionId, versionNumber) => {
                send.reset();
                setPendingSend({ versionId, versionNumber });
              }}
            />
          </section>

          {authoring.open ? (
            <DesignAuthoringSurface authoring={authoring} onSaveAsVersion={saveWorkingAsVersion} />
          ) : null}
        </main>

        <aside className="request-design-case__rail">
          <section className="request-design-case__card">
            <h2 className="request-design-case__section-title">{COPY.sections.context}</h2>
            <dl className="request-design-case__definitions">
              <div className="request-design-case__definition">
                <dt>{COPY.context.status}</dt>
                {/* The Admin-shared presenter. No third private status map. */}
                <dd data-testid="design-case-request-status" data-status={detail.status}>
                  {presentRequestStatus(detail.status)}
                </dd>
              </div>
              <div className="request-design-case__definition">
                <dt>{COPY.context.branch}</dt>
                <dd data-testid="design-case-branch">
                  {branch === 'CUSTOMER_OWNED'
                    ? COPY.context.branchCustomerOwned
                    : branch === 'CATALOG'
                      ? COPY.context.branchCatalog
                      : COPY.context.unknown}
                </dd>
              </div>
              <div className="request-design-case__definition">
                <dt>{COPY.context.customer}</dt>
                <dd>{detail.customer?.displayName ?? COPY.context.unknown}</dd>
              </div>
              <div className="request-design-case__definition">
                <dt>{COPY.history.columnSentAt}</dt>
                <dd>{presentInstant(detail.submittedAt)}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>

      {createSource === null ? null : (
        <CreateVersionDialog
          source={createSource}
          branch={branch === 'CUSTOMER_OWNED' ? 'CUSTOMER_OWNED' : 'CATALOG'}
          running={create.running}
          failure={create.outcome.kind === 'failure' ? create.outcome.failure : null}
          onSubmit={create.run}
          onDismiss={() => {
            setCreateSource(null);
            create.reset();
          }}
        />
      )}

      {pendingSend === null || reviewAlreadyActive ? null : (
        <SendReviewDialog
          versionId={pendingSend.versionId}
          versionNumber={pendingSend.versionNumber}
          running={send.running}
          failure={sendFailure}
          onConfirm={send.run}
          onDismiss={() => {
            setPendingSend(null);
            send.reset();
          }}
        />
      )}
    </div>
  );
}
