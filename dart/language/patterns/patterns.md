# Patterns (Mẫu)

> **Nguồn gốc:** <https://dart.dev/language/patterns> — *Patterns*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Type system (Hệ thống kiểu)](https://dart.dev/language/type-system) · → [Pattern types](https://dart.dev/language/pattern-types)

> **Lưu ý về phiên bản**
> Pattern yêu cầu [phiên bản ngôn ngữ][language version] tối thiểu là 3.0.

Pattern (mẫu) là một phạm trù cú pháp trong ngôn ngữ Dart, giống như câu lệnh (statement)
và biểu thức (expression). Một pattern biểu diễn **hình dạng** của một tập giá trị mà nó
có thể đem đi so khớp với các giá trị thực tế.

Trang này mô tả:

- Pattern làm được gì.
- Pattern được phép xuất hiện ở đâu trong code Dart.
- Những trường hợp sử dụng phổ biến của pattern.

Để tìm hiểu về các loại pattern khác nhau, xem trang [pattern types][types].

## Pattern làm được gì

Nhìn chung, một pattern có thể **so khớp (match)** một giá trị, **phân rã (destructure)**
một giá trị, hoặc cả hai — tùy theo ngữ cảnh và hình dạng của pattern.

Trước hết, _so khớp mẫu (pattern matching)_ cho phép bạn kiểm tra xem một giá trị cho
trước có:

- Mang một hình dạng nhất định hay không.
- Là một hằng nhất định hay không.
- Bằng với một thứ khác hay không.
- Thuộc một kiểu nhất định hay không.

Sau đó, _phân rã mẫu (pattern destructuring)_ cung cấp cho bạn một cú pháp khai báo tiện
lợi để tách giá trị đó thành các thành phần cấu tạo của nó. Cũng chính pattern đó có thể
đồng thời gắn (bind) các biến vào một phần hoặc toàn bộ những thành phần này.

### So khớp (Matching)

Một pattern luôn kiểm tra một giá trị để xác định xem giá trị đó có mang đúng dạng mà bạn
mong đợi hay không. Nói cách khác, bạn đang kiểm tra xem giá trị có _khớp_ với pattern hay
không.

Thế nào là khớp thì phụ thuộc vào [loại pattern][types] mà bạn đang dùng. Ví dụ, một
constant pattern khớp nếu giá trị bằng với hằng của pattern đó:

```dart
switch (number) {
  // Constant pattern matches if 1 == number.
  case 1:
    print('one');
}
```

> *Diễn giải:* constant pattern khớp nếu `1 == number`.

Nhiều pattern có sử dụng **pattern con (subpattern)** — đôi khi được gọi là pattern _ngoài
(outer)_ và _trong (inner)_. Pattern so khớp một cách đệ quy trên các pattern con của
chúng. Ví dụ, từng trường riêng lẻ của một pattern thuộc [kiểu collection][collection-type]
có thể là [variable pattern][variable] hoặc [constant pattern][constant]:

```dart
const a = 'a';
const b = 'b';
switch (obj) {
  // List pattern [a, b] matches obj first if obj is a list with two fields,
  // then if its fields match the constant subpatterns 'a' and 'b'.
  case [a, b]:
    print('$a, $b');
}
```

> *Diễn giải:* list pattern `[a, b]` khớp với `obj` trước hết nếu `obj` là một list có hai
> phần tử, sau đó nếu các phần tử của nó khớp với các constant subpattern `'a'` và `'b'`.

Để bỏ qua một phần của giá trị đã khớp, bạn có thể dùng [wildcard pattern][] làm chỗ giữ
chỗ. Với list pattern, bạn có thể dùng [rest element][].

### Phân rã (Destructuring)

Khi một object và một pattern khớp nhau, pattern có thể truy cập dữ liệu của object đó và
trích xuất nó ra thành từng phần. Nói cách khác, pattern _phân rã_ object:

```dart
var numList = [1, 2, 3];
// List pattern [a, b, c] destructures the three elements from numList...
var [a, b, c] = numList;
// ...and assigns them to new variables.
print(a + b + c);
```

> *Diễn giải:* list pattern `[a, b, c]` phân rã ba phần tử từ `numList`, rồi gán chúng cho
> các biến mới.

Bạn có thể lồng [bất kỳ loại pattern nào][types] bên trong một pattern phân rã. Ví dụ,
case pattern sau khớp và phân rã một list hai phần tử mà phần tử đầu tiên là `'a'` hoặc
`'b'`:

```dart
switch (list) {
  case ['a' || 'b', var c]:
    print(c);
}
```

