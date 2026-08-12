# Generics

> **Nguồn gốc:** <https://dart.dev/language/generics> — *Generics*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Collections](https://dart.dev/language/collections) · → [Typedefs](https://dart.dev/language/typedefs)

Nếu bạn xem tài liệu API của kiểu mảng cơ bản [`List`][], bạn sẽ thấy kiểu này thực chất là
`List<E>`. Ký hiệu `<...>` đánh dấu `List` là một kiểu *generic* (hay kiểu *được tham số
hóa — parameterized*) — tức là kiểu có tham số kiểu hình thức (formal type parameter).
[Theo quy ước][By convention], hầu hết biến kiểu đều mang tên một chữ cái, chẳng hạn E, T,
S, K và V.

## Vì sao nên dùng generics?

Generics thường là điều bắt buộc để đảm bảo an toàn kiểu, nhưng lợi ích của chúng không
dừng lại ở việc giúp code chạy được:

* Khai báo kiểu generic đúng cách sẽ cho ra code được sinh tốt hơn.
* Bạn có thể dùng generics để giảm trùng lặp code.

Nếu bạn muốn một list chỉ chứa chuỗi, bạn có thể khai báo nó là `List<String>` (đọc là
"list các String"). Nhờ vậy, bạn, đồng nghiệp của bạn, và cả công cụ đều phát hiện được
rằng việc gán một giá trị không phải chuỗi vào list nhiều khả năng là một lỗi. Ví dụ:

```dart
var names = <String>[];
names.addAll(['Seth', 'Kathy', 'Lars']);
names.add(42); // Error
```

> *Diễn giải:* dòng cuối gây lỗi. *(Đoạn code này cố tình gây lỗi phân tích tĩnh.)*

Một lý do khác để dùng generics là giảm trùng lặp code. Generics cho phép bạn dùng chung
một interface và một phần cài đặt cho nhiều kiểu khác nhau, mà vẫn tận dụng được phân tích
tĩnh. Ví dụ, giả sử bạn tạo một interface để cache một object:

```dart
abstract class ObjectCache {
  Object getByKey(String key);
  void setByKey(String key, Object value);
}
```

Sau đó bạn nhận ra mình cần một phiên bản chuyên cho chuỗi của interface này, nên bạn tạo
thêm một interface nữa:

```dart
abstract class StringCache {
  String getByKey(String key);
  void setByKey(String key, String value);
}
```

Rồi ít lâu sau, bạn lại muốn một phiên bản chuyên cho số... Chắc bạn hình dung được vấn đề
rồi.

Kiểu generic giúp bạn khỏi phải tạo tất cả những interface đó. Thay vào đó, bạn tạo một
interface duy nhất nhận vào một tham số kiểu:

```dart
abstract class Cache<T> {
  T getByKey(String key);
  void setByKey(String key, T value);
}
```

Trong đoạn code này, `T` là kiểu thay thế (stand-in type). Nó là một chỗ giữ chỗ mà bạn có
thể hình dung như một kiểu sẽ được lập trình viên xác định về sau.

## Dùng collection literal

Các literal của list, set và map đều có thể được tham số hóa. Literal được tham số hóa
cũng giống hệt những literal bạn đã thấy, chỉ khác là bạn thêm
<code>&lt;<em>type</em>></code> (với list và set) hoặc
<code>&lt;<em>keyType</em>, <em>valueType</em>></code> (với map) vào trước dấu ngoặc mở.
Đây là ví dụ dùng literal có định kiểu:

```dart
var names = <String>['Seth', 'Kathy', 'Lars'];
var uniqueNames = <String>{'Seth', 'Kathy', 'Lars'};
var pages = <String, String>{
  'index.html': 'Homepage',
  'robots.txt': 'Hints for web robots',
  'humans.txt': 'We are people, not machines',
};
```

## Dùng kiểu được tham số hóa với constructor

Để chỉ định một hoặc nhiều kiểu khi dùng constructor, hãy đặt các kiểu đó trong cặp ngoặc
nhọn (`<...>`) ngay sau tên lớp. Ví dụ:

```dart
var nameSet = Set<String>.of(names);
```

Đoạn code sau tạo một `SplayTreeMap` có khóa kiểu số nguyên và giá trị kiểu `View`:

```dart
var views = SplayTreeMap<int, View>();
```

## Collection generic và kiểu mà chúng chứa

Kiểu generic trong Dart được **cụ thể hóa (reified)** — nghĩa là chúng mang theo thông tin
kiểu của mình tại thời điểm chạy. Ví dụ, bạn có thể kiểm tra kiểu của một collection:

