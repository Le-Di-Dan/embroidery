'use client';

import { useId, useState } from 'react';

import { REQUEST_QUOTATION_COPY as COPY } from '../model/request-quotation-copy';
import {
  emptyForm,
  emptyLine,
  validateForm,
  type AuthoringForm,
  type AuthoringLine,
  type AuthoringLineKind,
  type FieldIssue,
} from '../model/quotation-authoring-form';
import { QuotationLineEditor } from './quotation-line-editor';

interface AuthoringFormProps {
  readonly kinds: readonly AuthoringLineKind[];
  readonly submitLabel: string;
  readonly running: boolean;
  /** Server-side refusal copy, already classified. Never a server message. */
  readonly serverIssue: string | null;
  readonly onSubmit: (form: AuthoringForm) => void;
}

/**
 * The authoring form (`682:3`, `684:3`) and its refusal state (`684:144`).
 *
 * ### It computes no money
 *
 * There is no running subtotal, no live total and no projected deposit. Every
 * one of those is `CST-064` arithmetic the server owns, and a figure computed
 * here would either agree with the server — making it redundant — or disagree,
 * which is worse than showing nothing. The form says so instead: the totals
 * appear once the server has priced the version.
 *
 * ### Validation is shown after an attempt, and bound to controls
 *
 * Issues are computed on submit rather than on every keystroke, so the operator
 * is not corrected mid-typing. Each one renders beside its own control and is
 * wired with `aria-describedby` / `aria-invalid`, and the summary carries
 * `role="alert"`. The server remains the authority: its refusal is displayed as
 * `serverIssue` even when local validation found nothing.
 *
 * ### The values survive a refusal
 *
 * This component owns the form state and the parent never resets it on failure,
 * so nothing has to be retyped after a rejected submit.
 */
