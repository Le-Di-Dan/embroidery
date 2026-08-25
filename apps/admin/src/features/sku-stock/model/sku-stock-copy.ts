/**
 * Every user-facing string on the Admin SKU stock workspace, transcribed from
 * the approved `APP8-D01` frames (`775:3`, `775:101`, `776:3`, `776:54`,
 * `776:142`, `777:3` … `777:125`) and the shared inventory refusal catalog
 * (`787:94`).
 *
 * Copy lives here rather than inline because CLAUDE.md §5 forbids hard-coded
 * user-facing text in components, and because the refusal wording is the part
 * of this screen a reviewer has to be able to check against `787:94` without
 * reading JSX.
 *
 * Two rules the catalog fixes and this module keeps:
 *
 * - **no raw backend code is ever the only copy.** Each refusal has a
 *   Vietnamese title and an action sentence; the technical code travels as an
 *   engineer-facing annotation inside the body sentence, exactly as `787:94`
 *   draws it.
 * - **no invented capability.** There is no "load more", no threshold editor,
 *   no absolute overwrite and no automatic retry anywhere in this vocabulary,
 *   because `APP8-B01` publishes no operation for any of them.
 */
export const SKU_STOCK_COPY = {
  page: {
    breadcrumb: 'Quản trị / Kho / SKU',
    title: 'Tồn kho SKU',
    source:
      'Nguồn: GET /api/admin/skus/{skuId}/stock. Bản ghi tồn được tạo lười ở lần đọc đầu tiên — một SKU chưa từng kiểm kho vẫn mở được và bắt đầu từ 0.',
    skuLabel: 'SKU',
    identifiers: (skuId: string, skuStockId: string) => `skuId ${skuId} · skuStockId ${skuStockId}`,
    adjust: 'Điều chỉnh tồn kho',
    loading: 'Đang tải tồn kho…',
  },
  pill: {
    healthy: 'Đủ tồn',
    lowStock: 'Sắp hết hàng',
  },
  metrics: {
    onHand: 'Tồn thực tế (quantityOnHand)',
    onHandNote: 'Bộ đếm vận hành. Không bao giờ âm (CST-061).',
    held: 'Đang giữ mềm (heldQuantity)',
    heldNote: 'Tổng giữ mềm còn hiệu lực. Không trừ tồn thực tế.',
    reserved: 'Đã giữ chính thức (reservedQuantity)',
    reservedNote: 'Tổng giữ kho chính thức còn hiệu lực.',
    available: 'Khả dụng (available)',
    availableNote: 'Tính dưới khoá dòng, không lưu trữ. Chỉ đúng trong giao dịch đã tính ra nó.',
  },
  threshold: {
    /** `775:155` — the flag is on, so the configured threshold is named. */
    lowStockTitle: (threshold: number) => `Dưới ngưỡng cảnh báo (lowStockThreshold = ${threshold})`,
    lowStockBody:
      'lowStock so sánh tồn THỰC TẾ với ngưỡng — giữ mềm và giữ chính thức không làm cờ này bật. Khả dụng âm là hệ quả hợp lệ của giữ kho vượt tồn, không phải lỗi dữ liệu. Ngưỡng do hệ thống cấu hình; APP8 không có thao tác sửa ngưỡng nên màn này chỉ hiển thị.',
    /** `775:57` — a threshold exists and the flag is off. */
    configured: (threshold: number) =>
      `lowStockThreshold = ${threshold} · lowStock = false. Không có thao tác sửa ngưỡng trong APP8 — B01 không công bố API nào cho việc đó.`,
    /** `776:53` — no threshold at all. Nothing is inferred from the quantity. */
    absent:
      'lowStockThreshold vắng mặt · lowStock = false. Khi không cấu hình ngưỡng, cờ luôn false — không suy diễn ngưỡng từ số lượng.',
  },
  ledger: {
    title: 'Lịch sử chuyển động',
    bound: 'Mới nhất trước · tối đa 100 bản ghi',
    source:
      'Nguồn: GET …/stock/ledger. Không có API phân trang — hợp đồng chỉ trả một trang kèm cờ truncated. Không thiết kế cuộn vô hạn giả.',
    columns: {
      entryKind: 'Loại chuyển động',
      quantity: 'Số lượng',
      onHandDelta: 'Ảnh hưởng tồn',
      reason: 'Lý do',
      occurredAt: 'Thời điểm',
    },
    /** A movement that carries no reason. Absent is not empty and not unknown. */
    noReason: '—',
    truncatedTitle: 'Đang hiển thị 100 chuyển động mới nhất',
    truncatedBody:
      'Còn chuyển động cũ hơn không nằm trong trang này. APP8-B01 chưa công bố hợp đồng phân trang cho sổ kho, nên không có nút “tải thêm”, không cuộn vô hạn và không số trang.',
    failureTitle: 'Không tải được lịch sử chuyển động',
    failureBody: 'Số liệu tồn kho bên trên vẫn là dữ liệu máy chủ. Chỉ phần lịch sử chưa đọc được.',
    retry: 'Tải lại lịch sử',
  },
  newAnchor: {
    lead: (skuId: string) =>
      `SKU ${skuId} · Bản ghi tồn vừa được tạo lười ở lần đọc này. Giá trị khởi tạo 0 là câu trả lời của kho, không phải giá trị mặc định do giao diện bịa ra.`,
    title: 'Chưa có chuyển động nào cho SKU này',
    body: 'Mảng entries rỗng là câu trả lời bình thường, không phải lỗi. Số lượng thực đầu tiên chỉ đến qua một điều chỉnh có kiểm toán — không có thao tác “ghi đè tồn tuyệt đối” trong APP8.',
  },
  failure: {
    /** `776:168` — INVENTORY_SKU_NOT_FOUND. */
    missingTitle: 'Không tìm thấy SKU',
    missingBody:
      'INVENTORY_SKU_NOT_FOUND · 404. Khoá ngoại là thẩm quyền duy nhất về việc SKU có tồn tại hay không — giao diện không tự kiểm tra trước. Kiểm tra lại mã SKU hoặc mở lại từ danh mục.',
    backToCatalog: 'Mở lại từ danh mục',
    /** `776:176` — anything the platform answers with a sanitised 5xx. */
    retryTitle: 'Không tải được tồn kho',
    retryBody:
      'Lỗi máy chủ · 500. Dữ liệu tồn kho chưa hiển thị được. Không có số liệu nào được đoán và không có điều chỉnh nào được gửi.',
    reload: 'Tải lại',
    retry: 'Thử lại',
    /** `776:182` — the Admin session died. */
    unauthenticatedTitle: 'Phiên đăng nhập đã hết hạn',
    unauthenticatedBody:
      '401. Đăng nhập lại để tiếp tục. Mọi thao tác kho đều yêu cầu phiên quản trị hợp lệ.',
    signIn: 'Đăng nhập lại',
    /** `787:134` — the write reached the API from a source it does not accept. */
    forbiddenTitle: 'Thao tác bị từ chối',
    forbiddenBody: '403. Thực hiện lại từ giao diện quản trị chính thức.',
  },
  adjust: {
    title: 'Điều chỉnh tồn kho',
    context: (skuId: string, onHand: number, available: number) =>
      `SKU ${skuId} · tồn hiện tại ${onHand} · khả dụng ${available}`,
    deltaLabel: 'Chênh lệch (số nguyên có dấu) · bắt buộc',
    deltaHelp: 'Số nguyên khác 0. Dấu − để giảm, + để tăng. Không nhận số thập phân.',
    reasonLabel: 'Lý do · bắt buộc',
    reasonHelp: 'Bắt buộc. Chuỗi trắng không được coi là lý do. Tối đa 2.000 ký tự.',
    consequenceTitle: 'Hệ quả của thao tác này',
    consequenceBody:
      'Điều chỉnh là một chênh lệch CÓ DẤU cộng vào tồn thực tế, được ghi vào sổ kiểm toán kèm lý do và danh tính quản trị viên. Không có ghi đè tuyệt đối: một giá trị tuyệt đối sẽ xoá mất thay đổi mà giao dịch khác vừa ghi.',
    previewTitle: 'Sau khi áp dụng',
    previewBody: (
      onHandBefore: number,
      onHandAfter: number,
      availableBefore: number,
      availableAfter: number,
    ) =>
      `Tồn thực tế ${onHandBefore} → ${onHandAfter} · khả dụng ${availableBefore} → ${availableAfter}. Con số xem trước này chỉ để định hướng; kết quả thật do máy chủ tính dưới khoá dòng.`,
    cancel: 'Huỷ',
    submit: 'Áp dụng điều chỉnh',
    submitting: 'Đang áp dụng…',
    close: 'Đóng',
  },
  validation: {
    blockedTitle: 'Chặn tại chỗ, không gửi đi',
    blockedBody:
      'Cả hai lỗi trên đều được máy chủ từ chối bằng 400. Giao diện nêu đúng trường sai để quản trị viên sửa ngay, thay vì gửi một yêu cầu chắc chắn hỏng.',
    deltaRequired: 'Vui lòng nhập chênh lệch.',
    deltaNotInteger: 'Chênh lệch phải là số nguyên — không nhận số thập phân.',
    deltaZero: 'Điều chỉnh phải làm thay đổi số lượng — chênh lệch 0 không hợp lệ.',
    deltaOutOfRange: 'Chênh lệch vượt quá phạm vi hợp đồng cho phép.',
    reasonRequired: 'Vui lòng nhập lý do. Đây là bằng chứng kiểm toán bắt buộc cho mọi điều chỉnh.',
    reasonTooLong: 'Lý do vượt quá 2.000 ký tự.',
  },
  submitting: {
    context: (skuId: string) => `SKU ${skuId} · đang ghi vào sổ kho`,
    title: 'Đang xử lý',
    body: 'Không đóng cửa sổ và không bấm lại. Nếu kết nối gián đoạn, kết quả thật vẫn là kết quả máy chủ đã ghi — hãy tải lại tồn kho để đọc lại, đừng gửi lại một điều chỉnh thứ hai.',
  },
  success: {
    title: 'Đã ghi điều chỉnh',
    context: (skuId: string) => `SKU ${skuId}`,
    noteTitle: 'Tồn kho đã cập nhật',
    noteBody: (
      onHandBefore: number,
      onHandAfter: number,
      availableBefore: number,
      availableAfter: number,
    ) =>
      `Tồn thực tế ${onHandBefore} → ${onHandAfter}. Khả dụng ${availableBefore} → ${availableAfter}. Một dòng ADJUSTMENT đã được ghi vào sổ kèm lý do và danh tính người thực hiện.`,
    ledgerTitle: 'Sổ kho là nguồn dựng lại',
    ledgerBody:
      'Tổng cột “ảnh hưởng tồn” dựng lại đúng bộ đếm. Sổ chỉ ghi thêm, không sửa và không xoá.',
    viewLedger: 'Xem lịch sử chuyển động',
  },
  refusal: {
    /** `777:99` / `787:104` — INVENTORY_STOCK_WOULD_GO_NEGATIVE. */
    negativeHeading: 'Không thể áp dụng điều chỉnh',
    negativeContext: (skuId: string, onHand: number) => `SKU ${skuId} · tồn hiện tại ${onHand}`,
    negativeTitle: 'Điều chỉnh sẽ làm tồn kho âm',
    negativeBody: (onHand: number, delta: number, resulting: string) =>
      `INVENTORY_STOCK_WOULD_GO_NEGATIVE · 409. Tồn thực tế là ${onHand}; ${
        delta < 0 ? `giảm ${Math.abs(delta)}` : `thay đổi ${delta}`
      } sẽ đưa về ${resulting}. Không có gì được ghi: không đổi tồn, không thêm dòng sổ. Hãy nhập chênh lệch không vượt quá ${onHand}, hoặc kiểm kho lại trước.`,
    overrideTitle: 'Vì sao không có quyền ghi đè',
    overrideBody:
      'Quyền ghi đè của quản trị viên áp dụng cho việc điều chỉnh, nhưng KHÔNG BAO GIỜ cho tồn kho âm. Ràng buộc CSDL là chốt chặn cuối; đây là câu trả lời mà quản trị viên hành động được.',
    editDelta: 'Sửa chênh lệch',
    /** `787:110` — the SKU disappeared underneath the open dialog. */
    missingTitle: 'Không tìm thấy SKU',
    missingBody:
      'INVENTORY_SKU_NOT_FOUND · 404. Không có gì được ghi. Kiểm tra lại mã SKU hoặc mở lại từ danh mục.',
    /** `787:128` / `787:134`. */
    unauthenticatedTitle: 'Phiên đăng nhập đã hết hạn',
    unauthenticatedBody: '401. Không có gì được ghi. Đăng nhập lại để tiếp tục.',
    forbiddenTitle: 'Thao tác bị từ chối',
    forbiddenBody: '403. Không có gì được ghi. Thực hiện lại từ giao diện quản trị chính thức.',
    /** `787:140` — the sanitised platform 5xx. */
    serverTitle: 'Có lỗi xảy ra',
    serverBody: '500. Thử lại. Không đoán số liệu và không hiển thị thông tin nội bộ của máy chủ.',
    /**
     * `777:75` — the transport failed with no response line, so whether the
     * server committed is unknown. Never reported as a failure and never
     * resubmitted.
     */
    ambiguousTitle: 'Chưa biết kết quả',
    ambiguousBody:
      'Kết nối gián đoạn trước khi máy chủ trả lời. Điều chỉnh có thể đã được ghi. Số liệu bên dưới đã được đọc lại từ máy chủ — hãy kiểm tra trước khi gửi bất kỳ điều chỉnh nào khác.',
  },
} as const;
