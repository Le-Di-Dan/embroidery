# Object gọi được như hàm (Callable objects)

> **Nguồn gốc:** <https://dart.dev/language/callable-objects> — *Callable objects*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Extension types](https://dart.dev/language/extension-types) · → [Class modifiers](https://dart.dev/language/class-modifiers)

Để cho phép một thể hiện của lớp Dart được gọi như một hàm, hãy hiện thực phương thức
`call()`.

Phương thức `call()` cho phép thể hiện của bất kỳ lớp nào định nghĩa nó mô phỏng hành vi
của một hàm. Phương thức này hỗ trợ đầy đủ những gì [hàm][functions] thông thường có, như
tham số và kiểu trả về.

Trong ví dụ sau, lớp `WannabeFunction` định nghĩa hàm `call()` nhận vào ba chuỗi rồi nối
chúng lại, ngăn cách bằng dấu cách và thêm một dấu chấm than ở cuối. Trên trang gốc, bạn
có thể bấm **Run** để chạy đoạn code này.

```dart
class WannabeFunction {
  String call(String a, String b, String c) => '$a $b $c!';
}

var wf = WannabeFunction();
var out = wf('Hi', 'there,', 'gang');

void main() => print(out);
```

> *Diễn giải:* `wf('Hi', 'there,', 'gang')` gọi thẳng object `wf` như một hàm — đó chính là
> lời gọi tới `wf.call(...)`. Kết quả in ra: `Hi there, gang!`

---

[functions]: https://dart.dev/language/functions

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
