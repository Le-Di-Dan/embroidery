# Hàm (Functions)

> **Nguồn gốc:** <https://dart.dev/language/functions> — *Functions*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Error handling (Xử lý lỗi)](https://dart.dev/language/error-handling) · → [Metadata](https://dart.dev/language/metadata)

Dart là một ngôn ngữ hướng đối tượng thực thụ, nên ngay cả hàm cũng là object và có kiểu
riêng: [Function][Function API reference]. Điều này nghĩa là hàm có thể được gán cho biến
hoặc truyền làm đối số cho hàm khác. Bạn cũng có thể gọi một thể hiện của lớp Dart như thể
nó là một hàm — chi tiết xem [Callable objects][].

Đây là ví dụ về việc cài đặt một hàm:

```dart
bool isNoble(int atomicNumber) {
  return _nobleGases[atomicNumber] != null;
}
```

Mặc dù Effective Dart khuyến nghị
[chú thích kiểu cho API công khai][type annotations for public APIs], hàm vẫn hoạt động
được nếu bạn lược bỏ các kiểu:

```dart
isNoble(atomicNumber) {
  return _nobleGases[atomicNumber] != null;
}
```

Với những hàm chỉ chứa một biểu thức duy nhất, bạn có thể dùng cú pháp rút gọn:

```dart
bool isNoble(int atomicNumber) => _nobleGases[atomicNumber] != null;
```

Cú pháp <code>=> <em>expr</em></code> là dạng viết tắt của
<code>{ return <em>expr</em>; }</code>. Ký hiệu `=>` đôi khi được gọi là cú pháp _arrow_
(mũi tên).

> **Lưu ý**
> Chỉ có _biểu thức_ mới được phép nằm giữa dấu mũi tên (`=>`) và dấu chấm phẩy (`;`).
> Biểu thức thì cho ra giá trị. Điều này nghĩa là bạn không thể viết một câu lệnh ở chỗ mà
> Dart mong đợi một giá trị. Ví dụ, bạn có thể dùng
> [biểu thức điều kiện][conditional expression] nhưng không dùng được
> [câu lệnh if][if statement]. Trong ví dụ trên,
> `_nobleGases[atomicNumber] != null;` trả về một giá trị boolean. Hàm khi đó trả về một
> giá trị boolean cho biết `atomicNumber` có nằm trong dải khí hiếm hay không.

## Tham số (Parameters)

Một hàm có thể có bao nhiêu tham số _bắt buộc theo vị trí (required positional)_ cũng
được. Sau chúng có thể là tham số _có tên (named)_ hoặc tham số _tùy chọn theo vị trí
(optional positional)_ — nhưng không được có cả hai.

> **Lưu ý**
> Một số API — đáng chú ý là các constructor widget của [Flutter][] — chỉ dùng tham số có
> tên, kể cả với những tham số bắt buộc. Xem mục kế tiếp để biết chi tiết.

Bạn có thể dùng [dấu phẩy cuối][trailing commas] khi truyền đối số cho hàm hoặc khi định
nghĩa tham số của hàm.

### Tham số có tên (Named parameters)

Tham số có tên là tùy chọn, trừ khi chúng được đánh dấu tường minh là `required`.

Khi định nghĩa hàm, dùng <code>{<em>param1</em>, <em>param2</em>, …}</code> để khai báo
tham số có tên. Nếu bạn không cung cấp giá trị mặc định và cũng không đánh dấu tham số có
tên là `required`, thì kiểu của chúng phải là nullable, vì giá trị mặc định của chúng sẽ
là `null`:

```dart
/// Sets the [bold] and [hidden] flags ...
void enableFlags({bool? bold, bool? hidden}) {
  ...
}
```

> *Diễn giải:* đặt các cờ `[bold]` và `[hidden]`...

Khi gọi hàm, bạn có thể chỉ định đối số có tên bằng cú pháp
<code><em>paramName</em>: <em>value</em></code>. Ví dụ:

```dart
enableFlags(bold: true, hidden: false);
```

<a id="default-parameters"></a>

