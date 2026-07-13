# 01 — Product Requirements

**Status:** Approved baseline  
**Version:** 0.1.0

## 1. Product surfaces

Hệ thống gồm bốn bề mặt chính:

1. Public Storefront.
2. Product Customizer.
3. Customer Secure Flow.
4. Admin Console.

## 2. Public Storefront

### 2.1. Trang bắt buộc

- Trang chủ.
- Giới thiệu cửa hàng.
- Danh mục sản phẩm.
- Chi tiết sản phẩm.
- Gallery sản phẩm đã thực hiện.
- Trang dịch vụ.
- Trang FAQ.
- Trang liên hệ.
- Chính sách giao hàng.
- Chính sách thanh toán.
- Chính sách đổi trả.
- Chính sách bảo mật.
- Landing page SEO theo nhu cầu.

### 2.2. Catalog

Mỗi sản phẩm phải hỗ trợ:

- Tên.
- Mã sản phẩm.
- Mô tả.
- Danh mục.
- Hình ảnh.
- Biến thể màu.
- Biến thể kích thước.
- SKU.
- Chất liệu.
- Giá sản phẩm nền.
- Trạng thái tồn kho.
- Các vùng có thể thêu.
- Hình ảnh tương ứng từng mặt/vùng.
- Quy tắc preview.
- Gợi ý mẫu thiết kế.
- Thời gian thực hiện tham khảo.

### 2.3. Gallery

Gallery phải hỗ trợ:

- Hình ảnh sản phẩm thật.
- Nhóm theo loại sản phẩm.
- Nhóm theo phong cách hoặc nhu cầu.
- Nội dung mô tả ngắn.
- Liên kết tới sản phẩm hoặc dịch vụ liên quan.
- Tối ưu SEO.
- Không bắt buộc có blog.

## 3. Product Customizer

Customizer phải cho phép:

- Chọn sản phẩm.
- Chọn biến thể.
- Chọn mặt/vùng thêu.
- Thêm text.
- Thêm ảnh.
- Thêm SVG.
- Thêm hình khối cơ bản.
- Vẽ tay.
- Quản lý layer.
- Resize, rotate, flip.
- Align, distribute, snap.
- Group/ungroup.
- Lock/hide.
- Zoom/pan.
- Undo/redo.
- Crop.
- Xóa nền.
- Opacity.
- Chữ cong.
- Font whitelist.
- Chọn màu chỉ.
- Xem kích thước thiết kế theo đơn vị thực tế.
- Cảnh báo vượt vùng thêu.
- Autosave.
- Preview 2D có watermark.

Customizer không cho phép:

- Export PNG.
- Export SVG.
- Export PDF.
- Download scene document.
- Download asset gốc nếu asset không phải do khách upload.
- Chỉnh vector node chuyên nghiệp.
- Digitizing.
- Mô phỏng mũi chỉ.
- 3D preview.

## 4. Customer secure flow

Khách không bắt buộc tạo tài khoản bằng mật khẩu trước khi thiết kế.

Khi gửi yêu cầu:

- Khách phải xác minh email hoặc số điện thoại.
- Hệ thống tạo secure link.
- Secure link cho phép:
  - Xem yêu cầu.
  - Xem báo giá.
  - Xem phiên bản thiết kế.
  - Yêu cầu chỉnh sửa.
  - Phê duyệt thiết kế.
  - Thanh toán.
- Secure link phải có thời hạn hoặc cơ chế thu hồi phù hợp.
- Khách không có thư viện thiết kế kiểu Canva.

## 5. Custom embroidery request

Một yêu cầu custom phải chứa:

- Thông tin khách.
- Sản phẩm cửa hàng hoặc sản phẩm khách cung cấp.
- Biến thể.
- Số lượng.
- Thiết kế gửi lên.
- Vùng thêu.
- Kích thước mong muốn.
- Số màu dự kiến.
- Ghi chú.
- Asset upload.
- Trạng thái xử lý.
- Version history.
- Báo giá.
- Thông tin thanh toán.
- Thông tin giao hàng.

