/**
 * The customer-owned-product subject (`651:40`, `651:138`; contract
 * `CustomRequestCustomerOwnedProduct`).
 *
 * Four fields, one required. The dimension pattern is the contract's own
 * (`^\d{1,6}(?:\.\d{1,2})?$`) rather than a numeric range invented here, because
 * the value travels as a **string**: it is a decimal the server parses exactly,
 * and rendering it through a JavaScript `number` first would be the one step
 * that could round it.
 */
import type { CustomRequestCustomerOwnedProduct } from '@embroidery/api-client';

export interface CustomerOwnedDraft {
  readonly name: string;
  readonly description: string;
  readonly widthMm: string;
  readonly heightMm: string;
}

export const emptyCustomerOwnedDraft: CustomerOwnedDraft = {
  name: '',
  description: '',
  widthMm: '',
  heightMm: '',
};

export const COP_NAME_MAX = 200;
export const COP_DESCRIPTION_MAX = 2000;

/** The published dimension shape. Millimetres, at most two decimal places. */
const DIMENSION_PATTERN = /^\d{1,6}(?:\.\d{1,2})?$/;

export type CustomerOwnedField = 'name' | 'description' | 'widthMm' | 'heightMm';

export type CustomerOwnedIssue =
  'NAME_REQUIRED' | 'NAME_TOO_LONG' | 'DESCRIPTION_TOO_LONG' | 'DIMENSION_INVALID';

/** Every problem the customer must fix, keyed by the field that shows it. */
export function customerOwnedIssues(
  draft: CustomerOwnedDraft,
): ReadonlyMap<CustomerOwnedField, CustomerOwnedIssue> {
  const issues = new Map<CustomerOwnedField, CustomerOwnedIssue>();

  const name = draft.name.trim();
  if (name === '') issues.set('name', 'NAME_REQUIRED');
  else if (name.length > COP_NAME_MAX) issues.set('name', 'NAME_TOO_LONG');

  if (draft.description.trim().length > COP_DESCRIPTION_MAX) {
    issues.set('description', 'DESCRIPTION_TOO_LONG');
  }

  // Empty is valid — both dimensions are optional — but a value that is present
  // must match the contract, since a rejected pattern is a 422 the customer
  // would otherwise only discover at submit.
  if (draft.widthMm.trim() !== '' && !DIMENSION_PATTERN.test(draft.widthMm.trim())) {
    issues.set('widthMm', 'DIMENSION_INVALID');
  }
  if (draft.heightMm.trim() !== '' && !DIMENSION_PATTERN.test(draft.heightMm.trim())) {
    issues.set('heightMm', 'DIMENSION_INVALID');
  }

  return issues;
}

export function customerOwnedReady(draft: CustomerOwnedDraft): boolean {
  return customerOwnedIssues(draft).size === 0;
}

/**
 * The submission subject.
 *
 * Optional fields are omitted rather than sent empty: every one of them carries
 * a `minLength`/pattern the empty string fails, so `description: ''` would be a
 * refusal where "the customer left it blank" is the intent.
 */
export function toCustomerOwnedSubject(
  draft: CustomerOwnedDraft,
): CustomRequestCustomerOwnedProduct {
  const subject: CustomRequestCustomerOwnedProduct = { name: draft.name.trim() };
  const description = draft.description.trim();
  const width = draft.widthMm.trim();
  const height = draft.heightMm.trim();
  return {
    ...subject,
    ...(description === '' ? {} : { description }),
    ...(width === '' ? {} : { physicalWidthMm: width }),
    ...(height === '' ? {} : { physicalHeightMm: height }),
  };
}
