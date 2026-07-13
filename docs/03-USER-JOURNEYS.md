# 03 — User Journeys

**Status:** Approved baseline  
**Version:** 0.1.0

## Journey J1 — Browse and contact

1. User enters website.
2. User views categories, products or gallery.
3. User opens product detail.
4. User may:
   - Start custom design.
   - Contact via Zalo.
   - Contact via Messenger.
5. Click events may be tracked for analytics.

## Journey J2 — Customize store product

1. User selects product.
2. User selects variant.
3. User selects embroidery side/area.
4. User edits design in 2D customizer.
5. System autosaves temporary session.
6. Preview always includes watermark.
7. User reviews design.
8. User submits request.
9. User verifies email or phone.
10. System creates secure link.
11. Admin receives request.

## Journey J3 — Submit customer-owned product

1. User selects “Sản phẩm của tôi”.
2. User uploads product photos.
3. User provides dimensions.
4. User marks preferred embroidery location.
5. User uploads or creates design.
6. System shows an approximate 2D composition when possible.
7. User submits request.
8. Admin reviews feasibility manually.

## Journey J4 — Admin quotation

1. Admin opens new request.
2. Admin checks product, quantity, dimensions and design.
3. Admin may ask for clarification outside the app through Zalo/Messenger.
4. Admin creates quotation.
5. System calculates 40% deposit and 60% remaining amount.
6. Customer receives secure link.
7. Customer reviews quotation.

## Journey J5 — Digitizing and revision

1. Admin confirms request is accepted for digitizing.
2. Digitizing is performed manually.
3. Admin creates a new design version.
4. Customer opens secure link.
5. Customer selects:
   - Approve.
   - Request revision.
6. If revision is requested:
   - Request is recorded.
   - Admin creates a new version.
   - Previous version remains immutable.
7. Flow repeats without a hard revision limit.

## Journey J6 — Approval and deposit

1. Customer opens latest design version.
2. Customer approves explicit version.
3. System stores immutable approval snapshot.
4. Customer pays 40% deposit.
5. Payment is verified server-side.
6. Inventory reservation becomes official.
7. Order enters production queue.

## Journey J7 — Production and final payment

1. Admin changes order to production.
2. Admin may record production notes.
3. Production completes.
4. Admin marks order ready for final payment.
5. Customer pays remaining 60%.
6. Payment is verified.
7. Order becomes eligible for delivery.

## Journey J8 — Delivery

1. Admin enters shipping fee if not already finalized.
2. Admin records shipping provider and optional tracking code internally.
3. Admin marks order delivered.
4. Admin marks order completed.
5. No external shipping tracking integration is required.

## Journey J9 — Customer abandonment

1. User starts editor.
2. System autosaves session.
3. User leaves without submitting.
4. Session remains available for a configured limited period.
5. Session is automatically expired and deleted or anonymized according to retention policy.
6. No design library is exposed to the customer.

## Journey J10 — Reopen after approval

1. Customer requests a change after approval.
2. Approved version remains unchanged.
3. Admin creates a new branch/version.
4. New quotation or schedule adjustment may be required.
5. Customer must approve again.
6. Existing deposit handling follows business policy configured for the case.
