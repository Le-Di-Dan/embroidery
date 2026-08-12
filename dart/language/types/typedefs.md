# Typedef (Bí danh kiểu)

> **Nguồn gốc:** <https://dart.dev/language/typedefs> — *Typedefs*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Generics](https://dart.dev/language/generics) · → [Type system (Hệ thống kiểu)](https://dart.dev/language/type-system)

Bí danh kiểu (type alias) — thường được gọi là _typedef_ vì nó được khai báo bằng từ khóa
`typedef` — là một cách viết ngắn gọn để tham chiếu tới một kiểu. Đây là ví dụ khai báo và
sử dụng một bí danh kiểu tên `IntList`:

```dart
typedef IntList = List<int>;
IntList il = [1, 2, 3];
```

Bí danh kiểu có thể có tham số kiểu (type parameter):

```dart
typedef ListMapper<X> = Map<X, List<X>>;
Map<String, List<String>> m1 = {}; // Verbose.
ListMapper<String> m2 = {}; // Same thing but shorter and clearer.
```

> *Diễn giải:* cách viết `m1` dài dòng; `m2` cũng vậy nhưng ngắn gọn và rõ ràng hơn.

> **Lưu ý về phiên bản**
> Trước phiên bản 2.13, typedef chỉ được dùng cho kiểu hàm (function type). Dùng typedef
> theo cách mới yêu cầu [phiên bản ngôn ngữ][language version] tối thiểu là 2.13.

Trong hầu hết trường hợp, chúng tôi khuyến nghị dùng
[kiểu hàm viết trực tiếp (inline function type)][inline function types] thay cho typedef
khi khai báo hàm. Tuy nhiên, typedef cho hàm vẫn có thể hữu ích:

```dart
typedef Compare<T> = int Function(T a, T b);

int sort(int a, int b) => a - b;

void main() {
  assert(sort is Compare<int>); // True!
}
```

---

[language version]: https://dart.dev/language/versioning
[inline function types]: https://dart.dev/effective-dart/design#prefer-inline-function-types-over-typedefs

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
