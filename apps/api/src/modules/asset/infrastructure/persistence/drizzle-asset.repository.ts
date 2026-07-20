/**
 * Drizzle implementation of the AGG-08 Asset contract (TBL-022..TBL-024).
 */
import { Injectable } from '@nestjs/common';
import { DatabaseExecutor, DrizzleRepository } from '@embroidery/persistence';
import { guardViolationError, notFoundError, schema } from '@embroidery/database';
import type { AssetInspectionOutcome } from '@embroidery/database';
import { and, desc, eq, ne } from 'drizzle-orm';

import type {
  Asset,
  AssetDerivative,
  AssetDerivativeId,
  AssetId,
  AssetInspection,
  AssetRepository,
  RegisterAssetInput,
  RegisterDerivativeInput,
} from '../../domain/repositories/asset.repository';
import { toAsset, toDerivative, toInspection } from './asset-row.mapper';

const { assets, assetDerivatives, assetInspections } = schema;

@Injectable()
export class DrizzleAssetRepository extends DrizzleRepository implements AssetRepository {
  constructor(executor: DatabaseExecutor) {
    super(executor);
  }

  async register(input: RegisterAssetInput): Promise<Asset> {
    return this.run('register', async () => {
      const [row] = await this.db
        .insert(assets)
        .values({
          id: input.id,
          kind: input.kind,
          classification: input.classification,
          storageKey: input.storageKey,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          checksum: input.checksum ?? null,
          // Registered, not yet inspected: an asset is not usable until the
          // validation pipeline has accepted it (REQ-ASSET-002).
          status: 'UPLOADED',
          uploadedByCustomerId: input.uploadedByCustomerId ?? null,
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'AssetRepository.register',
          'ASSET_NOT_REGISTERED',
          'Could not register the asset.',
        );
      }
      return toAsset(row);
    });
  }

  async recordInspection(
    assetId: AssetId,
    outcome: AssetInspectionOutcome,
    detail: string | undefined,
    at: Date,
  ): Promise<Asset> {
    return this.run('recordInspection', async () => {
      const tx = this.requireTransaction('recordInspection');

      await tx.insert(assetInspections).values({
        assetId,
        outcome,
        detail: detail ?? null,
        inspectedAt: at,
      });

      const [row] = await tx
        .update(assets)
        .set({
          status: outcome === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED',
          updatedAt: at,
        })
        .where(eq(assets.id, assetId))
        .returning();

      if (row === undefined) {
        throw notFoundError('AssetRepository.recordInspection', 'That asset does not exist.');
      }
      return toAsset(row);
    });
  }

  async registerDerivative(input: RegisterDerivativeInput): Promise<AssetDerivative> {
    return this.run('registerDerivative', async () => {
      const [row] = await this.db
        .insert(assetDerivatives)
        .values({
          id: input.id,
          assetId: input.assetId,
          kind: input.kind,
          status: 'PENDING',
          isWatermarked: input.isWatermarked,
        })
        .returning();

      if (row === undefined) {
        throw guardViolationError(
          'AssetRepository.registerDerivative',
          'DERIVATIVE_NOT_REGISTERED',
          'Could not register the derivative.',
        );
      }
      return toDerivative(row);
    });
  }

  async completeDerivative(
    id: AssetDerivativeId,
    storageKey: string,
    checksum: string | undefined,
  ): Promise<AssetDerivative> {
    return this.run('completeDerivative', async () => {
      const [row] = await this.db
        .update(assetDerivatives)
        .set({ status: 'READY', storageKey, checksum: checksum ?? null, updatedAt: new Date() })
        .where(eq(assetDerivatives.id, id))
        .returning();

      if (row === undefined) {
        throw notFoundError(
          'AssetRepository.completeDerivative',
          'That derivative does not exist.',
        );
      }
      return toDerivative(row);
    });
  }

  async failDerivative(id: AssetDerivativeId): Promise<void> {
    return this.run('failDerivative', async () => {
      // FAILED also releases the `(asset, kind)` arbiter, whose predicate
      // excludes failed rows — so a retry can register the same kind again.
      await this.db
        .update(assetDerivatives)
        .set({ status: 'FAILED', updatedAt: new Date() })
        .where(eq(assetDerivatives.id, id));
    });
  }

  async tombstone(id: AssetId, reason: string, at: Date): Promise<Asset> {
    return this.run('tombstone', async () => {
      const tx = this.requireTransaction('tombstone');

      const [row] = await tx
        .update(assets)
        .set({
          status: 'DELETED',
          deletionRequestedAt: at,
          deletionReason: reason,
          deletedAt: at,
          updatedAt: at,
        })
        .where(eq(assets.id, id))
        .returning();

      if (row === undefined) {
        throw notFoundError('AssetRepository.tombstone', 'That asset does not exist.');
      }

      // Derivatives of a tombstoned asset must stop being serveable in the same
      // transaction: leaving a watermarked preview READY behind a deleted
      // original is exactly the leak the tombstone exists to prevent (INV-22).
      await tx
        .update(assetDerivatives)
        .set({ status: 'FAILED', updatedAt: at })
        .where(and(eq(assetDerivatives.assetId, id), ne(assetDerivatives.status, 'FAILED')));

      return toAsset(row);
    });
  }

  async findById(id: AssetId): Promise<Asset | undefined> {
    return this.run('findById', async () => {
      const [row] = await this.db.select().from(assets).where(eq(assets.id, id)).limit(1);
      return row === undefined ? undefined : toAsset(row);
    });
  }

  async findByStorageKey(storageKey: string): Promise<Asset | undefined> {
    return this.run('findByStorageKey', async () => {
      const [row] = await this.db
        .select()
        .from(assets)
        .where(eq(assets.storageKey, storageKey))
        .limit(1);
      return row === undefined ? undefined : toAsset(row);
    });
  }

  async listDerivatives(assetId: AssetId): Promise<AssetDerivative[]> {
    return this.run('listDerivatives', async () => {
      const rows = await this.db
        .select()
        .from(assetDerivatives)
        .where(eq(assetDerivatives.assetId, assetId));
      return rows.map(toDerivative);
    });
  }

  async listInspections(assetId: AssetId): Promise<AssetInspection[]> {
    return this.run('listInspections', async () => {
      const rows = await this.db
        .select()
        .from(assetInspections)
        .where(eq(assetInspections.assetId, assetId))
        .orderBy(desc(assetInspections.inspectedAt));
      return rows.map(toInspection);
    });
  }
}