```dart
var names = <String>[];
names.addAll(['Seth', 'Kathy', 'Lars']);
print(names is List<String>); // true
```

> **Lưu ý**
> Ngược lại, generics trong Java dùng cơ chế **xóa kiểu (erasure)**, nghĩa là tham số kiểu
> generic bị loại bỏ tại thời điểm chạy. Trong Java, bạn có thể kiểm tra một object có
> phải `List` hay không, nhưng không thể kiểm tra nó có phải `List<String>` hay không.

## Giới hạn kiểu được tham số hóa

Khi cài đặt một kiểu generic, có thể bạn muốn giới hạn những kiểu được phép truyền vào làm
đối số, sao cho đối số bắt buộc phải là kiểu con của một kiểu nhất định. Giới hạn này gọi
là **bound** (chặn). Bạn làm điều đó bằng `extends`.

Một trường hợp sử dụng phổ biến là đảm bảo một kiểu là non-nullable, bằng cách bắt nó phải
là kiểu con của `Object` (thay vì mặc định là [`Object?`][top-and-bottom]).

```dart
class Foo<T extends Object> {
  // Any type provided to Foo for T must be non-nullable.
}
```

> *Diễn giải:* mọi kiểu được truyền vào `Foo` ở vị trí `T` đều phải là non-nullable.

Bạn có thể dùng `extends` với các kiểu khác ngoài `Object`. Đây là ví dụ mở rộng từ
`SomeBaseClass`, để các thành viên của `SomeBaseClass` có thể được gọi trên object kiểu
`T`:

```dart
class Foo<T extends SomeBaseClass> {
  // Implementation goes here...
  String toString() => "Instance of 'Foo<$T>'";
}

class Extender extends SomeBaseClass {
  ...
}
```

Dùng `SomeBaseClass` hoặc bất kỳ kiểu con nào của nó làm đối số generic đều hợp lệ:

```dart
var someBaseClassFoo = Foo<SomeBaseClass>();
var extenderFoo = Foo<Extender>();
```

Không truyền đối số generic nào cũng hợp lệ:

```dart
var foo = Foo();
print(foo); // Instance of 'Foo<SomeBaseClass>'
```

Còn nếu chỉ định một kiểu không phải `SomeBaseClass` thì sẽ gây lỗi:

```dart
var foo = Foo<Object>();
```

> *(Đoạn code này cố tình gây lỗi phân tích tĩnh.)*

### Giới hạn tham số kiểu tự tham chiếu (F-bounds)

Khi dùng bound để giới hạn kiểu tham số, bạn có thể để bound tham chiếu ngược lại chính
tham số kiểu đó. Việc này tạo ra một ràng buộc tự tham chiếu, hay còn gọi là **F-bound**.
Ví dụ:

```dart
abstract interface class Comparable<T> {
  int compareTo(T o);
}

int compareAndOffset<T extends Comparable<T>>(T t1, T t2) =>
    t1.compareTo(t2) + 1;

class A implements Comparable<A> {
  @override
  int compareTo(A other) => /*...implementation...*/ 0;
}

int useIt = compareAndOffset(A(), A());
```

F-bound `T extends Comparable<T>` có nghĩa là `T` phải so sánh được với chính nó. Vì vậy,
`A` chỉ có thể được so sánh với các thể hiện khác cùng kiểu.

## Dùng phương thức generic

Phương thức và hàm cũng cho phép nhận đối số kiểu:

```dart
T first<T>(List<T> ts) {
  // Do some initial work or error checking, then...
  T tmp = ts[0];
  // Do some additional checking or processing...
  return tmp;
}
```

> *Diễn giải:* làm một số việc chuẩn bị hoặc kiểm tra lỗi ban đầu, rồi lấy phần tử đầu
> tiên, kiểm tra/xử lý thêm, sau đó trả về.

Ở đây tham số kiểu generic của `first` (`<T>`) cho phép bạn dùng đối số kiểu `T` ở nhiều
vị trí:

* Trong kiểu trả về của hàm (`T`).
* Trong kiểu của một đối số (`List<T>`).
* Trong kiểu của một biến cục bộ (`T tmp`).

---

[`List`]: https://api.dart.dev/dart-core/List-class.html
[By convention]: https://dart.dev/effective-dart/design#do-follow-existing-mnemonic-conventions-when-naming-type-parameters
[top-and-bottom]: https://dart.dev/null-safety/understanding-null-safety#top-and-bottom

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
