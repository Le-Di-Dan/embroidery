# Primary constructor

> **Nguồn gốc:** <https://dart.dev/language/primary-constructors> — *Primary constructors*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Constructors](https://dart.dev/language/constructors) · → [Methods (Phương thức)](https://dart.dev/language/methods)

> **Lưu ý về phiên bản**
> Primary constructor yêu cầu [phiên bản ngôn ngữ][language version] tối thiểu là 3.13.

## Tổng quan

Primary constructor cung cấp một cách viết ngắn gọn để khai báo các trường của lớp cùng
constructor chính của nó, tất cả trên một dòng. Chúng giảm bớt phần code lặp đi lặp lại
của việc khai báo trường, truyền tham số và gán chúng trong thân constructor. Cách viết
tắt này thay đổi cách bạn viết phần khai báo, nhưng **không** thay đổi hành vi lúc chạy.

### Trước và sau

Hãy xem lớp truyền thống sau, có hai trường và một constructor:

```dart
// Current syntax.
class Point {
  int x;
  int y;

  Point(this.x, this.y);
}
```

Dùng primary constructor, cùng lớp đó trở nên gọn hơn nhiều:

```dart
// Using a primary constructor.
class Point(var int x, var int y);
```

Việc khai báo một tham số trong primary constructor với `var` hoặc `final` sẽ ngầm sinh ra
một biến thể hiện cho tham số đó.

Mọi constructor khác được khai báo bên trong thân lớp được gọi là **in-body constructor**
(constructor trong thân lớp).

Để đảm bảo primary constructor luôn được chạy trên mọi thể hiện mới, một lớp, mixin class
hay enum có primary constructor thì **không** được có bất kỳ generative in-body constructor
nào khác không phải loại chuyển hướng (non-redirecting).

> **Lưu ý**
> Nếu bạn muốn khai báo constructor truyền thống trong thân lớp một cách gọn hơn mà không
> phải lặp lại tên lớp, xem [Cú pháp constructor rút gọn][Concise constructor syntax].

[Concise constructor syntax]: https://dart.dev/language/constructors#concise-constructor-syntax

## Khai báo trường ngay trong tham số

Những tham số trong primary constructor có từ khóa bổ nghĩa `var` hoặc `final` được gọi là
**declaring parameter** (tham số khai báo), và chúng ngầm sinh ra một trường.

Nếu bạn lược bỏ từ khóa bổ nghĩa, tham số đó **không** tạo ra trường nào. Nó hành xử y như
một tham số trong constructor truyền thống.

```dart
// Declares both fields x and y.
class Point(var int x, var int y);

// Doesn't declare a field.
class User(String name);
```

> *Diễn giải:* dòng đầu khai báo cả hai trường `x` và `y`; dòng sau không khai báo trường
> nào.

Vì các từ khóa `final` và `var` trên tham số được dành riêng cho declaring parameter trong
primary constructor, nên bạn không thể dùng chúng cho tham số của các loại hàm khác.

Với extension type, primary constructor phải có **đúng một** tham số. Tham số này luôn là
declaring parameter, kể cả khi bạn lược bỏ từ khóa bổ nghĩa. Bạn có thể dùng `final`,
nhưng dùng `var` sẽ gây lỗi.

Mixin class chỉ có thể có primary constructor **không tham số, không thân, không danh sách
khởi tạo**.

<a id="primary-initializer-scope"></a>

## Phạm vi của primary constructor

Khi bạn dùng primary constructor, những tham số bạn khai báo ở phần đầu lớp (class header)
sẽ khả dụng ở nhiều nơi khác nhau trong phần khai báo lớp. Dart quản lý tính nhìn thấy của
chúng bằng hai phạm vi riêng biệt:

*   **Primary initializer scope** (phạm vi khởi tạo chính):
    Áp dụng cho các biểu thức khởi tạo trường không phải `late` trong thân lớp, và cho
    danh sách khởi tạo của primary constructor (phần sau `this :`). Trong phạm vi này, một
    tên tham số như `x` tham chiếu **trực tiếp tới tham số constructor**.
