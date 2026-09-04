import type { FieldErrorCode, StaffLoginField } from './staff-login-form';

/**
 * Vietnamese copy catalog for the Admin staff login screen. All user-facing
 * strings live here (FRONTEND_CONVENTIONS §14); copy is taken verbatim from the
 * approved Figma nodes (FIG-ADMIN-LOGIN-* — see the APP1-A01 report). Error
 * copy never reveals which credential was wrong or whether an account exists.
 */
import { BRAND_NAME } from '@embroidery/ui';

export const STAFF_LOGIN_COPY = {
  brand: {
    /**
     * The approved login application (`589:36`) composes the production symbol,
     * the brand name and one supporting label. The former `BẢNG QUẢN TRỊ`
     * eyebrow said the same thing as `Quản trị xưởng` a line later, so the
     * mockup's two-line form is taken rather than stacking three.
     */
    title: BRAND_NAME,
    supporting: 'Quản trị xưởng',
    footnote: 'Bảng điều hành nội bộ · Chỉ dành cho nhân sự được cấp quyền truy cập.',
  },
  editorial: {
    headingLine1: 'Quản trị không gian',
    headingLine2: 'thêu thủ công.',
    body: 'Nơi đội ngũ vận hành theo dõi tác phẩm, bộ sưu tập và yêu cầu đặt thêu — tất cả trong một bảng điều hành yên tĩnh, tập trung vào tác phẩm.',
  },
  form: {
    title: 'Đăng nhập',
    subtitle: 'Dành cho quản trị viên được cấp quyền truy cập.',
    footerHelper:
      'Chỉ tài khoản quản trị được cấp mới có thể đăng nhập. Mọi lần truy cập đều được ghi nhật ký.',
  },
  fields: {
    email: { label: 'Email', placeholder: 'ban@xuongtheu.vn' },
    password: { label: 'Mật khẩu' },
  },
  passwordToggle: {
    show: 'Hiện',
    hide: 'Ẩn',
    showLabel: 'Hiện mật khẩu',
    hideLabel: 'Ẩn mật khẩu',
  },
  submit: {
    default: 'Đăng nhập',
    pending: 'Đang đăng nhập…',
    rateLimited: 'Thử lại sau ít phút',
  },
  helper: {
    pending: 'Đang xác thực thông tin đăng nhập. Vui lòng đợi trong giây lát.',
    rateLimit: 'Nút đăng nhập sẽ mở lại sau khi hết thời gian chờ. Không cần tải lại trang.',
  },
  alert: {
    auth: 'Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại thông tin đăng nhập.',
    network: 'Hiện chưa thể đăng nhập. Vui lòng thử lại.',
    unknownField: 'Thông tin đăng nhập không hợp lệ. Vui lòng kiểm tra lại.',
  },
  rateLimit: {
    fallbackDuration: 'ít phút',
    message: (duration: string): string =>
      `Bạn đã thử đăng nhập quá nhiều lần. Vì lý do an toàn, vui lòng thử lại sau ${duration}.`,
  },
} as const;

/** Field-error copy keyed by field then backend/client error code. */
const FIELD_ERROR_COPY: Record<StaffLoginField, Partial<Record<FieldErrorCode, string>>> = {
  email: {
    REQUIRED: 'Vui lòng nhập email.',
    INVALID: 'Địa chỉ email không hợp lệ.',
    TOO_LONG: 'Địa chỉ email quá dài.',
  },
  password: {
    REQUIRED: 'Vui lòng nhập mật khẩu.',
    TOO_LONG: 'Mật khẩu quá dài.',
  },
};

/** Resolve the display message for a field error, with a safe generic fallback. */
export function fieldErrorMessage(field: StaffLoginField, code: FieldErrorCode): string {
  return FIELD_ERROR_COPY[field][code] ?? STAFF_LOGIN_COPY.alert.unknownField;
}

/** Human Vietnamese duration for a Retry-After value in seconds. */
export function formatRetryDuration(seconds: number): string {
  if (seconds >= 60) {
    return `khoảng ${Math.ceil(seconds / 60)} phút`;
  }
  return `${seconds} giây`;
}
