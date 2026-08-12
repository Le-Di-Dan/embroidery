# Extension type

> **Nguồn gốc:** <https://dart.dev/language/extension-types> — *Extension types*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Extension methods](https://dart.dev/language/extension-methods) · → [Callable objects](https://dart.dev/language/callable-objects)

Extension type là một lớp trừu tượng ở mức biên dịch, "bọc" một kiểu có sẵn bằng một
interface khác, chỉ tồn tại tĩnh. Chúng là thành phần quan trọng của
[static JS interop][], vì chúng dễ dàng thay đổi interface của một kiểu có sẵn (điều tối
quan trọng với mọi hình thức interop) mà không phải trả cái giá của một lớp bọc thực sự.

Extension type áp đặt kỷ luật lên tập các thao tác (hay interface) khả dụng với object của
kiểu nền bên dưới — kiểu nền này gọi là *representation type* (kiểu biểu diễn). Khi định
nghĩa interface của một extension type, bạn có thể chọn tái sử dụng một số thành viên của
representation type, bỏ qua một số thành viên khác, thay thế những thành viên khác nữa, và
bổ sung chức năng mới.

Ví dụ sau bọc kiểu `int` để tạo ra một extension type chỉ cho phép những thao tác có ý
nghĩa với số ID:

```dart
extension type IdNumber(int id) {
  // Wraps the 'int' type's '<' operator:
  operator <(IdNumber other) => id < other.id;
  // Doesn't declare the '+' operator, for example,
  // because addition does not make sense for ID numbers.
}

void main() {
  // Without the discipline of an extension type,
  // 'int' exposes ID numbers to unsafe operations:
  int myUnsafeId = 42424242;
  myUnsafeId = myUnsafeId + 10; // This works, but shouldn't be allowed for IDs.

  var safeId = IdNumber(42424242);
  safeId + 10; // Compile-time error: No '+' operator.
  myUnsafeId = safeId; // Compile-time error: Wrong type.
  myUnsafeId = safeId as int; // OK: Run-time cast to representation type.
  safeId < IdNumber(42424241); // OK: Uses wrapped '<' operator.
}
```

> *Diễn giải:* extension type bọc lại toán tử `<` của `int`, nhưng cố tình **không** khai
> báo toán tử `+`, vì phép cộng không có ý nghĩa với số ID. Trong `main()`: nếu không có
> kỷ luật của extension type, kiểu `int` để lộ số ID cho những thao tác không an toàn. Các
> dòng sau lần lượt là: lỗi biên dịch vì không có toán tử `+`; lỗi biên dịch vì sai kiểu;
> OK vì ép kiểu lúc chạy về representation type; OK vì dùng toán tử `<` đã được bọc.

> **Lưu ý**
> Extension type phục vụ cùng mục đích với **lớp bọc (wrapper class)**, nhưng không đòi hỏi
> tạo thêm một object lúc chạy — điều có thể tốn kém khi bạn cần bọc rất nhiều object. Vì
> extension type chỉ tồn tại tĩnh và bị biên dịch mất đi lúc chạy, chúng gần như không tốn
> chi phí gì.
>
> [**Extension method**][ext] (còn gọi tắt là "extension") là một dạng trừu tượng tĩnh
> tương tự extension type. Tuy nhiên, extension method bổ sung chức năng *trực tiếp* vào
> mọi thể hiện của kiểu nền của nó. Extension type thì khác: interface của một extension
> type *chỉ* áp dụng cho những biểu thức có kiểu tĩnh chính là extension type đó. Mặc định,
> chúng tách biệt với interface của kiểu nền.

[static JS interop]: https://dart.dev/go/next-gen-js-interop
[ext]: https://dart.dev/language/extension-methods

## Cú pháp

### Khai báo

Định nghĩa một extension type mới bằng khai báo `extension type` cùng một cái tên, theo sau
là *phần khai báo representation type* đặt trong ngoặc tròn:

```dart
extension type E(int i) {
  // Define set of operations.
}
```

Phần khai báo representation type `(int i)` cho biết kiểu nền của extension type `E` là
`int`, và tham chiếu tới *representation object* (object biểu diễn) được đặt tên là `i`.
Phần khai báo này cũng đưa vào:

- Một getter ngầm định cho representation object, với kiểu trả về chính là representation
  type: `int get i`.
- Một constructor ngầm định: `E(int i) : i = i`.

