# Embroidery Commerce Platform — Product Documentation

**Document set version:** 0.2.1  
**Status:** Product baseline established · Database DB0–DB10 complete · Application implementation stage governed under `docs/implementation/`  
**Primary language:** Vietnamese  
**Purpose:** Nguồn tham chiếu chính thức cho việc phân tích, thiết kế và phát triển hệ thống bằng Claude.

## 1. Mục tiêu của bộ tài liệu

Bộ tài liệu này mô tả sản phẩm, phạm vi, quy trình nghiệp vụ, trải nghiệm người dùng, yêu cầu chất lượng và các ràng buộc đã được xác nhận.

Tech stack nền tảng, cấu trúc repository và coding conventions đã được khóa. Các quyết định còn mở như ORM, queue/broker, canvas library, CI/CD chi tiết, production topology và quy trình delivery với Claude phải được khóa bằng ADR hoặc tài liệu chuyên biệt.

## 2. Thứ tự ưu tiên khi có mâu thuẫn

Khi hai tài liệu có nội dung mâu thuẫn, áp dụng thứ tự sau:

1. `docs/00-PROJECT-CHARTER.md`
2. `docs/01-PRODUCT-REQUIREMENTS.md`
3. `docs/04-BUSINESS-RULES.md`
4. `docs/05-DESIGN-STUDIO-SPEC.md`
5. `docs/06-ORDER-AND-DESIGN-LIFECYCLE.md`
6. Các tài liệu còn lại

Mọi thay đổi baseline phải được ghi vào `docs/12-DECISION-LOG.md`.

## 3. Danh sách tài liệu

| Mã | Tài liệu | Mục đích |
|---|---|---|
| 00 | [PROJECT CHARTER](docs/00-PROJECT-CHARTER.md) | Tầm nhìn, mục tiêu, nguyên tắc và ranh giới cấp cao |
| 01 | [PRODUCT REQUIREMENTS](docs/01-PRODUCT-REQUIREMENTS.md) | Yêu cầu sản phẩm chính thức |
| 02 | [SCOPE AND BOUNDARIES](docs/02-SCOPE-AND-BOUNDARIES.md) | Phạm vi có/không có |
| 03 | [USER JOURNEYS](docs/03-USER-JOURNEYS.md) | Luồng người dùng đầu-cuối |
| 04 | [BUSINESS RULES](docs/04-BUSINESS-RULES.md) | Quy tắc kinh doanh bắt buộc |
| 05 | [DESIGN STUDIO SPEC](docs/05-DESIGN-STUDIO-SPEC.md) | Đặc tả editor thiết kế custom |
| 06 | [ORDER AND DESIGN LIFECYCLE](docs/06-ORDER-AND-DESIGN-LIFECYCLE.md) | Vòng đời yêu cầu, thiết kế, báo giá và đơn hàng |
| 07 | [ADMIN OPERATIONS](docs/07-ADMIN-OPERATIONS.md) | Phạm vi vận hành dành cho Admin |
| 08 | [SEO AND CONTENT](docs/08-SEO-AND-CONTENT.md) | SEO, gallery và nội dung thương mại |
| 09 | [SECURITY AND ABUSE PREVENTION](docs/09-SECURITY-AND-ABUSE-PREVENTION.md) | Bảo mật và chống lạm dụng editor |
| 10 | [NON-FUNCTIONAL REQUIREMENTS](docs/10-NON-FUNCTIONAL-REQUIREMENTS.md) | Chất lượng, hiệu năng, độ tin cậy và vận hành |
| 11 | [DOMAIN GLOSSARY](docs/11-DOMAIN-GLOSSARY.md) | Từ điển nghiệp vụ chuẩn |
| 12 | [DECISION LOG](docs/12-DECISION-LOG.md) | Nhật ký quyết định đã khóa và vấn đề còn mở |
| 13 | [ACCEPTANCE PRINCIPLES](docs/13-ACCEPTANCE-PRINCIPLES.md) | Nguyên tắc nghiệm thu về sau |


## 3.1. Tài liệu kỹ thuật

