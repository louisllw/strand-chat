import fs from 'fs/promises';
import type { Dirent } from 'fs';
import path from 'path';
import { getUploadsRoot, getUploadsTempRoot } from './uploadService.js';
import { logger } from '../utils/logger.js';

const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_CLEANUP_INTERVAL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_TMP_RETENTION_HOURS = 24;

const getRetentionDays = () => Number(process.env.UPLOAD_RETENTION_DAYS || DEFAULT_RETENTION_DAYS);
const getCleanupIntervalMs = () =>
  Number(process.env.UPLOAD_CLEANUP_INTERVAL_MS || DEFAULT_CLEANUP_INTERVAL_MS);
const getTmpRetentionHours = () =>
  Number(process.env.UPLOAD_TMP_RETENTION_HOURS || DEFAULT_TMP_RETENTION_HOURS);

const isOlderThanMs = (mtimeMs: number, cutoffMs: number) => {
  const cutoff = Date.now() - cutoffMs;
  return mtimeMs < cutoff;
};

const removeEmptyDirs = async (dir: string, root: string) => {
  if (dir === root) return;
  try {
    const entries = await fs.readdir(dir);
    if (entries.length === 0) {
      await fs.rmdir(dir);
    }
  } catch {
    // Ignore cleanup errors for empty directories.
  }
};

const pruneUploads = async (dir: string, root: string, cutoffMs: number) => {
  let entries: Array<Dirent>;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await pruneUploads(entryPath, root, cutoffMs);
      await removeEmptyDirs(entryPath, root);
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      const stats = await fs.stat(entryPath);
      if (isOlderThanMs(stats.mtimeMs, cutoffMs)) {
        await fs.unlink(entryPath);
      }
    } catch (error) {
      const err = error as Error;
      logger.warn('[uploads] failed to prune file', { path: entryPath, error: err.message });
    }
  }
};

export const startUploadCleanup = () => {
  const retentionDays = getRetentionDays();
  const intervalMs = getCleanupIntervalMs();
  const tmpRetentionHours = getTmpRetentionHours();
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    return;
  }
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return;
  }
  if (!Number.isFinite(tmpRetentionHours) || tmpRetentionHours <= 0) {
    return;
  }
  const root = getUploadsRoot();
  const tmpRoot = getUploadsTempRoot();
  const runCleanup = async () => {
    await pruneUploads(root, root, retentionDays * 24 * 60 * 60 * 1000);
    await pruneUploads(tmpRoot, tmpRoot, tmpRetentionHours * 60 * 60 * 1000);
  };
  void runCleanup();
  const interval = setInterval(runCleanup, intervalMs);
  if (typeof interval.unref === 'function') {
    interval.unref();
  }
};
