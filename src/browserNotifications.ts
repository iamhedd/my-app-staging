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
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.showNotification(payload.title, options);
      return true;
    }
  }

  new Notification(payload.title, options);
  return true;
}
