# Collections

> **Nguồn gốc:** <https://dart.dev/language/collections> — *Collections*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Records](https://dart.dev/language/records) · → [Generics](https://dart.dev/language/generics)

Dart hỗ trợ sẵn ba loại [collection][collections]: list, set và map. Để biết thêm về cách
quy định kiểu mà collection chứa, xem [Generics][generics].

[generics]: https://dart.dev/language/generics
[collections]: https://dart.dev/libraries/dart-core#collections

## List

Có lẽ collection phổ biến nhất trong gần như mọi ngôn ngữ lập trình là *mảng (array)* —
một nhóm object có thứ tự. Trong Dart, mảng chính là object [`List`][], nên đa số mọi
người gọi luôn chúng là *list*.

List literal trong Dart được viết bằng một danh sách các phần tử ngăn cách bởi dấu phẩy,
đặt trong cặp ngoặc vuông (`[]`). Mỗi phần tử thường là một biểu thức. Đây là một list
Dart đơn giản:

```dart
var list = [1, 2, 3];
```

> **Lưu ý**
> Dart suy ra `list` có kiểu `List<int>`. Nếu bạn thử thêm object không phải số nguyên vào
> list này, analyzer hoặc runtime sẽ báo lỗi. Chi tiết xem
> [suy luận kiểu][type inference].

<a id="trailing-comma"></a>

Bạn có thể thêm dấu phẩy sau phần tử cuối cùng trong một collection literal của Dart. Dấu
_phẩy cuối (trailing comma)_ này không ảnh hưởng gì tới collection, nhưng giúp phòng tránh
lỗi copy-paste.

```dart
var list = ['Car', 'Boat', 'Plane',];
```

List đánh chỉ số từ 0, trong đó 0 là chỉ số của phần tử đầu tiên và `list.length - 1` là
chỉ số của phần tử cuối cùng. Bạn lấy độ dài của list bằng thuộc tính `.length` và truy
cập phần tử bằng toán tử chỉ số (`[]`):

```dart
var list = [1, 2, 3];
assert(list.length == 3);
assert(list[1] == 2);

list[1] = 1;
assert(list[1] == 1);
```

Để tạo một list là hằng lúc biên dịch, thêm `const` trước list literal:

```dart
var constantList = const [1, 2, 3];
// constantList[1] = 1; // This line will cause an error.
```

> *Diễn giải:* dòng bị comment sẽ gây lỗi nếu bỏ comment.

