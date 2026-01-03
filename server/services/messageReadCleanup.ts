import { query } from '../db.js';
import { logger } from '../utils/logger.js';

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

const getRetentionDays = () => Number(process.env.MESSAGE_READ_RETENTION_DAYS || DEFAULT_RETENTION_DAYS);
const getCleanupIntervalMs = () =>
  Number(process.env.MESSAGE_READ_CLEANUP_INTERVAL_MS || DEFAULT_CLEANUP_INTERVAL_MS);

export const startMessageReadCleanup = () => {
  const retentionDays = getRetentionDays();
  const intervalMs = getCleanupIntervalMs();

  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    return;
  }
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return;
  }

  const runCleanup = async () => {
    try {
      const result = await query(
        `delete from message_reads
         where read_at < now() - ($1::int * interval '1 day')`,
        [retentionDays]
      );
      if (process.env.NODE_ENV !== 'production' && (result.rowCount ?? 0) > 0) {
        logger.debug('[db] pruned message_reads', { deleted: result.rowCount });
      }
    } catch (error) {
      const err = error as Error;
      logger.warn('[db] message_reads cleanup failed', { error: err.message });
    }
  };

  void runCleanup();
  const interval = setInterval(runCleanup, intervalMs);
  if (typeof interval.unref === 'function') {
    interval.unref();
  }
};
