import { Router, raw } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { randomUUID } from 'crypto';
import { requireAuth } from '../middleware/auth.js';
import { apiWriteRateLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { sendError } from '../utils/errors.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import { getConversationMembership } from '../models/conversationModel.js';
import { getMessageAttachment } from '../models/messageModel.js';
import {
  createImageUploadTarget,
  getUploadsTempRoot,
  isAllowedImageType,
  resolveUploadPath,
  saveImageUpload,
} from '../services/uploadService.js';

const MAX_UPLOAD_BYTES = Number(process.env.UPLOAD_MAX_BYTES || 25 * 1024 * 1024);
const CHUNK_BYTES = Number(process.env.UPLOAD_CHUNK_BYTES || 5 * 1024 * 1024);
const META_FILE = 'meta.json';
const IMAGE_EXTENSIONS: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const messageAssetSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({}).optional(),
  query: z.object({}).optional(),
});

const uploadInitSchema = z.object({
  body: z.object({
    size: z.number().int().positive(),
    mimeType: z.string().min(1),
    filename: z.string().optional(),
  }),
  params: z.object({}),
  query: z.object({}),
});

const uploadChunkSchema = z.object({
  params: z.object({
    uploadId: z.string().uuid(),
  }),
  query: z.object({
    index: z.string().regex(/^\d+$/),
  }),
  body: z.any().optional(),
});

const uploadCompleteSchema = z.object({
  body: z.object({
    uploadId: z.string().uuid(),
  }),
  params: z.object({}),
  query: z.object({}),
});

type UploadMeta = {
  userId: string;
  size: number;
  mimeType: string;
  totalChunks: number;
  createdAt: string;
};

const getUploadDir = (uploadId: string) => path.join(getUploadsTempRoot(), uploadId);
const getChunkPath = (uploadDir: string, index: number) => path.join(uploadDir, `chunk_${index}.part`);
const loadMeta = async (uploadDir: string) => {
  const metaPath = path.join(uploadDir, META_FILE);
  const rawMeta = await fs.readFile(metaPath, 'utf8');
  return JSON.parse(rawMeta) as UploadMeta;
};

