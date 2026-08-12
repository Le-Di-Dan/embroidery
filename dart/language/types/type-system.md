# Hệ thống kiểu của Dart (The Dart type system)

> **Nguồn gốc:** <https://dart.dev/language/type-system> — *The Dart type system*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Typedefs](https://dart.dev/language/typedefs) · → [Patterns](https://dart.dev/language/patterns)

Ngôn ngữ Dart an toàn kiểu (type safe): nó kết hợp **kiểm tra kiểu tĩnh** và
[**kiểm tra lúc chạy**](#kiểm-tra-lúc-chạy-runtime-checks) để đảm bảo giá trị của một biến
luôn khớp với kiểu tĩnh của biến đó — điều này đôi khi được gọi là **sound typing** (định
kiểu chặt chẽ, được bảo đảm). Mặc dù _kiểu_ là bắt buộc, _chú thích kiểu_ lại là tùy chọn,
nhờ có [suy luận kiểu](#suy-luận-kiểu-type-inference).

Một lợi ích của kiểm tra kiểu tĩnh là khả năng tìm ra bug ngay lúc biên dịch, bằng
[static analyzer của Dart][analysis].

Bạn có thể sửa hầu hết lỗi phân tích tĩnh bằng cách thêm chú thích kiểu cho các lớp
generic. Những lớp generic phổ biến nhất là các kiểu collection `List<T>` và `Map<K,V>`.

Ví dụ, trong đoạn code sau, hàm `printInts()` in ra một list số nguyên, còn `main()` tạo
một list rồi truyền nó cho `printInts()`.

```dart
void printInts(List<int> a) => print(a);

void main() {
  final list = [];
  list.add(1);
  list.add('2');
  printInts(list);
}
```

> *(Đoạn code này cố tình gây lỗi phân tích tĩnh.)*

Đoạn code trên gây ra lỗi kiểu ở `list` tại lời gọi `printInts(list)`:

```plaintext
error - The argument type 'List<dynamic>' can't be assigned to the parameter type 'List<int>'. - argument_type_not_assignable
```

> *Diễn giải thông báo lỗi:* không thể gán đối số kiểu `List<dynamic>` cho tham số kiểu
> `List<int>`.

Lỗi này chỉ ra một phép ép kiểu ngầm định **không an toàn (unsound)** từ `List<dynamic>`
sang `List<int>`. Biến `list` có kiểu tĩnh là `List<dynamic>`. Nguyên nhân là khai báo
khởi tạo `var list = []` không cung cấp đủ thông tin để analyzer suy ra một đối số kiểu cụ
thể hơn `dynamic`. Hàm `printInts()` lại mong đợi một tham số kiểu `List<int>`, gây ra sự
không khớp về kiểu.

Khi thêm chú thích kiểu (`<int>`) vào lúc tạo list, analyzer sẽ chuyển sang phàn nàn rằng
không thể gán một đối số chuỗi cho tham số kiểu `int`. Bỏ dấu nháy trong `list.add('2')`
sẽ cho ra đoạn code vượt qua phân tích tĩnh và chạy không lỗi, không cảnh báo.

```dart
void printInts(List<int> a) => print(a);

void main() {
  final list = <int>[];
  list.add(1);
  list.add(2);
  printInts(list);
}
```

[Thử trên DartPad](https://dartpad.dev/?id=25074a51a00c71b4b000f33b688dedd0).

## Soundness là gì?

*Soundness* nói về việc đảm bảo chương trình của bạn không thể rơi vào một số trạng thái
không hợp lệ nhất định. Một *hệ thống kiểu* sound nghĩa là bạn không bao giờ có thể rơi
vào trạng thái mà một biểu thức cho ra giá trị không khớp với kiểu tĩnh của chính biểu
thức đó. Ví dụ, nếu kiểu tĩnh của một biểu thức là `String`, thì tại thời điểm chạy bạn
được đảm bảo chỉ nhận về một chuỗi khi tính biểu thức đó.

Hệ thống kiểu của Dart, giống như hệ thống kiểu của Java và C#, là sound. Nó thực thi tính
sound đó bằng cách kết hợp kiểm tra tĩnh (lỗi lúc biên dịch) và kiểm tra lúc chạy. Ví dụ,
gán một `String` cho `int` là lỗi lúc biên dịch. Còn ép một object sang `String` bằng
`as String` sẽ thất bại với lỗi lúc chạy nếu object đó không phải `String`.

## Lợi ích của soundness

Một hệ thống kiểu sound mang lại nhiều lợi ích:

* **Phơi bày bug liên quan tới kiểu ngay lúc biên dịch.**
  Hệ thống kiểu sound buộc code phải rõ ràng về kiểu, nhờ đó những bug liên quan tới kiểu
  vốn có thể rất khó tìm lúc chạy sẽ lộ ra ngay lúc biên dịch.

* **Code dễ đọc hơn.**
  Code dễ đọc hơn vì bạn có thể tin rằng một giá trị thực sự mang đúng kiểu đã khai báo.
  Trong Dart sound, kiểu không nói dối.

* **Code dễ bảo trì hơn.**
  Với hệ thống kiểu sound, khi bạn thay đổi một đoạn code, hệ thống kiểu có thể cảnh báo
  cho bạn biết những đoạn code khác vừa bị hỏng.

* **Biên dịch ahead-of-time (AOT) tốt hơn.**
  Biên dịch AOT vẫn khả thi khi không có kiểu, nhưng code sinh ra kém hiệu quả hơn nhiều.

## Mẹo để vượt qua phân tích tĩnh

Hầu hết quy tắc về kiểu tĩnh đều dễ hiểu. Dưới đây là vài quy tắc ít hiển nhiên hơn:

* Dùng kiểu trả về sound khi ghi đè phương thức.
* Dùng kiểu tham số sound khi ghi đè phương thức.
* Đừng dùng list `dynamic` như một list có định kiểu.

Hãy xem chi tiết các quy tắc này, với những ví dụ dùng cây phân cấp kiểu sau:

![Cây phân cấp các loài vật: kiểu cha là Animal, các kiểu con là Alligator, Cat và HoneyBadger. Cat có các kiểu con là Lion và MaineCoon](https://dart.dev/assets/img/language/type-hierarchy.png)

<a name="use-proper-return-types"></a>

### Dùng kiểu trả về sound khi ghi đè phương thức

Kiểu trả về của một phương thức trong lớp con phải cùng kiểu, hoặc là kiểu con của kiểu
trả về của phương thức trong lớp cha. Hãy xem phương thức getter trong lớp `Animal`:

```dart
class Animal {
  void chase(Animal a) {
     ...
  }
  Animal get parent => ...
}
```

Getter `parent` trả về một `Animal`. Trong lớp con `HoneyBadger`, bạn có thể thay kiểu trả
về của getter bằng `HoneyBadger` (hoặc bất kỳ kiểu con nào khác của `Animal`), nhưng một
kiểu không liên quan thì không được phép.

```dart
class HoneyBadger extends Animal {
  @override
  void chase(Animal a) {
     ...
  }

  @override
  HoneyBadger get parent => ...
}
```

> *(Hợp lệ — vượt qua phân tích tĩnh.)*

```dart
class HoneyBadger extends Animal {
  @override
  void chase(Animal a) {
     ...
  }

  @override
  Root get parent => ...
}
```

> *(Không hợp lệ — `Root` là kiểu không liên quan, nên đoạn này gây lỗi phân tích tĩnh.)*

<a name="use-proper-param-types"></a>

### Dùng kiểu tham số sound khi ghi đè phương thức

Tham số của một phương thức được ghi đè phải có cùng kiểu, hoặc là **kiểu cha** của tham
số tương ứng trong lớp cha. Đừng "thắt chặt" kiểu tham số bằng cách thay nó bằng một kiểu
con của kiểu tham số ban đầu.

> **Lưu ý**
> Nếu bạn có lý do chính đáng để dùng kiểu con, bạn có thể dùng
> [từ khóa `covariant`](https://dart.dev/language/type-system#covariant-keyword).

Hãy xem phương thức `chase(Animal)` của lớp `Animal`:

```dart
class Animal {
  void chase(Animal a) {
     ...
  }
  Animal get parent => ...
}
```

Phương thức `chase()` nhận vào một `Animal`. Loài `HoneyBadger` thì đuổi theo bất cứ thứ
gì. Vì vậy việc ghi đè `chase()` để nhận vào bất cứ thứ gì (`Object`) là hợp lệ.

```dart
class HoneyBadger extends Animal {
  @override
  void chase(Object a) {
     ...
  }

  @override
  Animal get parent => ...
}
```

> *(Hợp lệ — vượt qua phân tích tĩnh.)*

Đoạn code sau lại thắt chặt tham số của `chase()` từ `Animal` xuống `Mouse` — một lớp con
của `Animal`.

```dart
class Mouse extends Animal {
   ...
}

class Cat extends Animal {
  @override
  void chase(Mouse a) {
     ...
  }
}
```

> *(Đoạn code này cố tình gây lỗi phân tích tĩnh.)*

Đoạn code này không an toàn kiểu, vì khi đó ta có thể tạo ra một con mèo rồi bắt nó đuổi
theo một con cá sấu:

```dart
Animal a = Cat();
a.chase(Alligator()); // Not type safe or feline safe.
```

> *Diễn giải:* không an toàn kiểu, mà cũng chẳng an toàn cho con mèo.

### Đừng dùng list `dynamic` như một list có định kiểu

List `dynamic` rất tốt khi bạn muốn một list chứa nhiều loại thứ khác nhau. Tuy nhiên, bạn
không thể dùng list `dynamic` như một list có định kiểu.

Quy tắc này cũng áp dụng cho thể hiện của các kiểu generic.

Đoạn code sau tạo một list `dynamic` chứa `Dog`, rồi gán nó cho một list kiểu `Cat` — việc
này sinh ra lỗi trong quá trình phân tích tĩnh.

```dart
void main() {
  List<Cat> foo = <dynamic>[Dog()]; // Error
  List<dynamic> bar = <dynamic>[Dog(), Cat()]; // OK
}
```

> *(Đoạn code này cố tình gây lỗi phân tích tĩnh ở dòng đầu; dòng sau thì hợp lệ.)*

## Kiểm tra lúc chạy (Runtime checks)

Kiểm tra lúc chạy xử lý những vấn đề an toàn kiểu mà không thể phát hiện lúc biên dịch.

Ví dụ, đoạn code sau ném ra ngoại lệ tại thời điểm chạy, vì ép một list chó thành một list
mèo là sai:

```dart
void main() {
  List<Animal> animals = <Dog>[Dog()];
  List<Cat> cats = animals as List<Cat>;
}
```

> *(Đoạn code này biên dịch được nhưng thất bại lúc chạy.)*

### Ép kiểu xuống ngầm định từ `dynamic`

Biểu thức có kiểu tĩnh là `dynamic` có thể được ép ngầm định sang một kiểu cụ thể hơn. Nếu
kiểu thực tế không khớp, phép ép kiểu sẽ ném lỗi lúc chạy. Hãy xem phương thức
`assumeString` sau:

```dart
int assumeString(dynamic object) {
  String string = object; // Check at run time that `object` is a `String`.
  return string.length;
}
```

> *Diễn giải:* dòng này kiểm tra lúc chạy rằng `object` đúng là một `String`.

Trong ví dụ này, nếu `object` là một `String` thì phép ép kiểu thành công. Nếu nó không
phải kiểu con của `String` — chẳng hạn là `int` — thì một `TypeError` sẽ được ném ra:

```dart
final length = assumeString(1);
```

> *(Đoạn code này thất bại lúc chạy.)*

> **Mẹo**
> Để ngăn việc ép kiểu xuống ngầm định từ `dynamic` và tránh vấn đề này, hãy cân nhắc bật
> chế độ _strict casts_ của analyzer.
>
> ```yaml
> # analysis_options.yaml
> analyzer:
>   language:
>     strict-casts: true
> ```
>
> Để tìm hiểu thêm về cách tùy chỉnh hành vi của analyzer, xem
> [Customizing static analysis](https://dart.dev/tools/analysis).

## Suy luận kiểu (Type inference)

Analyzer có thể suy ra kiểu cho trường (field), phương thức, biến cục bộ, và hầu hết các
đối số kiểu generic. Khi analyzer không có đủ thông tin để suy ra một kiểu cụ thể, nó dùng
kiểu `dynamic`.

Đây là ví dụ về cách suy luận kiểu hoạt động với generics. Trong ví dụ này, biến
`arguments` giữ một map ghép các khóa chuỗi với các giá trị thuộc nhiều kiểu khác nhau.

Nếu bạn khai báo kiểu tường minh, bạn sẽ viết thế này:

```dart
Map<String, Object?> arguments = {'argA': 'hello', 'argB': 42};
```

Hoặc bạn có thể dùng `var` hay `final` và để Dart tự suy ra kiểu:

```dart
var arguments = {'argA': 'hello', 'argB': 42}; // Map<String, Object>
```

Map literal suy ra kiểu của nó từ các entry, rồi biến lại suy ra kiểu của nó từ kiểu của
map literal. Trong map này, các khóa đều là chuỗi, nhưng các giá trị thì khác kiểu nhau
(`String` và `int`, có chặn trên là `Object`). Vì vậy map literal có kiểu
`Map<String, Object>`, và biến `arguments` cũng vậy.

### Suy luận cho trường và phương thức

Một trường hoặc phương thức không khai báo kiểu mà lại ghi đè một trường hoặc phương thức
từ lớp cha, sẽ kế thừa kiểu của trường/phương thức ở lớp cha đó.

Một trường không có kiểu được khai báo cũng không có kiểu kế thừa, nhưng được khai báo kèm
giá trị khởi tạo, sẽ được suy ra kiểu dựa trên giá trị khởi tạo đó.

### Suy luận cho trường tĩnh

Trường tĩnh và biến tĩnh được suy ra kiểu từ biểu thức khởi tạo của chúng. Lưu ý rằng việc
suy luận sẽ thất bại nếu gặp phải một chu trình (tức là việc suy ra kiểu cho biến lại phụ
thuộc vào việc phải biết trước kiểu của chính biến đó).

### Suy luận cho biến cục bộ

Kiểu của biến cục bộ được suy ra từ biểu thức khởi tạo, nếu có. Những phép gán về sau
không được tính đến. Điều này có thể dẫn tới việc kiểu được suy ra quá hẹp. Khi đó, bạn có
thể thêm chú thích kiểu.

```dart
var x = 3; // x is inferred as an int.
x = 4.0;
```

> *Diễn giải:* `x` được suy ra là `int`, nên dòng sau gây lỗi.
> *(Đoạn code này cố tình gây lỗi phân tích tĩnh.)*

```dart
num y = 3; // A num can be double or int.
y = 4.0;
```

> *Diễn giải:* `num` có thể là `double` hoặc `int`, nên đoạn này hợp lệ.

### Suy luận đối số kiểu

Đối số kiểu cho lời gọi constructor và cho lời gọi
[phương thức generic](https://dart.dev/language/generics#using-generic-methods) được suy
ra dựa trên sự kết hợp giữa **thông tin đi xuống (downward)** từ ngữ cảnh xuất hiện và
**thông tin đi lên (upward)** từ các đối số truyền vào constructor hay phương thức generic
đó. Nếu việc suy luận không cho ra kết quả bạn muốn hoặc mong đợi, bạn luôn có thể chỉ
định đối số kiểu một cách tường minh.

```dart
// Inferred as if you wrote <int>[].
List<int> listOfInt = [];

// Inferred as if you wrote <double>[3.0].
var listOfDouble = [3.0];

// Inferred as Iterable<int>.
var ints = listOfDouble.map((x) => x.toInt());
```

> *Diễn giải:* lần lượt được suy ra như thể bạn viết `<int>[]`, `<double>[3.0]`, và
> `Iterable<int>`.

Trong ví dụ cuối, `x` được suy ra là `double` nhờ thông tin đi xuống. Kiểu trả về của
closure được suy ra là `int` nhờ thông tin đi lên. Dart dùng kiểu trả về này làm thông tin
đi lên khi suy ra đối số kiểu cho phương thức `map()`: `<int>`.

#### Suy luận có dùng bound (Inference using bounds)

> **Lưu ý về phiên bản**
> Suy luận có dùng bound yêu cầu [phiên bản ngôn ngữ][language version] tối thiểu là
> 3.7.0.

Với tính năng suy luận có dùng bound, thuật toán suy luận kiểu của Dart sinh ra các ràng
buộc bằng cách kết hợp những ràng buộc sẵn có với các chặn kiểu (type bound) đã khai báo,
chứ không chỉ dựa vào phép xấp xỉ "cố hết sức" (best-effort).

Điều này đặc biệt quan trọng với các kiểu [F-bounded][], nơi mà suy luận có dùng bound suy
ra đúng rằng, trong ví dụ dưới đây, `X` có thể gắn với `B`. Nếu không có tính năng này,
đối số kiểu phải được chỉ định tường minh: `f<B>(C())`:

```dart
class A<X extends A<X>> {}

class B extends A<B> {}

class C extends B {}

void f<X extends A<X>>(X x) {}

void main() {
  f(B()); // OK.

  // OK. Without using bounds, inference relying on best-effort approximations
  // would fail after detecting that `C` is not a subtype of `A<C>`.
  f(C());

  f<B>(C()); // OK.
}
```

> *Diễn giải khối comment:* nếu không dùng bound, phép suy luận dựa trên xấp xỉ best-effort
> sẽ thất bại sau khi phát hiện `C` không phải kiểu con của `A<C>`.

Đây là một ví dụ thực tế hơn, dùng những kiểu quen thuộc hằng ngày trong Dart như `int`
hay `num`:

```dart
X max<X extends Comparable<X>>(X x1, X x2) => x1.compareTo(x2) > 0 ? x1 : x2;

void main() {
  // Inferred as `max<num>(3, 7)` with the feature, fails without it.
  max(3, 7);
}
```

> *Diễn giải:* với tính năng này, lời gọi được suy ra thành `max<num>(3, 7)`; không có nó
> thì thất bại.

Với suy luận có dùng bound, Dart có thể *phân rã* đối số kiểu, trích xuất thông tin kiểu từ
chặn của một tham số kiểu generic. Điều này cho phép những hàm như `f` trong ví dụ sau giữ
được **cả** kiểu iterable cụ thể (`List` hay `Set`) **lẫn** kiểu phần tử. Trước khi có suy
luận dùng bound, chuyện này là bất khả thi nếu không đánh mất tính an toàn kiểu hoặc thông
tin kiểu cụ thể.

```dart
(X, Y) f<X extends Iterable<Y>, Y>(X x) => (x, x.first);

void main() {
  var (myList, myInt) = f([1]);
  myInt.whatever; // Compile-time error, `myInt` has type `int`.

  var (mySet, myString) = f({'Hello!'});
  mySet.union({}); // Works, `mySet` has type `Set<String>`.
}
```

> *Diễn giải:* dòng `myInt.whatever` gây lỗi lúc biên dịch vì `myInt` có kiểu `int`; còn
> `mySet.union({})` chạy được vì `mySet` có kiểu `Set<String>`.

Nếu không có suy luận dùng bound, `myInt` sẽ mang kiểu `dynamic`. Thuật toán suy luận cũ
sẽ không bắt được biểu thức sai `myInt.whatever` lúc biên dịch, mà thay vào đó ném lỗi lúc
chạy. Ngược lại, `mySet.union({})` sẽ là lỗi lúc biên dịch nếu không có suy luận dùng
bound, bởi thuật toán cũ không giữ được thông tin rằng `mySet` là một `Set`.

Để biết thêm về thuật toán suy luận dùng bound, xem [tài liệu thiết kế][design document].

[F-bounded]: https://dart.dev/language/generics/#f-bounds
[design document]: https://github.com/dart-lang/language/blob/main/accepted/future-releases/3009-inference-using-bounds/design-document.md#motivating-example

## Thay thế kiểu (Substituting types)

Khi bạn ghi đè một phương thức, bạn đang thay một thứ mang kiểu này (trong phương thức cũ)
bằng một thứ có thể mang kiểu khác (trong phương thức mới). Tương tự, khi bạn truyền một
đối số cho hàm, bạn đang thay một thứ mang kiểu này (tham số với kiểu đã khai báo) bằng
một thứ mang kiểu khác (đối số thực tế). Vậy khi nào bạn được phép thay một thứ mang kiểu
này bằng một thứ mang kiểu con hoặc kiểu cha của nó?

Khi thay thế kiểu, sẽ dễ hiểu hơn nếu nghĩ theo hướng _bên tiêu thụ (consumer)_ và _bên
sản xuất (producer)_. Bên tiêu thụ hấp thụ một kiểu, còn bên sản xuất sinh ra một kiểu.

**Bạn có thể thay kiểu của bên tiêu thụ bằng một kiểu cha, và thay kiểu của bên sản xuất
bằng một kiểu con.**

Hãy xem ví dụ về phép gán kiểu đơn giản và phép gán với kiểu generic.

### Gán kiểu đơn giản

Khi gán object cho object, khi nào bạn có thể thay một kiểu bằng một kiểu khác? Câu trả
lời phụ thuộc vào việc object đó là bên tiêu thụ hay bên sản xuất.

Hãy xem cây phân cấp kiểu sau:

![Cây phân cấp các loài vật: kiểu cha là Animal, các kiểu con là Alligator, Cat và HoneyBadger. Cat có các kiểu con là Lion và MaineCoon](https://dart.dev/assets/img/language/type-hierarchy.png)

Hãy xem phép gán đơn giản sau, trong đó `Cat c` là _bên tiêu thụ_ còn `Cat()` là _bên sản
xuất_:

```dart
Cat c = Cat();
```

Ở vị trí tiêu thụ, việc thay một thứ tiêu thụ kiểu cụ thể (`Cat`) bằng một thứ tiêu thụ
được mọi thứ (`Animal`) là an toàn. Vì vậy thay `Cat c` bằng `Animal c` là hợp lệ, bởi
`Animal` là kiểu cha của `Cat`.

```dart
Animal c = Cat();
```

Nhưng thay `Cat c` bằng `MaineCoon c` thì phá vỡ an toàn kiểu, vì lớp cha có thể cung cấp
một loại `Cat` có hành vi khác, chẳng hạn `Lion`:

```dart
MaineCoon c = Cat();
```

> *(Đoạn code này cố tình gây lỗi phân tích tĩnh.)*

Ở vị trí sản xuất, việc thay một thứ sản xuất ra kiểu `Cat` bằng một kiểu cụ thể hơn
(`MaineCoon`) là an toàn. Nên đoạn sau là hợp lệ:

```dart
Cat c = MaineCoon();
```

### Gán kiểu generic

Quy tắc có giống vậy với kiểu generic không? Có. Hãy xem cây phân cấp của các list loài
vật — một `List` của `Cat` là kiểu con của `List` của `Animal`, và là kiểu cha của `List`
của `MaineCoon`:

![List&lt;Animal&gt; -&gt; List&lt;Cat&gt; -&gt; List&lt;MaineCoon&gt;](https://dart.dev/assets/img/language/type-hierarchy-generics.png)

Trong ví dụ sau, bạn có thể gán một list `MaineCoon` cho `myCats`, vì `List<MaineCoon>` là
kiểu con của `List<Cat>`:

```dart
List<MaineCoon> myMaineCoons = ...
List<Cat> myCats = myMaineCoons;
```

Còn theo chiều ngược lại thì sao? Bạn có gán được một list `Animal` cho `List<Cat>` không?

```dart
List<Animal> myAnimals = ...
List<Cat> myCats = myAnimals;
```

> *(Đoạn code này cố tình gây lỗi phân tích tĩnh.)*

Phép gán này không vượt qua phân tích tĩnh, vì nó tạo ra một phép ép kiểu xuống ngầm định
— điều không được phép với những kiểu không phải `dynamic` như `Animal`.

Để đoạn code kiểu này vượt qua phân tích tĩnh, bạn có thể dùng phép ép kiểu tường minh:

```dart
List<Animal> myAnimals = ...
List<Cat> myCats = myAnimals as List<Cat>;
```

Tuy nhiên, phép ép kiểu tường minh vẫn có thể thất bại lúc chạy, tùy vào kiểu thực tế của
list đang bị ép (`myAnimals`).

### Phương thức

Khi ghi đè một phương thức, quy tắc bên sản xuất và bên tiêu thụ vẫn được áp dụng. Ví dụ:

![Lớp Animal, trong đó phương thức chase là bên tiêu thụ còn getter parent là bên sản xuất](https://dart.dev/assets/img/language/consumer-producer-methods.png)

Với bên tiêu thụ (chẳng hạn phương thức `chase(Animal)`), bạn có thể thay kiểu tham số
bằng một kiểu cha. Với bên sản xuất (chẳng hạn getter `parent`), bạn có thể thay kiểu trả
về bằng một kiểu con.

Chi tiết xem [Dùng kiểu trả về sound khi ghi đè phương thức](#use-proper-return-types) và
[Dùng kiểu tham số sound khi ghi đè phương thức](#use-proper-param-types).

<a id="covariant-keyword"></a>

#### Tham số covariant

Một số mẫu code (hiếm dùng) lại dựa vào việc thắt chặt kiểu bằng cách ghi đè kiểu của tham
số bằng một kiểu con — vốn là không hợp lệ. Trong trường hợp này, bạn có thể dùng từ khóa
`covariant` để nói với analyzer rằng bạn đang cố tình làm vậy. Việc này loại bỏ lỗi tĩnh,
và thay vào đó chuyển sang kiểm tra kiểu đối số không hợp lệ tại thời điểm chạy.

Đoạn sau minh họa cách bạn có thể dùng `covariant`:

```dart
class Animal {
  void chase(Animal x) {
     ...
  }
}

class Mouse extends Animal {
   ...
}

class Cat extends Animal {
  @override
  void chase(covariant Mouse x) {
     ...
  }
}
```

Mặc dù ví dụ này đặt `covariant` ở kiểu con, từ khóa `covariant` có thể được đặt ở phương
thức của lớp cha hoặc lớp con đều được. Thường thì phương thức ở lớp cha là chỗ đặt tốt
nhất. Từ khóa `covariant` áp dụng cho một tham số duy nhất, và cũng được hỗ trợ trên setter
và trường.

## Tài nguyên khác

Những tài nguyên sau có thêm thông tin về Dart sound:

* [Fixing type promotion failures](https://dart.dev/tools/non-promotion-reasons) — hiểu và
  học cách sửa lỗi nâng cấp kiểu (type promotion).
* [Sound null safety](https://dart.dev/null-safety) — tìm hiểu cách viết code với sound
  null safety.
* [Customizing static analysis][analysis] — cách thiết lập và tùy chỉnh analyzer cùng
  linter bằng file analysis options.

---

[analysis]: https://dart.dev/tools/analysis
[language version]: https://dart.dev/language/versioning
[null safety]: https://dart.dev/null-safety

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