Getter biểu diễn cho phép truy cập representation object dưới kiểu nền của nó. Getter này
nằm trong phạm vi thân extension type, và bạn truy cập nó bằng tên như mọi getter khác:

- Bên trong thân extension type, dùng `i` (hoặc `this.i`).
- Bên ngoài, dùng phép trích thuộc tính `e.i` (trong đó `e` có kiểu tĩnh là extension type
  đó).

Khai báo extension type cũng có thể có [tham số kiểu][generics], y như class hay extension:

```dart
extension type E<T>(List<T> elements) {
  // ...
}
```

[generics]: https://dart.dev/language/generics

### Constructor

Bạn có thể tùy chọn khai báo [constructor][constructors] trong thân của một extension type.
Bản thân phần khai báo representation đã là một constructor ngầm định, nên mặc định nó
đóng vai trò constructor không tên của extension type. Mọi generative constructor bổ sung
không phải loại chuyển hướng đều phải khởi tạo biến thể hiện của representation object,
bằng `this.i` trong danh sách khởi tạo hoặc trong tham số hình thức.

```dart
extension type E(int i) {
  E.n(this.i);
  E.m(int j, String foo) : i = j + foo.length;
}

void main() {
  E(4); // Implicit unnamed constructor.
  E.n(3); // Named constructor.
  E.m(5, "Hello!"); // Named constructor with additional parameters.
}
```

> *Diễn giải:* lần lượt là constructor không tên ngầm định; named constructor; và named
> constructor có thêm tham số.

Hoặc bạn có thể đặt tên cho constructor khai báo representation, khi đó sẽ có chỗ trống cho
một constructor không tên trong thân:

```dart
extension type const E._(int it) {
  E(): this._(42);
  E.otherName(this.it);
}

void main2() {
  E();
  const E._(2);
  E.otherName(3);
}
```

Bạn cũng có thể ẩn hoàn toàn constructor, thay vì chỉ định nghĩa một cái mới, bằng cùng cú
pháp constructor private của class là `_`. Ví dụ, nếu bạn chỉ muốn phía người dùng dựng `E`
bằng một `String`, dù kiểu nền là `int`:

```dart
extension type E._(int i) {
  E.fromString(String foo) : i = int.parse(foo);
}
```

Bạn cũng có thể khai báo generative constructor chuyển tiếp, hoặc
[factory constructor][factory] (loại này cũng có thể chuyển tiếp tới constructor của các
extension type con).

[constructors]: https://dart.dev/language/constructors
[factory]: https://dart.dev/language/constructors#factory-constructors

### Thành viên

Khai báo thành viên trong thân extension type để định nghĩa interface của nó, y như cách
bạn làm với thành viên của class. Thành viên của extension type có thể là phương thức,
getter, setter hoặc toán tử ([biến thể hiện][instance variables] không phải
[`external`][] và [thành viên trừu tượng][abstract members] thì không được phép):

```dart
extension type NumberE(int value) {
  // Operator:
  NumberE operator +(NumberE other) =>
      NumberE(value + other.value);
  // Getter:
  NumberE get myNum => this;
  // Method:
  bool isValid() => !value.isNegative;
}
```

