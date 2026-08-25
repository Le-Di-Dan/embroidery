/**
 * Every string in the three transition dialogs (`786:3`, `786:39`, `786:70`,
 * `786:110`, `786:150`, `786:177`) and every refusal sentence the approved
 * catalog (`787:3`) fixes.
 *
 * ### Why the dialogs have their own catalog
 *
 * A dialog states what a *write* is about to do. That prose is load-bearing —
 * "reserved Catalog stock is consumed", "consumed stock is not restored",
 * "this is not the order cancellation" — and keeping it beside the read
 * screen's labels is how a page ends up promising an effect it never performs.
 *
 * ### The refusal sentences never quote the server
 *
 * Each entry carries a Vietnamese title and an action sentence chosen by the
 * published business **code**, read as a structured field. `normalized.message`
 * is never rendered and never branched on; the code rides inside the body as an
 * engineer-facing annotation, exactly as `787:5` requires. No recovery here is
 * automatic: every one of them is a human step, because the backend publishes
 * no retryable-conflict code and no compensating queue (`787:93`).
 */

/** The two moves that carry no reason, and the one that requires it. */
export const PRODUCTION_TRANSITION_COPY = {
  common: {
    /** `786:9` — every dialog says the whole move commits together or not at all. */
    effectsTitle: 'Thao tác này thực hiện đồng thời, trong một giao dịch',
    rowJob: 'Lệnh sản xuất',
    rowOrder: 'Đơn hàng',
    rowReservation: 'Giữ kho Catalog',
    orderUnchanged: 'không đổi',
    dismiss: 'Huỷ bỏ',
    back: 'Quay lại',
    submitting: 'Đang xử lý…',
    /** `786:181`. */
    submittingSubtitle: (shortJobId: string) => `Lệnh ${shortJobId} · đang chờ máy chủ xác nhận`,
    /** `786:190` — waiting on a row lock is correct behaviour, not a hang. */
    submittingLockTitle: 'Đừng bấm lại và đừng đóng cửa sổ',
    submittingLockBody:
      'Máy chủ đang quyết định dưới khoá dòng. Nếu một thao tác khác đang giữ khoá, yêu cầu ' +
      'này chờ rồi đọc lại trạng thái mới nhất — chờ là hành vi đúng, không phải treo.',
    submittingDropTitle: 'Nếu mất kết nối giữa chừng',
    submittingDropBody:
      'Kết quả thật là kết quả máy chủ đã ghi, không phải thứ trình duyệt kịp nhìn thấy. Tải ' +
      'lại chi tiết lệnh để đọc trạng thái thật, thay vì gửi lại lần hai.',
    submittingOptimisticTitle: 'Không chuyển trạng thái lạc quan',
    submittingOptimisticBody:
      'Giao diện KHÔNG hiển thị trạng thái mới trước khi máy chủ xác nhận. Trạng thái trên ' +
      'màn chỉ đổi sau khi có phản hồi thành công.',
    /** The job the dialog was opened against, named in its subtitle. */
    subtitleWithOrder: (shortJobId: string, orderCode: string) =>
      `Lệnh ${shortJobId} · đơn ${orderCode}`,
    subtitleWithStatus: (shortJobId: string, statusLabel: string) =>
      `Lệnh ${shortJobId} · đang ở trạng thái ${statusLabel}`,
  },

  start: {
    /** `786:6`. */
    title: 'Bắt đầu sản xuất?',
    confirm: 'Bắt đầu sản xuất',
    submittingTitle: 'Đang bắt đầu sản xuất…',
    consumeTitle: 'Tồn kho đang giữ sẽ bị tiêu thụ',
    consumeBody:
      'Phần tồn kho Catalog đang ở trạng thái giữ chính thức sẽ chuyển sang ĐÃ TIÊU THỤ. Đây ' +
      'là bước một chiều: không có thao tác nào trong APP8 đưa tồn đã tiêu thụ trở lại.',
    refusalTitle: 'Máy chủ có thể từ chối',
    refusalBody:
      'Tính hợp lệ được quyết định lại tại thời điểm nhấn, dưới khoá dòng: nếu cọc không còn ' +
      'thoả, đơn bị giữ/đang huỷ, bản duyệt đã đổi, hoặc giữ kho không còn hiệu lực/không đủ, ' +
      'thao tác bị từ chối và KHÔNG có gì được ghi. Giao diện không tự phán quyết trước.',
    copTitle: 'Đơn chỉ có sản phẩm khách tự mang',
    copBody:
      'Với đơn COP, phần “tiêu thụ giữ kho” đơn giản là không có gì để làm — vẫn bắt đầu được ' +
      'bình thường và danh sách giữ kho bị tiêu thụ trả về rỗng.',
  },

  complete: {
    /** `786:42`. */
    title: 'Hoàn tất sản xuất?',
    confirm: 'Hoàn tất sản xuất',
    submittingTitle: 'Đang hoàn tất sản xuất…',
    noInventoryTitle: 'Không đụng đến tồn kho',
    noInventoryBody:
      'Hoàn tất không chuyển động tồn kho: phần Catalog đã được tiêu thụ ngay khi bắt đầu. ' +
      'Danh sách giữ kho bị ảnh hưởng bởi thao tác này là rỗng.',
    stopTitle: 'APP8 dừng tại đây',
    stopBody:
      'Sau khi hoàn tất, thanh toán phần còn lại, giao hàng và quyết toán diễn ra ở pha sau — ' +
      'không có nút nào cho chúng trên màn này, kể cả sau khi thành công.',
    refusalTitle: 'Máy chủ có thể từ chối',
    refusalBody:
      'Nếu lệnh đã bị người khác chuyển trạng thái, thao tác bị từ chối vì không còn hợp lệ. ' +
      'Tải lại để đọc trạng thái mới nhất.',
  },

  cancel: {
    /** `786:73` and `786:113` — the heading names which state is being cancelled. */
    titleFromPlanned: 'Huỷ lệnh sản xuất?',
    titleFromStarted: 'Huỷ lệnh đang sản xuất?',
    confirm: 'Huỷ lệnh sản xuất',
    submittingTitle: 'Đang huỷ lệnh sản xuất…',
    /** `786:76` — binding on every cancel surface. */
    scopeTitle: 'Đây là huỷ LỆNH SẢN XUẤT — không phải huỷ đơn hàng',
    scopeBody:
      'Trạng thái thương mại của đơn hàng KHÔNG thay đổi: không chuyển sang “đang huỷ”, không ' +
      'hoàn tiền, không phát sinh phiếu chi. Nếu khách muốn huỷ đơn và lấy lại tiền, đó là ' +
      'một quy trình khác, nằm ngoài APP8.',
    /** `786:96` — from PLANNED nothing was consumed, so a live hold is released. */
    releaseTitle: 'Giữ kho còn hiệu lực sẽ được giải phóng',
    releaseBody:
      'Lệnh chưa bắt đầu nên chưa tiêu thụ gì. Phần giữ kho còn ở trạng thái RESERVED sẽ được ' +
      'giải phóng và tồn khả dụng tăng trở lại. Nếu không còn gì đang giữ, danh sách trả về ' +
      'rỗng — không có gì được bịa thêm.',
    /** `786:116` — from STARTED the goods have left; nothing is restored. */
    noRestoreTitle: 'Tồn kho đã tiêu thụ sẽ KHÔNG được hoàn lại',
    noRestoreBody:
      'Phần tồn kho Catalog đã bị tiêu thụ khi lệnh bắt đầu. Huỷ lệnh không đưa chúng về kho: ' +
      'hàng đã ra khỏi kệ. Muốn đưa tồn trở lại thì phải là một điều chỉnh tồn kho riêng, có ' +
      'lý do và có kiểm toán.',
    /** `786:136`. */
    stillNotOrderTitle: 'Vẫn không phải huỷ đơn hàng',
    stillNotOrderBody:
      'Đơn hàng giữ nguyên trạng thái thương mại hiện tại. Huỷ đơn và hoàn tiền là quy trình ' +
      'riêng, nằm ngoài APP8.',
    reasonLabel: 'Lý do huỷ',
    reasonRequiredBadge: 'bắt buộc',
    reasonHelp:
      'Bắt buộc. Lý do được ghi vĩnh viễn vào lịch sử chuyển trạng thái và không sửa được về ' +
      'sau. Tối đa 1.000 ký tự.',
    /** `786:168` — blocked locally; a blank or whitespace-only reason never reaches the wire. */
    reasonMissing:
      'Vui lòng nhập lý do huỷ. Đây là bằng chứng bắt buộc — chuỗi toàn khoảng trắng không ' +
      'được chấp nhận.',
    reasonTooLong: (max: number) => `Lý do huỷ tối đa ${String(max)} ký tự.`,
    /** `786:170` — why the button is off, and why Start/Complete have no such field. */
    blockedTitle: 'Vì sao nút đang tắt',
    blockedBody:
      'PRODUCTION_CANCELLATION_REASON_REQUIRED · 400. Máy chủ từ chối một yêu cầu huỷ không có ' +
      'lý do, nên giao diện chặn tại chỗ thay vì gửi đi một yêu cầu chắc chắn hỏng. Ngược lại, ' +
      'hai thao tác Bắt đầu và Hoàn tất KHÔNG nhận lý do — gửi kèm sẽ bị từ chối, nên chúng ' +
      'không có ô nhập này.',
  },

  /**
   * The refusal catalog (`787:3`), keyed by the published business code.
   *
   * Every entry is a *human* recovery. There is no automatic retry anywhere:
   * `787:184` forbids it, and a `409` means the real conditions differ — retrying
   * blind only repeats an old decision on old knowledge.
   */
  refusals: {
    depositNotSatisfied: {
      title: 'Đơn chưa thanh toán cọc',
      body:
        'PRODUCTION_DEPOSIT_NOT_SATISFIED · 409. Cọc của đơn chưa được xác minh thoả, nên ' +
        'không bắt đầu sản xuất được. Xác minh cọc ở màn đơn hàng trước.',
    },
    orderOnHold: {
      title: 'Đơn hàng đang bị giữ',
      body:
        'PRODUCTION_ORDER_ON_HOLD · 409. Đơn đang bị giữ hoặc đang huỷ. Gỡ trạng thái giữ ở ' +
        'màn đơn hàng trước khi chuyển trạng thái sản xuất.',
    },
    blocked: {
      title: 'Trạng thái đơn không cho phép',
      body:
        'PRODUCTION_BLOCKED · 409. Đơn không ở trạng thái phù hợp cho nước đi sản xuất này. ' +
        'Mở đơn hàng để xem trạng thái hiện tại.',
    },
    approvalMismatch: {
      title: 'Bản duyệt không khớp',
      body:
        'PRODUCTION_APPROVAL_MISMATCH · 409. Bản duyệt mà đơn đang được sản xuất theo đã thay ' +
        'đổi, nên lệnh này không còn khớp. Mở đơn hàng để đọc bản duyệt hiện hành.',
    },
    reservationNotActive: {
      title: 'Giữ kho đã thay đổi',
      body:
        'PRODUCTION_RESERVATION_NOT_ACTIVE · 409. Phần giữ kho mà đơn cần đang thiếu hoặc ' +
        'không còn hiệu lực. Không có gì được ghi. Đọc lại lệnh rồi quyết định tiếp.',
    },
    reservationInsufficient: {
      title: 'Giữ kho không đủ số lượng',
      body:
        'PRODUCTION_RESERVATION_INSUFFICIENT · 409. Số lượng đang giữ ít hơn số lượng đã ' +
        'duyệt. Kiểm tra tồn kho SKU trước khi bắt đầu.',
    },
    invalidTransition: {
      title: 'Trạng thái sản xuất đã thay đổi',
      body:
        'PRODUCTION_INVALID_TRANSITION · 409. Thao tác này không còn hợp lệ — thường vì người ' +
        'khác vừa chuyển trạng thái trước. Trạng thái mới nhất đã được đọc lại phía dưới.',
    },
    reasonRequired: {
      title: 'Thiếu lý do huỷ',
      body:
        'PRODUCTION_CANCELLATION_REASON_REQUIRED · 400. Máy chủ từ chối một yêu cầu huỷ không ' +
        'có lý do. Nhập lý do rồi gửi lại.',
    },
    notFound: {
      title: 'Không tìm thấy lệnh sản xuất',
      body: 'PRODUCTION_JOB_NOT_FOUND · 404. Lệnh không còn tồn tại. Quay về hàng đợi.',
    },
    unauthenticated: {
      title: 'Phiên đăng nhập đã hết hạn',
      body: '401. Chưa có gì được ghi. Đăng nhập lại rồi thực hiện lại thao tác.',
    },
    forbidden: {
      title: 'Yêu cầu bị từ chối',
      body: '403. Yêu cầu đến từ nguồn máy chủ không chấp nhận. Lặp lại y hệt cũng bị từ chối.',
    },
    /** No response line at all: committed-or-not is unknown, so nothing is concluded. */
    ambiguous: {
      title: 'Không rõ máy chủ đã ghi hay chưa',
      body:
        'Mất kết nối trước khi đọc được câu trả lời. Thao tác có thể đã được ghi. KHÔNG gửi ' +
        'lại — trạng thái thật đã được đọc lại phía dưới.',
    },
    server: {
      title: 'Không thực hiện được thao tác',
      body: 'Lỗi máy chủ · 500. Trạng thái thật đã được đọc lại phía dưới.',
    },
  },

  /** `787:169` — after any refusal the screen reloads job truth and rebuilds the actions. */
  conflict: {
    reloadedNote:
      'Chi tiết lệnh đã được đọc lại từ máy chủ và bộ nút được dựng lại theo trạng thái vừa ' +
      'đọc. Không có lần gửi lại tự động nào.',
    close: 'Đóng',
  },
} as const;
