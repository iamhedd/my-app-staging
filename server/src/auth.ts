import { betterAuth } from 'better-auth';
import { pool } from './db.js';
import { env } from './env.js';

const socialProviders = env.ENABLE_GOOGLE_AUTH
  ? {
      google: {
        clientId: env.GOOGLE_CLIENT_ID!,
        clientSecret: env.GOOGLE_CLIENT_SECRET!,
      },
    }
  : {};

export const auth = betterAuth({
  appName: 'گاو',
  baseURL: env.APP_BASE_URL,
  basePath: '/api/auth',
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: env.TRUSTED_ORIGINS,
  database: pool,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: false,
  },
  socialProviders,
  account: {
    modelName: 'accounts',
    fields: {
      accountId: 'account_id',
      providerId: 'provider_id',
      userId: 'user_id',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      idToken: 'id_token',
      accessTokenExpiresAt: 'access_token_expires_at',
      refreshTokenExpiresAt: 'refresh_token_expires_at',
      scope: 'scope',
      password: 'password',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    accountLinking: {
      enabled: true,
      trustedProviders: ['google'],
    },
  },
  user: {
    modelName: 'users',
    fields: {
      name: 'name',
      email: 'email',
      emailVerified: 'email_verified',
      image: 'image',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  session: {
    modelName: 'sessions',
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
    fields: {
      expiresAt: 'expires_at',
      token: 'token',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      ipAddress: 'ip_address',
      userAgent: 'user_agent',
      userId: 'user_id',
    },
  },
  verification: {
    modelName: 'verifications',
    fields: {
      identifier: 'identifier',
      value: 'value',
      expiresAt: 'expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  advanced: {
    cookiePrefix: 'gav',
    useSecureCookies: env.NODE_ENV === 'production',
    defaultCookieAttributes: {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    },
  },
  rateLimit: {
    enabled: env.NODE_ENV === 'production',
    window: 60,
    max: 100,
  },
  logger: {
    level: env.NODE_ENV === 'production' ? 'warn' : 'info',
  },
});

export type Auth = typeof auth;
