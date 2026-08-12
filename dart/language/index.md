# Giới thiệu về Dart

> **Nguồn gốc:** <https://dart.dev/language> — *Introduction to Dart*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Trang tiếp theo trong tài liệu gốc:** [Variables (Biến)](https://dart.dev/language/variables)

Trang này giới thiệu ngắn gọn về ngôn ngữ Dart thông qua các ví dụ về những tính năng
chính của nó.

Để tìm hiểu sâu hơn về ngôn ngữ Dart, hãy xem các trang chuyên đề riêng lẻ được liệt kê
dưới mục **Language** ở menu bên trái của trang tài liệu gốc.

Về các thư viện lõi (core libraries) của Dart, xem
[tài liệu thư viện lõi](https://dart.dev/libraries).
Bạn cũng có thể xem [Dart cheatsheet](https://dart.dev/resources/dart-cheatsheet)
để có một phần giới thiệu mang tính tương tác hơn.

## Hello World

Mọi ứng dụng đều cần hàm `main()` ở cấp cao nhất (top-level) — đây là nơi chương trình
bắt đầu thực thi. Những hàm không trả về giá trị nào một cách tường minh sẽ có kiểu trả
về là `void`. Để hiển thị văn bản ra console, bạn có thể dùng hàm top-level `print()`:

```dart
void main() {
  print('Hello, World!');
}
```

Đọc thêm về [hàm `main()`][] trong Dart, bao gồm cả các tham số tùy chọn dùng cho đối số
dòng lệnh (command-line arguments).

[hàm `main()`]: https://dart.dev/language/functions#the-main-function

## Biến (Variables)

Ngay cả trong code Dart [an toàn kiểu (type-safe)](https://dart.dev/language/type-system),
bạn vẫn có thể khai báo hầu hết các biến mà không cần chỉ rõ kiểu, bằng cách dùng `var`.
Nhờ cơ chế suy luận kiểu (type inference), kiểu của những biến này được xác định dựa trên
giá trị khởi tạo của chúng:

```dart
var name = 'Voyager I';
var year = 1977;
var antennaDiameter = 3.7;
var flybyObjects = ['Jupiter', 'Saturn', 'Uranus', 'Neptune'];
var image = {
  'tags': ['saturn'],
  'url': '//path/to/saturn.jpg',
};
```

[Đọc thêm](https://dart.dev/language/variables) về biến trong Dart, bao gồm giá trị mặc
định, các từ khóa `final` và `const`, cùng với kiểu tĩnh (static types).

## Câu lệnh điều khiển luồng (Control flow statements)

Dart hỗ trợ các câu lệnh điều khiển luồng thông dụng:

```dart
if (year >= 2001) {
  print('21st century');
} else if (year >= 1901) {
  print('20th century');
}

for (final object in flybyObjects) {
  print(object);
}

for (int month = 1; month <= 12; month++) {
  print(month);
}

while (year < 2016) {
  year += 1;
}
```

Đọc thêm về các câu lệnh điều khiển luồng trong Dart, bao gồm
[`break` và `continue`](https://dart.dev/language/loops),
[`switch` và `case`](https://dart.dev/language/branches),
và [`assert`](https://dart.dev/language/error-handling#assert).

## Hàm (Functions)

[Chúng tôi khuyến nghị](https://dart.dev/effective-dart/design#types) khai báo rõ kiểu cho
từng đối số và cho giá trị trả về của hàm:

```dart
int fibonacci(int n) {
  if (n == 0 || n == 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

var result = fibonacci(20);
```

Cú pháp rút gọn `=>` (_arrow_ — "mũi tên") rất tiện cho những hàm chỉ chứa một câu lệnh
duy nhất. Cú pháp này đặc biệt hữu ích khi truyền hàm ẩn danh (anonymous function) làm đối
số:

```dart
flybyObjects.where((name) => name.contains('turn')).forEach(print);
```

Ngoài việc minh họa một hàm ẩn danh (đối số truyền cho `where()`), đoạn code này còn cho
thấy bạn có thể dùng chính một hàm làm đối số: hàm top-level `print()` được truyền làm đối
số cho `forEach()`.

[Đọc thêm](https://dart.dev/language/functions) về hàm trong Dart, bao gồm tham số tùy
chọn, giá trị mặc định của tham số, và phạm vi từ vựng (lexical scope).

## Chú thích (Comments)

Chú thích trong Dart thường bắt đầu bằng `//`.

```dart
// This is a normal, one-line comment.

/// This is a documentation comment, used to document libraries,
/// classes, and their members. Tools like IDEs and dartdoc treat
/// doc comments specially.

/* Comments like these are also supported. */
```

> *Diễn giải các dòng chú thích trong ví dụ trên:*
> - `// ...` — chú thích thông thường, trên một dòng.
> - `/// ...` — chú thích tài liệu (documentation comment), dùng để viết tài liệu cho thư
>   viện, lớp và các thành viên của lớp. Các công cụ như IDE và `dartdoc` xử lý loại chú
>   thích này một cách đặc biệt.
> - `/* ... */` — dạng chú thích khối cũng được hỗ trợ.

[Đọc thêm](https://dart.dev/language/comments) về chú thích trong Dart, bao gồm cách bộ
công cụ sinh tài liệu hoạt động.

## Import

Để truy cập các API được định nghĩa trong thư viện khác, hãy dùng `import`.

```dart
// Importing core libraries
import 'dart:math';

// Importing libraries from external packages
import 'package:test/test.dart';

// Importing files
import 'path/to/my_other_file.dart';
```

> *Diễn giải:* lần lượt là import thư viện lõi, import thư viện từ package bên ngoài, và
> import file trong chính dự án của bạn.

[Đọc thêm](https://dart.dev/language/libraries) về thư viện và phạm vi truy cập
(visibility) trong Dart, bao gồm tiền tố thư viện (library prefix), `show` và `hide`, cùng
cơ chế nạp trễ (lazy loading) qua từ khóa `deferred`.

## Lớp (Classes)

Dưới đây là ví dụ về một lớp có ba thuộc tính, hai constructor và một phương thức. Một
trong các thuộc tính không thể được gán trực tiếp, nên nó được định nghĩa bằng một
phương thức getter (thay vì bằng một biến). Phương thức trong lớp sử dụng nội suy chuỗi
(string interpolation) để in ra dạng chuỗi của các biến ngay bên trong chuỗi ký tự.

```dart
class Spacecraft {
  String name;
  DateTime? launchDate;

  // Read-only non-final property
  int? get launchYear => launchDate?.year;

  // Constructor, with syntactic sugar for assignment to members.
  Spacecraft(this.name, this.launchDate) {
    // Initialization code goes here.
  }

  // Named constructor that forwards to the default one.
  Spacecraft.unlaunched(String name) : this(name, null);

  // Method.
  void describe() {
    print('Spacecraft: $name');
    // Type promotion doesn't work on getters.
    var launchDate = this.launchDate;
    if (launchDate != null) {
      int years = DateTime.now().difference(launchDate).inDays ~/ 365;
      print('Launched: $launchYear ($years years ago)');
    } else {
      print('Unlaunched');
    }
  }
}
```

> *Diễn giải các chú thích trong đoạn code trên:*
> - `// Read-only non-final property` — thuộc tính chỉ đọc, không phải `final`.
> - `// Constructor, with syntactic sugar for assignment to members.` — constructor, với
>   cú pháp rút gọn (syntactic sugar) để gán giá trị trực tiếp cho các thành viên của lớp.
> - `// Named constructor that forwards to the default one.` — constructor có tên
>   (named constructor), chuyển tiếp lời gọi sang constructor mặc định.
> - `// Type promotion doesn't work on getters.` — cơ chế nâng cấp kiểu (type promotion)
>   không áp dụng được cho getter, nên phải gán ra biến cục bộ trước khi kiểm tra `null`.

[Đọc thêm](https://dart.dev/language/built-in-types#strings) về chuỗi, bao gồm nội suy
chuỗi, chuỗi ký tự (literal), biểu thức, và phương thức `toString()`.

Bạn có thể dùng lớp `Spacecraft` như sau:

```dart
var voyager = Spacecraft('Voyager I', DateTime(1977, 9, 5));
voyager.describe();

var voyager3 = Spacecraft.unlaunched('Voyager III');
voyager3.describe();
```

[Đọc thêm](https://dart.dev/language/classes) về lớp trong Dart, bao gồm danh sách khởi
tạo (initializer list), tính tùy chọn của `new` và `const`, constructor chuyển tiếp
(redirecting constructor), constructor `factory`, getter, setter, và nhiều nội dung khác.

## Enum

Enum là cách liệt kê một tập giá trị (hoặc tập thể hiện) đã được định nghĩa trước, đồng
thời đảm bảo rằng không thể tồn tại thể hiện nào khác của kiểu đó.

Dưới đây là ví dụ về một `enum` đơn giản, định nghĩa danh sách các loại hành tinh:

```dart
enum PlanetType { terrestrial, gas, ice }
```

Còn đây là ví dụ về khai báo enum nâng cao (enhanced enum) — một lớp mô tả các hành tinh,
với tập thể hiện hằng (constant instances) được định nghĩa sẵn, chính là các hành tinh
trong hệ mặt trời của chúng ta:

```dart
/// Enum that enumerates the different planets in our solar system
/// and some of their properties.
enum Planet {
  mercury(planetType: PlanetType.terrestrial, moons: 0, hasRings: false),
  venus(planetType: PlanetType.terrestrial, moons: 0, hasRings: false),
  // ···
  uranus(planetType: PlanetType.ice, moons: 27, hasRings: true),
  neptune(planetType: PlanetType.ice, moons: 14, hasRings: true);

  /// A constant generating constructor
  const Planet({
    required this.planetType,
    required this.moons,
    required this.hasRings,
  });

  /// All instance variables are final
  final PlanetType planetType;
  final int moons;
  final bool hasRings;

  /// Enhanced enums support getters and other methods
  bool get isGiant =>
      planetType == PlanetType.gas || planetType == PlanetType.ice;
}
```

> *Diễn giải các chú thích tài liệu trong đoạn code trên:*
> - Enum liệt kê các hành tinh trong hệ mặt trời và một số thuộc tính của chúng.
> - `/// A constant generating constructor` — constructor sinh hằng (constant generating
>   constructor).
> - `/// All instance variables are final` — mọi biến thể hiện (instance variable) đều là
>   `final`.
> - `/// Enhanced enums support getters and other methods` — enum nâng cao hỗ trợ getter
>   và các phương thức khác.

Bạn có thể dùng enum `Planet` như sau:

```dart
final yourPlanet = Planet.earth;

if (!yourPlanet.isGiant) {
  print('Your planet is not a "giant planet".');
}
```

Khi trình biên dịch có thể suy ra kiểu enum từ ngữ cảnh, bạn có thể dùng cú pháp rút gọn
dấu chấm (dot shorthand) để truy cập các giá trị của enum. Thay vì viết đầy đủ
`EnumName.value`, bạn chỉ cần viết `.value`. Cách này giúp code gọn và dễ đọc hơn.

Ví dụ, khi khai báo một biến với kiểu tường minh là `Planet`, bạn có thể lược bỏ tên enum
vì kiểu `Planet` đã được xác định sẵn:

```dart
// Instead of the full, explicit syntax:
Planet myPlanet = Planet.venus;

// You can use a dot shorthand:
Planet myPlanet = .venus;
```

> *Diễn giải:* dòng đầu là cú pháp đầy đủ, tường minh; dòng sau là cú pháp rút gọn dấu
> chấm.

Dot shorthand không chỉ dùng được khi khai báo biến. Nó còn dùng được trong những ngữ cảnh
như đối số của hàm hay các nhánh `case` của `switch`, miễn là trình biên dịch xác định
được kiểu enum.

[Đọc thêm](https://dart.dev/language/enums) về enum trong Dart, bao gồm các yêu cầu của
enum nâng cao, các thuộc tính được tự động thêm vào, cách truy cập tên của giá trị được
liệt kê, khả năng hỗ trợ trong câu lệnh `switch`, và nhiều nội dung khác.
[Đọc thêm](https://dart.dev/language/dot-shorthands) về cú pháp dot shorthand.

## Kế thừa (Inheritance)

Dart hỗ trợ đơn kế thừa (single inheritance).

```dart
class Orbiter extends Spacecraft {
  double altitude;

  Orbiter(super.name, DateTime super.launchDate, this.altitude);
}
```

[Đọc thêm](https://dart.dev/language/extend) về việc mở rộng lớp (extend), annotation tùy
chọn `@override`, và nhiều nội dung khác.

## Mixin

Mixin là cách tái sử dụng code trên nhiều cây phân cấp lớp (class hierarchy) khác nhau.
Dưới đây là một khai báo mixin:

```dart
mixin Piloted {
  int astronauts = 1;

  void describeCrew() {
    print('Number of astronauts: $astronauts');
  }
}
```

Để bổ sung khả năng của một mixin vào một lớp, chỉ cần mở rộng lớp đó cùng với mixin:

```dart
class PilotedCraft extends Spacecraft with Piloted {
  // ···
}
```

Giờ đây `PilotedCraft` có cả trường `astronauts` lẫn phương thức `describeCrew()`.

[Đọc thêm](https://dart.dev/language/mixins) về mixin.

## Interface và lớp trừu tượng (Abstract classes)

Mọi lớp đều ngầm định nghĩa một interface. Vì vậy, bạn có thể `implements` bất kỳ lớp nào.

```dart
class MockSpaceship implements Spacecraft {
  // ···
}
```

Đọc thêm về [interface ngầm định (implicit interfaces)](https://dart.dev/language/classes#implicit-interfaces),
hoặc về [từ khóa `interface`](https://dart.dev/language/class-modifiers#interface) dùng
một cách tường minh.

Bạn có thể tạo một lớp trừu tượng (abstract class) để một lớp cụ thể kế thừa (extend) hoặc
hiện thực (implement). Lớp trừu tượng có thể chứa các phương thức trừu tượng (phương thức
có thân rỗng).

```dart
abstract class Describable {
  void describe();

  void describeWithEmphasis() {
    print('=========');
    describe();
    print('=========');
  }
}
```

Bất kỳ lớp nào kế thừa `Describable` đều có phương thức `describeWithEmphasis()`, và
phương thức này sẽ gọi tới phần hiện thực `describe()` của chính lớp kế thừa đó.

[Đọc thêm](https://dart.dev/language/class-modifiers#abstract) về lớp trừu tượng và
phương thức trừu tượng.

## Bất đồng bộ (Async)

Tránh rơi vào "callback hell" và giúp code dễ đọc hơn nhiều bằng cách dùng `async` và
`await`.

```dart
const oneSecond = Duration(seconds: 1);
// ···
Future<void> printWithDelay(String message) async {
  await Future.delayed(oneSecond);
  print(message);
}
```

Phương thức ở trên tương đương với:

```dart
Future<void> printWithDelay(String message) {
  return Future.delayed(oneSecond).then((_) {
    print(message);
  });
}
```

Như ví dụ tiếp theo cho thấy, `async` và `await` giúp code bất đồng bộ trở nên dễ đọc:

```dart
Future<void> createDescriptions(Iterable<String> objects) async {
  for (final object in objects) {
    try {
      var file = File('$object.txt');
      if (await file.exists()) {
        var modified = await file.lastModified();
        print(
          'File for $object already exists. It was modified on $modified.',
        );
        continue;
      }
      await file.create();
      await file.writeAsString('Start describing $object in this file.');
    } on IOException catch (e) {
      print('Cannot create description for $object: $e');
    }
  }
}
```

Bạn cũng có thể dùng `async*` — một cách viết gọn gàng, dễ đọc để tạo ra stream.

```dart
Stream<String> report(Spacecraft craft, Iterable<String> objects) async* {
  for (final object in objects) {
    await Future.delayed(oneSecond);
    yield '${craft.name} flies by $object';
  }
}
```

[Đọc thêm](https://dart.dev/language/async) về khả năng hỗ trợ bất đồng bộ, bao gồm hàm
`async`, `Future`, `Stream`, và vòng lặp bất đồng bộ (`await for`).

## Ngoại lệ (Exceptions)

Để ném ra một ngoại lệ, dùng `throw`:

```dart
if (astronauts == 0) {
  throw StateError('No astronauts.');
}
```

Để bắt một ngoại lệ, dùng câu lệnh `try` kèm `on` hoặc `catch` (hoặc cả hai):

```dart
Future<void> describeFlybyObjects(List<String> flybyObjects) async {
  try {
    for (final object in flybyObjects) {
      var description = await File('$object.txt').readAsString();
      print(description);
    }
  } on IOException catch (e) {
    print('Could not describe object: $e');
  } finally {
    flybyObjects.clear();
  }
}
```

Lưu ý rằng đoạn code trên là bất đồng bộ; `try` hoạt động với cả code đồng bộ lẫn bất đồng
bộ bên trong một hàm `async`.

[Đọc thêm](https://dart.dev/language/error-handling#exceptions) về ngoại lệ, bao gồm stack
trace, `rethrow`, và sự khác biệt giữa `Error` và `Exception`.

## Những khái niệm quan trọng

Khi tiếp tục học về ngôn ngữ Dart, hãy ghi nhớ những sự thật và khái niệm sau:

* "Mọi thứ bạn có thể đặt vào một biến đều là object, và mọi object đều là thể hiện
  (instance) của một lớp." Ngay cả số, hàm và `null` cũng là object. Ngoại trừ `null`
  (nếu bạn bật [sound null safety](https://dart.dev/null-safety)), tất cả object đều kế
  thừa từ lớp [`Object`](https://api.dart.dev/dart-core/Object-class.html).

* [Null safety](https://dart.dev/null-safety) được giới thiệu từ Dart 2.12. Để dùng null
  safety, [phiên bản ngôn ngữ (language version)](https://dart.dev/language/versioning)
  phải tối thiểu là 2.12.

* Mặc dù Dart là ngôn ngữ định kiểu chặt (strongly typed), việc chú thích kiểu (type
  annotation) là tùy chọn vì Dart có thể suy luận kiểu. Trong `var number = 101`, `number`
  được suy ra là kiểu `int`.

* Biến không thể chứa `null` trừ khi bạn cho phép điều đó. Bạn có thể làm cho một biến trở
  nên nullable bằng cách thêm dấu chấm hỏi (`?`) vào cuối kiểu của nó. Ví dụ, một biến
  kiểu `int?` có thể là một số nguyên, hoặc có thể là `null`. Nếu bạn _biết chắc_ rằng một
  biểu thức không bao giờ cho ra `null` nhưng Dart lại không đồng ý, bạn có thể thêm `!`
  để khẳng định rằng nó không null (và sẽ ném ra ngoại lệ nếu nó thực sự null). Ví dụ:
  `int x = nullableButNotNullInt!`

* Khi bạn muốn nói rõ rằng mọi kiểu đều được chấp nhận, hãy dùng kiểu `Object?` (nếu đã
  bật null safety), `Object`, hoặc — nếu bắt buộc phải hoãn việc kiểm tra kiểu đến lúc
  chạy — [kiểu đặc biệt `dynamic`](https://dart.dev/effective-dart/design#avoid-using-dynamic-unless-you-want-to-disable-static-checking).

* Dart hỗ trợ kiểu generic, chẳng hạn `List<int>` (một danh sách các số nguyên) hoặc
  `List<Object>` (một danh sách các object thuộc kiểu bất kỳ).

* Dart hỗ trợ hàm top-level (chẳng hạn `main()`), cũng như các hàm gắn với một lớp hay một
  object (tương ứng là _phương thức tĩnh — static method_ và _phương thức thể hiện —
  instance method_). Bạn cũng có thể tạo hàm bên trong hàm (_hàm lồng nhau — nested_ hay
  _hàm cục bộ — local function_).

* Tương tự, Dart hỗ trợ _biến_ ở cấp top-level, cũng như biến gắn với một lớp hay một
  object (biến tĩnh và biến thể hiện). Biến thể hiện đôi khi còn được gọi là _trường
  (field)_ hoặc _thuộc tính (property)_.

* Khác với Java, Dart không có các từ khóa `public`, `protected` và `private`. Nếu một định
  danh bắt đầu bằng dấu gạch dưới (`_`), nó là private trong phạm vi thư viện chứa nó. Xem
  chi tiết tại [Libraries and imports](https://dart.dev/language/libraries).

* _Định danh (identifier)_ có thể bắt đầu bằng một chữ cái hoặc dấu gạch dưới (`_`), theo
  sau là tổ hợp bất kỳ của các ký tự đó cộng thêm chữ số.

* Dart có cả _biểu thức (expression)_ — thứ có giá trị lúc chạy — và _câu lệnh
  (statement)_ — thứ không có giá trị. Ví dụ,
  [biểu thức điều kiện](https://dart.dev/language/operators#conditional-expressions)
  `condition ? expr1 : expr2` có giá trị là `expr1` hoặc `expr2`. Hãy so sánh với
  [câu lệnh if-else](https://dart.dev/language/branches#if), vốn không có giá trị. Một câu
  lệnh thường chứa một hoặc nhiều biểu thức, nhưng một biểu thức không thể trực tiếp chứa
  một câu lệnh.

* Bộ công cụ của Dart có thể báo cáo hai loại vấn đề: _cảnh báo (warning)_ và _lỗi
  (error)_. Cảnh báo chỉ là dấu hiệu cho thấy code của bạn có thể không chạy đúng, nhưng
  chúng không ngăn chương trình thực thi. Lỗi thì có thể là lỗi lúc biên dịch
  (compile-time) hoặc lỗi lúc chạy (run-time). Lỗi biên dịch khiến code hoàn toàn không
  thể chạy; còn lỗi lúc chạy dẫn tới việc một
  [ngoại lệ](https://dart.dev/language/error-handling#exceptions) được ném ra trong quá
  trình code thực thi.

## Tài nguyên bổ sung

Bạn có thể tìm thêm tài liệu và code mẫu trong
[tài liệu thư viện lõi](https://dart.dev/libraries/dart-core) và
[Dart API reference](https://api.dart.dev). Code trên trang tài liệu gốc tuân theo các quy
ước trong [Dart style guide](https://dart.dev/effective-dart/style).
