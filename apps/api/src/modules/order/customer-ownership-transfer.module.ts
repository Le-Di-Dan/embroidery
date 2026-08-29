import { Module } from '@nestjs/common';
import { DatabaseModule } from '@embroidery/persistence';

import { ORDERING_CUSTOMER_OWNERSHIP_TRANSFER_PORT } from './domain/repositories/customer-ownership-transfer.port';
import { DrizzleCustomerOwnershipTransferAdapter } from './infrastructure/persistence/drizzle-customer-ownership-transfer.adapter';

/**
 * Ordering's merge ownership transfer, published on its own (`APP10-B03` §14).
 *
 * A module that exports **one write port with one method**, on the precedent
 * `CustomerMergeConsequenceModule` set beside it. Kept separate from that one
 * because the two have opposite risk: the consequence port counts and must never
 * write, and this one writes. A single module exporting both would hand the
 * `APP10-B02` preview a cross-module `UPDATE` it has no business being able to
 * reach.
 *
 * It is not folded into `OrderModule` for the reason recorded there either: that
 * module exports `CUSTOM_REQUEST_REPOSITORY` and `ORDER_REPOSITORY`, the AGG-13
 * and AGG-15 lifecycle writers. A merge that imported it to repoint a column
 * would gain `transition()` and `dispatch()` in the same injector.
 *
 * No controller, so no route. `DatabaseModule` is imported for the adapter's
 * executor and not re-exported: importing this module confers one method and
 * nothing else.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: ORDERING_CUSTOMER_OWNERSHIP_TRANSFER_PORT,
      useClass: DrizzleCustomerOwnershipTransferAdapter,
    },
  ],
  exports: [ORDERING_CUSTOMER_OWNERSHIP_TRANSFER_PORT],
})
export class CustomerOwnershipTransferModule {}
