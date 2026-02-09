import mongoose, { type Model, Schema } from 'mongoose';
import { logger } from '../utils/logger.js';

interface IDistributedJobLock {
  key: string;
  ownerId: string;
  acquiredAt: Date;
  expiresAt: Date;
}

const distributedJobLockSchema = new Schema<IDistributedJobLock>(
  {
    key: { type: String, required: true, unique: true, index: true },
    ownerId: { type: String, required: true },
    acquiredAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: true },
  },
  {
    versionKey: false,
    timestamps: false,
    collection: 'distributed_job_locks',
  }
);

const DistributedJobLockModel =
  (mongoose.models.DistributedJobLock as Model<IDistributedJobLock> | undefined) ??
  mongoose.model<IDistributedJobLock>('DistributedJobLock', distributedJobLockSchema);

const DEFAULT_LOCK_TTL_MS = Math.max(
  60_000,
  Number.parseInt(process.env.SCHEDULER_LOCK_TTL_MS ?? '840000', 10)
);

export const schedulerOwnerId = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;

export async function runWithDistributedJobLock<T>(
  lockKey: string,
  task: () => Promise<T>,
  options?: { ttlMs?: number }
): Promise<{ acquired: boolean; result?: T }> {
  const now = new Date();
  const ttlMs = options?.ttlMs ?? DEFAULT_LOCK_TTL_MS;
  const expiresAt = new Date(now.getTime() + ttlMs);

  try {
    const lockDoc = await DistributedJobLockModel.findOneAndUpdate(
      {
        key: lockKey,
        $or: [{ expiresAt: { $lte: now } }, { ownerId: schedulerOwnerId }],
      },
      {
        $set: {
          ownerId: schedulerOwnerId,
          acquiredAt: now,
          expiresAt,
        },
        $setOnInsert: {
          key: lockKey,
        },
      },
      {
        upsert: true,
        new: true,
      }
    )
      .lean()
      .exec();

    if (!lockDoc || lockDoc.ownerId !== schedulerOwnerId) {
      return { acquired: false };
    }

    const result = await task();
    return { acquired: true, result };
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as { code?: number }).code === 11000) {
      logger.info(`[Scheduler] Lock busy for ${lockKey}, skipping this tick`);
      return { acquired: false };
    }

    throw error;
  }
}
