# Bảng thuật ngữ — quy ước dịch

Mục đích: giữ cách dịch **nhất quán** giữa các trang. Nguyên tắc chung:

1. Dịch theo **ngữ nghĩa**, không dịch từng từ.
2. Thuật ngữ đã là "tên riêng" trong ngành thì **giữ nguyên tiếng Anh** (mixin, interface,
   getter, `Future`, `Stream`, null safety...). Dịch cứng những từ này sẽ làm bản dịch tối
   nghĩa.
3. Lần xuất hiện đầu tiên trong một trang: dùng dạng `tiếng Việt (tiếng Anh)`, các lần sau
   dùng dạng ngắn quen thuộc.
4. **Không dịch nội dung bên trong code block.** Nếu chú thích trong code cần giải thích,
   thêm một khối "Diễn giải" ngay bên dưới code block.
5. Giữ nguyên tên định danh, tên API, tên file, từ khóa.

| Tiếng Anh | Dịch dùng trong bộ tài liệu này |
| --- | --- |
| abstract class | lớp trừu tượng |
| anonymous function | hàm ẩn danh |
| annotation | annotation (giữ nguyên) |
| assignment | phép gán |
| annotation (metadata) | annotation (giữ nguyên) |
| associativity | tính kết hợp |
| bitwise operator | toán tử theo bit |
| cascade | cascade (giữ nguyên) |
| compound assignment | phép gán kép |
| block scope | phạm vi khối |
| bind (a variable) | gắn (biến) |
| bound (type bound) | chặn kiểu (bound) |
| code unit | code unit (giữ nguyên) |
| class modifier | class modifier (từ khóa bổ nghĩa cho lớp) |
| collection | collection (giữ nguyên) |
| completer | completer (giữ nguyên) |
| concurrency | xử lý đồng thời |
| coupling | liên kết (giữa các thành phần) |
| consumer / producer | bên tiêu thụ / bên sản xuất |
| covariant | covariant (giữ nguyên) |
| compile-time constant | hằng lúc biên dịch |
| control flow analysis | phân tích luồng điều khiển |
| asynchronous / async | bất đồng bộ / `async` (giữ nguyên khi là từ khóa) |
| callback hell | callback hell (giữ nguyên) |
| class hierarchy | cây phân cấp lớp |
| compile-time error | lỗi lúc biên dịch |
| constant instance | thể hiện hằng |
| constructor | constructor (có thể chú thêm "hàm khởi tạo" ở lần đầu) |
| control flow statement | câu lệnh điều khiển luồng |
| core library | thư viện lõi |
| declare | khai báo |
| dot shorthand | cú pháp rút gọn dấu chấm (dot shorthand) |
| enhanced enum | enum nâng cao |
| deferred loading | deferred loading / nạp trễ |
| deprecated | deprecated (giữ nguyên — không còn khuyến khích dùng) |
| declaring parameter | declaring parameter (tham số khai báo — sinh ra trường) |
| definite assignment | gán chắc chắn |
| destructure | phân rã |
| directive | chỉ thị |
| deadlock | deadlock (giữ nguyên) |
| entrypoint | điểm vào |
| event loop | event loop (giữ nguyên) |
| event queue | hàng đợi sự kiện |
| enum | enum (giữ nguyên) |
| exhaustiveness checking | kiểm tra tính đầy đủ |
| fall through (switch) | rơi xuống (case kế tiếp) |
| fragile base class problem | vấn đề lớp cơ sở dễ vỡ |
| exception | ngoại lệ |
| expression | biểu thức |
| field | trường (field) |
| first-class object | object hạng nhất |
| generator function | hàm generator |
| generic type | kiểu generic |
| getter / setter | getter / setter (giữ nguyên) |
| identifier | định danh |
| guard clause | mệnh đề guard (giữ nguyên `guard`) |
| immutable | bất biến |
| initializing formal parameter | initializing formal parameter (giữ nguyên — `this.x`) |
| isolate | isolate (giữ nguyên) |
| message passing | truyền thông điệp |
| port (SendPort/ReceivePort) | port (giữ nguyên) |
| race condition / data race | race condition / data race (giữ nguyên) |
| labeled statement | câu lệnh có nhãn |
| implement | hiện thực (`implements` giữ nguyên khi là từ khóa) |
| implicit interface | interface ngầm định |
| inheritance | kế thừa |
| initializer list | danh sách khởi tạo |
| instance | thể hiện (instance) |
| instance variable | biến thể hiện |
| interface | interface (giữ nguyên) |
| grapheme cluster | grapheme cluster (giữ nguyên) |
| heterogeneous | không đồng nhất về kiểu |
| implicit downcast | ép kiểu xuống ngầm định |
| lazy initialization | khởi tạo trễ / nạp trễ |
| lazy loading | nạp trễ |
| lexical scope | phạm vi từ vựng |
| library | thư viện |
| literal | chuỗi/giá trị ký tự (literal) |
| method | phương thức |
| mixin | mixin (giữ nguyên) |
| named constructor | constructor có tên |
| nullable | nullable (giữ nguyên) |
| non-binding | không ràng buộc |
| null-coalescing operator | toán tử null-coalescing (giữ nguyên) |
| null-shorting | null-shorting (giữ nguyên) |
| null dereference error | null dereference error (giữ nguyên, chú thêm "lỗi truy xuất qua tham chiếu null") |
| null safety | null safety (giữ nguyên) |
| object | object (giữ nguyên) |
| override | ghi đè (`@override` giữ nguyên) |
| operand | toán hạng |
| operator precedence | độ ưu tiên toán tử |
| named parameter | tham số có tên |
| optional positional parameter | tham số tùy chọn theo vị trí |
| package | package (giữ nguyên) |
| pattern | pattern (giữ nguyên — "mẫu") |
| pattern matching | so khớp mẫu |
| parameter / argument | tham số / đối số |
| property | thuộc tính |
| potentially nullable type | kiểu có tiềm năng nullable |
| reachability analysis | phân tích khả năng đi tới |
| receiver | đối tượng nhận (receiver) |
| redeclaration (extension type) | redeclaration / khai báo lại (khác với override) |
| representation type | representation type (giữ nguyên — kiểu biểu diễn) |
| refutable pattern | pattern có thể bác bỏ |
| reified (generics) | được cụ thể hóa (reified) |
| record | record (giữ nguyên) |
| redirecting constructor | constructor chuyển tiếp |
| run-time error | lỗi lúc chạy |
| scope | phạm vi |
| shape (of a record) | shape (giữ nguyên — hình dạng của record) |
| soundness / sound | soundness / sound (giữ nguyên — tính chặt chẽ của hệ thống kiểu) |
| spawn (an isolate) | sinh (isolate) |
| short-circuit | cắt ngắn (bỏ qua phần còn lại) |
| spread operator | toán tử spread (giữ nguyên) |
| structurally typed | định kiểu theo cấu trúc |
| tear-off | tear-off (giữ nguyên) |
| transparent (extension type) | trong suốt |
| top type / bottom type | kiểu đỉnh / kiểu đáy |
| tree shaking | tree shaking (giữ nguyên — loại bỏ code chết) |
| wrapper class | lớp bọc |
| subtype / supertype | kiểu con / kiểu cha |
| stack trace | stack trace (giữ nguyên) |
| subpattern | subpattern (giữ nguyên — pattern con) |
| statement | câu lệnh |
| static method | phương thức tĩnh |
| stream | stream / `Stream` (giữ nguyên) |
| string interpolation | nội suy chuỗi |
| strongly typed | định kiểu chặt |
| syntactic sugar | cú pháp rút gọn (syntactic sugar) |
| top-level function | hàm cấp cao nhất (top-level) |
| type annotation | chú thích kiểu |
| type inference | suy luận kiểu |
| type promotion | nâng cấp kiểu |
| type-safe | an toàn kiểu (type-safe) |
| unchecked exception | unchecked exception (giữ nguyên) |
| typecast | phép ép kiểu |
| variable | biến |
| warning | cảnh báo |
| wildcard variable | biến wildcard (giữ nguyên) |

Tên riêng của từng loại pattern (`logical-or`, `null-check`, `null-assert`, `cast`,
`constant`, `variable`, `identifier`, `parenthesized`, `rest element`, `wildcard`, …) được
**giữ nguyên tiếng Anh** — chúng là tên gọi chính thức trong đặc tả ngôn ngữ và trong thông
báo lỗi của compiler.
