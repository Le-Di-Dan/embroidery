'use client';

import { useEffect, useId, useRef, useState } from 'react';

import type { CreateDesignTemplateBody } from '@embroidery/api-client';

import { AdminTextField } from '../../../shared/forms/admin-text-field';
import { DESIGN_TEMPLATE_COPY } from '../model/design-template-copy';
import { classifyCreateFailure } from '../model/design-template-failure';

interface CreateDesignTemplateDialogProps {
  readonly submitting: boolean;
  readonly failure: unknown;
  readonly onClose: () => void;
  readonly onSubmit: (body: CreateDesignTemplateBody) => void;
}

const NAME_MAX = 120;
const DESCRIPTION_MAX = 2000;

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The bounded create flow the list owns (`596:8`).
 *
 * The form asks for exactly what `CreateDesignTemplateBody` accepts and nothing
 * else. There is **no** slug input — the server derives it from the name, and a
 * field the server ignores is a promise the screen cannot keep. There is no
 * status selector, no version, no document and no schema version either: a
 * template is created in `DRAFT` with no version at all, and offering a choice
 * would imply the caller has one.
 *
 * The placement scope is genuinely optional in the contract and must be a
 * complete product/side/area triple when supplied. A partial triple is worse
 * than none, and the approved list screen has no side/area picker to build one
 * with — so this flow creates an unscoped draft and leaves scoping to the
 * editor. Recorded as a deliberate narrowing rather than a missing field.
 *
 * Validation is client-side for shape only. The server remains the authority on
 * the slug collision, which is the one failure the operator can act on.
 */
export function CreateDesignTemplateDialog({
  submitting,
  failure,
  onClose,
  onSubmit,
}: CreateDesignTemplateDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [touched, setTouched] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<Element | null>(null);
  const titleId = useId();
  const helpId = useId();

  useEffect(() => {
    restoreTo.current = document.activeElement;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();
    return () => {
      const target = restoreTo.current;
      if (target instanceof HTMLElement && target.isConnected) target.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        // Blocked while a create is in flight: this dialog owns the only
        // feedback for a request that has already left the browser.
        if (!submitting) onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (panel === null) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      if (focusable.length === 0) return;
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onClose, submitting]);

  const trimmedName = name.trim();
  const nameError =
    trimmedName === ''
      ? DESIGN_TEMPLATE_COPY.create.nameRequired
      : trimmedName.length > NAME_MAX
        ? DESIGN_TEMPLATE_COPY.create.nameTooLong
        : undefined;
  const descriptionError =
    description.trim().length > DESCRIPTION_MAX
      ? DESIGN_TEMPLATE_COPY.create.descriptionTooLong
      : undefined;
  const invalid = nameError !== undefined || descriptionError !== undefined;

  const submit = () => {
    setTouched(true);
    if (invalid || submitting) return;
    const trimmedDescription = description.trim();
    onSubmit({
      name: trimmedName,
      // Omitted rather than sent empty: the member is optional and the
      // workspace compiles with `exactOptionalPropertyTypes`.
      ...(trimmedDescription === '' ? {} : { description: trimmedDescription }),
    });
  };

  const failureKind =
    failure === null || failure === undefined ? null : classifyCreateFailure(failure);

  return (
    <div
      className="design-template-dialog__backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="design-template-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={helpId}
        tabIndex={-1}
        data-testid="template-create-dialog"
      >
        <h2 className="design-template-dialog__title" id={titleId}>
          {DESIGN_TEMPLATE_COPY.create.title}
        </h2>
        <p className="design-template-dialog__help" id={helpId}>
          {DESIGN_TEMPLATE_COPY.create.help}
        </p>

        <AdminTextField
          label={DESIGN_TEMPLATE_COPY.create.nameLabel}
          value={name}
          disabled={submitting}
          help={DESIGN_TEMPLATE_COPY.create.nameHelp}
          testId="template-create-name"
          {...(touched && nameError !== undefined ? { error: nameError } : {})}
          onChange={setName}
        />

        <AdminTextField
          label={DESIGN_TEMPLATE_COPY.create.descriptionLabel}
          value={description}
          disabled={submitting}
          help={DESIGN_TEMPLATE_COPY.create.descriptionHelp}
          testId="template-create-description"
          {...(descriptionError === undefined ? {} : { error: descriptionError })}
          onChange={setDescription}
        />

        {/* The slug is a consequence, stated so the operator understands why
            there is nothing to fill in. */}
        <p className="design-template-dialog__note">{DESIGN_TEMPLATE_COPY.create.slugNote}</p>

        {failureKind === null ? null : (
          <div className="design-template-dialog__failure" role="alert">
            <p className="design-template-dialog__failure-title">
              {failureKind === 'address-unreserved'
                ? DESIGN_TEMPLATE_COPY.create.addressUnreservedTitle
                : DESIGN_TEMPLATE_COPY.create.failedTitle}
            </p>
            <p className="design-template-dialog__failure-body">
              {failureKind === 'address-unreserved'
                ? DESIGN_TEMPLATE_COPY.create.addressUnreservedBody
                : DESIGN_TEMPLATE_COPY.create.failedBody}
            </p>
          </div>
        )}

        <div className="design-template-dialog__actions">
          <button
            type="button"
            className="design-template-dialog__secondary"
            disabled={submitting}
            onClick={onClose}
          >
            {DESIGN_TEMPLATE_COPY.create.cancel}
          </button>
          <button
            type="button"
            className="design-template-dialog__primary"
            disabled={submitting || (touched && invalid)}
            aria-busy={submitting}
            data-testid="template-create-submit"
            onClick={submit}
          >
            {submitting
              ? DESIGN_TEMPLATE_COPY.create.submitting
              : DESIGN_TEMPLATE_COPY.create.submit}
          </button>
        </div>
      </div>
    </div>
  );
}
