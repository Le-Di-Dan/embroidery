'use client';

import { DESIGN_TEMPLATE_EDITOR_COPY } from '../model/design-template-editor-copy';
import type { ResolvedTemplateScope } from '../model/editor-scope';

interface EditorScopePanelProps {
  readonly scope: ResolvedTemplateScope | null;
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
}

/**
 * The scope context (`601:3`, inspector column header).
 *
 * Context, never a control. `APP3-A03` owns no scope mutation: there is no
 * operation that changes a Template's placement after creation, so a control
 * here would be a promise nothing could keep. The panel reports the resolved
 * Side and Area **by name** — resolved from their ids against the Product's own
 * placement — and reports the canvas the document is authored in.
 *
 * When the ids no longer resolve the panel says exactly that and stops. It never
 * substitutes another Side or Area: a silent fallback would author a document
 * against geometry the Template does not point at.
 */
export function EditorScopePanel({ scope, canvasWidthPx, canvasHeightPx }: EditorScopePanelProps) {
  const copy = DESIGN_TEMPLATE_EDITOR_COPY.scope;

  return (
    <section className="template-editor-scope" aria-label={copy.title} data-testid="editor-scope">
      <h2 className="template-editor-scope__title">{copy.title}</h2>
      {scope === null ? (
        <p className="template-editor-scope__unresolved" data-testid="editor-scope-unresolved">
          {copy.unresolvedBody}
        </p>
      ) : (
        <dl className="template-editor-scope__list">
          <div>
            <dt>{copy.side(scope.side.name)}</dt>
            <dd data-testid="editor-scope-side-id">{scope.side.code}</dd>
          </div>
          <div>
            <dt>{copy.area(scope.area.name)}</dt>
            <dd data-testid="editor-scope-area-id">{scope.area.code}</dd>
          </div>
        </dl>
      )}
      <p className="template-editor-scope__canvas">{copy.canvas(canvasWidthPx, canvasHeightPx)}</p>
    </section>
  );
}
