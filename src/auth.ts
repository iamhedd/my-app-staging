import { ApiError, apiRequest, jsonBody } from './api';

export type User = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
};

type MeResponse = { user: User };

export async function getCurrentUser(): Promise<User | null> {
  try {
    const data = await apiRequest<MeResponse>('/api/v1/me');
    return data.user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function signInWithEmail(email: string, password: string) {
  await apiRequest('/api/auth/sign-in/email', {
    method: 'POST',
    body: jsonBody({ email: email.trim(), password, rememberMe: true }),
  });
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
