# 07 — Admin Operations

**Status:** Approved product baseline  
**Version:** 0.1.0

## 1. Admin model

- Exactly one active Admin account in the current product scope.
- No staff roles.
- No permission matrix.
- No multi-branch operations.

Security should still avoid designing the account as an unreplaceable hard-coded identity.

## 2. Dashboard

Admin dashboard should surface:

- New requests.
- Requests needing clarification.
- Requests awaiting quotation.
- Active digitizing.
- Designs awaiting customer response.
- Approved designs awaiting deposit.
- Orders in production.
- Orders awaiting final payment.
- Low stock.
- Failed or unmatched payments.
- Expiring quotations.
- System alerts.

## 3. Catalog operations

Admin can:

- Create/edit/archive product.
- Publish/unpublish product. Unpublish removes the product from public
  visibility and returns it to the editable draft state; it does not archive or
  delete anything (LC-04 TR-LC04-05).
- Create variants.
- Manage SKU.
- Manage images.
- Configure product sides.
- Configure embroidery areas.
- Configure physical measurements.
- Set base price.
- Set stock.
- Mark out of stock.
- Manage display order.
- Manage SEO metadata.

### 3.1. Category management

Added by `APP12-P01` (`D-044`, `IMP-D059`). Managing the production taxonomy is
a mandatory operator capability: an operator must be able to grow it without
editing source, editing a migration, mutating the database directly or deploying
the application.

Admin can:

- List categories with their lifecycle state.
- Create a category as `DRAFT` with a name and an ASCII slug (`^[a-z0-9-]+$`).
- Update draft and public-safe fields, including the name at any time and the
  slug only while the category is still pre-publication.
- Publish a category (`DRAFT → PUBLISHED`), after which the slug is immutable.
- Archive a category (`PUBLISHED → ARCHIVED`).

Deliberately out of scope: hard delete, nesting, merge, bulk taxonomy
operations, category-specific media and any generic taxonomy platform.

Refusals the operator must be able to understand:

- Archiving a category that still has `PUBLISHED` dependent Products is
  refused; the operator reassigns or unpublishes those Products first.
- Changing the slug of a published category is refused.

Exact HTTP operation allocation is owned by the APP12 category backend and
Admin UI checkpoints, not by this document.

## 4. Gallery operations

Admin can:

- Upload gallery images.
- Add title and description.
- Link to products/services.
- Categorize entries.
- Configure alt text.
- Publish/unpublish.
- Reorder.

## 5. Request operations

Admin can:

- Open request.
- View customer data.
- View submitted design.
- View product details.
- Ask for clarification.
- Reject request.
- Create quotation.
- Start digitizing.
- Create design version.
- Send version for approval.
- Record internal notes.
- Mark spam.
- Cancel request.

## 6. Design operations

Admin can:

- View all versions.
- Compare metadata.
- Create revision.
- Attach digitized/production assets.
- Generate preview.
- Send secure approval link.
- See customer feedback.
- Lock approved snapshot.
- Verify production linkage.

## 7. Quotation operations

Admin can:

- Create quotation.
- Add line items.
- Add manual adjustments.
- Add shipping.
- Define validity.
- Create revised version.
- Send to customer.
- View acceptance status.

## 8. Payment operations

Admin can:

- View deposit status.
- View final payment status.
- Record manual bank transfer review.
- Reconcile provider callback.
- Mark payment for review.
- Record refund metadata.
- View raw provider reference safely.

For `READY_MADE` orders the payment panel is a single `FULL` obligation: Admin
views the current obligation and its exact total, reviews optional transfer
evidence, and verifies the payment, which moves the order to
`READY_FOR_DELIVERY`. Deposit and remaining-payment controls are not shown.

## 9. Production operations

Admin can:

- Mark production started.
- Record production notes.
- Reference approved design.
- Mark production completed.
- Move order to final payment.
- Prevent production against unapproved version.

## 10. Inventory operations

Admin can:

- Adjust stock.
- View reserved stock.
- Release reservation.
- Record adjustment reason.
- Identify low stock.
- Prevent negative stock unless explicitly overridden with audit reason.

## 11. Shipping operations

Admin can:

- Enter shipping fee.
- Enter recipient details.
- Enter carrier name.
- Enter internal tracking code.
- Mark delivered.
- No external tracking API is required.

For `READY_MADE` orders the shipping fee is entered **before** the customer can
pay. Setting it freezes the totals and creates the `FULL` obligation; correcting
it while that obligation is `PENDING` supersedes it and creates a successor;
after the obligation is `SATISFIED` an ordinary fee edit is refused.

## 12. Auditability

Sensitive actions must be logged:

- Login.
- Product changes.
- Stock changes.
- Quotation changes.
- Design version creation.
- Approval.
- Payment state changes.
- Order transition.
- Cancellation.
- Refund.
- Security configuration changes.

## 13. Ready-Made order operations

Added by `APP12-P01` (`D-043`, `IMP-D058`). Ready-Made orders live in the
**existing** Admin Order application. No second order application is created.

Admin can:

- Identify the order origin (`READY_MADE` or `CUSTOM`) in the order list and on
  the order detail, and filter by it.
- Review the customer and delivery facts of a Ready-Made order.
- Set and correct the shipping fee before payment (§11).
- Review the `FULL` payment and its evidence, and verify it (§8).
- Dispatch and complete the order through the existing fulfilment authority.
- Cancel or refund through the existing cancellation and refund authority where
  it applies.

A Ready-Made order detail must not render custom-only panels: quotation, design
version, approval snapshot, production job or the remaining-payment workflow.

Conceptual capability names only — exact HTTP operations are allocated by the
APP12 backend and Admin UI checkpoints.
