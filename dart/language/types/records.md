# Records

> **Nguồn gốc:** <https://dart.dev/language/records> — *Records*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Built-in types (Kiểu dựng sẵn)](https://dart.dev/language/built-in-types) · → [Collections](https://dart.dev/language/collections)

> **Lưu ý về phiên bản**
> Record yêu cầu [phiên bản ngôn ngữ][language version] tối thiểu là 3.0.

Record là một kiểu **tổng hợp (aggregate)**, **ẩn danh** và **bất biến (immutable)**. Cũng
như các [kiểu collection][collection types] khác, record cho phép bạn gộp nhiều object vào
trong một object duy nhất. Nhưng khác với các kiểu collection khác, record có **kích thước
cố định**, **không đồng nhất về kiểu (heterogeneous)** và **được định kiểu**.

Record là những giá trị thực thụ; bạn có thể lưu chúng vào biến, lồng chúng vào nhau,
truyền vào và nhận về từ hàm, và lưu chúng trong các cấu trúc dữ liệu như list, map và set.

## Cú pháp record (Record syntax)

_Biểu thức record (record expression)_ là danh sách các trường (field) — có tên hoặc theo
vị trí — ngăn cách bởi dấu phẩy và đặt trong cặp ngoặc tròn:

```dart
var record = ('first', a: 2, b: true, 'last');
```

_Chú thích kiểu record (record type annotation)_ là danh sách các kiểu ngăn cách bởi dấu
phẩy, đặt trong cặp ngoặc tròn. Bạn có thể dùng chú thích kiểu record để định nghĩa kiểu
trả về và kiểu tham số. Ví dụ, các cụm `(int, int)` sau đây là chú thích kiểu record:

```dart
(int, int) swap((int, int) record) {
  var (a, b) = record;
  return (b, a);
}
```

Cách các trường hoạt động trong biểu thức record và trong chú thích kiểu record phản chiếu
đúng cách [tham số và đối số][parameters and arguments] hoạt động trong hàm. Trường theo
vị trí (positional field) nằm trực tiếp bên trong cặp ngoặc tròn:

```dart
// Record type annotation in a variable declaration:
(String, int) record;

// Initialize it with a record expression:
record = ('A string', 123);
```

> *Diễn giải:* dòng đầu là chú thích kiểu record trong một khai báo biến; sau đó khởi tạo
> nó bằng một biểu thức record.

Trong chú thích kiểu record, các trường có tên (named field) nằm trong một phần được bao
bởi ngoặc nhọn, gồm các cặp kiểu-và-tên, đặt sau tất cả các trường theo vị trí. Còn trong
biểu thức record, tên đứng trước mỗi giá trị trường, theo sau là dấu hai chấm:

```dart
// Record type annotation in a variable declaration:
({int a, bool b}) record;

// Initialize it with a record expression:
record = (a: 123, b: true);
```

Tên của các trường có tên trong một kiểu record là một phần của
[định nghĩa kiểu của record đó](#kiểu-record-record-types), hay còn gọi là _shape_ (hình
dạng) của nó. Hai record có các trường có tên khác nhau thì thuộc hai kiểu khác nhau:

```dart
({int a, int b}) recordAB = (a: 1, b: 2);
({int x, int y}) recordXY = (x: 3, y: 4);

// Compile error! These records don't have the same type.
// recordAB = recordXY;
```

> *Diễn giải:* dòng cuối bị comment lại vì nó gây lỗi biên dịch — hai record này không
> cùng kiểu.

Trong chú thích kiểu record, bạn cũng có thể đặt tên cho các trường *theo vị trí*, nhưng
những tên này thuần túy mang tính tài liệu và không ảnh hưởng tới kiểu của record:

```dart
(int a, int b) recordAB = (1, 2);
(int x, int y) recordXY = (3, 4);

recordAB = recordXY; // OK.
```

Điều này tương tự việc tham số theo vị trí trong
[một khai báo hàm hoặc một typedef hàm][function-type] có thể có tên, nhưng những tên đó
không ảnh hưởng tới chữ ký (signature) của hàm.

