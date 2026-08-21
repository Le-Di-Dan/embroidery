'use client';

import { useState } from 'react';
import type { AuthorDesignVersionBody } from '@embroidery/api-client';
import type { DesignDocument } from '@embroidery/design-document';

import { presentVersionStatus } from '../model/design-case-presentation';
import type { AuthoringFailure } from '../model/request-design-case-failure';
import { REQUEST_DESIGN_CASE_COPY as COPY } from '../model/request-design-case-copy';
import { DesignDialog } from './design-dialog';

/**
 * Where the document about to be persisted came from.
 *
 * A discriminated union rather than a nullable pair, so the dialog cannot render
 * a source line that disagrees with the document it will send. `APP6-A02` §16
 * makes the truthfulness of this line a requirement: `695:3` shows the operator
 * *"Chép từ v1 (đã yêu cầu chỉnh sửa)"*, and that sentence must name the version
 * whose exact persisted document is in `document`.
 */
export type CreateSource =
  | { readonly kind: 'submitted'; readonly document: DesignDocument }
  | {
      readonly kind: 'predecessor';
      readonly document: DesignDocument;
      readonly version: number;
      readonly status: string;
    }
  | { readonly kind: 'working'; readonly document: DesignDocument }
  | { readonly kind: 'absent' };

interface CreateVersionDialogProps {
  readonly source: CreateSource;
  /** Derived server-side and shown read-only. Never an editable override. */
  readonly branch: 'CATALOG' | 'CUSTOMER_OWNED';
  readonly running: boolean;
  readonly failure: AuthoringFailure | null;
  readonly onSubmit: (body: AuthorDesignVersionBody) => void;
  readonly onDismiss: () => void;
}

interface CopFields {
  readonly sideLabel: string;
  readonly areaLabel: string;
  readonly width: string;
  readonly height: string;
}

const EMPTY_COP: CopFields = { sideLabel: '', areaLabel: '', width: '', height: '' };

/**
 * `695:3` — the create-DRAFT form.
 *
 * ### The source is named, and it is the document that gets sent
 *
 * The source line and `source.document` come from one union member, so the
 * dialog cannot claim to copy v1 while sending v2's artwork. A revision is built
 * from the **exact predecessor** the operator selected — never from "latest",
 * never from "current" and never from a blank document invented because the
 * submitted source was missing.
 *
 * ### Catalog placement is server authority, and is not on this form
 *
 * The Catalog branch shows its context read-only and sends **nothing** but the
 * document: the product, variant, side and area are derived server-side from the
 * request and its submitted session, and a field here would be a way to freeze a
 * version onto somebody else's product. The customer-owned branch is the only
 * one with inputs, because it is the only one with no Catalog authority to
 * derive them from.
 *
 * ### The envelope is the embroidery area, not the garment
 *
 * The two dimensions describe the area to be stitched. The form says so, because
 * `customer_owned_products` also carries the item's own size and adopting it
 * would silently claim a customer's whole jacket as the stitch area.
 *
 * ### What the body never carries
 *
 * No request id, no design case id, no branch, no Catalog ids, no status, no
 * version number, no parent version id, no document hash and no Admin id. Every
 * one is server-owned and `APP6-B08`'s schema is `.strict()`, so sending one is
 * a refusal naming the unrecognised key rather than a silently ignored field.
 */
