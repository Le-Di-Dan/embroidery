# Extension method

> **Nguồn gốc:** <https://dart.dev/language/extension-methods> — *Extension methods*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Dot shorthands](https://dart.dev/language/dot-shorthands) · → [Extension types](https://dart.dev/language/extension-types)

Extension method bổ sung chức năng cho những thư viện đã có sẵn. Có thể bạn đang dùng
extension method mà không hề hay biết. Ví dụ, khi bạn dùng tính năng gợi ý code trong IDE,
nó gợi ý cả extension method bên cạnh những phương thức thông thường.

Nếu xem video giúp bạn học tốt hơn, hãy xem phần giới thiệu tổng quan về extension method:
<https://www.youtube.com/watch?v=D3j0OSfT9ZI> — "Dart extension methods".

## Tổng quan

Khi bạn dùng API của người khác, hoặc khi bạn hiện thực một thư viện được dùng rộng rãi,
việc thay đổi API thường là bất tiện hoặc bất khả thi. Nhưng bạn vẫn có thể muốn bổ sung
thêm chức năng.

Ví dụ, hãy xem đoạn code sau, phân tích một chuỗi thành số nguyên:

```dart
int.parse('42')
```

Sẽ hay hơn — ngắn hơn và dễ dùng với công cụ hơn — nếu chức năng đó nằm trên `String`:

```dart
'42'.parseInt()
```

Để đoạn code đó chạy được, bạn có thể import một thư viện chứa một extension của lớp
`String`:

```dart
import 'string_apis.dart';

void main() {
  print('42'.parseInt()); // Use an extension method.
}
```

Extension không chỉ định nghĩa được phương thức, mà còn cả những thành viên khác như
getter, setter và toán tử. Ngoài ra, extension có thể có tên — điều này hữu ích khi xảy ra
xung đột API. Đây là cách bạn có thể hiện thực extension method `parseInt()`, dùng một
extension (tên `NumberParsing`) hoạt động trên chuỗi:

```dart
// lib/string_apis.dart
extension NumberParsing on String {
  int parseInt() {
    return int.parse(this);
  }
}
```

Mục tiếp theo mô tả cách _sử dụng_ extension method. Sau đó là các mục về cách _hiện thực_
extension method.

## Sử dụng extension method

Như mọi code Dart khác, extension method nằm trong thư viện. Bạn đã thấy cách dùng một
extension method rồi — chỉ cần import thư viện chứa nó, rồi dùng như một phương thức thông
thường:

```dart
// Import a library that contains an extension on String.
import 'string_apis.dart';

void main() {
  print('42'.padLeft(5)); // Use a String method.
  print('42'.parseInt()); // Use an extension method.
}
```

> *Diễn giải:* dòng đầu dùng phương thức sẵn có của `String`; dòng sau dùng extension
> method.

