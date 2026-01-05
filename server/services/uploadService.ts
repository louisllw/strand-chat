import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const DEFAULT_UPLOADS_DIR = '/data/uploads';
const DEFAULT_UPLOADS_BASE_URL = '/uploads';
const DEFAULT_UPLOADS_TMP_DIR = 'tmp';

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export const getUploadsRoot = () => process.env.UPLOADS_DIR || DEFAULT_UPLOADS_DIR;

export const getUploadsBaseUrl = () => process.env.UPLOADS_BASE_URL || DEFAULT_UPLOADS_BASE_URL;

export const isAllowedImageType = (mimeType: string) => Boolean(MIME_EXTENSION_MAP[mimeType]);

const normalizeRelativePath = (input: string) => {
  const normalized = path.normalize(input).replace(/^[\\/]+/, '');
  if (normalized.startsWith('..') || normalized.includes(`..${path.sep}`)) {
    return null;
  }
  return normalized;
};

export const resolveUploadPath = (attachmentUrl: string) => {
  let relative = attachmentUrl;
  if (!relative) return null;
  if (relative.startsWith('http://') || relative.startsWith('https://')) {
    try {
      relative = new URL(relative).pathname;
    } catch {
      return null;
    }
  }
  const baseUrl = getUploadsBaseUrl().replace(/\/$/, '');
  if (relative.startsWith(baseUrl + '/')) {
    relative = relative.slice(baseUrl.length + 1);
  } else if (relative.startsWith('/')) {
    relative = relative.slice(1);
  }
  const normalized = normalizeRelativePath(relative);
  if (!normalized) return null;
  const root = path.resolve(getUploadsRoot());
  const fullPath = path.resolve(root, normalized);
  if (!fullPath.startsWith(root + path.sep)) {
    return null;
  }
  return { fullPath, relativePath: normalized };
};

export const getUploadsTempRoot = () => {
  const configured = process.env.UPLOADS_TMP_DIR;
  if (configured) return configured;
  return path.join(getUploadsRoot(), DEFAULT_UPLOADS_TMP_DIR);
};

export const createImageUploadTarget = async (mimeType: string) => {
  const extension = MIME_EXTENSION_MAP[mimeType] || 'bin';
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const relativeDir = path.join('images', year, month);
  const root = getUploadsRoot();
  const dir = path.join(root, relativeDir);
  await fs.mkdir(dir, { recursive: true });
  const filename = `${Date.now()}-${randomUUID()}.${extension}`;
  const filePath = path.join(dir, filename);
  const relativePath = `${relativeDir}/${filename}`.replace(/\\/g, '/');
  return { filePath, relativePath };
};

export const saveImageUpload = async ({
  buffer,
  mimeType,
}: {
  buffer: Buffer;
  mimeType: string;
}) => {
  const { filePath, relativePath } = await createImageUploadTarget(mimeType);
  await fs.writeFile(filePath, buffer);
  return {
    path: filePath,
    relativePath,
  };
};
