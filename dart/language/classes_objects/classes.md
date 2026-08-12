# Lớp (Classes)

> **Nguồn gốc:** <https://dart.dev/language/classes> — *Classes*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Error handling (Xử lý lỗi)](https://dart.dev/language/error-handling) · → [Constructors](https://dart.dev/language/constructors)

Dart là ngôn ngữ hướng đối tượng, có lớp và cơ chế kế thừa dựa trên mixin. Mọi object đều
là thể hiện của một lớp, và mọi lớp ngoại trừ `Null` đều bắt nguồn từ [`Object`][].
*Kế thừa dựa trên mixin* nghĩa là: dù mỗi lớp (ngoại trừ [lớp đỉnh][top-and-bottom],
`Object?`) chỉ có đúng một lớp cha, thân của một lớp vẫn có thể được tái sử dụng trong
nhiều cây phân cấp lớp khác nhau. [Extension method][Extension methods] là cách bổ sung
chức năng cho một lớp mà không cần sửa lớp đó hay tạo lớp con.
[Class modifier][Class modifiers] cho phép bạn kiểm soát cách các thư viện được phép tạo
kiểu con từ một lớp.

<a id="using-class-members"></a>

## Sử dụng thành viên của lớp

Object có các *thành viên (member)* gồm hàm và dữ liệu (tương ứng là *phương thức* và
*biến thể hiện*). Khi bạn gọi một phương thức, bạn *gọi* nó **trên** một object: phương
thức đó có quyền truy cập tới hàm và dữ liệu của object ấy.

Dùng dấu chấm (`.`) để tham chiếu tới một biến thể hiện hoặc phương thức:

```dart
var p = Point(2, 2);

// Get the value of y.
assert(p.y == 2);

// Invoke distanceTo() on p.
double distance = p.distanceTo(Point(4, 4));
```

Dùng `?.` thay cho `.` để tránh ngoại lệ khi toán hạng bên trái là null:

```dart
// If p is non-null, set a variable equal to its y value.
var a = p?.y;
```

> *Diễn giải:* nếu `p` khác null thì gán cho biến giá trị `y` của nó.

<a id="using-constructors"></a>

## Sử dụng constructor

Bạn có thể tạo object bằng một *constructor*. Tên constructor có thể là
<code><em>ClassName</em></code> hoặc <code><em>ClassName</em>.<em>identifier</em></code>.
Ví dụ, đoạn code sau tạo các object `Point` bằng constructor `Point()` và
`Point.fromJson()`:

```dart
var p1 = Point(2, 2);
var p2 = Point.fromJson({'x': 1, 'y': 2});
```

Đoạn code sau cho kết quả tương tự, nhưng dùng thêm từ khóa tùy chọn `new` trước tên
constructor:

```dart
var p1 = new Point(2, 2);
var p2 = new Point.fromJson({'x': 1, 'y': 2});
```

Một số lớp cung cấp [constructor hằng][constant constructors]. Để tạo một hằng lúc biên
dịch bằng constructor hằng, hãy đặt từ khóa `const` trước tên constructor:

```dart
var p = const ImmutablePoint(2, 2);
```

Việc tạo hai hằng lúc biên dịch giống hệt nhau sẽ cho ra **một** thể hiện duy nhất, đã
được chuẩn hóa (canonical):

```dart
var a = const ImmutablePoint(1, 1);
var b = const ImmutablePoint(1, 1);

assert(identical(a, b)); // They are the same instance!
```

> *Diễn giải:* chúng là cùng một thể hiện!

Bên trong một _ngữ cảnh hằng (constant context)_, bạn có thể lược bỏ `const` trước một
constructor hoặc một literal. Ví dụ, hãy xem đoạn code sau tạo một map hằng:

```dart
// Lots of const keywords here.
const pointAndLine = const {
  'point': const [const ImmutablePoint(0, 0)],
  'line': const [const ImmutablePoint(1, 10), const ImmutablePoint(-2, 11)],
};
```

> *Diễn giải:* rất nhiều từ khóa `const` ở đây.

Bạn có thể bỏ hết, chỉ giữ lại lần dùng `const` đầu tiên:

```dart
// Only one const, which establishes the constant context.
const pointAndLine = {
  'point': [ImmutablePoint(0, 0)],
  'line': [ImmutablePoint(1, 10), ImmutablePoint(-2, 11)],
};
```

> *Diễn giải:* chỉ một `const` duy nhất, và nó thiết lập ngữ cảnh hằng cho toàn bộ phần
> còn lại.

Nếu một constructor hằng nằm **ngoài** ngữ cảnh hằng và được gọi mà không có `const`, nó
sẽ tạo ra một **object không phải hằng**:

```dart
var a = const ImmutablePoint(1, 1); // Creates a constant
var b = ImmutablePoint(1, 1); // Does NOT create a constant

assert(!identical(a, b)); // NOT the same instance!
```

> *Diễn giải:* `a` là hằng, `b` **không** phải hằng; chúng **không** phải cùng một thể
> hiện.

<a id="getting-an-objects-type"></a>

## Lấy kiểu của một object

Để lấy kiểu của một object tại thời điểm chạy, bạn có thể dùng thuộc tính `runtimeType` của
`Object`, thứ trả về một object [`Type`][].

```dart
print('The type of a is ${a.runtimeType}');
```

> **Cảnh báo**
> Hãy dùng [toán tử kiểm tra kiểu][type test operator] thay vì `runtimeType` để kiểm tra
> kiểu của một object. Trong môi trường production, phép kiểm tra `object is Type` ổn định
> hơn phép kiểm tra `object.runtimeType == Type`.

Đến đây, bạn đã biết cách _sử dụng_ lớp. Phần còn lại của trang này trình bày cách _hiện
thực_ lớp.

<a id="instance-variables"></a>

## Biến thể hiện (Instance variables)

Đây là cách bạn khai báo biến thể hiện:

```dart
class Point {
  double? x; // Declare instance variable x, initially null.
  double? y; // Declare y, initially null.
  double z = 0; // Declare z, initially 0.
}
```

> *Diễn giải:* khai báo biến thể hiện `x` (ban đầu là null), `y` (ban đầu là null), và `z`
> (ban đầu là 0).

Một biến thể hiện chưa khởi tạo mà được khai báo với [kiểu nullable][nullable type] sẽ
mang giá trị `null`. Biến thể hiện non-nullable thì [bắt buộc phải được khởi tạo][must be initialized]
ngay tại chỗ khai báo.

Mọi biến thể hiện đều sinh ra một phương thức *getter* ngầm định. Biến thể hiện không phải
`final`, và biến thể hiện `late final` không có biểu thức khởi tạo, còn sinh thêm một
phương thức *setter* ngầm định. Chi tiết xem [Getter và setter][Getters and setters].

```dart
class Point {
  double? x; // Declare instance variable x, initially null.
  double? y; // Declare y, initially null.
}

void main() {
  var point = Point();
  point.x = 4; // Use the setter method for x.
  assert(point.x == 4); // Use the getter method for x.
  assert(point.y == null); // Values default to null.
}
```

> *Diễn giải:* dòng gán dùng phương thức setter của `x`; dòng `assert` đầu dùng getter của
> `x`; giá trị mặc định là null.

Việc khởi tạo một biến thể hiện **không phải** `late` ngay tại chỗ khai báo sẽ đặt giá trị
vào lúc thể hiện được tạo ra, **trước khi** constructor và danh sách khởi tạo của nó chạy.
Hệ quả là biểu thức khởi tạo (phần sau dấu `=`) của một biến thể hiện không phải `late`
không thể truy cập `this`.

```dart
double initialX = 1.5;

class Point {
  // OK, can access declarations that do not depend on `this`:
  double? x = initialX;

  // ERROR, can't access `this` in non-`late` initializer:
  double? y = this.x;

  // OK, can access `this` in `late` initializer:
  late double? z = this.x;

  // OK, `this.x` and `this.y` are parameter declarations, not expressions:
  Point(this.x, this.y);
}
```

> *Diễn giải:* (1) OK — truy cập được những khai báo không phụ thuộc `this`; (2) LỖI —
> không truy cập được `this` trong biểu thức khởi tạo không phải `late`; (3) OK — truy cập
> được `this` trong biểu thức khởi tạo `late`; (4) OK — `this.x` và `this.y` ở đây là khai
> báo tham số, không phải biểu thức.

Biến thể hiện có thể là `final`, và khi đó chúng phải được gán đúng một lần. Hãy khởi tạo
biến thể hiện `final` không phải `late` ngay tại chỗ khai báo, thông qua tham số
constructor, hoặc thông qua [danh sách khởi tạo][initializer list] của constructor:

```dart
class ProfileMark {
  final String name;
  final DateTime start = DateTime.now();

  ProfileMark(this.name);
  ProfileMark.unnamed() : name = '';
}
```

Nếu bạn cần gán giá trị cho một biến thể hiện `final` sau khi thân constructor đã bắt đầu
chạy, bạn có thể dùng một trong hai cách sau:

* Tính giá trị đó trong một [factory constructor][], rồi truyền nó cho một generative
  constructor để constructor này khởi tạo biến thể hiện `final`.
* Dùng `late final`, nhưng [_hãy cẩn thận:_][late-final-ivar] một `late final` không có
  biểu thức khởi tạo sẽ thêm một setter vào API.

