/**
 * Every customer-visible string of the image capability (`APP3-S06`).
 *
 * The Studio copy rule holds: a label is a promise, so nothing here names a
 * capability this checkpoint does not have. There is no "cắt ảnh", no "xoá nền",
 * no "bộ lọc", no "độ mờ", no "hoàn tác" and no "đã lưu" — cropping, background
 * removal, filters and opacity are not delivered at all, history is `APP3-S08`'s
 * and saving is `APP3-S10`'s.
 *
 * The refusal rule holds too. The server answers a bounded state and never a
 * reason, and `APP3-P01`/`APP3-P02` answer with typed findings carrying JSON
 * paths and English developer messages. None of that is customer copy: each
 * sentence below states the fact and stops, and none of them names the asset, the
 * derivative, the session, a storage address or anything about how processing is
 * implemented.
 */
import { MAX_IMAGE_BYTES, UPLOADABLE_IMAGE_LABELS } from './studio-image-file';

export const STUDIO_IMAGE_COPY = {
  panelLabel: 'Ảnh thiết kế',

  // The 1024 drawer, named exactly as the text drawer is: the trigger names the
  // panel it opens, and the panel carries the same name, so the two are one
  // thing to a screen reader.
  drawerOpen: 'Mở bảng ảnh thiết kế',
  drawerClose: 'Đóng bảng ảnh thiết kế',

  /**
   * The 390 state.
   *
   * It states the fact and promises nothing. Mobile image editing — the bottom
   * sheet and the touch surfaces around it — belongs to `APP3-S11`, and copy
   * saying it is "coming" would commit a checkpoint nobody has reviewed.
   */
  mobileUnavailable: 'Màn hình này chưa đủ rộng để thêm ảnh vào bản thiết kế.',

  chooseLabel: 'Chọn ảnh từ máy',
  replaceLabel: 'Thay ảnh khác',
  chooseHint: `Nhận ${UPLOADABLE_IMAGE_LABELS.join(', ')}, tối đa ${String(
    Math.floor(MAX_IMAGE_BYTES / (1024 * 1024)),
  )} MB.`,

  /**
   * Uploading, without a number.
   *
   * The transport reports upload progress only when the browser gives a real
   * `progress` event with a total; when it does not, this is what is shown. A
   * fabricated percentage is a claim about how far the file has got, and an
   * invented one is wrong in exactly the moments a customer is watching it.
   */
  uploading: 'Đang tải ảnh lên…',
  uploadingPercent: (percent: number) => `Đang tải ảnh lên… ${String(percent)}%`,

  /**
   * Server-side processing. One sentence for inspection and normalization alike,
   * because the server reports one state for both and inventing a distinction in
   * the UI would be describing a pipeline the customer cannot act on.
   */
  processing: 'Đang xử lý ảnh…',
  processingHint: 'Ảnh sẽ hiện trên khung thiết kế ngay khi xử lý xong.',

  placed: 'Đã thêm ảnh vào bản thiết kế.',

  // Refusals. Each is a different fact, so each is a different sentence.
  rejectedType: `Định dạng ảnh này chưa được nhận. Chỉ nhận ${UPLOADABLE_IMAGE_LABELS.join(', ')}.`,
  rejectedSize: `Ảnh vượt quá ${String(Math.floor(MAX_IMAGE_BYTES / (1024 * 1024)))} MB.`,
  /**
   * Inspection refused the file. Deliberately generic: the server publishes no
   * safe reason code for a Session upload, so naming one would be inventing it.
   */
  rejectedInspection: 'Ảnh này không dùng được nên chưa được thêm vào bản thiết kế.',
  uploadFailed: 'Chưa tải được ảnh lên. Vui lòng thử lại.',
  statusFailed: 'Chưa kiểm tra được trạng thái ảnh. Vui lòng thử lại.',
  previewFailed: 'Chưa tải được ảnh để hiển thị trên khung thiết kế.',
  sessionUnavailable: 'Phiên thiết kế này không còn dùng được nên chưa thể thêm ảnh.',

  /** `APP3-P02` refused the placement. The design is left exactly as it was. */
  placementRefused: 'Ảnh này không đặt vừa vùng thêu cho phép nên chưa được thêm vào bản thiết kế.',
  replacementRefused:
    'Ảnh mới không giữ được vị trí và kích thước hiện tại nên bản thiết kế giữ nguyên ảnh cũ.',

  retry: 'Thử lại',
} as const;
