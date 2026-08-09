'use client';

import { DESIGN_TEMPLATE_EDITOR_COPY } from '../model/design-template-editor-copy';
import type { EditorSource } from '../model/editor-source';
import { EditorNotice } from './editor-notice';

interface EditorBlockedStateProps {
  /** Any source kind other than `ready`. */
  readonly source: Exclude<EditorSource, { kind: 'ready' }>;
  readonly onRetryDetail: () => void;
  readonly onRetryPlacement: () => void;
}

/**
 * Everything the editor shows when it cannot be an editor.
 *
 * Six named outcomes and a loading state, kept together because they answer one
 * question — *why is there no stage?* — and kept out of the screen because a
 * component that both orchestrates a document and enumerates seven refusals is
 * a component where a missing branch hides.
 *
 * Two of these are not failures. A Template with no placement scope and a
 * Template this build cannot render are different in kind from a read that went
 * wrong, and the `tone` says so: an alert interrupts, a status informs.
 */
export function EditorBlockedState({
  source,
  onRetryDetail,
  onRetryPlacement,
}: EditorBlockedStateProps) {
  const copy = DESIGN_TEMPLATE_EDITOR_COPY;

  switch (source.kind) {
    case 'not-found':
      return (
        <EditorNotice
          title={copy.page.notFoundTitle}
          body={copy.page.notFoundBody}
          testId="editor-not-found"
          tone="alert"
        />
      );

    case 'load-failed':
      return (
        <EditorNotice
          title={copy.page.loadFailedTitle}
          body={copy.page.loadFailedBody}
          testId="editor-load-failed"
          tone="alert"
          action={{ label: copy.page.retry, onClick: onRetryDetail }}
        />
      );

    case 'unscoped':
      // Not an error: `APP3-P01` requires a placement snapshot in every Design
      // Document, so a Template without a scope has no representable document.
      // The copy states that, rather than implying something broke.
      return (
        <EditorNotice
          title={copy.scope.none}
          body={copy.scope.noneBody}
          testId="editor-unscoped"
          tone="status"
        />
      );

    case 'scope-failed':
      return (
        <EditorNotice
          title={copy.scope.failedTitle}
          body={copy.scope.failedBody}
          testId="editor-scope-failed"
          tone="alert"
          action={{ label: copy.page.retry, onClick: onRetryPlacement }}
        />
      );

    case 'scope-unresolved':
      return (
        <EditorNotice
          title={copy.scope.unresolvedTitle}
          body={copy.scope.unresolvedBody}
          testId="editor-scope-unresolved"
          tone="alert"
        />
      );

    case 'document-invalid':
      return (
        <EditorNotice
          title={copy.save.rejectedTitle}
          body={copy.save.rejectedBody}
          testId="editor-document-invalid"
          tone="alert"
        />
      );

    default:
      return (
        <p className="template-editor__loading" role="status" data-testid="editor-loading">
          {copy.page.loading}
        </p>
      );
  }
}
