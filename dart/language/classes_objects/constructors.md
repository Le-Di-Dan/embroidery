# Constructor

> **Nguồn gốc:** <https://dart.dev/language/constructors> — *Constructors*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Classes (Lớp)](https://dart.dev/language/classes) · → [Primary constructors](https://dart.dev/language/primary-constructors)

Constructor là những hàm đặc biệt dùng để tạo thể hiện của lớp.

Dart hiện thực nhiều loại constructor. Ngoại trừ default constructor, các hàm này đều mang
cùng tên với lớp của chúng.

[Generative constructor][generative]
: Tạo thể hiện mới và khởi tạo các biến thể hiện.

[Default constructor][default]
: Được dùng để tạo thể hiện mới khi không có constructor nào được khai báo. Nó không nhận
  đối số và không có tên.

[Named constructor][named]
: Làm rõ mục đích của một constructor, hoặc cho phép tạo nhiều constructor cho cùng một
  lớp.

[Constant constructor][constant]
: Tạo thể hiện dưới dạng hằng lúc biên dịch.

[Factory constructor][factory]
: Hoặc tạo một thể hiện mới của kiểu con, hoặc trả về một thể hiện có sẵn từ cache.

[Redirecting constructor][redirecting]
: Chuyển tiếp lời gọi sang một constructor khác trong cùng lớp.

[default]: #default-constructor
[generative]: #generative-constructor
[named]: #named-constructor
[constant]: #constant-constructor
[factory]: #factory-constructor
[redirecting]: #redirecting-constructor

## Các loại constructor

<a id="generative-constructors"></a>
<a id="generative-constructor"></a>

### Generative constructor

Để tạo thể hiện của một lớp, hãy dùng generative constructor.

```dart
class Point {
  // Instance variables to hold the coordinates of the point.
  double x;
  double y;

  // Generative constructor with initializing formal parameters:
  Point(this.x, this.y);
}
```

> *Diễn giải:* hai biến thể hiện giữ tọa độ của điểm; generative constructor dùng
> **initializing formal parameter** (tham số hình thức khởi tạo).

<a id="default-constructors"></a>
<a id="default-constructor"></a>

### Default constructor

Nếu bạn không khai báo constructor nào, Dart sẽ dùng default constructor. Default
constructor là một generative constructor không có đối số và không có tên.

<a id="named-constructors"></a>
<a id="named-constructor"></a>

### Named constructor

Dùng named constructor để hiện thực nhiều constructor cho một lớp, hoặc để làm rõ ý nghĩa
hơn:

```dart
const double xOrigin = 0;
const double yOrigin = 0;

class Point {
  final double x;
  final double y;

  // Sets the x and y instance variables
  // before the constructor body runs.
  Point(this.x, this.y);

  // Named constructor
  Point.origin() : x = xOrigin, y = yOrigin;
}
```

Lớp con **không** kế thừa named constructor của lớp cha. Để tạo một lớp con có named
constructor đã được định nghĩa ở lớp cha, bạn phải tự hiện thực constructor đó trong lớp
con.

<a id="constant-constructors"></a>
<a id="constant-constructor"></a>

### Constant constructor

Nếu lớp của bạn tạo ra những object không bao giờ thay đổi, hãy biến chúng thành hằng lúc
biên dịch. Để làm vậy, hãy định nghĩa một constructor `const` với toàn bộ biến thể hiện
đều là `final`.

```dart
class ImmutablePoint {
  static const ImmutablePoint origin = ImmutablePoint(0, 0);

  final double x, y;

  const ImmutablePoint(this.x, this.y);
}
```

Constant constructor không phải lúc nào cũng tạo ra hằng. Chúng có thể được gọi trong ngữ
cảnh không phải `const`. Tìm hiểu thêm tại mục [sử dụng constructor][using constructors].

<a id="redirecting-constructors"></a>
<a id="redirecting-constructor"></a>

### Redirecting constructor

Một constructor có thể chuyển hướng sang một constructor khác trong cùng lớp. Redirecting
constructor có thân rỗng. Nó dùng `this` thay cho tên lớp, đặt sau dấu hai chấm (`:`).

```dart
class Point {
  double x, y;

  // The main constructor for this class.
  Point(this.x, this.y);

  // Delegates to the main constructor.
  Point.alongXAxis(double x) : this(x, 0);
}
```

> *Diễn giải:* constructor chính của lớp; constructor thứ hai ủy quyền cho constructor
> chính.

