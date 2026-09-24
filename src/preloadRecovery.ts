const preloadRetryKey = 'gav-preload-retry-v1';

type RetryStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function recoverPreloadError(event: Event, storage: RetryStorage, reload: () => void) {
  const failure = (event as Event & { payload?: unknown }).payload;
  const signature = failure instanceof Error ? failure.message : String(failure);
  try {
    if (storage.getItem(preloadRetryKey) === signature) return false;
    storage.setItem(preloadRetryKey, signature);
  } catch {
    return false;
  }
  event.preventDefault();
  reload();
  return true;
}
