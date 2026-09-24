import { describe, expect, it } from 'vitest';
import { recoverPreloadError } from './preloadRecovery';

function failedImport(message: string) {
  return Object.assign(new Event('vite:preloadError', { cancelable: true }), { payload: new Error(message) });
}

describe('stale build recovery', () => {
  it('reloads once for a missing chunk, then leaves repeated failures to the error boundary', () => {
    const entries = new Map<string, string>();
    const storage = {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => { entries.set(key, value); },
    };
    let reloads = 0;
    const first = failedImport('Onboarding-old.js');
    expect(recoverPreloadError(first, storage, () => { reloads += 1; })).toBe(true);
    expect(first.defaultPrevented).toBe(true);

    const repeated = failedImport('Onboarding-old.js');
    expect(recoverPreloadError(repeated, storage, () => { reloads += 1; })).toBe(false);
    expect(repeated.defaultPrevented).toBe(false);
    expect(reloads).toBe(1);
  });

  it('does not suppress an import error when browser storage is unavailable', () => {
    const event = failedImport('SavingsPage-old.js');
    const storage = {
      getItem: () => { throw new Error('storage unavailable'); },
      setItem: () => { throw new Error('storage unavailable'); },
    };
    expect(recoverPreloadError(event, storage, () => { throw new Error('unexpected reload'); })).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });
});
