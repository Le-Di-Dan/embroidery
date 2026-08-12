# Dot shorthand (Cú pháp rút gọn dấu chấm)

> **Nguồn gốc:** <https://dart.dev/language/dot-shorthands> — *Dot shorthands*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Enums](https://dart.dev/language/enums) · → [Extension methods](https://dart.dev/language/extension-methods)

> **Lưu ý về phiên bản**
> Dot shorthand yêu cầu [phiên bản ngôn ngữ][language version] tối thiểu là 3.10.

[language version]: https://dart.dev/language/versioning

## Tổng quan

Cú pháp dot shorthand `.foo` cho phép bạn viết code Dart gọn hơn, bằng cách lược bỏ tên
kiểu khi trình biên dịch có thể suy ra nó từ ngữ cảnh. Đây là một lựa chọn gọn gàng thay
cho việc phải viết đầy đủ `ContextType.foo` khi truy cập giá trị enum, thành viên tĩnh,
hoặc constructor.

Về bản chất, dot shorthand cho phép một biểu thức bắt đầu bằng một trong những thứ sau,
rồi tùy ý nối thêm các thao tác khác vào:

* Định danh: `.myValue`

* Constructor: `.new()`

* Tạo hằng: `const .myValue()`

Đây là cái nhìn nhanh về cách nó đơn giản hóa một phép gán enum:

```dart
// Use dot shorthand syntax on enums:
enum Status { none, running, stopped, paused }

Status currentStatus = .running; // Instead of Status.running

// Use dot shorthand syntax on a static method:
int port = .parse('8080'); // Instead of int.parse('8080')

// Uses dot shorthand syntax on a constructor:
class Point {
  final int x, y;
  Point(this.x, this.y);
  Point.origin() : x = 0, y = 0;
}

Point origin = .origin(); // Instead of Point.origin()
```

> *Diễn giải:* lần lượt là dùng dot shorthand cho enum, cho phương thức tĩnh, và cho
> constructor. Mỗi comment `// Instead of ...` cho biết cách viết đầy đủ tương ứng.

## Vai trò của kiểu ngữ cảnh (context type)

Dot shorthand dùng [kiểu ngữ cảnh][context type] để xác định thành viên mà trình biên dịch
sẽ phân giải tới. Kiểu ngữ cảnh là kiểu mà Dart mong đợi ở một biểu thức, dựa trên vị trí
của nó. Ví dụ, trong `Status currentStatus = .running`, trình biên dịch biết ở đây cần một
`Status`, nên nó suy ra `.running` chính là `Status.running`.

[context type]: https://dart.dev/resources/glossary#context-type

## Cấu trúc từ vựng và cú pháp

_Static member shorthand_ (rút gọn thành viên tĩnh) là một biểu thức bắt đầu bằng dấu chấm
(`.`) đứng đầu. Khi kiểu đã được biết từ ngữ cảnh xung quanh, cú pháp này cho một cách gọn
gàng để truy cập thành viên tĩnh, constructor và giá trị enum.

### Enum

Trường hợp sử dụng chính và rất được khuyến khích của dot shorthand là với enum, đặc biệt
trong phép gán và câu lệnh `switch`, nơi kiểu enum là rất hiển nhiên.

```dart
enum LogLevel { debug, info, warning, error }

/// Returns the color code to use for the specified log [level].
String colorCode(LogLevel level) {
  // Use dot shorthand syntax for enum values in switch cases:
  return switch (level) {
    .debug => 'gray', // Instead of LogLevel.debug
    .info => 'blue', // Instead of LogLevel.info
    .warning => 'orange', // Instead of LogLevel.warning
    .error => 'red', // Instead of LogLevel.error
  };
}

// Example usage:
String warnColor = colorCode(.warning); // Returns 'orange'
```

> *Diễn giải:* doc comment nói hàm trả về mã màu dùng cho mức log `[level]` được chỉ định.

### Named constructor

Dot shorthand hữu ích khi gọi named constructor hoặc factory constructor. Cú pháp này cũng
hoạt động khi bạn truyền đối số kiểu cho constructor của một lớp generic.

```dart
class Point {
  final double x, y;
  const Point(this.x, this.y);
  const Point.origin() : x = 0, y = 0; // Named constructor

  // Factory constructor
  factory Point.fromList(List<double> list) {
    return Point(list[0], list[1]);
  }
}

// Use dot shorthand syntax on a named constructor:
Point origin = .origin(); // Instead of Point.origin()

// Use dot shorthand syntax on a factory constructor:
Point p1 = .fromList([1.0, 2.0]); // Instead of Point.fromList([1.0, 2.0])

// Use dot shorthand syntax on a generic class constructor:
List<int> intList = .filled(5, 0); // Instead of List.filled(5, 0)
```

