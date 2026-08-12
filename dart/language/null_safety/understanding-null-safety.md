# Hiểu về null safety

> **Nguồn gốc:** <https://dart.dev/null-safety/understanding-null-safety> — *Understanding null safety*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12

_Tác giả: Bob Nystrom_
_Tháng 7 năm 2020_

Null safety là thay đổi lớn nhất chúng tôi thực hiện với Dart kể từ khi thay thế hệ thống
kiểu tùy chọn không chặt chẽ ban đầu bằng
[một hệ thống kiểu tĩnh chặt chẽ][strong] trong Dart 2.0. Khi Dart mới ra mắt, null safety
ở mức biên dịch còn là một tính năng hiếm gặp, cần giới thiệu dài dòng. Ngày nay, Kotlin,
Swift, Rust và nhiều ngôn ngữ khác đều đã có câu trả lời riêng cho thứ đã trở thành một
[vấn đề rất quen thuộc][billion]. Đây là một ví dụ:

[strong]: https://dart.dev/language/type-system
[billion]: https://www.infoq.com/presentations/Null-References-The-Billion-Dollar-Mistake-Tony-Hoare/

```dart
// Without null safety:
bool isEmpty(String string) => string.length == 0;

void main() {
  isEmpty(null);
}
```

Nếu bạn chạy chương trình Dart này khi chưa có null safety, nó ném ra ngoại lệ
`NoSuchMethodError` tại lời gọi `.length`. Giá trị `null` là một thể hiện của lớp `Null`,
mà `Null` thì không có getter "length". Lỗi lúc chạy thật tệ hại. Điều này càng đúng với
một ngôn ngữ như Dart, vốn được thiết kế để chạy trên thiết bị của người dùng cuối. Nếu một
ứng dụng server sập, bạn thường kịp khởi động lại nó trước khi ai đó nhận ra. Nhưng khi một
ứng dụng Flutter crash trên điện thoại người dùng, họ chẳng vui vẻ gì. Mà khi người dùng
không vui, bạn cũng không vui.

Lập trình viên thích những ngôn ngữ định kiểu tĩnh như Dart, vì chúng cho phép bộ kiểm tra
kiểu tìm ra lỗi trong code ngay lúc biên dịch — thường là ngay trong IDE. Càng phát hiện
bug sớm, bạn càng sớm sửa được nó. Khi những người thiết kế ngôn ngữ nói về "khắc phục lỗi
tham chiếu null", ý họ là làm giàu thêm bộ kiểm tra kiểu tĩnh để ngôn ngữ phát hiện được
những sai lầm như việc cố gọi `.length` trên một giá trị có thể là `null` ở trên.

Không có một giải pháp đúng duy nhất cho vấn đề này. Rust và Kotlin đều có cách tiếp cận
riêng, hợp lý trong bối cảnh của từng ngôn ngữ. Tài liệu này đi qua mọi chi tiết trong câu
trả lời của chúng tôi cho Dart. Nó bao gồm những thay đổi trong hệ thống kiểu tĩnh và một
loạt sửa đổi cùng tính năng ngôn ngữ mới, để bạn không chỉ viết được code null-safe mà hy
vọng còn *thích thú* khi làm điều đó.

Tài liệu này dài. Nếu bạn muốn thứ gì đó ngắn hơn, chỉ bao gồm những gì cần biết để bắt tay
vào việc, hãy bắt đầu với [bản tổng quan][overview]. Khi bạn đã sẵn sàng hiểu sâu hơn và có
thời gian, hãy quay lại đây để hiểu ngôn ngữ xử lý `null` *như thế nào*, *vì sao* chúng tôi
thiết kế nó như vậy, và cách viết code Dart hiện đại, null-safe, đúng phong cách. (Tiết lộ
trước: kết quả cuối cùng gần giống một cách đáng ngạc nhiên với cách bạn viết Dart hôm
nay.)

[overview]: https://dart.dev/null-safety

Mỗi cách mà một ngôn ngữ có thể dùng để đối phó với lỗi tham chiếu null đều có ưu và nhược
điểm riêng. Những nguyên tắc sau đã dẫn dắt các lựa chọn của chúng tôi:

*   **Code phải an toàn theo mặc định.** Nếu bạn viết code Dart mới và không dùng bất kỳ
    tính năng không-an-toàn nào một cách tường minh, nó sẽ không bao giờ ném lỗi tham chiếu
    null lúc chạy. Mọi lỗi tham chiếu null khả dĩ đều bị bắt tĩnh. Nếu bạn muốn hoãn một
    phần việc kiểm tra đó sang lúc chạy để có sự linh hoạt lớn hơn, bạn có thể làm được,
    nhưng bạn phải tự chọn điều đó bằng cách dùng một tính năng nào đó **nhìn thấy được**
    trong code.

    Nói cách khác, chúng tôi không đưa cho bạn một chiếc áo phao rồi để bạn tự nhớ mặc nó
    mỗi lần ra biển. Thay vào đó, chúng tôi đưa cho bạn một con thuyền không chìm. Bạn cứ
    khô ráo, trừ khi bạn tự nhảy xuống nước.

*   **Code null-safe phải dễ viết.** Hầu hết code Dart hiện có đều đúng về mặt động và
    không ném lỗi tham chiếu null. Bạn thích chương trình Dart của mình theo cách nó đang
    trông như hiện tại, và chúng tôi muốn bạn tiếp tục viết code được như vậy. Sự an toàn
    không nên đòi hỏi phải hy sinh tính dễ dùng, phải "chuộc tội" với bộ kiểm tra kiểu, hay
    phải thay đổi đáng kể cách bạn tư duy.

*   **Code null-safe thu được phải chặt chẽ hoàn toàn.** "Soundness" trong bối cảnh kiểm
    tra tĩnh mang nghĩa khác nhau với mỗi người. Với chúng tôi, trong bối cảnh null safety,
    nó nghĩa là: nếu một biểu thức có kiểu tĩnh không cho phép `null`, thì không có lần
    thực thi khả dĩ nào của biểu thức đó cho ra `null`. Ngôn ngữ đảm bảo điều này chủ yếu
    qua kiểm tra tĩnh, nhưng cũng có thể có một số kiểm tra lúc chạy tham gia. (Dù vậy, hãy
    nhớ nguyên tắc đầu tiên: mọi chỗ có kiểm tra lúc chạy đều là do **bạn** chọn.)

    Soundness quan trọng với niềm tin của người dùng. Một con thuyền *đa phần* là nổi thì
    chẳng khiến bạn hào hứng ra khơi. Nhưng nó cũng quan trọng với những hacker trình biên
    dịch gan dạ của chúng tôi. Khi ngôn ngữ đưa ra những đảm bảo cứng về tính chất ngữ nghĩa
    của chương trình, trình biên dịch có thể thực hiện những tối ưu dựa trên giả định rằng
    các tính chất đó đúng. Với `null`, nghĩa là chúng tôi sinh ra được code nhỏ hơn nhờ loại
    bỏ những phép kiểm tra `null` không cần thiết, và code nhanh hơn nhờ không phải xác minh
    đối tượng nhận khác `null` trước khi gọi phương thức lên nó.

    Một lưu ý: Chúng tôi chỉ đảm bảo soundness trong những chương trình Dart null-safe hoàn
    toàn. Dart hỗ trợ những chương trình pha trộn giữa code null-safe mới và code cũ. Trong
    những chương trình pha trộn phiên bản đó, lỗi tham chiếu null vẫn có thể xảy ra. Ở
    chương trình pha trộn, bạn nhận được toàn bộ lợi ích an toàn *tĩnh* ở những phần đã
    null-safe, nhưng bạn chưa có soundness đầy đủ lúc chạy cho tới khi toàn bộ ứng dụng
    null-safe.

Lưu ý rằng *loại bỏ* `null` **không** phải mục tiêu. Chẳng có gì sai với `null` cả. Trái
lại, khả năng biểu diễn sự *vắng mặt* của một giá trị thực sự rất hữu ích. Việc xây dựng hỗ
trợ cho một giá trị "vắng mặt" đặc biệt ngay trong ngôn ngữ khiến việc làm việc với sự vắng
mặt trở nên linh hoạt và dễ dùng. Nó là nền tảng cho tham số tùy chọn, cho toán tử
null-aware `?.` tiện lợi, và cho việc khởi tạo mặc định. Không phải `null` là xấu; chính
việc `null` đi tới *nơi bạn không ngờ tới* mới gây ra vấn đề.

Vì vậy, với null safety, mục tiêu của chúng tôi là cho bạn *quyền kiểm soát* và *tầm nhìn*
về việc `null` có thể chảy qua đâu trong chương trình, cùng sự chắc chắn rằng nó không thể
chảy tới nơi gây crash.

## Tính nullable trong hệ thống kiểu

Null safety bắt đầu từ hệ thống kiểu tĩnh, bởi mọi thứ khác đều đặt trên nền đó. Chương
trình Dart của bạn có cả một vũ trụ kiểu bên trong: các kiểu nguyên thủy như `int` và
`String`, các kiểu collection như `List`, cùng mọi lớp và kiểu mà bạn và các package bạn
dùng định nghĩa ra. Trước null safety, hệ thống kiểu tĩnh cho phép giá trị `null` chảy vào
biểu thức thuộc bất kỳ kiểu nào trong số đó.

Theo thuật ngữ lý thuyết kiểu, kiểu `Null` được coi là kiểu con của **mọi** kiểu:

![Cây phân cấp kiểu trước khi có null safety](https://dart.dev/assets/img/null-safety/understanding-null-safety/hierarchy-before.png)

Tập các thao tác — getter, setter, phương thức và toán tử — được phép thực hiện trên một
biểu thức là do kiểu của nó quy định. Nếu kiểu là `List`, bạn gọi được `.add()` hay `[]`
lên nó. Nếu là `int`, bạn gọi được `+`. Nhưng giá trị `null` chẳng định nghĩa phương thức
nào trong số đó. Việc cho phép `null` chảy vào một biểu thức thuộc kiểu khác nghĩa là bất
kỳ thao tác nào cũng có thể thất bại. Đây thực sự là mấu chốt của lỗi tham chiếu null — mọi
thất bại đều đến từ việc cố tra cứu một phương thức hay thuộc tính trên `null` mà nó không
có.

### Kiểu non-nullable và nullable

Null safety loại bỏ vấn đề đó từ gốc rễ bằng cách thay đổi cây phân cấp kiểu. Kiểu `Null`
vẫn tồn tại, nhưng nó không còn là kiểu con của mọi kiểu nữa. Thay vào đó, cây phân cấp
kiểu trông như thế này:

![Cây phân cấp kiểu sau khi có null safety](https://dart.dev/assets/img/null-safety/understanding-null-safety/hierarchy-after.png)

Vì `Null` không còn là kiểu con nữa, không kiểu nào ngoài chính lớp `Null` đặc biệt cho
phép giá trị `null`. Chúng tôi đã khiến mọi kiểu trở thành *non-nullable theo mặc định*.
Nếu bạn có một biến kiểu `String`, nó sẽ **luôn** chứa *một chuỗi*. Đó, chúng ta đã sửa
xong mọi lỗi tham chiếu null.

Nếu chúng tôi cho rằng `null` chẳng hữu ích gì, thì có thể dừng ở đây. Nhưng `null` có ích,
nên ta vẫn cần một cách xử lý nó. Tham số tùy chọn là một ví dụ minh họa tốt. Hãy xem đoạn
code Dart null-safe sau:

```dart
// Using null safety:
void makeCoffee(String coffee, [String? dairy]) {
  if (dairy != null) {
    print('$coffee with $dairy');
  } else {
    print('Black $coffee');
  }
}
```

Ở đây, ta muốn tham số `dairy` nhận bất kỳ chuỗi nào, hoặc giá trị `null`, chứ không gì
khác. Để diễn đạt điều đó, ta gán cho `dairy` một *kiểu nullable* bằng cách dán `?` vào
cuối kiểu nền `String`. Bên dưới, việc này về cơ bản là định nghĩa một [union][] của kiểu
nền và kiểu `Null`. Vậy nên `String?` sẽ là cách viết tắt của `String|Null` — nếu Dart có
kiểu union đầy đủ.

[union]: https://en.wikipedia.org/wiki/Union_type

<a id="using-nullable-types"></a>

### Dùng kiểu nullable

Nếu bạn có một biểu thức mang kiểu nullable, bạn làm được gì với kết quả? Vì nguyên tắc của
ta là an toàn theo mặc định, câu trả lời là: không nhiều. Chúng tôi không thể cho bạn gọi
các phương thức của kiểu nền lên nó, vì chúng có thể thất bại nếu giá trị là `null`:

```dart
// Hypothetical unsound null safety:
void bad(String? maybeString) {
  print(maybeString.length);
}

void main() {
  bad(null);
}
```

Đoạn này sẽ crash nếu chúng tôi để bạn chạy nó. Những phương thức và thuộc tính duy nhất
chúng tôi có thể cho bạn truy cập an toàn là những thứ được định nghĩa bởi **cả** kiểu nền
**lẫn** lớp `Null`. Đó chỉ có `toString()`, `==` và `hashCode`. Vậy nên bạn dùng được kiểu
nullable làm khóa của map, lưu chúng trong set, so sánh chúng với giá trị khác, và dùng
chúng trong nội suy chuỗi — chỉ chừng đó thôi.

Chúng tương tác với kiểu non-nullable ra sao? Việc truyền một kiểu *non*-nullable vào chỗ
đang mong đợi kiểu nullable thì luôn an toàn. Nếu một hàm nhận `String?` thì truyền một
`String` vào là được phép, vì việc đó chẳng gây vấn đề gì. Ta mô hình hóa điều này bằng
cách coi mỗi kiểu nullable là **kiểu cha** của kiểu nền của nó. Bạn cũng truyền `null` an
toàn vào chỗ mong đợi kiểu nullable được, nên `Null` cũng là kiểu con của mọi kiểu nullable:

![Quan hệ kiểu cha/con giữa kiểu nullable, kiểu nền và Null](https://dart.dev/assets/img/null-safety/understanding-null-safety/nullable-hierarchy.png)

Nhưng đi theo chiều ngược lại — truyền một kiểu nullable vào chỗ đang mong đợi kiểu nền
non-nullable — thì không an toàn. Code mong đợi một `String` có thể gọi các phương thức của
`String` lên giá trị đó. Nếu bạn truyền vào một `String?`, `null` có thể chảy vào và gây
thất bại:

```dart
// Hypothetical unsound null safety:
void requireStringNotNull(String definitelyString) {
  print(definitelyString.length);
}

void main() {
  String? maybeString = null; // Or not!
  requireStringNotNull(maybeString);
}
```

Chương trình này không an toàn và chúng tôi không nên cho phép nó. Tuy nhiên, Dart xưa nay
vẫn có thứ gọi là *ép kiểu xuống ngầm định (implicit downcast)*. Chẳng hạn, nếu bạn truyền
một giá trị kiểu `Object` cho hàm mong đợi `String`, bộ kiểm tra kiểu vẫn cho phép:

```dart
// Without null safety:
void requireStringNotObject(String definitelyString) {
  print(definitelyString.length);
}

void main() {
  Object maybeString = 'it is';
  requireStringNotObject(maybeString);
}
```

Để duy trì soundness, trình biên dịch âm thầm chèn một phép ép `as String` vào đối số của
`requireStringNotObject()`. Phép ép đó có thể thất bại và ném ngoại lệ lúc chạy, nhưng lúc
biên dịch, Dart bảo rằng thế là ổn. Vì kiểu non-nullable được mô hình hóa là kiểu con của
kiểu nullable, ép kiểu xuống ngầm định sẽ cho phép bạn truyền một `String?` vào chỗ mong
đợi `String`. Cho phép điều đó sẽ vi phạm mục tiêu an toàn theo mặc định của chúng tôi. Vì
vậy, với null safety, chúng tôi **loại bỏ hoàn toàn** ép kiểu xuống ngầm định.

Việc này khiến lời gọi `requireStringNotNull()` sinh ra lỗi biên dịch — đúng như bạn mong
muốn. Nhưng nó cũng có nghĩa là **mọi** phép ép kiểu xuống ngầm định đều trở thành lỗi biên
dịch, bao gồm cả lời gọi `requireStringNotObject()`. Bạn sẽ phải tự thêm phép ép kiểu tường
minh:

```dart
// Using null safety:
void requireStringNotObject(String definitelyString) {
  print(definitelyString.length);
}

void main() {
  Object maybeString = 'it is';
  requireStringNotObject(maybeString as String);
}
```

Chúng tôi cho rằng nhìn chung đây là một thay đổi tốt. Cảm nhận của chúng tôi là đa số người
dùng chưa bao giờ thích ép kiểu xuống ngầm định. Cụ thể, có thể bạn từng bị dính đòn vì
chuyện này:

```dart
// Without null safety:
List<int> filterEvens(List<int> ints) {
  return ints.where((n) => n.isEven);
}
```

Bạn thấy bug chưa? Phương thức `.where()` là lười (lazy), nên nó trả về `Iterable`, không
phải `List`. Chương trình này biên dịch được nhưng rồi ném ngoại lệ lúc chạy khi cố ép cái
`Iterable` đó về kiểu `List` mà `filterEvens` khai báo là sẽ trả về. Với việc loại bỏ ép
kiểu xuống ngầm định, chuyện này trở thành lỗi biên dịch.

Ta đang nói tới đâu rồi nhỉ? À đúng, vậy là như thể ta đã lấy toàn bộ vũ trụ kiểu trong
chương trình của bạn và chia đôi nó:

![Vũ trụ kiểu chia thành hai nửa: kiểu nullable và kiểu non-nullable](https://dart.dev/assets/img/null-safety/understanding-null-safety/bifurcate.png)

Có một vùng gồm các kiểu non-nullable. Những kiểu đó cho bạn truy cập mọi phương thức thú
vị, nhưng không bao giờ chứa `null`. Rồi có một họ song song gồm toàn bộ những kiểu nullable
tương ứng. Chúng cho phép `null`, nhưng bạn chẳng làm được mấy với chúng. Chúng tôi để giá
trị chảy từ phía non-nullable sang phía nullable vì làm vậy an toàn, nhưng không cho chiều
ngược lại.

Nghe thì có vẻ kiểu nullable về cơ bản là vô dụng. Chúng không có phương thức nào và bạn
không thoát khỏi chúng được. Đừng lo, chúng tôi có cả một bộ tính năng giúp bạn chuyển giá
trị từ nửa nullable sang phía bên kia, và sẽ nói tới ngay thôi.

<a id="top-and-bottom"></a>

### Kiểu đỉnh và kiểu đáy (Top and bottom)

Mục này hơi bí hiểm. Bạn hầu như có thể bỏ qua nó, trừ hai gạch đầu dòng ở cuối cùng — trừ
khi bạn mê mấy chuyện hệ thống kiểu. Hãy hình dung mọi kiểu trong chương trình của bạn, với
các cạnh nối giữa những kiểu là kiểu con và kiểu cha của nhau. Nếu vẽ ra, như các sơ đồ
trong tài liệu này, nó sẽ tạo thành một đồ thị có hướng khổng lồ, với những kiểu cha như
`Object` ở gần đỉnh và các lớp lá như kiểu của riêng bạn ở gần đáy.

Nếu đồ thị có hướng đó chụm lại ở đỉnh thành một kiểu duy nhất là kiểu cha (trực tiếp hoặc
gián tiếp) của tất cả, thì kiểu đó gọi là *top type* (kiểu đỉnh). Tương tự, nếu có một kiểu
kỳ lạ ở đáy là kiểu con của mọi kiểu, bạn có một *bottom type* (kiểu đáy). (Trong trường
hợp đó, đồ thị có hướng của bạn là một [lattice][].)

[lattice]: https://en.wikipedia.org/wiki/Lattice_(order)

Sẽ tiện lợi nếu hệ thống kiểu của bạn có kiểu đỉnh và kiểu đáy, vì điều đó nghĩa là những
thao tác ở mức kiểu — như cận trên nhỏ nhất (least upper bound), thứ mà suy luận kiểu dùng
để xác định kiểu của một biểu thức điều kiện dựa trên kiểu của hai nhánh — luôn cho ra được
một kiểu. Trước null safety, `Object` là kiểu đỉnh của Dart và `Null` là kiểu đáy.

Vì `Object` giờ là non-nullable, nó không còn là kiểu đỉnh nữa. `Null` không phải kiểu con
của nó. Dart không có kiểu đỉnh nào *có tên*. Nếu bạn cần một kiểu đỉnh, thứ bạn muốn là
`Object?`. Tương tự, `Null` không còn là kiểu đáy. Nếu nó vẫn là, thì mọi thứ sẽ vẫn
nullable. Thay vào đó, chúng tôi thêm một kiểu đáy mới tên là `Never`:

![Kiểu đỉnh Object? và kiểu đáy Never](https://dart.dev/assets/img/null-safety/understanding-null-safety/top-and-bottom.png)

Trên thực tế, điều này nghĩa là:

*   Nếu bạn muốn chỉ ra rằng bạn chấp nhận giá trị thuộc kiểu bất kỳ, hãy dùng `Object?`
    thay vì `Object`. Thực tế, việc dùng `Object` trở nên khá bất thường, vì kiểu đó mang
    nghĩa "có thể là bất kỳ giá trị nào, ngoại trừ đúng một giá trị bị cấm một cách kỳ quặc
    là `null`".

*   Trong trường hợp hiếm hoi bạn cần một kiểu đáy, hãy dùng `Never` thay vì `Null`. Điều
    này đặc biệt hữu ích để chỉ ra rằng một hàm không bao giờ trả về, nhằm
    [hỗ trợ phân tích khả năng đi tới (reachability analysis)](#never-cho-code-không-thể-đi-tới).
    Nếu bạn không biết mình có cần kiểu đáy hay không, thì nhiều khả năng là không.

## Đảm bảo tính đúng đắn

Chúng ta đã chia vũ trụ kiểu thành hai nửa nullable và non-nullable. Để duy trì soundness
cùng nguyên tắc rằng bạn không bao giờ gặp lỗi tham chiếu null lúc chạy trừ khi bạn tự
chuốc lấy, chúng ta cần đảm bảo `null` không bao giờ xuất hiện trong bất kỳ kiểu nào ở phía
non-nullable.

Việc loại bỏ ép kiểu xuống ngầm định và gỡ `Null` khỏi vai trò kiểu đáy đã bao phủ mọi nơi
chính mà kiểu chảy qua trong chương trình: các phép gán, và từ đối số vào tham số ở lời gọi
hàm. Những chỗ chính còn lại mà `null` có thể lẻn vào là khi một biến vừa được sinh ra, và
khi bạn rời khỏi một hàm. Vì vậy có thêm một số lỗi biên dịch nữa:

### Trả về không hợp lệ

Nếu một hàm có kiểu trả về non-nullable, thì mọi đường đi qua hàm đó đều phải tới được một
câu lệnh `return` có trả về giá trị. Trước null safety, Dart khá dễ dãi với việc thiếu
`return`. Ví dụ:

```dart
// Without null safety:
String missingReturn() {
  // No return.
}
```

Nếu bạn phân tích đoạn này, bạn nhận được một *gợi ý* nhẹ nhàng rằng *có lẽ* bạn quên
`return`, nhưng nếu không thì cũng chẳng sao. Đó là vì nếu việc thực thi đi tới cuối thân
hàm, Dart ngầm trả về `null`. Vì mọi kiểu đều nullable, nên *về mặt kỹ thuật* hàm này an
toàn — dù có lẽ không phải điều bạn muốn.

Với kiểu non-nullable chặt chẽ, chương trình này thẳng thừng là sai và không an toàn. Dưới
null safety, bạn nhận lỗi biên dịch nếu một hàm có kiểu trả về non-nullable mà không trả về
giá trị một cách chắc chắn. Nói "chắc chắn", ý tôi là ngôn ngữ phân tích mọi đường đi điều
khiển luồng qua hàm. Miễn là tất cả chúng đều trả về thứ gì đó, nó hài lòng. Phép phân tích
khá thông minh, nên ngay cả hàm này cũng ổn:

```dart
// Using null safety:
String alwaysReturns(int n) {
  if (n == 0) {
    return 'zero';
  } else if (n < 0) {
    throw ArgumentError('Negative values not allowed.');
  } else {
    if (n > 1000) {
      return 'big';
    } else {
      return n.toString();
    }
  }
}
```

Chúng ta sẽ đi sâu hơn vào cơ chế phân tích luồng mới ở mục kế tiếp.

### Biến chưa khởi tạo

Khi bạn khai báo một biến mà không cho nó biểu thức khởi tạo tường minh, Dart khởi tạo mặc
định biến đó bằng `null`. Điều đó tiện, nhưng rõ ràng hoàn toàn không an toàn nếu kiểu của
biến là non-nullable. Vậy nên ta phải siết chặt lại với biến non-nullable:

*   **Khai báo biến top-level và trường tĩnh bắt buộc phải có biểu thức khởi tạo.** Vì
    chúng có thể được truy cập và gán từ bất cứ đâu trong chương trình, trình biên dịch
    không thể đảm bảo rằng biến đã được gán giá trị trước khi dùng. Lựa chọn an toàn duy
    nhất là bắt buộc chính phần khai báo phải có một biểu thức khởi tạo cho ra giá trị đúng
    kiểu:

    ```dart
    // Using null safety:
    int topLevel = 0;

    class SomeClass {
      static int staticField = 0;
    }
    ```

*   **Trường thể hiện bắt buộc phải hoặc có biểu thức khởi tạo tại chỗ khai báo, hoặc dùng
    initializing formal, hoặc được khởi tạo trong danh sách khởi tạo của constructor.** Nghe
    nhiều thuật ngữ quá. Đây là ví dụ:

    ```dart
    // Using null safety:
    class SomeClass {
      int atDeclaration = 0;
      int initializingFormal;
      int initializationList;

      SomeClass(this.initializingFormal)
          : initializationList = 0;
    }
    ```

    Nói cách khác, miễn là trường có giá trị trước khi bạn tới thân constructor, bạn ổn.

*   Biến cục bộ là trường hợp linh hoạt nhất. Một biến cục bộ non-nullable **không** bắt
    buộc phải có biểu thức khởi tạo. Đoạn này hoàn toàn ổn:

    ```dart
    // Using null safety:
    int tracingFibonacci(int n) {
      int result;
      if (n < 2) {
        result = n;
      } else {
        result = tracingFibonacci(n - 2) + tracingFibonacci(n - 1);
      }

      print(result);
      return result;
    }
    ```

    Quy tắc chỉ là **một biến cục bộ phải được *gán chắc chắn (definitely assigned)* trước
    khi được dùng.** Ta lại dựa vào cơ chế phân tích luồng mới mà tôi đã nhắc tới. Miễn là
    mọi đường đi tới chỗ dùng biến đều khởi tạo nó trước, thì việc dùng đó là ổn.

*   **Tham số tùy chọn bắt buộc phải có giá trị mặc định.** Nếu bạn không truyền đối số cho
    một tham số tùy chọn (theo vị trí hay có tên), ngôn ngữ sẽ điền vào bằng giá trị mặc
    định. Nếu bạn không chỉ định giá trị mặc định, thì giá trị mặc định _mặc nhiên_ là
    `null` — và điều đó không xuôi nếu kiểu của tham số là non-nullable.

    Vậy nên, nếu muốn một tham số là tùy chọn, bạn cần hoặc làm nó nullable, hoặc chỉ định
    một giá trị mặc định hợp lệ khác `null`.

Những hạn chế này nghe có vẻ nặng nề, nhưng trên thực tế chúng không tệ lắm. Chúng rất
giống những hạn chế sẵn có quanh biến `final`, và hẳn bạn đã làm việc với chúng nhiều năm
nay mà chẳng thực sự để ý. Ngoài ra, nhớ rằng những điều này chỉ áp dụng cho biến
*non-nullable*. Bạn luôn có thể làm kiểu đó nullable rồi hưởng cơ chế khởi tạo mặc định
thành `null`.

Dù vậy, các quy tắc này vẫn gây chút cấn cá. May thay, chúng tôi có một bộ tính năng ngôn
ngữ mới để bôi trơn những mẫu code phổ biến nhất mà các giới hạn mới này làm bạn chậm lại.
Nhưng trước hết, đã tới lúc nói về phân tích luồng.

## Phân tích luồng (Flow analysis)

[Phân tích luồng điều khiển][control flow analysis] đã tồn tại trong các trình biên dịch
nhiều năm. Nó chủ yếu ẩn khỏi người dùng và được dùng trong quá trình tối ưu của trình biên
dịch, nhưng một số ngôn ngữ mới hơn đã bắt đầu dùng chính những kỹ thuật đó cho các tính
năng ngôn ngữ nhìn thấy được. Dart vốn đã có một chút phân tích luồng dưới dạng *nâng cấp
kiểu (type promotion)*:

```dart
// With (or without) null safety:
bool isEmptyList(Object object) {
  if (object is List) {
    return object.isEmpty; // <-- OK!
  } else {
    return false;
  }
}
```

[control flow analysis]: https://en.wikipedia.org/wiki/Control_flow_analysis

Để ý rằng ở dòng được đánh dấu, ta gọi được `isEmpty` trên `object`. Phương thức đó được
định nghĩa trên `List`, không phải `Object`. Điều này hoạt động được vì bộ kiểm tra kiểu
xem xét mọi biểu thức `is` và các đường điều khiển luồng trong chương trình. Nếu thân của
một cấu trúc điều khiển luồng nào đó chỉ chạy khi một biểu thức `is` trên một biến là true,
thì bên trong thân đó, kiểu của biến được "nâng cấp" thành kiểu vừa kiểm tra.

Trong ví dụ này, nhánh `then` của câu lệnh `if` chỉ chạy khi `object` thực sự chứa một
list. Do đó, Dart nâng cấp `object` lên kiểu `List` thay vì kiểu khai báo `Object` của nó.
Đây là một tính năng tiện lợi, nhưng khá hạn chế. Trước null safety, chương trình sau — về
mặt chức năng là y hệt — lại không chạy được:

```dart
// Without null safety:
bool isEmptyList(Object object) {
  if (object is! List) return false;
  return object.isEmpty; // <-- Error!
}
```

Một lần nữa, bạn chỉ đi tới được lời gọi `.isEmpty` khi `object` chứa một list, nên chương
trình này đúng về mặt động. Nhưng các quy tắc nâng cấp kiểu chưa đủ thông minh để thấy rằng
câu lệnh `return` nghĩa là câu lệnh thứ hai chỉ đi tới được khi `object` là một list.

Với null safety, chúng tôi đã lấy phép phân tích hạn chế đó và làm cho nó
[mạnh hơn nhiều theo vài hướng][flow analysis].

[flow analysis]: https://github.com/dart-lang/language/blob/main/resources/type-system/flow-analysis.md

### Phân tích khả năng đi tới (Reachability analysis)

Trước hết, chúng tôi đã sửa [lời phàn nàn tồn tại từ lâu][18921] rằng nâng cấp kiểu không
đủ thông minh với các lệnh `return` sớm và những đường code không thể đi tới. Khi phân tích
một hàm, giờ nó tính đến `return`, `break`, `throw`, và mọi cách khác mà việc thực thi có
thể kết thúc sớm trong hàm. Dưới null safety, hàm này:

[18921]: https://github.com/dart-lang/sdk/issues/18921

```dart
// Using null safety:
bool isEmptyList(Object object) {
  if (object is! List) return false;
  return object.isEmpty;
}
```

giờ hoàn toàn hợp lệ. Vì câu lệnh `if` sẽ thoát khỏi hàm khi `object` **không** phải `List`,
Dart nâng cấp `object` thành `List` ở câu lệnh thứ hai. Đây là một cải tiến rất hay, giúp
ích cho rất nhiều code Dart, kể cả những thứ chẳng liên quan gì tới tính nullable.

<a id="never-for-unreachable-code"></a>

### `Never` cho code không thể đi tới

Bạn cũng có thể *lập trình* cho phép phân tích khả năng đi tới này. Kiểu đáy mới `Never`
không có giá trị nào. (Loại giá trị nào mà đồng thời vừa là `String`, vừa là `bool`, vừa là
`int`?) Vậy việc một biểu thức mang kiểu `Never` nghĩa là gì? Nghĩa là biểu thức đó không
bao giờ có thể hoàn tất việc tính toán một cách thành công. Nó phải ném ngoại lệ, hủy bỏ,
hoặc bằng cách nào đó đảm bảo rằng đoạn code xung quanh — vốn đang chờ kết quả của biểu
thức — không bao giờ chạy.

Thực tế, theo ngôn ngữ, kiểu tĩnh của một biểu thức `throw` chính là `Never`. Kiểu `Never`
được khai báo trong thư viện lõi và bạn dùng nó làm chú thích kiểu được. Có lẽ bạn có một
hàm hỗ trợ để việc ném một loại ngoại lệ nào đó dễ hơn:

```dart
// Using null safety:
Never wrongType(String type, Object value) {
  throw ArgumentError('Expected $type, but was ${value.runtimeType}.');
}
```

Bạn có thể dùng nó như sau:

```dart
// Using null safety:
class Point {
  final int x, y;

  Point(this.x, this.y);

  Point operator +(Object other) {
    if (other is int) return Point(x + other, y + other);
    if (other is! Point) wrongType('int | Point', other);

    print('Adding two Point instances together: $this + $other');
    return Point(x + other.x, y + other.y);
  }

  // toString, hashCode, and other implementations...
}
```

Chương trình này phân tích không lỗi. Để ý rằng dòng cuối của phương thức `+` truy cập `.x`
và `.y` trên `other`. Nó đã được nâng cấp thành `Point` dù hàm chẳng có `return` hay `throw`
nào. Phép phân tích điều khiển luồng biết rằng kiểu khai báo của `wrongType()` là `Never`,
nghĩa là nhánh `then` của câu lệnh `if` *bắt buộc* phải hủy bỏ bằng cách nào đó. Vì câu lệnh
cuối cùng chỉ đi tới được khi `other` là một `Point`, Dart nâng cấp nó.

Nói cách khác, việc dùng `Never` trong API của chính bạn cho phép bạn mở rộng phép phân tích
khả năng đi tới của Dart.

### Phân tích gán chắc chắn (Definite assignment analysis)

Tôi đã nhắc ngắn gọn về điều này ở phần biến cục bộ. Dart cần đảm bảo một biến cục bộ
non-nullable luôn được khởi tạo trước khi được đọc. Chúng tôi dùng *phân tích gán chắc chắn*
để linh hoạt nhất có thể trong chuyện này. Ngôn ngữ phân tích từng thân hàm và theo dõi các
phép gán vào biến cục bộ và tham số qua mọi đường điều khiển luồng. Miễn là biến được gán
trên mọi đường đi tới một chỗ dùng nào đó của biến, thì biến được coi là đã khởi tạo. Điều
này cho phép bạn khai báo một biến không có biểu thức khởi tạo rồi khởi tạo nó sau bằng
những luồng điều khiển phức tạp, ngay cả khi biến có kiểu non-nullable.

Chúng tôi cũng dùng phân tích gán chắc chắn để làm biến *final* linh hoạt hơn. Trước null
safety, khá khó dùng `final` cho biến cục bộ nếu bạn cần khởi tạo chúng theo cách hơi phức
tạp một chút:

```dart
// Using null safety:
int tracingFibonacci(int n) {
  final int result;
  if (n < 2) {
    result = n;
  } else {
    result = tracingFibonacci(n - 2) + tracingFibonacci(n - 1);
  }

  print(result);
  return result;
}
```

Đoạn này lẽ ra là lỗi, vì biến `result` là `final` nhưng không có biểu thức khởi tạo. Với
phép phân tích luồng thông minh hơn dưới null safety, chương trình này lại ổn. Phép phân
tích nhận ra rằng `result` chắc chắn được khởi tạo **đúng một lần** trên mọi đường điều
khiển luồng, nên các ràng buộc để đánh dấu một biến là `final` đã được thỏa mãn.

### Nâng cấp kiểu khi kiểm tra null

Phép phân tích luồng thông minh hơn giúp ích cho rất nhiều code Dart, kể cả code không liên
quan tới tính nullable. Nhưng chuyện chúng tôi thực hiện những thay đổi này vào lúc này
không phải trùng hợp. Chúng ta đã chia kiểu thành hai tập nullable và non-nullable. Nếu bạn
có một giá trị thuộc kiểu nullable, bạn chẳng thực sự *làm* được gì hữu ích với nó. Trong
trường hợp giá trị **đúng là** `null`, hạn chế đó là tốt — nó ngăn bạn crash.

Nhưng nếu giá trị **không** phải `null`, sẽ tốt nếu chuyển được nó sang phía non-nullable để
bạn gọi phương thức lên nó. Phân tích luồng là một trong những cách chính để làm điều đó với
biến cục bộ và tham số (và với trường private final, từ Dart 3.2). Chúng tôi đã mở rộng nâng
cấp kiểu để nó xét cả các biểu thức `== null` và `!= null`.

Nếu bạn kiểm tra một biến cục bộ kiểu nullable xem nó có khác `null` không, Dart sẽ nâng cấp
biến đó lên kiểu nền non-nullable:

```dart
// Using null safety:
String makeCommand(String executable, [List<String>? arguments]) {
  var result = executable;
  if (arguments != null) {
    result += ' ' + arguments.join(' ');
  }
  return result;
}
```

Ở đây, `arguments` có kiểu nullable. Bình thường điều đó cấm bạn gọi `.join()` lên nó. Nhưng
vì ta đã bao lời gọi ấy trong một câu lệnh `if` kiểm tra rằng giá trị khác `null`, Dart nâng
cấp nó từ `List<String>?` lên `List<String>` và cho phép bạn gọi phương thức lên nó hoặc
truyền nó cho những hàm mong đợi list non-nullable.

Nghe có vẻ là chuyện khá nhỏ, nhưng chính việc nâng cấp dựa trên luồng khi kiểm tra null này
mới là thứ khiến phần lớn code Dart hiện có chạy được dưới null safety. Đa số code Dart
**đúng** về mặt động và có tránh ném lỗi tham chiếu null bằng cách kiểm tra `null` trước khi
gọi phương thức. Phép phân tích luồng mới trên các kiểm tra null biến sự đúng đắn *động* đó
thành sự đúng đắn *tĩnh* chứng minh được.

Và tất nhiên, nó cũng phối hợp với phép phân tích thông minh hơn về khả năng đi tới. Hàm ở
trên hoàn toàn có thể viết lại thành:

```dart
// Using null safety:
String makeCommand(String executable, [List<String>? arguments]) {
  var result = executable;
  if (arguments == null) return result;
  return result + ' ' + arguments.join(' ');
}
```

Ngôn ngữ cũng thông minh hơn về việc loại biểu thức nào gây nâng cấp kiểu. Một `== null` hay
`!= null` tường minh thì tất nhiên là được. Nhưng phép ép kiểu tường minh bằng `as`, hoặc
phép gán, hoặc toán tử hậu tố `!` (sẽ nói tới
[ở phần sau](#toán-tử-khẳng-định-khác-null)) cũng gây nâng cấp. Mục tiêu chung là: nếu code
đúng về mặt động và việc suy ra điều đó một cách tĩnh là hợp lý, thì phép phân tích nên đủ
thông minh để làm được.

Lưu ý rằng nâng cấp kiểu ban đầu chỉ hoạt động với biến cục bộ, và từ Dart 3.2 thì hoạt
động với cả trường private final. Để biết thêm về việc làm việc với biến không cục bộ, xem
[Làm việc với trường nullable](#làm-việc-với-trường-nullable).

### Cảnh báo code thừa

Việc có phép phân tích khả năng đi tới thông minh hơn và biết được `null` chảy qua đâu trong
chương trình giúp bạn *thêm* code xử lý `null`. Nhưng ta cũng dùng chính phép phân tích đó
để phát hiện đoạn code bạn *không* cần. Trước null safety, nếu bạn viết:

```dart
// Using null safety:
String checkList(List<Object> list) {
  if (list?.isEmpty ?? false) {
    return 'Got nothing';
  }
  return 'Got something';
}
```

Dart không có cách nào biết được toán tử null-aware `?.` đó có ích hay không. Theo nó biết
thì bạn hoàn toàn có thể truyền `null` vào hàm. Nhưng trong Dart null-safe, nếu bạn đã chú
thích hàm bằng kiểu `List` giờ đã non-nullable, thì nó biết `list` không bao giờ là `null`.
Điều đó hàm ý `?.` sẽ chẳng bao giờ làm gì hữu ích, và bạn nên (và có thể) chỉ dùng `.`.

Để giúp bạn đơn giản hóa code, chúng tôi đã thêm cảnh báo cho những đoạn code thừa kiểu này,
giờ khi phân tích tĩnh đã đủ chính xác để phát hiện chúng. Việc dùng toán tử null-aware, hay
thậm chí một phép kiểm tra như `== null` hoặc `!= null` trên kiểu non-nullable, đều bị báo
cáo là cảnh báo.

Và tất nhiên, điều này cũng phối hợp với việc nâng cấp lên kiểu non-nullable. Một khi biến
đã được nâng cấp thành kiểu non-nullable, bạn sẽ nhận cảnh báo nếu lại kiểm tra `null` cho
nó một cách thừa thãi:

```dart
// Using null safety:
String checkList(List<Object>? list) {
  if (list == null) return 'No list';
  if (list?.isEmpty ?? false) {
    return 'Empty list';
  }
  return 'Got something';
}
```

Bạn nhận cảnh báo ở chỗ `?.` này, vì tại thời điểm nó chạy, ta đã biết `list` không thể là
`null`. Mục tiêu của những cảnh báo này không chỉ là dọn dẹp code vô nghĩa. Bằng cách loại
bỏ những kiểm tra `null` *không cần thiết*, ta đảm bảo rằng những kiểm tra có ý nghĩa còn
lại sẽ nổi bật lên. Chúng tôi muốn bạn nhìn vào code của mình và *thấy* được `null` có thể
chảy qua đâu.

## Làm việc với kiểu nullable

Giờ ta đã dồn `null` vào tập các kiểu nullable. Với phân tích luồng, ta có thể an toàn cho
một số giá trị khác `null` nhảy rào sang phía non-nullable, nơi ta dùng được chúng. Đó là
một bước lớn, nhưng nếu dừng ở đây, hệ thống thu được vẫn còn hạn chế đến mức khó chịu. Phân
tích luồng chỉ giúp được với biến cục bộ, tham số, và trường private final.

Để cố lấy lại càng nhiều càng tốt sự linh hoạt mà Dart từng có trước null safety — và ở vài
chỗ còn vượt lên trên nó — chúng tôi có thêm một số tính năng mới.

### Phương thức null-aware thông minh hơn

Toán tử null-aware `?.` của Dart già hơn null safety nhiều. Ngữ nghĩa lúc chạy của nó quy
định rằng nếu đối tượng nhận là `null` thì phép truy cập thuộc tính ở vế phải sẽ bị bỏ qua
và biểu thức cho ra `null`:

```dart
// Without null safety:
String notAString = null;
print(notAString?.length);
```

Thay vì ném ngoại lệ, đoạn này in ra "null". Toán tử null-aware là một công cụ hay để làm
kiểu nullable dùng được trong Dart. Dù không thể cho bạn gọi phương thức trên kiểu nullable,
chúng tôi vẫn cho phép bạn dùng toán tử null-aware trên chúng. Phiên bản sau null safety của
chương trình là:

```dart
// Using null safety:
String? notAString = null;
print(notAString?.length);
```

Nó hoạt động y như đoạn trước.

Tuy nhiên, nếu từng dùng toán tử null-aware trong Dart, hẳn bạn đã gặp phiền toái khi dùng
chúng trong chuỗi phương thức. Giả sử bạn muốn xem độ dài của một chuỗi có thể vắng mặt có
phải số chẵn không (một bài toán không mấy thực tế, tôi biết, nhưng cứ theo tôi đã):

```dart
// Using null safety:
String? notAString = null;
print(notAString?.length.isEven);
```

Dù chương trình này có dùng `?.`, nó vẫn ném ngoại lệ lúc chạy. Vấn đề là đối tượng nhận của
biểu thức `.isEven` chính là kết quả của toàn bộ biểu thức `notAString?.length` bên trái nó.
Biểu thức đó cho ra `null`, nên ta gặp lỗi tham chiếu null khi cố gọi `.isEven`. Nếu từng
dùng `?.` trong Dart, hẳn bạn đã học được bài học đau đớn rằng bạn phải áp toán tử null-aware
lên **mọi** thuộc tính hay phương thức trong chuỗi, sau khi đã dùng nó một lần:

```dart
String? notAString = null;
print(notAString?.length?.isEven);
```

Chuyện này phiền, nhưng tệ hơn, nó che mất thông tin quan trọng. Hãy xem:

```dart
// Using null safety:
showGizmo(Thing? thing) {
  print(thing?.doohickey?.gizmo);
}
```

Đây là câu hỏi cho bạn: getter `doohickey` trên `Thing` có thể trả về `null` không? Trông
như nó *có thể*, vì bạn đang dùng `?.` lên kết quả. Nhưng cũng có thể `?.` thứ hai chỉ ở đó
để xử lý trường hợp `thing` là `null`, chứ không phải kết quả của `doohickey`. Bạn không thể
biết được.

Để giải quyết, chúng tôi mượn một ý tưởng thông minh từ thiết kế cùng tính năng này của C#.
Khi bạn dùng toán tử null-aware trong một chuỗi phương thức, nếu đối tượng nhận cho ra
`null` thì *toàn bộ phần còn lại của chuỗi phương thức sẽ bị cắt ngắn (short-circuit) và bỏ
qua*. Nghĩa là nếu `doohickey` có kiểu trả về non-nullable, thì bạn có thể và nên viết:

```dart
// Using null safety:
void showGizmo(Thing? thing) {
  print(thing?.doohickey.gizmo);
}
```

Thực tế, bạn sẽ nhận cảnh báo code thừa ở `?.` thứ hai nếu không làm vậy. Nếu bạn thấy code
kiểu:

```dart
// Using null safety:
void showGizmo(Thing? thing) {
  print(thing?.doohickey?.gizmo);
}
```

thì bạn biết chắc rằng chính `doohickey` có kiểu trả về nullable. Mỗi `?.` tương ứng với một
đường đi *riêng biệt* có thể khiến `null` chảy vào chuỗi phương thức. Điều này khiến toán tử
null-aware trong chuỗi phương thức vừa ngắn gọn hơn vừa chính xác hơn.

Nhân tiện, chúng tôi cũng thêm vài toán tử null-aware khác:

```dart
// Using null safety:

// Null-aware cascade:
receiver?..method();

// Null-aware index operator:
receiver?[index];
```

Không có toán tử gọi hàm null-aware, nhưng bạn có thể viết:

```dart
// Allowed with or without null safety:
function?.call(arg1, arg2);
```

<a id="null-assertion-operator"></a>
<a id="non-null-assertion-operator"></a>
<a id="not-null-assertion-operator"></a>

### Toán tử khẳng định khác null

Điều tuyệt vời của việc dùng phân tích luồng để chuyển một biến nullable sang phía
non-nullable là việc đó **chứng minh được** là an toàn. Bạn gọi được phương thức trên biến
vốn nullable mà không phải hy sinh chút an toàn hay hiệu năng nào của kiểu non-nullable.

Nhưng nhiều cách dùng hợp lệ của kiểu nullable lại không thể *chứng minh* là an toàn theo
cách làm hài lòng phân tích tĩnh. Ví dụ:

```dart
// Using null safety, incorrectly:
class HttpResponse {
  final int code;
  final String? error;

  HttpResponse.ok()
      : code = 200,
        error = null;
  HttpResponse.notFound()
      : code = 404,
        error = 'Not found';

  @override
  String toString() {
    if (code == 200) return 'OK';
    return 'ERROR $code ${error.toUpperCase()}';
  }
}
```

Nếu thử chạy, bạn nhận lỗi biên dịch ở lời gọi `toUpperCase()`. Trường `error` là nullable
vì nó sẽ không có giá trị trong một phản hồi thành công. Nhìn vào lớp này, ta thấy rằng ta
không bao giờ truy cập thông điệp `error` khi nó là `null`. Nhưng để thấy điều đó cần hiểu
mối quan hệ giữa giá trị của `code` và tính nullable của `error`. Bộ kiểm tra kiểu không
thấy được mối liên hệ ấy.

Nói cách khác, những con người bảo trì code là chúng ta thì *biết* rằng `error` sẽ không
`null` tại thời điểm ta dùng nó, và ta cần một cách để khẳng định điều đó. Bình thường, bạn
khẳng định kiểu bằng phép ép `as`, và ở đây bạn cũng làm được điều tương tự:

```dart
// Using null safety:
String toString() {
  if (code == 200) return 'OK';
  return 'ERROR $code ${(error as String).toUpperCase()}';
}
```

Ép `error` về kiểu `String` non-nullable sẽ ném ngoại lệ lúc chạy nếu phép ép thất bại.
Ngược lại, nó cho ta một chuỗi non-nullable mà ta gọi phương thức lên được.

Chuyện "ép bỏ tính nullable" xuất hiện đủ thường xuyên nên chúng tôi có một cú pháp rút gọn
mới. Dấu chấm than hậu tố (`!`) lấy biểu thức bên trái và ép nó về kiểu non-nullable nền
tương ứng. Vậy nên hàm ở trên tương đương với:

```dart
// Using null safety:
String toString() {
  if (code == 200) return 'OK';
  return 'ERROR $code ${error!.toUpperCase()}';
}
```

Cái "toán tử bang" một ký tự này đặc biệt tiện khi kiểu nền dài dòng. Sẽ rất khó chịu nếu
phải viết `as Map<TransactionProviderFactory, List<Set<ResponseFilter>>>` chỉ để ép bỏ đúng
một dấu `?` khỏi một kiểu nào đó.

Tất nhiên, như mọi phép ép kiểu, dùng `!` đi kèm việc đánh mất an toàn tĩnh. Phép ép phải
được kiểm tra lúc chạy để giữ soundness, và nó có thể thất bại rồi ném ngoại lệ. Nhưng bạn
kiểm soát được nơi những phép ép này được chèn vào, và bạn luôn nhìn thấy chúng khi đọc qua
code.

### Biến `late`

Nơi phổ biến nhất mà bộ kiểm tra kiểu không chứng minh được tính an toàn của code là quanh
biến top-level và trường. Đây là một ví dụ:

```dart
// Using null safety, incorrectly:
class Coffee {
  String _temperature;

  void heat() { _temperature = 'hot'; }
  void chill() { _temperature = 'iced'; }

  String serve() => _temperature + ' coffee';
}

void main() {
  var coffee = Coffee();
  coffee.heat();
  coffee.serve();
}
```

Ở đây, phương thức `heat()` được gọi trước `serve()`. Nghĩa là `_temperature` sẽ được khởi
tạo bằng một giá trị khác null trước khi được dùng. Nhưng phân tích tĩnh không khả thi để
xác định điều đó. (Với một ví dụ tầm thường như thế này thì có thể làm được, nhưng trường
hợp tổng quát — cố theo dõi trạng thái của từng thể hiện của một lớp — là bất khả thi.)

Vì bộ kiểm tra kiểu không phân tích được cách dùng trường và biến top-level, nó áp một quy
tắc thận trọng là trường non-nullable phải được khởi tạo hoặc tại chỗ khai báo (hoặc trong
danh sách khởi tạo của constructor với trường thể hiện). Vậy nên Dart báo lỗi biên dịch ở
lớp này.

Bạn có thể sửa lỗi bằng cách làm trường đó nullable rồi dùng toán tử khẳng định khác null ở
những chỗ sử dụng:

```dart
// Using null safety:
class Coffee {
  String? _temperature;

  void heat() { _temperature = 'hot'; }
  void chill() { _temperature = 'iced'; }

  String serve() => _temperature! + ' coffee';
}
```

Cách này chạy tốt. Nhưng nó gửi một tín hiệu gây nhầm lẫn tới người bảo trì lớp. Bằng cách
đánh dấu `_temperature` là nullable, bạn hàm ý rằng `null` là một giá trị hữu ích, có ý
nghĩa với trường đó. Nhưng đó không phải ý định. Trường `_temperature` lẽ ra không bao giờ
nên bị *quan sát thấy* ở trạng thái `null`.

Để xử lý mẫu phổ biến "trạng thái có khởi tạo trễ", chúng tôi đã thêm một từ khóa bổ nghĩa
mới: `late`. Bạn dùng nó như sau:

```dart
// Using null safety:
class Coffee {
  late String _temperature;

  void heat() { _temperature = 'hot'; }
  void chill() { _temperature = 'iced'; }

  String serve() => _temperature + ' coffee';
}
```

Lưu ý rằng trường `_temperature` có kiểu non-nullable, nhưng không được khởi tạo. Ngoài ra,
không có phép khẳng định khác null tường minh nào ở chỗ dùng. Có vài cách hình dung về ngữ
nghĩa của `late`, nhưng tôi nghĩ về nó thế này: từ khóa `late` nghĩa là "hãy áp đặt các ràng
buộc của biến này tại thời điểm chạy thay vì tại thời điểm biên dịch". Gần như thể chữ
"late" mô tả *khi nào* nó áp đặt những đảm bảo của biến.

Trong trường hợp này, vì trường không được khởi tạo chắc chắn, mỗi lần trường được đọc, một
phép kiểm tra lúc chạy sẽ được chèn vào để đảm bảo nó đã được gán giá trị. Nếu chưa, một
ngoại lệ được ném ra. Việc cho biến kiểu `String` nghĩa là "bạn không bao giờ nên thấy tôi
mang giá trị nào khác một chuỗi", còn từ khóa `late` nghĩa là "hãy xác minh điều đó lúc
chạy".

Ở một khía cạnh nào đó, từ khóa `late` "ma thuật" hơn việc dùng `?`, vì bất kỳ chỗ dùng nào
của trường cũng có thể thất bại, mà lại chẳng có gì nhìn thấy được ngay tại chỗ dùng. Nhưng
bạn **buộc** phải viết `late` ở chỗ khai báo để có hành vi này, và chúng tôi tin rằng nhìn
thấy từ khóa ở đó là đủ tường minh để code vẫn dễ bảo trì.

Đổi lại, bạn có được an toàn tĩnh tốt hơn so với dùng kiểu nullable. Vì kiểu của trường giờ
là non-nullable, việc cố gán `null` hay một `String` nullable cho trường là lỗi *biên dịch*.
Từ khóa `late` cho phép bạn *hoãn* việc khởi tạo, nhưng vẫn cấm bạn đối xử với nó như một
biến nullable.

### Khởi tạo trễ (Lazy initialization)

Từ khóa `late` còn có vài siêu năng lực đặc biệt khác. Nghe có vẻ nghịch lý, nhưng bạn dùng
được `late` trên một trường **có** biểu thức khởi tạo:

```dart
// Using null safety:
class Weather {
  late int _temperature = _readThermometer();
}
```

Khi bạn làm vậy, biểu thức khởi tạo trở nên *lười (lazy)*. Thay vì chạy ngay khi thể hiện
được tạo, nó bị hoãn lại và chạy trễ vào lần đầu tiên trường được truy cập. Nói cách khác,
nó hoạt động y hệt một biểu thức khởi tạo trên biến top-level hay trường tĩnh. Điều này tiện
khi biểu thức khởi tạo tốn kém và có thể không cần đến.

Việc chạy biểu thức khởi tạo theo kiểu lười còn cho bạn một phần thưởng nữa khi dùng `late`
trên trường thể hiện. Thông thường, biểu thức khởi tạo của trường thể hiện không truy cập
được `this`, vì bạn chưa có quyền truy cập object mới cho tới khi mọi biểu thức khởi tạo
trường hoàn tất. Nhưng với trường `late`, điều đó không còn đúng, nên bạn **có thể** truy
cập `this`, gọi phương thức, hay truy cập trường trên thể hiện.

### Biến `late final`

Bạn cũng có thể kết hợp `late` với `final`:

```dart
// Using null safety:
class Coffee {
  late final String _temperature;

  void heat() { _temperature = 'hot'; }
  void chill() { _temperature = 'iced'; }

  String serve() => _temperature + ' coffee';
}
```

Khác với trường `final` thông thường, bạn không phải khởi tạo trường ngay tại chỗ khai báo
hay trong danh sách khởi tạo của constructor. Bạn gán cho nó về sau lúc chạy cũng được.
Nhưng bạn chỉ gán được **một lần**, và điều đó được kiểm tra lúc chạy. Nếu bạn cố gán nhiều
hơn một lần — chẳng hạn gọi cả `heat()` lẫn `chill()` ở đây — phép gán thứ hai sẽ ném ngoại
lệ. Đây là cách rất hay để mô hình hóa trạng thái được khởi tạo về sau rồi bất biến từ đó.

Nói cách khác, từ khóa `late` mới, kết hợp với các từ khóa bổ nghĩa biến khác của Dart, bao
phủ hầu hết không gian tính năng của `lateinit` trong Kotlin và `lazy` trong Swift. Bạn thậm
chí dùng được nó trên biến cục bộ nếu muốn một chút tính toán lười cục bộ.

### Tham số có tên bắt buộc

Để đảm bảo bạn không bao giờ thấy một tham số `null` mang kiểu non-nullable, bộ kiểm tra
kiểu yêu cầu mọi tham số tùy chọn hoặc phải có kiểu nullable, hoặc phải có giá trị mặc định.
Vậy nếu bạn muốn một tham số có tên mang kiểu non-nullable và không có giá trị mặc định thì
sao? Điều đó hàm ý bạn muốn bắt buộc bên gọi *luôn* phải truyền nó. Nói cách khác, bạn muốn
một tham số **có tên** nhưng **không tùy chọn**.

Tôi hình dung các loại tham số của Dart bằng bảng này:

```plaintext
             mandatory    optional
            +------------+------------+
positional  | f(int x)   | f([int x]) |
            +------------+------------+
named       | ???        | f({int x}) |
            +------------+------------+
```

> *Diễn giải:* `mandatory` = bắt buộc, `optional` = tùy chọn; `positional` = theo vị trí,
> `named` = có tên.

Vì lý do không rõ, Dart từ lâu đã hỗ trợ ba góc của bảng này nhưng để trống ô kết hợp
có-tên + bắt-buộc. Với null safety, chúng tôi đã điền vào đó. Bạn khai báo một tham số có
tên bắt buộc bằng cách đặt `required` trước tham số:

```dart
// Using null safety:
function({int? a, required int? b, int? c, required int? d}) {}
```

Ở đây, mọi tham số đều phải được truyền theo tên. Tham số `a` và `c` là tùy chọn và có thể
bỏ qua. Tham số `b` và `d` là bắt buộc và phải được truyền. Lưu ý rằng tính bắt buộc độc lập
với tính nullable. Bạn có thể có tham số có tên bắt buộc mang kiểu nullable, và tham số có
tên tùy chọn mang kiểu non-nullable (nếu chúng có giá trị mặc định).

Đây là một trong những tính năng mà tôi nghĩ làm Dart tốt hơn bất kể có null safety hay
không. Nó đơn giản khiến ngôn ngữ có cảm giác hoàn chỉnh hơn với tôi.

### Trường trừu tượng (Abstract fields)

Một trong những tính năng gọn gàng của Dart là nó tuân thủ thứ gọi là
[nguyên tắc truy cập đồng nhất (uniform access principle)][uniform access principle]. Nói
theo ngôn ngữ con người, nghĩa là không phân biệt được trường với cặp getter/setter. Việc
một "thuộc tính" nào đó trong một lớp Dart là được tính ra hay được lưu trữ chỉ là chi tiết
cài đặt. Vì thế, khi định nghĩa một interface bằng lớp trừu tượng, người ta thường dùng khai
báo trường:

[uniform access principle]: https://en.wikipedia.org/wiki/Uniform_access_principle

```dart
abstract class Cup {
  Beverage contents;
}
```

Ý định ở đây là người dùng chỉ `implements` lớp đó chứ không `extends` nó. Cú pháp trường
đơn giản là cách viết ngắn hơn cho một cặp getter/setter:

```dart
abstract class Cup {
  Beverage get contents;
  set contents(Beverage);
}
```

Nhưng Dart không *biết* rằng lớp này sẽ không bao giờ được dùng như một kiểu cụ thể. Nó thấy
khai báo `contents` là một trường thật. Và không may, trường đó là non-nullable và không có
biểu thức khởi tạo, nên bạn nhận lỗi biên dịch.

Một cách sửa là dùng khai báo getter/setter trừu tượng tường minh như ví dụ thứ hai. Nhưng
cách đó hơi dài dòng, nên với null safety chúng tôi cũng bổ sung hỗ trợ cho khai báo trường
trừu tượng tường minh:

```dart
abstract class Cup {
  abstract Beverage contents;
}
```

Đoạn này hành xử y hệt ví dụ thứ hai. Nó đơn giản khai báo một getter và một setter trừu
tượng với tên và kiểu cho trước.

<a id="working-with-nullable-fields"></a>

### Làm việc với trường nullable

Những tính năng mới này bao phủ nhiều mẫu code phổ biến và khiến việc làm việc với `null`
khá nhẹ nhàng trong hầu hết trường hợp. Nhưng dù vậy, kinh nghiệm của chúng tôi là trường
nullable vẫn có thể khó nhằn. Trong những trường hợp bạn làm cho trường thành `late` và
non-nullable được, thì bạn quá ổn. Nhưng nhiều khi bạn cần *kiểm tra* xem trường có giá trị
hay không, và điều đó đòi hỏi phải làm nó nullable để bạn quan sát được `null`.

Trường nullable vừa private vừa final thì nâng cấp kiểu được (trừ
[một số lý do đặc thù](https://dart.dev/tools/non-promotion-reasons)). Nếu vì lý do nào đó
bạn không thể làm cho trường vừa private vừa final, bạn vẫn cần một cách lách.

Chẳng hạn, bạn có thể trông đợi đoạn này chạy được:

```dart
// Using null safety, incorrectly:
class Coffee {
  String? _temperature;

  void heat() { _temperature = 'hot'; }
  void chill() { _temperature = 'iced'; }

  void checkTemp() {
    if (_temperature != null) {
      print('Ready to serve ' + _temperature + '!');
    }
  }

  String serve() => _temperature! + ' coffee';
}
```

Bên trong `checkTemp()`, ta kiểm tra xem `_temperature` có `null` không. Nếu không, ta truy
cập nó rồi gọi `+` lên nó. Không may, việc này không được phép.

Nâng cấp kiểu dựa trên luồng chỉ áp dụng được cho những trường **vừa private vừa final**.
Ngoài ra, phân tích tĩnh không thể *chứng minh* rằng giá trị của trường không thay đổi giữa
thời điểm bạn kiểm tra `null` và thời điểm bạn dùng nó. (Hãy nghĩ tới trường hợp bệnh hoạn:
chính trường đó có thể bị ghi đè bởi một getter trong lớp con, và getter ấy trả về `null` ở
lần gọi thứ hai.)

Vậy nên, vì chúng tôi quan tâm tới soundness, trường công khai và/hoặc không final thì
không nâng cấp được, và phương thức ở trên không biên dịch được. Chuyện này phiền. Trong
những trường hợp đơn giản như ở đây, cách tốt nhất là dán một dấu `!` vào chỗ dùng trường.
Trông có vẻ thừa, nhưng đó ít nhiều chính là cách Dart hành xử ngày nay.

Một mẫu khác cũng có ích là sao chép trường vào một biến cục bộ trước rồi dùng biến đó thay
thế:

```dart
// Using null safety:
void checkTemp() {
  var temperature = _temperature;
  if (temperature != null) {
    print('Ready to serve ' + temperature + '!');
  }
}
```

Vì nâng cấp kiểu **có** áp dụng cho biến cục bộ, giờ đoạn này chạy tốt. Nếu bạn cần *thay
đổi* giá trị, chỉ cần nhớ ghi ngược lại vào trường chứ không chỉ vào biến cục bộ.

Để biết thêm về cách xử lý những vấn đề nâng cấp kiểu này và các vấn đề khác, xem
[Fixing type promotion failures](https://dart.dev/tools/non-promotion-reasons).

### Tính nullable và generics

Như hầu hết ngôn ngữ định kiểu tĩnh hiện đại, Dart có lớp generic và phương thức generic.
Chúng tương tác với tính nullable theo vài cách thoạt nhìn phản trực giác, nhưng lại hợp lý
khi bạn nghĩ thấu các hệ quả. Đầu tiên là "kiểu này có nullable không?" không còn là câu hỏi
có/không đơn giản nữa. Hãy xem:

```dart
// Using null safety:
class Box<T> {
  final T object;
  Box(this.object);
}

void main() {
  Box<String>('a string');
  Box<int?>(null);
}
```

Trong định nghĩa của `Box`, `T` là kiểu nullable hay non-nullable? Như bạn thấy, nó có thể
được khởi tạo bằng cả hai loại. Câu trả lời là `T` là một *kiểu có tiềm năng nullable
(potentially nullable type)*. Bên trong thân của một lớp hay phương thức generic, kiểu có
tiềm năng nullable mang **cả** những hạn chế của kiểu nullable **lẫn** của kiểu
non-nullable.

Vế trước nghĩa là bạn không gọi được phương thức nào lên nó ngoại trừ số ít phương thức được
định nghĩa trên `Object`. Vế sau nghĩa là bạn phải khởi tạo mọi trường hay biến thuộc kiểu
đó trước khi dùng. Điều này khiến tham số kiểu khá khó làm việc cùng.

Trên thực tế, có vài mẫu thường xuất hiện. Với những lớp kiểu collection, nơi tham số kiểu
có thể được khởi tạo bằng bất kỳ kiểu nào, bạn chỉ đành chấp nhận các hạn chế. Trong hầu hết
trường hợp, như ví dụ ở đây, nghĩa là phải đảm bảo bạn thực sự có sẵn một giá trị thuộc kiểu
của đối số kiểu mỗi khi cần làm việc với nó. May thay, lớp kiểu collection hiếm khi gọi
phương thức lên các phần tử của nó.

Ở những chỗ bạn không có sẵn giá trị, bạn có thể làm cho chỗ dùng tham số kiểu trở nên
nullable:

```dart
// Using null safety:
class Box<T> {
  T? object;
  Box.empty();
  Box.full(this.object);
}
```

Để ý dấu `?` ở khai báo của `object`. Giờ trường có kiểu nullable tường minh, nên để nó chưa
khởi tạo cũng không sao.

Khi bạn làm cho một tham số kiểu trở nên nullable như `T?` ở đây, bạn có thể cần ép bỏ tính
nullable. Cách đúng để làm điều đó là dùng phép ép tường minh `as T`, **không phải** toán tử
`!`:

```dart
// Using null safety:
class Box<T> {
  T? object;
  Box.empty();
  Box.full(this.object);

  T unbox() => object as T;
}
```

Toán tử `!` **luôn** ném ngoại lệ nếu giá trị là `null`. Nhưng nếu tham số kiểu đã được khởi
tạo bằng một kiểu nullable, thì `null` là một giá trị hoàn toàn hợp lệ cho `T`:

```dart
// Using null safety:
void main() {
  var box = Box<int?>.full(null);
  print(box.unbox());
}
```

Chương trình này lẽ ra phải chạy không lỗi. Dùng `as T` đạt được điều đó. Dùng `!` thì sẽ
ném ngoại lệ.

Những kiểu generic khác có chặn (bound) giới hạn loại đối số kiểu được phép áp dụng:

```dart
// Using null safety:
class Interval<T extends num> {
  T min, max;

  Interval(this.min, this.max);

  bool get isEmpty => max <= min;
}
```

Nếu chặn là non-nullable, thì tham số kiểu cũng là non-nullable. Nghĩa là bạn chịu những
hạn chế của kiểu non-nullable — bạn không được để trường và biến chưa khởi tạo. Lớp ví dụ ở
đây bắt buộc phải có constructor khởi tạo các trường.

Đổi lại hạn chế đó, bạn gọi được lên giá trị thuộc kiểu tham số bất kỳ phương thức nào được
khai báo trên chặn của nó. Tuy nhiên, việc có chặn non-nullable cũng ngăn *người dùng* lớp
generic của bạn khởi tạo nó với một đối số kiểu nullable. Đó có lẽ là giới hạn hợp lý với
hầu hết các lớp.

Bạn cũng có thể dùng **chặn** nullable:

```dart
// Using null safety:
class Interval<T extends num?> {
  T min, max;

  Interval(this.min, this.max);

  bool get isEmpty {
    var localMin = min;
    var localMax = max;

    // No min or max means an open-ended interval.
    if (localMin == null || localMax == null) return false;
    return localMax <= localMin;
  }
}
```

> *Diễn giải:* không có `min` hay `max` nghĩa là một khoảng mở.

Điều này nghĩa là trong thân lớp, bạn có được sự linh hoạt khi coi tham số kiểu là nullable,
nhưng bạn cũng chịu các giới hạn của tính nullable. Bạn không gọi được gì lên một biến thuộc
kiểu đó trừ khi xử lý tính nullable trước đã. Trong ví dụ này, ta sao chép các trường vào
biến cục bộ rồi kiểm tra `null` cho các biến cục bộ đó, để phân tích luồng nâng cấp chúng
thành kiểu non-nullable trước khi dùng `<=`.

Lưu ý rằng chặn nullable **không** ngăn người dùng khởi tạo lớp với kiểu non-nullable. Chặn
nullable nghĩa là đối số kiểu *có thể* nullable, chứ không phải *bắt buộc* phải vậy. (Thực
tế, chặn mặc định cho tham số kiểu khi bạn không viết mệnh đề `extends` chính là chặn
nullable `Object?`.) Không có cách nào để *bắt buộc* một đối số kiểu phải nullable. Nếu bạn
muốn những chỗ dùng tham số kiểu chắc chắn là nullable và được ngầm khởi tạo thành `null`,
bạn có thể dùng `T?` bên trong thân lớp.

## Thay đổi trong thư viện lõi

Còn vài điều chỉnh nhỏ khác rải rác trong ngôn ngữ, nhưng chúng không đáng kể. Kiểu như kiểu
mặc định của một `catch` không có mệnh đề `on` giờ là `Object` thay vì `dynamic`. Phép phân
tích rơi-xuống (fallthrough) trong câu lệnh `switch` dùng cơ chế phân tích luồng mới.

Những thay đổi còn lại thực sự quan trọng với bạn nằm ở thư viện lõi. Trước khi dấn thân vào
Cuộc Phiêu Lưu Null Safety Vĩ Đại, chúng tôi từng lo rằng hóa ra sẽ không có cách nào làm
thư viện lõi null-safe mà không phá vỡ cả thế giới. Kết quả không đến nỗi thảm khốc như vậy.
**Có** vài thay đổi đáng kể, nhưng phần lớn thì việc chuyển đổi diễn ra suôn sẻ. Hầu hết thư
viện lõi hoặc vốn không nhận `null` và chuyển sang kiểu non-nullable một cách tự nhiên, hoặc
có nhận và tiếp nhận nó một cách duyên dáng với kiểu nullable.

Tuy nhiên, có vài góc quan trọng:

### Toán tử chỉ số của Map là nullable

Đây không hẳn là một thay đổi, mà là một điều nên biết. Toán tử chỉ số `[]` trên lớp `Map`
trả về `null` nếu khóa không tồn tại. Điều đó hàm ý kiểu trả về của toán tử ấy phải là
nullable: `V?` thay vì `V`.

Chúng tôi đã có thể đổi phương thức đó để ném ngoại lệ khi khóa không tồn tại, rồi cho nó
kiểu trả về non-nullable dễ dùng hơn. Nhưng code dùng toán tử chỉ số rồi kiểm tra `null` để
xem khóa có vắng mặt không thì rất phổ biến — khoảng một nửa tổng số lần dùng, theo phân
tích của chúng tôi. Phá vỡ toàn bộ đống code đó sẽ khiến hệ sinh thái Dart bốc cháy.

Thay vào đó, hành vi lúc chạy giữ nguyên và do đó kiểu trả về buộc phải là nullable. Nghĩa
là nhìn chung bạn không dùng ngay được kết quả của một phép tra cứu map:

```dart
// Using null safety, incorrectly:
var map = {'key': 'value'};
print(map['key'].length); // Error.
```

Đoạn này cho bạn lỗi biên dịch khi cố gọi `.length` trên một chuỗi nullable. Trong trường
hợp bạn *biết* khóa có tồn tại, bạn có thể dạy cho bộ kiểm tra kiểu bằng `!`:

```dart
// Using null safety:
var map = {'key': 'value'};
print(map['key']!.length); // OK.
```

Chúng tôi từng cân nhắc thêm một phương thức khác cho `Map` để làm việc này giúp bạn: tra
cứu khóa, ném ngoại lệ nếu không tìm thấy, hoặc trả về một giá trị non-nullable. Nhưng gọi
nó là gì? Không cái tên nào ngắn hơn ký tự đơn `!`, và không tên phương thức nào rõ hơn việc
nhìn thấy một dấu `!` với ngữ nghĩa dựng sẵn của nó ngay tại chỗ gọi. Vậy nên cách đúng
phong cách để truy cập một phần tử chắc chắn có trong map là dùng `[]!`. Rồi bạn sẽ quen
thôi.

### Không còn constructor không tên của List

Constructor không tên trên `List` tạo ra một list mới với kích thước cho trước nhưng không
khởi tạo phần tử nào. Điều này sẽ chọc một lỗ hổng rất lớn vào các đảm bảo soundness, nếu
bạn tạo một list thuộc kiểu non-nullable rồi truy cập một phần tử.

Để tránh điều đó, chúng tôi đã gỡ bỏ hoàn toàn constructor này. Gọi `List()` trong code
null-safe là lỗi, kể cả với kiểu nullable. Nghe đáng sợ, nhưng trên thực tế hầu hết code đều
tạo list bằng list literal, `List.filled()`, `List.generate()`, hoặc từ kết quả biến đổi một
collection khác. Với trường hợp biên khi bạn muốn tạo một list rỗng thuộc kiểu nào đó, chúng
tôi đã thêm constructor mới `List.empty()`.

Mẫu tạo ra một list hoàn toàn chưa khởi tạo xưa nay vẫn có cảm giác lạc lõng trong Dart, và
giờ càng lạc lõng hơn. Nếu code của bạn bị hỏng vì điều này, bạn luôn sửa được bằng cách
dùng một trong rất nhiều cách khác để tạo list.

### Không thể đặt độ dài lớn hơn cho list non-nullable

Điều này ít người biết, nhưng getter `length` trên `List` cũng có một *setter* tương ứng.
Bạn có thể đặt độ dài về một giá trị ngắn hơn để cắt bớt list. Và bạn cũng có thể đặt nó về
độ dài *dài hơn* để đệm list bằng những phần tử chưa khởi tạo.

Nếu bạn làm vậy với một list thuộc kiểu non-nullable, bạn sẽ vi phạm soundness khi về sau
truy cập những phần tử chưa được ghi đó. Để ngăn chuyện này, setter `length` sẽ ném ngoại lệ
lúc chạy nếu (và chỉ nếu) list có kiểu phần tử là non-nullable **và** bạn đặt nó về độ dài
*dài hơn*. Cắt ngắn list thuộc mọi kiểu thì vẫn ổn, và bạn vẫn mở rộng được list thuộc kiểu
nullable.

Có một hệ quả quan trọng nếu bạn định nghĩa kiểu list của riêng mình bằng cách kế thừa
`ListBase` hoặc áp dụng `ListMixin`. Cả hai kiểu đó đều cung cấp một bản hiện thực của
`insert()`, mà trước đây tạo chỗ cho phần tử được chèn bằng cách đặt lại `length`. Việc đó
sẽ thất bại với null safety, nên chúng tôi đã đổi phần hiện thực của `insert()` trong
`ListMixin` (mà `ListBase` dùng chung) sang gọi `add()` thay thế. Lớp list tùy chỉnh của bạn
nên cung cấp một định nghĩa cho `add()` nếu bạn muốn dùng được phương thức `insert()` kế
thừa đó.

### Không thể truy cập `Iterator.current` trước hoặc sau khi duyệt

Lớp `Iterator` là lớp "con trỏ" có thể thay đổi, dùng để duyệt qua các phần tử của một kiểu
hiện thực `Iterable`. Bạn được kỳ vọng gọi `moveNext()` trước khi truy cập bất kỳ phần tử
nào, để tiến tới phần tử đầu tiên. Khi phương thức đó trả về `false`, bạn đã tới cuối và
không còn phần tử nào nữa.

Trước đây, `current` trả về `null` nếu bạn gọi nó trước lần gọi `moveNext()` đầu tiên, hoặc
sau khi việc duyệt kết thúc. Với null safety, điều đó sẽ đòi hỏi kiểu trả về của `current`
phải là `E?` chứ không phải `E`. Điều đó lại có nghĩa mọi phép truy cập phần tử đều cần một
phép kiểm tra `null` lúc chạy.

Những phép kiểm tra đó sẽ vô dụng, xét rằng gần như chẳng ai truy cập phần tử hiện tại theo
cách sai lầm ấy. Thay vào đó, chúng tôi đặt kiểu của `current` là `E`. Vì *có thể* có một
giá trị thuộc kiểu đó khả dụng trước hoặc sau khi duyệt, chúng tôi để hành vi của iterator
là không xác định nếu bạn gọi nó khi không nên gọi. Hầu hết bản hiện thực của `Iterator` đều
ném ra `StateError`.

## Tóm tắt

Đó là một chuyến tham quan rất chi tiết qua mọi thay đổi về ngôn ngữ và thư viện quanh null
safety. Nhiều thứ đấy, nhưng đây là một thay đổi ngôn ngữ khá lớn. Quan trọng hơn, chúng tôi
muốn đạt tới một điểm mà Dart vẫn cảm thấy gắn kết và dễ dùng. Điều đó đòi hỏi thay đổi
không chỉ hệ thống kiểu, mà cả một loạt tính năng về trải nghiệm sử dụng xung quanh nó.
Chúng tôi không muốn nó có cảm giác như null safety bị chắp vá vào.

Những điểm cốt lõi cần ghi nhớ là:

*   Các kiểu là non-nullable theo mặc định, và được làm cho nullable bằng cách thêm `?`.

*   Tham số tùy chọn phải nullable hoặc phải có giá trị mặc định. Bạn có thể dùng `required`
    để làm cho tham số có tên không còn là tùy chọn. Biến top-level và trường tĩnh
    non-nullable phải có biểu thức khởi tạo. Trường thể hiện non-nullable phải được khởi tạo
    trước khi thân constructor bắt đầu.

*   Chuỗi phương thức sau toán tử null-aware sẽ bị cắt ngắn nếu đối tượng nhận là `null`. Có
    thêm các toán tử null-aware mới: cascade (`?..`) và chỉ số (`?[]`). Toán tử hậu tố khẳng
    định khác null — "bang" (`!`) — ép toán hạng nullable của nó về kiểu non-nullable nền.

*   Phân tích luồng cho phép bạn an toàn biến biến cục bộ và tham số nullable (và trường
    private final, từ Dart 3.2) thành những thứ non-nullable dùng được. Phép phân tích luồng
    mới cũng có quy tắc thông minh hơn cho nâng cấp kiểu, thiếu `return`, code không thể đi
    tới, và việc khởi tạo biến.

*   Từ khóa `late` cho phép bạn dùng kiểu non-nullable và `final` ở những nơi mà lẽ ra bạn
    không dùng được, đánh đổi bằng việc kiểm tra lúc chạy. Nó cũng cho bạn những trường được
    khởi tạo trễ.

*   Lớp `List` được thay đổi để ngăn các phần tử chưa khởi tạo.

Cuối cùng, một khi bạn thấm hết những điều đó và đưa code của mình vào thế giới null safety,
bạn có được một chương trình chặt chẽ mà trình biên dịch có thể tối ưu, và nơi mọi chỗ có
thể xảy ra lỗi lúc chạy đều nhìn thấy được ngay trong code. Chúng tôi hy vọng bạn thấy điều
đó xứng đáng với công sức bỏ ra.

---

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
