import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: null,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers.set-cookie',
      'password',
      '*.password',
      '*.token',
      '*.secret',
      'GOOGLE_CLIENT_SECRET',
      'BETTER_AUTH_SECRET',
      'DATABASE_URL',
    ],
    censor: '[REDACTED]',
  },
});
