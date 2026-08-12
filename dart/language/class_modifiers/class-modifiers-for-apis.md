# Class modifier cho người bảo trì API

> **Nguồn gốc:** <https://dart.dev/language/class-modifiers-for-apis> — *Class modifiers for API maintainers*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Class modifiers](https://dart.dev/language/class-modifiers) · → [Class modifiers reference](https://dart.dev/language/modifier-reference)

Dart 3.0 bổ sung một vài [từ khóa bổ nghĩa mới][class modifiers] mà bạn có thể đặt lên
khai báo class và [mixin][]. Nếu bạn là tác giả của một package thư viện, những từ khóa
này cho bạn nhiều quyền kiểm soát hơn đối với những gì người dùng được phép làm với các
kiểu mà package của bạn export ra. Điều này giúp việc phát triển package dễ hơn, và cũng
dễ nhận biết hơn khi một thay đổi trong code của bạn có thể làm hỏng code người dùng.

[class modifiers]: https://dart.dev/language/class-modifiers
[mixin]: https://dart.dev/language/mixins

Dart 3.0 cũng bao gồm một
[thay đổi phá vỡ tương thích](https://dart.dev/resources/dart-3-migration#mixin) liên quan
tới việc dùng class làm mixin. Thay đổi này có thể không làm hỏng class *của bạn*, nhưng
nó có thể làm hỏng code của *người dùng* class đó.

Hướng dẫn này dẫn bạn đi qua những thay đổi ấy, để bạn biết cách dùng các từ khóa mới, và
chúng ảnh hưởng thế nào tới người dùng thư viện của bạn.

<a id="the-mixin-modifier-on-classes"></a>

## Từ khóa `mixin` trên class

Từ khóa quan trọng nhất cần biết là `mixin`. Các [phiên bản ngôn ngữ][Language versions]
trước Dart 3.0 cho phép **mọi** class được dùng làm mixin trong mệnh đề `with` của một
class khác, _TRỪ KHI_ class đó:

*   Khai báo bất kỳ constructor nào không phải factory.
*   Kế thừa (`extends`) một class nào đó khác `Object`.

Điều này khiến rất dễ vô tình làm hỏng code của người khác, chỉ bằng cách thêm một
constructor hay một mệnh đề `extends` vào class mà không biết rằng người khác đang dùng nó
trong mệnh đề `with`.

Dart 3.0 mặc định **không còn** cho phép dùng class làm mixin nữa. Thay vào đó, bạn phải
chủ động chọn tham gia hành vi đó bằng cách khai báo `mixin class`:

```dart
mixin class Both {}

class UseAsMixin with Both {}
class UseAsSuperclass extends Both {}
```

Nếu bạn cập nhật package của mình lên Dart 3.0 mà không thay đổi code nào, có thể bạn sẽ
chẳng thấy lỗi gì. Nhưng bạn có thể vô tình làm hỏng code của người dùng package, nếu họ
đang dùng class của bạn làm mixin.

[Language versions]: https://dart.dev/language/versioning

### Chuyển đổi class dùng làm mixin

Nếu class đã có sẵn constructor không phải factory, một mệnh đề `extends`, hoặc một mệnh
đề `with`, thì nó vốn đã không dùng làm mixin được rồi. Hành vi sẽ không thay đổi với Dart
3.0 — không có gì phải lo và không có gì cần làm.

Trên thực tế, điều này đúng với khoảng 90% các class hiện có. Với số class còn lại vốn có
thể dùng làm mixin, bạn phải quyết định mình muốn hỗ trợ điều gì.

Đây là vài câu hỏi giúp bạn quyết định. Câu đầu tiên mang tính thực dụng:

*   **Bạn có muốn mạo hiểm làm hỏng code của người dùng nào không?** Nếu câu trả lời là
    "tuyệt đối không", thì hãy đặt `mixin` trước tất cả những class
    [có thể được dùng làm mixin](#từ-khóa-mixin-trên-class). Cách này giữ nguyên chính xác
    hành vi hiện tại của API.

Mặt khác, nếu bạn muốn nhân cơ hội này để nghĩ lại về những khả năng mà API của bạn cung
cấp, thì có thể bạn sẽ *không* muốn biến nó thành `mixin class`. Hãy cân nhắc hai câu hỏi
thiết kế sau:

*   **Bạn có muốn người dùng tạo thể hiện của nó một cách trực tiếp không?** Nói cách khác,
    class này có cố ý *không* phải abstract hay không?

*   **Bạn có *muốn* mọi người dùng khai báo này làm mixin không?** Nói cách khác, bạn có
    muốn họ dùng được nó trong mệnh đề `with` không?

Nếu cả hai câu trả lời đều là "có", hãy biến nó thành `mixin class`. Nếu câu thứ hai là
"không", cứ để nó là class. Nếu câu thứ nhất là "không" và câu thứ hai là "có", hãy đổi nó
từ class thành một khai báo `mixin`.

Hai lựa chọn sau — giữ nguyên là class, hoặc biến nó thành mixin thuần túy — đều là những
thay đổi phá vỡ tương thích API. Bạn sẽ cần tăng phiên bản major của package nếu làm vậy.

## Các từ khóa opt-in khác

Việc xử lý class dùng làm mixin là thay đổi quan trọng duy nhất trong Dart 3.0 có ảnh hưởng
tới API của package. Khi đã làm tới đây, bạn có thể dừng lại nếu không muốn thay đổi gì
thêm về những gì package cho phép người dùng làm.

Lưu ý rằng nếu bạn đi tiếp và dùng bất kỳ từ khóa nào được mô tả dưới đây, đó cũng có thể
là một thay đổi phá vỡ tương thích API của package, đòi hỏi tăng phiên bản major.

## Từ khóa `interface`

Dart không có cú pháp riêng để khai báo interface thuần túy. Thay vào đó, bạn khai báo một
lớp trừu tượng mà tình cờ chỉ chứa toàn phương thức trừu tượng. Khi người dùng nhìn thấy
lớp đó trong API package của bạn, họ có thể không biết nó chứa code có thể tái sử dụng bằng
cách kế thừa, hay nó vốn được dùng như một interface.

Bạn có thể làm rõ điều đó bằng cách đặt từ khóa
[`interface`](https://dart.dev/language/class-modifiers#interface) lên lớp. Việc đó cho
phép dùng lớp trong mệnh đề `implements`, nhưng ngăn dùng nó trong `extends`.

Ngay cả khi lớp *có* những phương thức không trừu tượng, có thể bạn vẫn muốn ngăn người
dùng kế thừa nó. Kế thừa là một trong những dạng liên kết (coupling) mạnh nhất trong phần
mềm, vì nó cho phép tái sử dụng code. Nhưng sự liên kết đó cũng
[nguy hiểm và dễ vỡ][dangerous and fragile]. Khi kế thừa vượt qua ranh giới package, việc
phát triển lớp cha mà không làm hỏng các lớp con trở nên rất khó.

[dangerous and fragile]: https://en.wikipedia.org/wiki/Fragile_base_class

Đánh dấu lớp là `interface` cho phép người dùng tạo thể hiện của nó (trừ khi nó
[cũng được đánh dấu `abstract`](https://dart.dev/language/class-modifiers#abstract-interface))
và hiện thực interface của lớp, nhưng ngăn họ tái sử dụng bất kỳ phần code nào của nó.

Khi một lớp được đánh dấu `interface`, hạn chế đó có thể được bỏ qua **bên trong** thư
viện nơi lớp được khai báo. Trong thư viện đó, bạn thoải mái kế thừa nó, vì tất cả đều là
code của bạn và hẳn là bạn biết mình đang làm gì. Hạn chế này chỉ áp dụng cho các package
khác, và cả những thư viện khác trong chính package của bạn.

## Từ khóa `base`

Từ khóa [`base`](https://dart.dev/language/class-modifiers#base) phần nào là mặt đối lập
của `interface`. Nó cho phép dùng lớp trong mệnh đề `extends`, hoặc dùng một mixin/mixin
class trong mệnh đề `with`. Nhưng nó **không** cho phép code bên ngoài thư viện của lớp
dùng lớp hay mixin đó trong mệnh đề `implements`.

Điều này đảm bảo rằng mọi object là thể hiện của interface thuộc class/mixin của bạn đều
**kế thừa phần hiện thực thực sự** của bạn. Cụ thể, nghĩa là mọi thể hiện đều sẽ chứa toàn
bộ thành viên private mà class hay mixin của bạn khai báo. Điều này giúp ngăn những lỗi lúc
chạy vốn có thể xảy ra.

Hãy xem thư viện sau:

```dart
// a.dart
class A {
  void _privateMethod() {
    print('I inherited from A');
  }
}

void callPrivateMethod(A a) {
  a._privateMethod();
}
```

Đoạn code này tự nó trông có vẻ ổn, nhưng chẳng có gì ngăn người dùng tạo ra một thư viện
khác như thế này:

```dart
// b.dart
import 'a.dart';

class B implements A {
  // No implementation of _privateMethod()!
}

main() {
  callPrivateMethod(B()); // Runtime exception!
}
```

> *Diễn giải:* lớp `B` **không** hiện thực `_privateMethod()`, nên lời gọi ở `main()` gây
> ngoại lệ lúc chạy.

Thêm từ khóa `base` vào lớp giúp ngăn những lỗi lúc chạy kiểu này. Cũng như với `interface`,
bạn có thể bỏ qua hạn chế này trong chính thư viện nơi class hay mixin `base` được khai
báo. Khi đó, các lớp con trong cùng thư viện sẽ được nhắc nhở phải hiện thực các phương
thức private. Nhưng lưu ý rằng mục tiếp theo **vẫn** áp dụng:

### Tính lan truyền của `base`

Mục tiêu của việc đánh dấu một lớp là `base` là đảm bảo rằng mọi thể hiện của kiểu đó đều
kế thừa nó một cách cụ thể. Để duy trì điều này, hạn chế của `base` mang tính "lây lan".
Mọi kiểu con của một kiểu được đánh dấu `base` — *trực tiếp hay gián tiếp* — cũng phải ngăn
việc bị `implements`. Nghĩa là nó phải được đánh dấu `base` (hoặc `final`, hoặc `sealed`,
sẽ nói tới ngay sau đây).

Vậy nên việc áp dụng `base` cho một kiểu đòi hỏi phải cẩn thận. Nó không chỉ ảnh hưởng tới
những gì người dùng làm được với class/mixin của bạn, mà còn tới những khả năng mà các lớp
con *của họ* có thể cung cấp. Một khi bạn đặt `base` lên một kiểu, toàn bộ cây phân cấp bên
dưới nó đều bị cấm `implements`.

Nghe có vẻ nặng nề, nhưng đó là cách hầu hết các ngôn ngữ lập trình khác vẫn luôn hoạt
động. Phần lớn ngôn ngữ khác thậm chí không có interface ngầm định, nên khi bạn khai báo
một class trong Java, C# hay ngôn ngữ khác, bạn thực chất đã chịu đúng ràng buộc này rồi.

## Từ khóa `final`

Nếu bạn muốn có tất cả các hạn chế của cả `interface` lẫn `base`, hãy đánh dấu class hay
mixin class là [`final`](https://dart.dev/language/class-modifiers#final). Việc này ngăn
bất kỳ ai bên ngoài thư viện của bạn tạo ra bất kỳ dạng kiểu con nào từ nó: không dùng được
trong mệnh đề `implements`, `extends`, `with` hay `on`.

Đây là mức hạn chế lớn nhất đối với người dùng lớp. Tất cả những gì họ làm được là tạo thể
hiện của nó (trừ khi nó được đánh dấu `abstract`). Đổi lại, bạn — với tư cách người bảo trì
lớp — chịu ít hạn chế nhất. Bạn có thể thêm phương thức mới, biến constructor thành factory
constructor, v.v. mà không phải lo làm hỏng code của bất kỳ người dùng nào phía dưới.

<a id="the-sealed-modifer"></a>

## Từ khóa `sealed`

Từ khóa cuối cùng, [`sealed`](https://dart.dev/language/class-modifiers#sealed), là một
trường hợp đặc biệt. Nó tồn tại chủ yếu để hỗ trợ
[kiểm tra tính đầy đủ][exhaustiveness checking] trong so khớp pattern. Nếu một `switch` có
đủ `case` cho mọi kiểu con trực tiếp của một kiểu được đánh dấu `sealed`, thì trình biên
dịch biết rằng `switch` đó là đầy đủ.

[exhaustiveness checking]: https://dart.dev/language/branches#exhaustiveness-checking

```dart
// amigos.dart
sealed class Amigo {}

class Lucky extends Amigo {}

class Dusty extends Amigo {}

class Ned extends Amigo {}

String lastName(Amigo amigo) => switch (amigo) {
  Lucky _ => 'Day',
  Dusty _ => 'Bottoms',
  Ned _ => 'Nederlander',
};
```

`switch` này có một `case` cho từng kiểu con của `Amigo`. Trình biên dịch biết rằng mọi thể
hiện của `Amigo` đều phải là thể hiện của một trong các kiểu con đó, nên nó biết `switch`
này chắc chắn đầy đủ và không cần nhánh `default` cuối cùng.

Để điều này là chặt chẽ (sound), trình biên dịch áp đặt hai hạn chế:

1.  Bản thân lớp sealed không thể được tạo thể hiện trực tiếp. Nếu không, bạn có thể có một
    thể hiện của `Amigo` mà lại không phải thể hiện của *bất kỳ* kiểu con nào. Vì vậy mọi
    lớp `sealed` cũng ngầm định là `abstract`.

2.  Mọi kiểu con trực tiếp của kiểu sealed đều phải nằm trong cùng thư viện nơi kiểu sealed
    được khai báo. Nhờ vậy, trình biên dịch tìm được hết chúng. Nó biết rằng không có kiểu
    con ẩn nào khác đang trôi nổi đâu đó mà lại không khớp với nhánh `case` nào.

Hạn chế thứ hai tương tự `final`. Cũng như `final`, nó nghĩa là một lớp được đánh dấu
`sealed` không thể bị `extends`, `implements` hay mix vào một cách trực tiếp từ bên ngoài
thư viện nơi nó được khai báo. Nhưng khác với `base` và `final`, ở đây **không** có hạn chế
mang tính *lan truyền*:

```dart
// amigo.dart
sealed class Amigo {}
class Lucky extends Amigo {}
class Dusty extends Amigo {}
class Ned extends Amigo {}
```

```dart
// other.dart
// This is an error:
class Bad extends Amigo {}

// But these are both fine:
class OtherLucky extends Lucky {}
class OtherDusty implements Dusty {}
```

> *Diễn giải:* dòng đầu là lỗi; nhưng hai dòng sau thì hoàn toàn ổn.

Tất nhiên, nếu bạn *muốn* các kiểu con của kiểu sealed cũng bị hạn chế, bạn có thể đạt được
điều đó bằng cách đánh dấu chúng bằng `interface`, `base`, `final` hoặc `sealed`.

<a id="sealed-versus-final"></a>

### `sealed` so với `final`

Nếu bạn có một lớp mà bạn không muốn người dùng tạo kiểu con trực tiếp, khi nào nên dùng
`sealed` và khi nào nên dùng `final`? Vài quy tắc đơn giản:

*   Nếu bạn muốn người dùng tạo được thể hiện của lớp một cách trực tiếp, thì nó *không
    thể* dùng `sealed`, vì kiểu sealed ngầm định là abstract.

*   Nếu lớp không có kiểu con nào trong thư viện của bạn, thì dùng `sealed` cũng vô nghĩa,
    vì bạn chẳng thu được lợi ích gì từ kiểm tra tính đầy đủ.

Ngoài ra, nếu lớp *có* một số kiểu con do bạn định nghĩa, thì `sealed` nhiều khả năng là
thứ bạn cần. Nếu người dùng thấy lớp có vài kiểu con, sẽ rất tiện khi họ xử lý được từng
kiểu riêng biệt bằng các nhánh `switch case`, và trình biên dịch biết rằng toàn bộ kiểu đã
được phủ hết.

Tuy nhiên, dùng `sealed` nghĩa là nếu sau này bạn thêm một kiểu con mới vào thư viện, đó là
một thay đổi phá vỡ tương thích API. Khi một kiểu con mới xuất hiện, mọi `switch` hiện có
đều trở nên không đầy đủ, vì chúng chưa xử lý kiểu mới. Chuyện này giống hệt việc thêm một
giá trị mới vào enum.

Những lỗi biên dịch "switch không đầy đủ" đó thực ra *hữu ích* với người dùng, vì chúng
hướng sự chú ý của họ tới đúng những chỗ trong code cần xử lý kiểu mới.

Nhưng nó cũng có nghĩa là mỗi khi bạn thêm một kiểu con mới, đó là một thay đổi phá vỡ
tương thích. Nếu bạn muốn tự do thêm kiểu con mới theo cách không phá vỡ tương thích, tốt
hơn là đánh dấu kiểu cha bằng `final` thay vì `sealed`. Khi đó, lúc người dùng `switch`
trên một giá trị thuộc kiểu cha, dù họ có đủ `case` cho mọi kiểu con, trình biên dịch vẫn
buộc họ thêm một nhánh `default`. Nhánh `default` đó chính là thứ sẽ được chạy nếu sau này
bạn thêm kiểu con mới.

## Tóm tắt

Với tư cách người thiết kế API, những từ khóa mới này cho bạn quyền kiểm soát cách người
dùng làm việc với code của bạn — và ngược lại, cách bạn phát triển code của mình mà không
làm hỏng code của họ.

Nhưng những lựa chọn này cũng kéo theo sự phức tạp: giờ đây bạn có nhiều quyết định phải
đưa ra hơn với tư cách người thiết kế API. Ngoài ra, vì đây là các tính năng mới, chúng ta
vẫn chưa biết đâu sẽ là best practice. Hệ sinh thái của mỗi ngôn ngữ đều khác nhau và có
nhu cầu khác nhau.

May thay, bạn không cần phải tìm ra tất cả ngay lập tức. Chúng tôi đã chọn các giá trị mặc
định một cách có chủ đích, để ngay cả khi bạn không làm gì cả, class của bạn vẫn giữ gần
như nguyên vẹn những khả năng vốn có trước 3.0. Nếu bạn chỉ muốn giữ API y như cũ, hãy đặt
`mixin` lên những class vốn đã hỗ trợ điều đó, và thế là xong.

Theo thời gian, khi bạn dần cảm nhận được chỗ nào cần kiểm soát tinh tế hơn, bạn có thể cân
nhắc áp dụng một số từ khóa khác:

*   Dùng `interface` để ngăn người dùng tái sử dụng code của lớp, nhưng vẫn cho phép họ
    hiện thực lại interface của nó.

*   Dùng `base` để buộc người dùng phải tái sử dụng code của lớp, và đảm bảo mọi thể hiện
    thuộc kiểu của lớp đều là thể hiện của chính lớp đó hoặc của một lớp con.

*   Dùng `final` để ngăn hoàn toàn việc một lớp bị kế thừa.

*   Dùng `sealed` để bật kiểm tra tính đầy đủ trên một họ các kiểu con.

Khi làm những việc đó, hãy tăng phiên bản major lúc phát hành package, vì tất cả những từ
khóa này đều hàm ý các hạn chế vốn là thay đổi phá vỡ tương thích.

---

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
