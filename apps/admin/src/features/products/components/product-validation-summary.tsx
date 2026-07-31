'use client';

import { PRODUCT_FORM_COPY } from '../model/product-form-copy';
import type { ProductValidationErrors } from '../model/product-form-values';

interface ProductValidationSummaryProps {
  readonly title: string;
  readonly errors: ProductValidationErrors;
}

/**
 * The validation summary (`436:37` — Chưa thể lưu thay đổi).
 *
 * `role="alert"` so the reason a save did not happen is announced immediately;
 * the summary only renders once the operator has actually attempted to submit,
 * which is what keeps it from interrupting mid-typing.
 *
 * The messages are the same approved strings the fields carry. Repeating them
 * here is intentional: the summary is what a screen-reader user hears on
 * submit, and the field text is what a sighted user reads next to the control.
 */
export function ProductValidationSummary({ title, errors }: ProductValidationSummaryProps) {
  const messages = [errors.name, errors.categorySlug, errors.price].filter(
    (message): message is string => message !== undefined,
  );

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="product-validation" role="alert">
      <p className="product-validation__title">{title}</p>
      <ul className="product-validation__list">
        {messages.map((message) => (
          <li key={message} className="product-validation__item">
            {message}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The saving banner (`436:140` — Đang lưu thay đổi…). */
export function ProductSavingBanner() {
  return (
    <div className="product-saving" role="status" aria-live="polite">
      <p className="product-saving__title">{PRODUCT_FORM_COPY.edit.savingTitle}</p>
      <p className="product-saving__help">{PRODUCT_FORM_COPY.edit.savingHelp}</p>
    </div>
  );
}