export function CreateVersionDialog({
  source,
  branch,
  running,
  failure,
  onSubmit,
  onDismiss,
}: CreateVersionDialogProps) {
  const [fields, setFields] = useState<CopFields>(EMPTY_COP);
  const [touched, setTouched] = useState(false);

  const sourceLine =
    source.kind === 'submitted'
      ? COPY.create.sourceSubmitted
      : source.kind === 'predecessor'
        ? COPY.create.sourcePredecessor(source.version, presentVersionStatus(source.status))
        : source.kind === 'working'
          ? COPY.create.sourceWorking
          : COPY.create.sourceAbsent;

  const copValid =
    branch !== 'CUSTOMER_OWNED' ||
    (fields.sideLabel.trim() !== '' &&
      fields.areaLabel.trim() !== '' &&
      isPositive(fields.width) &&
      isPositive(fields.height));

  const submittable = source.kind !== 'absent' && copValid && !running;

  const message =
    failure === null
      ? null
      : failure === 'rejected'
        ? COPY.create.errorRejected
        : failure === 'ineligible'
          ? COPY.create.errorIneligible
          : failure === 'missing'
            ? COPY.create.errorMissing
            : failure === 'unauthenticated'
              ? COPY.create.errorUnauthenticated
              : COPY.create.errorRetryable;

  const submit = () => {
    setTouched(true);
    if (source.kind === 'absent' || !copValid || running) {
      return;
    }
    onSubmit(buildBody(source.document, branch, fields));
  };

  return (
    <DesignDialog
      title={COPY.create.title}
      busy={running}
      onDismiss={onDismiss}
      testId="design-create-dialog"
    >
      <p className="request-design-case__dialog-body">{COPY.create.body}</p>

      <dl className="request-design-case__definitions">
        <div className="request-design-case__definition">
          <dt>{COPY.create.sourceLabel}</dt>
          <dd data-testid="design-create-source">{sourceLine}</dd>
        </div>
        <div className="request-design-case__definition">
          <dt>{COPY.create.branchLabel}</dt>
          {/* Read-only. The branch is derived from persisted request state and
              is not a choice this form offers. */}
          <dd data-testid="design-create-branch">
            {branch === 'CATALOG' ? COPY.context.branchCatalog : COPY.context.branchCustomerOwned}
          </dd>
        </div>
      </dl>

      {branch === 'CATALOG' ? (
        <p className="request-design-case__hint" data-testid="design-create-catalog-note">
          {COPY.create.catalogNote}
        </p>
      ) : (
        <div className="request-design-case__form" data-testid="design-create-cop-fields">
          <TextField
            label={COPY.create.sideLabel}
            value={fields.sideLabel}
            testId="design-create-side"
            invalid={touched && fields.sideLabel.trim() === ''}
            error={COPY.create.requiredField}
            onChange={(value) => {
              setFields((current) => ({ ...current, sideLabel: value }));
            }}
          />
          <TextField
            label={COPY.create.areaLabel}
            value={fields.areaLabel}
            testId="design-create-area"
            invalid={touched && fields.areaLabel.trim() === ''}
            error={COPY.create.requiredField}
            onChange={(value) => {
              setFields((current) => ({ ...current, areaLabel: value }));
            }}
          />
          <TextField
            label={COPY.create.widthLabel}
            value={fields.width}
            testId="design-create-width"
            invalid={touched && !isPositive(fields.width)}
            error={COPY.create.positiveNumber}
            onChange={(value) => {
              setFields((current) => ({ ...current, width: value }));
            }}
          />
          <TextField
            label={COPY.create.heightLabel}
            value={fields.height}
            testId="design-create-height"
            invalid={touched && !isPositive(fields.height)}
            error={COPY.create.positiveNumber}
            onChange={(value) => {
              setFields((current) => ({ ...current, height: value }));
            }}
          />
          <p className="request-design-case__hint">{COPY.create.copNote}</p>
        </div>
      )}

      {message === null ? null : (
        <p className="request-design-case__error" role="alert" data-testid="design-create-error">
          {message}
        </p>
      )}

      <div className="request-design-case__dialog-actions">
        <button
          className="request-design-case__button"
          type="button"
          disabled={running}
          onClick={onDismiss}
        >
          {COPY.create.cancel}
        </button>
        <button
          className="request-design-case__button request-design-case__button--primary"
          type="button"
          disabled={!submittable}
          aria-busy={running}
          data-testid="design-create-submit"
          onClick={submit}
        >
          {running ? COPY.create.submitting : COPY.create.submit}
        </button>
      </div>
    </DesignDialog>
  );
}

/**
 * The create body, assembled once.
 *
 * The Catalog branch sends the document **and nothing else**: sending a
 * placement label on it is a refusal, not a silent ignore, because the server
 * derives the placement from the request. The customer-owned branch adds the
 * four facts it is the only branch able to supply.
 *
 * The two dimensions cross as **numbers**, which is what `APP6-B08` publishes:
 * `physical_width_mm` is `numeric` with no fixed scale, and the design document
 * carries its geometry as JSON numbers, so the envelope and the document it
 * bounds are compared by the design engine's own quantized comparison. Parsing
 * to a decimal string here would introduce a second precision rule beside P01's
 * quantization.
 */
function buildBody(
  document: DesignDocument,
  branch: 'CATALOG' | 'CUSTOMER_OWNED',
  fields: CopFields,
): AuthorDesignVersionBody {
  const body = { document } as unknown as AuthorDesignVersionBody;
  if (branch !== 'CUSTOMER_OWNED') {
    return body;
  }
  return {
    ...body,
    placementSideLabel: fields.sideLabel.trim(),
    placementAreaLabel: fields.areaLabel.trim(),
    physicalWidthMm: Number(fields.width),
    physicalHeightMm: Number(fields.height),
  };
}

function isPositive(value: string): boolean {
  const parsed = Number(value);
  return value.trim() !== '' && Number.isFinite(parsed) && parsed > 0;
}

interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly testId: string;
  readonly invalid: boolean;
  readonly error: string;
  readonly onChange: (value: string) => void;
}

function TextField({ label, value, testId, invalid, error, onChange }: TextFieldProps) {
  return (
    <label className="request-design-case__field">
      <span className="request-design-case__field-label">{label}</span>
      <input
        className="request-design-case__input"
        type="text"
        value={value}
        aria-invalid={invalid}
        data-testid={testId}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      {invalid ? <span className="request-design-case__error">{error}</span> : null}
    </label>
  );
}
