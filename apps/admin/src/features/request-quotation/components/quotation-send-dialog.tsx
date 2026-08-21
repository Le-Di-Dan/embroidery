'use client';

import { useEffect, useId, useRef } from 'react';

import { REQUEST_QUOTATION_COPY as COPY } from '../model/request-quotation-copy';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface SendDialogProps {
  /** The exact version this dialog was opened for. Never re-derived. */
  readonly versionId: string;
  readonly versionNumber: number;
  readonly running: boolean;
  readonly onConfirm: (versionId: string) => void;
  readonly onDismiss: () => void;
}

/**
 * The send confirmation (`687:144`) and its in-progress state (`689:3`).
 *
 * ### The dialog is bound to one version id
 *
 * `versionId` is a prop, captured when the dialog opened, and `onConfirm` is
 * handed that same value. Nothing recomputes "the current draft" between the
 * operator reading the number in the sentence and the request going out — which
 * is the gap through which a screen sends a version nobody looked at.
 *
 * ### It does not claim to move the request
 *
 * The wording says a quotation is being sent to the customer. `APP6-B03` may
 * project the request to `QUOTED` as a consequence of that send, but the
 * operator is not setting a request status and is not told they are.
 *
 * ### Dismissal is blocked while the send is in flight
 *
 * Escape and the backdrop both stop working once the request is out: the write
 * is already happening, and closing the dialog would leave the operator without
 * the outcome. The confirm button is `disabled` *and* guarded by a ref in the
 * hook, because `disabled` is one render behind a double-click.
 *
 * This is another hand-rolled dialog — `FU-ADMIN-SHARED-DIALOG-01` is still open
 * and still unowned. Reaching into another feature for its markup would couple
 * two unrelated capabilities and make that follow-up harder, not easier.
 */
export function QuotationSendDialog({
  versionId,
  versionNumber,
  running,
  onConfirm,
  onDismiss,
}: SendDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<Element | null>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    restoreTo.current = document.activeElement;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();
    return () => {
      const target = restoreTo.current;
      if (target instanceof HTMLElement) {
        target.focus();
      }
    };
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      if (!running) {
        onDismiss();
      }
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const panel = panelRef.current;
    if (panel === null) {
      return;
    }
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) {
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="request-quotation__backdrop" data-testid="quotation-send-dialog">
      <div
        className="request-quotation__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        ref={panelRef}
        onKeyDown={handleKeyDown}
      >
        <h2 className="request-quotation__dialog-title" id={titleId}>
          {COPY.send.dialogTitle}
        </h2>
        <p className="request-quotation__dialog-body" id={bodyId}>
          {COPY.send.dialogBody(versionNumber)}
        </p>
        <p className="request-quotation__dialog-hint">{COPY.send.dialogHint}</p>

        <div className="request-quotation__dialog-actions">
          <button
            className="request-quotation__button"
            type="button"
            disabled={running}
            onClick={onDismiss}
          >
            {COPY.send.cancel}
          </button>
          <button
            className="request-quotation__button request-quotation__button--primary"
            type="button"
            disabled={running}
            aria-busy={running}
            data-testid="quotation-send-confirm"
            onClick={() => {
              onConfirm(versionId);
            }}
          >
            {running ? COPY.send.pending : COPY.send.confirm}
          </button>
        </div>

        {running ? (
          <p className="request-quotation__dialog-pending" role="status">
            {COPY.send.pending}
          </p>
        ) : null}
      </div>
    </div>
  );
}