Thường thì bạn chỉ cần biết bấy nhiêu để dùng extension method. Trong lúc viết code, bạn
có thể còn cần biết extension method phụ thuộc vào kiểu tĩnh (chứ không phải `dynamic`)
như thế nào, và cách xử lý [xung đột API](#xung-đột-api-api-conflicts).

### Kiểu tĩnh và `dynamic`

Bạn **không thể** gọi extension method trên biến kiểu `dynamic`. Ví dụ, đoạn code sau gây
ra ngoại lệ lúc chạy:

```dart
dynamic d = '2';
print(d.parseInt()); // Runtime exception: NoSuchMethodError
```

Extension method **có** hoạt động tốt với cơ chế suy luận kiểu của Dart. Đoạn code sau
chạy ổn vì biến `v` được suy ra là kiểu `String`:

```dart
var v = '2';
print(v.parseInt()); // Output: 2
```

Lý do `dynamic` không hoạt động là vì extension method được phân giải dựa trên **kiểu
tĩnh** của đối tượng nhận. Vì được phân giải tĩnh, extension method nhanh ngang với việc
gọi một hàm tĩnh.

Để biết thêm về kiểu tĩnh và `dynamic`, xem
[Hệ thống kiểu của Dart](https://dart.dev/language/type-system).

<a id="api-conflicts"></a>

### Xung đột API (API conflicts)

Nếu một thành viên của extension xung đột với một interface hoặc với thành viên của
extension khác, bạn có vài lựa chọn.

Một lựa chọn là thay đổi cách bạn import extension bị xung đột, dùng `show` hoặc `hide` để
giới hạn phần API được đưa ra:

```dart
// Defines the String extension method parseInt().
import 'string_apis.dart';

// Also defines parseInt(), but hiding NumberParsing2
// hides that extension method.
import 'string_apis_2.dart' hide NumberParsing2;

void main() {
  // Uses the parseInt() defined in 'string_apis.dart'.
  print('42'.parseInt());
}
```

> *Diễn giải:* thư viện thứ hai cũng định nghĩa `parseInt()`, nhưng việc `hide`
> `NumberParsing2` sẽ ẩn luôn extension method đó đi.

Một lựa chọn khác là áp dụng extension một cách **tường minh**, khiến code trông như thể
extension là một lớp bọc:

```dart
// Both libraries define extensions on String that contain parseInt(),
// and the extensions have different names.
import 'string_apis.dart'; // Contains NumberParsing extension.
import 'string_apis_2.dart'; // Contains NumberParsing2 extension.

void main() {
  // print('42'.parseInt()); // Doesn't work.
  print(NumberParsing('42').parseInt());
  print(NumberParsing2('42').parseInt());
}
```

> *Diễn giải:* cả hai thư viện đều định nghĩa extension trên `String` có chứa `parseInt()`,
> và hai extension mang tên khác nhau. Dòng bị comment sẽ không chạy được.

Nếu cả hai extension trùng tên nhau, bạn có thể cần import kèm tiền tố:

```dart
// Both libraries define extensions named NumberParsing
// that contain the extension method parseInt(). One NumberParsing
// extension (in 'string_apis_3.dart') also defines parseNum().
import 'string_apis.dart';
import 'string_apis_3.dart' as rad;

void main() {
  // print('42'.parseInt()); // Doesn't work.

  // Use the ParseNumbers extension from string_apis.dart.
  print(NumberParsing('42').parseInt());

  // Use the ParseNumbers extension from string_apis_3.dart.
  print(rad.NumberParsing('42').parseInt());

  // Only string_apis_3.dart has parseNum().
  print('42'.parseNum());
}
```

Như ví dụ cho thấy, bạn vẫn có thể gọi extension method một cách ngầm định ngay cả khi
import kèm tiền tố. Lần duy nhất bạn cần dùng tiền tố là để tránh xung đột tên khi gọi
extension một cách tường minh.

## Hiện thực extension method

Dùng cú pháp sau để tạo một extension:

```plaintext
extension <extension name>? on <type> { // <extension-name> is optional
  (<member definition>)* // Can provide one or more <member definition>.
}
```

> *Diễn giải:* `<extension-name>` là tùy chọn; bạn có thể cung cấp một hoặc nhiều
> `<member definition>`.

Ví dụ, đây là cách bạn có thể hiện thực một extension trên lớp `String`:

```dart
// lib/string_apis.dart
extension NumberParsing on String {
  int parseInt() {
    return int.parse(this);
  }

  double parseDouble() {
    return double.parse(this);
  }

}
```

Thành viên của một extension có thể là phương thức, getter, setter hoặc toán tử. Extension
cũng có thể có trường tĩnh và phương thức hỗ trợ tĩnh. Để truy cập thành viên tĩnh từ bên
ngoài phần khai báo extension, hãy gọi chúng thông qua tên khai báo, giống như với
[biến và phương thức của lớp][class variables and methods].

[class variables and methods]: https://dart.dev/language/classes#class-variables-and-methods

### Extension không tên

Khi khai báo extension, bạn có thể lược bỏ tên. Extension không tên chỉ nhìn thấy được
trong thư viện nơi chúng được khai báo. Vì không có tên, chúng không thể được áp dụng tường
minh để xử lý [xung đột API](#xung-đột-api-api-conflicts).

```dart
extension on String {
  bool get isBlank => trim().isEmpty;
}
```

> **Lưu ý**
> Bạn chỉ có thể gọi thành viên tĩnh của một extension không tên từ bên trong chính phần
> khai báo extension đó.

## Hiện thực extension generic

Extension có thể có tham số kiểu generic. Ví dụ, đây là đoạn code mở rộng kiểu dựng sẵn
`List<T>` bằng một getter, một toán tử và một phương thức:

```dart
extension MyFancyList<T> on List<T> {
  int get doubleLength => length * 2;
  List<T> operator -() => reversed.toList();
  List<List<T>> split(int at) => [sublist(0, at), sublist(at)];
}
```

Kiểu `T` được gắn dựa trên kiểu tĩnh của list mà những phương thức đó được gọi lên.

## Tài nguyên

Để biết thêm về extension method, xem:

* [Bài viết: Dart Extension Methods Fundamentals][article]
* [Đặc tả tính năng][specification]
* [Code mẫu về extension method][sample]

---

[specification]: https://github.com/dart-lang/language/blob/main/accepted/2.7/static-extension-methods/feature-specification.md#dart-static-extension-methods-design
[article]: https://dart.dev/blog/dart-extension-method-fundamentals
[sample]: https://github.com/dart-lang/samples/tree/main/extension_methods

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
