export type BrowserNotificationPayload = {
  title: string;
  body: string;
  tag: string;
  url?: string;
};

export async function showBrowserNotification(payload: BrowserNotificationPayload) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const options: NotificationOptions = {
    body: payload.body,
    icon: '/gav-logo.png',
    badge: '/notification-icon.svg',
    tag: payload.tag,
    data: { url: payload.url || '/' },
    dir: 'rtl',
    lang: 'fa',
  };

  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration()
        || await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      await registration.showNotification(payload.title, options);
      return true;
    } catch { /* Fall back to the desktop Notification API below. */ }
  }

  try {
    new Notification(payload.title, options);
    return true;
  } catch { return false; }
}
