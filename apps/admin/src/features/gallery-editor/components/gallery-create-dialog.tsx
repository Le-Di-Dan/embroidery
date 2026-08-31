'use client';

import { useState } from 'react';

import { AdminTextField } from '../../../shared/forms/admin-text-field';
import { GALLERY_EDITOR_COPY } from '../model/gallery-editor-copy';
import { classifyCreateFailure } from '../model/gallery-editor-failure';
import {
  buildGalleryCreateBody,
  EMPTY_GALLERY_CREATE_VALUES,
  hasGalleryCreateErrors,
  suggestGallerySlug,
  validateGalleryCreate,
  type GalleryCreateValues,
} from '../model/gallery-create-values';
import { useGalleryCreateMutation } from '../hooks/use-gallery-entry-mutations';
import { GalleryCheckbox, GalleryTextArea } from './gallery-fields';
import { GalleryDialog } from './gallery-dialog';
import { GalleryValidationSummary } from './gallery-validation-summary';

interface GalleryCreateDialogProps {
  readonly onClose: () => void;
  /** Receives the server's id for the entry it just created. */
  readonly onCreated: (entryId: string) => void;
}

/**
 * The create bootstrap (`866:905`, `867:907` — "Tạo mục mới").
 *
 * ## A bootstrap, not a second editor
 *
 * It asks for the five fields the create body requires and stops. The linked
 * product, both SEO fields, the images and the publication state are all
 * reachable one navigation later, in the editor that owns them — building them
 * here would be a second authoring surface with its own validation, its own
 * dirty state and its own way of disagreeing with the first.
 *
 * ## The slug is visible, editable and the operator's
 *
 * It is shown as an ordinary required field, validated against the canonical
 * public grammar before the request is sent, and never generated behind the
 * operator's back. The suggestion is an action they trigger, writing into the
 * same visible field they can then change — because the value becomes the
 * entry's permanent public address, and the editor is honest that it cannot be
 * changed afterwards.
 *
 * ## Failure keeps everything on screen
 *
 * A refusal — a taken address above all — leaves every value the operator
 * typed exactly where it was, so the fix is to edit one field rather than to
 * retype the form. Nothing here renders a server message, code or request id.
 */
export function GalleryCreateDialog({ onClose, onCreated }: GalleryCreateDialogProps) {
  const [values, setValues] = useState<GalleryCreateValues>(EMPTY_GALLERY_CREATE_VALUES);
  const [submitted, setSubmitted] = useState(false);
  const mutation = useGalleryCreateMutation();
  const copy = GALLERY_EDITOR_COPY.create;

  const errors = validateGalleryCreate(values, copy.validation);
  const pending = mutation.isPending;
  const failure = mutation.isError ? copy.failure[classifyCreateFailure(mutation.error)] : null;

  const patch = (next: Partial<GalleryCreateValues>) =>
    setValues((current) => ({ ...current, ...next }));

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (hasGalleryCreateErrors(errors)) {
      return;
    }
    const body = buildGalleryCreateBody(values);
    if (body === null) {
      return;
    }
    mutation.mutate(body, {
      // The **returned id**, never the slug: the editor is addressed by the
      // entry's identity, and the slug is the public address of a different
      // surface entirely.
      onSuccess: (entry) => onCreated(entry.galleryEntryId),
    });
  };

  return (
    <GalleryDialog
      title={copy.title}
      describedBy="gallery-create-help"
      dismissible={!pending}
      onClose={onClose}
      testId="gallery-create-dialog"
      footer={
        <div className="gallery-dialog__actions">
          <button
            type="button"
            className="gallery-dialog__secondary"
            onClick={onClose}
            disabled={pending}
          >
            {copy.cancel}
          </button>
          <button
            type="submit"
            form="gallery-create-form"
            className="gallery-dialog__primary"
            disabled={pending}
            aria-busy={pending}
            data-testid="gallery-create-submit"
          >
            {pending ? copy.submitting : copy.submit}
          </button>
        </div>
      }
    >
      <p className="gallery-dialog__body-text" id="gallery-create-help">
        {copy.help}
      </p>

      {submitted ? (
        <GalleryValidationSummary
          title={copy.validation.summaryTitle}
          messages={[errors.title, errors.slug, errors.description, errors.displayOrder]}
        />
      ) : null}

      {failure === null ? null : (
        <div className="gallery-editor__failure" role="alert" data-testid="gallery-create-failure">
          <p className="gallery-editor__failure-title">{failure.title}</p>
          <p className="gallery-editor__failure-body">{failure.body}</p>
        </div>
      )}

      <form
        id="gallery-create-form"
        className="gallery-editor__form"
        onSubmit={onSubmit}
        noValidate
      >
        <AdminTextField
          label={copy.fields.title}
          value={values.title}
          disabled={pending}
          testId="gallery-create-title"
          onChange={(title) => patch({ title })}
          {...(submitted && errors.title !== undefined ? { error: errors.title } : {})}
        />

        <AdminTextField
          label={copy.fields.slug}
          value={values.slug}
          help={copy.fields.slugHelp}
          disabled={pending}
          testId="gallery-create-slug"
          onChange={(slug) => patch({ slug })}
          {...(submitted && errors.slug !== undefined ? { error: errors.slug } : {})}
        />
        <button
          type="button"
          className="gallery-editor__inline-action"
          disabled={pending || values.title.trim() === ''}
          onClick={() => patch({ slug: suggestGallerySlug(values.title) })}
          data-testid="gallery-create-suggest-slug"
        >
          {copy.suggestSlug}
        </button>

        <GalleryTextArea
          label={copy.fields.description}
          value={values.description}
          disabled={pending}
          testId="gallery-create-description"
          onChange={(description) => patch({ description })}
          {...(submitted && errors.description !== undefined ? { error: errors.description } : {})}
        />

        <AdminTextField
          label={copy.fields.displayOrder}
          value={values.displayOrder}
          help={copy.fields.displayOrderHelp}
          inputMode="numeric"
          disabled={pending}
          testId="gallery-create-display-order"
          onChange={(displayOrder) => patch({ displayOrder })}
          {...(submitted && errors.displayOrder !== undefined
            ? { error: errors.displayOrder }
            : {})}
        />

        <GalleryCheckbox
          label={copy.fields.isIndexable}
          checked={values.isIndexable}
          disabled={pending}
          testId="gallery-create-indexable"
          onChange={(isIndexable) => patch({ isIndexable })}
        />
      </form>
    </GalleryDialog>
  );
}