| Tài liệu | Mục đích |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Chỉ mục bắt buộc dành cho Claude |
| [SYSTEM ARCHITECTURE](docs/architecture/SYSTEM_ARCHITECTURE.md) | Kiến trúc logic và ranh giới hệ thống |
| [REPOSITORY STRUCTURE](docs/architecture/REPOSITORY_STRUCTURE.md) | Cấu trúc monorepo và quy tắc đặt code |
| [FRONTEND CONVENTIONS](docs/development/FRONTEND_CONVENTIONS.md) | Quy ước Next.js, TanStack Query, Zustand và component |
| [BACKEND CONVENTIONS](docs/development/BACKEND_CONVENTIONS.md) | Quy ước NestJS modular monolith và module boundaries |
| [LOCAL DEVELOPMENT](docs/development/LOCAL_DEVELOPMENT.md) | Hướng dẫn cài đặt, chạy local, Docker Compose và quality gates |

## 3.2. Giai đoạn triển khai ứng dụng (Application implementation stage)

- Giai đoạn database (DB0–DB10) đã **hoàn tất**; trạng thái canonical tại [`docs/database/DB_ROADMAP.md`](docs/database/DB_ROADMAP.md).
- Việc triển khai ứng dụng (backend, admin, storefront, worker, integration) được quản trị tại [`docs/implementation/README.md`](docs/implementation/README.md).
- Lộ trình ứng dụng APP0–APP12 tại [`docs/implementation/10-MASTER-APPLICATION-ROADMAP.md`](docs/implementation/10-MASTER-APPLICATION-ROADMAP.md).
- Đây chỉ là chỉ mục; không sao chép trạng thái phase vào README. Trạng thái phase chỉ nằm ở các canonical roadmap ở trên.

## 4. Phạm vi của phiên bản tài liệu 0.2.1

Phiên bản này đã khóa:

- Mô hình kinh doanh B2C là chính.
- Sản phẩm nền và dịch vụ thêu.
- Advanced Product Customizer.
- Preview 2D.
- Watermark và chống export.
- Autosave và versioning nội bộ.
- Quy trình digitizing thủ công.
- Phê duyệt thiết kế qua liên kết bảo mật.
- Đặt cọc 40% sau khi khách duyệt thiết kế.
- Thanh toán 60% còn lại trước giao hàng.
- Một Admin duy nhất.
- Zalo và Messenger chỉ là liên kết liên hệ đơn giản.
- Quản lý tồn kho theo SKU.
- SEO mạnh nhưng không có blog.
- Self-host tại cửa hàng.
- Quy mô dưới 100 đơn/tháng và dưới 10 người dùng editor đồng thời.

## 5. Technical baseline đã khóa

Các quyết định sau đã được khóa (xem `docs/12-DECISION-LOG.md` D-022 → D-035 và `CLAUDE.md` §4):

- Monorepo với pnpm workspaces và Turborepo.
- Next.js App Router cho storefront và admin (hai application riêng), server-first hybrid rendering.
- NestJS modular monolith cho API và worker application riêng.
- PostgreSQL là system-of-record database.
- Docker + Docker Compose cho development; Kubernetes là production target.
- Nginx Open Source là development edge gateway; production sẽ dùng Kubernetes Gateway API, không dùng ingress-nginx (D-036).
- Axios là HTTP client duy nhất cho internal API; TanStack Query cho server state; Zustand cho browser-only state.
- TypeScript strict, ESLint, Prettier, SonarQube và file-size limits (400/600 dòng).
- Standard API response envelope cho internal JSON APIs.

## 6. Nội dung cố ý chưa quyết định

Các open decision thật sự (xem `docs/12-DECISION-LOG.md` mục Open Decisions):

- ORM và migration framework.
- Queue/message broker.
- Concrete object-storage product (chỉ abstraction S3-compatible đã khóa).
- Canvas library.
- UI component library.
- Authentication/OTP implementation.
- Payment provider implementation.
- Kubernetes distribution và production topology.
- Observability vendor.
- Git hosting, branching strategy, CI/CD và release model.

Các nội dung này phải được khóa bằng ADR trước khi triển khai.
