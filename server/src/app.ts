import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { auth } from './auth.js';
import { checkDatabase } from './db.js';
import { env } from './env.js';
import { errorHandler, HttpError, notFoundHandler, asyncHandler } from './errors.js';
import { logger } from './logger.js';
import { obsoleteAuthCookieCleanup } from './middleware/obsoleteAuthCookies.js';
import { apiRouter } from './routes/api.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(pinoHttp({
    logger,
    serializers: {
      req(request) {
        return {
          id: request.id,
          method: request.method,
          // OAuth codes and reset tokens may be query parameters. Never log
          // the query string even at debug level.
          path: request.url?.split('?')[0],
        };
      },
    },
    genReqId(request, response) {
      const incoming = request.headers['x-request-id'];
      const id = typeof incoming === 'string' && incoming.length <= 100 ? incoming : randomUUID();
      response.setHeader('x-request-id', id);
      return id;
    },
    customLogLevel(_request, response, error) {
      if (error || response.statusCode >= 500) return 'error';
      if (response.statusCode >= 400) return 'warn';
      return 'info';
    },
  }));

  // Ant Design injects runtime styles, so CSP needs a nonce integration before
  // enabling it. All other safe Helmet defaults stay enabled.
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  // Remove only the optional Better Auth cache cookies issued by older
  // releases. The HttpOnly session token is intentionally preserved.
  app.use(obsoleteAuthCookieCleanup());

  app.get('/livez', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.get('/healthz', asyncHandler(async (_request, response) => {
    await checkDatabase();
    response.json({ status: 'ok' });
  }));

  app.use('/api', (_request, response, next) => {
    response.setHeader('cache-control', 'no-store');
    next();
  });

  // Better Auth must receive the untouched body stream and therefore must be
  // registered before express.json(). This includes email/password and Google.
  app.all('/api/auth/{*any}', toNodeHandler(auth));

  app.use(express.json({ limit: '256kb', strict: true }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));

  app.use('/api/v1', rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.' } },
  }), apiRouter);

  app.use('/api', notFoundHandler);

  const staticDirectory = resolve(process.cwd(), env.STATIC_DIR);
  const indexFile = resolve(staticDirectory, 'index.html');
  if (existsSync(indexFile)) {
    app.use(express.static(staticDirectory, {
      index: false,
      maxAge: env.NODE_ENV === 'production' ? '1h' : 0,
      setHeaders(response, filePath) {
        if (filePath.includes(`${process.platform === 'win32' ? '\\' : '/'}assets${process.platform === 'win32' ? '\\' : '/'}`)) {
          response.setHeader('cache-control', 'public, max-age=31536000, immutable');
        }
      },
    }));
    app.use((request, response, next) => {
      // A removed build chunk must be a 404, never the SPA's HTML shell.
      if (request.path.startsWith('/assets/')) return next();
      if (request.method === 'GET' && request.accepts('html')) return response.sendFile(indexFile);
      return next();
    });
  }

  app.use(notFoundHandler);
  app.use((error: unknown, _request: express.Request, _response: express.Response, next: express.NextFunction) => {
    if (error instanceof SyntaxError && 'body' in error) {
      return next(new HttpError(400, 'INVALID_JSON', 'ساختار JSON معتبر نیست.'));
    }
    return next(error);
  });
  app.use(errorHandler);

  return app;
}