## 6. Manual quotation

Admin báo giá thủ công dựa trên:

- Kích thước.
- Số màu.
- Số mũi thêu.
- Số lượng.
- Giá sản phẩm nền.
- Phí digitizing nếu có.
- Phí vận chuyển.
- Điều chỉnh thủ công.

Báo giá phải:

- Có phiên bản.
- Có thời hạn hiệu lực.
- Có breakdown.
- Có tổng tiền.
- Có tiền cọc 40%.
- Có số tiền còn lại 60%.
- Không bị thay đổi khi bảng giá tương lai thay đổi.

## 7. Design review and approval

- Digitizing được thực hiện thủ công.
- Một thiết kế có thể sửa nhiều lần.
- Không giới hạn cứng số vòng sửa.
- Mỗi lần sửa tạo phiên bản mới.
- Khách duyệt qua secure link.
- Phiên bản đã duyệt trở thành immutable snapshot.
- Mọi thay đổi sau duyệt tạo version mới và yêu cầu duyệt lại.

## 8. Payment

Phương thức mong muốn:

- Chuyển khoản.
- MoMo.
- ZaloPay.

Quy tắc:

- Khách đặt cọc 40% sau khi duyệt thiết kế.
- 60% còn lại phải thanh toán trước khi giao hàng.
- Hệ thống phải xử lý idempotency cho callback hoặc webhook.
- Admin có thể reconciliation thanh toán thủ công.
- Không được coi một payment là thành công chỉ dựa trên client redirect.

## 9. Inventory

Quản lý tồn kho theo:

- Product.
- Variant.
- SKU.
- Màu.
- Size.
- Số lượng khả dụng.
- Số lượng giữ.
- Số lượng đã bán.

Nguyên tắc giữ hàng:

- Gửi yêu cầu: chưa giữ chính thức.
- Báo giá: có thể soft hold.
- Duyệt và cọc: giữ chính thức.

## 10. Shipping

Trong phạm vi hiện tại:

- Admin nhập phí giao hàng.
- Admin có thể lưu tên đơn vị vận chuyển.
- Admin có thể lưu mã vận đơn nội bộ.
- Không tích hợp API vận chuyển.
- Không tự tính phí từ bên thứ ba.
- Không tracking hành trình giao hàng cho khách.
- Không phát triển adapter vận chuyển.

## 11. Communication

- Hiển thị nút Zalo.
- Hiển thị nút Messenger.
- Có thể đính kèm mã yêu cầu vào nội dung mở đầu nếu nền tảng hỗ trợ.
- Không chatbot.
- Không AI tư vấn.
- Không webhook hội thoại.
- Không unified inbox.
- Không đồng bộ tin nhắn vào Admin.

## 12. Admin Console

Một tài khoản Admin duy nhất có thể:

- Quản lý catalog.
- Quản lý gallery.
- Quản lý tồn kho.
- Quản lý yêu cầu.
- Quản lý design versions.
- Tạo báo giá.
- Gửi phiên bản cho khách duyệt.
- Ghi nhận yêu cầu sửa.
- Ghi nhận thanh toán.
- Quản lý trạng thái sản xuất.
- Quản lý giao hàng.
- Cấu hình watermark.
- Cấu hình nội dung SEO.
- Xem audit log.
- Backup/export dữ liệu theo quyền nội bộ phù hợp.

## 13. B2B future readiness

Data model nên hỗ trợ sau này:

- Tên doanh nghiệp.
- Mã số thuế.
- Người liên hệ.
- Yêu cầu hóa đơn.
- Nhiều size và số lượng.
- Báo giá PDF.
- Đặt lại đơn cũ.

Không xây procurement workflow phức tạp trong phạm vi hiện tại.
