import { randomUUID } from 'crypto';
import { ServiceError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const errorHandler = (err, _req, res, _next) => {
  if (err instanceof ServiceError) {
    return res.status(err.status).json({ error: err.message });
  }
  const errorId = typeof randomUUID === 'function'
    ? randomUUID()
    : `err_${Date.now().toString(36)}`;
  if (process.env.NODE_ENV !== 'production') {
    logger.error('[error]', { errorId, error: err });
  } else {
    logger.error('[error]', { errorId, message: err?.message });
  }
  return res.status(500).json({ error: 'Internal server error', errorId });
};
