/**
 * Every user-facing string on `/yeu-cau/da-gui` (`APP5-S02` §7).
 *
 * Read from the approved `660:3` (desktop) and `660:53` (mobile) frames, not
 * written here; node ids sit beside each entry so a copy change is traceable to
 * the design that authorized it. Centralised because `CLAUDE.md` §5 forbids
 * hard-coded user-facing copy inside components.
 *
 * ### The three things this page may not say
 *
 * **That the code opens anything.** `660:14` says the opposite in the
 * customer's own words, and it is the single most load-bearing sentence on the
 * page: the code is for talking to the workshop, the link in the message is for
 * getting back in. `G01 §5` is why — a code is never authorization data.
 *
 * **That anything has been agreed.** `660:26` and the whole of `660:44` exist
 * to close that door: no quotation, no price, no design approval, no deposit,
 * no payment, no order. A request has been received; nothing has been accepted.
 *
 * **Where the link went.** The approved frames print a masked contact
 * (`b***@vidu.com`); this route makes no request of any kind and holds no
 * customer data — the only thing in the URL is the display code — so the notice
 * names the verified contact without reproducing it. Fetching one would mean a
 * lookup keyed on the code, which is exactly what `G01 §5` forbids.
 */
import type { ResponsiveCopy } from '../../../components/responsive-text';

export const CUSTOM_REQUEST_CONFIRMATION_COPY = {
  /** `660:11` / `660:59` — the page heading. */
  title: 'Đã nhận yêu cầu của bạn',

  /** `660:9` / `660:57` — the tick beside it. Decorative; the title carries the meaning. */
  successMark: '✓',

  /** `660:12` / `660:13` — the code, and what it is for. */
  code: {
    label: 'Mã yêu cầu',
    /** `660:14` desktop, `660:62` mobile — the same rule, the shorter sentence. */
    note: {
      wide: 'Mã này chỉ để bạn và xưởng nói chuyện về yêu cầu. Nó không mở được yêu cầu — chỉ liên kết trong email mới mở được.',
      narrow: 'Mã này không mở được yêu cầu — chỉ liên kết trong email mới mở được.',
    } satisfies ResponsiveCopy,
  },

  /**
   * `660:15` / `660:63` — the state a just-submitted request is in.
   *
   * Not read from anywhere, and it does not need to be: `APP5-B01` records that
   * a submission always lands at `NEW`, so this is the one state this page can
   * state without asking. It is a badge, not a live status — the live one is
   * behind the secure link, which is what the notice below points at.
   */
  statusBadge: 'Trạng thái: Mới',

  /** `660:17` … `660:20` desktop, `660:65` … `660:68` mobile. */
  secureLink: {
    /**
     * `660:18` / `660:66`, with the masked contact removed — see the module
     * note. "Liên hệ đã xác minh" is the same contact the customer verified
     * minutes ago in the submission flow, so it identifies itself.
     */
    title: 'Chúng tôi đã gửi liên kết theo dõi tới liên hệ bạn đã xác minh',
    body: {
      wide: 'Mở liên kết đó để xem trạng thái yêu cầu bất cứ lúc nào. Liên kết có hiệu lực 7 ngày và chỉ dành riêng cho bạn — đừng chia sẻ lại.',
      narrow:
        'Mở liên kết đó để xem trạng thái. Hiệu lực 7 ngày, chỉ dành riêng cho bạn — đừng chia sẻ lại.',
    } satisfies ResponsiveCopy,
    fallback: {
      wide: 'Chưa thấy email sau vài phút? Kiểm tra thư rác, hoặc liên hệ xưởng kèm mã yêu cầu ở trên.',
      narrow: 'Chưa thấy email? Kiểm tra thư rác, hoặc liên hệ xưởng kèm mã yêu cầu.',
    } satisfies ResponsiveCopy,
  },

  /**
   * Shown in place of the code block when `?ma=` is missing or is not a request
   * code (§7).
   *
   * The page still confirms — the customer completed a submission and the
   * secure link is on its way regardless of what survived the navigation — but
   * it claims **no specific request**, because it has no way to know which one.
   * Making no API call here is the point: a lookup by code would be the surface
   * `G01 §5` exists to prevent, and there is nothing to look up anyway.
   */
  missingCode: {
    label: 'Mã yêu cầu',
    note: 'Không hiển thị được mã yêu cầu ở trang này. Mã đầy đủ nằm trong tin nhắn chứa liên kết theo dõi của bạn.',
  },

  /** `660:21` … `660:26` — what the workshop does next. */
  nextSteps: {
    title: 'Xưởng sẽ làm gì tiếp theo',
    steps: [
      'Xưởng mở yêu cầu và xem lại thông tin, ảnh của bạn.',
      'Nếu thiếu gì, xưởng sẽ hỏi thêm — bạn thấy nội dung đó ở trang trạng thái.',
      'Sau khi xem xong, xưởng sẽ trao đổi bước tiếp theo với bạn.',
    ],
    note: 'Yêu cầu chưa được duyệt, chưa được báo giá và chưa thành đơn hàng.',
  },

  /** `660:44` … `660:49` — stated as absences, on purpose. */
  notIncluded: {
    title: 'Chưa có ở bước này',
    points: [
      'Báo giá hoặc giá tiền',
      'Duyệt bản thiết kế',
      'Đặt cọc hoặc thanh toán',
      'Tạo đơn hàng',
    ],
  },
} as const;
