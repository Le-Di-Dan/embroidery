'use client';

import type { AuthoringState } from '../hooks/use-design-authoring';
import { REQUEST_DESIGN_CASE_COPY as COPY } from '../model/request-design-case-copy';
import { DesignDocumentPreview } from './design-document-preview';

interface DesignAuthoringSurfaceProps {
  readonly authoring: AuthoringState;
  readonly onSaveAsVersion: () => void;
}

/**
 * "Mở trình số hoá" — the formal Design Document authoring surface
 * (`APP6-A02` §17).
 *
 * ### What this is, and what it is emphatically not
 *
 * It authors the **formal visual Design Document** `APP6-B08` persists. It is
 * not machine stitch digitizing: nothing here produces a DST or PES file,
 * simulates a stitch, counts thread, emits a production specification or creates
 * a production job. `APP6` builds none of those, and the surface says so on
 * screen rather than leaving an operator to assume otherwise.
 *
 * ### One rendering architecture, reused
 *
 * The stage is {@link DesignDocumentPreview} — native React SVG over
 * `@embroidery/design-engine` and the P01 document model, the same architecture
 * `IMP-D026` locks and the APP3 Studio and Template editor already draw with.
 * There is no Canvas, no Konva, no Fabric, no Pixi, no Three, no second renderer
 * and no second geometry authority.
 *
 * ### Editing never touches persisted history
 *
 * The working document is a browser-memory copy. There is no update-version API
 * and this surface offers no save-in-place: the only exit that persists is
 * `APP6-B08`'s create, which appends a **new** DRAFT. A previously persisted
 * version stays exactly as it was.
 *
 * ### The controls are deliberately few
 *
 * Add a text layer, select one, nudge it, remove it, discard everything. That is
 * what the approved frames show as reachable from this Admin screen, and it is
 * what the delivered document model supports without inventing an editor
 * architecture. Anything richer belongs to the APP3 Studio, which owns that
 * product surface.
 */
export function DesignAuthoringSurface({
  authoring,
  onSaveAsVersion,
}: DesignAuthoringSurfaceProps) {
  const document = authoring.document;
  if (document === null) {
    return null;
  }

  const selected = document.elements.find((element) => element.id === authoring.selectedElementId);

  return (
    <section className="request-design-case__authoring" data-testid="design-authoring-surface">
      <header className="request-design-case__panel-header">
        <h3 className="request-design-case__notice-title">{COPY.authoring.title}</h3>
        <button
          className="request-design-case__button"
          type="button"
          onClick={authoring.close}
          data-testid="design-authoring-close"
        >
          {COPY.authoring.close}
        </button>
      </header>

      <p className="request-design-case__hint">{COPY.authoring.hint}</p>
      <p className="request-design-case__hint" data-testid="design-authoring-scope">
        {COPY.authoring.scopeNote}
      </p>

      <DesignDocumentPreview
        document={document}
        selectedElementId={authoring.selectedElementId}
        onSelect={authoring.selectElement}
        testId="design-authoring-stage"
      />

      <div className="request-design-case__authoring-controls">
        <button
          className="request-design-case__button"
          type="button"
          disabled={!authoring.canAddText}
          onClick={() => {
            authoring.addText(COPY.authoring.addTextValue);
          }}
          data-testid="design-authoring-add-text"
        >
          {COPY.authoring.addText}
        </button>
        {!authoring.canAddText ? (
          <span className="request-design-case__hint">{COPY.authoring.limitReached}</span>
        ) : null}
        <button
          className="request-design-case__button"
          type="button"
          disabled={!authoring.dirty}
          onClick={authoring.reset}
          data-testid="design-authoring-reset"
        >
          {COPY.authoring.reset}
        </button>
      </div>

      {/*
        The layer list is the keyboard route to selection. The stage carries no
        focus-trapping construct, so an operator who cannot use a pointer is
        never sent to the canvas to make a selection.
      */}
      <h4 className="request-design-case__notice-title">{COPY.authoring.elements}</h4>
      {document.elements.length === 0 ? (
        <p className="request-design-case__hint">{COPY.authoring.elementsEmpty}</p>
      ) : (
        <ul className="request-design-case__layers">
          {document.elements.map((element) => (
            <li key={element.id}>
              <button
                className="request-design-case__button"
                type="button"
                aria-pressed={element.id === authoring.selectedElementId}
                onClick={() => {
                  authoring.selectElement(element.id);
                }}
                data-testid={`design-authoring-layer-${element.id}`}
              >
                {`${element.type} · ${element.id}`}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected === undefined ? null : (
        <div className="request-design-case__form" data-testid="design-authoring-inspector">
          <NumberField
            label={COPY.authoring.moveX}
            value={selected.transform.x}
            testId="design-authoring-x"
            onChange={(x) => {
              authoring.moveSelected({ x });
            }}
          />
          <NumberField
            label={COPY.authoring.moveY}
            value={selected.transform.y}
            testId="design-authoring-y"
            onChange={(y) => {
              authoring.moveSelected({ y });
            }}
          />
          <button
            className="request-design-case__button"
            type="button"
            onClick={authoring.removeSelected}
            data-testid="design-authoring-remove"
          >
            {COPY.authoring.remove}
          </button>
        </div>
      )}

      {authoring.saveable ? null : (
        <div className="request-design-case__notice" role="alert" data-tone="conflict">
          <h4 className="request-design-case__notice-title">{COPY.authoring.invalidTitle}</h4>
          <p>{COPY.authoring.invalidBody}</p>
        </div>
      )}

      <div className="request-design-case__actions">
        {authoring.dirty ? (
          <span className="request-design-case__hint" data-testid="design-authoring-unsaved">
            {COPY.authoring.unsaved}
          </span>
        ) : null}
        <button
          className="request-design-case__button request-design-case__button--primary"
          type="button"
          disabled={!authoring.saveable}
          onClick={onSaveAsVersion}
          data-testid="design-authoring-save"
        >
          {COPY.authoring.saveAsVersion}
        </button>
      </div>
    </section>
  );
}

interface NumberFieldProps {
  readonly label: string;
  readonly value: number;
  readonly testId: string;
  readonly onChange: (value: number) => void;
}

function NumberField({ label, value, testId, onChange }: NumberFieldProps) {
  return (
    <label className="request-design-case__field">
      <span className="request-design-case__field-label">{label}</span>
      <input
        className="request-design-case__input"
        type="number"
        value={String(value)}
        data-testid={testId}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) {
            onChange(next);
          }
        }}
      />
    </label>
  );
}
