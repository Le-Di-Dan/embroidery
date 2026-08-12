# Rẽ nhánh (Branches)

> **Nguồn gốc:** <https://dart.dev/language/branches> — *Branches*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Loops (Vòng lặp)](https://dart.dev/language/loops) · → [Error handling (Xử lý lỗi)](https://dart.dev/language/error-handling)

Trang này trình bày cách điều khiển luồng thực thi code Dart bằng rẽ nhánh:

- Câu lệnh và phần tử `if`
- Câu lệnh và phần tử `if-case`
- Câu lệnh và biểu thức `switch`

Bạn cũng có thể điều khiển luồng trong Dart bằng:

- [Vòng lặp][Loops], như `for` và `while`
- [Ngoại lệ][Exceptions], như `try`, `catch` và `throw`

<a id="if"></a>

## `if`

Dart hỗ trợ câu lệnh `if` với mệnh đề `else` tùy chọn. Điều kiện trong cặp ngoặc tròn sau
`if` phải là một biểu thức cho ra giá trị [boolean][]:

```dart
if (isRaining()) {
  you.bringRainCoat();
} else if (isSnowing()) {
  you.wearJacket();
} else {
  car.putTopDown();
}
```

Để biết cách dùng `if` trong ngữ cảnh biểu thức, xem
[Biểu thức điều kiện][Conditional expressions].

<a id="if-case"></a>

### `if-case`

Câu lệnh `if` của Dart hỗ trợ mệnh đề `case` theo sau bởi một [pattern][]:

```dart
if (pair case [int x, int y]) return Point(x, y);
```

Nếu pattern khớp với giá trị, nhánh đó sẽ được thực thi cùng với mọi biến mà pattern định
nghĩa nằm trong phạm vi.

Trong ví dụ trên, list pattern `[int x, int y]` khớp với giá trị `pair`, nên nhánh
`return Point(x, y)` được thực thi cùng với hai biến mà pattern đã định nghĩa là `x` và
`y`.

Ngược lại, luồng điều khiển sẽ chuyển sang nhánh `else` để thực thi, nếu có:

```dart
if (pair case [int x, int y]) {
  print('Was coordinate array $x,$y');
} else {
  throw FormatException('Invalid coordinates.');
}
```