<a id="factory-constructors"></a>
<a id="factory-constructor"></a>

### Factory constructor

Khi gặp một trong hai tình huống sau lúc hiện thực constructor, hãy dùng từ khóa `factory`:

* Constructor không phải lúc nào cũng tạo ra một thể hiện mới của lớp. Dù factory
  constructor không thể trả về `null`, nó có thể trả về:

  * một thể hiện có sẵn từ cache, thay vì tạo mới
  * một thể hiện mới của một kiểu con

* Bạn cần thực hiện những xử lý không tầm thường trước khi dựng ra thể hiện. Việc này có
  thể bao gồm kiểm tra đối số hoặc bất kỳ xử lý nào khác mà danh sách khởi tạo không làm
  được.

> **Mẹo**
> Bạn cũng có thể xử lý việc khởi tạo trễ cho một biến `final` bằng
> [`late final`][late-final-ivar] (hãy cẩn thận!).

Ví dụ sau có hai factory constructor:

* Factory constructor `Logger` trả về object từ cache.
* Factory constructor `Logger.fromJson` khởi tạo một biến `final` từ một object JSON.

```dart
class Logger {
  final String name;
  bool mute = false;

  // _cache is library-private, thanks to
  // the _ in front of its name.
  static final Map<String, Logger> _cache = <String, Logger>{};

  factory Logger(String name) {
    return _cache.putIfAbsent(name, () => Logger._internal(name));
  }

  factory Logger.fromJson(Map<String, Object> json) {
    return Logger(json['name'].toString());
  }

  Logger._internal(this.name);

  void log(String msg) {
    if (!mute) print(msg);
  }
}
```

> *Diễn giải:* `_cache` là private trong phạm vi thư viện, nhờ dấu `_` ở đầu tên.

> **Cảnh báo**
> Factory constructor không thể truy cập `this`.

Dùng factory constructor y như mọi constructor khác:

```dart
var logger = Logger('UI');
logger.log('Button clicked');

var logMap = {'name': 'UI'};
var loggerJson = Logger.fromJson(logMap);
```

<a id="redirecting-factory-constructors"></a>

### Redirecting factory constructor

Redirecting factory constructor khai báo một lời gọi tới constructor của **lớp khác**, để
dùng mỗi khi có ai đó gọi constructor chuyển hướng này.

```dart
factory Listenable.merge(List<Listenable> listenables) = _MergingListenable
```

Vì factory constructor thông thường cũng có thể tạo và trả về thể hiện của lớp khác, nên
redirecting factory trông có vẻ không cần thiết. Tuy nhiên, redirecting factory có vài ưu
điểm:

* Một lớp trừu tượng có thể cung cấp một constructor hằng sử dụng constructor hằng của lớp
  khác.
* Redirecting factory constructor tránh được việc phải lặp lại danh sách tham số hình thức
  và giá trị mặc định của chúng ở các hàm chuyển tiếp.

<a id="constructor-tear-offs"></a>

### Constructor tear-off

Dart cho phép bạn truyền một constructor vào làm tham số mà không gọi nó. Thứ này gọi là
_tear-off_ (vì bạn _xé bỏ_ cặp ngoặc tròn), và nó đóng vai trò một closure gọi constructor
với đúng các tham số ấy.

Nếu tear-off là một constructor có cùng chữ ký và cùng kiểu trả về với thứ mà phương thức
kia nhận vào, bạn có thể dùng tear-off làm tham số hoặc làm biến.

Tear-off khác với lambda hay hàm ẩn danh. Lambda đóng vai trò một lớp bọc quanh
constructor, còn tear-off **chính là** constructor.

**Nên dùng tear-off**

```dart
// Use a tear-off for a named constructor:
var strings = charCodes.map(String.fromCharCode);

// Use a tear-off for an unnamed constructor:
var buffers = charCodes.map(StringBuffer.new);
```

**Không nên dùng lambda**

```dart
// Instead of a lambda for a named constructor:
var strings = charCodes.map((code) => String.fromCharCode(code));

// Instead of a lambda for an unnamed constructor:
var buffers = charCodes.map((code) => StringBuffer(code));
```

Để thảo luận thêm, xem video *Decoding Flutter* về tear-off:
<https://www.youtube.com/watch?v=OmCaloD7sis> — "Dart Tear-offs | Decoding Flutter".

<a id="concise-constructor-syntax"></a>

## Cú pháp constructor rút gọn

