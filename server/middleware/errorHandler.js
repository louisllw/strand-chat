import { ServiceError } from '../utils/errors.js';

export const errorHandler = (err, _req, res, _next) => {
  if (err instanceof ServiceError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
};
