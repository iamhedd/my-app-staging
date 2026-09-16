import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger.js';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new HttpError(404, 'NOT_FOUND', `مسیر ${request.path} پیدا نشد.`));
};

function postgresError(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  const code = String(error.code);
  if (code === '23505') return new HttpError(409, 'CONFLICT', 'این اطلاعات قبلاً ثبت شده است.');
  if (code === '23503') return new HttpError(409, 'REFERENCE_CONFLICT', 'این رکورد در حال استفاده است.');
  if (code === '23514' || code === '22P02') return new HttpError(400, 'INVALID_DATA', 'اطلاعات ارسال‌شده معتبر نیست.');
  if (code === '42501') return new HttpError(403, 'DATABASE_ACCESS_DENIED', 'دسترسی به این اطلاعات مجاز نیست.');
  return null;
}

export const errorHandler: ErrorRequestHandler = (rawError, request, response, _next) => {
  const error = rawError instanceof ZodError
    ? new HttpError(400, 'VALIDATION_ERROR', 'اطلاعات ارسال‌شده معتبر نیست.')
    : rawError instanceof HttpError
      ? rawError
      : postgresError(rawError) ?? new HttpError(500, 'INTERNAL_ERROR', 'خطایی در سرور رخ داد. دوباره تلاش کنید.');

  if (error.status >= 500) {
    logger.error({ err: rawError, requestId: request.id }, 'Unhandled request error');
  }

  response.status(error.status).json({
    error: {
      code: error.code,
      message: error.message,
      requestId: request.id,
      ...(rawError instanceof ZodError
        ? { fields: rawError.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })) }
        : {}),
    },
  });
};

export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}
