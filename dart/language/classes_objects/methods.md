# Phương thức (Methods)

> **Nguồn gốc:** <https://dart.dev/language/methods> — *Methods*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Primary constructors](https://dart.dev/language/primary-constructors) · → [Extend a class (Kế thừa lớp)](https://dart.dev/language/extend)

Phương thức là những hàm cung cấp hành vi cho một object.

<a id="instance-methods"></a>

## Phương thức thể hiện (Instance methods)

Phương thức thể hiện trên object có thể truy cập các biến thể hiện và `this`. Phương thức
`distanceTo()` trong ví dụ sau là một phương thức thể hiện:

```dart
import 'dart:math';

class Point {
  final double x;
  final double y;

  // Sets the x and y instance variables
  // before the constructor body runs.
  Point(this.x, this.y);

  double distanceTo(Point other) {
    var dx = x - other.x;
    var dy = y - other.y;
    return sqrt(dx * dx + dy * dy);
  }

}
```

> *Diễn giải:* constructor gán hai biến thể hiện `x` và `y` trước khi thân constructor
> chạy.

<a id="operators"></a>

## Toán tử (Operators)

Hầu hết toán tử đều là phương thức thể hiện mang tên đặc biệt. Dart cho phép bạn định
nghĩa toán tử với những tên sau:

|       |      |      |      |       |      |
|-------|------|------|------|-------|------|
| `<`   | `>`  | `<=` | `>=` | `==`  | `~`  |
| `-`   | `+`  | `/`  | `~/` | `*`   | `%`  |
| `\|`  | `ˆ`  | `&`  | `<<` | `>>>` | `>>` |
| `[]=` | `[]` |      |      |       |      |

> **Lưu ý**
> Có thể bạn để ý rằng một số [toán tử][operators], như `!=`, không có trong danh sách
> tên này. Những toán tử đó không phải là phương thức thể hiện — hành vi của chúng được
> cài sẵn trong Dart.

Để khai báo một toán tử, dùng định danh dựng sẵn `operator` rồi tới toán tử bạn đang định
nghĩa. Ví dụ sau định nghĩa phép cộng vector (`+`), phép trừ (`-`) và phép so sánh bằng
(`==`):

```dart
class Vector {
  final int x, y;

  Vector(this.x, this.y);

  Vector operator +(Vector v) => Vector(x + v.x, y + v.y);
  Vector operator -(Vector v) => Vector(x - v.x, y - v.y);

  @override
  bool operator ==(Object other) =>
      other is Vector && x == other.x && y == other.y;

  @override
  int get hashCode => Object.hash(x, y);
}

void main() {
  final v = Vector(2, 3);
  final w = Vector(2, 2);

  assert(v + w == Vector(4, 5));
  assert(v - w == Vector(0, 1));
}
```

<a id="getters-and-setters"></a>

## Getter và setter

Getter và setter là những phương thức đặc biệt cung cấp quyền đọc và ghi vào thuộc tính
của một object. Nhớ rằng mỗi biến thể hiện đều có một getter ngầm định, cộng thêm một
setter nếu phù hợp. Bạn có thể tạo thêm thuộc tính bằng cách tự hiện thực getter và setter,
dùng từ khóa `get` và `set`:

```dart
/// A rectangle in a screen coordinate system,
/// where the origin `(0, 0)` is in the top-left corner.
class Rectangle {
  double left, top, width, height;

  Rectangle(this.left, this.top, this.width, this.height);

  // Define two calculated properties: right and bottom.
  double get right => left + width;
  set right(double value) => left = value - width;
  double get bottom => top + height;
  set bottom(double value) => top = value - height;
}

void main() {
  var rect = Rectangle(3, 4, 20, 15);
  assert(rect.left == 3);
  rect.right = 12;
  assert(rect.left == -8);
}
```

> *Diễn giải:* doc comment mô tả một hình chữ nhật trong hệ tọa độ màn hình, với gốc
> `(0, 0)` nằm ở góc trên bên trái. Đoạn giữa định nghĩa hai thuộc tính được tính toán:
> `right` và `bottom`.

Với getter và setter, bạn có thể bắt đầu bằng biến thể hiện, sau đó bọc chúng lại bằng
phương thức — tất cả mà không cần sửa code phía người dùng.

> **Lưu ý**
> Những toán tử như tăng (`++`) vẫn hoạt động đúng như mong đợi, bất kể getter có được
> định nghĩa tường minh hay không. Để tránh mọi tác dụng phụ ngoài ý muốn, toán tử chỉ gọi
> getter **đúng một lần**, rồi lưu giá trị của nó vào một biến tạm.

<a id="abstract-methods"></a>

## Phương thức trừu tượng (Abstract methods)

Phương thức thể hiện, getter và setter đều có thể là trừu tượng — tức định nghĩa ra một
interface nhưng để phần hiện thực cho các lớp khác lo. Phương thức trừu tượng chỉ có thể
tồn tại trong [lớp trừu tượng][abstract classes] hoặc [mixin][mixins].

Để biến một phương thức thành trừu tượng, hãy dùng dấu chấm phẩy (`;`) thay cho thân
phương thức:

```dart
abstract class Doer {
  // Define instance variables and methods...

  void doSomething(); // Define an abstract method.
}

class EffectiveDoer extends Doer {
  void doSomething() {
    // Provide an implementation, so the method is not abstract here...
  }
}
```

> *Diễn giải:* lớp `Doer` định nghĩa biến thể hiện và phương thức, trong đó
> `doSomething()` là phương thức trừu tượng. Lớp `EffectiveDoer` cung cấp phần hiện thực,
> nên ở đây phương thức không còn trừu tượng nữa.

---

[operators]: https://dart.dev/language/operators
[abstract classes]: https://dart.dev/language/class-modifiers#abstract
[mixins]: https://dart.dev/language/mixins

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
