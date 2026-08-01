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