Câu lệnh `if-case` cung cấp một cách để so khớp và [phân rã][destructure] theo **một**
pattern duy nhất. Để kiểm tra một giá trị với **nhiều** pattern, hãy dùng
[`switch`](#switch).

> **Lưu ý về phiên bản**
> Mệnh đề `case` trong câu lệnh `if` yêu cầu [phiên bản ngôn ngữ][language version] tối
> thiểu là 3.0.

<a id="switch"></a>
<a id="switch-statements"></a>

## Câu lệnh `switch`

Câu lệnh `switch` đem một biểu thức giá trị đi đối chiếu với một loạt `case`. Mỗi mệnh đề
`case` là một [pattern][] để giá trị đó so khớp. Bạn có thể dùng
[bất kỳ loại pattern nào][any kind of pattern] cho một `case`.

Khi giá trị khớp với pattern của một `case`, thân của `case` đó sẽ được thực thi. Mệnh đề
`case` **không rỗng** sẽ nhảy tới cuối `switch` sau khi hoàn tất — chúng **không** cần câu
lệnh `break`. Những cách hợp lệ khác để kết thúc một mệnh đề `case` không rỗng là câu lệnh
[`continue`][break], [`throw`][] hoặc [`return`][].

Dùng mệnh đề `default` hoặc [wildcard `_`][] để thực thi code khi không `case` nào khớp:

```dart
var command = 'OPEN';
switch (command) {
  case 'CLOSED':
    executeClosed();
  case 'PENDING':
    executePending();
  case 'APPROVED':
    executeApproved();
  case 'DENIED':
    executeDenied();
  case 'OPEN':
    executeOpen();
  default:
    executeUnknown();
}
```

<a id="switch-share"></a>

`case` rỗng sẽ **rơi xuống (fall through)** `case` kế tiếp, cho phép nhiều `case` dùng
chung một thân. Với một `case` rỗng mà bạn **không** muốn nó rơi xuống, hãy dùng
[`break`][break] làm thân của nó. Còn để rơi xuống một chỗ không liền kề, bạn có thể dùng
[câu lệnh `continue`][break] cùng một nhãn:

```dart
switch (command) {
  case 'OPEN':
    executeOpen();
    continue newCase; // Continues executing at the newCase label.

  case 'DENIED': // Empty case falls through.
  case 'CLOSED':
    executeClosed(); // Runs for both DENIED and CLOSED,

  newCase:
  case 'PENDING':
    executeNowClosed(); // Runs for both OPEN and PENDING.
}
```

> *Diễn giải:* `continue newCase;` tiếp tục thực thi tại nhãn `newCase`; `case 'DENIED'`
> rỗng nên rơi xuống; `executeClosed()` chạy cho cả `DENIED` lẫn `CLOSED`;
> `executeNowClosed()` chạy cho cả `OPEN` lẫn `PENDING`.

Bạn có thể dùng [logical-or pattern][logical-or patterns] để nhiều `case` dùng chung một
thân hoặc một guard. Để tìm hiểu thêm về pattern và mệnh đề `case`, xem tài liệu về pattern
tại [Câu lệnh và biểu thức switch][Switch statements and expressions].

[Switch statements and expressions]: https://dart.dev/language/patterns#switch-statements-and-expressions

<a id="switch-expressions"></a>

### Biểu thức `switch`

_Biểu thức_ `switch` tạo ra một giá trị dựa trên phần thân biểu thức của `case` nào khớp.
Bạn có thể dùng biểu thức `switch` ở bất cứ đâu Dart cho phép đặt biểu thức, _ngoại trừ_ ở
đầu một câu lệnh biểu thức (expression statement). Ví dụ:

```dart
var x = switch (y) { ... };

print(switch (x) { ... });

return switch (x) { ... };
```

Nếu bạn muốn dùng `switch` ở đầu một câu lệnh biểu thức, hãy dùng
[câu lệnh `switch`](#switch-statements).

Biểu thức `switch` cho phép bạn viết lại một _câu lệnh_ `switch` như thế này:

```dart
// Where slash, star, comma, semicolon, etc., are constant variables...
switch (charCode) {
  case slash || star || plus || minus: // Logical-or pattern
    token = operator(charCode);
  case comma || semicolon: // Logical-or pattern
    token = punctuation(charCode);
  case >= digit0 && <= digit9: // Relational and logical-and patterns
    token = number();
  default:
    throw FormatException('Invalid');
}
```

> *Diễn giải:* `slash`, `star`, `comma`, `semicolon`, v.v. là các biến hằng; các chú thích
> lần lượt chỉ ra logical-or pattern, logical-or pattern, và relational + logical-and
> pattern.

Thành một _biểu thức_, như thế này:

```dart
token = switch (charCode) {
  slash || star || plus || minus => operator(charCode),
  comma || semicolon => punctuation(charCode),
  >= digit0 && <= digit9 => number(),
  _ => throw FormatException('Invalid'),
};
```

Cú pháp của _biểu thức_ `switch` khác với cú pháp của _câu lệnh_ `switch`:

- Các `case` **không** bắt đầu bằng từ khóa `case`.
- Thân của một `case` là một biểu thức đơn, thay vì một loạt câu lệnh.
- Mỗi `case` bắt buộc phải có thân; không có chuyện tự động rơi xuống với `case` rỗng.
- Pattern của `case` được ngăn cách với thân bằng `=>` thay vì `:`.
- Các `case` ngăn cách nhau bằng `,` (và được phép có một dấu `,` thừa ở cuối).
- Case mặc định **chỉ** được dùng `_`, thay vì cho phép cả `default` lẫn `_`.

> **Lưu ý về phiên bản**
> Biểu thức `switch` yêu cầu [phiên bản ngôn ngữ][language version] tối thiểu là 3.0.

<a id="exhaustiveness-checking"></a>

### Kiểm tra tính đầy đủ (Exhaustiveness checking)

Kiểm tra tính đầy đủ là tính năng báo lỗi lúc biên dịch nếu có khả năng một giá trị đi vào
`switch` mà không khớp với bất kỳ `case` nào.

```dart
// Non-exhaustive switch on bool?, missing case to match null possibility:
switch (nullableBool) {
  case true:
    print('yes');
  case false:
    print('no');
}
```

> *Diễn giải:* `switch` trên `bool?` này chưa đầy đủ — thiếu `case` để khớp với khả năng
> giá trị là null.

Case mặc định (`default` hoặc `_`) bao phủ mọi giá trị có thể đi qua một `switch`. Điều
này làm cho `switch` trên bất kỳ kiểu nào cũng trở nên đầy đủ.

[Enum][enum] và [kiểu sealed][sealed] đặc biệt hữu ích với `switch`, bởi vì ngay cả khi
không có case mặc định, tập giá trị khả dĩ của chúng vẫn được biết trước và liệt kê được
đầy đủ. Hãy dùng [từ khóa bổ nghĩa `sealed`][sealed] trên một lớp để bật kiểm tra tính đầy
đủ khi `switch` trên các kiểu con của lớp đó:

```dart
sealed class Shape {}

class Square implements Shape {
  final double length;
  Square(this.length);
}

class Circle implements Shape {
  final double radius;
  Circle(this.radius);
}

double calculateArea(Shape shape) => switch (shape) {
  Square(length: var l) => l * l,
  Circle(radius: var r) => math.pi * r * r,
};
```

Nếu có ai đó thêm một lớp con mới của `Shape`, biểu thức `switch` này sẽ trở nên không đầy
đủ. Cơ chế kiểm tra tính đầy đủ sẽ báo cho bạn biết kiểu con nào đang bị thiếu. Điều này
cho phép bạn viết Dart theo phần nào phong cách
[kiểu dữ liệu đại số hàm (functional algebraic datatype)](https://en.wikipedia.org/wiki/Algebraic_data_type).

<a id="when"></a>
<a id="guard-clause"></a>

## Mệnh đề guard (Guard clause)

Để đặt một mệnh đề guard tùy chọn sau mệnh đề `case`, hãy dùng từ khóa `when`. Mệnh đề
guard có thể đi sau `if case`, và sau cả câu lệnh lẫn biểu thức `switch`.

```dart
// Switch statement:
switch (something) {
  case somePattern when some || boolean || expression:
    //             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ Guard clause.
    body;
}

// Switch expression:
var value = switch (something) {
  somePattern when some || boolean || expression => body,
  //               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ Guard clause.
}

// If-case statement:
if (something case somePattern when some || boolean || expression) {
  //                           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ Guard clause.
  body;
}
```

> *Diễn giải:* ba khối lần lượt là câu lệnh `switch`, biểu thức `switch` và câu lệnh
> `if-case`; phần được gạch chân chính là mệnh đề guard.

Guard tính một biểu thức boolean tùy ý **sau khi** đã so khớp. Điều này cho phép bạn thêm
ràng buộc nữa về việc thân của `case` có nên được thực thi hay không. Khi mệnh đề guard
cho ra false, luồng thực thi chuyển sang `case` kế tiếp chứ **không** thoát khỏi toàn bộ
`switch`.

---

[language version]: https://dart.dev/language/versioning
[Loops]: https://dart.dev/language/loops
[Exceptions]: https://dart.dev/language/error-handling
[Conditional expressions]: https://dart.dev/language/operators#conditional-expressions
[boolean]: https://dart.dev/language/built-in-types#booleans
[pattern]: https://dart.dev/language/patterns
[enum]: https://dart.dev/language/enums
[`throw`]: https://dart.dev/language/error-handling#throw
[`return`]: https://dart.dev/language/functions#return-values
[wildcard `_`]: https://dart.dev/language/pattern-types#wildcard
[break]: https://dart.dev/language/loops#break-and-continue
[sealed]: https://dart.dev/language/class-modifiers#sealed
[any kind of pattern]: https://dart.dev/language/pattern-types
[destructure]: https://dart.dev/language/patterns#destructuring
[section on switch]: https://dart.dev/language/patterns#switch-statements-and-expressions
[logical-or patterns]: https://dart.dev/language/patterns#or-pattern-switch

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