<a id="places-patterns-can-appear"></a>

## Những nơi pattern có thể xuất hiện

Bạn có thể dùng pattern ở nhiều nơi trong ngôn ngữ Dart:

<a id="pattern-uses"></a>

- [Khai báo](#khai-báo-biến-variable-declaration) và
  [gán](#gán-biến-variable-assignment) biến cục bộ
- [Vòng lặp `for` và `for-in`][for]
- [`if-case`][if] và [`switch-case`][switch]
- Điều khiển luồng trong [collection literal][collection literals]

Mục này mô tả những trường hợp sử dụng phổ biến của việc so khớp và phân rã bằng pattern.

<a id="variable-declaration"></a>

### Khai báo biến (Variable declaration)

Bạn có thể dùng _khai báo biến bằng pattern (pattern variable declaration)_ ở bất cứ đâu
mà Dart cho phép khai báo biến cục bộ. Pattern được so khớp với giá trị nằm bên phải phần
khai báo. Khi đã khớp, nó phân rã giá trị và gắn kết quả vào các biến cục bộ mới:

```dart
// Declares new variables a, b, and c.
var (a, [b, c]) = ('str', [1, 2]);
```

> *Diễn giải:* khai báo ba biến mới `a`, `b` và `c`.

Một khai báo biến bằng pattern phải bắt đầu bằng `var` hoặc `final`, theo sau là một
pattern.

<a id="variable-assignment"></a>

### Gán biến (Variable assignment)

_Pattern gán biến (variable assignment pattern)_ nằm ở vế trái của phép gán. Trước hết, nó
phân rã object đã khớp. Sau đó nó gán các giá trị cho những biến **đã tồn tại**, thay vì
gắn vào biến mới.

Hãy dùng pattern gán biến để hoán đổi giá trị của hai biến mà không cần khai báo biến tạm
thứ ba:

```dart
var (a, b) = ('left', 'right');
(b, a) = (a, b); // Swap.
print('$a $b'); // Prints "right left".
```

> *Diễn giải:* dòng thứ hai hoán đổi giá trị; kết quả in ra là `right left`.

<a id="switch-statements-and-expressions"></a>

### Câu lệnh và biểu thức `switch`

Mỗi mệnh đề `case` đều chứa một pattern. Điều này đúng với cả
[câu lệnh `switch`][switch], [biểu thức `switch`][expressions], lẫn
[câu lệnh `if-case`][if]. Bạn có thể dùng [bất kỳ loại pattern nào][types] trong một
`case`.

_Case pattern_ là loại [có thể bác bỏ (refutable)][refutable]. Chúng cho phép luồng điều
khiển hoặc là:
- So khớp và phân rã object đang được `switch`.
- Tiếp tục thực thi nếu object không khớp.

Những giá trị mà pattern phân rã ra trong một `case` sẽ trở thành biến cục bộ. Phạm vi của
chúng chỉ nằm trong thân của `case` đó.

```dart
switch (obj) {
  // Matches if 1 == obj.
  case 1:
    print('one');

  // Matches if the value of obj is between the
  // constant values of 'first' and 'last'.
  case >= first && <= last:
    print('in range');

  // Matches if obj is a record with two fields,
  // then assigns the fields to 'a' and 'b'.
  case (var a, var b):
    print('a = $a, b = $b');

  default:
}
```

> *Diễn giải các case:* (1) khớp nếu `1 == obj`; (2) khớp nếu giá trị của `obj` nằm giữa
> hai giá trị hằng `first` và `last`; (3) khớp nếu `obj` là một record có hai trường, rồi
> gán các trường đó cho `a` và `b`.

<a id="or-pattern-switch"></a>

[Logical-or pattern][logical-or] rất hữu ích khi bạn muốn nhiều `case` dùng chung một thân
trong biểu thức hoặc câu lệnh `switch`:

```dart
var isPrimary = switch (color) {
  Color.red || Color.yellow || Color.blue => true,
  _ => false,
};
```

Câu lệnh `switch` vẫn có thể cho nhiều `case` dùng chung thân
[mà không cần logical-or pattern][share], nhưng logical-or pattern vẫn có giá trị riêng ở
chỗ nó cho phép nhiều `case` dùng chung một [guard][]:

```dart
switch (shape) {
  case Square(size: var s) || Circle(size: var s) when s > 0:
    print('Non-empty symmetric shape');
}
```

[Mệnh đề guard][guard] tính một điều kiện tùy ý như một phần của `case`, mà không thoát
khỏi `switch` khi điều kiện là false (khác với việc dùng câu lệnh `if` trong thân `case`).

```dart
switch (pair) {
  case (int a, int b):
    if (a > b) print('First element greater');
  // If false, prints nothing and exits the switch.
  case (int a, int b) when a > b:
    // If false, prints nothing but proceeds to next case.
    print('First element greater');
  case (int a, int b):
    print('First element not greater');
}
```

> *Diễn giải:* với `if` trong thân case — nếu điều kiện false thì không in gì **và thoát
> khỏi `switch`**. Với `when` — nếu điều kiện false thì không in gì nhưng **đi tiếp sang
> case kế tiếp**.

<a id="for-and-for-in-loops"></a>

### Vòng lặp `for` và `for-in`

Bạn có thể dùng pattern trong [vòng lặp `for` và `for-in`][for] để vừa duyệt vừa phân rã
các giá trị trong một collection.

Ví dụ sau dùng [phân rã object][object] trong vòng lặp `for-in` để phân rã các object
[`MapEntry`][] mà lời gọi `<Map>.entries` trả về:

```dart
Map<String, int> hist = {'a': 23, 'b': 100};

for (var MapEntry(key: key, value: count) in hist.entries) {
  print('$key occurred $count times');
}
```

Object pattern này kiểm tra rằng `hist.entries` có kiểu mang tên `MapEntry`, rồi đi đệ quy
vào các subpattern trường có tên là `key` và `value`. Ở mỗi vòng lặp, nó gọi getter `key`
và getter `value` trên `MapEntry`, rồi gắn kết quả lần lượt vào các biến cục bộ `key` và
`count`.

Việc gắn kết quả của một lời gọi getter vào một biến cùng tên là trường hợp rất phổ biến,
nên object pattern còn có thể tự suy ra tên getter từ [variable subpattern][variable]. Nhờ
vậy bạn có thể rút gọn variable pattern từ dạng thừa thãi như `key: key` xuống chỉ còn
`:key`:

```dart
for (var MapEntry(:key, value: count) in hist.entries) {
  print('$key occurred $count times');
}
```

## Các trường hợp sử dụng pattern

[Mục trước](#những-nơi-pattern-có-thể-xuất-hiện) mô tả pattern _khớp vào_ các cấu trúc
code Dart khác _như thế nào_. Bạn đã thấy vài trường hợp sử dụng thú vị làm ví dụ, chẳng
hạn [hoán đổi](#gán-biến-variable-assignment) giá trị hai biến, hay
[phân rã cặp khóa-giá trị](#vòng-lặp-for-và-for-in) trong một map. Mục này mô tả thêm
nhiều trường hợp sử dụng nữa, trả lời cho:

- _Khi nào và vì sao_ bạn nên dùng pattern.
- Chúng giải quyết những loại vấn đề gì.
- Chúng phù hợp nhất với những cách viết (idiom) nào.

### Phân rã kết quả trả về gồm nhiều giá trị

Record cho phép gộp và [trả về nhiều giá trị][returning multiple values] từ một lời gọi
hàm. Pattern bổ sung thêm khả năng phân rã trực tiếp các trường của record vào biến cục
bộ, ngay tại chỗ gọi hàm.

Thay vì khai báo từng biến cục bộ riêng cho mỗi trường của record, như thế này:

```dart
var info = userInfo(json);
var name = info.$1;
var age = info.$2;
```

Bạn có thể phân rã các trường của record mà hàm trả về vào biến cục bộ, bằng
[khai báo biến](#khai-báo-biến-variable-declaration) hoặc
[pattern gán](#gán-biến-variable-assignment), với một [record pattern][record] làm
subpattern:

```dart
var (name, age) = userInfo(json);
```

Để phân rã một record có trường được đặt tên bằng pattern:

```dart
final (:name, :age) =
    getData(); // For example, return (name: 'doug', age: 25);
```

> *Diễn giải:* ví dụ, hàm trả về `(name: 'doug', age: 25)`.

### Phân rã thể hiện của lớp

[Object pattern][object] so khớp với các kiểu object có tên, cho phép bạn phân rã dữ liệu
của chúng bằng chính những getter mà lớp của object đó đã công khai.

Để phân rã một thể hiện của lớp, hãy dùng tên kiểu, theo sau là các thuộc tính cần phân rã
đặt trong cặp ngoặc tròn:

```dart
final Foo myFoo = Foo(one: 'one', two: 2);
var Foo(:one, :two) = myFoo;
print('one $one, two $two');
```

### Kiểu dữ liệu đại số (Algebraic data types)

Việc phân rã object kết hợp với `switch case` rất thuận lợi cho lối viết code theo phong
cách [kiểu dữ liệu đại số][algebraic data type]. Hãy dùng cách này khi:
- Bạn có một họ các kiểu liên quan với nhau.
- Bạn có một thao tác cần hành vi riêng cho từng kiểu.
- Bạn muốn gom hành vi đó vào một chỗ, thay vì rải nó ra khắp các định nghĩa kiểu khác
  nhau.

Thay vì cài đặt thao tác đó thành một phương thức thể hiện cho từng kiểu, hãy giữ mọi biến
thể của thao tác trong một hàm duy nhất có `switch` trên các kiểu con:

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

### Kiểm tra tính hợp lệ của JSON đầu vào

[Map pattern][map] và [list pattern][list] rất hợp để phân rã các cặp khóa-giá trị trong
dữ liệu đã giải tuần tự hóa (deserialize), chẳng hạn dữ liệu phân tích từ JSON:

```dart
var data = {
  'user': ['Lily', 13],
};
var {'user': [name, age]} = data;
```

Nếu bạn biết chắc dữ liệu JSON có đúng cấu trúc bạn mong đợi, thì ví dụ trên là thực tế.
Nhưng dữ liệu thường đến từ nguồn bên ngoài, ví dụ qua mạng. Bạn cần kiểm tra tính hợp lệ
của nó trước để xác nhận cấu trúc.

Không có pattern, việc kiểm tra rất dài dòng:

```dart
if (data is Map<String, Object?> &&
    data.length == 1 &&
    data.containsKey('user')) {
  var user = data['user'];
  if (user is List<Object> &&
      user.length == 2 &&
      user[0] is String &&
      user[1] is int) {
    var name = user[0] as String;
    var age = user[1] as int;
    print('User $name is $age years old.');
  }
}
```

Chỉ một [case pattern](#câu-lệnh-và-biểu-thức-switch) là đủ để đạt được cùng kết quả kiểm
tra đó. Trường hợp chỉ có một `case` thì dùng câu lệnh [`if-case`][if] là hợp lý nhất.
Pattern cung cấp một cách kiểm tra JSON mang tính khai báo hơn, và ngắn gọn hơn nhiều:

```dart
if (data case {'user': [String name, int age]}) {
  print('User $name is $age years old.');
}
```

Case pattern này đồng thời xác nhận rằng:

- `json` là một map, vì trước hết nó phải khớp với [map pattern][map] ở lớp ngoài thì mới
  đi tiếp được.
  - Và vì nó là một map, điều này cũng xác nhận luôn `json` không phải null.
- `json` có chứa khóa `user`.
- Khóa `user` gắn với một list gồm hai giá trị.
- Kiểu của hai giá trị trong list lần lượt là `String` và `int`.
- Hai biến cục bộ mới để giữ các giá trị đó là `name` và `age`.

---

[language version]: https://dart.dev/language/versioning
[types]: https://dart.dev/language/pattern-types
[collection-type]: https://dart.dev/language/collections
[wildcard pattern]: https://dart.dev/language/pattern-types#wildcard
[rest element]: https://dart.dev/language/pattern-types#rest-element
[null-check pattern]: https://dart.dev/language/pattern-types#null-check
[for]: https://dart.dev/language/loops#for-loops
[if]: https://dart.dev/language/branches#if-case
[switch]: https://dart.dev/language/branches#switch-statements
[expressions]: https://dart.dev/language/branches#switch-expressions
[collection literals]: https://dart.dev/language/collections#control-flow-operators
[null-assert pattern]: https://dart.dev/language/pattern-types#null-assert
[record]: https://dart.dev/language/pattern-types#record
[returning multiple values]: https://dart.dev/language/records#multiple-returns
[refutable]: https://dart.dev/resources/glossary#refutable-pattern
[constant]: https://dart.dev/language/pattern-types#constant
[list]: https://dart.dev/language/pattern-types#list
[map]: https://dart.dev/language/pattern-types#map
[variable]: https://dart.dev/language/pattern-types#variable
[logical-or]: https://dart.dev/language/pattern-types#logical-or
[share]: https://dart.dev/language/branches#switch-share
[guard]: https://dart.dev/language/branches#guard-clause
[relational]: https://dart.dev/language/pattern-types#relational
[check]: https://dart.dev/language/pattern-types#null-check
[assert]: https://dart.dev/language/pattern-types#null-assert
[object]: https://dart.dev/language/pattern-types#object
[`MapEntry`]: https://api.dart.dev/dart-core/MapEntry-class.html
[algebraic data type]: https://en.wikipedia.org/wiki/Algebraic_data_type

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
