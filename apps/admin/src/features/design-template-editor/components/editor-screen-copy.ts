/**
 * The two lookups the screen would otherwise inline.
 *
 * They live beside the screen rather than in `model/` because they are purely
 * about what the screen renders, and beside it rather than inside it because a
 * `switch` in the middle of a component is where a missing case hides.
 */
import { DESIGN_TEMPLATE_EDITOR_COPY } from '../model/design-template-editor-copy';
import type { SaveFailure } from '../model/editor-failure';

export const STATUS_LABELS: Readonly<Record<string, string>> = {
  DRAFT: DESIGN_TEMPLATE_EDITOR_COPY.status.draft,
  PUBLISHED: DESIGN_TEMPLATE_EDITOR_COPY.status.published,
  ARCHIVED: DESIGN_TEMPLATE_EDITOR_COPY.status.archived,
};

/**
 * What a failed save says.
 *
 * `stale-version` is deliberately absent from the branches below: it never
 * reaches this function, because a version conflict is a decision the operator
 * makes in a dialog, not a message they read. Routing it here would present the
 * one recoverable failure as an ordinary error.
 */
export function saveFailureCopy(failure: Exclude<SaveFailure, 'stale-version'> | SaveFailure): {
  readonly title: string;
  readonly body: string;
} {
  const copy = DESIGN_TEMPLATE_EDITOR_COPY.save;
  if (failure === 'document-rejected') {
    return { title: copy.rejectedTitle, body: copy.rejectedBody };
  }
  if (failure === 'not-editable') {
    return { title: copy.notEditableTitle, body: copy.notEditableBody };
  }
  return { title: copy.failedTitle, body: copy.failedBody };
}
