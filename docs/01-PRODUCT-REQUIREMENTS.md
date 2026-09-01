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
- Trang mua hàng trực tiếp một sản phẩm (`/mua-hang/[slug]`) — xem §14.
- Bề mặt đơn hàng bảo mật (`/truy-cap/don-hang`) — xem §14.

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

Quy tắc 40/60 ở trên chỉ áp dụng cho thương mại custom (Wave 2). Đơn
`READY_MADE` dùng **một** nghĩa vụ thanh toán `FULL` duy nhất, không có
`DEPOSIT`/`REMAINING` — xem §14.5.

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

Ba nguyên tắc trên thuộc luồng custom. Đơn `READY_MADE` giữ hàng ngay tại thời
điểm tạo đơn bền vững, kèm hạn giữ hàng — xem §14.7.

## 10. Shipping

Trong phạm vi hiện tại:

- Admin nhập phí giao hàng.
- Admin có thể lưu tên đơn vị vận chuyển.
- Admin có thể lưu mã vận đơn nội bộ.
- Không tích hợp API vận chuyển.
- Không tự tính phí từ bên thứ ba.
- Không tracking hành trình giao hàng cho khách.
- Không phát triển adapter vận chuyển.

Với đơn `READY_MADE`, phí giao hàng do Admin nhập thủ công **trước khi** khách
thanh toán, và tổng phải trả chỉ tồn tại sau bước đó — xem §14.4.

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

## 14. Ready-Made direct commerce (Wave 1)

Nguồn: `APP12-P01`. Quyết định: `D-043`, `IMP-D058`. Charter §3 đã xác định
"Cửa hàng vừa bán sản phẩm nền vừa nhận thêu trên sản phẩm do khách cung cấp";
mục này đặc tả phần **bán sản phẩm nền trực tiếp**, phần trước đây chưa được
đặc tả đủ chi tiết để triển khai.

### 14.1. Phạm vi

`READY_MADE` là việc mua một sản phẩm nền có sẵn, **không** kèm thêu theo yêu
cầu. Nó không phụ thuộc và không được phép phụ thuộc vào: `custom_request`,
báo giá, phiên bản thiết kế, approval snapshot, Design Studio/Editor, hay
production job. Hạ tầng dùng chung chỉ được tái sử dụng khi ngữ nghĩa vẫn đúng.

### 14.2. Đối tượng mua và giá

- Đối tượng mua được là **SKU**: `Product → Product Variant → SKU`.
- Khách mua **một SKU × số lượng**. Không giỏ hàng, không bundle, không mô hình
  sản phẩm bán hàng thứ hai.
- Đơn giá do máy chủ quyết định:
  `COALESCE(skus.price_override_amount, products.base_price_amount)`, đơn vị
  `VND`.
- Máy chủ tính `merchandise_subtotal = unit_price × quantity`.
- Client **không bao giờ** là nguồn sự thật cho đơn giá, tạm tính, phí giao
  hàng hay tổng phải trả.
- Khi tạo đơn, dòng hàng đóng băng: tên sản phẩm, nhãn biến thể, nhãn size,
  định danh SKU, đơn giá, số lượng, thành tiền, đơn vị tiền tệ. Sửa Catalog về
  sau không làm thay đổi đơn đã tạo.

### 14.3. Khả năng bán được

`PUBLIC PRODUCT` **khác** `CURRENTLY BUYABLE SKU`. Một Product có thể vẫn hiển
thị công khai trong khi không SKU nào mua được. Một SKU chỉ mua được khi runtime
chứng minh tối thiểu:

- Product ở trạng thái public/published;
- danh mục của nó đủ public để Product được publish;
- Product Variant đang active;
- SKU đang active;
- giá phân giải được và hợp lệ;
- tồn kho khả dụng > 0, tính từ `sku_stocks` **trừ** các reservation đang hiệu
  lực — **không** lấy từ `products.is_display_out_of_stock`, vốn chỉ là quyền
  trình bày thủ công chứ không phải sự thật tồn kho.

Khi không SKU nào mua được: Product Detail vẫn public theo quy tắc publication
hiện hành, CTA mua hàng chuyển sang trạng thái hết hàng/không khả dụng, và
không đơn `READY_MADE` nào được tạo.

### 14.4. Checkout và phí giao hàng

- Mô hình: `SINGLE_PRODUCT_DIRECT_CHECKOUT` tại `/mua-hang/[slug]`.
- Không giỏ hàng, không tài khoản khách, không shell checkout dùng chung riêng,
  không route xác nhận riêng.
- Khách phải xác minh danh tính liên hệ (tái dùng APP4 như primitive dùng
  chung). Không được tạo đơn `READY_MADE` cho danh tính chưa xác minh. Không
  biến việc này thành ngữ nghĩa custom-request và không bắt khách đi qua
  `/yeu-cau/moi`.
- Checkout thu các dữ kiện giao hàng mà mô hình shipping theo đơn hiện có thực
  sự cần. Không tích hợp hãng vận chuyển, không tính năng địa chỉ/bưu chính
  ngoài phạm vi hiện tại, không cam kết thời gian giao.
- Tại checkout, khách thấy: tạm tính hàng hóa; phí giao hàng = *chờ cửa hàng xác
  nhận*; tổng phải trả = *chưa thể thanh toán*. **Không** hiển thị tổng cuối bịa
  đặt.
- `READY_MADE_SHIPPING_FEE = MANUAL_ADMIN_SHIPPING_FEE_BEFORE_PAYMENT`. Không
  tự tính, không báo giá hãng vận chuyển, không mức phí cố định bịa đặt.

### 14.5. Thanh toán

- `READY_MADE_PAYMENT_KIND = FULL`: một nghĩa vụ, một tổng chính xác.
- Chuyển khoản ngân hàng thủ công, QR động, bằng chứng chuyển khoản tùy chọn khi
  mô hình bằng chứng hiện có hỗ trợ, Admin xác minh thủ công.
- Không dùng `DEPOSIT`, `REMAINING` hay 40/60 cho `READY_MADE`.
- Xác minh `FULL` thành công đưa đơn từ `AWAITING_PAYMENT` sang
  `READY_FOR_DELIVERY`. Không thêm trạng thái đơn `PAID`.

### 14.6. Bề mặt đơn hàng bảo mật

`ORDER_ACCESS` tại `/truy-cap/don-hang` là bề mặt duy nhất cho đơn/thanh
toán/trạng thái của khách: mã đơn, tóm tắt món hàng, tóm tắt giao hàng, trạng
thái chờ phí giao hàng, số tiền `FULL` hiện hành khi đã có, QR/hướng dẫn thanh
toán, trạng thái bằng chứng, sẵn sàng giao, đã giao, hoàn tất, đã hủy/hết hạn.
Không tài khoản khách, không lộ id nội bộ, không truy cập chéo đơn. Token tuân
theo mô hình bảo mật secure-access hiện hành.

### 14.7. Giữ hàng

Reservation được tạo tại thời điểm **tạo đơn bền vững** — không tại Product
Detail, không khi chọn SKU tạm thời, không sau khi thanh toán — vì tồn kho phải
được bảo vệ trong suốt chu kỳ nhập phí giao hàng và thanh toán thủ công. Hạn
giữ hàng: xem `BR-025`.

### 14.8. Ranh giới phát hành

Wave 1 phát hành thương mại `READY_MADE`; toàn bộ thêu custom thuộc Wave 2. Chi
tiết ở `BR-038` và tài liệu phase `APP12`.
