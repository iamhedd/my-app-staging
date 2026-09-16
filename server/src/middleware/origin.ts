import type { RequestHandler } from 'express';
import { env } from '../env.js';
import { HttpError } from '../errors.js';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
const trustedOrigins = new Set(env.TRUSTED_ORIGINS);

export const requireTrustedOrigin: RequestHandler = (request, _response, next) => {
  if (safeMethods.has(request.method)) return next();

  const origin = request.get('origin');
  if (origin && !trustedOrigins.has(origin.replace(/\/$/, ''))) {
    return next(new HttpError(403, 'UNTRUSTED_ORIGIN', 'مبدأ این درخواست مجاز نیست.'));
  }

  return next();
};