Từ Dart 3.13 trở đi, bạn có thể lược bỏ tên lớp khi khai báo generative constructor hoặc
factory constructor bên trong thân lớp, bằng cách dùng trực tiếp từ khóa bổ nghĩa `new`
hoặc `factory`:

-   `new` hoặc `new named`
-   `factory` hoặc `factory named`

Khác với named constructor truyền thống (như `Point.origin()`), named constructor rút gọn
**không** dùng dấu chấm giữa từ khóa (bổ nghĩa) và tên.

```dart
class Point {
  double x, y;

  // Concise unnamed generative constructor.
  new(this.x, this.y);

  // Concise named generative constructor.
  new origin() : x = 0, y = 0;

  // Equivalent to `factory Point.clone(Point other)`.
  factory clone(Point other) => Point(other.x, other.y);
}
```

> *Diễn giải:* lần lượt là generative constructor rút gọn không tên; generative constructor
> rút gọn có tên; và một factory tương đương với `factory Point.clone(Point other)`.

Cú pháp này giảm bớt sự dài dòng và giúp việc đổi tên lớp (refactor) dễ hơn.

> **Lưu ý**
> Với cú pháp này, một phương thức tên là `factory` mà không có kiểu trả về (kiểu như
> `factory () {}`) sẽ được hiểu là một factory constructor không tên.

Bảng sau cho thấy cách ánh xạ từ cú pháp constructor truyền thống sang cú pháp rút gọn
(với lớp tên `LongClassName`):

| Cú pháp Dart gốc | Cú pháp rút gọn |
| ----------------------------------------- | --------------------------- |
| `LongClassName() {}`                      | `new() {}`                  |
| `LongClassName.name() {}`                 | `new name() {}`             |
| `const LongClassName();`                  | `const new();`              |
| `const LongClassName.name();`             | `const new name();`         |
| `LongClassName(): this.other();`          | `new(): this.other();`      |
| `LongClassName.name(): this();`           | `new name(): this();`       |
| `const LongClassName(): this.other();`    | `const new(): this.other();` |
| `const LongClassName.name(): this();`     | `const new name(): this();` |
| `factory LongClassName() { ... }`         | `factory() { ... }`         |
| `factory LongClassName.name() { ... }`    | `factory name() { ... }`    |
| `factory LongClassName() = D;`            | `factory() = D;`            |
| `factory LongClassName.name() = D;`       | `factory name() = D;`       |
| `const factory LongClassName() = D;`      | `const factory() = D;`      |
| `const factory LongClassName.name() = D;` | `const factory name() = D;`  |

