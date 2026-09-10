# Mẫu báo lỗi / góp ý khi kiểm thử Nét Thêu

Sao chép phần bên dưới, điền những gì bạn nhớ. Không cần điền đủ mọi mục —
ghi được bao nhiêu thì ghi bấy nhiêu.

---

```markdown
## Tiêu đề ngắn


## Mức độ
- [ ] Chặn sử dụng — không đi tiếp được
- [ ] Nghiêm trọng — tiền / dữ liệu / trạng thái hiện sai
- [ ] Khó chịu / gây nhầm — khó hiểu, phải đoán
- [ ] Nhỏ / thẩm mỹ — lệch, xấu, sai chữ
- [ ] Góp ý cải thiện — không phải lỗi

## Tôi đang ở đâu?
Ví dụ: Trang chi tiết sản phẩm / Trang thanh toán / Admin — đơn hàng


## Tôi vừa làm gì?
1.
2.
3.

## Tôi mong đợi điều gì xảy ra?


## Thực tế xảy ra điều gì?


## Lỗi có lặp lại không?
- [ ] Luôn luôn
- [ ] Thỉnh thoảng
- [ ] Chỉ gặp một lần
- [ ] Chưa thử lại

## Thiết bị
- [ ] Máy tính
- [ ] Điện thoại
- [ ] Máy tính bảng

Nếu biết:
- Trình duyệt:
- Kích thước màn hình:

## Ảnh / video
Đính kèm nếu có.

## Ghi chú thêm

```

---

## Ví dụ đã điền

**Tiêu đề:** Đã thanh toán rồi mà trang đơn hàng vẫn ghi "chờ phí giao hàng"

**Mức độ:** Nghiêm trọng

**Tôi đang ở đâu?** Trang theo dõi đơn hàng của khách.

**Tôi vừa làm gì?**

1. Đặt một đơn hàng.
2. Cửa hàng đã nhập phí giao hàng.
3. Cửa hàng đã xác nhận đã nhận tiền.
4. Tôi mở lại đơn hàng từ email.

**Tôi mong đợi:** Thấy số tiền đã thanh toán và chữ "đang chuẩn bị giao".

**Thực tế:** Trang vẫn ghi "Có sau khi xưởng xác nhận phí giao hàng".

**Lặp lại:** Luôn luôn.

**Thiết bị:** Điện thoại.

**Ảnh:** (đính kèm ảnh chụp màn hình)

---

## Bạn không cần biết lỗi nằm ở đâu

Bạn chỉ cần mô tả **hiện tượng**: bạn ở đâu, bạn làm gì, bạn mong gì, và điều
gì đã thực sự xảy ra.

Đội phát triển sẽ tự tìm xem lỗi nằm ở giao diện, máy chủ, dữ liệu, email, tồn
kho hay chỗ nào khác, sửa lỗi, rồi báo lại để bạn thử tiếp.

Nếu cần hỏi thêm, đội phát triển chỉ hỏi những câu đơn giản như: "Bạn đang ở
màn hình nào?", "Bạn vừa bấm nút nào?", "Bạn có ảnh chụp màn hình không?".
