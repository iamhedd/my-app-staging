import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentUser, signInWithEmail, signOut, signUpWithEmail } from './auth';

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

const user = { id: 'user-1', name: 'هدیه', email: 'h@example.com', emailVerified: true, image: null };

describe('same-origin cookie authentication', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('treats a null Better Auth session as signed out without relying on a 401 response', async () => {
    fetchMock.mockResolvedValue(jsonResponse(null));
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/get-session');
  });

  it('signs in with Better Auth and then resolves the server-owned session', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user }))
      .mockResolvedValueOnce(jsonResponse({ user, session: { id: 'session-1' } }));

    await expect(signInWithEmail(' h@example.com ', 'password-123')).resolves.toEqual(user);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/sign-in/email');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ email: 'h@example.com', password: 'password-123', rememberMe: true });
    expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/get-session');
  });

  it('turns a CDN-interrupted unauthorized login into a useful credentials message when the server is healthy', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

    await expect(signInWithEmail('h@example.com', 'wrong-password')).rejects.toThrow('ایمیل یا رمز عبور درست نیست');
    expect(fetchMock.mock.calls[1][0]).toBe('/healthz');
  });

  it('keeps the connection error when both login and health check are unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(signInWithEmail('h@example.com', 'password-123')).rejects.toThrow('ارتباط با سرور برقرار نشد');
  });

  it('sends the real display name during registration', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user }))
      .mockResolvedValueOnce(jsonResponse({ user, session: { id: 'session-1' } }));
    await signUpWithEmail('h@example.com', 'password-123', '  هدیه شفاعی  ');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ name: 'هدیه شفاعی' });
  });

  it('signs out through the same-origin cookie endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));
    await signOut();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/sign-out', expect.objectContaining({ method: 'POST', credentials: 'include' }));
  });
});
