/**
 * Every user-facing string on the `/truy-cap` request content (`APP5-S02`).
 *
 * Read from the approved `APP5-D01` frames — `661:3` (NEW), `661:67`
 * (UNDER_REVIEW), `661:131` / `661:352` (NEEDS_CLARIFICATION), `661:199`
 * (REJECTED), `661:267` (CANCELLED) — not written here; node ids sit beside
 * each entry so a copy change is traceable to the design that authorized it.
 * Centralised because `CLAUDE.md` §5 forbids hard-coded user-facing copy inside
 * components.
 *
 * ### The two rules that govern what may be said
 *
 * **Only the customer's own message.** Every `661:*` spec strip repeats it:
 * *"Chỉ hiện customer_visible_reason / cancelled_customer_reason, không bao giờ
 * hiện reason nội bộ (COL-TBL037-08/09)."* So there is exactly one field this
 * feature ever prints as a reason, it arrives already separated by `APP5-B03`,
 * and the note under it (`661:181`) tells the customer in their own words that
 * the workshop's internal notes are not on this page.
 *
 * **No action, in any state.** `661:59` is a card whose entire content is the
 * three things this page does not do, and `G01-D06` is why: APP5 publishes no
 * customer-initiated cancellation, no edit, no re-upload and no reply box. The
 * copy says so rather than leaving the customer to discover it by looking for a
 * button that is not there.
 */
import type { ResponsiveCopy } from '../../../components/responsive-text';

