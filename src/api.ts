export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code = 'API_ERROR',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiErrorPayload = {
  error?: { code?: string; message?: string } | string;
  code?: string;
  message?: string;
};

function errorDetails(payload: unknown, status: number) {
  const body = payload && typeof payload === 'object' ? payload as ApiErrorPayload : {};
  const nested = body.error && typeof body.error === 'object' ? body.error : undefined;
  const message = nested?.message
    || (typeof body.error === 'string' ? body.error : undefined)
    || body.message
    || (status === 401 ? 'نشست شما منقضی شده است. دوباره وارد شوید.' : 'ارتباط با سرور انجام نشد. دوباره تلاش کنید.');
  return { message, code: nested?.code || body.code || `HTTP_${status}` };
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body != null && !headers.has('content-type')) headers.set('content-type', 'application/json');
  headers.set('accept', 'application/json');

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, credentials: 'include' });
  } catch {
    throw new ApiError('ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.', 0, 'NETWORK_ERROR');
  }

  const contentType = response.headers.get('content-type') || '';
  const payload: unknown = response.status === 204
    ? undefined
    : contentType.includes('application/json')
      ? await response.json().catch(() => undefined)
      : await response.text().catch(() => undefined);

  if (!response.ok) {
    if (response.status === 401 && path.startsWith('/api/v1/') && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('gav:session-expired'));
    }
    const { message, code } = errorDetails(payload, response.status);
    throw new ApiError(message, response.status, code);
  }
  return payload as T;
}

export function jsonBody(value: unknown) {
  return JSON.stringify(value);
}