Để có cú pháp còn ngắn gọn hơn nữa — nơi bạn định nghĩa trường và constructor trên cùng
một dòng — xem [Primary constructors](https://dart.dev/language/primary-constructors).

<a id="instance-variable-initialization"></a>

## Khởi tạo biến thể hiện

Dart cung cấp vài cách để khởi tạo biến thể hiện. Bạn có thể gán giá trị ngay tại chỗ khai
báo, dùng initializing formal parameter, hoặc dùng danh sách khởi tạo (initializer list).

### Khởi tạo biến thể hiện tại chỗ khai báo

Khởi tạo biến thể hiện ngay khi bạn khai báo chúng.

```dart
class PointA {
  double x = 1.0;
  double y = 2.0;

  // The implicit default constructor sets these variables to (1.0,2.0)
  // PointA();

  @override
  String toString() {
    return 'PointA($x,$y)';
  }
}
```

> *Diễn giải:* default constructor ngầm định sẽ đặt các biến này thành `(1.0, 2.0)`.

<a id="use-initializing-formal-parameters"></a>

### Dùng initializing formal parameter

Để đơn giản hóa mẫu code rất phổ biến là gán một đối số constructor cho một biến thể hiện,
Dart có *initializing formal parameter* (tham số hình thức khởi tạo).

Trong phần khai báo constructor, hãy viết `this.<propertyName>` và bỏ luôn phần thân. Từ
khóa `this` tham chiếu tới thể hiện hiện tại.

Khi có xung đột tên, hãy dùng `this`. Ngoài ra, phong cách Dart thường lược bỏ `this`. Có
một ngoại lệ là với generative constructor, bạn **bắt buộc** phải thêm tiền tố `this` cho
tên của initializing formal parameter.

Như đã nêu ở phần trước của hướng dẫn này, một số constructor và một số phần của
constructor không thể truy cập `this`. Đó là:

* Factory constructor
* Vế phải của danh sách khởi tạo
* Đối số truyền cho constructor của lớp cha

Initializing formal parameter cũng cho phép bạn khởi tạo biến thể hiện non-nullable hoặc
`final`. Cả hai loại biến này đều bắt buộc phải có giá trị khởi tạo hoặc giá trị mặc định.

```dart
class PointB {
  final double x;
  final double y;

  // Sets the x and y instance variables
  // before the constructor body runs.
  PointB(this.x, this.y);

  // Initializing formal parameters can also be optional.
  PointB.optional([this.x = 0.0, this.y = 0.0]);
}
```

> *Diễn giải:* initializing formal parameter cũng có thể là tham số tùy chọn.

Cách này cũng dùng được với biến có tên (named).

```dart
class PointC {
  double x; // must be set in constructor
  double y; // must be set in constructor

  // Generative constructor with initializing formal parameters
  // with default values
  PointC.named({this.x = 1.0, this.y = 1.0});

  @override
  String toString() {
    return 'PointC.named($x,$y)';
  }
}

// Constructor using named variables.
final pointC = PointC.named(x: 2.0, y: 2.0);
```

Mọi biến được đưa vào từ initializing formal parameter đều là `final`, và chỉ nằm trong
phạm vi của những biến được khởi tạo đó.

Để thực hiện phần logic mà bạn không diễn đạt được trong danh sách khởi tạo, hãy tạo một
[factory constructor](#factory-constructor) hoặc một [phương thức tĩnh][static method]
chứa logic đó. Sau đó bạn có thể truyền các giá trị đã tính vào một constructor thông
thường.

Bạn có thể đặt tham số constructor là nullable để khỏi phải khởi tạo chúng.

```dart
class PointD {
  double? x; // null if not set in constructor
  double? y; // null if not set in constructor

  // Generative constructor with initializing formal parameters
  PointD(this.x, this.y);

  @override
  String toString() {
    return 'PointD($x,$y)';
  }
}
```

> *Diễn giải:* `x` và `y` sẽ là null nếu không được gán trong constructor.

<a id="private-named-parameters"></a>

### Tham số có tên dạng private

> **Lưu ý về phiên bản**
> Dùng tham số có tên dạng private làm initializing formal yêu cầu
> [phiên bản ngôn ngữ][language version] tối thiểu là 3.12.

Trong Dart, những trường bắt đầu bằng dấu gạch dưới là private trong phạm vi thư viện của
chúng. Để khởi tạo một trường private bằng tham số có tên, bạn có thể viết đoạn gán thủ
công trong danh sách khởi tạo:

```dart
class Point {
  final double _x;
  Point({required double x}) : _x = x;
}
```

Bạn cũng có thể khởi tạo trường private trực tiếp trong danh sách tham số của constructor.
Khi bạn thêm tiền tố `this._` cho tham số có tên, trình biên dịch sẽ tự động cắt bỏ dấu
gạch dưới đối với bên gọi, cho phép họ dùng một cái tên công khai gọn gàng:

```dart
class Point {
  final double _x;
  Point({required this._x});
}
```

Trong cả hai trường hợp, bên gọi đều dùng tên công khai `x` tại chỗ gọi:

```dart
var p = Point(x: 1.0);
```

Giống như [tham số có tên](https://dart.dev/language/functions#named-parameters) thông
thường, bạn có thể đặt tham số có tên dạng private là tùy chọn hoặc bắt buộc. Bạn cũng có
thể cung cấp giá trị mặc định tường minh.

Trong ví dụ sau, tham số `_x` là tùy chọn và mặc định là `null`. Tham số `_y` cũng tùy chọn
nhưng có giá trị mặc định tường minh là `0.0`:

```dart
class PointPrivate {
  final double? _x; // Nullable field
  final double _y; // Non-nullable field

  PointPrivate({this._x, this._y = 0.0});

  @override
  String toString() => 'PointPrivate($_x, $_y)';
}

void testPrivate() {
  var p = PointPrivate(x: 1.0, y: 2.0);
  print(p);
}
```

#### Ràng buộc

* **Không được xung đột:** Cả tên private lẫn tên công khai được sinh ra đều không được
  trùng với bất kỳ tên tham số nào khác trong cùng constructor.
* **Chỉ dành cho initializing formal:** Tham số có tên trong Dart nói chung không thể là
  private. Khả năng này là một ngoại lệ, chỉ áp dụng cho những tham số có tên vốn là
  initializing formal (`this._field`). Bạn không thể dùng định danh private cho tham số có
  tên thông thường.
* **Tên công khai phải hợp lệ:** Tên private phải ánh xạ được sang một định danh công khai
  hợp lệ. Ví dụ, `this._` hay `this._2x` là không hợp lệ vì chúng không có tên công khai
  tương ứng hợp lệ.

#### Sử dụng trong danh sách khởi tạo

Bên trong danh sách khởi tạo của constructor, hãy tham chiếu tới tham số bằng **tên
private** của nó:

```dart
class PointPrivateAssert {
  final double _x;

  PointPrivateAssert({required this._x}) : assert(_x >= 0);
}
```

#### Tương tác với super parameter

Khi kế thừa một lớp có dùng tham số có tên dạng private, lớp con sẽ dùng **tên công khai**
cho [super parameter][super parameters].

Trong ví dụ sau, lớp `Tool` định nghĩa trường private `_price`. Dù trường này là private,
tham số có tên tương ứng của nó lại là công khai (`price` chứ không phải `_price`). Để
truyền giá trị đi tiếp, lớp con `Hammer` dùng định danh công khai `price`:

```dart
class Tool {
  final int _price;
  Tool({required this._price});
}

class Hammer extends Tool {
  // Forwards to the public 'price' argument
  Hammer({required super.price});
}
```

> *Diễn giải:* chuyển tiếp tới đối số công khai `price`.

[super parameters]: https://dart.dev/resources/glossary#super-parameter

<a id="use-an-initializer-list"></a>

### Dùng danh sách khởi tạo (initializer list)

Trước khi thân constructor chạy, bạn có thể khởi tạo các biến thể hiện. Ngăn cách các biểu
thức khởi tạo bằng dấu phẩy.

```dart
// Initializer list sets instance variables before
// the constructor body runs.
Point.fromJson(Map<String, double> json) : x = json['x']!, y = json['y']! {
  print('In Point.fromJson(): ($x, $y)');
}
```

> **Cảnh báo**
> Vế phải của danh sách khởi tạo không thể truy cập `this`.

Để kiểm tra tính hợp lệ của đầu vào trong quá trình phát triển, hãy dùng `assert` trong
danh sách khởi tạo.

```dart
Point.withAssert(this.x, this.y) : assert(x >= 0) {
  print('In Point.withAssert(): ($x, $y)');
}
```

Danh sách khởi tạo giúp thiết lập các trường `final`.

Ví dụ sau khởi tạo ba trường `final` trong một danh sách khởi tạo. Trên trang gốc, bấm
**Run** để chạy code.

```dart
import 'dart:math';

class Point {
  final double x;
  final double y;
  final double distanceFromOrigin;

  Point(double x, double y)
    : x = x,
      y = y,
      distanceFromOrigin = sqrt(x * x + y * y);
}

void main() {
  var p = Point(2, 3);
  print(p.distanceFromOrigin);
}
```

<a id="constructor-inheritance"></a>

## Kế thừa constructor

_Lớp con_ (subclass) **không** kế thừa *constructor* từ _lớp cha_ (superclass) trực tiếp
của chúng. Nếu một lớp không khai báo constructor nào, nó chỉ có thể dùng
[default constructor](#default-constructor).

Một lớp **có thể** kế thừa các _tham số_ của lớp cha. Chúng được gọi là
[super parameter](#super-parameters).

Constructor hoạt động phần nào giống cách bạn gọi một chuỗi các phương thức tĩnh. Mỗi lớp
con có thể gọi constructor của lớp cha để khởi tạo một thể hiện, giống như lớp con có thể
gọi phương thức tĩnh của lớp cha. Quá trình này **không** "kế thừa" thân constructor hay
chữ ký của nó.

<a id="non-default-superclass-constructors"></a>

### Constructor lớp cha không mặc định

Dart thực thi constructor theo thứ tự sau:

1. [danh sách khởi tạo](#use-an-initializer-list)
1. constructor không tên, không đối số của lớp cha
1. constructor không đối số của lớp chính

Nếu lớp cha không có constructor không tên, không đối số, bạn phải gọi một trong các
constructor của lớp cha. Hãy khai báo constructor của lớp cha sau dấu hai chấm (`:`), đặt
trước thân constructor (nếu có).

Trong ví dụ sau, constructor của lớp `Employee` gọi named constructor của lớp cha là
`Person`. Trên trang gốc, bấm **Run** để chạy code.

```dart
class Person {
  String? firstName;

  Person.fromJson(Map data) {
    print('in Person');
  }
}

class Employee extends Person {
  // Person does not have a default constructor;
  // you must call super.fromJson().
  Employee.fromJson(Map data) : super.fromJson(data) {
    print('in Employee');
  }
}

void main() {
  var employee = Employee.fromJson({});
  print(employee);
  // Prints:
  // in Person
  // in Employee
  // Instance of 'Employee'
}
```

> *Diễn giải:* `Person` không có default constructor, nên bạn bắt buộc phải gọi
> `super.fromJson()`. Kết quả in ra lần lượt: `in Person`, `in Employee`,
> `Instance of 'Employee'`.

Vì Dart tính các đối số truyền cho constructor lớp cha **trước khi** gọi constructor đó,
nên một đối số có thể là biểu thức, chẳng hạn một lời gọi hàm.

```dart
class Employee extends Person {
  Employee() : super.fromJson(fetchDefaultData());
  // ···
}
```

> **Cảnh báo**
> Đối số truyền cho constructor của lớp cha không thể truy cập `this`. Ví dụ, đối số có thể
> gọi phương thức *tĩnh* nhưng không gọi được phương thức *thể hiện*.

<a id="super-parameters"></a>

### Super parameter

Để khỏi phải truyền từng tham số vào lời gọi `super` của constructor, hãy dùng
super-initializer parameter để chuyển tiếp tham số tới constructor lớp cha đã chỉ định
hoặc constructor mặc định. Bạn không thể dùng tính năng này với
[redirecting constructor](#redirecting-constructor). Super-initializer parameter có cú
pháp và ngữ nghĩa giống [initializing formal parameter](#use-initializing-formal-parameters).

> **Lưu ý về phiên bản**
> Dùng super-initializer parameter yêu cầu [phiên bản ngôn ngữ][language version] tối
> thiểu là 2.17. Nếu bạn đang dùng phiên bản ngôn ngữ cũ hơn, bạn phải tự tay truyền toàn
> bộ tham số của constructor lớp cha.

Nếu lời gọi constructor lớp cha có kèm đối số theo vị trí, thì super-initializer parameter
không thể là loại theo vị trí.

```dart
class Vector2d {
  final double x;
  final double y;

  Vector2d(this.x, this.y);
}

class Vector3d extends Vector2d {
  final double z;

  // Forward the x and y parameters to the default super constructor like:
  // Vector3d(final double x, final double y, this.z) : super(x, y);
  Vector3d(super.x, super.y, this.z);
}
```

> *Diễn giải:* chuyển tiếp tham số `x` và `y` tới constructor lớp cha mặc định, tương đương
> với dòng được viết trong comment.

Để minh họa rõ hơn, hãy xem ví dụ sau.

```dart
  // If you invoke the super constructor (`super(0)`) with any
  // positional arguments, using a super parameter (`super.x`)
  // results in an error.
  Vector3d.xAxisError(super.x): z = 0, super(0); // BAD
```

> *Diễn giải:* nếu bạn gọi constructor lớp cha (`super(0)`) kèm bất kỳ đối số theo vị trí
> nào, thì việc dùng super parameter (`super.x`) sẽ gây lỗi.

Named constructor này cố đặt giá trị `x` **hai lần**: một lần trong constructor lớp cha và
một lần dưới dạng super parameter theo vị trí. Vì cả hai đều nhắm tới tham số vị trí `x`,
điều này gây ra lỗi.

Khi constructor lớp cha có đối số có tên, bạn có thể chia chúng ra giữa super parameter có
tên (`super.y` trong ví dụ tiếp theo) và đối số có tên truyền vào lời gọi constructor lớp
cha (`super.named(x: 0)`).

```dart
class Vector2d {
  // ...
  Vector2d.named({required this.x, required this.y});
}

class Vector3d extends Vector2d {
  final double z;

  // Forward the y parameter to the named super constructor like:
  // Vector3d.yzPlane({required double y, required this.z})
  //       : super.named(x: 0, y: y);
  Vector3d.yzPlane({required super.y, required this.z}) : super.named(x: 0);
}
```

> *Diễn giải:* chuyển tiếp tham số `y` tới named constructor của lớp cha, tương đương với
> đoạn viết trong comment.

---

[language version]: https://dart.dev/language/versioning
[using constructors]: https://dart.dev/language/classes#using-constructors
[late-final-ivar]: https://dart.dev/effective-dart/design#avoid-public-late-final-fields-without-initializers
[static method]: https://dart.dev/language/classes#static-methods

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
