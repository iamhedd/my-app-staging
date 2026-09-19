import { ApiError, apiRequest, jsonBody } from './api';

export type User = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
};

type AuthSessionResponse = { user?: User | null };

const invalidCredentialsMessage = 'ایمیل یا رمز عبور درست نیست. اگر حسابت را با گوگل ساخته‌ای، از دکمه ورود با گوگل استفاده کن.';

export async function getCurrentUser(): Promise<User | null> {
  try {
    // Better Auth deliberately returns HTTP 200 with a null body when there is
    // no session. Unlike protected API routes, this remains readable behind
    // CDNs that replace or interrupt upstream 401 responses.
    const data = await apiRequest<AuthSessionResponse | null>('/api/auth/get-session');
    return data?.user ?? null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function signInWithEmail(email: string, password: string) {
  try {
    await apiRequest('/api/auth/sign-in/email', {
      method: 'POST',
      body: jsonBody({ email: email.trim(), password, rememberMe: true }),
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) throw new Error(invalidCredentialsMessage);
    if (error instanceof ApiError && error.code === 'NETWORK_ERROR') {
      // Some edge/CDN configurations terminate upstream 401 responses as a
      // network error. A successful health probe distinguishes that case from
      // a genuinely unavailable server without hiding real outages.
      let serverIsReachable = false;
      try {
        await apiRequest('/healthz');
        serverIsReachable = true;
      } catch { /* Keep the original network error. */ }
      if (serverIsReachable) throw new Error(invalidCredentialsMessage);
    }
    throw error;
  }
  const user = await getCurrentUser();
  if (!user) throw new Error('ورود انجام نشد. ایمیل و رمز عبور را بررسی کنید.');
  return user;
}

export async function signUpWithEmail(email: string, password: string, fullName: string) {
  await apiRequest('/api/auth/sign-up/email', {
    method: 'POST',
    body: jsonBody({ email: email.trim(), password, name: fullName.trim() }),
  });
  const user = await getCurrentUser();
  if (!user) throw new Error('حساب ساخته شد؛ برای ورود دوباره تلاش کنید.');
  return user;
}

export async function signInWithGoogle() {
  const callbackURL = `${window.location.origin}/`;
  const data = await apiRequest<{ url?: string; redirect?: boolean }>('/api/auth/sign-in/social', {
    method: 'POST',
    body: jsonBody({ provider: 'google', callbackURL, errorCallbackURL: callbackURL }),
  });
  if (!data.url) throw new Error('آدرس ورود گوگل از سرور دریافت نشد.');
  window.location.assign(data.url);
}

export async function signOut() {
  await apiRequest('/api/auth/sign-out', { method: 'POST', body: jsonBody({}) });
}
