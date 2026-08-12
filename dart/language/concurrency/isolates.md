# Isolates

> **Nguồn gốc:** <https://dart.dev/language/isolates> — *Isolates*
> **Bản dịch tiếng Việt** · Cập nhật: 2026-08-12
> **Điều hướng trong tài liệu gốc:** ← [Asynchronous support](https://dart.dev/language/async) · → [Sound null safety](https://dart.dev/null-safety)

Trang này bàn về một số ví dụ dùng API `Isolate` để hiện thực isolate.

Bạn nên dùng isolate bất cứ khi nào ứng dụng phải xử lý những phép tính đủ lớn để tạm thời
chặn các phép tính khác. Ví dụ phổ biến nhất là trong ứng dụng [Flutter][], khi bạn cần
thực hiện những phép tính lớn mà nếu không tách ra thì có thể khiến UI ngừng phản hồi.

> **Lưu ý về Flutter**
> Flutter web không hỗ trợ nhiều isolate. Xem thêm:
> [Xử lý đồng thời trên web](https://dart.dev/language/concurrency#concurrency-on-the-web)

Không có quy tắc nào bắt buộc bạn *phải* dùng isolate, nhưng đây là một số tình huống nữa
mà chúng tỏ ra hữu ích:

- Phân tích và giải mã những khối JSON cực lớn.
- Xử lý và nén ảnh, âm thanh, video.
- Chuyển đổi file âm thanh và video.
- Thực hiện tìm kiếm và lọc phức tạp trên danh sách lớn hoặc trong hệ thống file.
- Thực hiện I/O, chẳng hạn giao tiếp với cơ sở dữ liệu.
- Xử lý một lượng lớn request mạng.

[Flutter]: https://docs.flutter.dev/perf/isolates

## Hiện thực một worker isolate đơn giản

Những ví dụ sau hiện thực một main isolate sinh ra một worker isolate đơn giản.
[`Isolate.run()`][] đơn giản hóa các bước phía sau việc thiết lập và quản lý worker
isolate:

1. Sinh ra (khởi động và tạo) một isolate.
2. Chạy một hàm trên isolate vừa sinh ra.
3. Thu lấy kết quả.
4. Trả kết quả về main isolate.
5. Kết thúc isolate khi công việc hoàn tất.
6. Kiểm tra, thu lấy và ném ngoại lệ cùng lỗi ngược về main isolate.

[`Isolate.run()`]: https://api.dart.dev/dart-isolate/Isolate/run.html

> **Lưu ý về Flutter**
> Nếu bạn dùng Flutter, bạn có thể dùng [hàm `compute` của Flutter][Flutter's `compute` function]
> thay cho `Isolate.run()`.

[Flutter's `compute` function]: https://api.flutter.dev/flutter/foundation/compute.html

### Chạy một phương thức có sẵn trong isolate mới

1. Gọi `run()` để sinh ra một isolate mới (một [background worker][]), trực tiếp trong
   [main isolate][] trong khi `main()` chờ kết quả:

```dart
const String filename = 'with_keys.json';

void main() async {
  // Read some data.
  final jsonData = await Isolate.run(_readAndParseJson);

  // Use that data.
  print('Number of JSON keys: ${jsonData.length}');
}
```

2. Truyền cho worker isolate hàm mà bạn muốn nó thực thi, làm đối số đầu tiên. Trong ví dụ
   này, đó là hàm có sẵn `_readAndParseJson()`:

```dart
Future<Map<String, dynamic>> _readAndParseJson() async {
  final fileData = await File(filename).readAsString();
  final jsonData = jsonDecode(fileData) as Map<String, dynamic>;
  return jsonData;
}
```

3. `Isolate.run()` lấy kết quả mà `_readAndParseJson()` trả về và gửi giá trị đó ngược về
   main isolate, rồi tắt worker isolate.

4. Worker isolate **chuyển giao (transfer)** vùng nhớ chứa kết quả sang main isolate. Nó
   **không sao chép** dữ liệu. Worker isolate thực hiện một lượt kiểm tra để đảm bảo các
   object được phép chuyển giao.

`_readAndParseJson()` là một hàm bất đồng bộ có sẵn, và nó hoàn toàn có thể chạy thẳng
trong main isolate cũng được. Việc dùng `Isolate.run()` để chạy nó mới tạo ra tính đồng
thời. Worker isolate trừu tượng hóa hoàn toàn các phép tính của `_readAndParseJson()`. Nó
có thể hoàn tất mà không chặn main isolate.

Kết quả của `Isolate.run()` luôn là một `Future`, vì code trong main isolate vẫn tiếp tục
chạy. Việc phép tính mà worker isolate thực thi là đồng bộ hay bất đồng bộ không ảnh hưởng
gì tới main isolate, vì dù thế nào nó cũng đang chạy đồng thời.

Để xem chương trình đầy đủ, hãy xem code mẫu [send_and_receive.dart][].

[send_and_receive.dart]: https://github.com/dart-lang/samples/blob/main/isolates/bin/send_and_receive.dart
[background worker]: https://dart.dev/language/concurrency#background-workers
[main isolate]: https://dart.dev/language/concurrency#the-main-isolate

### Gửi closure cùng isolate

Bạn cũng có thể tạo một worker isolate đơn giản bằng `run()` với một hàm literal, hay
closure, viết thẳng trong main isolate.

```dart
const String filename = 'with_keys.json';

void main() async {
  // Read some data.
  final jsonData = await Isolate.run(() async {
    final fileData = await File(filename).readAsString();
    final jsonData = jsonDecode(fileData) as Map<String, dynamic>;
    return jsonData;
  });

  // Use that data.
  print('Number of JSON keys: ${jsonData.length}');
}
```

Ví dụ này đạt được kết quả giống hệt ví dụ trước. Một isolate mới được sinh ra, tính toán
gì đó, rồi gửi kết quả về.

Tuy nhiên, lần này isolate gửi đi một [closure][]. Closure ít bị giới hạn hơn hàm có tên
thông thường, cả về cách hoạt động lẫn cách viết trong code. Trong ví dụ này,
`Isolate.run()` thực thi một đoạn trông như code cục bộ, nhưng chạy đồng thời. Theo nghĩa
đó, bạn có thể hình dung `run()` hoạt động như một toán tử điều khiển luồng mang nghĩa
"chạy song song".

[closure]: https://dart.dev/language/functions#anonymous-functions

## Gửi nhiều thông điệp giữa các isolate bằng port

Isolate sống ngắn thì tiện dùng, nhưng phải trả chi phí hiệu năng cho việc sinh isolate mới
và sao chép object từ isolate này sang isolate khác. Nếu code của bạn phải chạy đi chạy lại
cùng một phép tính bằng `Isolate.run`, bạn có thể cải thiện hiệu năng bằng cách tạo những
isolate sống lâu, không thoát ngay lập tức.

Để làm điều đó, bạn có thể dùng một số API isolate ở mức thấp mà `Isolate.run` đã trừu
tượng hóa đi:

* [`Isolate.spawn()`][] và [`Isolate.exit()`][]
* [`ReceivePort`][] và [`SendPort`][]
* [Phương thức `SendPort.send()`][`SendPort.send()` method]

Mục này đi qua các bước cần thiết để thiết lập giao tiếp hai chiều giữa một isolate mới
sinh và [main isolate][]. Ví dụ đầu, [Port cơ bản](#ví-dụ-port-cơ-bản), giới thiệu quy
trình ở mức tổng quát. Ví dụ thứ hai, [Port vững chắc](#ví-dụ-port-vững-chắc), dần bổ sung
thêm những chức năng thực tế hơn cho ví dụ đầu.

[`Isolate.exit()`]: https://api.dart.dev/dart-isolate/Isolate/exit.html
[`Isolate.spawn()`]: https://api.dart.dev/dart-isolate/Isolate/spawn.html
[`ReceivePort`]: https://api.dart.dev/dart-isolate/ReceivePort-class.html
[`SendPort`]: https://api.dart.dev/dart-isolate/SendPort-class.html
[`SendPort.send()` method]: https://api.dart.dev/dart-isolate/SendPort/send.html

### `ReceivePort` và `SendPort`

Việc thiết lập giao tiếp lâu dài giữa các isolate cần tới hai lớp (ngoài `Isolate`):
`ReceivePort` và `SendPort`. Những port này là cách **duy nhất** để các isolate giao tiếp
với nhau.

`ReceivePort` là object xử lý những thông điệp được gửi tới từ isolate khác. Những thông
điệp đó được gửi qua một `SendPort`.

> **Lưu ý**
> Một object `SendPort` gắn với đúng **một** `ReceivePort`, nhưng một `ReceivePort` có thể
> có **nhiều** `SendPort`. Khi bạn tạo một `ReceivePort`, nó tự tạo một `SendPort` cho
> chính mình. Bạn có thể tạo thêm những `SendPort` khác để gửi thông điệp tới một
> `ReceivePort` đã có.

Port hoạt động tương tự object [`Stream`][] (thực tế, receive port **có** hiện thực
`Stream`!). Bạn có thể hình dung `SendPort` và `ReceivePort` tương ứng như
`StreamController` và listener của Stream. `SendPort` giống `StreamController` ở chỗ bạn
"thêm" thông điệp vào nó bằng [phương thức `SendPort.send()`][`SendPort.send()` method], và
những thông điệp đó được một listener xử lý — ở đây chính là `ReceivePort`. Sau đó
`ReceivePort` xử lý những thông điệp nó nhận được bằng cách truyền chúng làm đối số cho một
callback do bạn cung cấp.

#### Thiết lập port

Một isolate vừa sinh ra chỉ có thông tin mà nó nhận được qua lời gọi `Isolate.spawn`. Nếu
bạn cần main isolate tiếp tục giao tiếp với isolate đó sau lúc tạo ban đầu, bạn phải thiết
lập một kênh giao tiếp để isolate mới gửi thông điệp về main isolate. Isolate chỉ giao tiếp
được qua việc truyền thông điệp. Chúng không thể "nhìn" vào bộ nhớ của nhau — và đó chính
là nguồn gốc của cái tên "isolate" (bị cô lập).

Để thiết lập giao tiếp hai chiều này, trước hết hãy tạo một [`ReceivePort`][] trong main
isolate, rồi truyền [`SendPort`][] của nó làm đối số cho isolate mới khi sinh nó bằng
`Isolate.spawn`. Isolate mới sau đó tạo `ReceivePort` của riêng nó, rồi gửi `SendPort`
*của nó* ngược lại qua cái `SendPort` mà main isolate đã truyền cho. Main isolate nhận được
`SendPort` này, và giờ cả hai bên đều có một kênh mở để gửi và nhận thông điệp.

> **Lưu ý**
> Các sơ đồ trong mục này ở mức tổng quát, nhằm truyền đạt *khái niệm* dùng port cho
> isolate. Phần hiện thực thực tế cần thêm chút code, và bạn sẽ thấy nó
> [ở phần sau của trang này](#ví-dụ-port-cơ-bản).

![Sơ đồ minh họa quá trình thiết lập port giữa main isolate và worker isolate](https://dart.dev/assets/img/language/concurrency/ports-setup.png)

1. Tạo một `ReceivePort` trong main isolate. `SendPort` được tạo tự động dưới dạng một
   thuộc tính trên `ReceivePort`.
2. Sinh worker isolate bằng `Isolate.spawn()`.
3. Truyền một tham chiếu tới `ReceivePort.sendPort` làm thông điệp đầu tiên cho worker
   isolate.
4. Tạo một `ReceivePort` mới nữa trong worker isolate.
5. Truyền một tham chiếu tới `ReceivePort.sendPort` của worker isolate làm thông điệp đầu
   tiên gửi *ngược lại* main isolate.

Cùng với việc tạo port và thiết lập giao tiếp, bạn cũng cần bảo cho các port biết phải làm
gì khi nhận được thông điệp. Việc này được thực hiện bằng phương thức `listen` trên từng
`ReceivePort` tương ứng.

![Sơ đồ minh họa việc truyền thông điệp qua lại giữa hai isolate](https://dart.dev/assets/img/language/concurrency/ports-passing-messages.png)

1. Gửi một thông điệp qua tham chiếu của main isolate tới `SendPort` của worker isolate.
2. Nhận và xử lý thông điệp qua một listener trên `ReceivePort` của worker isolate. Đây
   chính là nơi phép tính mà bạn muốn đẩy khỏi main isolate được thực thi.
3. Gửi một thông điệp trả về qua tham chiếu của worker isolate tới `SendPort` của main
   isolate.
4. Nhận thông điệp qua một listener trên `ReceivePort` của main isolate.

<a id="basic-ports-example"></a>

### Ví dụ port cơ bản

Ví dụ này minh họa cách thiết lập một worker isolate sống lâu, có giao tiếp hai chiều giữa
nó và main isolate. Đoạn code dùng ví dụ gửi văn bản JSON sang một isolate mới, nơi JSON sẽ
được phân tích và giải mã, trước khi gửi ngược về main isolate.

> **Cảnh báo**
> Ví dụ này chỉ nhằm dạy phần **tối thiểu** cần thiết để sinh ra một isolate mới có thể gửi
> và nhận nhiều thông điệp theo thời gian.
>
> Nó **không** bao gồm những phần chức năng quan trọng vốn được kỳ vọng ở phần mềm chạy
> thật, như xử lý lỗi, đóng port, và sắp xếp thứ tự thông điệp.
>
> [Ví dụ port vững chắc][robust ports example] ở mục kế tiếp có bao gồm những chức năng đó,
> và bàn về một số vấn đề có thể phát sinh khi thiếu chúng.

[robust ports example]: #ví-dụ-port-vững-chắc

#### Bước 1: Định nghĩa lớp worker

Trước hết, tạo một lớp cho worker isolate chạy nền của bạn. Lớp này chứa mọi chức năng bạn
cần để:

- Sinh ra một isolate.
- Gửi thông điệp tới isolate đó.
- Để isolate giải mã một đoạn JSON.
- Gửi JSON đã giải mã ngược về main isolate.

Lớp này để lộ hai phương thức công khai: một để sinh worker isolate, và một để xử lý việc
gửi thông điệp tới worker isolate đó.

Các mục còn lại trong ví dụ này sẽ chỉ cho bạn cách điền vào từng phương thức của lớp, lần
lượt từng cái một.

```dart
class Worker {
  Future<void> spawn() async {
    // TODO: Add functionality to spawn a worker isolate.
  }

  void _handleResponsesFromIsolate(dynamic message) {
    // TODO: Handle messages sent back from the worker isolate.
  }

  static void _startRemoteIsolate(SendPort port) {
    // TODO: Define code that should be executed on the worker isolate.
  }

  Future<void> parseJson(String message) async {
    // TODO: Define a public method that can
    // be used to send messages to the worker isolate.
  }
}
```

<a id="step-2-spawn-a-worker-isolate"></a>

#### Bước 2: Sinh một worker isolate

Phương thức `Worker.spawn` là nơi bạn gom phần code tạo worker isolate và đảm bảo nó nhận
gửi được thông điệp.

- Trước hết, tạo một `ReceivePort`. Nó cho phép main isolate nhận thông điệp gửi từ worker
  isolate vừa sinh.
- Tiếp theo, thêm một listener vào receive port đó để xử lý những thông điệp mà worker
  isolate sẽ gửi về. Callback truyền cho listener — `_handleResponsesFromIsolate` — sẽ được
  nói tới ở [bước 4](#step-4-handle-messages-on-the-main-isolate).
- Cuối cùng, sinh worker isolate bằng `Isolate.spawn`. Nó cần hai đối số: một hàm sẽ được
  thực thi trên worker isolate (nói ở
  [bước 3](#step-3-execute-code-on-the-worker-isolate)), và thuộc tính `sendPort` của
  receive port.

```dart
Future<void> spawn() async {
  final receivePort = ReceivePort();
  receivePort.listen(_handleResponsesFromIsolate);
  await Isolate.spawn(_startRemoteIsolate, receivePort.sendPort);
}
```

Đối số `receivePort.sendPort` sẽ được truyền cho callback (`_startRemoteIsolate`) làm đối
số khi callback đó được gọi trên worker isolate. Đây là bước đầu tiên để đảm bảo worker
isolate có cách gửi thông điệp ngược về main isolate.

<a id="step-3-execute-code-on-the-worker-isolate"></a>

#### Bước 3: Thực thi code trên worker isolate

Ở bước này, bạn định nghĩa phương thức `_startRemoteIsolate` — thứ được gửi sang worker
isolate để thực thi khi nó được sinh ra. Phương thức này giống như hàm "main" của worker
isolate.

- Trước hết, tạo thêm một `ReceivePort` mới. Port này nhận những thông điệp về sau từ main
  isolate.
- Tiếp theo, gửi `SendPort` của port đó ngược về main isolate.
- Cuối cùng, thêm một listener vào `ReceivePort` mới. Listener này xử lý những thông điệp
  mà main isolate gửi tới worker isolate.

```dart
static void _startRemoteIsolate(SendPort port) {
  final receivePort = ReceivePort();
  port.send(receivePort.sendPort);

  receivePort.listen((dynamic message) async {
    if (message is String) {
      final transformed = jsonDecode(message);
      port.send(transformed);
    }
  });
}
```

Listener trên `ReceivePort` của worker giải mã đoạn JSON được truyền từ main isolate, rồi
gửi JSON đã giải mã ngược về main isolate.

Listener này chính là điểm vào cho những thông điệp gửi từ main isolate sang worker isolate.
**Đây là cơ hội duy nhất bạn có để bảo worker isolate biết sau này nó phải chạy code gì.**

<a id="step-4-handle-messages-on-the-main-isolate"></a>

#### Bước 4: Xử lý thông điệp trên main isolate

Cuối cùng, bạn cần bảo main isolate biết cách xử lý những thông điệp mà worker isolate gửi
ngược về. Để làm vậy, bạn cần điền vào phương thức `_handleResponsesFromIsolate`. Nhớ rằng
phương thức này được truyền cho `receivePort.listen`, như đã mô tả ở
[bước 2](#step-2-spawn-a-worker-isolate):

```dart
Future<void> spawn() async {
  final receivePort = ReceivePort();
  receivePort.listen(_handleResponsesFromIsolate);
  await Isolate.spawn(_startRemoteIsolate, receivePort.sendPort);
}
```

Cũng nhớ rằng bạn đã gửi một `SendPort` ngược về main isolate ở
[bước 3](#step-3-execute-code-on-the-worker-isolate). Phương thức này xử lý việc nhận
`SendPort` đó, đồng thời xử lý luôn những thông điệp về sau (vốn sẽ là JSON đã giải mã).

- Trước hết, kiểm tra xem thông điệp có phải một `SendPort` không. Nếu đúng, gán port đó
  cho thuộc tính `_sendPort` của lớp để dùng gửi thông điệp về sau.
- Tiếp theo, kiểm tra xem thông điệp có thuộc kiểu `Map<String, dynamic>` không — kiểu được
  mong đợi của JSON đã giải mã. Nếu đúng, xử lý thông điệp đó bằng logic riêng của ứng
  dụng. Trong ví dụ này, thông điệp được in ra.

```dart
void _handleResponsesFromIsolate(dynamic message) {
  if (message is SendPort) {
    _sendPort = message;
    _isolateReady.complete();
  } else if (message is Map<String, dynamic>) {
    print(message);
  }
}
```

#### Bước 5: Thêm một completer để đảm bảo isolate đã sẵn sàng

Để hoàn thiện lớp này, hãy định nghĩa một phương thức công khai tên `parseJson`, chịu trách
nhiệm gửi thông điệp tới worker isolate. Nó cũng cần đảm bảo rằng thông điệp chỉ được gửi
đi sau khi isolate đã được thiết lập đầy đủ. Để xử lý điều này, hãy dùng một
[`Completer`][].

- Trước hết, thêm một thuộc tính cấp lớp kiểu `Completer` và đặt tên là `_isolateReady`.
- Tiếp theo, thêm một lời gọi `complete()` trên completer đó trong phương thức
  `_handleResponsesFromIsolate` (tạo ở
  [bước 4](#step-4-handle-messages-on-the-main-isolate)) khi thông điệp là một `SendPort`.
- Cuối cùng, trong phương thức `parseJson`, thêm `await _isolateReady.future` trước
  `_sendPort.send`. Việc này đảm bảo không thông điệp nào được gửi tới worker isolate cho
  tới khi nó đã được sinh ra **và** đã gửi `SendPort` của nó ngược về main isolate.

```dart
Future<void> parseJson(String message) async {
  await _isolateReady.future;
  _sendPort.send(message);
}
```

#### Ví dụ hoàn chỉnh

<details>
  <summary>Mở rộng để xem ví dụ hoàn chỉnh</summary>

```dart
import 'dart:async';
import 'dart:convert';
import 'dart:isolate';

void main() async {
  final worker = Worker();
  await worker.spawn();
  await worker.parseJson('{"key":"value"}');
}

class Worker {
  late SendPort _sendPort;
  final Completer<void> _isolateReady = Completer.sync();

  Future<void> spawn() async {
    final receivePort = ReceivePort();
    receivePort.listen(_handleResponsesFromIsolate);
    await Isolate.spawn(_startRemoteIsolate, receivePort.sendPort);
  }

  void _handleResponsesFromIsolate(dynamic message) {
    if (message is SendPort) {
      _sendPort = message;
      _isolateReady.complete();
    } else if (message is Map<String, dynamic>) {
      print(message);
    }
  }

  static void _startRemoteIsolate(SendPort port) {
    final receivePort = ReceivePort();
    port.send(receivePort.sendPort);

    receivePort.listen((dynamic message) async {
      if (message is String) {
        final transformed = jsonDecode(message);
        port.send(transformed);
      }
    });
  }

  Future<void> parseJson(String message) async {
    await _isolateReady.future;
    _sendPort.send(message);
  }

}
```

</details>

<a id="robust-ports-example"></a>

### Ví dụ port vững chắc

[Ví dụ trước][previous example] đã giải thích những viên gạch cơ bản cần thiết để thiết lập
một isolate sống lâu có giao tiếp hai chiều. Như đã nói, ví dụ đó thiếu vài tính năng quan
trọng: xử lý lỗi, khả năng đóng port khi không còn dùng nữa, và sự thiếu nhất quán về thứ
tự thông điệp trong một số tình huống.

Ví dụ này mở rộng thông tin từ ví dụ đầu, bằng cách tạo một worker isolate sống lâu có
những tính năng bổ sung đó và hơn thế nữa, đồng thời theo những mẫu thiết kế tốt hơn. Dù
đoạn code này có nét tương đồng với ví dụ đầu, nó không phải là phần mở rộng của ví dụ đó.

> **Lưu ý**
> Ví dụ này giả định bạn đã quen với việc thiết lập giao tiếp giữa các isolate bằng
> `Isolate.spawn` và port, như đã trình bày ở [ví dụ trước][previous example].

[previous example]: #ví-dụ-port-cơ-bản

#### Bước 1: Định nghĩa lớp worker

Trước hết, tạo một lớp cho worker isolate chạy nền. Lớp này chứa mọi chức năng bạn cần để:

- Sinh ra một isolate.
- Gửi thông điệp tới isolate đó.
- Để isolate giải mã một đoạn JSON.
- Gửi JSON đã giải mã ngược về main isolate.

Lớp này để lộ ba phương thức công khai: một để tạo worker isolate, một để xử lý việc gửi
thông điệp tới worker isolate đó, và một để đóng các port khi chúng không còn được dùng.

```dart
class Worker {
  final SendPort _commands;
  final ReceivePort _responses;

  Future<Object?> parseJson(String message) async {
    // TODO: Ensure the port is still open.
    _commands.send(message);
  }

  static Future<Worker> spawn() async {
    // TODO: Add functionality to create a new Worker object with a
    //  connection to a spawned isolate.
    throw UnimplementedError();
  }

  Worker._(this._responses, this._commands) {
    // TODO: Initialize main isolate receive port listener.
  }

  void _handleResponsesFromIsolate(dynamic message) {
    // TODO: Handle messages sent back from the worker isolate.
  }

  static void _handleCommandsToIsolate(ReceivePort rp, SendPort sp) async {
    // TODO: Handle messages sent back from the worker isolate.
  }

  static void _startRemoteIsolate(SendPort sp) {
    // TODO: Initialize worker isolate's ports.
  }
}
```

> **Lưu ý**
> Trong ví dụ này, các thể hiện `SendPort` và `ReceivePort` tuân theo một quy ước đặt tên
> tốt: chúng được đặt tên theo góc nhìn của main isolate. Những thông điệp gửi qua
> `SendPort` từ main isolate sang worker isolate được gọi là _commands_ (lệnh), còn những
> thông điệp gửi ngược về main isolate được gọi là _responses_ (phản hồi).

#### Bước 2: Tạo một `RawReceivePort` trong phương thức `Worker.spawn`

Trước khi sinh isolate, bạn cần tạo một [`RawReceivePort`][] — một dạng `ReceivePort` ở mức
thấp hơn. Dùng `RawReceivePort` là mẫu được ưa chuộng, vì nó cho phép bạn tách phần logic
khởi động isolate ra khỏi phần logic xử lý việc truyền thông điệp trên isolate.

Trong phương thức `Worker.spawn`:

- Trước hết, tạo `RawReceivePort`. `ReceivePort` này chỉ chịu trách nhiệm nhận thông điệp
  đầu tiên từ worker isolate, vốn sẽ là một `SendPort`.
- Tiếp theo, tạo một `Completer` để báo hiệu khi nào isolate đã sẵn sàng nhận thông điệp.
  Khi nó hoàn tất, nó sẽ trả về một record gồm một `ReceivePort` và một `SendPort`.
- Tiếp theo, định nghĩa thuộc tính `RawReceivePort.handler`. Thuộc tính này là một
  `Function?` hoạt động giống `ReceivePort.listener`. Hàm này được gọi khi port nhận được
  một thông điệp.
- Bên trong hàm handler, gọi `connection.complete()`. Phương thức này cần một
  [record][] gồm một `ReceivePort` và một `SendPort` làm đối số. `SendPort` chính là thông
  điệp đầu tiên gửi từ worker isolate, và ở bước tiếp theo nó sẽ được gán cho `SendPort`
  cấp lớp tên `_commands`.
- Sau đó, tạo một `ReceivePort` mới bằng constructor `ReceivePort.fromRawReceivePort`, và
  truyền `initPort` vào.

```dart
class Worker {
  final SendPort _commands;
  final ReceivePort _responses;

  static Future<Worker> spawn() async {
    // Create a receive port and add its initial message handler.
    final initPort = RawReceivePort();
    final connection = Completer<(ReceivePort, SendPort)>.sync();
    initPort.handler = (initialMessage) {
      final commandPort = initialMessage as SendPort;
      connection.complete((
        ReceivePort.fromRawReceivePort(initPort),
        commandPort,
      ));
    };
  }
}
```

Bằng cách tạo `RawReceivePort` trước, rồi mới tới `ReceivePort`, sau này bạn sẽ thêm được
một callback mới vào `ReceivePort.listen`. Ngược lại, nếu tạo thẳng `ReceivePort` ngay từ
đầu, bạn chỉ thêm được **một** `listener`, vì `ReceivePort` hiện thực [`Stream`][] chứ
không phải [`BroadcastStream`][].

Trên thực tế, cách này cho phép bạn tách phần logic khởi động isolate ra khỏi phần logic xử
lý việc nhận thông điệp sau khi thiết lập giao tiếp xong. Lợi ích này sẽ càng rõ khi logic
trong các phương thức khác phình to ra.

<a id="step-3-spawn-a-worker-isolate-with-isolate-spawn"></a>

#### Bước 3: Sinh worker isolate bằng `Isolate.spawn`

Bước này tiếp tục điền vào phương thức `Worker.spawn`. Bạn sẽ thêm phần code cần thiết để
sinh isolate, và trả về một thể hiện của `Worker` từ lớp này. Trong ví dụ này, lời gọi
`Isolate.spawn` được bọc trong một [khối `try`/`catch`][`try`/`catch` block], nhằm đảm bảo
rằng nếu isolate khởi động thất bại thì `initPort` sẽ được đóng lại và object `Worker` sẽ
không được tạo ra.

- Trước hết, thử sinh một worker isolate trong khối `try`/`catch`. Nếu việc sinh worker
  isolate thất bại, đóng receive port đã tạo ở bước trước. Phương thức truyền cho
  `Isolate.spawn` sẽ được nói tới ở bước sau.
- Tiếp theo, `await connection.future`, rồi phân rã send port và receive port từ record mà
  nó trả về.
- Cuối cùng, trả về một thể hiện của `Worker` bằng cách gọi constructor private của nó, và
  truyền vào các port từ completer đó.

```dart
class Worker {
  final SendPort _commands;
  final ReceivePort _responses;

  static Future<Worker> spawn() async {
    // Create a receive port and add its initial message handler.
    final initPort = RawReceivePort();
    final connection = Completer<(ReceivePort, SendPort)>.sync();
    initPort.handler = (initialMessage) {
      final commandPort = initialMessage as SendPort;
      connection.complete((
        ReceivePort.fromRawReceivePort(initPort),
        commandPort,
      ));
    };
    // Spawn the isolate.
    try {
      await Isolate.spawn(_startRemoteIsolate, (initPort.sendPort));
    } on Object {
      initPort.close();
      rethrow;
    }

    final (ReceivePort receivePort, SendPort sendPort) =
        await connection.future;

    return Worker._(receivePort, sendPort);
  }
}
```

Lưu ý rằng trong ví dụ này (so với [ví dụ trước][previous example]), `Worker.spawn` đóng
vai trò một constructor tĩnh bất đồng bộ cho lớp này, và là cách duy nhất để tạo một thể
hiện của `Worker`. Điều này đơn giản hóa API, khiến đoạn code tạo thể hiện `Worker` gọn
gàng hơn.

#### Bước 4: Hoàn tất quá trình thiết lập isolate

Ở bước này, bạn sẽ hoàn tất quá trình thiết lập isolate cơ bản. Phần này gần như tương ứng
hoàn toàn với [ví dụ trước][previous example], và không có khái niệm mới nào. Có một thay
đổi nhỏ là code được tách ra thành nhiều phương thức hơn — đây là một cách thiết kế giúp
bạn dễ bổ sung thêm chức năng ở phần còn lại của ví dụ. Để xem hướng dẫn chi tiết về quy
trình thiết lập isolate cơ bản, xem [ví dụ port cơ bản](#ví-dụ-port-cơ-bản).

Trước hết, tạo constructor private được trả về từ phương thức `Worker.spawn`. Trong thân
constructor, thêm một listener vào receive port mà main isolate dùng, và truyền cho
listener đó một phương thức chưa được định nghĩa tên là `_handleResponsesFromIsolate`.

```dart
class Worker {
  final SendPort _commands;
  final ReceivePort _responses;

  Worker._(this._responses, this._commands) {
    _responses.listen(_handleResponsesFromIsolate);
  }
}
```

Tiếp theo, thêm phần code vào `_startRemoteIsolate` — phần chịu trách nhiệm khởi tạo các
port trên worker isolate. [Nhớ lại](#step-3-spawn-a-worker-isolate-with-isolate-spawn) rằng
phương thức này đã được truyền cho `Isolate.spawn` trong `Worker.spawn`, và nó sẽ nhận
`SendPort` của main isolate làm đối số.

- Tạo một `ReceivePort` mới.
- Gửi `SendPort` của port đó ngược về main isolate.
- Gọi một phương thức mới tên `_handleCommandsToIsolate`, truyền vào cả `ReceivePort` mới
  lẫn `SendPort` từ main isolate làm đối số.

```dart
static void _startRemoteIsolate(SendPort sendPort) {
  final receivePort = ReceivePort();
  sendPort.send(receivePort.sendPort);
  _handleCommandsToIsolate(receivePort, sendPort);
}
```

Tiếp theo, thêm phương thức `_handleCommandsToIsolate`, chịu trách nhiệm nhận thông điệp từ
main isolate, giải mã JSON trên worker isolate, và gửi JSON đã giải mã về làm phản hồi.

- Trước hết, khai báo một listener trên `ReceivePort` của worker isolate.
- Trong callback thêm vào listener, thử giải mã đoạn JSON được truyền từ main isolate bên
  trong một [khối `try`/`catch`][`try`/`catch` block]. Nếu giải mã thành công, gửi JSON đã
  giải mã ngược về main isolate.
- Nếu có lỗi, gửi về một [`RemoteError`][].

```dart
static void _handleCommandsToIsolate(
  ReceivePort receivePort,
  SendPort sendPort,
) {
  receivePort.listen((message) {
    try {
      final jsonData = jsonDecode(message as String);
      sendPort.send(jsonData);
    } catch (e) {
      sendPort.send(RemoteError(e.toString(), ''));
    }
  });
}
```

Tiếp theo, thêm code cho phương thức `_handleResponsesFromIsolate`.

- Trước hết, kiểm tra xem thông điệp có phải `RemoteError` không; nếu đúng, bạn nên `throw`
  lỗi đó.
- Ngược lại, in thông điệp ra. Ở các bước sau, bạn sẽ cập nhật đoạn code này để **trả về**
  thông điệp thay vì in ra.

```dart
void _handleResponsesFromIsolate(dynamic message) {
  if (message is RemoteError) {
    throw message;
  } else {
    print(message);
  }
}
```

Cuối cùng, thêm phương thức `parseJson` — một phương thức công khai cho phép code bên ngoài
gửi JSON tới worker isolate để giải mã.

```dart
Future<Object?> parseJson(String message) async {
  _commands.send(message);
}
```

Bạn sẽ cập nhật phương thức này ở bước tiếp theo.

#### Bước 5: Xử lý nhiều thông điệp cùng lúc

Hiện tại, nếu bạn gửi thông điệp dồn dập tới worker isolate, isolate sẽ gửi phản hồi JSON
đã giải mã theo *thứ tự chúng hoàn tất*, chứ không phải theo thứ tự chúng được gửi đi. Bạn
không có cách nào xác định phản hồi nào ứng với thông điệp nào.

Ở bước này, bạn sẽ khắc phục vấn đề đó bằng cách gán cho mỗi thông điệp một id, và dùng các
object `Completer` để đảm bảo rằng khi code bên ngoài gọi `parseJson`, phản hồi trả về cho
bên gọi đó là phản hồi đúng.

Trước hết, thêm hai thuộc tính cấp lớp vào `Worker`:

- `Map<int, Completer<Object?>> _activeRequests`
- `int _idCounter`

```dart
class Worker {
  final SendPort _commands;
  final ReceivePort _responses;
  final Map<int, Completer<Object?>> _activeRequests = {};
  int _idCounter = 0;
  // ···
}
```

Map `_activeRequests` gắn mỗi thông điệp gửi tới worker isolate với một `Completer`. Khóa
dùng trong `_activeRequests` được lấy từ `_idCounter`, và giá trị này tăng dần khi có thêm
thông điệp được gửi đi.

Tiếp theo, cập nhật phương thức `parseJson` để tạo completer trước khi nó gửi thông điệp
tới worker isolate.

- Trước hết, tạo một `Completer`.
- Tiếp theo, tăng `_idCounter`, để mỗi `Completer` gắn với một con số duy nhất.
- Thêm một mục vào map `_activeRequests`, với khóa là giá trị hiện tại của `_idCounter`, và
  giá trị là completer.
- Gửi thông điệp tới worker isolate, kèm theo id. Vì bạn chỉ gửi được **một** giá trị qua
  `SendPort`, hãy gói id và thông điệp vào một [record][].
- Cuối cùng, trả về future của completer — thứ rồi sẽ chứa phản hồi từ worker isolate.

```dart
Future<Object?> parseJson(String message) async {
  final completer = Completer<Object?>.sync();
  final id = _idCounter++;
  _activeRequests[id] = completer;
  _commands.send((id, message));
  return await completer.future;
}
```

Bạn cũng cần cập nhật `_handleResponsesFromIsolate` và `_handleCommandsToIsolate` để xử lý
hệ thống này.

Trong `_handleCommandsToIsolate`, bạn cần tính đến việc `message` giờ là một record gồm hai
giá trị, chứ không chỉ là đoạn văn bản JSON. Hãy làm vậy bằng cách phân rã các giá trị từ
`message`.

Sau đó, sau khi giải mã JSON, cập nhật lời gọi `sendPort.send` để truyền cả id lẫn JSON đã
giải mã ngược về main isolate, cũng bằng một record.

```dart
static void _handleCommandsToIsolate(
  ReceivePort receivePort,
  SendPort sendPort,
) {
  receivePort.listen((message) {
    final (int id, String jsonText) = message as (int, String); // New
    try {
      final jsonData = jsonDecode(jsonText);
      sendPort.send((id, jsonData)); // Updated
    } catch (e) {
      sendPort.send((id, RemoteError(e.toString(), '')));
    }
  });
}
```

> *Diễn giải:* dòng đánh dấu `// New` là dòng mới thêm; dòng `// Updated` là dòng được cập
> nhật.

Cuối cùng, cập nhật `_handleResponsesFromIsolate`.

- Trước hết, lại phân rã id và phản hồi từ đối số `message`.
- Sau đó, xóa completer ứng với request này khỏi map `_activeRequests`.
- Cuối cùng, thay vì ném lỗi hay in JSON đã giải mã, hãy hoàn tất completer, truyền phản
  hồi vào. Khi completer hoàn tất, phản hồi sẽ được trả về cho đoạn code đã gọi `parseJson`
  trên main isolate.

```dart
void _handleResponsesFromIsolate(dynamic message) {
  final (int id, Object? response) = message as (int, Object?); // New
  final completer = _activeRequests.remove(id)!; // New

  if (response is RemoteError) {
    completer.completeError(response); // Updated
  } else {
    completer.complete(response); // Updated
  }
}
```

#### Bước 6: Thêm chức năng đóng port

Khi isolate không còn được code của bạn dùng nữa, bạn nên đóng các port trên cả main
isolate lẫn worker isolate.

- Trước hết, thêm một biến boolean cấp lớp để theo dõi xem port đã đóng chưa.
- Sau đó, thêm phương thức `Worker.close`. Trong phương thức này:
  - Cập nhật `_closed` thành true.
  - Gửi một thông điệp cuối cùng tới worker isolate. Thông điệp này là một `String` ghi
    "shutdown", nhưng nó có thể là bất kỳ object nào bạn muốn. Bạn sẽ dùng nó ở đoạn code
    tiếp theo.
- Cuối cùng, kiểm tra xem `_activeRequests` có rỗng không. Nếu rỗng, đóng `ReceivePort` tên
  `_responses` của main isolate.

```dart
class Worker {
  bool _closed = false;
  // ···
  void close() {
    if (!_closed) {
      _closed = true;
      _commands.send('shutdown');
      if (_activeRequests.isEmpty) _responses.close();
      print('--- port closed --- ');
    }
  }
}
```

- Tiếp theo, bạn cần xử lý thông điệp "shutdown" trong worker isolate. Thêm đoạn code sau
  vào phương thức `_handleCommandsToIsolate`. Đoạn code này kiểm tra xem thông điệp có phải
  một `String` ghi "shutdown" không. Nếu đúng, nó sẽ đóng `ReceivePort` của worker isolate
  rồi return.

```dart
static void _handleCommandsToIsolate(
  ReceivePort receivePort,
  SendPort sendPort,
) {
  receivePort.listen((message) {
    // New if-block.
    if (message == 'shutdown') {
      receivePort.close();
      return;
    }
    final (int id, String jsonText) = message as (int, String);
    try {
      final jsonData = jsonDecode(jsonText);
      sendPort.send((id, jsonData));
    } catch (e) {
      sendPort.send((id, RemoteError(e.toString(), '')));
    }
  });
}
```

- Cuối cùng, bạn nên thêm code kiểm tra xem port đã đóng chưa trước khi thử gửi thông điệp.
  Thêm một dòng vào phương thức `Worker.parseJson`.

```dart
Future<Object?> parseJson(String message) async {
  if (_closed) throw StateError('Closed'); // New
  final completer = Completer<Object?>.sync();
  final id = _idCounter++;
  _activeRequests[id] = completer;
  _commands.send((id, message));
  return await completer.future;
}
```

#### Ví dụ hoàn chỉnh

<details>
  <summary>Mở rộng để xem ví dụ đầy đủ</summary>

```dart
import 'dart:async';
import 'dart:convert';
import 'dart:isolate';

void main() async {
  final worker = await Worker.spawn();
  print(await worker.parseJson('{"key":"value"}'));
  print(await worker.parseJson('"banana"'));
  print(await worker.parseJson('[true, false, null, 1, "string"]'));
  print(
    await Future.wait([worker.parseJson('"yes"'), worker.parseJson('"no"')]),
  );
  worker.close();
}

class Worker {
  final SendPort _commands;
  final ReceivePort _responses;
  final Map<int, Completer<Object?>> _activeRequests = {};
  int _idCounter = 0;
  bool _closed = false;

  Future<Object?> parseJson(String message) async {
    if (_closed) throw StateError('Closed');
    final completer = Completer<Object?>.sync();
    final id = _idCounter++;
    _activeRequests[id] = completer;
    _commands.send((id, message));
    return await completer.future;
  }

  static Future<Worker> spawn() async {
    // Create a receive port and add its initial message handler.
    final initPort = RawReceivePort();
    final connection = Completer<(ReceivePort, SendPort)>.sync();
    initPort.handler = (initialMessage) {
      final commandPort = initialMessage as SendPort;
      connection.complete((
        ReceivePort.fromRawReceivePort(initPort),
        commandPort,
      ));
    };

    // Spawn the isolate.
    try {
      await Isolate.spawn(_startRemoteIsolate, (initPort.sendPort));
    } on Object {
      initPort.close();
      rethrow;
    }

    final (ReceivePort receivePort, SendPort sendPort) =
        await connection.future;

    return Worker._(receivePort, sendPort);
  }

  Worker._(this._responses, this._commands) {
    _responses.listen(_handleResponsesFromIsolate);
  }

  void _handleResponsesFromIsolate(dynamic message) {
    final (int id, Object? response) = message as (int, Object?);
    final completer = _activeRequests.remove(id)!;

    if (response is RemoteError) {
      completer.completeError(response);
    } else {
      completer.complete(response);
    }

    if (_closed && _activeRequests.isEmpty) _responses.close();
  }

  static void _handleCommandsToIsolate(
    ReceivePort receivePort,
    SendPort sendPort,
  ) {
    receivePort.listen((message) {
      if (message == 'shutdown') {
        receivePort.close();
        return;
      }
      final (int id, String jsonText) = message as (int, String);
      try {
        final jsonData = jsonDecode(jsonText);
        sendPort.send((id, jsonData));
      } catch (e) {
        sendPort.send((id, RemoteError(e.toString(), '')));
      }
    });
  }

  static void _startRemoteIsolate(SendPort sendPort) {
    final receivePort = ReceivePort();
    sendPort.send(receivePort.sendPort);
    _handleCommandsToIsolate(receivePort, sendPort);
  }

  void close() {
    if (!_closed) {
      _closed = true;
      _commands.send('shutdown');
      if (_activeRequests.isEmpty) _responses.close();
      print('--- port closed --- ');
    }
  }
}
```

</details>

---

[`Stream`]: https://api.dart.dev/dart-async/Stream-class.html
[`BroadcastStream`]: https://api.dart.dev/dart-async/BroadcastStream-class.html
[`Completer`]: https://api.dart.dev/dart-async/Completer-class.html
[`RawReceivePort`]: https://api.dart.dev/dart-isolate/RawReceivePort-class.html
[record]: https://dart.dev/language/records
[`try`/`catch` block]: https://dart.dev/language/error-handling#catch
[`RemoteError`]: https://api.dart.dev/dart-isolate/RemoteError-class.html

*Trang gốc được cấp phép theo [Creative Commons Attribution 4.0 International
License](https://creativecommons.org/licenses/by/4.0/), các code sample được cấp phép theo
[3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).*
