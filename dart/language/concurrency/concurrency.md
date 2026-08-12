# Xử lý đồng thời trong Dart (Concurrency)

> **Nguồn gốc:** <https://dart.dev/language/concurrency> — *Concurrency in Dart*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Class modifiers reference](https://dart.dev/language/modifier-reference) · → [Async](https://dart.dev/language/async)

Trang này trình bày tổng quan về mặt khái niệm cách lập trình đồng thời (concurrent
programming) hoạt động trong Dart. Nó giải thích event loop, các tính năng ngôn ngữ bất
đồng bộ, và isolate ở mức tổng quát. Để có thêm ví dụ code thực tế về việc dùng xử lý đồng
thời trong Dart, hãy đọc trang [Lập trình bất đồng bộ](https://dart.dev/language/async) và
trang [Isolates](https://dart.dev/language/isolates).

Lập trình đồng thời trong Dart bao gồm cả các API bất đồng bộ như `Future` và `Stream`, lẫn
*isolate* — thứ cho phép bạn đẩy các tiến trình sang những nhân CPU riêng biệt.

Mọi code Dart đều chạy bên trong isolate, bắt đầu từ **main isolate** mặc định, rồi tùy ý
mở rộng sang bất kỳ isolate nào bạn tạo ra sau đó một cách tường minh. Khi bạn sinh
(spawn) một isolate mới, nó có vùng nhớ riêng biệt của mình, và có event loop riêng. Chính
event loop là thứ làm cho lập trình bất đồng bộ và đồng thời trong Dart trở nên khả thi.

## Event loop

Mô hình runtime của Dart dựa trên một event loop. Event loop chịu trách nhiệm thực thi code
chương trình, thu thập và xử lý sự kiện, cùng nhiều việc khác.

Khi ứng dụng của bạn chạy, mọi sự kiện đều được đưa vào một hàng đợi, gọi là *event queue*
(hàng đợi sự kiện). Sự kiện có thể là bất cứ thứ gì — từ yêu cầu vẽ lại UI, tới thao tác
chạm và gõ phím của người dùng, tới I/O từ ổ đĩa. Vì ứng dụng không thể đoán trước thứ tự
các sự kiện xảy ra, event loop xử lý sự kiện theo đúng thứ tự chúng được xếp hàng, mỗi lần
một sự kiện.

![Hình minh họa các sự kiện được đưa lần lượt vào event loop](https://dart.dev/assets/img/language/concurrency/event-loop.png)

Cách event loop hoạt động giống như đoạn code này:

```dart
while (eventQueue.waitForEvent()) {
  eventQueue.processNextEvent();
}
```

Event loop trong ví dụ này là đồng bộ và chạy trên một luồng duy nhất. Tuy nhiên, hầu hết
ứng dụng Dart cần làm nhiều hơn một việc cùng lúc. Ví dụ, một ứng dụng client có thể cần
thực hiện một request HTTP, đồng thời vẫn lắng nghe người dùng bấm nút. Để xử lý điều này,
Dart cung cấp nhiều API bất đồng bộ, như
[Future, Stream và async-await](https://dart.dev/language/async). Các API này được xây
dựng xoay quanh chính event loop đó.

Ví dụ, hãy xét việc thực hiện một request mạng:

```dart
http.get('https://example.com').then((response) {
  if (response.statusCode == 200) {
    print('Success!');
  }  
}
```

Khi đoạn code này đi tới event loop, nó lập tức gọi mệnh đề đầu tiên — `http.get` — và trả
về một `Future`. Nó cũng bảo event loop giữ lại callback trong mệnh đề `then()` cho tới khi
request HTTP hoàn tất. Khi điều đó xảy ra, event loop sẽ chạy callback ấy, truyền kết quả
của request vào làm đối số.

![Hình minh họa các sự kiện bất đồng bộ được thêm vào event loop và callback được giữ lại để chạy sau](https://dart.dev/assets/img/language/concurrency/async-event-loop.png)

Nhìn chung, đây cũng chính là mô hình mà event loop dùng để xử lý mọi sự kiện bất đồng bộ
khác trong Dart, chẳng hạn object [`Stream`][].

[`Stream`]: https://api.dart.dev/dart-async/Stream-class.html

<a id="asynchronous-programming"></a>

## Lập trình bất đồng bộ

Mục này tóm tắt các kiểu và cú pháp khác nhau của lập trình bất đồng bộ trong Dart. Nếu bạn
đã quen với `Future`, `Stream` và async-await, bạn có thể nhảy thẳng tới
[mục isolate][isolates section].

[isolates section]: #isolate

### Future

Một `Future` biểu diễn kết quả của một thao tác bất đồng bộ, thao tác đó rồi sẽ hoàn tất
với một giá trị hoặc một lỗi.

Trong đoạn code mẫu sau, kiểu trả về `Future<String>` biểu thị lời hứa rồi sẽ cung cấp một
giá trị `String` (hoặc một lỗi).

```dart
Future<String> _readFileAsync(String filename) {
  final file = File(filename);

  // .readAsString() returns a Future.
  // .then() registers a callback to be executed when `readAsString` resolves.
  return file.readAsString().then((contents) {
    return contents.trim();
  });
}
```

> *Diễn giải:* `.readAsString()` trả về một `Future`; `.then()` đăng ký một callback sẽ
> được chạy khi `readAsString` hoàn tất.

### Cú pháp async-await

Hai từ khóa `async` và `await` cung cấp một cách khai báo để định nghĩa hàm bất đồng bộ và
sử dụng kết quả của chúng.

Đây là ví dụ về code đồng bộ bị chặn (block) trong lúc chờ I/O từ file:

```dart
const String filename = 'with_keys.json';

void main() {
  // Read some data.
  final fileData = _readFileSync();
  final jsonData = jsonDecode(fileData);

  // Use that data.
  print('Number of JSON keys: ${jsonData.length}');
}

String _readFileSync() {
  final file = File(filename);
  final contents = file.readAsStringSync();
  return contents.trim();
}
```

Đây là đoạn code tương tự, nhưng đã được sửa để trở thành bất đồng bộ:

```dart
const String filename = 'with_keys.json';

void main() async {
  // Read some data.
  final fileData = await _readFileAsync();
  final jsonData = jsonDecode(fileData);

  // Use that data.
  print('Number of JSON keys: ${jsonData.length}');
}

Future<String> _readFileAsync() async {
  final file = File(filename);
  final contents = await file.readAsString();
  return contents.trim();
}
```

> *Diễn giải:* những chỗ thay đổi là `async`, `await`, kiểu trả về `Future<String>`, và
> `readAsString()` (thay cho `readAsStringSync()`).

Hàm `main()` dùng từ khóa `await` phía trước `_readFileAsync()` để những đoạn code Dart
khác (chẳng hạn các trình xử lý sự kiện) được dùng CPU trong lúc code native (I/O file)
đang chạy. Việc dùng `await` cũng có tác dụng chuyển `Future<String>` mà
`_readFileAsync()` trả về thành một `String`. Kết quả là biến `contents` mang kiểu ngầm
định `String`.

> **Lưu ý**
> Từ khóa `await` chỉ hoạt động trong những hàm có `async` đứng trước thân hàm.

Như hình dưới đây cho thấy, code Dart tạm dừng trong lúc `readAsString()` chạy phần code
không phải Dart — nằm trong Dart runtime hoặc trong hệ điều hành. Ngay khi
`readAsString()` trả về một giá trị, code Dart tiếp tục chạy.

![Hình dạng lưu đồ cho thấy code ứng dụng chạy từ đầu tới lúc thoát, ở giữa có đoạn chờ I/O native](https://dart.dev/assets/img/language/concurrency/basics-await.png)

### Stream

Dart cũng hỗ trợ code bất đồng bộ dưới dạng stream. Stream cung cấp các giá trị trong tương
lai, và lặp đi lặp lại theo thời gian. Một lời hứa sẽ cung cấp một chuỗi giá trị `int` theo
thời gian có kiểu là `Stream<int>`.

Trong ví dụ sau, stream được tạo bằng `Stream.periodic` sẽ liên tục phát ra một giá trị
`int` mới mỗi giây.

```dart
Stream<int> stream = Stream.periodic(const Duration(seconds: 1), (i) => i * i);
```

#### `await-for` và `yield`

`await-for` là một loại vòng lặp for, thực hiện mỗi lượt lặp tiếp theo mỗi khi có giá trị
mới được cung cấp. Nói cách khác, nó dùng để "lặp qua" các stream. Trong ví dụ này, một giá
trị mới sẽ được hàm `sumStream` phát ra mỗi khi stream truyền vào làm đối số phát ra giá
trị mới. Từ khóa `yield` được dùng thay cho `return` trong những hàm trả về stream giá trị.

```dart
Stream<int> sumStream(Stream<int> stream) async* {
  var sum = 0;
  await for (final value in stream) {
    yield sum += value;
  }
}
```

Nếu bạn muốn tìm hiểu thêm về `async`, `await`, `Stream` và `Future`, xem
[hướng dẫn lập trình bất đồng bộ][asynchronous programming tutorial].

[asynchronous programming tutorial]: https://dart.dev/libraries/async/async-await

<a id="isolates"></a>

## Isolate

Ngoài [các API bất đồng bộ](#lập-trình-bất-đồng-bộ), Dart còn hỗ trợ xử lý đồng thời thông
qua isolate. Hầu hết thiết bị hiện đại đều có CPU đa nhân. Để tận dụng nhiều nhân, lập
trình viên đôi khi dùng các luồng chia sẻ bộ nhớ (shared-memory thread) chạy đồng thời. Tuy
nhiên, xử lý đồng thời với trạng thái chia sẻ lại
[rất dễ sinh lỗi](https://en.wikipedia.org/wiki/Race_condition#In_software) và có thể dẫn
tới code phức tạp.

Thay vì luồng, mọi code Dart đều chạy bên trong isolate. Nhờ isolate, code Dart của bạn có
thể thực hiện nhiều tác vụ độc lập cùng lúc, sử dụng thêm các nhân CPU nếu có sẵn. Isolate
giống như luồng hay tiến trình, nhưng mỗi isolate có bộ nhớ riêng và một luồng duy nhất
chạy một event loop.

Mỗi isolate có các trường toàn cục (global field) riêng của nó, đảm bảo rằng không trạng
thái nào bên trong một isolate có thể được truy cập từ isolate khác. Các isolate chỉ giao
tiếp với nhau qua việc **truyền thông điệp (message passing)**. Việc không chia sẻ trạng
thái giữa các isolate nghĩa là những rắc rối của xử lý đồng thời như
[mutex hay lock](https://en.wikipedia.org/wiki/Lock_(computer_science)) và
[data race](https://en.wikipedia.org/wiki/Race_condition#Data_race) sẽ không xảy ra trong
Dart. Dù vậy, isolate không ngăn được **hoàn toàn** race condition. Để biết thêm về mô hình
xử lý đồng thời này, hãy đọc về
[mô hình Actor](https://en.wikipedia.org/wiki/Actor_model).

> **Lưu ý về nền tảng**
> Chỉ có [nền tảng Dart Native][Dart Native platform] hiện thực isolate. Để biết thêm về
> nền tảng Dart Web, xem mục
> [Xử lý đồng thời trên web](#xử-lý-đồng-thời-trên-web).

[Dart Native platform]: https://dart.dev/overview#platform

### Main isolate

Trong hầu hết trường hợp, bạn chẳng cần nghĩ gì về isolate cả. Chương trình Dart mặc định
chạy trong main isolate. Đó là luồng nơi chương trình bắt đầu chạy và thực thi, như hình
sau:

![Hình minh họa main isolate: chạy `main()`, phản hồi sự kiện, rồi thoát](https://dart.dev/assets/img/language/concurrency/basics-main-isolate.png)

Ngay cả chương trình chỉ có một isolate cũng chạy mượt mà được. Trước khi sang dòng code kế
tiếp, những ứng dụng này dùng [async-await][] để chờ các thao tác bất đồng bộ hoàn tất. Một
ứng dụng "cư xử tốt" sẽ khởi động nhanh, đi tới event loop càng sớm càng tốt. Sau đó nó
phản hồi kịp thời từng sự kiện trong hàng đợi, dùng các thao tác bất đồng bộ khi cần.

[async-await]: https://dart.dev/libraries/async/async-await

### Vòng đời của isolate

Như hình sau cho thấy, mỗi isolate đều bắt đầu bằng việc chạy một đoạn code Dart nào đó,
chẳng hạn hàm `main()`. Đoạn code Dart này có thể đăng ký một số trình lắng nghe sự kiện —
ví dụ để phản hồi thao tác của người dùng hoặc I/O file. Khi hàm khởi đầu của isolate trả
về, isolate vẫn tiếp tục tồn tại nếu nó còn cần xử lý sự kiện. Sau khi xử lý xong các sự
kiện, isolate mới thoát.

![Hình tổng quát hơn cho thấy một isolate bất kỳ chạy code, tùy chọn phản hồi sự kiện, rồi thoát](https://dart.dev/assets/img/language/concurrency/basics-isolate.png)

### Xử lý sự kiện

Trong một ứng dụng client, event queue của main isolate có thể chứa các yêu cầu vẽ lại và
các thông báo về thao tác chạm cùng những sự kiện UI khác. Ví dụ, hình sau cho thấy một sự
kiện vẽ lại, tiếp đó là một sự kiện chạm, rồi tới hai sự kiện vẽ lại nữa. Event loop lấy
sự kiện ra khỏi hàng đợi theo thứ tự vào trước ra trước (FIFO).

![Hình minh họa các sự kiện được đưa lần lượt vào event loop](https://dart.dev/assets/img/language/concurrency/event-loop.png)

Việc xử lý sự kiện diễn ra trên main isolate sau khi `main()` thoát. Trong hình dưới đây,
sau khi `main()` thoát, main isolate xử lý sự kiện vẽ lại đầu tiên. Sau đó, main isolate xử
lý sự kiện chạm, rồi tới một sự kiện vẽ lại nữa.

Nếu một thao tác đồng bộ chiếm quá nhiều thời gian xử lý, ứng dụng có thể trở nên không
phản hồi. Trong hình sau, đoạn code xử lý thao tác chạm mất quá lâu, nên những sự kiện tiếp
theo bị xử lý quá muộn. Ứng dụng có thể trông như bị đứng, và mọi hoạt ảnh nó đang chạy có
thể bị giật.

![Hình minh họa một trình xử lý thao tác chạm có thời gian thực thi quá dài](https://dart.dev/assets/img/language/concurrency/event-jank.png)

Trong ứng dụng client, hậu quả của một thao tác đồng bộ quá dài thường là
[hoạt ảnh UI bị giật (janky)][jank]. Tệ hơn nữa, UI có thể hoàn toàn ngừng phản hồi.

[jank]: https://docs.flutter.dev/perf/rendering-performance

### Background worker

Nếu UI ứng dụng của bạn trở nên không phản hồi do một phép tính tốn thời gian — ví dụ
[phân tích một file JSON lớn][json] — hãy cân nhắc đẩy phép tính đó sang một isolate làm
việc, thường gọi là _background worker_ (tiến trình chạy nền). Một trường hợp phổ biến,
như hình dưới, là sinh ra một isolate worker đơn giản để thực hiện một phép tính rồi thoát.
Isolate worker trả về kết quả của nó trong một thông điệp khi nó thoát.

[json]: https://docs.flutter.dev/cookbook/networking/background-parsing

![Hình minh họa một main isolate và một isolate worker đơn giản](https://dart.dev/assets/img/language/concurrency/isolate-bg-worker.png)

Một isolate worker có thể thực hiện I/O (ví dụ đọc ghi file), đặt timer, và nhiều việc
khác. Nó có bộ nhớ riêng và không chia sẻ trạng thái nào với main isolate. Isolate worker
có thể bị chặn (block) mà không ảnh hưởng tới các isolate khác.

### Sử dụng isolate

Có hai cách làm việc với isolate trong Dart, tùy theo tình huống sử dụng:

* Dùng [`Isolate.run()`][] để thực hiện **một** phép tính duy nhất trên một luồng riêng.
* Dùng [`Isolate.spawn()`][] để tạo một isolate xử lý nhiều thông điệp theo thời gian, hoặc
  một background worker. Để biết thêm về việc làm việc với isolate sống lâu, xem trang
  [Isolates](https://dart.dev/language/isolates).

Trong hầu hết trường hợp, `Isolate.run` là API được khuyến nghị để chạy tiến trình ở nền.

#### `Isolate.run()`

Phương thức tĩnh `Isolate.run()` yêu cầu một đối số: một callback sẽ được chạy trên isolate
vừa được sinh ra.

```dart
int slowFib(int n) => n <= 1 ? 1 : slowFib(n - 1) + slowFib(n - 2);

// Compute without blocking current isolate.
void fib40() async {
  var result = await Isolate.run(() => slowFib(40));
  print('Fib(40) = $result');
}
```

> *Diễn giải:* tính toán mà không chặn isolate hiện tại.

<a id="performance-and-isolate-groups"></a>

### Hiệu năng và isolate group

Khi một isolate gọi [`Isolate.spawn()`][], hai isolate đó có cùng code thực thi và nằm
trong cùng một _isolate group_ (nhóm isolate). Isolate group cho phép những tối ưu hiệu
năng như chia sẻ code; một isolate mới lập tức chạy được đoạn code thuộc sở hữu của isolate
group. Ngoài ra, `Isolate.exit()` chỉ hoạt động khi các isolate nằm trong cùng một isolate
group.

Trong một số trường hợp đặc biệt, bạn có thể cần dùng [`Isolate.spawnUri()`][] — hàm này
thiết lập isolate mới với một bản sao của code nằm tại URI được chỉ định. Tuy nhiên,
`spawnUri()` chậm hơn `spawn()` rất nhiều, và isolate mới không nằm trong isolate group của
isolate đã sinh ra nó. Một hệ quả khác về hiệu năng là việc truyền thông điệp sẽ chậm hơn
khi các isolate nằm ở những group khác nhau.

[`Isolate.spawnUri()`]: https://api.dart.dev/dart-isolate/Isolate/spawnUri.html

### Giới hạn của isolate

#### Isolate không phải là luồng

Nếu bạn đến với Dart từ một ngôn ngữ có đa luồng, sẽ hợp lý khi bạn kỳ vọng isolate hành xử
như luồng — nhưng không phải vậy. Mỗi isolate có trạng thái riêng của nó, đảm bảo rằng
không trạng thái nào trong một isolate có thể được truy cập từ isolate khác. Do đó, isolate
bị giới hạn trong việc chỉ truy cập được bộ nhớ của chính mình.

Ví dụ, nếu ứng dụng của bạn có một biến toàn cục có thể thay đổi, thì trong isolate được
sinh ra, biến đó sẽ là một biến **riêng biệt**. Nếu bạn thay đổi biến đó trong isolate được
sinh ra, nó vẫn nguyên vẹn ở main isolate. Đây chính là cách isolate được thiết kế để hoạt
động, và điều quan trọng là phải nhớ điều này khi bạn cân nhắc dùng isolate.

#### Các kiểu thông điệp

Thông điệp gửi qua [`SendPort`][] có thể là gần như bất kỳ kiểu object Dart nào, nhưng có
vài ngoại lệ:

- Object có tài nguyên native, chẳng hạn [`Socket`][].
- [`ReceivePort`][]
- [`DynamicLibrary`][]
- [`Finalizable`][]
- [`Finalizer`][]
- [`NativeFinalizer`][]
- [`Pointer`][]
- [`UserTag`][]
- Thể hiện của những lớp được đánh dấu `@pragma('vm:isolate-unsendable')`

Ngoài những ngoại lệ đó, mọi object đều gửi được. Xem tài liệu [`SendPort.send`][] để biết
thêm.

Lưu ý rằng `Isolate.spawn()` và `Isolate.exit()` là các lớp trừu tượng nằm trên object
`SendPort`, nên chúng cũng chịu chính những giới hạn này.

[`SendPort.send`]: https://api.dart.dev/dart-isolate/SendPort/send.html
[`Socket`]: https://api.dart.dev/dart-io/Socket-class.html
[`DynamicLibrary`]: https://api.dart.dev/dart-ffi/DynamicLibrary-class.html
[`Finalizable`]: https://api.dart.dev/dart-ffi/Finalizable-class.html
[`Finalizer`]: https://api.dart.dev/dart-core/Finalizer-class.html
[`NativeFinalizer`]: https://api.dart.dev/dart-ffi/NativeFinalizer-class.html
[`Pointer`]: https://api.dart.dev/dart-ffi/Pointer-class.html
[`UserTag`]: https://api.dart.dev/dart-developer/UserTag-class.html

#### Giao tiếp đồng bộ có chặn giữa các isolate

Có một giới hạn về số lượng isolate có thể chạy song song. Giới hạn này **không** ảnh hưởng
tới việc giao tiếp *bất đồng bộ* tiêu chuẩn giữa các isolate qua thông điệp trong Dart. Bạn
có thể có hàng trăm isolate chạy đồng thời và cùng tiến triển. Các isolate được lập lịch
trên CPU theo kiểu xoay vòng (round-robin), và thường xuyên nhường lượt cho nhau.

Isolate chỉ có thể giao tiếp *đồng bộ* bên ngoài phạm vi Dart thuần túy, bằng cách dùng
code C qua [FFI][]. Việc cố giao tiếp đồng bộ giữa các isolate bằng cách chặn đồng bộ trong
các lời gọi FFI có thể dẫn tới deadlock nếu số isolate vượt quá giới hạn, trừ khi được xử
lý đặc biệt cẩn thận. Giới hạn này không phải một con số cố định trong code; nó được tính
dựa trên kích thước heap của Dart VM khả dụng cho ứng dụng Dart.

Để tránh tình huống này, đoạn code C thực hiện việc chặn đồng bộ cần rời khỏi isolate hiện
tại trước khi thực hiện thao tác chặn, và quay lại isolate đó trước khi trả về Dart từ lời
gọi FFI. Đọc về [`Dart_EnterIsolate`][] và [`Dart_ExitIsolate`][] để biết thêm.

[FFI]: https://dart.dev/interop/c-interop
[`Dart_EnterIsolate`]: https://github.com/dart-lang/sdk/blob/c9a8bbd8d6024e419b5e5f26b5131285eb19cc93/runtime/include/dart_api.h#L1254
[`Dart_ExitIsolate`]: https://github.com/dart-lang/sdk/blob/c9a8bbd8d6024e419b5e5f26b5131285eb19cc93/runtime/include/dart_api.h#L1455

<a id="web"></a>
<a id="concurrency-on-the-web"></a>

## Xử lý đồng thời trên web

Mọi ứng dụng Dart đều dùng được `async-await`, `Future` và `Stream` cho những phép tính đan
xen, không chặn. Tuy nhiên, [nền tảng Dart web][Dart web platform] **không** hỗ trợ
isolate. Ứng dụng Dart trên web có thể dùng [web worker][web workers] để chạy script trong
các luồng nền, tương tự isolate. Dù vậy, chức năng và khả năng của web worker có khác biệt
đôi chút so với isolate.

Chẳng hạn, khi web worker gửi dữ liệu giữa các luồng, chúng **sao chép** dữ liệu qua lại.
Việc sao chép dữ liệu có thể rất chậm, nhất là với những thông điệp lớn. Isolate cũng làm
vậy, nhưng ngoài ra còn cung cấp những API có thể **chuyển giao (transfer)** vùng nhớ chứa
thông điệp một cách hiệu quả hơn.

Việc tạo web worker và tạo isolate cũng khác nhau. Bạn chỉ có thể tạo web worker bằng cách
khai báo một điểm vào chương trình riêng và biên dịch nó riêng. Khởi động một web worker
tương tự việc dùng `Isolate.spawnUri` để khởi động một isolate. Bạn cũng có thể khởi động
isolate bằng `Isolate.spawn` — cách này cần ít tài nguyên hơn vì nó
[tái sử dụng một phần code và dữ liệu](#hiệu-năng-và-isolate-group) của isolate đã sinh ra
nó. Web worker không có API tương đương.

[Dart web platform]: https://dart.dev/overview#platform
[web workers]: https://developer.mozilla.org/docs/Web/API/Web_Workers_API/Using_web_workers

## Tài nguyên bổ sung

- Nếu bạn dùng nhiều isolate, hãy cân nhắc [`IsolateNameServer`][] trong Flutter, hoặc
  [`package:isolate_name_server`][] — package cung cấp chức năng tương tự cho các ứng dụng
  Dart không phải Flutter.
- Đọc thêm về [mô hình Actor][Actor model], nền tảng mà isolate của Dart dựa trên.
- Tài liệu bổ sung về các API `Isolate`:
    - [`Isolate.exit()`][]
    - [`Isolate.spawn()`][]
    - [`ReceivePort`][]
    - [`SendPort`][]

---

[`IsolateNameServer`]: https://api.flutter.dev/flutter/dart-ui/IsolateNameServer-class.html
[`package:isolate_name_server`]: https://pub.dev/packages/isolate_name_server
[Actor model]: https://en.wikipedia.org/wiki/Actor_model
[`Isolate.run()`]: https://api.dart.dev/dart-isolate/Isolate/run.html
[`Isolate.exit()`]: https://api.dart.dev/dart-isolate/Isolate/exit.html
[`Isolate.spawn()`]: https://api.dart.dev/dart-isolate/Isolate/spawn.html
[`ReceivePort`]: https://api.dart.dev/dart-isolate/ReceivePort-class.html
[`SendPort`]: https://api.dart.dev/dart-isolate/SendPort-class.html

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
