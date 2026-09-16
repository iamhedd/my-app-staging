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

  it('treats an unauthorized /me response as an empty session', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'unauthorized' } }, 401));
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it('signs in with Better Auth and then resolves the server-owned session', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user }))
      .mockResolvedValueOnce(jsonResponse({ user }));

    await expect(signInWithEmail(' h@example.com ', 'password-123')).resolves.toEqual(user);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/sign-in/email');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ email: 'h@example.com', password: 'password-123', rememberMe: true });
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/me');
  });

  it('sends the real display name during registration', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user }))
      .mockResolvedValueOnce(jsonResponse({ user }));
    await signUpWithEmail('h@example.com', 'password-123', '  هدیه شفاعی  ');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ name: 'هدیه شفاعی' });
  });

  it('signs out through the same-origin cookie endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }));
    await signOut();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/sign-out', expect.objectContaining({ method: 'POST', credentials: 'include' }));
  });
});
