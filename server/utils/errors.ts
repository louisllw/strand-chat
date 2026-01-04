import type { Response } from 'express';

export class ServiceError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const sendError = (
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown
) => {
  const payload: { error: string; code: string; details?: unknown } = { error: message, code };
  if (details !== undefined) {
    payload.details = details;
  }
  return res.status(status).json(payload);
};
