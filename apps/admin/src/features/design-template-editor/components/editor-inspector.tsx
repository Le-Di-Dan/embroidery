'use client';

import { DESIGN_FONT_REGISTRY } from '@embroidery/design-document';
import type {
  DesignElement,
  DesignElementTransform,
  TextElement,
} from '@embroidery/design-document';

import { AdminTextField } from '../../../shared/forms/admin-text-field';
import { DESIGN_TEMPLATE_EDITOR_COPY } from '../model/design-template-editor-copy';

interface EditorInspectorProps {
  readonly element: DesignElement | null;
  readonly editable: boolean;
  readonly onUpdateText: (patch: Partial<Omit<TextElement, 'id' | 'type' | 'transform'>>) => void;
  readonly onUpdateTransform: (patch: Partial<DesignElementTransform>) => void;
}

/**
 * The context-sensitive inspector (`601:48`, right column, 260px minimum).
 *
 * Every control is a labelled field carrying its **unit** in the label, because
 * a bare "Width" beside a number is ambiguous between px and mm in a product
 * whose whole geometry contract is a px↔mm conversion.
 *
 * Numbers are edited as text and committed only when they parse. `APP3-A01` §17
 * established the reason and it applies unchanged: a `type="number"` input
 * invites the browser to reformat, round, exponent-notate or blank a value on
 * scroll, and a document must persist what the operator entered.
 *
 * The font is chosen from `DESIGN_FONT_REGISTRY` — the controlled registry
 * `IMP-D044` PO-10 makes the only thing that turns a `fontId` into a face. There
 * is no free-text family field, so a document cannot ask a browser for a font
 * the server never approved.
 */
export function EditorInspector({
  element,
  editable,
  onUpdateText,
  onUpdateTransform,
}: EditorInspectorProps) {
  return (
    <section
      className="template-editor-inspector"
      aria-label={DESIGN_TEMPLATE_EDITOR_COPY.inspector.title}
      data-testid="editor-inspector"
    >
      <h2 className="template-editor-inspector__title">
        {DESIGN_TEMPLATE_EDITOR_COPY.inspector.title}
      </h2>

      {element === null ? (
        <p className="template-editor-inspector__empty" data-testid="editor-inspector-empty">
          {DESIGN_TEMPLATE_EDITOR_COPY.inspector.none}
        </p>
      ) : (
        <>
          {element.type === 'text' ? (
            <TextSection element={element} editable={editable} onUpdateText={onUpdateText} />
          ) : (
            <p
              className="template-editor-inspector__empty"
              data-testid="editor-inspector-unsupported"
            >
              {DESIGN_TEMPLATE_EDITOR_COPY.inspector.unsupported}
            </p>
          )}

          <TransformSection
            transform={element.transform}
            editable={editable}
            onUpdateTransform={onUpdateTransform}
          />
        </>
      )}
    </section>
  );
}

