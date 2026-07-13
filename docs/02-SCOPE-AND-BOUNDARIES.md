# 02 — Scope and Boundaries

**Status:** Approved baseline  
**Version:** 0.1.0

## 1. In scope

### Storefront

- Brand introduction.
- Catalog.
- Product detail.
- Gallery.
- SEO landing pages.
- FAQ and policies.
- Zalo/Messenger contact links.

### Commerce

- Custom request.
- Manual quotation.
- Secure customer link.
- Design approval.
- Deposit 40%.
- Remaining payment 60%.
- Inventory.
- Shipping fee entered by Admin.
- Order lifecycle.

### Design Studio

- Advanced 2D product customizer.
- Text, image, SVG, shapes and drawing.
- Layers and transforms.
- Preview on 2D product images.
- Watermark.
- Autosave.
- Internal versioning.
- No customer export.

### Admin

- Single Admin account.
- Catalog.
- Inventory.
- Gallery.
- Requests.
- Design versions.
- Quotation.
- Payments.
- Production state.
- Shipping data.
- SEO metadata.
- Audit log.

## 2. Explicitly out of scope

- 3D product preview.
- 360-degree rotation.
- Stitch simulation.
- Automatic digitizing.
- Editing stitch path.
- Full Canva clone.
- Full Illustrator-like vector editing.
- Customer design library.
- Customer export.
- Native mobile app.
- Multiple staff accounts.
- Role-based authorization matrix.
- Multi-branch.
- Chatbot.
- AI support agent.
- Unified inbox.
- Zalo/Messenger message synchronization.
- Shipping provider API.
- Shipping tracking.
- Blog publishing system.
- Complex B2B procurement.
- Marketplace.
- Multi-vendor.
- Internationalization beyond future readiness.
- Multi-currency.
- Subscription business model.

## 3. Product provided by customer

Supported flow:

- Customer uploads product images.
- Customer provides dimensions and notes.
- Customer marks expected embroidery location.
- Admin reviews manually.
- Preview accuracy is not guaranteed if source images or dimensions are insufficient.

Not supported:

- Automatic 3D reconstruction.
- Automatic physical scale detection.
- Guaranteed exact mockup without real measurements.

## 4. Screenshot prevention boundary

The product can:

- Remove download/export actions.
- Add dynamic watermark.
- Reduce preview resolution.
- Protect private assets by authorization.
- Use expiring URLs.
- Detect some obvious abuse patterns.

The product cannot guarantee prevention of:

- OS screenshot.
- Screen recording.
- External camera.
- Photographing the screen with another device.
- Advanced browser extraction by a determined technical user.

The correct security goal is:

> Reduce commercial usefulness of copied previews and prevent legitimate access to original assets.

## 5. Deferred technical scope

The following are deferred to technical design:

- Frameworks.
- Database.
- Hosting topology.
- Repository structure.
- CI/CD.
- Observability tooling.
- Canvas engine.
- Image processing engine.
- Payment provider implementation details.
- Authentication implementation.
- Claude workflow.