### Constructor không tên

Dot shorthand `.new` cho một cách gọn gàng để gọi constructor không tên của một lớp. Điều
này hữu ích khi gán cho trường hoặc biến mà kiểu đã được khai báo tường minh sẵn.

Cú pháp này đặc biệt hiệu quả trong việc dọn dẹp những đoạn khởi tạo trường lặp đi lặp lại
của lớp. Như ví dụ "sau" dưới đây cho thấy, nó dùng được cho constructor có lẫn không có
đối số. Nó cũng suy ra được các đối số kiểu generic từ ngữ cảnh.

**Không dùng dot shorthand:**

```dart
class _PageState extends State<Page> {
  late final AnimationController _animationController = AnimationController(
    vsync: this,
  );
  final ScrollController _scrollController = ScrollController();

  final GlobalKey<ScaffoldMessengerState> scaffoldKey =
      GlobalKey<ScaffoldMessengerState>();

  Map<String, Map<String, bool>> properties = <String, Map<String, bool>>{};
  // ...
}
```

**Dùng dot shorthand:**

```dart
// Use dot shorthand syntax for calling unnamed constructors:
class _PageState extends State<Page> {
  late final AnimationController _animationController = .new(vsync: this);
  final ScrollController _scrollController = .new();
  final GlobalKey<ScaffoldMessengerState> scaffoldKey = .new();
  Map<String, Map<String, bool>> properties = .new();
  // ...
}
```

### Thành viên tĩnh

Bạn có thể dùng cú pháp dot shorthand để gọi phương thức tĩnh hoặc truy cập trường/getter
tĩnh. Trình biên dịch suy ra lớp đích từ kiểu ngữ cảnh của biểu thức.

```dart
// Use dot shorthand syntax to invoke a static method:
int httpPort = .parse('80'); // Instead of int.parse('80')

// Use dot shorthand syntax to access a static field or getter:
BigInt bigIntZero = .zero; // Instead of BigInt.zero
```

### Biểu thức hằng

Bạn có thể dùng dot shorthand bên trong ngữ cảnh hằng, nếu thành viên được truy cập là một
hằng lúc biên dịch. Điều này phổ biến với giá trị enum và với việc gọi constructor `const`.

```dart
enum Status { none, running, stopped, paused }

class Point {
  final double x, y;
  const Point(this.x, this.y);
  const Point.origin() : x = 0.0, y = 0.0;
}

// Use dot shorthand syntax for enum value:
const Status defaultStatus = .running; // Instead of Status.running

// Use dot shorthand syntax to invoke a const named constructor:
const Point myOrigin = .origin(); // Instead of Point.origin()

// Use dot shorthand syntax in a const collection literal:
const List<Point> keyPoints = [.origin(), .new(1.0, 1.0)];
// Instead of [Point.origin(), Point(1.0, 1.0)]
```

## Quy tắc và giới hạn

Dot shorthand dựa vào một kiểu ngữ cảnh rõ ràng, và điều đó dẫn tới một vài quy tắc cùng
giới hạn cụ thể mà bạn nên biết.

### Chuỗi thao tác cần kiểu ngữ cảnh rõ ràng

Dù bạn có thể nối tiếp các thao tác như gọi phương thức hay truy cập thuộc tính lên một dot
shorthand, **toàn bộ** biểu thức vẫn được kiểm tra dựa trên kiểu ngữ cảnh.

Trình biên dịch trước hết dùng ngữ cảnh để xác định dot shorthand phân giải thành cái gì.
Mọi thao tác tiếp theo trong chuỗi phải trả về một giá trị khớp với chính kiểu ngữ cảnh ban
đầu đó.

```dart
// .fromCharCode(72) resolves to the String "H",
// then the instance method .toLowerCase() is called on that String.
String lowerH = .fromCharCode(72).toLowerCase();
// Instead of String.fromCharCode(72).toLowerCase()

print(lowerH); // Output: h
```

> *Diễn giải:* `.fromCharCode(72)` phân giải thành chuỗi `"H"`, rồi phương thức thể hiện
> `.toLowerCase()` được gọi lên chuỗi đó.

### Phép so sánh bằng bất đối xứng

