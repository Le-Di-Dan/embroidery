import { BRAND_NAME, VI_MESSAGES, messageView } from '@embroidery/i18n';
import type { FieldErrorCode, StaffLoginField } from './staff-login-form';

/**
 * Vietnamese copy catalog for the Admin staff login screen. All user-facing
 * strings live here (FRONTEND_CONVENTIONS §14); copy is taken verbatim from the
 * approved Figma nodes (FIG-ADMIN-LOGIN-* — see the APP1-A01 report). Error
 * copy never reveals which credential was wrong or whether an account exists.
 */

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin.json`, under `loginFieldErrors`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const loginFieldErrorsMessage = messageView(VI_MESSAGES.admin, 'loginFieldErrors');

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin.json`, under `login`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const loginMessage = messageView(VI_MESSAGES.admin, 'login');

export const STAFF_LOGIN_COPY = {
  brand: {
    /**
     * The approved login application (`589:36`) composes the production symbol,
     * the brand name and one supporting label. The former `BẢNG QUẢN TRỊ`
     * eyebrow said the same thing as `Quản trị xưởng` a line later, so the
     * mockup's two-line form is taken rather than stacking three.
     */
    title: BRAND_NAME,
    supporting: loginMessage.text('brand.supporting'),
    footnote: loginMessage.text('brand.footnote'),
  },
  editorial: {
    headingLine1: loginMessage.text('editorial.headingLine1'),
    headingLine2: loginMessage.text('editorial.headingLine2'),
    body: loginMessage.text('editorial.body'),
  },
  form: {
    title: loginMessage.text('form.title'),
    subtitle: loginMessage.text('form.subtitle'),
    footerHelper: loginMessage.text('form.footerHelper'),
  },
  fields: {
    email: {
      label: loginMessage.text('fields.email.label'),
      placeholder: loginMessage.text('fields.email.placeholder'),
    },
    password: { label: loginMessage.text('fields.password.label') },
  },
  passwordToggle: {
    show: loginMessage.text('passwordToggle.show'),
    hide: loginMessage.text('passwordToggle.hide'),
    showLabel: loginMessage.text('passwordToggle.showLabel'),
    hideLabel: loginMessage.text('passwordToggle.hideLabel'),
  },
  submit: {
    default: loginMessage.text('submit.default'),
    pending: loginMessage.text('submit.pending'),
    rateLimited: loginMessage.text('submit.rateLimited'),
  },
  helper: {
    pending: loginMessage.text('helper.pending'),
    rateLimit: loginMessage.text('helper.rateLimit'),
  },
  alert: {
    auth: loginMessage.text('alert.auth'),
    network: loginMessage.text('alert.network'),
    unknownField: loginMessage.text('alert.unknownField'),
  },
  rateLimit: {
    fallbackDuration: loginMessage.text('rateLimit.fallbackDuration'),
    message: (duration: string): string => loginMessage.text('rateLimit.message', { duration }),
  },
} as const;

/** Field-error copy keyed by field then backend/client error code. */
const FIELD_ERROR_COPY: Record<StaffLoginField, Partial<Record<FieldErrorCode, string>>> = {
  email: {
    REQUIRED: loginFieldErrorsMessage.text('email.REQUIRED'),
    INVALID: loginFieldErrorsMessage.text('email.INVALID'),
    TOO_LONG: loginFieldErrorsMessage.text('email.TOO_LONG'),
  },
  password: {
    REQUIRED: loginFieldErrorsMessage.text('password.REQUIRED'),
    TOO_LONG: loginFieldErrorsMessage.text('password.TOO_LONG'),
  },
};

/** Resolve the display message for a field error, with a safe generic fallback. */
export function fieldErrorMessage(field: StaffLoginField, code: FieldErrorCode): string {
  return FIELD_ERROR_COPY[field][code] ?? STAFF_LOGIN_COPY.alert.unknownField;
}

/** Human Vietnamese duration for a Retry-After value in seconds. */
export function formatRetryDuration(seconds: number): string {
  if (seconds >= 60) {
    return loginMessage.text('retryAfterMinutes', { minutes: Math.ceil(seconds / 60) });
  }
  return loginMessage.text('retryAfterSeconds', { seconds });
}
