import 'express';

declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      userId: string;
      jti?: string;
      exp?: number;
      iat?: number;
    };
    id?: string;
    authToken?: string;
  }
}
