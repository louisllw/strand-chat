import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { ServiceError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ServiceError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  const errorId = typeof randomUUID === 'function'
    ? randomUUID()
    : `err_${Date.now().toString(36)}`;
  const requestId = _req.id;
  if (process.env.NODE_ENV !== 'production') {
    logger.error('[error]', { errorId, requestId, error: err });
  } else {
    const errorMessage = err instanceof Error ? err.message : undefined;
    logger.error('[error]', { errorId, requestId, message: errorMessage });
  }
  return res.status(500).json({ error: 'Internal server error', errorId });
};
