# Sound null safety

> **Nguồn gốc:** <https://dart.dev/null-safety> — *Sound null safety*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12

Ngôn ngữ Dart áp dụng **sound null safety** (null safety chặt chẽ, được bảo đảm), khiến
việc vô tình truy cập một thành viên trên giá trị `null` trở thành điều bất khả thi.

Trong Dart, các kiểu mặc định là **non-nullable**. Biến thuộc kiểu non-nullable bắt buộc
phải được khởi tạo, và chỉ có thể được gán những giá trị khác `null`.

Analyzer và các trình biên dịch của Dart bắt được những cách dùng không an toàn với các giá
trị có khả năng là `null` ngay tại thời điểm bạn đang viết code — biến thứ vốn là **lỗi lúc
chạy (runtime error)** ở các ngôn ngữ khác thành **lỗi phân tích (analysis error)** mà bạn
có thể sửa trước khi triển khai.

<a id="creating-variables"></a>
<a id="introduction-through-examples"></a>

## Ví dụ

Không biến nào trong đoạn code sau có thể mang giá trị `null`:

```dart
// None of these can ever be null.
var i = 42; // Inferred to be an int.
String name = getFileName();
final b = Foo();
```

> *Diễn giải:* không biến nào trong số này có thể là null; `i` được suy ra là `int`.

Để chỉ ra rằng một biến có thể mang giá trị `null`, hãy thêm `?` vào phần khai báo kiểu của
nó:

```dart
int? aNullableInt = null;
```

- Để xem ví dụ mang tính tương tác, hãy thử [Dart cheatsheet][].
- Để tìm hiểu thêm về null safety, xem [Hiểu về null safety][Understanding null safety].

[Dart cheatsheet]: https://dart.dev/resources/dart-cheatsheet
[Understanding null safety]: https://dart.dev/null-safety/understanding-null-safety

## Các nguyên tắc của null safety

Null safety trong Dart được xây dựng trên hai nguyên tắc thiết kế cốt lõi:

**Mặc định là non-nullable**
: Trừ khi bạn nói rõ với Dart rằng một biến có thể là null, nó được coi là non-nullable.
  Giá trị mặc định này được chọn sau khi nghiên cứu cho thấy non-null là lựa chọn phổ biến
  hơn hẳn trong các API.

**Chặt chẽ hoàn toàn (fully sound)**
: Nếu hệ thống kiểu xác định rằng một biến hay một biểu thức có kiểu non-nullable, thì được
  đảm bảo rằng nó **không bao giờ** có thể cho ra giá trị `null` tại thời điểm chạy.

Kết hợp lại, hai nguyên tắc này mang lại ít bug hơn, file binary nhỏ hơn, và tốc độ thực
thi nhanh hơn.

<a id="dart-3-and-null-safety"></a>
<a id="enable-null-safety"></a>
<a id="where-to-learn-more"></a>
<a id="migrate"></a>

## Tài nguyên chuyển đổi (lịch sử)

Dart đã áp dụng sound null safety từ Dart 3, phát hành tháng 5 năm 2023. Nếu bạn vẫn cần
chuyển đổi ứng dụng hay package của mình sang null safety, hãy xem tài liệu đã lưu trữ
trong repository [`dart-community/migrate-to-null-safety`][].

---

[`dart-community/migrate-to-null-safety`]: https://github.com/dart-community/migrate-to-null-safety#migrate-to-dart-null-safety

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
