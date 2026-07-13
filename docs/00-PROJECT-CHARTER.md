# 00 — Project Charter

**Status:** Approved baseline  
**Version:** 0.1.0

## 1. Tên tạm thời

Embroidery Commerce Platform.

Tên thương hiệu và tên sản phẩm thương mại chưa được khóa.

## 2. Tầm nhìn

Xây dựng một web app tự sở hữu và tự vận hành để trở thành kênh kinh doanh online chính của cửa hàng thêu, giảm phụ thuộc vào TikTok, Shopee và các nền tảng có phí hoặc hạn chế quyền kiểm soát khách hàng.

Hệ thống phải giúp khách hàng:

- Khám phá sản phẩm.
- Hiểu năng lực cửa hàng.
- Cá nhân hóa sản phẩm.
- Gửi yêu cầu thêu.
- Duyệt thiết kế.
- Thanh toán.
- Hoàn tất đơn hàng.

Hệ thống phải giúp cửa hàng:

- Quản lý catalog.
- Quản lý tồn kho.
- Quản lý yêu cầu custom.
- Quản lý phiên bản thiết kế.
- Báo giá thủ công.
- Theo dõi quy trình digitizing và sản xuất.
- Quản lý thanh toán.
- Vận hành bằng một tài khoản Admin.

## 3. Mô hình kinh doanh

- B2C là trọng tâm hiện tại.
- Tỷ trọng mục tiêu dài hạn:
  - B2C: 70%.
  - B2B: 30%.
- B2B được chuẩn bị ở data model và product boundary, nhưng không phải ưu tiên phát triển ban đầu.
- Thị trường chính: Việt Nam.
- Một cửa hàng, một chi nhánh, một xưởng.
- Cửa hàng vừa bán sản phẩm nền vừa nhận thêu trên sản phẩm do khách cung cấp.

## 4. Nhóm sản phẩm chính

- Gấu bông.
- Khăn.
- Quần áo.
- Các sản phẩm tương tự có bề mặt phù hợp để thêu chữ hoặc hình 2D.

## 5. Nguyên tắc phát triển

### 5.1. Production-grade ngay từ đầu

Không chấp nhận tính năng “làm tạm để chạy”. Mỗi tính năng được đưa vào sản phẩm phải có:

- UX hoàn chỉnh.
- Validation.
- Error state.
- Bảo mật phù hợp.
- Kiểm thử.
- Khả năng vận hành.
- Khả năng truy vết.
- Dữ liệu không bị mất hoặc ghi đè sai.

### 5.2. Chia nhỏ delivery nhưng không giảm chất lượng

Hệ thống được phát triển theo từng capability và vertical slice để có thể review chặt chẽ. Việc chia nhỏ không đồng nghĩa với cắt giảm tiêu chuẩn.

### 5.3. Không giao một prompt khổng lồ cho Claude

Claude chỉ được giao phạm vi nhỏ, rõ ràng, có acceptance criteria và test gate.

### 5.4. Nghiệp vụ là source of truth

Code, UI và kiến trúc phải phục vụ nghiệp vụ đã khóa trong bộ tài liệu này.

## 6. Mục tiêu kinh doanh chính

Mục tiêu ưu tiên cao nhất:

> Biến website tự hosting thành nguồn kinh doanh online chính của cửa hàng.

Các mục tiêu hỗ trợ:

- Tăng lượng khách trực tiếp.
- Giảm phí nền tảng.
- Sở hữu dữ liệu khách hàng.
- Nâng tỷ lệ chuyển đổi.
- Chuẩn hóa quy trình đặt thêu custom.
- Xây nền tảng có thể mở rộng khi xưởng phát triển.

## 7. Giới hạn quy mô hiện tại

- Sản phẩm: 20–100.
- Đơn hàng: dưới 100 đơn/tháng.
- Người dùng editor đồng thời: dưới 10.
- Admin: 1.
- Chi nhánh: 1.

## 8. Các nguyên tắc không được vi phạm

- Không để khách tải file thiết kế hoặc preview chất lượng cao.
- Không ghi đè thiết kế đã được duyệt.
- Không sản xuất từ một phiên bản khác phiên bản khách đã duyệt.
- Không cho phép thanh toán sai số tiền hoặc ghi nhận webhook trùng.
- Không để thay đổi bảng giá làm thay đổi báo giá hoặc đơn đã chốt.
- Không phụ thuộc vào tin nhắn Zalo/Messenger để xác định phiên bản được duyệt.
- Không tự động digitizing trong phạm vi hiện tại.
- Không xây 3D preview trong phạm vi hiện tại.
