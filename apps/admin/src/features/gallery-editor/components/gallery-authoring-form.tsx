'use client';

import { AdminTextField } from '../../../shared/forms/admin-text-field';
import { GALLERY_EDITOR_COPY } from '../model/gallery-editor-copy';
import type {
  GalleryAuthoringErrors,
  GalleryAuthoringValues,
} from '../model/gallery-authoring-values';
import { GalleryCheckbox, GalleryReadOnlyField, GalleryTextArea } from './gallery-fields';
import { GalleryLinkedProductField } from './gallery-linked-product-field';
import { GalleryValidationSummary } from './gallery-validation-summary';

interface GalleryAuthoringFormProps {
  readonly values: GalleryAuthoringValues;
  /** The immutable public address, shown read-only beside the editable fields. */
  readonly slug: string;
  readonly errors: GalleryAuthoringErrors;
  readonly showErrors: boolean;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly onChange: (patch: Partial<GalleryAuthoringValues>) => void;
  readonly onSubmit: () => void;
  readonly onDiscard: () => void;
  /** The save failure banner, owned by the screen so it survives a remount. */
  readonly failure: { readonly title: string; readonly body: string } | null;
}

/**
 * The authoring fields (`868:909`, `870:1368`).
 *
 * ## Explicit save, never save-as-you-type
 *
 * Every keystroke updating the server would turn an operator's half-typed
 * sentence into stored copy, and would make the entry's `updated_at` — which is
 * the concurrency token every guarded write depends on — advance continuously
 * under their own other tab. So the form holds the values and one action sends
 * the diff.
 *
 * ## The slug is read-only, and says why in the operator's words
 *
 * It is a real `<input readonly>` rather than a paragraph: the value stays
 * selectable and keyboard-reachable, and `readonly` is the semantic assistive
 * technology announces. The help text states the rule — the address is fixed
 * after creation — without naming a DTO, an endpoint or a checkpoint.
 *
 * ## The fields that are not here
 *
 * `status` and `archivedAt` are not inputs at all: the publication panel
 * commands the lifecycle, and archival evidence is the server's to write. The
 * images are not here either; they are a complete ordered set replaced by their
 * own operation, and mixing them into this diff would make one save mean two
 * different kinds of change.
 */
export function GalleryAuthoringForm({
  values,
  slug,
  errors,
  showErrors,
  dirty,
  saving,
  onChange,
  onSubmit,
  onDiscard,
  failure,
}: GalleryAuthoringFormProps) {
  const copy = GALLERY_EDITOR_COPY.authoring;

  return (
    <form
      className="gallery-editor__panel gallery-authoring"
      aria-labelledby="gallery-authoring-title"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="gallery-authoring__header">
        <h2 className="gallery-editor__panel-title" id="gallery-authoring-title">
          {copy.groupTitle}
        </h2>
        {/*
          Both actions exist only once there is something to act on. On an
          untouched record "Lưu thay đổi" would send nothing and "Huỷ thay đổi"
          would discard nothing, so offering them would state that a change is
          pending when none is.
        */}
        {dirty ? (
          <div className="gallery-authoring__header-actions">
            <button
              type="button"
              className="gallery-editor__secondary"
              onClick={onDiscard}
              disabled={saving}
            >
              {copy.discard}
            </button>
            <button
              type="submit"
              className="gallery-editor__primary"
              disabled={saving}
              aria-busy={saving}
              data-testid="gallery-authoring-save"
            >
              {saving ? copy.saving : copy.save}
            </button>
          </div>
        ) : null}
      </div>

      {showErrors ? (
        <GalleryValidationSummary
          title={copy.validation.summaryTitle}
          messages={[errors.title, errors.displayOrder, errors.seoTitle, errors.seoDescription]}
        />
      ) : null}

      {failure === null ? null : (
        <div
          className="gallery-editor__failure"
          role="alert"
          data-testid="gallery-authoring-failure"
        >
          <p className="gallery-editor__failure-title">{failure.title}</p>
          <p className="gallery-editor__failure-body">{failure.body}</p>
        </div>
      )}

      <AdminTextField
        label={copy.fields.title}
        value={values.title}
        disabled={saving}
        testId="gallery-authoring-title-input"
        onChange={(title) => onChange({ title })}
        {...(showErrors && errors.title !== undefined ? { error: errors.title } : {})}
      />

      <GalleryReadOnlyField
        label={copy.fields.slug}
        value={slug}
        help={copy.fields.slugLocked}
        testId="gallery-authoring-slug"
      />

      <GalleryTextArea
        label={copy.fields.description}
        value={values.description}
        disabled={saving}
        rows={5}
        testId="gallery-authoring-description"
        onChange={(description) => onChange({ description })}
      />

      <AdminTextField
        label={copy.fields.displayOrder}
        value={values.displayOrder}
        help={copy.fields.displayOrderHelp}
        inputMode="numeric"
        disabled={saving}
        testId="gallery-authoring-display-order"
        onChange={(displayOrder) => onChange({ displayOrder })}
        {...(showErrors && errors.displayOrder !== undefined ? { error: errors.displayOrder } : {})}
      />

      <GalleryLinkedProductField
        productId={values.linkedProductId}
        disabled={saving}
        onChange={(linkedProductId) => onChange({ linkedProductId })}
      />

      <fieldset className="gallery-authoring__seo">
        <legend className="gallery-editor__panel-title">{copy.seoGroupTitle}</legend>

        <AdminTextField
          label={copy.fields.seoTitle}
          value={values.seoTitle}
          help={copy.fields.seoTitleHelp}
          disabled={saving}
          testId="gallery-authoring-seo-title"
          onChange={(seoTitle) => onChange({ seoTitle })}
          {...(showErrors && errors.seoTitle !== undefined ? { error: errors.seoTitle } : {})}
        />

        <GalleryTextArea
          label={copy.fields.seoDescription}
          value={values.seoDescription}
          help={copy.fields.seoDescriptionHelp}
          disabled={saving}
          testId="gallery-authoring-seo-description"
          onChange={(seoDescription) => onChange({ seoDescription })}
          {...(showErrors && errors.seoDescription !== undefined
            ? { error: errors.seoDescription }
            : {})}
        />

        <GalleryCheckbox
          label={copy.fields.isIndexable}
          checked={values.isIndexable}
          help={copy.fields.isIndexableHelp}
          disabled={saving}
          testId="gallery-authoring-indexable"
          onChange={(isIndexable) => onChange({ isIndexable })}
        />
      </fieldset>
    </form>
  );
}
