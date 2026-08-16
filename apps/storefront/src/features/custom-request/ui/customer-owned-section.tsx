'use client';

/**
 * The customer-owned-product form (`651:40`, validation `651:138`).
 *
 * No product, no variant, no design session — and no component from the catalog
 * branch is imported here, so none can appear by accident.
 *
 * Errors are associated structurally (`<label for>` + `aria-describedby`) rather
 * than by proximity, following the `APP2-D01`/`APP4-D01` layer-naming precedent
 * the approved frames carry for exactly this purpose.
 */
import { CUSTOM_REQUEST_COPY } from '../model/custom-request-copy';
import {
  COP_DESCRIPTION_MAX,
  COP_NAME_MAX,
  customerOwnedIssues,
  type CustomerOwnedDraft,
  type CustomerOwnedField,
  type CustomerOwnedIssue,
} from '../model/customer-owned-draft';

export interface CustomerOwnedSectionProps {
  readonly draft: CustomerOwnedDraft;
  readonly showValidation: boolean;
  readonly onChange: (field: keyof CustomerOwnedDraft, value: string) => void;
}

const MESSAGE_OF: Readonly<Record<CustomerOwnedIssue, string>> = {
  NAME_REQUIRED: CUSTOM_REQUEST_COPY.customerOwned.nameRequired,
  NAME_TOO_LONG: CUSTOM_REQUEST_COPY.customerOwned.nameTooLong,
  DESCRIPTION_TOO_LONG: CUSTOM_REQUEST_COPY.customerOwned.descriptionTooLong,
  DIMENSION_INVALID: CUSTOM_REQUEST_COPY.customerOwned.dimensionInvalid,
};

export function CustomerOwnedSection({
  draft,
  showValidation,
  onChange,
}: CustomerOwnedSectionProps) {
  const issues = customerOwnedIssues(draft);

  return (
    <section
      className="custom-request__section"
      aria-label={CUSTOM_REQUEST_COPY.customerOwned.heading}
    >
      <h2 className="custom-request__section-heading">
        {CUSTOM_REQUEST_COPY.customerOwned.heading}
      </h2>

      {renderText('name', CUSTOM_REQUEST_COPY.customerOwned.nameLabel, COP_NAME_MAX)}
      {renderTextarea()}

      <div className="custom-request__row">
        {renderDimension('widthMm', CUSTOM_REQUEST_COPY.customerOwned.widthLabel)}
        {renderDimension('heightMm', CUSTOM_REQUEST_COPY.customerOwned.heightLabel)}
      </div>
    </section>
  );

  function issueOf(field: CustomerOwnedField): CustomerOwnedIssue | undefined {
    return showValidation ? issues.get(field) : undefined;
  }

  function renderText(field: 'name', label: string, maxLength: number) {
    const issue = issueOf(field);
    return (
      <div className="custom-request__field">
        <label htmlFor={`cop-${field}`}>{label}</label>
        <input
          id={`cop-${field}`}
          type="text"
          maxLength={maxLength}
          value={draft[field]}
          required
          aria-invalid={issue !== undefined}
          {...(issue === undefined ? {} : { 'aria-describedby': `cop-${field}-error` })}
          placeholder={CUSTOM_REQUEST_COPY.customerOwned.namePlaceholder}
          onChange={(event) => {
            onChange(field, event.target.value);
          }}
        />
        {renderError(field, issue)}
      </div>
    );
  }

  function renderTextarea() {
    const issue = issueOf('description');
    return (
      <div className="custom-request__field">
        <label htmlFor="cop-description">
          {CUSTOM_REQUEST_COPY.customerOwned.descriptionLabel}
        </label>
        <textarea
          id="cop-description"
          rows={4}
          maxLength={COP_DESCRIPTION_MAX}
          value={draft.description}
          aria-invalid={issue !== undefined}
          {...(issue === undefined ? {} : { 'aria-describedby': 'cop-description-error' })}
          onChange={(event) => {
            onChange('description', event.target.value);
          }}
        />
        {renderError('description', issue)}
      </div>
    );
  }

  function renderDimension(field: 'widthMm' | 'heightMm', label: string) {
    const issue = issueOf(field);
    return (
      <div className="custom-request__field">
        <label htmlFor={`cop-${field}`}>{label}</label>
        <input
          id={`cop-${field}`}
          type="text"
          inputMode="decimal"
          value={draft[field]}
          aria-invalid={issue !== undefined}
          {...(issue === undefined ? {} : { 'aria-describedby': `cop-${field}-error` })}
          onChange={(event) => {
            onChange(field, event.target.value);
          }}
        />
        {renderError(field, issue)}
      </div>
    );
  }

  function renderError(field: CustomerOwnedField, issue: CustomerOwnedIssue | undefined) {
    return issue === undefined ? null : (
      <p id={`cop-${field}-error`} className="custom-request__error">
        {MESSAGE_OF[issue]}
      </p>
    );
  }
}