Thành viên interface của representation type **không** mặc nhiên là thành viên interface
của extension type ([mặc định](#transparency) là vậy). Để đưa một thành viên cụ thể của
representation type ra dùng được trên extension type, bạn phải viết một khai báo cho nó
trong phần định nghĩa extension type, như `operator +` trong `NumberE`. Bạn cũng có thể
định nghĩa những thành viên mới không liên quan gì tới representation type, như getter
`myNum` và phương thức `isValid`.

[`external`]: https://dart.dev/language/functions#external
[instance variables]: https://dart.dev/language/classes#instance-variables
[abstract members]: https://dart.dev/language/methods#abstract-methods

<a id="implements"></a>

### `implements`

Bạn có thể tùy chọn dùng mệnh đề `implements` để:

- Tạo ra quan hệ kiểu con trên một extension type, **VÀ**
- Thêm các thành viên của representation object vào interface của extension type.

Mệnh đề `implements` tạo ra một quan hệ [applicability][] (tính áp dụng được), giống như
quan hệ giữa [extension method][ext] và kiểu `on` của nó. Những thành viên áp dụng được
cho kiểu cha thì cũng áp dụng được cho kiểu con, trừ khi kiểu con có một khai báo trùng tên
thành viên đó.

Một extension type chỉ có thể `implements`:

- **Chính representation type của nó.** Việc này khiến mọi thành viên của representation
  type ngầm có sẵn trên extension type.

  ```dart
  extension type NumberI(int i)
    implements int{
    // 'NumberI' can invoke all members of 'int',
    // plus anything else it declares here.
  }
  ```

  > *Diễn giải:* `NumberI` gọi được mọi thành viên của `int`, cộng thêm bất kỳ thứ gì nó
  > khai báo ở đây.

- **Một kiểu cha của representation type.** Việc này khiến các thành viên của kiểu cha có
  sẵn, nhưng không nhất thiết toàn bộ thành viên của representation type.

  ```dart
  extension type Sequence<T>(List<T> _) implements Iterable<T> {
    // Better operations than List.
  }

  extension type Id(int _id) implements Object {
    // Makes the extension type non-nullable.
    static Id? tryParse(String source) => int.tryParse(source) as Id?;
  }
  ```

  > *Diễn giải:* ví dụ đầu cung cấp những thao tác tốt hơn `List`; ví dụ sau làm cho
  > extension type trở thành non-nullable.

- **Một extension type khác** hợp lệ trên cùng representation type. Điều này cho phép bạn
  tái sử dụng các thao tác giữa nhiều extension type (tương tự đa kế thừa).

  ```dart
  extension type const Opt<T>._(({T value})? _) {
    const factory Opt(T value) = Val<T>;
    const factory Opt.none() = Non<T>;
  }
  extension type const Val<T>._(({T value}) _) implements Opt<T> {
    const Val(T value) : this._((value: value));
    T get value => _.value;
  }
  extension type const Non<T>._(Null _) implements Opt<Never> {
    const Non() : this._(null);
  }
  ```

Đọc mục [Sử dụng](#sử-dụng-usage) để hiểu thêm về tác động của `implements` trong các tình
huống khác nhau.

[applicability]: https://github.com/dart-lang/language/blob/main/accepted/2.7/static-extension-methods/feature-specification.md#examples

<a id="redeclare"></a>

#### `@redeclare`

Việc khai báo một thành viên extension type trùng tên với thành viên của kiểu cha **không**
phải là quan hệ ghi đè (override) như giữa các class, mà là *redeclaration* (khai báo lại).
Một khai báo thành viên của extension type sẽ *thay thế hoàn toàn* thành viên cùng tên của
kiểu cha. Không thể cung cấp một bản hiện thực thay thế cho cùng một hàm.

Bạn có thể dùng annotation [`@redeclare`][] từ `package:meta` để nói với trình biên dịch
rằng bạn *cố ý* chọn dùng cùng tên với thành viên của kiểu cha. Analyzer khi đó sẽ cảnh báo
bạn nếu điều đó thực ra không đúng — chẳng hạn khi một trong hai cái tên bị gõ sai.

```dart
import 'package:meta/meta.dart';

extension type MyString(String _) implements String {
  // Replaces 'String.operator[]'.
  @redeclare
  int operator [](int index) => codeUnitAt(index);
}
```

> *Diễn giải:* đoạn này thay thế `String.operator[]`.

Bạn cũng có thể bật lint [`annotate_redeclares`][] để nhận cảnh báo khi bạn khai báo một
phương thức extension type che khuất thành viên của siêu interface mà *không* gắn
`@redeclare`.

[`@redeclare`]: https://pub.dev/documentation/meta/latest/meta/redeclare-constant.html
[`annotate_redeclares`]: https://dart.dev/tools/linter-rules/annotate_redeclares

<a id="usage"></a>

## Sử dụng

Để dùng một extension type, hãy tạo thể hiện y như với class: bằng cách gọi một
constructor:

```dart
extension type NumberE(int value) {
  NumberE operator +(NumberE other) =>
      NumberE(value + other.value);

  NumberE get next => NumberE(value + 1);
  bool isValid() => !value.isNegative;
}

void testE() {
  var num = NumberE(1);
}
```

Sau đó, bạn gọi các thành viên trên object đó y như với object của một class.

Có hai trường hợp sử dụng cốt lõi, đều hợp lệ nhưng khác nhau về bản chất, cho extension
type:

1. Cung cấp một interface **mở rộng** cho một kiểu có sẵn.
2. Cung cấp một interface **khác** cho một kiểu có sẵn.

> **Lưu ý**
> Trong mọi trường hợp, representation type của một extension type **không bao giờ** là
> kiểu con của extension type đó, nên không thể dùng representation type thay thế cho
> extension type ở nơi cần extension type.

<a id="transparency"></a>
<a id="provide-extended-interface"></a>

### 1. Cung cấp một interface *mở rộng* cho kiểu có sẵn

Khi một extension type [`implements`](#implements) chính representation type của nó, bạn
có thể coi nó là "trong suốt" (transparent), vì điều đó cho phép extension type "nhìn
thấy" kiểu nền.

Một extension type trong suốt có thể gọi mọi thành viên của representation type (những
thành viên không bị [khai báo lại](#redeclare)), cộng thêm bất kỳ thành viên phụ trợ nào
nó định nghĩa. Điều này tạo ra một interface **mở rộng** mới cho một kiểu có sẵn. Interface
mới này khả dụng với những biểu thức có kiểu tĩnh là extension type đó.

Nghĩa là bạn **có thể** gọi các thành viên của representation type (khác với extension type
[không trong suốt](#provide-different-interface)), như sau:

```dart
extension type NumberT(int value)
  implements int {
  // Doesn't explicitly declare any members of 'int'.
  NumberT get i => this;
}

void main () {
  // All OK: Transparency allows invoking `int` members on the extension type:
  var v1 = NumberT(1); // v1 type: NumberT
  int v2 = NumberT(2); // v2 type: int
  var v3 = v1.i - v1;  // v3 type: int
  var v4 = v2 + v1; // v4 type: int
  var v5 = 2 + v1; // v5 type: int
  // Error: Extension type interface is not available to representation type
  v2.i;
}
```

> *Diễn giải:* extension type này không khai báo tường minh thành viên nào của `int`. Toàn
> bộ các dòng đầu đều OK vì tính trong suốt cho phép gọi thành viên của `int` trên extension
> type. Dòng cuối gây lỗi: interface của extension type **không** khả dụng cho
> representation type.

Bạn cũng có thể tạo một extension type "gần như trong suốt", bổ sung thành viên mới và điều
chỉnh một số thành viên khác bằng cách khai báo lại tên thành viên của kiểu cha. Chẳng hạn,
việc này cho phép bạn dùng kiểu chặt hơn cho một số tham số của phương thức, hoặc dùng giá
trị mặc định khác.

Một cách tiếp cận "gần như trong suốt" khác là `implements` một kiểu vốn là kiểu cha của
representation type. Ví dụ, khi representation type là private nhưng kiểu cha của nó lại
định nghĩa phần interface thực sự quan trọng với phía người dùng.

<a id="provide-different-interface"></a>

### 2. Cung cấp một interface *khác* cho kiểu có sẵn

Một extension type **không** [trong suốt](#transparency) (tức là không
[`implements`](#implements) representation type của nó) sẽ được xử lý tĩnh như một kiểu
hoàn toàn mới, tách biệt với representation type. Bạn không gán nó cho representation type
được, và nó cũng không để lộ các thành viên của representation type.

Ví dụ, hãy lấy extension type `NumberE` mà ta đã khai báo ở mục [Sử dụng](#sử-dụng-usage):

```dart
void testE() {
  var num1 = NumberE(1);
  int num2 = NumberE(2); // Error: Can't assign 'NumberE' to 'int'.

  num1.isValid(); // OK: Extension member invocation.
  num1.isNegative(); // Error: 'NumberE' does not define 'int' member 'isNegative'.

  var sum1 = num1 + num1; // OK: 'NumberE' defines '+'.
  var diff1 = num1 - num1; // Error: 'NumberE' does not define 'int' member '-'.
  var diff2 = num1.value - 2; // OK: Can access representation object with reference.
  var sum2 = num1 + 2; // Error: Can't assign 'int' to parameter type 'NumberE'.

  List<NumberE> numbers = [
    NumberE(1),
    num1.next, // OK: 'next' getter returns type 'NumberE'.
    1, // Error: Can't assign 'int' element to list type 'NumberE'.
  ];
}
```

> *Diễn giải:* các dòng đánh dấu `Error` lần lượt là — không gán được `NumberE` cho `int`;
> `NumberE` không định nghĩa thành viên `isNegative` của `int`; `NumberE` không định nghĩa
> toán tử `-` của `int`; không gán được `int` cho tham số kiểu `NumberE`; không gán được
> phần tử `int` vào list kiểu `NumberE`. Các dòng OK là gọi thành viên của extension, dùng
> toán tử `+` mà `NumberE` có định nghĩa, và truy cập representation object qua tham chiếu
> `value`.

Bạn có thể dùng extension type theo cách này để **thay thế** interface của một kiểu có sẵn.
Điều đó cho phép bạn mô hình hóa một interface phù hợp với các ràng buộc của kiểu mới (như
ví dụ `IdNumber` ở phần mở đầu), đồng thời vẫn hưởng được hiệu năng và sự tiện lợi của một
kiểu đơn giản có sẵn như `int`.

Trường hợp sử dụng này là thứ gần nhất bạn có thể đạt tới so với mức đóng gói hoàn toàn của
một lớp bọc (nhưng thực tế thì nó chỉ là một lớp trừu tượng
[*phần nào* được bảo vệ](#cân-nhắc-về-kiểu-type-considerations)).

<a id="type-considerations"></a>

## Cân nhắc về kiểu (Type considerations)

Extension type là một cấu trúc bọc ở mức biên dịch. Tại thời điểm chạy, hoàn toàn không
còn dấu vết nào của extension type. Mọi truy vấn kiểu hay thao tác tương tự lúc chạy đều
làm việc trên representation type.

Điều này khiến extension type là một lớp trừu tượng **không an toàn**, vì lúc chạy bạn luôn
có thể tìm ra representation type và truy cập object nền.

Phép kiểm tra kiểu động (`e is T`), phép ép kiểu (`e as T`), và các truy vấn kiểu lúc chạy
khác (như `switch (e) ...` hay `if (e case ...)`) đều được tính trên representation object
nền, và kiểm tra kiểu dựa trên kiểu lúc chạy của object đó. Điều này đúng cả khi kiểu tĩnh
của `e` là một extension type, lẫn khi kiểm tra đối chiếu với một extension type
(`case MyExtensionType(): ...`).

```dart
void main() {
  var n = NumberE(1);

  // The run-time type of 'n' is the representation type 'int'.
  if (n is int) print(n); // Prints 1.

  // Can use 'int' methods on 'n' at run time.
  if (n case int x) print(x.toRadixString(10)); // Prints 1.
  switch (n) {
    case int(:var isEven): print("$n (${isEven ? "even" : "odd"})"); // Prints 1 (odd).
  }
}
```

> *Diễn giải:* kiểu lúc chạy của `n` chính là representation type `int`; lúc chạy có thể
> dùng các phương thức của `int` trên `n`.

Tương tự, kiểu tĩnh của giá trị được khớp chính là kiểu của extension type trong ví dụ
sau:

```dart
void main() {
  int i = 2;
  if (i is NumberE) print("It is"); // Prints 'It is'.
  if (i case NumberE v) print("value: ${v.value}"); // Prints 'value: 2'.
  switch (i) {
    case NumberE(:var value): print("value: $value"); // Prints 'value: 2'.
  }
}
```

Khi `i` nhận kiểu tĩnh `NumberE` nhờ một phép ép kiểu hoặc một phép so khớp pattern, `i`
vẫn trỏ tới đúng object đó, `v` cũng trỏ tới cùng object với `i`, và bản thân object không
hề thay đổi. Chỉ có kiểu tĩnh là thay đổi (và do đó những phương thức ta gọi được lên
object này cũng thay đổi). Đặc biệt, việc đổi kiểu này **không** kéo theo lời gọi
constructor nào. Nếu bạn muốn chạy một constructor (chẳng hạn để thực hiện kiểm tra hợp
lệ), bạn phải viết một lời gọi constructor tường minh (như `NumberE(i)`).

Hãy lưu tâm tới hành vi này khi dùng extension type. Luôn nhớ rằng extension type tồn tại
và có ý nghĩa tại thời điểm biên dịch, nhưng bị _xóa đi_ trong quá trình biên dịch.

Ví dụ, hãy xét một biểu thức `e` có kiểu tĩnh là extension type `E`. Giả sử representation
type của `E` là `R`. Khi đó kiểu lúc chạy của giá trị `e` là một kiểu con của `R`. Ngay cả
bản thân kiểu cũng bị xóa: `List<E>` chính xác là cùng một thứ với `List<R>` tại thời điểm
chạy.

Nói cách khác, một lớp bọc thực sự có thể đóng gói object được bọc, còn extension type chỉ
là một góc nhìn ở mức biên dịch lên object đó. Lớp bọc thực sự thì an toàn hơn, nhưng đánh
đổi lại, extension type cho bạn lựa chọn tránh được các object bọc — điều có thể cải thiện
hiệu năng đáng kể trong một số tình huống.

---

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
