# Tham chiếu class modifier

> **Nguồn gốc:** <https://dart.dev/language/modifier-reference> — *Class modifiers reference*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Class modifiers](https://dart.dev/language/class-modifiers) · → [Concurrency in Dart](https://dart.dev/language/concurrency)

Trang này chứa thông tin tra cứu về
[class modifier](https://dart.dev/language/class-modifiers).

## Các tổ hợp hợp lệ

Những tổ hợp class modifier hợp lệ và khả năng tương ứng của chúng:

| Khai báo | [Tạo thể hiện][Construct]? | [Kế thừa][Extend]? | [Hiện thực][Implement]? | [Mix vào][Mix in]? | [Đầy đủ][Exhaustive]? |
|-----------------------------|----------------|-------------|----------------|-------------|-----------------|
| `class`                     | **Có**         | **Có**      | **Có**         | Không       | Không           |
| `base class`                | **Có**         | **Có**      | Không          | Không       | Không           |
| `interface class`           | **Có**         | Không       | **Có**         | Không       | Không           |
| `final class`               | **Có**         | Không       | Không          | Không       | Không           |
| `sealed class`              | Không          | Không       | Không          | Không       | **Có**          |
| `abstract class`            | Không          | **Có**      | **Có**         | Không       | Không           |
| `abstract base class`       | Không          | **Có**      | Không          | Không       | Không           |
| `abstract interface class`  | Không          | Không       | **Có**         | Không       | Không           |
| `abstract final class`      | Không          | Không       | Không          | Không       | Không           |
| `mixin class`               | **Có**         | **Có**      | **Có**         | **Có**      | Không           |
| `base mixin class`          | **Có**         | **Có**      | Không          | **Có**      | Không           |
| `abstract mixin class`      | Không          | **Có**      | **Có**         | **Có**      | Không           |
| `abstract base mixin class` | Không          | **Có**      | Không          | **Có**      | Không           |
| `mixin`                     | Không          | Không       | **Có**         | **Có**      | Không           |
| `base mixin`                | Không          | Không       | Không          | **Có**      | Không           |

*Cột "Đầy đủ" chỉ khả năng
[kiểm tra tính đầy đủ (exhaustiveness checking)][Exhaustive] khi `switch` trên kiểu đó.*

[Construct]: https://dart.dev/language/classes#using-constructors
[Extend]: https://dart.dev/language/extend
[Implement]: https://dart.dev/language/classes#implicit-interfaces
[Mix in]: https://dart.dev/language/mixins
[Exhaustive]: https://dart.dev/language/branches#exhaustiveness-checking

## Các tổ hợp không hợp lệ

Một số [tổ hợp][combinations] từ khóa bổ nghĩa không được phép:

| Tổ hợp | Lý do |
|-----------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------|
| `base`, `interface` và `final` | Cả ba đều kiểm soát cùng hai khả năng (`extend` và `implement`), nên chúng loại trừ lẫn nhau. |
| `sealed` và `abstract` | Cả hai đều không cho tạo thể hiện, nên đi cùng nhau là thừa. |
| `sealed` cùng với `base`, `interface` hoặc `final` | Kiểu `sealed` vốn đã không thể bị mix vào, kế thừa hay hiện thực từ thư viện khác, nên kết hợp với các từ khóa được liệt kê là thừa. |
| `mixin` và `abstract` | Cả hai đều không cho tạo thể hiện, nên đi cùng nhau là thừa. |
| `mixin` cùng với `interface`, `final` hoặc `sealed` | Khai báo `mixin` hay `mixin class` sinh ra để được mix vào, mà các từ khóa được liệt kê lại ngăn chính điều đó. |
| `enum` cùng bất kỳ từ khóa nào | Khai báo `enum` không thể bị kế thừa, hiện thực hay mix vào, và luôn tạo được thể hiện, nên không từ khóa nào áp dụng cho khai báo `enum`. |
| `extension type` cùng bất kỳ từ khóa nào | Khai báo `extension type` không thể bị kế thừa hay mix vào, và chỉ có thể được hiện thực bởi những khai báo `extension type` khác. |

---

[combinations]: https://dart.dev/language/class-modifiers#combining-modifiers

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