export function QuotationAuthoringForm({
  kinds,
  submitLabel,
  running,
  serverIssue,
  onSubmit,
}: AuthoringFormProps) {
  const prefix = useId();
  const [form, setForm] = useState<AuthoringForm>(() => emptyForm(kinds));
  const [issues, setIssues] = useState<readonly FieldIssue[]>([]);

  const issueFor = (field: string): FieldIssue | undefined =>
    issues.find((issue) => issue.field === field);

  const patch = (next: Partial<AuthoringForm>) => {
    setForm((current) => ({ ...current, ...next }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateForm(form);
    setIssues(found);
    if (found.length === 0) {
      onSubmit(form);
    }
  };

  const quantityIssue = issueFor('quantityTotal');
  const stitchIssue = issueFor('stitchCount');
  const shippingIssue = issueFor('shippingFeeAmount');
  const adjustmentIssue = issueFor('manualAdjustmentAmount');
  const reasonIssue = issueFor('adjustmentReason');

  return (
    <form className="request-quotation__form" onSubmit={handleSubmit} data-testid="quotation-form">
      <h2 className="request-quotation__section-heading">{COPY.sections.draft}</h2>

      {issues.length > 0 || serverIssue !== null ? (
        <div
          className="request-quotation__form-error"
          role="alert"
          data-testid="quotation-validation"
        >
          <p className="request-quotation__form-error-title">{COPY.validation.heading}</p>
          {serverIssue === null ? null : <p>{serverIssue}</p>}
        </div>
      ) : null}

      <div className="request-quotation__field-row">
        <div className="request-quotation__field">
          <label htmlFor={`${prefix}-quantity-total`}>{COPY.form.quantityTotal}</label>
          <input
            id={`${prefix}-quantity-total`}
            type="text"
            inputMode="numeric"
            value={form.quantityTotal}
            disabled={running}
            aria-invalid={quantityIssue === undefined ? undefined : true}
            aria-describedby={quantityIssue === undefined ? undefined : `${prefix}-quantity-error`}
            onChange={(event) => {
              patch({ quantityTotal: event.target.value });
            }}
          />
          {quantityIssue === undefined ? null : (
            <p className="request-quotation__field-error" id={`${prefix}-quantity-error`}>
              {quantityIssue.message}
            </p>
          )}
        </div>

        <div className="request-quotation__field">
          <label htmlFor={`${prefix}-stitch`}>{COPY.form.stitchCount}</label>
          <input
            id={`${prefix}-stitch`}
            type="text"
            inputMode="numeric"
            value={form.stitchCount}
            disabled={running}
            aria-invalid={stitchIssue === undefined ? undefined : true}
            aria-describedby={
              stitchIssue === undefined ? `${prefix}-stitch-hint` : `${prefix}-stitch-error`
            }
            onChange={(event) => {
              patch({ stitchCount: event.target.value });
            }}
          />
          <p className="request-quotation__field-hint" id={`${prefix}-stitch-hint`}>
            {COPY.form.stitchCountHint}
          </p>
          {stitchIssue === undefined ? null : (
            <p className="request-quotation__field-error" id={`${prefix}-stitch-error`}>
              {stitchIssue.message}
            </p>
          )}
        </div>
      </div>

      <h3 className="request-quotation__subheading">{COPY.sections.lines}</h3>
      {form.lineItems.map((line, index) => (
        <QuotationLineEditor
          key={index}
          index={index}
          line={line}
          kinds={kinds}
          issues={issues}
          removable={form.lineItems.length > 1}
          disabled={running}
          onChange={(position: number, next: AuthoringLine) => {
            setForm((current) => ({
              ...current,
              lineItems: current.lineItems.map((item, at) => (at === position ? next : item)),
            }));
          }}
          onRemove={(position: number) => {
            setForm((current) => ({
              ...current,
              lineItems: current.lineItems.filter((_, at) => at !== position),
            }));
          }}
        />
      ))}
      <button
        className="request-quotation__button request-quotation__button--quiet"
        type="button"
        disabled={running}
        onClick={() => {
          setForm((current) => ({
            ...current,
            lineItems: [...current.lineItems, emptyLine(kinds)],
          }));
        }}
      >
        {COPY.form.addLine}
      </button>

      <div className="request-quotation__field-row">
        <div className="request-quotation__field">
          <label htmlFor={`${prefix}-shipping`}>{COPY.form.shippingFee}</label>
          <input
            id={`${prefix}-shipping`}
            type="text"
            inputMode="decimal"
            value={form.shippingFeeAmount}
            disabled={running}
            aria-invalid={shippingIssue === undefined ? undefined : true}
            aria-describedby={shippingIssue === undefined ? undefined : `${prefix}-shipping-error`}
            onChange={(event) => {
              patch({ shippingFeeAmount: event.target.value });
            }}
          />
          {shippingIssue === undefined ? null : (
            <p className="request-quotation__field-error" id={`${prefix}-shipping-error`}>
              {shippingIssue.message}
            </p>
          )}
        </div>

        <div className="request-quotation__field">
          <label htmlFor={`${prefix}-adjustment`}>{COPY.form.manualAdjustment}</label>
          <input
            id={`${prefix}-adjustment`}
            type="text"
            inputMode="decimal"
            value={form.manualAdjustmentAmount}
            disabled={running}
            aria-invalid={adjustmentIssue === undefined ? undefined : true}
            aria-describedby={
              adjustmentIssue === undefined
                ? `${prefix}-adjustment-hint`
                : `${prefix}-adjustment-error`
            }
            onChange={(event) => {
              patch({ manualAdjustmentAmount: event.target.value });
            }}
          />
          <p className="request-quotation__field-hint" id={`${prefix}-adjustment-hint`}>
            {COPY.form.manualAdjustmentHint}
          </p>
          {adjustmentIssue === undefined ? null : (
            <p className="request-quotation__field-error" id={`${prefix}-adjustment-error`}>
              {adjustmentIssue.message}
            </p>
          )}
        </div>
      </div>

      <div className="request-quotation__field request-quotation__field--wide">
        <label htmlFor={`${prefix}-reason`}>{COPY.form.adjustmentReason}</label>
        <textarea
          id={`${prefix}-reason`}
          rows={3}
          value={form.adjustmentReason}
          disabled={running}
          aria-invalid={reasonIssue === undefined ? undefined : true}
          aria-describedby={
            reasonIssue === undefined ? `${prefix}-reason-hint` : `${prefix}-reason-error`
          }
          onChange={(event) => {
            patch({ adjustmentReason: event.target.value });
          }}
        />
        <p className="request-quotation__field-hint" id={`${prefix}-reason-hint`}>
          {COPY.form.adjustmentReasonHint}
        </p>
        {reasonIssue === undefined ? null : (
          <p className="request-quotation__field-error" id={`${prefix}-reason-error`}>
            {reasonIssue.message}
          </p>
        )}
      </div>

      <p className="request-quotation__notice">{COPY.form.pendingTotalsNotice}</p>

      <button
        className="request-quotation__button request-quotation__button--primary"
        type="submit"
        disabled={running}
        aria-busy={running}
        data-testid="quotation-form-submit"
      >
        {running ? COPY.form.submitting : submitLabel}
      </button>
    </form>
  );
}