*   **Primary parameter scope** (phạm vi tham số chính):
    Áp dụng cho khối thân của primary constructor (bên trong `{ ... }`). Trong phạm vi này,
    tên của một declaring parameter tham chiếu tới _biến thể hiện được sinh ra_ (trường),
    còn tên của tham số không khai báo thì vẫn tham chiếu tới tham số constructor.

Primary initializer scope làm cho các tham số ở phần đầu lớp dùng được ngay để khởi tạo
những trường không phải `late`, nhờ đó không cần tới một danh sách khởi tạo riêng. Nó hoạt
động y như khi bạn khởi tạo biến trong danh sách khởi tạo của constructor truyền thống:

```dart
class DeltaPoint(final int x, int delta) {
  // Accesses 'x' and 'delta' parameters directly!
  final int y = x + delta;
}
```

> *Diễn giải:* truy cập trực tiếp tới hai tham số `x` và `delta`.

Primary parameter scope đảm bảo rằng mọi thay đổi lên biến thể hiện đều được phản ánh đúng
trong thân constructor, trong khi các biểu thức khởi tạo vẫn truy cập được tham số gốc. Ví
dụ sau cho thấy cùng một cái tên `x` được phân giải khác nhau ra sao ở từng phạm vi:

```dart
class ScopingDemo(var String x, String suffix) {
  // In a non-late field initializer, 'x' refers to the parameter 'x'.
  final String fieldAtDeclaration = x;
  final String fieldInInitializer;

  // In the initializer list, 'x' refers to the parameter 'x'.
  this : fieldInInitializer = x {
    // Inside the body, 'x' refers to the induced instance variable,
    // so assigning to it updates the field.
    x = x.toUpperCase();
    // 'suffix' induces no field, so it still refers to the parameter.
    print('$x$suffix');
  }
}
```

> *Diễn giải:* trong biểu thức khởi tạo trường không phải `late`, `x` trỏ tới **tham số**
> `x`; trong danh sách khởi tạo cũng vậy; nhưng bên trong thân constructor, `x` trỏ tới
> **biến thể hiện** được sinh ra, nên gán vào nó là cập nhật trường. Còn `suffix` không
> sinh ra trường nào nên vẫn trỏ tới tham số.

Hành vi nhất quán này khiến việc refactor qua lại giữa constructor truyền thống và primary
constructor trở nên đơn giản và an toàn hơn.

## Thêm thân cho constructor

Để kiểm tra tính hợp lệ của đầu vào hoặc thực hiện việc khởi tạo phức tạp, bạn có thể thêm
một thân cho primary constructor bên trong phần định nghĩa lớp. Thân này dùng từ khóa
`this` theo sau là một khối:

```dart
class Point(var int x, var int y) {
  this : assert(x >= 0 && y >= 0) {
    print('Point initialized at ($x, $y)');
  }
}
```

Khối này có thể khai báo một danh sách khởi tạo sau `this` và/hoặc một thân hàm. Nếu chỉ
muốn có danh sách khởi tạo, hãy kết thúc nó bằng dấu chấm phẩy, ví dụ
`this : assert(x >= 0);`. Bạn cũng có thể gắn metadata cho khối này, ví dụ
`@metadata this;`.

## Khởi tạo trường private

Để khởi tạo một trường private bằng tham số có tên, bạn có thể viết đoạn gán thủ công trong
một constructor truyền thống:

```dart
// Variant not using a private named parameter.
class User({required String name}) {
  String _name = name;
}
```

> *Diễn giải:* biến thể **không** dùng tham số có tên dạng private.

Với primary constructor cùng tính năng tham số có tên dạng private, bạn có thể khai báo
trường private thẳng trong phần đầu constructor. Khi bạn dùng một tên private (có dấu gạch
dưới ở đầu) cho tham số có tên, trình biên dịch tự động biến tên tham số thành công khai
đối với bên gọi, bằng cách bỏ dấu gạch dưới:

```dart
// Variant using a private named parameter.
class User({required var String _name});
```

> *Diễn giải:* biến thể **có** dùng tham số có tên dạng private.

Trong cả hai trường hợp, bên gọi đều dùng tên công khai `name` tại chỗ gọi:
`User(name: 'John Doe')`.

## Thân rỗng

Thân rỗng (`{}`) của một class, mixin class, extension hay extension type có thể được thay
bằng một dấu chấm phẩy (`;`). Điều này nói chung đúng với mọi khai báo loại đó, nhưng nó
đặc biệt hữu ích khi dùng primary constructor để giữ toàn bộ phần khai báo gọn trên một
dòng.

```dart
class Point(var int x, var int y);
```

## Primary constructor hằng

Cũng như constructor truyền thống, một primary constructor có thể là hằng nếu lớp và các
trường của nó cho phép. Để khai báo một primary constructor hằng, hãy đặt từ khóa bổ nghĩa
`const` trước tên lớp trong phần đầu lớp:

```dart
class const ConstPoint(final int x, final int y) {
  final int z;
  // A constant primary constructor can have an initializer list,
  // but can't have a body block.
  this : z = x + y;
}
```

> *Diễn giải:* primary constructor hằng có thể có danh sách khởi tạo, nhưng **không** được
> có khối thân.

Primary constructor hằng có những ràng buộc quan trọng sau:

*   **Không có khối thân**: Có khối `{ ... }` là lỗi lúc biên dịch, kể cả khi nó rỗng. Một
    primary constructor hằng chỉ được dùng danh sách khởi tạo, theo sau là dấu chấm phẩy.
*   **Trường `final` phải chắc chắn được khởi tạo**: Như mọi lớp có generative const
    constructor, mọi biến thể hiện đều phải là `final`, không được là `late`, và phải chắc
    chắn được khởi tạo bởi một declaring parameter, một biểu thức khởi tạo trường, hoặc
    danh sách khởi tạo của primary constructor.
*   **Biểu thức khởi tạo [có tiềm năng là hằng][potentially constant]**: Biểu thức khởi
    tạo cho mỗi biến thể hiện phải có tiềm năng là hằng (potentially constant). Điều này
    bao gồm cả biểu thức khởi tạo trường lẫn biểu thức trong danh sách khởi tạo của primary
    constructor.

## Primary constructor có tên

Bạn cũng có thể khai báo primary constructor dưới dạng **named constructor**, bằng cách
thêm một dấu chấm (`.`) và một cái tên sau tên lớp ở phần đầu lớp:

```dart
// A named primary constructor.
class Point.custom(var int x, var int y);
```

Một mẫu thường gặp là định nghĩa một primary constructor private (chẳng hạn `Point._`) để
hạn chế việc tạo thể hiện trực tiếp, buộc bên gọi phải dùng factory method hoặc các
constructor khác:

```dart
// A private named primary constructor.
class Point._(var int x, var int y);
```

## Super parameter

Super parameter hoạt động y như trong constructor truyền thống, cho phép bạn chuyển tiếp
tham số tới constructor của lớp cha:

```dart
class Person(final String name, final int age);

class Employee(super.name, super.age, final String role) extends Person;
```

Điều này giảm bớt code lặp trong các cấu trúc lớp phân cấp, loại bỏ nhu cầu phải viết tay
danh sách khởi tạo hay khai báo tham số trùng lặp.

## Primary constructor cho enum

Bạn có thể dùng primary constructor để khai báo [enum nâng cao][enhanced enums] một cách
gọn hơn nhiều.

Bằng primary constructor, bạn định nghĩa được cả trường của enum lẫn constructor của nó
trên một dòng, loại bỏ phần code lặp thường thấy là khai báo trường, khai báo tham số rồi
khởi tạo chúng:

```dart
enum Color(final String hex) {
  red('#FF0000'),
  green('#00FF00'),
  blue('#0000FF');
}
```