Toán tử `==` và `!=` có một quy tắc đặc biệt với dot shorthand. Khi cú pháp dot shorthand
được dùng trực tiếp ở **vế phải** của một phép so sánh bằng, Dart dùng kiểu tĩnh của **vế
trái** để xác định lớp hoặc enum cho phần rút gọn đó.

Ví dụ, trong biểu thức `myColor == .green`, kiểu của biến `myColor` được dùng làm ngữ cảnh.
Điều này nghĩa là trình biên dịch hiểu `.green` là `Color.green`.

```dart
enum Color { red, green, blue }

// Use dot shorthand syntax for equality expressions:
void allowedExamples() {
  Color myColor = Color.red;
  bool condition = true;

  // OK: `myColor` is a `Color`, so `.green` is inferred as `Color.green`.
  if (myColor == .green) {
    print('The color is green.');
  }

  // OK: Works with `!=` as well.
  if (myColor != .blue) {
    print('The color is not blue.');
  }

  // OK: The context for the ternary is the variable `inferredColor`
  // being assigned to, which has a type of `Color`.
  Color inferredColor = condition ? .green : .blue;
  print('Inferred color is $inferredColor');
}
```

> *Diễn giải:* (1) OK — `myColor` là `Color` nên `.green` được suy ra là `Color.green`;
> (2) OK — hoạt động với cả `!=`; (3) OK — ngữ cảnh của biểu thức ba ngôi chính là biến
> `inferredColor` đang được gán tới, vốn có kiểu `Color`.

Dot shorthand **bắt buộc** phải nằm ở vế phải của toán tử `==` hoặc `!=`. Việc so sánh với
một biểu thức phức tạp hơn, chẳng hạn biểu thức điều kiện, cũng không được phép.

```dart
enum Color { red, green, blue }

void notAllowedExamples() {
  Color myColor = Color.red;
  bool condition = true;

  // ERROR: The shorthand must be on the right side of `==`.
  // Dart's `==` operator is not symmetric for this feature.
  if (.red == myColor) {
    print('This will not compile.');
  }

  // ERROR: The right-hand side is a complex expression (a conditional expression),
  // which is not a valid target for shorthand in a comparison.
  if (myColor == (condition ? .green : .blue)) {
    print('This will not compile.');
  }

  // ERROR: The type context is lost by casting `myColor` to `Object`.
  // The compiler no longer knows that `.green` should refer to `Color.green`.
  if ((myColor as Object) == .green) {
    print('This will not compile.');
  }
}
```

> *Diễn giải:* (1) LỖI — dot shorthand phải nằm ở vế phải của `==`; toán tử `==` của Dart
> không đối xứng với tính năng này. (2) LỖI — vế phải là một biểu thức phức tạp (biểu thức
> điều kiện), không phải đích hợp lệ cho dot shorthand trong phép so sánh. (3) LỖI — ngữ
> cảnh kiểu bị mất do ép `myColor` sang `Object`, nên trình biên dịch không còn biết
> `.green` phải trỏ tới `Color.green`.
> *(Đoạn code này cố tình gây lỗi phân tích tĩnh.)*

### Câu lệnh biểu thức không được bắt đầu bằng `.`

Để tránh những tình huống nhập nhằng khi phân tích cú pháp trong tương lai, một câu lệnh
biểu thức (expression statement) không được phép bắt đầu bằng token `.`.

```dart
class Logger {
  static void log(String message) {
    print(message);
  }
}

void main() {
  // ERROR: An expression statement can't begin with `.`.
  // The compiler has no type context (like a variable assignment)
  // to infer that `.log` should refer to `Logger.log`.
  .log('Hello');
}
```

> *Diễn giải:* LỖI — câu lệnh biểu thức không được bắt đầu bằng `.`; trình biên dịch không
> có ngữ cảnh kiểu nào (như một phép gán biến) để suy ra rằng `.log` trỏ tới `Logger.log`.
> *(Đoạn code này cố tình gây lỗi phân tích tĩnh.)*

### Hỗ trợ hạn chế với kiểu union

Dù có phần xử lý đặc biệt cho kiểu nullable (`T?`) và `FutureOr<T>`, mức hỗ trợ vẫn hạn
chế.

*  Với kiểu nullable (`T?`), bạn truy cập được thành viên tĩnh của `T`, nhưng không truy
   cập được của `Null`.

*  Với `FutureOr<T>`, bạn truy cập được thành viên tĩnh của `T` (chủ yếu để hỗ trợ giá trị
   trả về của hàm `async`), nhưng không truy cập được thành viên tĩnh của chính lớp
   `Future`.

---

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
