import { z } from 'zod';
import { loadEnvFile } from 'node:process';

try {
  loadEnvFile();
} catch (error) {
  if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error;
}

const booleanFromEnv = z
  .enum(['true', 'false'])
  .transform(value => value === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    APP_BASE_URL: z.url().transform(value => value.replace(/\/$/, '')),
    TRUSTED_ORIGINS: z.string().default(''),
    TRUST_PROXY: z.coerce.number().int().min(0).max(2).default(1),
    STATIC_DIR: z.string().min(1).default('../dist'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    DATABASE_URL: z.string().trim().min(1),
    DATABASE_SSL: z.enum(['disable', 'require', 'verify-full']).default('disable'),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(30_000),
    DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(10_000),
    BETTER_AUTH_SECRET: z.string().trim().min(32),
    ENABLE_GOOGLE_AUTH: booleanFromEnv.default(true),
    GOOGLE_CLIENT_ID: z.string().trim().optional(),
    GOOGLE_CLIENT_SECRET: z.string().trim().optional(),
    MIGRATIONS_DIR: z.string().min(1).default('../postgres/migrations'),
  })
  .superRefine((value, context) => {
    const appUrl = new URL(value.APP_BASE_URL);
    if (appUrl.origin !== value.APP_BASE_URL.replace(/\/$/, '')) {
      context.addIssue({ code: 'custom', path: ['APP_BASE_URL'], message: 'Must be an origin without a path' });
    }
    if (value.NODE_ENV === 'production' && appUrl.protocol !== 'https:') {
      context.addIssue({ code: 'custom', path: ['APP_BASE_URL'], message: 'HTTPS is required in production' });
    }
    for (const origin of value.TRUSTED_ORIGINS.split(',').map(item => item.trim()).filter(Boolean)) {
      try {
        const parsedOrigin = new URL(origin);
        if (!['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.origin !== origin.replace(/\/$/, '')) {
          throw new Error('not an origin');
        }
        if (value.NODE_ENV === 'production' && parsedOrigin.protocol !== 'https:') throw new Error('HTTPS required');
      } catch {
        context.addIssue({ code: 'custom', path: ['TRUSTED_ORIGINS'], message: 'Contains an invalid origin' });
        break;
      }
    }
    if (value.ENABLE_GOOGLE_AUTH && !value.GOOGLE_CLIENT_ID) {
      context.addIssue({ code: 'custom', path: ['GOOGLE_CLIENT_ID'], message: 'Required when Google auth is enabled' });
    }
    if (value.ENABLE_GOOGLE_AUTH && !value.GOOGLE_CLIENT_SECRET) {
      context.addIssue({ code: 'custom', path: ['GOOGLE_CLIENT_SECRET'], message: 'Required when Google auth is enabled' });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const invalidKeys = [...new Set(parsed.error.issues.map(issue => issue.path.join('.') || 'environment'))];
  throw new Error(`Invalid server environment: ${invalidKeys.join(', ')}`);
}

const configuredOrigins = parsed.data.TRUSTED_ORIGINS
  .split(',')
  .map(origin => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

export const env = {
  ...parsed.data,
  TRUSTED_ORIGINS: [...new Set([parsed.data.APP_BASE_URL, ...configuredOrigins])],
};

export type ServerEnv = typeof env;