export const CUSTOM_REQUEST_STATUS_COPY = {
  /** `661:6` … `661:8` desktop, `661:355` … `661:357` mobile. */
  accessBar: {
    title: 'Truy cập an toàn',
    /**
     * `661:8` / `661:357`. The approved frames also print the masked contact
     * beside the title; `APP5-B03` publishes no contact of any kind, and
     * inventing or fetching one would be a second authorized read this
     * checkpoint does not have. The expiry — which B03 *does* publish as
     * `accessExpiresAt` — is kept, because it is the half of the sentence that
     * tells the customer something actionable.
     */
    expiry: {
      wide: 'Liên kết này chỉ dành cho bạn và hết hiệu lực ngày {date}. Đừng chia sẻ lại.',
      narrow: 'Hết hiệu lực {date} · đừng chia sẻ lại',
    } satisfies ResponsiveCopy,
  },

  /** `661:9` desktop, `661:358` mobile — the page heading. */
  heading: {
    wide: 'Yêu cầu {code}',
    narrow: '{code}',
  } satisfies ResponsiveCopy,

  /** `661:10` / `661:11` — the headline badge prefixes the state, the aside card does not. */
  headlineBadge: 'Trạng thái: {label}',

  /** `661:12` — beside the headline badge. */
  submittedAt: 'Gửi lúc {timestamp}',

  /** `661:13` … `661:26` — the three-step progress card. */
  progress: {
    title: 'Tiến trình',
    steps: {
      submitted: 'Đã gửi',
      underReview: 'Xưởng đang xem',
      answered: 'Xưởng đã phản hồi',
    },
    note: 'Các bước báo giá, duyệt thiết kế và thanh toán chưa có trong giai đoạn này.',
  },

  /** `661:27` … `661:49` — the frozen submission. */
  subject: {
    title: 'Nội dung bạn đã gửi',
    frozen: 'Nội dung này đã cố định từ lúc gửi và không thay đổi.',
    rows: {
      kind: 'Loại',
      catalog: 'Sản phẩm của cửa hàng',
      customerOwned: 'Sản phẩm của bạn',
      productName: 'Sản phẩm',
      variantColorName: 'Màu',
      variantSizeLabel: 'Kích cỡ',
      itemName: 'Vật phẩm',
      itemDescription: 'Mô tả',
      dimensions: 'Kích thước',
      quantity: 'Số lượng',
    },
    /**
     * Printed wherever `APP5-B03` reports a field as absent rather than filling
     * it in — a catalog pair that can no longer be resolved (`661:*` subject
     * contract). Naming the wrong product would be worse than naming none, and
     * a later unpublication must not make the request itself unreadable.
     */
    missingValue: 'Không hiển thị được',
    /** `661:38` and the tile labels beneath it (`661:40`, `661:46`). */
    assetsTitle: 'Ảnh bạn đã gửi',
    assetRoles: {
      copImage: 'Ảnh vật phẩm',
      reference: 'Tham khảo',
    },
    assetsNote:
      'Chỉ bạn (qua liên kết này) và xưởng xem được các ảnh này. Chúng không hiển thị công khai ở bất kỳ đâu.',
  },

  /** `661:178` / `661:246` / `661:314` — the workshop's message to this customer. */
  reason: {
    titles: {
      needsClarification: 'Xưởng cần bạn làm rõ',
      rejected: 'Lý do từ chối',
      cancelled: 'Lý do huỷ',
    },
    note: 'Đây là nội dung xưởng viết riêng để gửi cho bạn. Ghi chú nội bộ của xưởng không hiển thị ở đây.',
    /**
     * `B05` allows a transition to be recorded without a customer-facing
     * message. The card still renders — the state is what the customer came to
     * read — and says plainly that no message was written, rather than showing
     * an empty box that reads as a failure to load.
     */
    absent: 'Xưởng chưa gửi kèm nội dung nào cho bạn ở bước này.',
  },

  /** `661:50` … `661:54` — the aside status card. */
  currentStatus: {
    title: 'Trạng thái hiện tại',
  },

  /** `661:55` … `661:58` — what the customer should do, per state. */
  nextSteps: {
    title: 'Bạn cần làm gì',
  },

  /** `661:59` … `661:63` — identical in every approved state. */
  readOnly: {
    title: 'Trang này chỉ để xem',
    points: [
      'Không có nút huỷ yêu cầu ở giai đoạn này.',
      'Không sửa được ảnh hoặc thông tin đã gửi.',
      'Không có báo giá, duyệt thiết kế hay thanh toán.',
    ],
  },

  /**
   * One entry per lifecycle state the customer can land on.
   *
   * The five APP5 states are transcribed from their own approved frame. The
   * sixth, `beyondIntake`, is not a frame: `APP5-B03` publishes the **full**
   * LC-11 enum truthfully, so a request that APP6 has already quoted, accepted,
   * digitised, sent to design review or approved will arrive here. Mapping any
   * of those onto an APP5 state would tell the customer something false, and
   * crashing on them would make this page fail the moment the next phase ships.
   * So they collapse into one neutral, accurate, action-free reading — which is
   * exactly what `661:59` already promises this page is.
   */
  states: {
    /** `661:11` / `661:53` / `661:54`. */
    new: {
      badge: 'Mới',
      description: 'Yêu cầu của bạn đã vào hàng đợi của xưởng và đang chờ được mở.',
      nextSteps: ['Không cần làm gì lúc này.', 'Giữ lại liên kết này để xem trạng thái.'],
    },
    /** `661:75` / `661:117` / `661:118` / `661:121` / `661:122`. */
    underReview: {
      badge: 'Đang xem xét',
      description: 'Xưởng đang xem thông tin và ảnh bạn gửi.',
      nextSteps: ['Không cần làm gì lúc này.', 'Nếu thiếu thông tin, xưởng sẽ liên hệ bạn.'],
    },
    /** `661:139` / `661:185` / `661:186` / `661:189` / `661:190`. */
    needsClarification: {
      badge: 'Cần bổ sung thông tin',
      description: 'Xưởng cần thêm thông tin trước khi tiếp tục xem xét.',
      nextSteps: [
        'Xưởng sẽ liên hệ bạn qua liên hệ đã xác minh.',
        'Trang này không có ô trả lời — hãy trả lời theo cách xưởng liên hệ.',
      ],
    },
    /** `661:207` / `661:253` / `661:254` / `661:257` / `661:258`. */
    rejected: {
      badge: 'Đã từ chối',
      description: 'Xưởng không thể nhận yêu cầu này.',
      nextSteps: [
        'Bạn có thể gửi một yêu cầu mới nếu muốn.',
        'Yêu cầu mới sẽ cần xác minh liên hệ lại.',
      ],
    },
    /** `661:275` / `661:321` / `661:322` / `661:325` / `661:326`. */
    cancelled: {
      badge: 'Đã huỷ',
      description: 'Yêu cầu này đã được huỷ.',
      nextSteps: [
        'Bạn có thể gửi một yêu cầu mới nếu muốn.',
        'Yêu cầu mới sẽ cần xác minh liên hệ lại.',
      ],
    },
    /** No frame — see the note above. Says what is true and offers nothing. */
    beyondIntake: {
      badge: 'Đang xử lý',
      description: 'Yêu cầu của bạn đã qua bước xem xét ban đầu và đang được xưởng xử lý tiếp.',
      nextSteps: ['Không cần làm gì lúc này.', 'Xưởng sẽ liên hệ bạn qua liên hệ đã xác minh.'],
    },
  },

  /** Announced politely once the link opens and the request is on screen. */
  liveAuthorized: 'Đã mở yêu cầu của bạn. Nội dung yêu cầu đang hiển thị.',
} as const;

/**
 * Substitutes one placeholder in an approved string.
 *
 * The frames write their variable parts inline — `Yêu cầu REQ-…`, `hết hiệu
 * lực ngày 23/08/2026` — so the sentence, including its word order and its
 * punctuation, stays in this file where the design authorized it, rather than
 * being reassembled from fragments by a component.
 */
export function fill(template: string, token: string, value: string): string {
  return template.replace(token, value);
}

/** The same substitution across both halves of an approved responsive pair. */
export function fillResponsive(copy: ResponsiveCopy, token: string, value: string): ResponsiveCopy {
  return { wide: fill(copy.wide, token, value), narrow: fill(copy.narrow, token, value) };
}
