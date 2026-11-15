import type { NextFunction, Request, Response } from 'express';
import { externalAuthError } from '../helper/ExternalAuth';

export function auth (req: Request, res: Response, next: NextFunction) {
  const error = externalAuthError(req);
  if (error) return res.status(error.status).header('Cache-Control', 'no-store').json({ code: -1, message: error.message });
  return next();
}
