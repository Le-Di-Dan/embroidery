# Toán tử (Operators)

> **Nguồn gốc:** <https://dart.dev/language/operators> — *Operators*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Variables (Biến)](https://dart.dev/language/variables) · → [Comments (Chú thích)](https://dart.dev/language/comments)

<a name="operators"></a>

Dart hỗ trợ các toán tử được liệt kê trong bảng dưới đây. Bảng này thể hiện **tính kết hợp
(associativity)** và [**độ ưu tiên (operator precedence)**](#ví-dụ-về-độ-ưu-tiên-toán-tử)
của toán tử trong Dart, xếp từ cao xuống thấp — đây là con số **xấp xỉ** cho mối quan hệ
giữa các toán tử trong Dart. Bạn có thể tự cài đặt nhiều toán tử trong số này
[dưới dạng thành viên của lớp][operators as class members].

| Mô tả | Toán tử | Tính kết hợp |
|-------|---------|--------------|
| hậu tố một ngôi (unary postfix) | *`expr`*`++`    *`expr`*`--`    `()`    `[]`    `?[]`    `.`    `?.`    `!` | Không có |
| tiền tố một ngôi (unary prefix) | `-`*`expr`*    `!`*`expr`*    `~`*`expr`*    `++`*`expr`*    `--`*`expr`*      `await` *`expr`* | Không có |
| nhân/chia (multiplicative) | `*`    `/`    `%`    `~/` | Trái |
| cộng/trừ (additive) | `+`    `-` | Trái |
| dịch bit (shift) | `<<`    `>>`    `>>>` | Trái |
| AND theo bit | `&` | Trái |
| XOR theo bit | `^` | Trái |
| OR theo bit | <code>&#124;</code> | Trái |
| so sánh và kiểm tra kiểu | `>=`    `>`    `<=`    `<`    `as`    `is`    `is!` | Không có |
| bằng/khác (equality) | `==`    `!=` | Không có |
| AND logic | `&&` | Trái |
| OR logic | <code>&#124;&#124;</code> | Trái |
| if-null | `??` | Trái |
| điều kiện (conditional) | *`expr1`*    `?`    *`expr2`*    `:`    *`expr3`* | Phải |
| cascade | `..`    `?..` | Trái |
| phép gán (assignment) | `=`    `*=`    `/=`    `+=`    `-=`    `&=`    `^=`    *v.v.* | Phải |
| spread ([xem ghi chú](#toán-tử-spread-spread-operators)) | `...`    `...?` | Không có |

> **Cảnh báo**
> Bảng trên chỉ nên dùng như một hướng dẫn tham khảo. Khái niệm độ ưu tiên và tính kết hợp
> của toán tử ở đây chỉ là bản xấp xỉ so với sự thật nằm trong văn phạm (grammar) của ngôn
> ngữ. Bạn có thể tìm hành vi chuẩn xác về quan hệ giữa các toán tử của Dart trong phần
> văn phạm được định nghĩa tại [đặc tả ngôn ngữ Dart][Dart language specification].

Khi dùng toán tử, bạn tạo ra các biểu thức. Đây là một vài ví dụ về biểu thức có toán tử:

```dart
a++
a + b
a = b
a == b
c ? a : b
a is T
```

## Ví dụ về độ ưu tiên toán tử

Trong [bảng toán tử](#operators), mỗi toán tử có độ ưu tiên cao hơn các toán tử ở những
hàng phía dưới nó. Ví dụ, toán tử nhân/chia `%` có độ ưu tiên cao hơn (và do đó được thực
thi trước) toán tử so sánh bằng `==`, còn `==` lại có độ ưu tiên cao hơn toán tử AND logic
`&&`. Độ ưu tiên đó khiến hai dòng code sau đây thực thi giống hệt nhau:

```dart
// Parentheses improve readability.
if ((n % i == 0) && (d % i == 0)) {
  // ...
}

// Harder to read, but equivalent.
if (n % i == 0 && d % i == 0) {
  // ...
}
```

> *Diễn giải:* cách đầu dùng dấu ngoặc để dễ đọc hơn; cách sau khó đọc hơn nhưng tương
> đương.

> **Cảnh báo**
> Với những toán tử nhận hai toán hạng, chính toán hạng bên trái quyết định phương thức
> nào được dùng. Ví dụ, nếu bạn có một object `Vector` và một object `Point`, thì
> `aVector + aPoint` sẽ dùng phép cộng (`+`) của `Vector`.

## Toán tử số học (Arithmetic operators)

Dart hỗ trợ các toán tử số học thông thường như bảng dưới đây.

| Toán tử | Ý nghĩa |
|---------|---------|
| `+` | Cộng |
| `-` | Trừ |
| `-`*`expr`* | Dấu trừ một ngôi, còn gọi là phép lấy đối (đảo dấu của biểu thức) |
| `*` | Nhân |
| `/` | Chia |
| `~/` | Chia, trả về kết quả là số nguyên |
| `%` | Lấy phần dư của phép chia nguyên (modulo) |

Ví dụ:

```dart
assert(2 + 3 == 5);
assert(2 - 3 == -1);
assert(2 * 3 == 6);
assert(5 / 2 == 2.5); // Result is a double
assert(5 ~/ 2 == 2); // Result is an int
assert(5 % 2 == 1); // Remainder

assert('5/2 = ${5 ~/ 2} r ${5 % 2}' == '5/2 = 2 r 1');
```

> *Diễn giải:* `5 / 2` cho kết quả kiểu `double`; `5 ~/ 2` cho kết quả kiểu `int`;
> `5 % 2` cho phần dư.

Dart cũng hỗ trợ toán tử tăng/giảm ở cả dạng tiền tố (prefix) lẫn hậu tố (postfix).

| Toán tử | Ý nghĩa |
|---------|---------|
| `++`*`var`* | *`var`* `=` *`var`* `+ 1` (giá trị của biểu thức là *`var`*` + 1`) |
| *`var`*`++` | *`var`* `=` *`var`* `+ 1` (giá trị của biểu thức là *`var`*) |
| `--`*`var`* | *`var`* `=` *`var`* `- 1` (giá trị của biểu thức là *`var`*` - 1`) |
| *`var`*`--` | *`var`* `=` *`var`* `- 1` (giá trị của biểu thức là *`var`*) |

Ví dụ:

```dart
int a;
int b;

a = 0;
b = ++a; // Increment a before b gets its value.
assert(a == b); // 1 == 1

a = 0;
b = a++; // Increment a after b gets its value.
assert(a != b); // 1 != 0

a = 0;
b = --a; // Decrement a before b gets its value.
assert(a == b); // -1 == -1

a = 0;
b = a--; // Decrement a after b gets its value.
assert(a != b); // -1 != 0
```

> *Diễn giải:* `++a` tăng `a` **trước** khi `b` nhận giá trị; `a++` tăng `a` **sau** khi
> `b` nhận giá trị. Tương tự với `--a` và `a--`.

## Toán tử so sánh bằng và so sánh quan hệ

Bảng sau liệt kê ý nghĩa của các toán tử so sánh bằng (equality) và so sánh quan hệ
(relational).

| Toán tử | Ý nghĩa |
|---------|---------|
| `==` | Bằng; xem phần thảo luận bên dưới |
| `!=` | Khác |
| `>` | Lớn hơn |
| `<` | Nhỏ hơn |
| `>=` | Lớn hơn hoặc bằng |
| `<=` | Nhỏ hơn hoặc bằng |

Để kiểm tra xem hai object `x` và `y` có biểu diễn cùng một thứ hay không, hãy dùng toán
tử `==`. (Trong trường hợp hiếm gặp khi bạn cần biết hai object có đúng là **cùng một
object** hay không, hãy dùng hàm [identical()][] thay thế.) Toán tử `==` hoạt động như
sau:

1.  Nếu *x* hoặc *y* là null: trả về true nếu cả hai đều null, và false nếu chỉ một trong
    hai là null.

2.  Trả về kết quả của việc gọi phương thức `==` trên *x* với đối số là *y*. (Đúng vậy —
    những toán tử như `==` thực chất là phương thức được gọi trên toán hạng đầu tiên của
    chúng. Chi tiết xem [Operators][].)

Đây là ví dụ dùng từng toán tử so sánh bằng và so sánh quan hệ:

```dart
assert(2 == 2);
assert(2 != 3);
assert(3 > 2);
assert(2 < 3);
assert(3 >= 3);
assert(2 <= 3);
```

## Toán tử kiểm tra kiểu (Type test operators)

Các toán tử `as`, `is` và `is!` rất tiện để kiểm tra kiểu tại thời điểm chạy (runtime).

| Toán tử | Ý nghĩa |
|---------|---------|
| `as` | Ép kiểu (cũng dùng để chỉ định [tiền tố thư viện][library prefixes]) |
| `is` | True nếu object thuộc kiểu đã chỉ định |
| `is!` | True nếu object **không** thuộc kiểu đã chỉ định |

Kết quả của `obj is T` là true nếu `obj` hiện thực interface được chỉ định bởi `T`. Ví dụ,
`obj is Object?` luôn luôn true.

Chỉ dùng toán tử `as` để ép một object sang một kiểu cụ thể khi và chỉ khi bạn chắc chắn
object đó thuộc kiểu ấy. Ví dụ:

```dart
(employee as Person).firstName = 'Bob';
```

Nếu bạn không chắc object thuộc kiểu `T`, hãy dùng `is T` để kiểm tra kiểu trước khi sử
dụng object đó.

```dart
if (employee is Person) {
  // Type check
  employee.firstName = 'Bob';
}
```

> **Lưu ý**
> Hai đoạn code trên **không** tương đương. Nếu `employee` là null hoặc không phải
> `Person`, ví dụ đầu tiên sẽ ném ra ngoại lệ; ví dụ thứ hai thì không làm gì cả.

## Toán tử gán (Assignment operators)

Như bạn đã thấy, bạn có thể gán giá trị bằng toán tử `=`. Để chỉ gán khi biến được gán
đang là null, hãy dùng toán tử `??=`.

```dart
// Assign value to a
a = value;
// Assign value to b if b is null; otherwise, b stays the same
b ??= value;
```

> *Diễn giải:* dòng 1 gán `value` cho `a`; dòng 2 chỉ gán `value` cho `b` nếu `b` đang là
> null, ngược lại `b` giữ nguyên.

Các toán tử gán kép (compound assignment) như `+=` kết hợp một phép toán với một phép gán.

|      |       |       |        |                      |
|------|-------|-------|--------|----------------------|
| `=`  | `*=`  | `%=`  | `>>>=` | `^=`                 |
| `+=` | `/=`  | `<<=` | `&=`   | <code>&#124;=</code> |
| `-=` | `~/=` | `>>=` |        |                      |

Toán tử gán kép hoạt động như sau:

|  | Gán kép | Biểu thức tương đương |
|--|---------|------------------------|
| **Với một toán tử *op*:** | `a ` *`op`*`= b` | `a = a ` *`op `* `b` |
| **Ví dụ:** | `a += b` | `a = a + b` |

Ví dụ sau dùng cả toán tử gán và toán tử gán kép:

```dart
var a = 2; // Assign using =
a *= 3; // Assign and multiply: a = a * 3
assert(a == 6);
```

> *Diễn giải:* dòng 1 gán bằng `=`; dòng 2 vừa nhân vừa gán, tương đương `a = a * 3`.

## Toán tử logic (Logical operators)

Bạn có thể đảo ngược hoặc kết hợp các biểu thức boolean bằng những toán tử logic.

| Toán tử | Ý nghĩa |
|---------|---------|
| `!`*`expr`* | đảo ngược biểu thức đứng sau (false thành true, và ngược lại) |
| <code>&#124;&#124;</code> | OR logic |
| `&&` | AND logic |

Đây là ví dụ dùng các toán tử logic:

```dart
if (!done && (col == 0 || col == 3)) {
  // ...Do something...
}
```

## Toán tử theo bit và dịch bit (Bitwise and shift operators)

Bạn có thể thao tác trên từng bit riêng lẻ của số trong Dart. Thông thường bạn sẽ dùng các
toán tử theo bit và dịch bit này với số nguyên.

| Toán tử | Ý nghĩa |
|---------|---------|
| `&` | AND |
| <code>&#124;</code> | OR |
| `^` | XOR |
| `~`*`expr`* | Phép bù theo bit một ngôi (bit 0 thành 1; bit 1 thành 0) |
| `<<` | Dịch trái |
| `>>` | Dịch phải |
| `>>>` | Dịch phải không dấu |

> **Lưu ý**
> Hành vi của các phép toán theo bit với toán hạng lớn hoặc âm có thể khác nhau giữa các
> nền tảng. Tìm hiểu thêm tại
> [Bitwise operations platform differences][] (khác biệt giữa các nền tảng).

Đây là ví dụ dùng toán tử theo bit và dịch bit:

```dart
final value = 0x22;
final bitmask = 0x0f;

assert((value & bitmask) == 0x02); // AND
assert((value & ~bitmask) == 0x20); // AND NOT
assert((value | bitmask) == 0x2f); // OR
assert((value ^ bitmask) == 0x2d); // XOR

assert((value << 4) == 0x220); // Shift left
assert((value >> 4) == 0x02); // Shift right

// Shift right example that results in different behavior on web
// because the operand value changes when masked to 32 bits:
assert((-value >> 4) == -0x03);

assert((value >>> 4) == 0x02); // Unsigned shift right
assert((-value >>> 4) > 0); // Unsigned shift right
```

> *Diễn giải:* khối chú thích ở giữa nói rằng đây là ví dụ dịch phải cho kết quả khác nhau
> trên nền tảng web, vì giá trị toán hạng bị thay đổi khi được che (mask) xuống 32 bit.

> **Lưu ý về phiên bản**
> Toán tử `>>>` (còn gọi là _triple-shift_ hay _dịch không dấu_) yêu cầu
> [phiên bản ngôn ngữ][language version] tối thiểu là 2.14.

## Biểu thức điều kiện (Conditional expressions)

Dart có hai toán tử cho phép bạn viết ngắn gọn những biểu thức mà nếu không có chúng thì
sẽ phải dùng tới câu lệnh [if-else][]:

_`condition`_ `?` _`expr1`_ `:` _`expr2`_
: Nếu _condition_ là true thì tính _expr1_ (và trả về giá trị của nó); ngược lại thì tính
  và trả về giá trị của _expr2_.

_`expr1`_ `??` _`expr2`_
: Nếu _expr1_ khác null thì trả về giá trị của nó; ngược lại thì tính và trả về giá trị
  của _expr2_.

Khi bạn cần gán một giá trị dựa trên một biểu thức boolean, hãy cân nhắc dùng toán tử điều
kiện `?` và `:`.

```dart
var visibility = isPublic ? 'public' : 'private';
```

Nếu biểu thức boolean đó chỉ để kiểm tra null, hãy cân nhắc dùng toán tử if-null `??` (còn
được gọi là toán tử null-coalescing).

```dart
String playerName(String? name) => name ?? 'Guest';
```

Ví dụ trên có thể được viết theo ít nhất hai cách khác, nhưng không cách nào súc tích bằng:

```dart
// Slightly longer version uses ?: operator.
String playerName(String? name) => name != null ? name : 'Guest';

// Very long version uses if-else statement.
String playerName(String? name) {
  if (name != null) {
    return name;
  } else {
    return 'Guest';
  }
}
```

> *Diễn giải:* cách 1 dài hơn một chút, dùng toán tử `?:`; cách 2 dài hơn hẳn, dùng câu
> lệnh if-else.

## Cú pháp cascade (Cascade notation)

Cascade (`..`, `?..`) cho phép bạn thực hiện một chuỗi thao tác trên cùng một object.
Ngoài việc truy cập các thành viên thể hiện (instance member), bạn còn có thể gọi phương
thức thể hiện trên chính object đó. Cách này thường giúp bạn khỏi phải tạo một biến tạm và
cho phép viết code mạch lạc hơn.

Hãy xem đoạn code sau:

```dart
var paint = Paint()
  ..color = Colors.black
  ..strokeCap = StrokeCap.round
  ..strokeWidth = 5.0;
```

Constructor `Paint()` trả về một object `Paint`. Phần code đi sau cú pháp cascade sẽ thao
tác trên chính object này, và bỏ qua mọi giá trị mà các thao tác đó có thể trả về.

Ví dụ trên tương đương với đoạn code này:

```dart
var paint = Paint();
paint.color = Colors.black;
paint.strokeCap = StrokeCap.round;
paint.strokeWidth = 5.0;
```

Nếu object mà cascade thao tác lên có thể là null, hãy dùng cascade dạng _null-shorting_
(`?..`) cho thao tác đầu tiên. Việc bắt đầu bằng `?..` đảm bảo rằng không thao tác cascade
nào bị thực hiện trên object null đó.

```dart
document.querySelector('#confirm') // Get an object.
  ?..textContent =
      'Confirm' // Use its members.
  ..classList.add('important')
  ..onClick.listen((e) => window.alert('Confirmed!'))
  ..scrollIntoView();
```

> *Diễn giải:* dòng đầu lấy về một object; các dòng sau sử dụng các thành viên của nó.

Đoạn code trên tương đương với:

```dart
final button = document.querySelector('#confirm');
button?.textContent = 'Confirm';
button?.classList.add('important');
button?.onClick.listen((e) => window.alert('Confirmed!'));
button?.scrollIntoView();
```

Bạn cũng có thể lồng các cascade vào nhau. Ví dụ:

```dart
final addressBook =
    (AddressBookBuilder()
          ..name = 'jenny'
          ..email = 'jenny@example.com'
          ..phone =
              (PhoneNumberBuilder()
                    ..number = '415-555-0100'
                    ..label = 'home')
                  .build())
        .build();
```

Hãy cẩn thận: chỉ dựng cascade trên một hàm thực sự trả về một object. Ví dụ, đoạn code
sau sẽ lỗi:

```dart
var sb = StringBuffer();
sb.write('foo')
  ..write('bar'); // Error: method 'write' isn't defined for 'void'.
```

> *Diễn giải:* lỗi — phương thức `write` không được định nghĩa cho kiểu `void`.

Lời gọi `sb.write()` trả về `void`, và bạn không thể dựng cascade trên `void`.

> **Lưu ý**
> Nói cho chính xác thì ký hiệu "hai dấu chấm" của cascade không phải là một toán tử. Nó
> chỉ đơn giản là một phần trong cú pháp của Dart.

## Toán tử spread (Spread operators)

Toán tử spread tính một biểu thức cho ra một collection, "mở gói" các giá trị thu được, và
chèn chúng vào một collection khác.

**Toán tử spread thực ra không phải là một biểu thức toán tử.** Cú pháp `...`/`...?` là
một phần của chính collection literal. Vì vậy, bạn có thể tìm hiểu thêm về toán tử spread
tại trang [Collections](https://dart.dev/language/collections#spread-operators).

Vì nó không phải là toán tử, cú pháp này không có "[độ ưu tiên toán tử](#operators)" nào
cả. Trên thực tế, nó có "độ ưu tiên" thấp nhất — mọi loại biểu thức đều hợp lệ khi làm
đích của phép spread, chẳng hạn:

```dart
[...a + b]
```

## Các toán tử khác (Other operators)

Bạn đã gặp hầu hết các toán tử còn lại trong những ví dụ khác:

| Toán tử | Tên | Ý nghĩa |
|---------|-----|---------|
| `()` | Gọi hàm (function application) | Biểu thị một lời gọi hàm |
| `[]` | Truy cập theo chỉ số (subscript access) | Biểu thị lời gọi tới toán tử `[]` có thể ghi đè; ví dụ: `fooList[1]` truyền số nguyên `1` cho `fooList` để truy cập phần tử tại chỉ số `1` |
| `?[]` | Truy cập theo chỉ số có điều kiện | Giống `[]`, nhưng toán hạng bên trái có thể là null; ví dụ: `fooList?[1]` truyền số nguyên `1` cho `fooList` để truy cập phần tử tại chỉ số `1`, trừ khi `fooList` là null (khi đó biểu thức có giá trị null) |
| `.` | Truy cập thành viên (member access) | Tham chiếu tới một thuộc tính của một biểu thức; ví dụ: `foo.bar` chọn thuộc tính `bar` từ biểu thức `foo` |
| `?.` | Truy cập thành viên có điều kiện | Giống `.`, nhưng toán hạng bên trái có thể là null; ví dụ: `foo?.bar` chọn thuộc tính `bar` từ biểu thức `foo`, trừ khi `foo` là null (khi đó giá trị của `foo?.bar` là null) |
| `!` | Toán tử khẳng định khác null (not-null assertion) | Ép một biểu thức về kiểu non-nullable tương ứng của nó, và ném ra ngoại lệ lúc chạy nếu phép ép kiểu thất bại; ví dụ: `foo!.bar` khẳng định `foo` khác null rồi chọn thuộc tính `bar`, trừ khi `foo` là null (khi đó một ngoại lệ lúc chạy sẽ được ném ra) |

Để biết thêm về các toán tử `.`, `?.` và `..`, xem [Classes][].

---

[operators as class members]: https://dart.dev/language/methods#operators
[Dart language specification]: https://dart.dev/resources/language/spec
[identical()]: https://api.dart.dev/dart-core/identical.html
[Operators]: https://dart.dev/language/methods#operators
[library prefixes]: https://dart.dev/language/libraries#specifying-a-library-prefix
[if-else]: https://dart.dev/language/branches#if
[language version]: https://dart.dev/language/versioning
[Classes]: https://dart.dev/language/classes
[Bitwise operations platform differences]: https://dart.dev/resources/language/number-representation#bitwise-operations

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