function TextSection({
  element,
  editable,
  onUpdateText,
}: {
  readonly element: TextElement;
  readonly editable: boolean;
  readonly onUpdateText: (patch: Partial<Omit<TextElement, 'id' | 'type' | 'transform'>>) => void;
}) {
  const copy = DESIGN_TEMPLATE_EDITOR_COPY.inspector;

  return (
    <fieldset className="template-editor-inspector__section" disabled={!editable}>
      <legend>{copy.textSection}</legend>

      <AdminTextField
        label={copy.textLabel}
        value={element.text}
        disabled={!editable}
        testId="editor-text-value"
        onChange={(text) => {
          onUpdateText({ text });
        }}
      />

      <label className="template-editor-inspector__label" htmlFor="editor-font-id">
        {copy.fontLabel}
      </label>
      <select
        id="editor-font-id"
        className="template-editor-inspector__select"
        value={element.fontId}
        disabled={!editable}
        data-testid="editor-font-id"
        onChange={(event) => {
          onUpdateText({ fontId: event.target.value });
        }}
      >
        {DESIGN_FONT_REGISTRY.map((font) => (
          <option key={font.fontId} value={font.fontId}>
            {font.family}
          </option>
        ))}
      </select>
      <p className="template-editor-inspector__help">{copy.fontNote}</p>

      <NumberField
        label={copy.fontSizeLabel}
        value={element.fontSizePx}
        editable={editable}
        testId="editor-font-size"
        onCommit={(fontSizePx) => {
          onUpdateText({ fontSizePx });
        }}
      />
      <NumberField
        label={copy.fontWeightLabel}
        value={element.fontWeight}
        editable={editable}
        testId="editor-font-weight"
        onCommit={(fontWeight) => {
          onUpdateText({ fontWeight });
        }}
      />

      <label className="template-editor-inspector__label" htmlFor="editor-text-align">
        {copy.alignLabel}
      </label>
      <select
        id="editor-text-align"
        className="template-editor-inspector__select"
        value={element.textAlign}
        disabled={!editable}
        data-testid="editor-text-align"
        onChange={(event) => {
          onUpdateText({ textAlign: event.target.value as TextElement['textAlign'] });
        }}
      >
        <option value="left">{copy.alignLeft}</option>
        <option value="center">{copy.alignCenter}</option>
        <option value="right">{copy.alignRight}</option>
      </select>

      <AdminTextField
        label={copy.fillLabel}
        value={element.fill}
        disabled={!editable}
        testId="editor-text-fill"
        onChange={(fill) => {
          onUpdateText({ fill });
        }}
      />
    </fieldset>
  );
}

function TransformSection({
  transform,
  editable,
  onUpdateTransform,
}: {
  readonly transform: DesignElementTransform;
  readonly editable: boolean;
  readonly onUpdateTransform: (patch: Partial<DesignElementTransform>) => void;
}) {
  const copy = DESIGN_TEMPLATE_EDITOR_COPY.inspector;
  const fields: readonly {
    readonly key: keyof DesignElementTransform;
    readonly label: string;
    readonly testId: string;
  }[] = [
    { key: 'x', label: copy.xLabel, testId: 'editor-transform-x' },
    { key: 'y', label: copy.yLabel, testId: 'editor-transform-y' },
    { key: 'width', label: copy.widthLabel, testId: 'editor-transform-width' },
    { key: 'height', label: copy.heightLabel, testId: 'editor-transform-height' },
    { key: 'rotationDeg', label: copy.rotationLabel, testId: 'editor-transform-rotation' },
  ];

  return (
    <fieldset className="template-editor-inspector__section" disabled={!editable}>
      <legend>{copy.transformSection}</legend>
      {fields.map((field) => (
        <NumberField
          key={field.key}
          label={field.label}
          value={transform[field.key]}
          editable={editable}
          testId={field.testId}
          onCommit={(next) => {
            onUpdateTransform({ [field.key]: next });
          }}
        />
      ))}
    </fieldset>
  );
}

/**
 * A numeric field that never writes a value it could not read.
 *
 * The control is uncontrolled between keystrokes so an operator can clear it and
 * retype; only a finite parse reaches the document. An unparseable entry shows
 * the error and leaves the last good value in the document — silently coercing
 * an empty field to `0` would move an element to the origin because someone
 * pressed backspace.
 */
function NumberField({
  label,
  value,
  editable,
  testId,
  onCommit,
}: {
  readonly label: string;
  readonly value: number;
  readonly editable: boolean;
  readonly testId: string;
  readonly onCommit: (value: number) => void;
}) {
  return (
    <AdminTextField
      label={label}
      value={String(value)}
      disabled={!editable}
      inputMode="decimal"
      testId={testId}
      onChange={(raw) => {
        const parsed = Number(raw);
        if (raw.trim() !== '' && Number.isFinite(parsed)) onCommit(parsed);
      }}
    />
  );
}