Để định nghĩa giá trị mặc định khác `null` cho một tham số có tên, hãy dùng `=` để chỉ
định giá trị mặc định. Giá trị này phải là hằng lúc biên dịch. Ví dụ:

```dart
/// Sets the [bold] and [hidden] flags ...
void enableFlags({bool bold = false, bool hidden = false}) {
  ...
}

// bold will be true; hidden will be false.
enableFlags(bold: true);
```

> *Diễn giải:* `bold` sẽ là true; `hidden` sẽ là false.

Còn nếu bạn muốn một tham số có tên trở thành bắt buộc — buộc bên gọi phải cung cấp giá
trị cho tham số đó — hãy chú thích chúng bằng `required`:

```dart
const Scrollbar({super.key, required Widget child});
```

Nếu ai đó thử tạo một `Scrollbar` mà không truyền đối số `child`, analyzer sẽ báo lỗi.

> **Lưu ý**
> Một tham số được đánh dấu `required` vẫn có thể là nullable:
>
> ```dart
> const Scrollbar({super.key, required Widget? child});
> ```

Có thể bạn muốn đặt các đối số theo vị trí lên trước, nhưng Dart không bắt buộc điều đó.
Dart cho phép đặt đối số có tên ở bất kỳ đâu trong danh sách đối số, tùy theo cái nào phù
hợp với API của bạn:

```dart
repeat(times: 2, () {
  ...
});
```

### Tham số tùy chọn theo vị trí (Optional positional parameters)

Bọc một nhóm tham số của hàm trong cặp `[]` sẽ đánh dấu chúng là tham số tùy chọn theo vị
trí. Nếu bạn không cung cấp giá trị mặc định, kiểu của chúng phải là nullable, vì giá trị
mặc định sẽ là `null`:

```dart
String say(String from, String msg, [String? device]) {
  var result = '$from says $msg';
  if (device != null) {
    result = '$result with a $device';
  }
  return result;
}
```

Đây là ví dụ gọi hàm này mà không truyền tham số tùy chọn:

```dart
assert(say('Bob', 'Howdy') == 'Bob says Howdy');
```

Và đây là ví dụ gọi hàm này kèm tham số thứ ba:

```dart
assert(
  say('Bob', 'Howdy', 'smoke signal') ==
      'Bob says Howdy with a smoke signal',
);
```

Để định nghĩa giá trị mặc định khác `null` cho một tham số tùy chọn theo vị trí, hãy dùng
`=` để chỉ định giá trị mặc định. Giá trị này phải là hằng lúc biên dịch. Ví dụ:

```dart
String say(String from, String msg, [String device = 'carrier pigeon']) {
  var result = '$from says $msg with a $device';
  return result;
}

assert(say('Bob', 'Howdy') == 'Bob says Howdy with a carrier pigeon');
```

<a id="the-main-function"></a>

### Từ khóa bổ nghĩa cho tham số (Parameter modifiers)

Từ Dart 3.13 trở đi, bạn không thể dùng các từ khóa bổ nghĩa như `final` hay `var` cho
tham số hàm thông thường. Những từ khóa này giờ được dành riêng cho
[primary constructor][primary constructors] để khai báo trường thể hiện.

Nếu bạn muốn buộc tham số hàm phải bất biến, hãy dùng lint như
[`parameter_assignments`][] thay vì từ khóa `final` trong chữ ký hàm.

<a id="main"></a>

## Hàm `main()`

Mọi ứng dụng đều phải có một hàm `main()` ở cấp top-level, đóng vai trò điểm vào
(entrypoint) của ứng dụng. Hàm `main()` trả về `void` và có một tham số `List<String>` tùy
chọn dùng cho các đối số.

Đây là một hàm `main()` đơn giản:

```dart
void main() {
  print('Hello, World!');
}
```

Còn đây là ví dụ về hàm `main()` cho một ứng dụng dòng lệnh có nhận đối số:

