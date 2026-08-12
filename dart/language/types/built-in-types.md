# Kiểu dựng sẵn (Built-in types)

> **Nguồn gốc:** <https://dart.dev/language/built-in-types> — *Built-in types*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Comments (Chú thích)](https://dart.dev/language/comments) · → [Records](https://dart.dev/language/records)

Ngôn ngữ Dart hỗ trợ đặc biệt cho những kiểu sau:

- [Số (Numbers)](#số-numbers) (`int`, `double`)
- [Chuỗi (Strings)](#chuỗi-strings) (`String`)
- [Boolean](#boolean-booleans) (`bool`)
- [Records][] (`(value1, value2)`)
- [Hàm (Functions)][Functions] (`Function`)
- [List][Lists] (`List`, còn được gọi là *mảng — array*)
- [Set][Sets] (`Set`)
- [Map][Maps] (`Map`)
- [Runes](#runes-và-grapheme-cluster) (`Runes`; thường được thay thế bằng API `characters`)
- [Symbol](#symbol-symbols) (`Symbol`)
- Giá trị `null` (`Null`)

Sự hỗ trợ này bao gồm cả khả năng tạo object bằng literal (giá trị viết trực tiếp). Ví dụ,
`'this is a string'` là một string literal, còn `true` là một boolean literal.

Vì mọi biến trong Dart đều tham chiếu tới một object — một thể hiện của một *lớp* — nên
bạn thường có thể dùng *constructor* để khởi tạo biến. Một số kiểu dựng sẵn có constructor
riêng. Ví dụ, bạn có thể dùng constructor `Map()` để tạo một map.

Một số kiểu khác cũng đóng vai trò đặc biệt trong ngôn ngữ Dart:

* `Object`: Lớp cha (superclass) của mọi lớp trong Dart, ngoại trừ `Null`.
* `Enum`: Lớp cha của mọi enum.
* `Future` và `Stream`: Dùng trong [lập trình bất đồng bộ][asynchronous programming].
* `Iterable`: Dùng trong [vòng lặp for-in][iteration] và trong
  [hàm generator][generator functions] đồng bộ.
* `Never`: Cho biết một biểu thức không bao giờ có thể hoàn tất việc tính toán một cách
  thành công. Thường dùng nhất cho những hàm luôn luôn ném ra ngoại lệ.
* `dynamic`: Cho biết bạn muốn tắt cơ chế kiểm tra tĩnh. Thông thường bạn nên dùng `Object`
  hoặc `Object?` thay thế.
* `void`: Cho biết một giá trị sẽ không bao giờ được dùng tới. Thường dùng làm kiểu trả về.

Các lớp `Object`, `Object?`, `Null` và `Never` giữ những vai trò đặc biệt trong cây phân
cấp lớp. Tìm hiểu về các vai trò này tại [Understanding null safety][].

## Số (Numbers)

Số trong Dart có hai dạng:

[`int`][]
: Giá trị số nguyên không lớn hơn 64 bit, [tùy theo nền tảng][dart-numbers]. Trên các nền
  tảng native, giá trị có thể nằm trong khoảng -2<sup>63</sup> đến 2<sup>63</sup> - 1.
  Trên web, giá trị số nguyên được biểu diễn dưới dạng số của JavaScript (số dấu phẩy động
  64 bit không có phần thập phân) và có thể nằm trong khoảng -2<sup>53</sup> đến
  2<sup>53</sup> - 1.

[`double`][]
: Số dấu phẩy động 64 bit (độ chính xác kép), theo đúng chuẩn IEEE 754.

Cả `int` và `double` đều là kiểu con (subtype) của [`num`][]. Kiểu `num` bao gồm các toán
tử cơ bản như `+`, `-`, `/` và `*`, và cũng là nơi bạn tìm thấy `abs()`, `ceil()`,
`floor()` cùng nhiều phương thức khác. (Các toán tử theo bit, chẳng hạn `>>`, được định
nghĩa trong lớp `int`.) Nếu `num` và các kiểu con của nó không có thứ bạn cần, hãy thử thư
viện [`dart:math`][].

Số nguyên là số không có dấu thập phân. Đây là vài ví dụ định nghĩa integer literal:

```dart
var x = 1;
var hex = 0xDEADBEEF;
```

Nếu một số có phần thập phân, nó là `double`. Đây là vài ví dụ định nghĩa double literal:

```dart
var y = 1.1;
var exponents = 1.42e5;
```

Bạn cũng có thể khai báo biến kiểu `num`. Khi đó biến có thể nhận cả giá trị `int` lẫn
`double`.

```dart
num x = 1; // x can have both int and double values
x += 2.5;
```

> *Diễn giải:* `x` có thể mang cả giá trị `int` lẫn `double`.

Integer literal được tự động chuyển sang `double` khi cần thiết:

```dart
double z = 1; // Equivalent to double z = 1.0.
```

> *Diễn giải:* tương đương với `double z = 1.0`.

Đây là cách chuyển chuỗi thành số và ngược lại:

```dart
// String -> int
var one = int.parse('1');
assert(one == 1);

// String -> double
var onePointOne = double.parse('1.1');
assert(onePointOne == 1.1);

// int -> String
String oneAsString = 1.toString();
assert(oneAsString == '1');

// double -> String
String piAsString = 3.14159.toStringAsFixed(2);
assert(piAsString == '3.14');
```

Kiểu `int` cung cấp các toán tử truyền thống: dịch bit (`<<`, `>>`, `>>>`), phép bù (`~`),
AND (`&`), OR (`|`) và XOR (`^`) — rất hữu ích khi thao tác và che (mask) các cờ trong
trường bit. Ví dụ:

```dart
assert((3 << 1) == 6); // 0011 << 1 == 0110
assert((3 | 4) == 7); // 0011 | 0100 == 0111
assert((3 & 4) == 0); // 0011 & 0100 == 0000
```

Xem thêm ví dụ tại mục [toán tử theo bit và dịch bit][bitwise and shift operator].

Number literal là hằng lúc biên dịch. Nhiều biểu thức số học cũng là hằng lúc biên dịch,
miễn là các toán hạng của chúng là hằng lúc biên dịch và cho ra giá trị số.

```dart
const msPerSecond = 1000;
const secondsUntilRetry = 5;
const msUntilRetry = secondsUntilRetry * msPerSecond;
```

Chi tiết xem [Numbers in Dart][dart-numbers].

<a id="digit-separators"></a>

Bạn có thể dùng một hoặc nhiều dấu gạch dưới (`_`) làm **dấu phân tách chữ số** để những
number literal dài trở nên dễ đọc hơn. Dùng nhiều dấu phân tách liên tiếp cho phép nhóm ở
cấp cao hơn.

```dart
var n1 = 1_000_000;
var n2 = 0.000_000_000_01;
var n3 = 0x00_14_22_01_23_45; // MAC address
var n4 = 555_123_4567; // US Phone number
var n5 = 100__000_000__000_000; // one hundred million million!
```

> *Diễn giải:* `n3` là một địa chỉ MAC; `n4` là một số điện thoại Mỹ; `n5` là một trăm
> triệu triệu.

> **Lưu ý về phiên bản**
> Dùng dấu phân tách chữ số yêu cầu [phiên bản ngôn ngữ][language version] tối thiểu là
> 3.6.

## Chuỗi (Strings)

Một chuỗi trong Dart (object `String`) chứa một dãy các **UTF-16 code unit** (đơn vị mã
UTF-16). Bạn có thể dùng nháy đơn hoặc nháy kép để tạo chuỗi:

```dart
var s1 = 'Single quotes work well for string literals.';
var s2 = "Double quotes work just as well.";
var s3 = 'It\'s easy to escape the string delimiter.';
var s4 = "It's even easier to use the other delimiter.";
```

> *Diễn giải:* nháy đơn dùng tốt cho string literal; nháy kép cũng vậy; `\'` là cách
> escape ký tự phân cách chuỗi; hoặc đơn giản hơn là dùng loại nháy còn lại.

<a id="string-interpolation"></a>

Bạn có thể đặt giá trị của một biểu thức vào bên trong chuỗi bằng cú pháp
`${`*`expression`*`}`. Nếu biểu thức chỉ là một định danh, bạn có thể bỏ cặp `{}`. Để lấy
chuỗi tương ứng với một object, Dart gọi phương thức `toString()` của object đó.

```dart
var s = 'string interpolation';

assert(
  'Dart has $s, which is very handy.' ==
      'Dart has string interpolation, '
          'which is very handy.',
);
assert(
  'That deserves all caps. '
          '${s.toUpperCase()} is very handy!' ==
      'That deserves all caps. '
          'STRING INTERPOLATION is very handy!',
);
```

> **Lưu ý**
> Toán tử `==` kiểm tra xem hai object có tương đương nhau hay không. Hai chuỗi là tương
> đương nếu chúng chứa cùng một dãy code unit.

Bạn có thể nối chuỗi bằng cách đặt các string literal liền kề nhau, hoặc bằng toán tử `+`:

```dart
var s1 =
    'String '
    'concatenation'
    " works even over line breaks.";
assert(
  s1 ==
      'String concatenation works even over '
          'line breaks.',
);

var s2 = 'The + operator ' + 'works, as well.';
assert(s2 == 'The + operator works, as well.');
```

> *Diễn giải:* việc nối chuỗi hoạt động ngay cả khi các literal nằm trên nhiều dòng khác
> nhau; toán tử `+` cũng dùng được.

Để tạo chuỗi nhiều dòng, dùng ba dấu nháy — đơn hoặc kép đều được:

```dart
var s1 = '''
You can create
multi-line strings like this one.
''';

var s2 = """This is also a
multi-line string.""";
```

Bạn có thể tạo chuỗi "raw" (thô) bằng cách thêm tiền tố `r`:

```dart
var s = r'In a raw string, not even \n gets special treatment.';
```

> *Diễn giải:* trong chuỗi raw, ngay cả `\n` cũng không được xử lý đặc biệt — nó chỉ là
> hai ký tự bình thường.

Xem [Runes và grapheme cluster](#runes-và-grapheme-cluster) để biết cách biểu diễn ký tự
Unicode trong chuỗi.

String literal là hằng lúc biên dịch, miễn là mọi biểu thức được nội suy vào đó đều là
hằng lúc biên dịch và cho ra giá trị null, số, chuỗi hoặc boolean.

```dart
// These work in a const string.
const aConstNum = 0;
const aConstBool = true;
const aConstString = 'a constant string';

// These do NOT work in a const string.
var aNum = 0;
var aBool = true;
var aString = 'a string';
const aConstList = [1, 2, 3];

const validConstString = '$aConstNum $aConstBool $aConstString';
// const invalidConstString = '$aNum $aBool $aString $aConstList';
```

> *Diễn giải:* nhóm đầu dùng được trong chuỗi `const`; nhóm sau thì **không** — kể cả
> `aConstList`, vì nó là một collection chứ không phải giá trị null/số/chuỗi/boolean. Dòng
> cuối cùng bị comment lại chính vì nó không hợp lệ.

Để biết thêm về cách dùng chuỗi, xem
[Strings and regular expressions](https://dart.dev/libraries/dart-core#strings-and-regular-expressions).

## Boolean (Booleans)

Để biểu diễn giá trị boolean, Dart có kiểu tên là `bool`. Chỉ có đúng hai object thuộc
kiểu bool: hai boolean literal `true` và `false`, cả hai đều là hằng lúc biên dịch.

Tính an toàn kiểu của Dart nghĩa là bạn không thể viết code kiểu
<code>if (<em>nonBooleanValue</em>)</code> hay
<code>assert (<em>nonBooleanValue</em>)</code>. Thay vào đó, hãy kiểm tra giá trị một cách
tường minh, như sau:

```dart
// Check for an empty string.
var fullName = '';
assert(fullName.isEmpty);

// Check for zero.
var hitPoints = 0;
assert(hitPoints == 0);

// Check for null.
var unicorn = null;
assert(unicorn == null);

// Check for NaN.
var iMeantToDoThis = 0 / 0;
assert(iMeantToDoThis.isNaN);
```

> *Diễn giải:* lần lượt là kiểm tra chuỗi rỗng, kiểm tra bằng 0, kiểm tra null, và kiểm
> tra NaN.

## Runes và grapheme cluster

Trong Dart, [runes][] cho phép bạn tiếp cận các **Unicode code point** (điểm mã Unicode)
của một chuỗi. Bạn có thể dùng [package `characters`][characters package] để xem hoặc thao
tác trên các ký tự theo cảm nhận của người dùng — còn gọi là
[Unicode (extended) grapheme cluster][grapheme clusters].

Unicode định nghĩa một giá trị số duy nhất cho mỗi chữ cái, chữ số và ký hiệu được dùng
trong mọi hệ chữ viết trên thế giới. Vì một chuỗi Dart là một dãy UTF-16 code unit, nên
việc biểu diễn Unicode code point bên trong chuỗi cần cú pháp đặc biệt. Cách thông thường
để biểu diễn một Unicode code point là `\uXXXX`, trong đó XXXX là giá trị thập lục phân 4
chữ số. Ví dụ, ký tự trái tim (♥) là `\u2665`. Để chỉ định nhiều hơn hoặc ít hơn 4 chữ số
hex, hãy đặt giá trị trong dấu ngoặc nhọn. Ví dụ, emoji mặt cười (😆) là `\u{1f606}`.

Nếu bạn cần đọc hoặc ghi từng ký tự Unicode riêng lẻ, hãy dùng getter `characters` mà
package `characters` định nghĩa thêm cho `String`. Object [`Characters`][] được trả về
chính là chuỗi đó dưới dạng một dãy grapheme cluster. Đây là ví dụ dùng API `characters`:

```dart
import 'package:characters/characters.dart';

void main() {
  var hi = 'Hi 🇩🇰';
  print(hi);
  print('The end of the string: ${hi.substring(hi.length - 1)}');
  print('The last character: ${hi.characters.last}');
}
```

Kết quả xuất ra, tùy môi trường của bạn, sẽ trông giống thế này:

```console
$ dart run bin/main.dart
Hi 🇩🇰
The end of the string: ???
The last character: 🇩🇰
```

> *Diễn giải:* `substring` cắt theo code unit nên làm vỡ ký tự (cho ra `???`), còn
> `characters.last` trả về đúng grapheme cluster cuối cùng (lá cờ 🇩🇰).

Để biết chi tiết về cách dùng package `characters` để thao tác chuỗi, xem
[ví dụ][characters example] và [tài liệu API][characters API] của package này.

## Symbol (Symbols)

Object [`Symbol`][] biểu diễn một toán tử hoặc một định danh được khai báo trong chương
trình Dart. Có thể bạn sẽ chẳng bao giờ cần dùng tới symbol, nhưng chúng cực kỳ quý giá
với những API tham chiếu tới định danh theo tên — bởi vì quá trình minify (rút gọn code)
làm thay đổi *tên* định danh, nhưng không làm thay đổi *symbol* của định danh.

Để lấy symbol của một định danh, hãy dùng symbol literal — chỉ đơn giản là dấu `#` theo
sau bởi định danh đó:

```plaintext
#radix
#bar
```

Symbol literal là hằng lúc biên dịch.

---

[Records]: https://dart.dev/language/records
[Functions]: https://dart.dev/language/functions#function-types
[Lists]: https://dart.dev/language/collections#lists
[Sets]: https://dart.dev/language/collections#sets
[Maps]: https://dart.dev/language/collections#maps
[asynchronous programming]: https://dart.dev/language/async
[iteration]: https://dart.dev/libraries/dart-core#iteration
[generator functions]: https://dart.dev/language/functions#generators
[Understanding null safety]: https://dart.dev/null-safety/understanding-null-safety#top-and-bottom
[`int`]: https://api.dart.dev/dart-core/int-class.html
[`double`]: https://api.dart.dev/dart-core/double-class.html
[`num`]: https://api.dart.dev/dart-core/num-class.html
[`dart:math`]: https://api.dart.dev/dart-math/dart-math-library.html
[bitwise and shift operator]: https://dart.dev/language/operators#bitwise-and-shift-operators
[dart-numbers]: https://dart.dev/resources/language/number-representation
[runes]: https://api.dart.dev/dart-core/Runes-class.html
[characters package]: https://pub.dev/packages/characters
[grapheme clusters]: https://unicode.org/reports/tr29/#Grapheme_Cluster_Boundaries
[`Characters`]: https://pub.dev/documentation/characters/latest/characters/Characters-class.html
[characters API]: https://pub.dev/documentation/characters
[characters example]: https://pub.dev/packages/characters/example
[`Symbol`]: https://api.dart.dev/dart-core/Symbol-class.html
[language version]: https://dart.dev/language/versioning

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
