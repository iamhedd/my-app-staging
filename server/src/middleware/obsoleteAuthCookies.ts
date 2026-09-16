import type { RequestHandler } from 'express';

const obsoleteCookieRoots = [
  'gav.session_data',
  '__Secure-gav.session_data',
  'gav.account_data',
  '__Secure-gav.account_data',
  'gav.dont_remember',
  '__Secure-gav.dont_remember',
] as const;

export function findObsoleteAuthCookieNames(cookieHeader: string | undefined) {
  if (!cookieHeader) return [];

  return [...new Set(cookieHeader
    .split(';')
    .map(cookie => {
      const separator = cookie.indexOf('=');
      return separator > 0 ? cookie.slice(0, separator).trim() : '';
    })
    .filter(Boolean)
    .filter(name => obsoleteCookieRoots.some(root => {
      if (name === root) return true;
      const chunkSuffix = name.slice(root.length);
      return chunkSuffix.startsWith('.') && /^\.\d+$/.test(chunkSuffix);
    })))];
}

export function obsoleteAuthCookieCleanup(): RequestHandler {
  return (request, response, next) => {
    const names = findObsoleteAuthCookieNames(request.headers.cookie);
    if (names.length > 0) {
      response.append('Set-Cookie', names.map(name => {
        const secure = name.startsWith('__Secure-') ? '; Secure' : '';
        return `${name}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; SameSite=Lax${secure}`;
      }));
    }
    next();
  };
}