```dart
// args.dart
// Run the app like this: dart run args.dart 1 test
void main(List<String> arguments) {
  print(arguments);

  assert(arguments.length == 2);
  assert(int.parse(arguments[0]) == 1);
  assert(arguments[1] == 'test');
}
```

> *Diễn giải:* chạy ứng dụng bằng lệnh `dart run args.dart 1 test`.

Bạn có thể dùng [thư viện args](https://pub.dev/packages/args) để định nghĩa và phân tích
đối số dòng lệnh.

## Hàm là object hạng nhất (first-class)

Bạn có thể truyền một hàm làm tham số cho hàm khác. Ví dụ:

```dart
void printElement(int element) {
  print(element);
}

var list = [1, 2, 3];

// Pass printElement as a parameter.
list.forEach(printElement);
```

Bạn cũng có thể gán một hàm cho biến, chẳng hạn:

```dart
var loudify = (msg) => '!!! ${msg.toUpperCase()} !!!';
assert(loudify('hello') == '!!! HELLO !!!');
```

Ví dụ này dùng một hàm ẩn danh. Sẽ nói kỹ hơn về chúng trong mục kế tiếp.

<a id="function-types"></a>

## Kiểu hàm (Function types)

Bạn có thể khai báo kiểu của một hàm — thứ này gọi là _kiểu hàm (function type)_. Kiểu hàm
được tạo ra từ phần đầu (header) của khai báo hàm, bằng cách thay tên hàm bằng từ khóa
`Function`. Hơn nữa, bạn được phép lược bỏ tên của tham số theo vị trí, nhưng tên của tham
số có tên thì không thể lược bỏ. Ví dụ:

```dart
void greet(String name, {String greeting = 'Hello'}) =>
    print('$greeting $name!');

// Store `greet` in a variable and call it.
void Function(String, {String greeting}) g = greet;
g('Dash', greeting: 'Howdy');
```

> *Diễn giải:* lưu `greet` vào một biến rồi gọi nó.

> **Lưu ý**
> Trong Dart, hàm là object hạng nhất — nghĩa là chúng có thể được gán cho biến, truyền
> làm đối số, và được trả về từ hàm khác.
>
> Bạn có thể dùng khai báo [`typedef`][] để đặt tên tường minh cho kiểu hàm, giúp code rõ
> ràng và dễ tái sử dụng hơn.

[`typedef`]: https://dart.dev/language/typedefs

## Hàm ẩn danh (Anonymous functions)

Dù phần lớn hàm đều có tên, như `main()` hay `printElement()`, bạn cũng có thể tạo hàm
không tên. Những hàm này được gọi là _hàm ẩn danh (anonymous function)_, _lambda_, hoặc
_closure_.

Hàm ẩn danh trông giống hàm có tên ở chỗ nó có:

- Không hoặc nhiều tham số, ngăn cách bởi dấu phẩy
- Chú thích kiểu tùy chọn, đặt trong cặp ngoặc tròn.

Khối code theo sau chứa thân hàm:

```dart
([[Type] param1[, ...]]) {
  codeBlock;
}
```

Ví dụ sau định nghĩa một hàm ẩn danh với tham số không định kiểu là `item`. Hàm ẩn danh
này được truyền cho hàm `map`. Hàm `map` được gọi cho từng phần tử trong list, chuyển mỗi
chuỗi thành chữ in hoa. Sau đó, hàm ẩn danh được truyền cho `forEach` sẽ in ra từng chuỗi
đã chuyển đổi kèm độ dài của nó.

```dart
const list = ['apples', 'bananas', 'oranges'];

var uppercaseList = list.map((item) {
  return item.toUpperCase();
}).toList();
// Convert to list after mapping

for (var item in uppercaseList) {
  print('$item: ${item.length}');
}
```

> *Diễn giải:* chuyển sang list sau khi map xong.

Trên trang gốc, bạn có thể bấm **Run** để chạy đoạn code sau ngay trong DartPad:

```dart
void main() {
  const list = ['apples', 'bananas', 'oranges'];

  var uppercaseList = list.map((item) {
    return item.toUpperCase();
  }).toList();
  // Convert to list after mapping

  for (var item in uppercaseList) {
    print('$item: ${item.length}');
  }
}
```

Nếu hàm chỉ chứa một biểu thức hoặc một câu lệnh `return` duy nhất, bạn có thể rút gọn nó
bằng cú pháp arrow. Dán dòng sau vào DartPad rồi bấm **Run** để kiểm chứng rằng nó tương
đương về mặt chức năng.

```dart
var uppercaseList = list.map((item) => item.toUpperCase()).toList();
uppercaseList.forEach((item) => print('$item: ${item.length}'));
```

## Phạm vi từ vựng (Lexical scope)

Dart xác định phạm vi của biến dựa trên cách bố trí code. Một ngôn ngữ lập trình có đặc
tính này được gọi là ngôn ngữ có phạm vi từ vựng (lexically scoped language). Bạn có thể
"đi theo các dấu ngoặc nhọn hướng ra ngoài" để xem một biến có nằm trong phạm vi hay
không.

**Ví dụ:** Một chuỗi hàm lồng nhau với các biến ở từng cấp phạm vi:

```dart
bool topLevel = true;

void main() {
  var insideMain = true;

  void myFunction() {
    var insideFunction = true;

    void nestedFunction() {
      var insideNestedFunction = true;

      assert(topLevel);
      assert(insideMain);
      assert(insideFunction);
      assert(insideNestedFunction);
    }
  }
}
```

Phương thức `nestedFunction()` có thể dùng biến từ mọi cấp, lên tới tận cấp top-level.

## Closure từ vựng (Lexical closures)

Một object hàm có thể truy cập các biến trong phạm vi từ vựng của nó ngay cả khi hàm đó
nằm bên ngoài phạm vi ấy thì được gọi là _closure_.

Hàm có thể "bao lấy" (close over) những biến được định nghĩa ở các phạm vi bao quanh.
Trong ví dụ sau, `makeAdder()` bắt lấy biến `addBy`. Hàm được trả về đi tới đâu, nó vẫn
nhớ `addBy` tới đó.

```dart
/// Returns a function that adds [addBy] to the
/// function's argument.
Function makeAdder(int addBy) {
  return (int i) => addBy + i;
}

void main() {
  // Create a function that adds 2.
  var add2 = makeAdder(2);

  // Create a function that adds 4.
  var add4 = makeAdder(4);

  assert(add2(3) == 5);
  assert(add4(3) == 7);
}
```

> *Diễn giải:* `makeAdder` trả về một hàm cộng `[addBy]` vào đối số của nó; sau đó tạo ra
> một hàm cộng 2 và một hàm cộng 4.

## Tear-off

Khi bạn tham chiếu tới một hàm, phương thức hay constructor có tên mà **không** kèm cặp
ngoặc tròn, Dart tạo ra một _tear-off_. Đó là một closure nhận đúng những tham số như hàm
gốc, và gọi hàm gốc khi bạn gọi nó. Nếu code của bạn cần một closure chỉ để gọi một hàm có
tên với đúng những tham số mà closure nhận vào, đừng bọc lời gọi đó trong một lambda — hãy
dùng tear-off.

```dart
var charCodes = [68, 97, 114, 116];
var buffer = StringBuffer();
```

**Nên viết:**

```dart
// Function tear-off
charCodes.forEach(print);

// Method tear-off
charCodes.forEach(buffer.write);
```

**Không nên viết:**

```dart
// Function lambda
charCodes.forEach((code) {
  print(code);
});

// Method lambda
charCodes.forEach((code) {
  buffer.write(code);
});
```

## Kiểm tra sự bằng nhau giữa các hàm

Đây là ví dụ kiểm tra sự bằng nhau giữa hàm top-level, phương thức tĩnh và phương thức thể
hiện:

```dart
void foo() {} // A top-level function

class A {
  static void bar() {} // A static method
  void baz() {} // An instance method
}

void main() {
  Function x;

  // Comparing top-level functions.
  x = foo;
  assert(foo == x);

  // Comparing static methods.
  x = A.bar;
  assert(A.bar == x);

  // Comparing instance methods.
  var v = A(); // Instance #1 of A
  var w = A(); // Instance #2 of A
  var y = w;
  x = w.baz;

  // These closures refer to the same instance (#2),
  // so they're equal.
  assert(y.baz == x);

  // These closures refer to different instances,
  // so they're unequal.
  assert(v.baz != w.baz);
}
```

> *Diễn giải:* hai closure cuối cùng — `y.baz` và `x` trỏ tới **cùng một thể hiện** (#2)
> nên chúng bằng nhau; còn `v.baz` và `w.baz` trỏ tới hai thể hiện khác nhau nên không
> bằng nhau.

<a id="return-values"></a>

## Giá trị trả về (Return values)

Mọi hàm đều trả về một giá trị. Nếu không có giá trị trả về nào được chỉ định, câu lệnh
`return null;` sẽ được ngầm thêm vào cuối thân hàm.

```dart
foo() {}

assert(foo() == null);
```

Để trả về nhiều giá trị trong một hàm, hãy gộp các giá trị vào một [record][].

```dart
(String, int) foo() {
  return ('something', 42);
}
```

[record]: https://dart.dev/language/records#multiple-returns

## Getter và setter

Mọi phép truy cập thuộc tính (top-level, tĩnh, hay thể hiện) đều là một lời gọi getter
hoặc setter. Một biến ngầm tạo ra một getter, và nếu nó có thể thay đổi được thì tạo thêm
một setter. Đó là lý do khi bạn truy cập một thuộc tính, thực chất bạn đang gọi một hàm
nhỏ ở phía sau. Đọc một thuộc tính là gọi hàm getter, ghi vào nó là gọi hàm setter — kể cả
khi thuộc tính đó được khai báo dưới dạng một biến.

Tuy nhiên, bạn cũng có thể khai báo getter và setter một cách tường minh bằng từ khóa `get`
và `set`. Cách này cho phép giá trị của thuộc tính được tính toán vào lúc nó được đọc hoặc
ghi.

Mục đích của việc dùng getter và setter là tạo ra ranh giới rõ ràng giữa **bên sử dụng**
(code dùng thuộc tính) và **bên cung cấp** (lớp hoặc thư viện định nghĩa thuộc tính đó).
Bên sử dụng chỉ việc yêu cầu hoặc đặt một giá trị, mà không cần biết giá trị đó được lưu
trong một biến đơn giản hay được tính toán ngay tại chỗ. Điều này cho bên cung cấp sự tự
do thay đổi cách thuộc tính hoạt động.

Ví dụ, vì giá trị của thuộc tính có thể chẳng được lưu ở đâu cả, nó có thể được tính lại
mỗi lần getter được gọi. Một ví dụ khác là khi giá trị được lưu trong một biến private, và
việc truy cập công khai chỉ được phép thông qua getter hoặc setter.

Ví dụ sau minh họa điều đó: getter và setter `secret` cung cấp quyền truy cập gián tiếp
tới biến private `_secret`, kèm theo những xử lý riêng trên giá trị được gán vào và lấy
ra.

```dart
// Defines a variable `_secret` that is private to the library since
// its identifier starts with an underscore (`_`).
String _secret = 'Hello';

// A public top-level getter that
// provides read access to [_secret].
String get secret {
  print('Getter was used!');
  return _secret.toUpperCase();
}

// A public top-level setter that
// provides write access to [_secret].
set secret(String newMessage) {
  print('Setter was used!');
  if (newMessage.isNotEmpty) {
    _secret = newMessage;
    print('New secret: "$newMessage"');
  }
}

void main() {
  // Reading the value calls the getter.
  print('Current message: $secret');

  /*
  Output:
  Getter was used!
  Current message: HELLO
  */

  // Assigning a value calls the setter.
  secret = 'Dart is fun';

  // Reading it again calls the getter to show the new computed value
  print('New message: $secret');

  /*
  Output:
  Setter was used! New secret: "Dart is fun"
  Getter was used!
  New message: DART IS FUN
  */
}
```

> *Diễn giải:* biến `_secret` là private trong phạm vi thư viện vì tên nó bắt đầu bằng dấu
> gạch dưới. Getter công khai cho quyền đọc, setter công khai cho quyền ghi. Trong `main()`,
> việc đọc giá trị gọi getter, việc gán giá trị gọi setter — các khối comment cho thấy kết
> quả xuất ra tương ứng.

<a id="generators"></a>

## Generator

Khi bạn cần sinh ra một dãy giá trị theo kiểu nạp trễ (lazily), hãy cân nhắc dùng _hàm
generator_. Dart hỗ trợ sẵn hai loại hàm generator:

- Generator **đồng bộ**: Trả về một object [`Iterable`].
- Generator **bất đồng bộ**: Trả về một object [`Stream`].

Để cài đặt một hàm generator **đồng bộ**, hãy đánh dấu thân hàm bằng `sync*`, và dùng câu
lệnh `yield` để phát ra giá trị:

```dart
Iterable<int> naturalsTo(int n) sync* {
  int k = 0;
  while (k < n) yield k++;
}
```

Để cài đặt một hàm generator **bất đồng bộ**, hãy đánh dấu thân hàm bằng `async*`, và dùng
câu lệnh `yield` để phát ra giá trị:

```dart
Stream<int> asynchronousNaturalsTo(int n) async* {
  int k = 0;
  while (k < n) yield k++;
}
```

Nếu generator của bạn có tính đệ quy, bạn có thể cải thiện hiệu năng của nó bằng `yield*`:

```dart
Iterable<int> naturalsDownFrom(int n) sync* {
  if (n > 0) {
    yield n;
    yield* naturalsDownFrom(n - 1);
  }
}
```

[`Iterable`]: https://api.dart.dev/dart-core/Iterable-class.html
[`Stream`]: https://api.dart.dev/dart-async/Stream-class.html

<a id="external"></a>

## Hàm external

Hàm external là hàm có phần thân được cài đặt tách rời khỏi phần khai báo của nó. Hãy thêm
từ khóa `external` trước khai báo hàm, như sau:

```dart
external void someFunc(int i);
```

Phần cài đặt của một hàm external có thể đến từ một thư viện Dart khác, hoặc phổ biến hơn
là từ một ngôn ngữ khác. Trong bối cảnh interop (liên thông ngôn ngữ), `external` đưa
thông tin kiểu vào cho các hàm hoặc giá trị ngoại lai, giúp chúng dùng được trong Dart.
Việc cài đặt và sử dụng phụ thuộc rất nhiều vào nền tảng, nên hãy xem tài liệu interop
tương ứng, ví dụ với [C][] hay [JavaScript][], để biết thêm.

Hàm external có thể là hàm top-level, [phương thức thể hiện][instance methods], getter
hoặc setter, hoặc [constructor không chuyển tiếp][non-redirecting constructors]. Một
[biến thể hiện][instance variable] cũng có thể là `external`, và điều đó tương đương với
một getter external cùng (nếu biến không phải `final`) một setter external.

---

[instance methods]: https://dart.dev/language/methods#instance-methods
[non-redirecting constructors]: https://dart.dev/language/constructors#redirecting-constructors
[instance variable]: https://dart.dev/language/classes#instance-variables
[C]: https://dart.dev/interop/c-interop
[JavaScript]: https://dart.dev/interop/js-interop
[Function API reference]: https://api.dart.dev/dart-core/Function-class.html
[Callable objects]: https://dart.dev/language/callable-objects
[type annotations for public APIs]: https://dart.dev/effective-dart/design#do-type-annotate-fields-and-top-level-variables-if-the-type-isnt-obvious
[if statement]: https://dart.dev/language/branches#if
[conditional expression]: https://dart.dev/language/operators#conditional-expressions
[Flutter]: https://flutter.dev
[trailing commas]: https://dart.dev/language/collections#lists
[primary constructors]: https://dart.dev/language/primary-constructors
[`parameter_assignments`]: https://dart.dev/tools/linter-rules/parameter_assignments

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