Thêm thông tin và ví dụ, xem [Kiểu record](#kiểu-record-record-types) và
[So sánh bằng giữa các record](#so-sánh-bằng-giữa-các-record-record-equality).

## Trường của record (Record fields)

Các trường của record được truy cập thông qua những getter dựng sẵn. Record là bất biến,
nên các trường không có setter.

Trường có tên cung cấp getter cùng tên. Trường theo vị trí cung cấp getter có tên dạng
`$<vị_trí>`, và việc đánh số này bỏ qua các trường có tên:

```dart
var record = ('first', a: 2, b: true, 'last');

print(record.$1); // Prints 'first'
print(record.a); // Prints 2
print(record.b); // Prints true
print(record.$2); // Prints 'last'
```

> *Diễn giải:* lần lượt in ra `first`, `2`, `true`, `last`. Lưu ý `'last'` là `$2` chứ
> không phải `$4`, vì hai trường có tên `a` và `b` không được tính vào việc đánh số vị trí.

Để việc truy cập trường của record còn gọn hơn nữa, xem trang [Patterns][pattern].

## Kiểu record (Record types)

Không có khai báo kiểu riêng cho từng kiểu record. Record được định kiểu theo **cấu trúc
(structurally typed)**, dựa trên kiểu của các trường của nó. _Shape_ của một record (tập
các trường của nó, kiểu của từng trường, và tên của chúng nếu có) là thứ xác định duy nhất
kiểu của record đó.

Mỗi trường trong record có kiểu riêng. Các trường trong cùng một record có thể mang kiểu
khác nhau. Hệ thống kiểu nhận biết được kiểu của từng trường ở bất kỳ đâu nó được truy cập
từ record:

```dart
(num, Object) pair = (42, 'a');

var first = pair.$1; // Static type `num`, runtime type `int`.
var second = pair.$2; // Static type `Object`, runtime type `String`.
```

> *Diễn giải:* `first` có kiểu tĩnh là `num`, kiểu lúc chạy là `int`; `second` có kiểu tĩnh
> là `Object`, kiểu lúc chạy là `String`.

Hãy hình dung hai thư viện hoàn toàn không liên quan đến nhau cùng tạo ra những record có
cùng một tập trường. Hệ thống kiểu hiểu rằng những record đó cùng một kiểu, dù hai thư
viện chẳng hề phụ thuộc vào nhau.

> **Mẹo**
> Dù bạn không thể khai báo một kiểu riêng cho một shape record, bạn vẫn có thể tạo bí danh
> kiểu (type alias) để code dễ đọc và dễ tái sử dụng hơn. Để biết cách làm và khi nào nên
> làm, xem [Record và typedef](#record-và-typedef-records-and-typedefs).

## So sánh bằng giữa các record (Record equality)

Hai record bằng nhau nếu chúng có cùng _shape_ (cùng tập trường), và các trường tương ứng
mang cùng giá trị. Vì _thứ tự_ của các trường có tên không thuộc về shape của record, nên
thứ tự của trường có tên không ảnh hưởng tới việc so sánh bằng.

Ví dụ:

```dart
(int x, int y, int z) point = (1, 2, 3);
(int r, int g, int b) color = (1, 2, 3);

print(point == color); // Prints 'true'.
```

```dart
({int x, int y, int z}) point = (x: 1, y: 2, z: 3);
({int r, int g, int b}) color = (r: 1, g: 2, b: 3);

print(point == color); // Prints 'false'. Lint: Equals on unrelated types.
```

> *Diễn giải:* ví dụ đầu in ra `true` (trường theo vị trí, tên chỉ mang tính tài liệu). Ví
> dụ sau in ra `false` vì tên trường thuộc về shape — đồng thời lint cảnh báo "so sánh bằng
> giữa hai kiểu không liên quan".

Record tự động định nghĩa các phương thức `hashCode` và `==` dựa trên cấu trúc các trường
của chúng.

## Trả về nhiều giá trị (Multiple returns)

Record cho phép hàm trả về nhiều giá trị gộp chung lại. Để lấy các giá trị ra từ record
được trả về, hãy [phân rã (destructure)][destructure] chúng thành các biến cục bộ bằng
[so khớp mẫu (pattern matching)][pattern].

```dart
// Returns multiple values in a record:
(String name, int age) userInfo(Map<String, dynamic> json) {
  return (json['name'] as String, json['age'] as int);
}

final json = <String, dynamic>{'name': 'Dash', 'age': 10, 'color': 'blue'};

// Destructures using a record pattern with positional fields:
var (name, age) = userInfo(json);

/* Equivalent to:
  var info = userInfo(json);
  var name = info.$1;
  var age  = info.$2;
*/
```

> *Diễn giải:* hàm trả về nhiều giá trị trong một record; sau đó phân rã bằng một record
> pattern với các trường theo vị trí. Khối comment cuối cho biết cách viết tương đương.

Bạn cũng có thể phân rã một record bằng [các trường có tên](#trường-của-record-record-fields)
của nó, dùng cú pháp dấu hai chấm `:` — chi tiết xem trang [Pattern types][]:

```dart
({String name, int age}) userInfo(Map<String, dynamic> json)
// ···
// Destructures using a record pattern with named fields:
final (:name, :age) = userInfo(json);
```

> *Diễn giải:* dòng cuối phân rã bằng một record pattern với các trường có tên.

Bạn vẫn có thể trả về nhiều giá trị từ một hàm mà không cần record, nhưng những cách khác
đều có nhược điểm. Ví dụ, tạo hẳn một lớp thì dài dòng hơn nhiều, còn dùng các kiểu
collection khác như `List` hay `Map` thì đánh mất tính an toàn kiểu.

> **Lưu ý**
> Đặc tính trả-về-nhiều-giá-trị và không-đồng-nhất-về-kiểu của record cho phép song song
> hóa các future thuộc nhiều kiểu khác nhau — bạn có thể đọc thêm trong
> [tài liệu `dart:async`][`dart:async` documentation].

## Record như một cấu trúc dữ liệu đơn giản

Record chỉ chứa dữ liệu. Khi đó là tất cả những gì bạn cần, record dùng được ngay và rất
dễ dùng, không cần phải khai báo lớp mới nào. Với một danh sách đơn giản gồm các bộ dữ liệu
(tuple) đều có cùng shape, *một list các record* chính là cách biểu diễn trực tiếp nhất.

Chẳng hạn, hãy xem danh sách "định nghĩa nút bấm" sau đây:

```dart
final buttons = [
  (
    label: "Button I",
    icon: const Icon(Icons.upload_file),
    onPressed: () => print("Action -> Button I"),
  ),
  (
    label: "Button II",
    icon: const Icon(Icons.info),
    onPressed: () => print("Action -> Button II"),
  )
];
```

Đoạn code này viết được ngay, không cần thêm bất kỳ khai báo nào khác.

### Record và typedef (Records and typedefs)

Bạn có thể chọn dùng [typedef][typedefs] để đặt tên cho chính kiểu record đó, rồi dùng tên
này thay vì phải viết ra kiểu record đầy đủ. Cách này còn cho phép bạn tuyên bố rằng một
số trường có thể null (`?`), ngay cả khi hiện tại chưa mục nào trong list mang giá trị
null.

```dart
typedef ButtonItem = ({String label, Icon icon, void Function()? onPressed});
final List<ButtonItem> buttons = [
  // ...
];
```

Vì kiểu record là kiểu cấu trúc (structural type), việc đặt một cái tên như `ButtonItem`
chỉ tạo ra một bí danh giúp bạn tham chiếu tới kiểu cấu trúc đó dễ hơn:
`({String label, Icon icon, void Function()? onPressed})`.

Việc để toàn bộ code tham chiếu tới kiểu record thông qua bí danh của nó khiến sau này bạn
dễ thay đổi phần cài đặt của record hơn, mà không phải cập nhật từng chỗ tham chiếu.

Code có thể làm việc với các định nghĩa nút bấm này giống hệt như với thể hiện của một lớp
thông thường:

```dart
List<Container> widget = [
  for (var button in buttons)
    Container(
      margin: const EdgeInsets.all(4.0),
      child: OutlinedButton.icon(
        onPressed: button.onPressed,
        icon: button.icon,
        label: Text(button.label),
      ),
    ),
];
```

Thậm chí sau này bạn có thể quyết định đổi kiểu record thành một kiểu lớp để bổ sung
phương thức:

```dart
class ButtonItem {
  final String label;
  final Icon icon;
  final void Function()? onPressed;
  ButtonItem({required this.label, required this.icon, this.onPressed});
  bool get hasOnPressed => onPressed != null;
}
```

Hoặc đổi thành một [extension type][]:

```dart
extension type ButtonItem._(({String label, Icon icon, void Function()? onPressed}) _) {
  String get label => _.label;
  Icon get icon => _.icon;
  void Function()? get onPressed => _.onPressed;
  ButtonItem({required String label, required Icon icon, void Function()? onPressed})
      : this._((label: label, icon: icon, onPressed: onPressed));
  bool get hasOnPressed => _.onPressed != null;
}
```

Và rồi tạo danh sách định nghĩa nút bấm bằng constructor của kiểu đó:

```dart
final List<ButtonItem> buttons =  [
  ButtonItem(
    label: "Button I",
    icon: const Icon(Icons.upload_file),
    onPressed: () => print("Action -> Button I"),
  ),
  ButtonItem(
    label: "Button II",
    icon: const Icon(Icons.info),
    onPressed: () => print("Action -> Button II"),
  )
];
```

Một lần nữa, tất cả những thay đổi đó đều không đòi hỏi phải sửa phần code đang sử dụng
danh sách này.

Tuy nhiên, việc thay đổi bất kỳ kiểu nào cũng đòi hỏi code dùng nó phải rất cẩn thận,
không được đưa ra giả định. Một bí danh kiểu **không** đem lại sự bảo vệ hay bảo đảm nào
cho code dùng nó rằng giá trị được đặt bí danh thực sự là một record. Extension type cũng
chỉ bảo vệ được rất ít. Chỉ có class mới cung cấp được sự trừu tượng hóa và đóng gói
(encapsulation) đầy đủ.

---

[language version]: https://dart.dev/language/versioning
[collection types]: https://dart.dev/language/collections
[pattern]: https://dart.dev/language/patterns#destructuring-multiple-returns
[`dart:async` documentation]: https://dart.dev/libraries/dart-async#handling-errors-for-multiple-futures
[parameters and arguments]: https://dart.dev/language/functions#parameters
[function-type]: https://dart.dev/language/functions#function-types
[destructure]: https://dart.dev/language/patterns#destructuring
[Pattern types]: https://dart.dev/language/pattern-types#record
[typedefs]: https://dart.dev/language/typedefs
[extension type]: https://dart.dev/language/extension-types

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