const pipeChunk = (chunkPath: string, writeStream: ReturnType<typeof createWriteStream>) =>
  new Promise<void>((resolve, reject) => {
    const readStream = createReadStream(chunkPath);
    const cleanup = () => {
      readStream.removeListener('error', onError);
      writeStream.removeListener('error', onError);
      readStream.removeListener('end', onEnd);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onEnd = () => {
      cleanup();
      resolve();
    };
    readStream.on('error', onError);
    writeStream.on('error', onError);
    readStream.on('end', onEnd);
    readStream.pipe(writeStream, { end: false });
  });

const appendChunksToFile = async (uploadDir: string, totalChunks: number, filePath: string) => {
  const writeStream = createWriteStream(filePath, { flags: 'w' });
  let totalBytes = 0;
  try {
    for (let index = 0; index < totalChunks; index += 1) {
      const chunkPath = getChunkPath(uploadDir, index);
      const stats = await fs.stat(chunkPath);
      totalBytes += stats.size;
      await pipeChunk(chunkPath, writeStream);
    }
    await new Promise<void>((resolve, reject) => {
      writeStream.end(() => resolve());
      writeStream.on('error', reject);
    });
    return totalBytes;
  } catch (error) {
    writeStream.destroy();
    throw error;
  }
};

const createUploadsRouter = () => {
  const router = Router();

  router.get(
    '/messages/:id',
    requireAuth,
    validate(messageAssetSchema),
    asyncHandler(async (req, res) => {
      const messageId = req.params.id;
      const userId = req.user!.userId;
      const record = await getMessageAttachment(messageId);
      if (!record || record.type !== 'image' || !record.attachmentUrl) {
        return sendError(res, 404, 'UPLOAD_NOT_FOUND', 'Image not found.');
      }
      const isMember = await getConversationMembership({
        conversationId: record.conversationId,
        userId,
        requireVisible: true,
      });
      if (!isMember) {
        return sendError(res, 403, 'FORBIDDEN', 'Forbidden');
      }
      const resolved = resolveUploadPath(record.attachmentUrl);
      if (!resolved) {
        return sendError(res, 404, 'UPLOAD_NOT_FOUND', 'Image not found.');
      }
      try {
        await fs.stat(resolved.fullPath);
      } catch {
        return sendError(res, 410, 'UPLOAD_EXPIRED', 'Image expired.');
      }
      const ext = path.extname(resolved.fullPath).toLowerCase();
      const contentType = IMAGE_EXTENSIONS[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'private, max-age=86400');
      return res.sendFile(resolved.fullPath);
    })
  );

  router.get(
    '/messages/:id/thumbnail',
    requireAuth,
    validate(messageAssetSchema),
    asyncHandler(async (req, res) => {
      const messageId = req.params.id;
      const userId = req.user!.userId;
      const record = await getMessageAttachment(messageId);
      if (!record || record.type !== 'image') {
        return sendError(res, 404, 'UPLOAD_NOT_FOUND', 'Image not found.');
      }
      const thumbPath = record.attachmentMeta?.thumbnailUrl;
      if (!thumbPath) {
        return sendError(res, 404, 'UPLOAD_NOT_FOUND', 'Thumbnail not found.');
      }
      const isMember = await getConversationMembership({
        conversationId: record.conversationId,
        userId,
        requireVisible: true,
      });
      if (!isMember) {
        return sendError(res, 403, 'FORBIDDEN', 'Forbidden');
      }
      const resolved = resolveUploadPath(thumbPath);
      if (!resolved) {
        return sendError(res, 404, 'UPLOAD_NOT_FOUND', 'Thumbnail not found.');
      }
      try {
        await fs.stat(resolved.fullPath);
      } catch {
        return sendError(res, 410, 'UPLOAD_EXPIRED', 'Thumbnail expired.');
      }
      const ext = path.extname(resolved.fullPath).toLowerCase();
      const contentType = IMAGE_EXTENSIONS[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'private, max-age=86400');
      return res.sendFile(resolved.fullPath);
    })
  );

  router.post(
    '/images/init',
    requireAuth,
    apiWriteRateLimiter,
    validate(uploadInitSchema),
    asyncHandler(async (req, res) => {
      const { size, mimeType } = req.body;
      if (!isAllowedImageType(mimeType)) {
        return sendError(res, 400, 'UPLOAD_INVALID_TYPE', 'Unsupported image type.');
      }
      if (size > MAX_UPLOAD_BYTES) {
        return sendError(res, 413, 'UPLOAD_TOO_LARGE', 'Image exceeds size limit.');
      }
      const totalChunks = Math.ceil(size / CHUNK_BYTES);
      const uploadId = randomUUID();
      const uploadDir = getUploadDir(uploadId);
      await fs.mkdir(uploadDir, { recursive: true });
      const meta: UploadMeta = {
        userId: req.user!.userId,
        size,
        mimeType,
        totalChunks,
        createdAt: new Date().toISOString(),
      };
      await fs.writeFile(path.join(uploadDir, META_FILE), JSON.stringify(meta), 'utf8');
      return res.json({ uploadId, chunkSize: CHUNK_BYTES, totalChunks });
    })
  );

  router.post(
    '/images/:uploadId/chunk',
    requireAuth,
    apiWriteRateLimiter,
    raw({ type: '*/*', limit: CHUNK_BYTES }),
    validate(uploadChunkSchema),
    asyncHandler(async (req, res) => {
      const { uploadId } = req.params;
      const index = Number(req.query.index);
      const uploadDir = getUploadDir(uploadId);
      let meta: UploadMeta;
      try {
        meta = await loadMeta(uploadDir);
      } catch {
        return sendError(res, 404, 'UPLOAD_NOT_FOUND', 'Upload not found.');
      }
      if (meta.userId !== req.user!.userId) {
        return sendError(res, 403, 'FORBIDDEN', 'Forbidden');
      }
      if (!Number.isFinite(index) || index < 0 || index >= meta.totalChunks) {
        return sendError(res, 400, 'UPLOAD_INVALID_CHUNK', 'Invalid chunk index.');
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return sendError(res, 400, 'UPLOAD_EMPTY', 'Empty chunk.');
      }
      if (req.body.length > CHUNK_BYTES) {
        return sendError(res, 413, 'UPLOAD_TOO_LARGE', 'Chunk exceeds size limit.');
      }
      const chunkPath = getChunkPath(uploadDir, index);
      await fs.writeFile(chunkPath, req.body);
      return res.json({ ok: true });
    })
  );

  router.post(
    '/images/complete',
    requireAuth,
    apiWriteRateLimiter,
    validate(uploadCompleteSchema),
    asyncHandler(async (req, res) => {
      const { uploadId } = req.body;
      const uploadDir = getUploadDir(uploadId);
      let meta: UploadMeta;
      try {
        meta = await loadMeta(uploadDir);
      } catch {
        return sendError(res, 404, 'UPLOAD_NOT_FOUND', 'Upload not found.');
      }
      if (meta.userId !== req.user!.userId) {
        return sendError(res, 403, 'FORBIDDEN', 'Forbidden');
      }
      const { filePath, relativePath } = await createImageUploadTarget(meta.mimeType);
      let totalBytes = 0;
      try {
        totalBytes = await appendChunksToFile(uploadDir, meta.totalChunks, filePath);
      } catch {
        return sendError(res, 400, 'UPLOAD_INCOMPLETE', 'Upload incomplete.');
      }
      if (totalBytes !== meta.size) {
        return sendError(res, 400, 'UPLOAD_SIZE_MISMATCH', 'Upload size mismatch.');
      }
      await fs.rm(uploadDir, { recursive: true, force: true });
      return res.json({ path: relativePath });
    })
  );

  router.post(
    '/images',
    requireAuth,
    apiWriteRateLimiter,
    raw({ type: ['image/*'], limit: MAX_UPLOAD_BYTES }),
    asyncHandler(async (req, res) => {
      const mimeType = req.get('content-type') || '';
      if (!isAllowedImageType(mimeType)) {
        return sendError(res, 400, 'UPLOAD_INVALID_TYPE', 'Unsupported image type.');
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return sendError(res, 400, 'UPLOAD_EMPTY', 'Empty upload.');
      }
      if (req.body.length > MAX_UPLOAD_BYTES) {
        return sendError(res, 413, 'UPLOAD_TOO_LARGE', 'Image exceeds size limit.');
      }
      const result = await saveImageUpload({ buffer: req.body, mimeType });
      return res.json({ path: result.relativePath });
    })
  );

  return router;
};

export default createUploadsRouter;