<a id="implicit-interfaces"></a>

## Interface ngầm định (Implicit interfaces)

Mọi lớp đều ngầm định nghĩa một interface chứa toàn bộ thành viên thể hiện của lớp đó, và
của mọi interface mà nó hiện thực. Nếu bạn muốn tạo một lớp A hỗ trợ API của lớp B mà
không kế thừa phần cài đặt của B, thì lớp A nên hiện thực (implement) interface của B.

Một lớp hiện thực một hoặc nhiều interface bằng cách khai báo chúng trong mệnh đề
`implements`, rồi cung cấp các API mà những interface đó yêu cầu. Ví dụ:

```dart
// A person. The implicit interface contains greet().
class Person {
  // In the interface, but visible only in this library.
  final String _name;

  // Not in the interface, since this is a constructor.
  Person(this._name);

  // In the interface.
  String greet(String who) => 'Hello, $who. I am $_name.';
}

// An implementation of the Person interface.
class Impostor implements Person {
  String get _name => '';

  String greet(String who) => 'Hi $who. Do you know who I am?';
}

String greetBob(Person person) => person.greet('Bob');

void main() {
  print(greetBob(Person('Kathy')));
  print(greetBob(Impostor()));
}
```

> *Diễn giải các chú thích:* interface ngầm định của `Person` có chứa `greet()`; `_name`
> nằm trong interface nhưng chỉ nhìn thấy được trong thư viện này; constructor thì **không**
> nằm trong interface; `Impostor` là một bản hiện thực của interface `Person`.

Đây là ví dụ khai báo một lớp hiện thực nhiều interface:

```dart
class Point implements Comparable, Location {
  ...
}
```

<a id="class-variables-and-methods"></a>

## Biến và phương thức của lớp

Dùng từ khóa `static` để hiện thực biến và phương thức ở phạm vi toàn lớp.

<a id="static-variables"></a>

### Biến tĩnh (Static variables)

Biến tĩnh (biến của lớp) hữu ích cho trạng thái và hằng ở phạm vi toàn lớp:

```dart
class Queue {
  static const initialCapacity = 16;
  // ···
}

void main() {
  assert(Queue.initialCapacity == 16);
}
```

Biến tĩnh chỉ được khởi tạo khi chúng được dùng tới.

> **Lưu ý**
> Trang này tuân theo
> [khuyến nghị của style guide](https://dart.dev/effective-dart/style#identifiers): ưu
> tiên dùng `lowerCamelCase` cho tên hằng.

<a id="static-methods"></a>

### Phương thức tĩnh (Static methods)

Phương thức tĩnh (phương thức của lớp) không thao tác trên một thể hiện nào, và do đó
không truy cập được `this`. Tuy nhiên, chúng vẫn truy cập được biến tĩnh. Như ví dụ sau
cho thấy, bạn gọi phương thức tĩnh trực tiếp trên lớp:

```dart
import 'dart:math';

class Point {
  double x, y;
  Point(this.x, this.y);

  static double distanceBetween(Point a, Point b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return sqrt(dx * dx + dy * dy);
  }
}

void main() {
  var a = Point(2, 2);
  var b = Point(4, 4);
  var distance = Point.distanceBetween(a, b);
  assert(2.8 < distance && distance < 2.9);
  print(distance);
}
```

> **Lưu ý**
> Hãy cân nhắc dùng hàm top-level thay vì phương thức tĩnh cho những tiện ích và chức năng
> phổ biến, được dùng rộng rãi.

Bạn có thể dùng phương thức tĩnh như hằng lúc biên dịch. Ví dụ, bạn có thể truyền một
phương thức tĩnh làm tham số cho một constructor hằng.

---

[`Object`]: https://api.dart.dev/dart-core/Object-class.html
[top-and-bottom]: https://dart.dev/null-safety/understanding-null-safety#top-and-bottom
[Extension methods]: https://dart.dev/language/extension-methods
[Class modifiers]: https://dart.dev/language/class-modifiers
[constant constructors]: https://dart.dev/language/constructors#constant-constructors
[`Type`]: https://api.dart.dev/dart-core/Type-class.html
[type test operator]: https://dart.dev/language/operators#type-test-operators
[Getters and setters]: https://dart.dev/language/methods#getters-and-setters
[initializer list]: https://dart.dev/language/constructors#use-an-initializer-list
[factory constructor]: https://dart.dev/language/constructors#factory-constructors
[late-final-ivar]: https://dart.dev/effective-dart/design#avoid-public-late-final-fields-without-initializers
[nullable type]: https://dart.dev/null-safety/understanding-null-safety#using-nullable-types
[must be initialized]: https://dart.dev/null-safety/understanding-null-safety#uninitialized-variables

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
