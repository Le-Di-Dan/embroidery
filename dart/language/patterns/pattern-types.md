# Các loại pattern (Pattern types)

> **Nguồn gốc:** <https://dart.dev/language/pattern-types> — *Pattern types*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Patterns](https://dart.dev/language/patterns) · → [Loops (Vòng lặp)](https://dart.dev/language/loops)

Trang này là tài liệu tra cứu về các loại pattern khác nhau. Để có cái nhìn tổng quan về
cách pattern hoạt động, nơi bạn có thể dùng chúng trong Dart, và các trường hợp sử dụng
phổ biến, xem trang [Patterns][] chính.

<a id="pattern-precedence"></a>

#### Độ ưu tiên của pattern

Tương tự [độ ưu tiên toán tử](https://dart.dev/language/operators#operator-precedence-example),
việc tính pattern cũng tuân theo các quy tắc về độ ưu tiên. Bạn có thể dùng
[pattern trong ngoặc](#parenthesized) để buộc những pattern có độ ưu tiên thấp hơn được
tính trước.

Tài liệu này liệt kê các loại pattern theo thứ tự độ ưu tiên **tăng dần**:

* [Logical-or](#logical-or) có độ ưu tiên thấp hơn [logical-and](#logical-and),
  logical-and có độ ưu tiên thấp hơn [relational](#relational), và cứ thế tiếp tục.

* Các pattern một ngôi dạng hậu tố ([cast](#cast), [null-check](#null-check) và
  [null-assert](#null-assert)) có cùng mức độ ưu tiên.

* Các pattern cơ bản (primary pattern) còn lại có độ ưu tiên cao nhất. Pattern thuộc kiểu
  collection ([record](#record), [list](#list) và [map](#map)) cùng với pattern
  [Object](#object) bao bọc dữ liệu khác, nên chúng được tính trước với tư cách pattern
  ngoài (outer pattern).

<a id="logical-or"></a>

## Logical-or

`subpattern1 || subpattern2`

Logical-or pattern ngăn cách các subpattern bằng `||` và khớp nếu **bất kỳ** nhánh nào
khớp. Các nhánh được tính từ trái sang phải. Một khi có nhánh khớp, những nhánh còn lại
không được tính nữa.

```dart
var isPrimary = switch (color) {
  Color.red || Color.yellow || Color.blue => true,
  _ => false,
};
```

Subpattern trong logical-or pattern có thể gắn biến, nhưng các nhánh phải định nghĩa **cùng
một tập biến**, vì khi pattern khớp thì chỉ có đúng một nhánh được tính.

<a id="logical-and"></a>

## Logical-and

`subpattern1 && subpattern2`

Cặp pattern ngăn cách bởi `&&` chỉ khớp nếu **cả hai** subpattern đều khớp. Nếu nhánh trái
không khớp, nhánh phải sẽ không được tính.

Subpattern trong logical-and pattern có thể gắn biến, nhưng biến trong từng subpattern
không được trùng nhau, vì cả hai đều sẽ được gắn nếu pattern khớp:

```dart
switch ((1, 2)) {
  // Error, both subpatterns attempt to bind 'b'.
  case (var a, var b) && (var b, var c): // ...
}
```

> *Diễn giải:* lỗi — cả hai subpattern đều cố gắn biến `b`.

<a id="relational"></a>

## Relational (so sánh)

`== expression`

`< expression`

Relational pattern so sánh giá trị đang khớp với một hằng cho trước, bằng bất kỳ toán tử
so sánh bằng hay so sánh quan hệ nào: `==`, `!=`, `<`, `>`, `<=` và `>=`.

Pattern khớp khi việc gọi toán tử tương ứng trên giá trị đang khớp, với hằng đó làm đối
số, trả về `true`.

Relational pattern rất hữu ích để khớp theo khoảng số, đặc biệt khi kết hợp với
[logical-and pattern](#logical-and):

```dart
String asciiCharType(int char) {
  const space = 32;
  const zero = 48;
  const nine = 57;

  return switch (char) {
    < space => 'control',
    == space => 'space',
    > space && < zero => 'punctuation',
    >= zero && <= nine => 'digit',
    _ => '',
  };
}
```

<a id="cast"></a>

## Cast (ép kiểu)

`foo as String`

Cast pattern cho phép bạn chèn một [phép ép kiểu][type cast] vào giữa quá trình phân rã,
trước khi truyền giá trị sang một subpattern khác:

```dart
(num, Object) record = (1, 's');
var (i as int, s as String) = record;
```

Cast pattern sẽ [ném ngoại lệ][throw] nếu giá trị không mang đúng kiểu đã nêu. Giống như
[null-assert pattern](#null-assert), nó cho phép bạn khẳng định một cách cưỡng chế kiểu mà
bạn mong đợi ở một giá trị được phân rã.

<a id="null-check"></a>

## Null-check (kiểm tra null)

`subpattern?`

Null-check pattern trước hết khớp nếu giá trị **không phải** null, rồi mới đem pattern bên
trong so khớp với chính giá trị đó. Chúng cho phép bạn gắn một biến có kiểu là kiểu cơ sở
non-nullable của giá trị nullable đang được khớp.

Để coi giá trị `null` là **khớp thất bại** mà không ném ngoại lệ, hãy dùng null-check
pattern.

```dart
String? maybeString = 'nullable with base type String';
switch (maybeString) {
  case var s?:
  // 's' has type non-nullable String here.
}
```

> *Diễn giải:* tại đây `s` có kiểu `String` non-nullable.

Để khớp khi giá trị **đúng là** null, hãy dùng [constant pattern](#constant) `null`.

<a id="null-assert"></a>

## Null-assert (khẳng định khác null)

`subpattern!`

Null-assert pattern trước hết khớp nếu object không phải null, rồi mới khớp trên giá trị.
Chúng cho phép các giá trị khác null đi tiếp, nhưng [ném ngoại lệ][throw] nếu giá trị đang
khớp là null.

Để đảm bảo giá trị `null` không bị âm thầm coi là khớp thất bại, hãy dùng null-assert
pattern khi so khớp:

```dart
List<String?> row = ['user', null];
switch (row) {
  case ['user', var name!]: // ...
  // 'name' is a non-nullable string here.
}
```

> *Diễn giải:* tại đây `name` là một chuỗi non-nullable.

Để loại bỏ giá trị `null` khỏi pattern khai báo biến, hãy dùng null-assert pattern:

```dart
(int?, int?) position = (2, 3);

var (x!, y!) = position;
```

Để khớp khi giá trị **đúng là** null, hãy dùng [constant pattern](#constant) `null`.

<a id="constant"></a>

## Constant (hằng)

`123, null, 'string', math.pi, SomeClass.constant, const Thing(1, 2), const (1 + 2)`

Constant pattern khớp khi giá trị bằng với hằng:

```dart
switch (number) {
  // Matches if 1 == number.
  case 1: // ...
}
```

> *Diễn giải:* khớp nếu `1 == number`.

Bạn có thể dùng trực tiếp các literal đơn giản và các tham chiếu tới hằng có tên làm
constant pattern:

- Number literal (`123`, `45.56`)
- Boolean literal (`true`)
- String literal (`'string'`)
- Hằng có tên (`someConstant`, `math.pi`, `double.infinity`)
- Constructor hằng (`const Point(0, 0)`)
- Collection literal hằng (`const []`, `const {1, 2}`)

Những biểu thức hằng phức tạp hơn phải được đặt trong ngoặc và thêm tiền tố `const`
(`const (1 + 2)`):

```dart
// List or map pattern:
case [a, b]: // ...

// List or map literal:
case const [a, b]: // ...
```

> *Diễn giải:* dòng đầu là **list/map pattern**; dòng sau là **list/map literal** (tức một
> constant pattern).

<a id="variable"></a>

## Variable (biến)

`var bar, String str, final int _`

Variable pattern gắn biến mới vào những giá trị đã được khớp hoặc được phân rã. Chúng
thường xuất hiện như một phần của [pattern phân rã][destructure] để bắt lấy giá trị vừa
được phân rã.

Các biến này nằm trong phạm vi của vùng code chỉ có thể đi tới được khi pattern đã khớp.

```dart
switch ((1, 2)) {
  // 'var a' and 'var b' are variable patterns that bind to 1 and 2, respectively.
  case (var a, var b): // ...
  // 'a' and 'b' are in scope in the case body.
}
```

> *Diễn giải:* `var a` và `var b` là các variable pattern, gắn lần lượt vào `1` và `2`;
> `a` và `b` nằm trong phạm vi thân của `case`.

Variable pattern **có định kiểu** chỉ khớp nếu giá trị đang khớp mang đúng kiểu đã khai
báo, ngược lại thì thất bại:

```dart
switch ((1, 2)) {
  // Does not match.
  case (int a, String b): // ...
}
```

> *Diễn giải:* không khớp.

Bạn có thể dùng [wildcard pattern](#wildcard) như một variable pattern.

<a id="identifier"></a>

## Identifier (định danh)

`foo, _`

Identifier pattern hành xử như một [constant pattern](#constant) hoặc như một
[variable pattern](#variable), tùy theo ngữ cảnh mà nó xuất hiện:

- Ngữ cảnh [khai báo][Declaration]: khai báo một biến mới mang tên định danh đó:
  `var (a, b) = (1, 2);`
- Ngữ cảnh [gán][Assignment]: gán cho biến đã tồn tại mang tên định danh đó:
  `(a, b) = (3, 4);`
- Ngữ cảnh [so khớp][Matching]: được coi là một constant pattern có tên (trừ khi tên của
  nó là `_`):

  ```dart
  const c = 1;
  switch (2) {
    case c:
      print('match $c');
    default:
      print('no match'); // Prints "no match".
  }
  ```

- Định danh [wildcard](#wildcard) trong mọi ngữ cảnh: khớp với mọi giá trị rồi bỏ đi:
  `case [_, var y, _]: print('The middle element is $y');`

<a id="parenthesized"></a>

## Parenthesized (trong ngoặc)

`(subpattern)`

Giống như biểu thức đặt trong ngoặc, dấu ngoặc trong pattern cho phép bạn điều khiển
[độ ưu tiên của pattern](#pattern-precedence) và chèn một pattern có độ ưu tiên thấp hơn
vào chỗ vốn mong đợi một pattern có độ ưu tiên cao hơn.

Ví dụ, hãy hình dung các hằng boolean `x`, `y` và `z` lần lượt bằng `true`, `true` và
`false`. Dù ví dụ sau trông giống việc tính biểu thức boolean, nhưng thực chất nó đang so
khớp pattern.

```dart
// ...
x || y => 'matches true',
x || y && z => 'matches true',
x || (y && z) => 'matches true',
// `x || y && z` is the same thing as `x || (y && z)`.
(x || y) && z => 'matches nothing',
// ...
```

> *Diễn giải:* `x || y && z` chính là `x || (y && z)`; còn `(x || y) && z` thì không khớp
> với gì cả.

Dart bắt đầu so khớp pattern từ trái sang phải.

1. Pattern thứ nhất khớp với `true`, vì `x` khớp `true`.
1. Pattern thứ hai khớp với `true`, vì `x` khớp `true`.
1. Pattern thứ ba khớp với `true`, vì `x` khớp `true`.
1. Pattern thứ tư `(x || y) && z` không khớp với gì cả.

   * `x` khớp `true`, nên Dart không thử khớp `y`.
   * Dù `(x || y)` khớp `true`, nhưng `z` lại không khớp `true`.
   * Do đó pattern `(x || y) && z` không khớp `true`.
   * Subpattern `(x || y)` không khớp `false`, nên Dart không thử khớp `z`.
   * Do đó pattern `(x || y) && z` cũng không khớp `false`.
   * Kết luận: `(x || y) && z` không khớp với gì cả.

<a id="list"></a>

## List

`[subpattern1, subpattern2]`

List pattern khớp với những giá trị hiện thực [`List`][], rồi so khớp đệ quy các subpattern
của nó với các phần tử của list để phân rã chúng theo vị trí:

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

List pattern yêu cầu số phần tử trong pattern phải khớp với **toàn bộ** list. Tuy nhiên,
bạn có thể dùng [rest element](#rest-element) làm chỗ giữ chỗ để đại diện cho số lượng
phần tử bất kỳ trong list.

<a id="rest-element"></a>

### Rest element (phần tử phần dư)

List pattern có thể chứa **một** rest element (`...`), cho phép khớp với list có độ dài
tùy ý.

```dart
var [a, b, ..., c, d] = [1, 2, 3, 4, 5, 6, 7];
// Prints "1 2 6 7".
print('$a $b $c $d');
```

Rest element cũng có thể có một subpattern để gom những phần tử không khớp với các
subpattern khác trong list vào một list mới:

```dart
var [a, b, ...rest, c, d] = [1, 2, 3, 4, 5, 6, 7];
// Prints "1 2 [3, 4, 5] 6 7".
print('$a $b $rest $c $d');
```

<a id="map"></a>

## Map

`{"key": subpattern1, someConst: subpattern2}`

Map pattern khớp với những giá trị hiện thực [`Map`][], rồi so khớp đệ quy các subpattern
của nó với các khóa của map để phân rã chúng.

Map pattern **không** yêu cầu pattern phải khớp với toàn bộ map. Map pattern bỏ qua mọi
khóa mà map có nhưng pattern không khớp tới. Còn nếu cố khớp một khóa không tồn tại trong
map thì sẽ ném ra [`StateError`][]:

```dart
final {'foo': int? foo} = {};
```

<a id="record"></a>

## Record

`(subpattern1, subpattern2)`

`(x: subpattern1, y: subpattern2)`

Record pattern khớp với một object [record][] và phân rã các trường của nó. Nếu giá trị
không phải là record có cùng [shape][] với pattern, phép khớp sẽ thất bại. Ngược lại, các
subpattern trường sẽ được so khớp với những trường tương ứng trong record.

Record pattern yêu cầu pattern phải khớp với **toàn bộ** record. Để phân rã một record có
trường **được đặt tên** bằng pattern, hãy đưa tên trường vào pattern:

```dart
var (myString: foo, myNumber: bar) = (myString: 'string', myNumber: 1);
```

Tên getter có thể được lược bỏ và suy ra từ [variable pattern](#variable) hoặc
[identifier pattern](#identifier) trong subpattern trường. Các cặp pattern sau đây tương
đương nhau từng đôi một:

```dart
// Record pattern with variable subpatterns:
var (untyped: untyped, typed: int typed) = record;
var (:untyped, :int typed) = record;

switch (record) {
  case (untyped: var untyped, typed: int typed): // ...
  case (:var untyped, :int typed): // ...
}

// Record pattern with null-check and null-assert subpatterns:
switch (record) {
  case (checked: var checked?, asserted: var asserted!): // ...
  case (:var checked?, :var asserted!): // ...
}

// Record pattern with cast subpattern:
var (untyped: untyped as int, typed: typed as String) = record;
var (:untyped as int, :typed as String) = record;
```

> *Diễn giải:* lần lượt là record pattern với subpattern kiểu variable; với subpattern
> null-check và null-assert; và với subpattern cast.

<a id="object"></a>

## Object

`SomeClass(x: subpattern1, y: subpattern2)`

Object pattern kiểm tra giá trị đang khớp với một kiểu có tên cho trước, để phân rã dữ
liệu bằng các getter trên thuộc tính của object. Chúng bị [bác bỏ][refuted] nếu giá trị
không mang cùng kiểu đó.

```dart
switch (shape) {
  // Matches if shape is of type Rect, and then against the properties of Rect.
  case Rect(width: var w, height: var h): // ...
}
```

> *Diễn giải:* khớp nếu `shape` thuộc kiểu `Rect`, rồi khớp tiếp với các thuộc tính của
> `Rect`.

Tên getter có thể được lược bỏ và suy ra từ [variable pattern](#variable) hoặc
[identifier pattern](#identifier) trong subpattern trường:

```dart
// Binds new variables x and y to the values of Point's x and y properties.
var Point(:x, :y) = Point(1, 2);
```

> *Diễn giải:* gắn hai biến mới `x` và `y` vào giá trị của thuộc tính `x` và `y` của
> `Point`.

Object pattern **không** yêu cầu pattern phải khớp với toàn bộ object. Nếu một object có
thêm những trường mà pattern không phân rã tới, nó vẫn có thể khớp.

<a id="wildcard"></a>

## Wildcard

`_`

Một pattern mang tên `_` là wildcard — có thể là [variable pattern](#variable) hoặc
[identifier pattern](#identifier) — và nó không gắn hay gán cho bất kỳ biến nào.

Nó hữu ích khi làm chỗ giữ chỗ ở những nơi bạn cần một subpattern để có thể phân rã các
giá trị theo vị trí phía sau:

```dart
var list = [1, 2, 3];
var [_, two, _] = list;
```

Wildcard kèm chú thích kiểu rất hữu ích khi bạn muốn kiểm tra kiểu của một giá trị mà
không cần gắn giá trị đó vào tên nào:

```dart
switch (record) {
  case (int _, String _):
    print('First field is int and second is String.');
}
```

---

[Patterns]: https://dart.dev/language/patterns
[type cast]: https://dart.dev/language/operators#type-test-operators
[destructure]: https://dart.dev/language/patterns#destructuring
[throw]: https://dart.dev/language/error-handling#throw
[Declaration]: https://dart.dev/language/patterns#variable-declaration
[Assignment]: https://dart.dev/language/patterns#variable-assignment
[Matching]: https://dart.dev/language/patterns#matching
[`List`]: https://dart.dev/language/collections#lists
[`Map`]: https://dart.dev/language/collections#maps
[`StateError`]: https://api.dart.dev/dart-core/StateError-class.html
[refuted]: https://dart.dev/resources/glossary#refutable-pattern
[record]: https://dart.dev/language/records
[shape]: https://dart.dev/language/records#record-types
[switch]: https://dart.dev/language/branches#switch

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
