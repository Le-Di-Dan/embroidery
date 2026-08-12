# Biến (Variables)

> **Nguồn gốc:** <https://dart.dev/language/variables> — *Variables*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Introduction (Giới thiệu)](https://dart.dev/language) · → [Operators (Toán tử)](https://dart.dev/language/operators)

Tìm hiểu về biến trong Dart.

Dưới đây là ví dụ về việc tạo một biến và khởi tạo giá trị cho nó:

```dart
var name = 'Bob';
```

Biến lưu **tham chiếu (reference)**. Biến tên `name` chứa một tham chiếu tới một object
`String` có giá trị là "Bob".

Kiểu của biến `name` được suy ra là `String`, nhưng bạn có thể đổi kiểu đó bằng cách khai
báo tường minh. Nếu một object không bị giới hạn ở một kiểu duy nhất, hãy khai báo kiểu
`Object` (hoặc `dynamic` nếu cần thiết).

```dart
Object name = 'Bob';
```

Một lựa chọn khác là khai báo tường minh đúng cái kiểu vốn sẽ được suy ra:

```dart
String name = 'Bob';
```

> **Lưu ý**
> Trang này tuân theo
> [khuyến nghị của style guide](https://dart.dev/effective-dart/design#types): dùng `var`
> thay vì chú thích kiểu (type annotation) cho biến cục bộ.

## Null safety

Ngôn ngữ Dart áp dụng **sound null safety** (null safety chặt chẽ, được đảm bảo).

Null safety ngăn chặn loại lỗi phát sinh khi vô tình truy cập vào biến đang mang giá trị
`null`. Lỗi đó gọi là **null dereference error** (lỗi truy xuất qua tham chiếu null). Lỗi
này xảy ra khi bạn truy cập một thuộc tính hoặc gọi một phương thức trên biểu thức có giá
trị là `null`. Ngoại lệ của quy tắc này là khi chính `null` cũng hỗ trợ thuộc tính hay
phương thức đó, ví dụ `toString()` hoặc `hashCode`. Với null safety, trình biên dịch Dart
phát hiện những lỗi tiềm ẩn này ngay tại thời điểm biên dịch.

Ví dụ, giả sử bạn muốn lấy giá trị tuyệt đối của một biến `int` tên `i`. Nếu `i` là
`null`, việc gọi `i.abs()` sẽ gây ra null dereference error. Ở các ngôn ngữ khác, làm vậy
có thể dẫn tới lỗi lúc chạy (runtime error). Trình biên dịch của Dart ngăn lỗi này bằng
cách cấm luôn những thao tác đó.

Null safety mang lại ba thay đổi cốt lõi:

1.  Khi bạn khai báo kiểu cho một biến, một tham số, hay một thành phần liên quan khác,
    bạn kiểm soát được việc kiểu đó có cho phép `null` hay không. Để bật khả năng nhận
    `null` (nullability), bạn thêm dấu `?` vào cuối phần khai báo kiểu.

    ```dart
    String? name  // Nullable type. Can be `null` or string.

    String name   // Non-nullable type. Cannot be `null` but can be string.
    ```

    > *Diễn giải:* dòng đầu là kiểu **nullable** — có thể là `null` hoặc là chuỗi. Dòng sau
    > là kiểu **non-nullable** — không thể là `null`, chỉ có thể là chuỗi.

2.  Bạn phải khởi tạo biến trước khi dùng. Biến nullable mặc định mang giá trị `null`, nên
    xem như đã được khởi tạo sẵn. Dart không tự đặt giá trị ban đầu cho các kiểu
    non-nullable — nó buộc bạn phải tự đặt giá trị khởi tạo. Dart không cho phép bạn quan
    sát một biến chưa được khởi tạo. Điều này ngăn bạn truy cập thuộc tính hoặc gọi phương
    thức trên một đối tượng nhận (receiver) mà kiểu của nó có thể là `null`, trong khi
    `null` lại không hỗ trợ phương thức hoặc thuộc tính được dùng.

3.  Bạn không thể truy cập thuộc tính hay gọi phương thức trên một biểu thức có kiểu
    nullable. Vẫn áp dụng ngoại lệ tương tự: trừ khi đó là thuộc tính hoặc phương thức mà
    `null` có hỗ trợ, chẳng hạn `hashCode` hay `toString()`.

Sound null safety biến những **lỗi lúc chạy (runtime error)** tiềm ẩn thành **lỗi phân
tích ngay lúc bạn đang viết code (edit-time)**. Null safety sẽ đánh dấu một biến
non-nullable khi nó rơi vào một trong hai trường hợp:

* Chưa được khởi tạo bằng một giá trị khác `null`.
* Bị gán giá trị `null`.

Cơ chế kiểm tra này cho phép bạn sửa các lỗi đó _trước khi_ triển khai ứng dụng.

## Giá trị mặc định (Default value)

Biến chưa khởi tạo mà có kiểu nullable sẽ mang giá trị ban đầu là `null`. Ngay cả biến
kiểu số cũng có giá trị ban đầu là null, bởi vì số — cũng như mọi thứ khác trong Dart —
đều là object.

```dart
int? lineCount;
assert(lineCount == null);
```

> **Lưu ý**
> Code chạy ở môi trường production sẽ bỏ qua lời gọi `assert()`. Ngược lại, trong quá
> trình phát triển, <code>assert(<em>condition</em>)</code> sẽ ném ra ngoại lệ nếu
> _condition_ là false. Chi tiết xem tại [Assert][].

Với null safety, bạn phải khởi tạo giá trị cho biến non-nullable trước khi sử dụng chúng:

```dart
int lineCount = 0;
```

Bạn không bắt buộc phải khởi tạo biến cục bộ ngay tại chỗ khai báo, nhưng bạn cần gán giá
trị cho nó trước khi dùng. Ví dụ, đoạn code sau là hợp lệ vì Dart phát hiện được rằng
`lineCount` chắc chắn khác `null` vào thời điểm nó được truyền cho `print()`:

```dart
int lineCount;

if (weLikeToCount) {
  lineCount = countLines();
} else {
  lineCount = 0;
}

print(lineCount);
```

Biến top-level và biến của lớp được khởi tạo theo cơ chế **nạp trễ (lazy)**; đoạn code
khởi tạo chỉ chạy vào lần đầu tiên biến đó được sử dụng.

## Biến `late` (Late variables)

Từ khóa bổ nghĩa `late` có hai trường hợp sử dụng:

* Khai báo một biến non-nullable nhưng được khởi tạo sau phần khai báo.
* Khởi tạo một biến theo kiểu nạp trễ (lazy).

Thông thường, cơ chế phân tích luồng điều khiển (control flow analysis) của Dart có thể
phát hiện được rằng một biến non-nullable đã được gán giá trị khác `null` trước khi dùng,
nhưng đôi khi việc phân tích thất bại. Hai trường hợp phổ biến là biến top-level và biến
thể hiện (instance variable): Dart thường không xác định được chúng đã được gán hay chưa,
nên nó không cố phân tích.

Nếu bạn chắc chắn rằng biến đã được gán trước khi dùng, nhưng Dart lại không đồng ý, bạn
có thể khắc phục lỗi bằng cách đánh dấu biến đó là `late`:

```dart
late String description;

void main() {
  description = 'Feijoada!';
  print(description);
}
```

> **Cảnh báo**
> Nếu bạn không khởi tạo một biến `late`, lỗi lúc chạy (runtime error) sẽ xảy ra khi biến
> đó được sử dụng.

Khi bạn đánh dấu một biến là `late` **và** khởi tạo nó ngay tại chỗ khai báo, thì biểu
thức khởi tạo chỉ chạy vào lần đầu tiên biến được sử dụng. Kiểu khởi tạo trễ này rất tiện
trong vài trường hợp:

* Biến có thể sẽ không cần đến, mà việc khởi tạo nó lại tốn kém.
* Bạn đang khởi tạo một biến thể hiện, và biểu thức khởi tạo của nó cần truy cập `this`.

Trong ví dụ dưới đây, nếu biến `temperature` không bao giờ được dùng, thì hàm tốn kém
`readThermometer()` sẽ không bao giờ được gọi:

```dart
// This is the program's only call to readThermometer().
late String temperature = readThermometer(); // Lazily initialized.
```

> *Diễn giải:* đây là lời gọi `readThermometer()` duy nhất trong chương trình; biến được
> khởi tạo theo cơ chế nạp trễ.

## `final` và `const`

Nếu bạn không có ý định thay đổi giá trị của một biến, hãy dùng `final` hoặc `const` — hoặc
thay cho `var`, hoặc dùng kèm với một kiểu. Biến `final` chỉ có thể được gán một lần; biến
`const` là **hằng lúc biên dịch (compile-time constant)**. (Biến `const` ngầm định cũng là
`final`.)

> **Lưu ý**
> [Biến thể hiện (instance variable)][Instance variables] có thể là `final` nhưng không
> thể là `const`.

Đây là ví dụ tạo và gán một biến `final`:

```dart
final name = 'Bob'; // Without a type annotation
final String nickname = 'Bobby';
```

> *Diễn giải:* dòng đầu không có chú thích kiểu; dòng sau khai báo kiểu tường minh.

Bạn không thể thay đổi giá trị của một biến `final`:

```dart
name = 'Alice'; // Error: a final variable can only be set once.
```

> *Diễn giải:* lỗi — biến `final` chỉ được gán đúng một lần.
> *(Đoạn code này cố tình gây lỗi phân tích tĩnh.)*

Hãy dùng `const` cho những biến mà bạn muốn nó là **hằng lúc biên dịch**. Nếu biến `const`
nằm ở cấp lớp, hãy đánh dấu nó là `static const`. Tại chỗ khai báo, bạn phải gán cho biến
một giá trị hằng lúc biên dịch — chẳng hạn một số hoặc một chuỗi ký tự (literal), một biến
`const` khác, hoặc kết quả của một phép toán số học trên các số hằng:

```dart
const bar = 1000000; // Unit of pressure (dynes/cm2)
const double atm = 1.01325 * bar; // Standard atmosphere
```

> *Diễn giải:* `bar` là đơn vị áp suất (dynes/cm²); `atm` là áp suất khí quyển tiêu chuẩn.

Từ khóa `const` không chỉ dùng để khai báo biến hằng. Bạn còn có thể dùng nó để tạo ra
_giá trị_ hằng, cũng như để khai báo những constructor _tạo ra_ giá trị hằng. Bất kỳ biến
nào cũng có thể mang một giá trị hằng.

```dart
var foo = const [];
final bar = const [];
const baz = []; // Equivalent to `const []`
```

> *Diễn giải:* `const baz = []` tương đương với `const baz = const []`.

Bạn có thể lược bỏ `const` trong biểu thức khởi tạo của một khai báo `const`, như trường
hợp `baz` ở trên. Chi tiết xem [DON'T use const redundantly][] (đừng dùng `const` một cách
thừa thãi).

Bạn có thể thay đổi tham chiếu của một biến không phải `final` và không phải `const`, kể
cả khi trước đó nó đang giữ một giá trị `const`:

```dart
foo = [1, 2, 3]; // Was const []
```

> *Diễn giải:* trước đó `foo` đang là `const []`.

Bạn không thể thay đổi giá trị của một biến `const`:

```dart
baz = [42]; // Error: Constant variables can't be assigned a value.
```

> *Diễn giải:* lỗi — không thể gán giá trị cho biến hằng.
> *(Đoạn code này cố tình gây lỗi phân tích tĩnh.)*

Bạn có thể định nghĩa hằng có sử dụng [phép kiểm tra kiểu và ép kiểu][type checks and casts]
(`is` và `as`), [`if` trong collection][collection `if`], và
[toán tử spread][spread operators] (`...` và `...?`):

```dart
const Object i = 3; // Where i is a const Object with an int value...
const list = [i as int]; // Use a typecast.
const map = {if (i is int) i: 'int'}; // Use is and collection if.
const set = {if (list is List<int>) ...list}; // ...and a spread.
```

> *Diễn giải:* `i` là một `Object` hằng mang giá trị `int`; dòng 2 dùng phép ép kiểu; dòng
> 3 dùng `is` và `if` trong collection; dòng 4 dùng thêm toán tử spread.

> **Lưu ý**
> Mặc dù một object `final` không thể bị thay thế, các trường (field) bên trong nó vẫn có
> thể thay đổi. Ngược lại, một object `const` và các trường của nó đều không thể thay đổi:
> chúng _bất biến (immutable)_.

Để biết thêm về việc dùng `const` để tạo giá trị hằng, xem [Lists][], [Maps][] và
[Classes][].

## Biến wildcard (Wildcard variables)

> **Lưu ý về phiên bản**
> Biến wildcard yêu cầu [phiên bản ngôn ngữ][language version] tối thiểu là 3.7.

Biến wildcard có tên `_` khai báo một biến cục bộ hoặc một tham số **không ràng buộc
(non-binding)** — về bản chất là một chỗ giữ chỗ (placeholder). Biểu thức khởi tạo, nếu
có, vẫn được thực thi, nhưng giá trị thì không truy cập được. Nhiều khai báo cùng tên `_`
có thể tồn tại trong cùng một namespace mà không gây lỗi trùng tên.

Các khai báo top-level hoặc các thành viên có thể ảnh hưởng tới tính riêng tư (privacy)
của thư viện thì không phải là chỗ dùng hợp lệ cho biến wildcard. Những khai báo nằm cục
bộ trong phạm vi một khối (block scope), như các ví dụ sau, thì được phép khai báo
wildcard:

* Khai báo biến cục bộ.

  ```dart
  main() {
    var _ = 1;
    int _ = 2;
  }
  ```

* Khai báo biến trong vòng lặp `for`.

  ```dart
  for (var _ in list) {}
  ```

* Tham số của mệnh đề `catch`.

  ```dart
  try {
    throw '!';
  } catch (_) {
    print('oops');
  }
  ```

* Tham số kiểu generic và tham số của kiểu hàm (function type).

  ```dart
  class T<_> {}
  void genericFunction<_>() {}

  takeGenericCallback(<_>() => true);
  ```

* Tham số của hàm.

  ```dart
  Foo(_, this._, super._, void _()) {}

  list.where((_) => true);

  void f(void g(int _, bool _)) {}

  typedef T = void Function(String _, String _);
  ```

> **Mẹo**
> Hãy bật lint [`unnecessary_underscores`][] để tìm ra những chỗ mà một biến wildcard
> không ràng buộc duy nhất `_` có thể thay thế cho quy ước cũ là dùng nhiều dấu gạch dưới
> có ràng buộc (`__`, `___`, v.v.) nhằm tránh trùng tên.

---

[Assert]: https://dart.dev/language/error-handling#assert
[Instance variables]: https://dart.dev/language/classes#instance-variables
[DON'T use const redundantly]: https://dart.dev/effective-dart/usage#dont-use-const-redundantly
[type checks and casts]: https://dart.dev/language/operators#type-test-operators
[collection `if`]: https://dart.dev/language/collections#control-flow-operators
[spread operators]: https://dart.dev/language/collections#spread-operators
[Lists]: https://dart.dev/language/collections#lists
[Maps]: https://dart.dev/language/collections#maps
[Classes]: https://dart.dev/language/classes
[language version]: https://dart.dev/language/versioning
[`unnecessary_underscores`]: https://dart.dev/tools/linter-rules/unnecessary_underscores

*Trang gốc cập nhật lần cuối ngày 2026-05-12. Trừ khi có ghi chú khác, tài liệu phản ánh
Dart 3.12.2. Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
