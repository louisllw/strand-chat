import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';

export const validate = (schema: ZodTypeAny) => (req: Request, res: Response, next: NextFunction) => {
  const result = schema.safeParse({
    body: req.body,
    params: req.params,
    query: req.query,
  });

  if (!result.success) {
    return res.status(400).json({
      error: 'Invalid request',
      details: result.error.flatten(),
    });
  }

  const parsed = result.data as { body: unknown; params: unknown; query: unknown };
  req.body = parsed.body as Request['body'];
  req.params = parsed.params as Request['params'];
  req.query = parsed.query as Request['query'];
  return next();
};
