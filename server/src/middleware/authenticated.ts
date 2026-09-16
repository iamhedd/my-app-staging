import type { RequestHandler } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../auth.js';
import { HttpError, asyncHandler } from '../errors.js';
import { isAdminUser } from '../data/repository.js';

export const requireSession: RequestHandler = asyncHandler(async (request, _response, next) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  });

  if (!session) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'برای ادامه وارد حساب خود شوید.');
  }

  request.auth = session;
  next();
});

export function currentUserId(request: Express.Request) {
  if (!request.auth) throw new HttpError(401, 'UNAUTHENTICATED', 'برای ادامه وارد حساب خود شوید.');
  return request.auth.user.id;
}

export const requireAdmin: RequestHandler = asyncHandler(async (request, _response, next) => {
  const userId = currentUserId(request);
  if (!await isAdminUser(userId)) {
    throw new HttpError(403, 'ADMIN_REQUIRED', 'این بخش فقط برای مدیر در دسترس است.');
  }
  next();
});
