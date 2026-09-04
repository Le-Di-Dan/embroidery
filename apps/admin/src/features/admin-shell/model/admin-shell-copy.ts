/**
 * Vietnamese copy catalog for the authenticated Admin shell (APP1-A02). All
 * user-facing strings live here (FRONTEND_CONVENTIONS §14); copy is taken from
 * the approved Figma shell nodes (FIG-ADMIN-SHELL-* — see the APP1-A02 report).
 *
 * `actor` is a static product label for the single Admin operator, not a role
 * returned by the API. The shell never renders API-supplied roles or
 * permissions (there is exactly one Admin actor — REQ-IDN-001).
 */
import { BRAND_NAME } from '@embroidery/ui';

export const ADMIN_SHELL_COPY = {
  brand: {
    eyebrow: 'BẢNG QUẢN TRỊ',
    /**
     * The brand name, imported rather than written. It was `Xưởng Thêu` — the
     * placeholder wordmark `BRD0-F02` locked `Nét Thêu` to replace — and the
     * Admin shell was one of the surfaces still publishing it.
     */
    title: BRAND_NAME,
  },
  /** Static label for the single Admin actor; never an API-supplied role. */
  actor: 'Quản trị viên',
  skipToContent: 'Bỏ qua tới nội dung chính',
  nav: {
    sidebarLabel: 'Điều hướng chính',
    drawerLabel: 'Điều hướng',
    future: 'Các khu vực nghiệp vụ sẽ xuất hiện trong các giai đoạn sau.',
    openMenu: 'Mở menu điều hướng',
    closeMenu: 'Đóng menu điều hướng',
  },
  logout: {
    action: 'Đăng xuất',
    pending: 'Đang đăng xuất…',
    error: 'Hiện chưa thể đăng xuất. Vui lòng thử lại.',
    retry: 'Thử lại',
  },
  loading: {
    status: 'Đang tải thông tin quản trị viên…',
  },
  reconnect: {
    status: 'Mất kết nối tạm thời. Đang thử kết nối lại…',
  },
  sessionExpired: {
    title: 'Phiên đăng nhập đã hết hạn',
    description:
      'Phiên làm việc của bạn đã kết thúc vì lý do an toàn. ' +
      'Vui lòng đăng nhập lại để tiếp tục.',
    action: 'Đăng nhập lại',
  },
  placeholder: {
    heading: 'Quyền truy cập quản trị đã sẵn sàng',
    body:
      'Bạn đã đăng nhập vào bảng điều hành. Các chức năng vận hành — sản phẩm, ' +
      'đơn hàng, thiết kế và yêu cầu đặt thêu — sẽ xuất hiện trong các giai đoạn tiếp theo.',
  },
} as const;