Primary constructor trong enum là **hằng một cách ngầm định**. Dù bạn có thể tùy ý viết từ
khóa `const` trước tên enum (chẳng hạn `enum const Color`), điều đó là thừa và có thể bỏ
đi.

[enhanced enums]: https://dart.dev/language/enums#declaring-enhanced-enums

## Ràng buộc và thay đổi phá vỡ tương thích

Hãy lưu ý những ràng buộc và lỗi tiềm ẩn sau khi dùng primary constructor:

*   **Declaring parameter không được là `late` hay `external`**: Các từ khóa `late` và
    `external` không được phép dùng cho tham số ở phần đầu primary constructor. Để dùng
    chúng, hãy khai báo trường trong thân lớp như bình thường.
*   **Trùng tên**: Khai báo một tham số trong primary constructor trùng tên với một phương
    thức hoặc một trường khác trong thân lớp sẽ gây lỗi lúc biên dịch.
*   **Không được gán cho tham số của primary constructor**: Tham số của primary constructor
    là chỉ đọc trong phạm vi primary initializer scope. Gán cho chúng (kiểu `x = 5` hay
    `x++`) trong biểu thức khởi tạo trường hoặc trong danh sách khởi tạo của primary
    constructor là lỗi lúc biên dịch.
*   **Khởi tạo hai lần**: Bạn không thể vừa khởi tạo một biến thể hiện tại chỗ khai báo,
    vừa khởi tạo nó trong danh sách khởi tạo của primary constructor (hoặc dưới dạng
    initializing formal parameter), kể cả khi trường đó có thể thay đổi. Làm vậy sẽ gây lỗi
    lúc biên dịch.
*   **Ràng buộc với phần thân**:
    *   Phần thân của primary constructor (khối `this`) không được dùng các từ khóa `async`,
        `async*` hay `sync*`, và cũng không được dùng cú pháp thân biểu thức mũi tên (`=>`).
    *   Bạn không thể viết khối `this` nếu phần đầu lớp không khai báo primary constructor.
    *   Một lớp có nhiều nhất **một** phần thân primary constructor.
*   **Primary constructor của mixin class phải tối giản**: Mixin class chỉ được khai báo
    primary constructor nếu nó không có tham số, không có danh sách khởi tạo và không có
    thân.
*   **Tham số covariant**: Bạn chỉ được dùng từ khóa `covariant` trên một tham số của
    primary constructor nếu đó là một declaring parameter có thể thay đổi (dùng từ khóa
    `var`). Dùng `covariant` trên tham số `final` hoặc tham số không khai báo là lỗi lúc
    biên dịch, vì chúng không sinh ra setter.

> **Cảnh báo — Những thay đổi phá vỡ tương thích và trường hợp biên quan trọng:**
>
> *   **Hạn chế với `final` và `var` trong tham số hàm thông thường**: Với primary
>     constructor, việc dùng `final` hay `var` trên tham số hình thức của hàm thông thường
>     trở thành lỗi lúc biên dịch. Chúng được dành riêng cho declaring parameter trong
>     primary constructor. Lưu ý rằng hai lint `avoid_final_parameters` và
>     `var_with_no_type_annotation` chỉ hoạt động với
>     [phiên bản ngôn ngữ][language version] từ 3.12 trở xuống. Để áp đặt tham số bất biến
>     như một lựa chọn phong cách trong Dart 3.13 trở đi, hãy dùng luật linter
>     [`parameter_assignments`][].
> *   **Trường hợp biên với phương thức `factory`**: Nếu bạn có một phương thức tên là
>     `factory` mà không có kiểu trả về (ví dụ `factory() {}`), trình biên dịch sẽ phân
>     tích nó thành một factory constructor sau khi primary constructor được phát hành.
>     Hãy đảm bảo những phương thức như vậy có kiểu trả về tường minh để tránh xung đột
>     này.

---

[language version]: https://dart.dev/language/versioning
[`parameter_assignments`]: https://dart.dev/tools/linter-rules/parameter_assignments
[potentially constant]: https://dart.dev/resources/glossary#potentially-constant

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
