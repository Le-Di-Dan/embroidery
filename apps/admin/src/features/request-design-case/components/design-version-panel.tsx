'use client';

import type { DesignVersionDetailResponse, DesignVersionResponse } from '@embroidery/api-client';

import {
  presentInstant,
  presentPlacement,
  presentVersionStatus,
  resolveVersionActions,
  resolveVersionNote,
} from '../model/design-case-presentation';
import { readWorkingDocument } from '../model/design-authoring-document';
import { REQUEST_DESIGN_CASE_COPY as COPY } from '../model/request-design-case-copy';
import { DesignApprovalSnapshot } from './design-approval-snapshot';
import { DesignDocumentPreview } from './design-document-preview';
import { DesignReviewHistory } from './design-review-history';

interface DesignVersionPanelProps {
  readonly summary: DesignVersionResponse | undefined;
  readonly detail: DesignVersionDetailResponse | undefined;
  readonly detailLoading: boolean;
  readonly requestStatus: unknown;
  readonly onOpenAuthoring: (detail: DesignVersionDetailResponse) => void;
  readonly onCreateFrom: (detail: DesignVersionDetailResponse) => void;
  readonly onSend: (versionId: string, versionNumber: number) => void;
}

/**
 * The selected version, its evidence and the actions its state actually permits
 * (`APP6-A02` §20–§23).
 *
 * ### The action matrix is server facts, not client lifecycle
 *
 * Which controls exist comes from {@link resolveVersionActions}, which reads the
 * version's own LC-08 status and the request's own LC-11 status. There is no
 * `approve`, no `requestRevision` and no request-target selector anywhere in
 * this component: the first two are the customer's decisions through
 * `APP6-B11`, and `DESIGN_REVIEW`/`APPROVED` are server projections that no
 * Admin control may name.
 *
 * ### Read-only states are read-only
 *
 * `SENT_FOR_REVIEW` (`696:3`) offers no editing and no re-send — the version is
 * frozen and the next move belongs to the customer. `REVISION_REQUESTED`
 * (`696:113`) shows the customer's feedback and offers exactly one forward move:
 * a **new** DRAFT continuing it. The historical row itself is never mutated;
 * `APPROVED` (`697:3`) is immutable evidence and offers nothing at all.
 *
 * ### The document comes from the exact-version read
 *
 * Not from the list, which carries no document, and not from the submitted
 * source, which is a different document entirely. That is what makes the preview
 * and the revision source survive a reload.
 */
export function DesignVersionPanel({
  summary,
  detail,
  detailLoading,
  requestStatus,
  onOpenAuthoring,
  onCreateFrom,
  onSend,
}: DesignVersionPanelProps) {
  if (summary === undefined) {
    return (
      <p className="request-design-case__hint" data-testid="design-version-none">
        {COPY.selected.none}
      </p>
    );
  }

  const actions = resolveVersionActions(summary, requestStatus);
  const note = resolveVersionNote(summary);
  const document = detail === undefined ? null : readWorkingDocument(detail.document);

  return (
    <div data-testid="design-version-panel" data-version-status={summary.status}>
      <header className="request-design-case__panel-header">
        <h3 className="request-design-case__notice-title">
          {COPY.selected.version(summary.version)}
        </h3>
        <span className="request-design-case__badge" data-status={summary.status}>
          {presentVersionStatus(summary.status)}
        </span>
      </header>

      {note === null ? null : (
        <div
          className="request-design-case__notice"
          data-tone={note.tone}
          data-testid="design-version-note"
        >
          <h4 className="request-design-case__notice-title">{note.title}</h4>
          <p>{note.body}</p>
        </div>
      )}

      <dl className="request-design-case__definitions">
        <div className="request-design-case__definition">
          <dt>{COPY.selected.documentHash}</dt>
          <dd className="request-design-case__mono" data-testid="design-version-hash">
            {/* A draft that has never been sent has no hash. The absence is
                stated, never filled with a freshly computed digest. */}
            {detail?.documentHash ?? COPY.selected.documentHashAbsent}
          </dd>
        </div>
        <div className="request-design-case__definition">
          <dt>{COPY.selected.parent}</dt>
          <dd>
            {summary.parentVersionId === null ? COPY.selected.parentNone : summary.parentVersionId}
          </dd>
        </div>
        <div className="request-design-case__definition">
          <dt>{COPY.selected.placement}</dt>
          <dd>{presentPlacement(summary)}</dd>
        </div>
        <div className="request-design-case__definition">
          <dt>{COPY.selected.dimensions}</dt>
          <dd>
            {COPY.selected.dimensionsValue(summary.physicalWidthMm, summary.physicalHeightMm)}
          </dd>
        </div>
        <div className="request-design-case__definition">
          <dt>{COPY.selected.schemaVersion}</dt>
          <dd>{String(summary.documentSchemaVersion)}</dd>
        </div>
        <div className="request-design-case__definition">
          <dt>{COPY.history.columnSentAt}</dt>
          <dd>{presentInstant(summary.sentAt)}</dd>
        </div>
      </dl>

      {detailLoading ? (
        <p className="request-design-case__hint" role="status">
          {COPY.selected.loading}
        </p>
      ) : null}

      {document === null ? null : (
        <DesignDocumentPreview document={document} testId="design-version-preview" />
      )}

      <div className="request-design-case__actions">
        {actions.canAuthor && detail !== undefined ? (
          <button
            className="request-design-case__button"
            type="button"
            onClick={() => {
              onOpenAuthoring(detail);
            }}
            data-testid="design-open-authoring"
          >
            {COPY.selected.openAuthoring}
          </button>
        ) : null}

        {actions.canSend ? (
          <button
            className="request-design-case__button request-design-case__button--primary"
            type="button"
            onClick={() => {
              onSend(summary.versionId, summary.version);
            }}
            data-testid="design-send-open"
          >
            {COPY.selected.send}
          </button>
        ) : null}

        {actions.canCreateFrom && detail !== undefined ? (
          <button
            className="request-design-case__button request-design-case__button--primary"
            type="button"
            onClick={() => {
              onCreateFrom(detail);
            }}
            data-testid="design-create-from-version"
          >
            {COPY.selected.createFromThis}
          </button>
        ) : null}
      </div>

      <section className="request-design-case__card">
        <h4 className="request-design-case__notice-title">{COPY.sections.reviews}</h4>
        <DesignReviewHistory reviews={detail?.reviews ?? []} />
      </section>

      {detail?.approval == null ? null : <DesignApprovalSnapshot approval={detail.approval} />}
    </div>
  );
}
