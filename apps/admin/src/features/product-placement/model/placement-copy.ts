/**
 * Vietnamese copy catalog for Admin placement authoring (`APP3-A01`).
 *
 * Reproduced from the approved nodes `FIG-ADMIN-PLACEMENT-DESKTOP-{DEFAULT,
 * AREAEDIT,VALIDATION,LOADING}` (section `596:7`) and the narrow-desktop
 * reference `FIG-ADMIN-PLACEMENT-NARROW-1280` (`618:74`).
 *
 * Three rules shape what may appear here.
 *
 * *Retirement is never described as deletion.* `IMP-D041` PO-07 retires a side
 * or area and keeps it forever, because a Template or a live Design Session may
 * still reference it. Copy that said "xoá" would promise something the system
 * deliberately cannot do.
 *
 * *No string names a storage internal.* Not a bucket, an object key, a
 * derivative, a checksum or a URL. The operator picks an Asset; everything
 * about how it is stored is invisible here.
 *
 * *A failure message never echoes the server.* The server's message may name a
 * table or a constraint. Every string below is fixed, chosen by the code alone.
 */
export const PLACEMENT_COPY = {
  screen: {
    title: 'Vị trí thêu',
    subtitle: 'Xác định mặt sản phẩm và vùng thêu cho phép.',
    backToProduct: 'Quay lại sản phẩm',
  },

  entry: {
    label: 'Vị trí thêu',
  },

  states: {
    loading: 'Đang tải vị trí thêu…',
    notFoundTitle: 'Không tìm thấy sản phẩm',
    notFoundBody: 'Sản phẩm này không tồn tại hoặc đã bị gỡ khỏi danh sách.',
    unavailableTitle: 'Không tải được vị trí thêu',
    unavailableBody: 'Đã xảy ra lỗi khi tải dữ liệu. Vui lòng thử lại.',
    retry: 'Thử lại',
    backToList: 'Về danh sách sản phẩm',
    emptyTitle: 'Chưa có mặt sản phẩm nào',
    emptyBody: 'Thêm mặt sản phẩm đầu tiên để bắt đầu xác định vùng thêu.',
  },

  hierarchy: {
    title: 'Sản phẩm · Mặt · Vùng thêu',
    productLabel: 'Sản phẩm',
    sidesLabel: 'Mặt sản phẩm',
    areasLabel: 'Vùng thêu',
    addSide: 'Thêm mặt sản phẩm',
    addArea: 'Thêm vùng thêu',
    /**
     * Retirement, never deletion — the row stays as history.
     *
     * Deliberately short. The hierarchy column is 296px at 1440 and narrower at
     * 1280, and a longer label wrapped to four lines and squeezed the row name
     * it sits beside. What is being retired is unambiguous from the row.
     */
    retireSide: 'Ngừng dùng',
    retireArea: 'Ngừng dùng',
    undoRetire: 'Hoàn tác',
    retiredBadge: 'Đã ngừng dùng',
    pendingRetireBadge: 'Sẽ ngừng dùng sau khi lưu',
    supersededBadge: 'Đã được thay thế',
    newBadge: 'Mới',
    noAreas: 'Chưa có vùng thêu',
    unnamedSide: 'Mặt chưa đặt tên',
    unnamedArea: 'Vùng chưa đặt tên',
  },

  preview: {
    title: 'Xem trước vị trí',
    empty: 'Chọn một mặt sản phẩm để xem trước.',
    /**
     * There is no authenticated Admin media-delivery contract, so the canvas is
     * drawn to the authored dimensions and the background is represented rather
     * than fetched. Saying so is more honest than an empty frame.
     */
    backgroundPlaceholder: 'Ảnh nền chưa hiển thị được trong màn hình quản trị.',
    canvasLabel: (width: number, height: number) => `Khung nền ${width} × ${height} px`,
    areaLabel: (name: string) => `Vùng thêu ${name}`,
    outsideCanvas: 'Vùng thêu nằm ngoài khung nền.',
    safeBoundary: 'Ranh giới an toàn',
  },

  inspector: {
    title: 'Thông số',
    empty: 'Chọn một mặt hoặc một vùng thêu để chỉnh sửa.',
    sideSection: 'Mặt sản phẩm',
    areaSection: 'Vùng thêu',
    readOnlyRetired: 'Hàng đã ngừng dùng chỉ để tham khảo và không thể chỉnh sửa.',
  },

  fields: {
    code: 'Mã',
    codeHelp: 'Chữ thường, số, gạch ngang hoặc gạch dưới. Tối đa 64 ký tự.',
    name: 'Tên hiển thị',
    nameHelp: 'Tên mà nhân viên nhìn thấy. Không phải mã định danh.',
    displayOrder: 'Thứ tự hiển thị',
    displayOrderHelp: 'Số nguyên từ 0 đến 10.000.',
    backgroundAsset: 'Ảnh nền',
    backgroundAssetHelp: 'Chọn một tài sản đã được duyệt làm ảnh nền cho mặt này.',
    chooseBackground: 'Chọn ảnh nền',
    changeBackground: 'Đổi ảnh nền',
    imageWidthPx: 'Chiều rộng ảnh (px)',
    imageHeightPx: 'Chiều cao ảnh (px)',
    physicalWidthMm: 'Chiều rộng thực tế (mm)',
    physicalHeightMm: 'Chiều cao thực tế (mm)',
    pxPerMm: 'Tỷ lệ (px/mm)',
    pxPerMmHelp: 'Phải khớp với cả chiều rộng và chiều cao của mặt này.',
    boundXPx: 'Toạ độ X (px)',
    boundYPx: 'Toạ độ Y (px)',
    boundWidthPx: 'Chiều rộng vùng (px)',
    boundHeightPx: 'Chiều cao vùng (px)',
    maxWidthMm: 'Giới hạn rộng (mm)',
    maxHeightMm: 'Giới hạn cao (mm)',
    maxHelp: 'Để trống nếu chỉ giới hạn bởi kích thước mặt.',
  },

  validation: {
    required: 'Vui lòng nhập giá trị.',
    notNumber: 'Giá trị phải là một số.',
    notPositive: 'Giá trị phải lớn hơn 0.',
    negative: 'Giá trị không được âm.',
    tooLarge: 'Giá trị vượt quá giới hạn cho phép.',
    codeFormat: 'Mã chỉ gồm chữ thường, số, gạch ngang hoặc gạch dưới.',
    nameLength: 'Tên hiển thị quá dài.',
    orderRange: 'Thứ tự hiển thị phải là số nguyên từ 0 đến 10.000.',
    outsideCanvas: 'Vùng thêu phải nằm hoàn toàn trong khung nền.',
    scaleMismatch: 'Tỷ lệ px/mm không khớp với kích thước ảnh và kích thước thực tế.',
    duplicateCode: 'Mã này đã được dùng.',
    summaryTitle: 'Không thể lưu vì còn giá trị chưa hợp lệ',
    summaryBody: 'Vui lòng sửa các trường được đánh dấu rồi lưu lại.',
  },

  save: {
    action: 'Lưu vị trí thêu',
    saving: 'Đang lưu…',
    saved: 'Đã lưu vị trí thêu.',
    unsaved: 'Có thay đổi chưa lưu',
    clean: 'Chưa có thay đổi',
    discard: 'Huỷ thay đổi',
  },

  failure: {
    genericTitle: 'Không lưu được vị trí thêu',
    genericBody: 'Đã xảy ra lỗi khi lưu. Các thay đổi của bạn vẫn được giữ nguyên.',
    invalidTitle: 'Máy chủ từ chối vị trí thêu',
    invalidBody: 'Một số giá trị chưa hợp lệ. Vui lòng kiểm tra lại rồi lưu lại.',
    geometryTitle: 'Hình học vị trí thêu không hợp lệ',
    geometryBody: 'Vùng thêu phải nằm trong khung nền và tỷ lệ px/mm phải khớp với kích thước mặt.',
    immutableTitle: 'Vị trí thêu đang được sử dụng',
    immutableBody:
      'Mặt hoặc vùng thêu này đã được dùng trong mẫu thiết kế nên không thể đổi mã hay hình học. Hãy ngừng dùng nó và thêm một hàng thay thế.',
    backgroundTitle: 'Ảnh nền không dùng được',
    backgroundBody: 'Ảnh nền đã chọn không tồn tại hoặc không được phép dùng cho mặt sản phẩm.',
    networkTitle: 'Không kết nối được máy chủ',
    networkBody: 'Các thay đổi của bạn vẫn được giữ nguyên. Vui lòng thử lưu lại.',
  },

  conflict: {
    title: 'Vị trí thêu đã thay đổi trên máy chủ',
    body: 'Một thay đổi khác đã được lưu sau khi bạn mở màn hình này. Máy chủ chưa ghi đè bất cứ điều gì.',
    keepNote:
      'Bản nháp của bạn vẫn hiển thị để đối chiếu, nhưng chưa được lưu và chỉ tồn tại trong trình duyệt này.',
    reload: 'Tải lại bản mới nhất',
    keep: 'Giữ bản nháp để đối chiếu',
    banner: 'Bản nháp chưa được lưu. Hãy tải lại bản mới nhất trước khi lưu.',
  },

  picker: {
    title: 'Chọn ảnh nền',
    help: 'Chỉ những tài sản đã được duyệt làm ảnh danh mục mới xuất hiện ở đây.',
    loading: 'Đang tải tài sản…',
    emptyTitle: 'Chưa có tài sản nào dùng được',
    emptyBody: 'Tải lên và chờ duyệt tài sản trước khi chọn làm ảnh nền.',
    unavailableTitle: 'Không tải được danh sách tài sản',
    unavailableBody: 'Đã xảy ra lỗi khi tải tài sản. Vui lòng thử lại.',
    retry: 'Thử lại',
    loadMore: 'Tải thêm tài sản',
    loadingMore: 'Đang tải…',
    loadMoreFailed: 'Không tải thêm được. Vui lòng thử lại.',
    cancel: 'Huỷ',
    confirm: 'Dùng ảnh này',
    selected: 'Đang chọn',
  },

  mobile: {
    title: 'Cần màn hình rộng hơn',
    body: 'Việc xác định vị trí thêu cần thao tác chính xác trên khung nền nên chỉ hỗ trợ trên màn hình máy tính. Bạn vẫn có thể xem cấu trúc bên dưới.',
    readOnlyBadge: 'Chỉ xem',
  },
} as const;