Để biết thêm về list, xem mục Lists trong
[tài liệu `dart:core`](https://dart.dev/libraries/dart-core#lists).

[`List`]: https://api.dart.dev/dart-core/List-class.html
[type inference]: https://dart.dev/language/type-system#type-inference

## Set

Set trong Dart là một collection **không có thứ tự** gồm các phần tử **duy nhất**. Dart hỗ
trợ set thông qua set literal và kiểu [`Set`][].

Đây là một set Dart đơn giản, được tạo bằng set literal:

```dart
var halogens = {'fluorine', 'chlorine', 'bromine', 'iodine', 'astatine'};
```

> **Lưu ý**
> Dart suy ra `halogens` có kiểu `Set<String>`. Nếu bạn thử thêm phần tử sai kiểu vào set,
> analyzer hoặc runtime sẽ báo lỗi. Chi tiết xem
> [suy luận kiểu](https://dart.dev/language/type-system#type-inference).

Để tạo một set rỗng, dùng `{}` có kèm đối số kiểu ở phía trước, hoặc gán `{}` cho một biến
có kiểu `Set`:

```dart
var names = <String>{};
// Set<String> names = {}; // This works, too.
// var names = {}; // Creates a map, not a set.
```

> *Diễn giải:* cách thứ hai cũng dùng được; cách thứ ba thì **tạo ra một map, không phải
> set**.

> **Lưu ý — Set hay map?**
> Cú pháp của map literal khá giống set literal. Vì map literal xuất hiện trước, nên `{}`
> mặc định mang kiểu `Map`. Nếu bạn quên chú thích kiểu cho `{}` hoặc cho biến được gán,
> Dart sẽ tạo ra một object kiểu `Map<dynamic, dynamic>`.

Thêm phần tử vào một set có sẵn bằng phương thức `add()` hoặc `addAll()`:

```dart
var elements = <String>{};
elements.add('fluorine');
elements.addAll(halogens);
```

Dùng `.length` để lấy số phần tử trong set:

```dart
var elements = <String>{};
elements.add('fluorine');
elements.addAll(halogens);
assert(elements.length == 5);
```

Để tạo một set là hằng lúc biên dịch, thêm `const` trước set literal:

```dart
final constantSet = const {
  'fluorine',
  'chlorine',
  'bromine',
  'iodine',
  'astatine',
};
// constantSet.add('helium'); // This line will cause an error.
```

> *Diễn giải:* dòng bị comment sẽ gây lỗi nếu bỏ comment.

Để biết thêm về set, xem mục Sets trong
[tài liệu `dart:core`](https://dart.dev/libraries/dart-core#sets).

[`Set`]: https://api.dart.dev/dart-core/Set-class.html

## Map

Trong một map, mỗi phần tử là một cặp khóa-giá trị (key-value). Mỗi khóa trong cặp được
gắn với một giá trị, và cả khóa lẫn giá trị đều có thể là object thuộc kiểu bất kỳ. Mỗi
khóa chỉ được xuất hiện một lần, dù cùng một giá trị có thể gắn với nhiều khóa khác nhau.
Dart hỗ trợ map thông qua map literal và kiểu [`Map`][].

Đây là vài map Dart đơn giản, được tạo bằng map literal:

```dart
var gifts = {
  // Key:    Value
  'first': 'partridge',
  'second': 'turtledoves',
  'fifth': 'golden rings',
};

var nobleGases = {2: 'helium', 10: 'neon', 18: 'argon'};
```

> **Lưu ý**
> Dart suy ra `gifts` có kiểu `Map<String, String>` và `nobleGases` có kiểu
> `Map<int, String>`. Nếu bạn thử thêm giá trị sai kiểu vào một trong hai map, analyzer
> hoặc runtime sẽ báo lỗi. Chi tiết xem [suy luận kiểu][type inference].

Bạn có thể tạo ra đúng những object đó bằng constructor `Map`:

```dart
var gifts = Map<String, String>();
gifts['first'] = 'partridge';
gifts['second'] = 'turtledoves';
gifts['fifth'] = 'golden rings';

var nobleGases = Map<int, String>();
nobleGases[2] = 'helium';
nobleGases[10] = 'neon';
nobleGases[18] = 'argon';
```

> **Lưu ý**
> Nếu bạn đến từ ngôn ngữ như C# hay Java, có thể bạn sẽ trông đợi thấy `new Map()` thay
> vì chỉ `Map()`. Trong Dart, từ khóa `new` là tùy chọn. Chi tiết xem
> [Using constructors][].

Thêm một cặp khóa-giá trị mới vào map có sẵn bằng toán tử gán theo chỉ số (`[]=`):

```dart
var gifts = {'first': 'partridge'};
gifts['fourth'] = 'calling birds'; // Add a key-value pair
```

Lấy một giá trị từ map bằng toán tử chỉ số (`[]`):

```dart
var gifts = {'first': 'partridge'};
assert(gifts['first'] == 'partridge');
```

Nếu bạn tìm một khóa không có trong map, bạn nhận về `null`:

```dart
var gifts = {'first': 'partridge'};
assert(gifts['fifth'] == null);
```

Dùng `.length` để lấy số cặp khóa-giá trị trong map:

```dart
var gifts = {'first': 'partridge'};
gifts['fourth'] = 'calling birds';
assert(gifts.length == 2);
```

Để tạo một map là hằng lúc biên dịch, thêm `const` trước map literal:

```dart
final constantMap = const {2: 'helium', 10: 'neon', 18: 'argon'};

// constantMap[2] = 'Helium'; // This line will cause an error.
```

Để biết thêm về map, xem mục Maps trong
[tài liệu `dart:core`](https://dart.dev/libraries/dart-core#maps).

[Using constructors]: https://dart.dev/language/classes#using-constructors
[`Map`]: https://api.dart.dev/dart-core/Map-class.html

<a id="collection-elements"></a>

## Phần tử của collection (Collection elements)

Một collection literal chứa một dãy các **phần tử (element)**. Tại thời điểm chạy, mỗi
phần tử được tính toán, tạo ra không hoặc nhiều giá trị, rồi những giá trị đó được chèn
vào collection kết quả. Các phần tử này chia thành hai nhóm chính: **phần tử lá (leaf
element)** và **phần tử điều khiển luồng (control flow element)**.

*   **Phần tử lá**: chèn một mục riêng lẻ vào collection literal.

    *   **Phần tử biểu thức (expression element)**: tính một biểu thức đơn và chèn giá trị
        thu được vào collection.

    *   **Phần tử map entry (map entry element)**: tính một cặp biểu thức khóa và giá trị,
        rồi chèn entry thu được vào collection.

*   **Phần tử điều khiển luồng**: thêm không hoặc nhiều giá trị vào collection bao quanh,
    một cách có điều kiện hoặc lặp đi lặp lại.

    *   **Phần tử null-aware (null-aware element)**: tính một biểu thức, và nếu kết quả
        không phải `null` thì chèn giá trị đó vào collection bao quanh.

    *   **Phần tử spread (spread element)**: duyệt qua một dãy cho trước (biểu thức
        collection) và chèn toàn bộ giá trị thu được vào collection bao quanh.

    *   **Phần tử null-aware spread**: tương tự phần tử spread, nhưng cho phép collection
        là `null` và khi đó không chèn gì cả.

    *   **Phần tử `if` (if element)**: tính một phần tử bên trong một cách có điều kiện dựa
        trên biểu thức điều kiện cho trước, và tùy chọn tính một phần tử `else` khác nếu
        điều kiện là false.

    *   **Phần tử `for` (for element)**: lặp và tính đi tính lại một phần tử bên trong cho
        trước, chèn vào không hoặc nhiều giá trị thu được.

Để tìm hiểu thêm về phần tử của collection, xem các mục dưới đây.

<a id="expression-element"></a>

### Phần tử biểu thức (Expression elements)

Phần tử biểu thức tính một biểu thức đơn và chèn giá trị thu được vào collection. Biểu
thức này có thể bao gồm nhiều dạng cấu trúc khác nhau như literal, biến, toán tử, lời gọi
hàm và lời gọi constructor.

Phần tử biểu thức có cú pháp sau trong một collection:

```dart
<expression>
```

<a id="map-entry-element"></a>

### Phần tử map entry (Map entry elements)

Phần tử map entry tính một cặp biểu thức khóa và giá trị, rồi chèn entry thu được vào
collection. Cả khóa lẫn giá trị trong cặp này đều có thể là biểu thức.

Phần tử map entry có cú pháp sau trong một collection:

```dart
<key_expression>: <value_expression>
```

<a id="null-aware-element"></a>

### Phần tử null-aware (Null-aware elements)

Phần tử null-aware tính một biểu thức, và nếu kết quả không phải `null` thì chèn giá trị
đó vào collection bao quanh.

> **Lưu ý về phiên bản**
> Phần tử collection null-aware yêu cầu [phiên bản ngôn ngữ][language version] tối thiểu
> là 3.8.

Phần tử null-aware có cú pháp sau khi nằm ở vị trí một phần tử biểu thức:

```dart
?<expression>
```

Phần tử null-aware có cú pháp sau khi nằm trong một phần tử map entry:

```dart
// key is a null-aware element
?<key_expression>: <value_expression>
```

```dart
// value is a null-aware element
<key_expression>: ?<value_expression>
```

```dart
// key and value are null-aware elements
?<key_expression>: ?<value_expression>
```

> *Diễn giải:* lần lượt là — khóa là phần tử null-aware; giá trị là phần tử null-aware; cả
> khóa lẫn giá trị đều là phần tử null-aware.

Trong ví dụ sau, kết quả của phần tử null-aware `?absentValue` không được thêm vào list
`items`, vì `absentValue` là `null`:

```dart
int? absentValue = null;
int? presentValue = 3;
var items = [
  1,
  ?absentValue,
  ?presentValue,
  absentValue,
  5,
]; // [1, 3, null, 5]
```

Ví dụ sau minh họa nhiều cách dùng phần tử null-aware bên trong phần tử map entry:

```dart
String? presentKey = 'Apple';
String? absentKey = null;

int? presentValue = 3;
int? absentValue = null;

var itemsA = {presentKey: absentValue}; // {Apple: null}
var itemsB = {presentKey: ?absentValue}; // {}

var itemsC = {absentKey: presentValue}; // {null: 3}
var itemsD = {?absentKey: presentValue}; // {}

var itemsE = {absentKey: absentValue}; // {null: null}
var itemsF = {?absentKey: ?absentValue}; // {}
```

[language version]: https://dart.dev/language/versioning

<a id="spread-element"></a>
<a id="spread-operators"></a>

### Phần tử spread (Spread elements)

Phần tử spread duyệt qua một dãy cho trước và chèn toàn bộ giá trị thu được vào collection
bao quanh.

Phần tử spread có cú pháp sau trong một collection. Biểu thức dãy có thể là bất kỳ biểu
thức nào cho ra một object hiện thực `Iterable`:

```dart
...<sequence_expression>
```

Trong ví dụ sau, các phần tử của list `a` được thêm vào list `items`:

```dart
var a = [1, 2, null, 4];
var items = [0, ...a, 5]; // [0, 1, 2, null, 4, 5]
```

Nếu bạn spread một biểu thức có thể cho ra `null` và bạn muốn bỏ qua giá trị `null` đó
(không chèn phần tử nào), hãy dùng [phần tử null-aware spread][null-aware spread element].

Để tìm hiểu thêm về toán tử spread, xem [Toán tử spread][Spread operator].

[Spread operator]: https://dart.dev/language/operators/#spread-operators
[null-aware spread element]: #null-spread-element

<a id="null-spread-element"></a>

### Phần tử null-aware spread (Null-aware spread elements)

Phần tử null-aware spread tương tự phần tử spread, nhưng cho phép collection là `null` và
khi đó không chèn gì cả.

Phần tử null-aware spread có cú pháp sau trong một collection:

```dart
...?<sequence_expression>
```

Trong ví dụ sau, list `a` bị bỏ qua vì nó là null, còn các phần tử của list `b` thì được
thêm vào list `items`. Lưu ý rằng nếu bản thân collection **không** phải `null` nhưng nó
chứa các phần tử là `null`, thì những phần tử `null` đó vẫn được thêm vào kết quả.

```dart
List<int>? a = null;
var b = [1, null, 3];
var items = [0, ...?a, ...?b, 4]; // [0, 1, null, 3, 4]
```

Do null safety, bạn không thể thực hiện phép spread (`...`) trên một giá trị có thể là
null. Ví dụ sau gây lỗi lúc biên dịch, vì tham số `extraOptions` là nullable còn toán tử
spread dùng trên `extraOptions` lại không phải loại null-aware.

```dart
List<String> buildCommandLine(
  String executable,
  List<String> options, [
  List<String>? extraOptions,
]) {
  return [
    executable,
    ...options,
    ...extraOptions, // <-- Error
  ];
}

// Usage:
//   buildCommandLine('dart', ['run', 'my_script.dart'], null);
// Result:
//   Compile-time error
```

> *Diễn giải:* cách dùng như trong comment sẽ cho ra lỗi lúc biên dịch.
> *(Đoạn code này cố tình gây lỗi phân tích tĩnh.)*

Nếu bạn muốn spread một collection nullable, hãy dùng phần tử null-aware spread. Ví dụ sau
là hợp lệ vì toán tử null-aware spread được dùng trên `extraOptions`.

```dart
List<String> buildCommandLine(
  String executable,
  List<String> options, [
  List<String>? extraOptions,
]) {
  return [
    executable,
    ...options,
    ...?extraOptions, // <-- OK now.
  ];
}

// Usage:
//   buildCommandLine('dart', ['run', 'my_script.dart'], null);
// Result:
//   [dart, run, my_script.dart]
```

Để tìm hiểu thêm về toán tử null-aware spread, xem [Toán tử spread][Spread operator].

<a id="if-element"></a>

### Phần tử `if` (If elements)

Phần tử `if` tính một phần tử bên trong một cách có điều kiện dựa trên biểu thức điều kiện
cho trước, và tùy chọn tính một phần tử `else` khác nếu điều kiện là false.

Phần tử `if` có vài biến thể cú pháp:

```dart
// If the bool expression is true, include the result.
if (<bool_expression>) <result>
```

```dart
// If the expression matches the pattern, include the result.
if (<expression> case <pattern>) <result>
```

```dart
// If the operation resolves as true, include the first
// result, otherwise, include the second result.
if (<bool_expression>) <result> else <result>
```

```dart
// If the operation resolves as true, include the first
// result, otherwise, include the second result.
if (<expression> case <pattern>) <result> else <result>
```

> *Diễn giải:* (1) nếu biểu thức bool là true thì đưa kết quả vào; (2) nếu biểu thức khớp
> với pattern thì đưa kết quả vào; (3) và (4) nếu phép kiểm tra cho ra true thì đưa kết
> quả thứ nhất vào, ngược lại đưa kết quả thứ hai vào.

Các ví dụ sau minh họa nhiều cách dùng phần tử `if` với biểu thức boolean bên trong một
collection:

```dart
var includeItem = true;
var items = [0, if (includeItem) 1, 2, 3]; // [0, 1, 2, 3]
```

```dart
var includeItem = true;
var items = [0, if (!includeItem) 1, 2, 3]; // [0, 2, 3]
```

```dart
var name = 'apple';
var items = [0, if (name == 'orange') 1 else 10, 2, 3]; // [0, 10, 2, 3]
```

```dart
var name = 'apple';
var items = [
  0,
  if (name == 'kiwi') 1 else if (name == 'pear') 10,
  2,
  3,
]; // [0, 2, 3]
```

Các ví dụ sau minh họa nhiều cách dùng phần tử `if` kèm phần `case` bên trong một
collection:

```dart
Object data = 123;
var typeInfo = [
  if (data case int i) 'Data is an integer: $i',
  if (data case String s) 'Data is a string: $s',
  if (data case bool b) 'Data is a boolean: $b',
  if (data case double d) 'Data is a double: $d',
]; // [Data is an integer: 123]
```

```dart
var word = 'hello';
var items = [
  1,
  if (word case String(length: var wordLength)) wordLength,
  3,
]; // [1, 5, 3]
```

```dart
var orderDetails = ['Apples', 12, ''];
var summary = [
  'Product: ${orderDetails[0]}',
  if (orderDetails case [_, int qty, _]) 'Quantity: $qty',
  if (orderDetails case [_, _, ''])
    'Delivery: Not Started'
  else
    'Delivery: In Progress',
]; // [Product: Apples, Quantity: 12, Delivery: Not Started]
```

Bạn có thể trộn lẫn các dạng `if` khác nhau với phần `else if`. Ví dụ:

```dart
var a = 'apple';
var b = 'orange';
var c = 'mango';
var items = [
  0,
  if (a == 'apple') 1 else if (a case 'mango') 10,
  if (b case 'pear') 2 else if (b == 'mango') 20,
  if (c case 'apple') 3 else if (c case 'mango') 30,
  4,
]; // [0, 1, 30, 4]
```

Để tìm hiểu thêm về câu lệnh điều kiện `if`, xem [câu lệnh `if`][`if` statement]. Để tìm
hiểu thêm về `if-case`, xem [câu lệnh `if-case`][`if-case` statement].

[`if` statement]: https://dart.dev/language/branches#if
[`if-case` statement]: https://dart.dev/language/branches#if-case

<a id="for-element"></a>

### Phần tử `for` (For elements)

Phần tử `for` lặp và tính đi tính lại một phần tử bên trong cho trước, chèn vào không hoặc
nhiều giá trị thu được.

Phần tử `for` có cú pháp sau trong một collection:

```dart
for (<expression> in <collection>) <result>
```

```dart
for (<initialization_clause>; <condition_clause>; <increment_clause>) <result>
```

Các ví dụ sau minh họa nhiều cách dùng phần tử `for` bên trong một collection:

```dart
var numbers = [2, 3, 4];
var items = [1, for (var n in numbers) n * n, 7]; // [1, 4, 9, 16, 7]
```

```dart
var items = [1, for (var x = 5; x > 2; x--) x, 7]; // [1, 5, 4, 3, 7]
```

```dart
var items = [1, for (var x = 2; x < 4; x++) x, 7]; // [1, 2, 3, 7]
```

Để tìm hiểu thêm về vòng lặp `for`, xem [vòng lặp `for`][`for` loops].

[`for` loops]: https://dart.dev/language/loops/#for-loops

<a id="nesting-elements"></a>

### Lồng các phần tử điều khiển luồng

Bạn có thể lồng các phần tử điều khiển luồng vào nhau. Đây là một giải pháp thay thế rất
mạnh cho *list comprehension* trong các ngôn ngữ khác.

Trong ví dụ sau, chỉ những số chẵn trong `numbers` mới được đưa vào `items`.

```dart
var numbers = [1, 2, 3, 4, 5, 6, 7];
var items = [
  0,
  for (var n in numbers)
    if (n.isEven) n,
  8,
]; // [0, 2, 4, 6, 8]
```

Việc dùng phép spread trên một collection literal ngay bên trong phần tử `if` hoặc `for`
là cách viết phổ biến và đúng phong cách Dart. Ví dụ:

```dart
var items = [
  if (condition) oneThing(),
  if (condition) ...[multiple(), things()],
]; // [oneThing, [multiple_a, multiple_b], things]
```

Bạn có thể lồng đủ mọi loại phần tử vào nhau, sâu tùy ý. Trong ví dụ sau, các phần tử `if`,
`for` và spread được lồng vào nhau trong một collection:

```dart
var nestItems = true;
var ys = [1, 2, 3, 4];
var items = [
  if (nestItems) ...[
    for (var x = 0; x < 3; x++)
      for (var y in ys)
        if (x < y) x + y * 10,
  ],
]; // [10, 20, 30, 40, 21, 31, 41, 32, 42]
```

---

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
