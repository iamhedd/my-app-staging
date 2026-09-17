/* global firebase */

const params = new URL(self.location.href).searchParams;
const firebaseConfig = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
};

const firebaseEnabled = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId &&
  firebaseConfig.messagingSenderId && firebaseConfig.appId,
);

if (firebaseEnabled) {
  importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || payload.data?.title || 'گاو';
    const options = {
      body: payload.notification?.body || payload.data?.body || 'یک اعلان جدید داری.',
      icon: '/gav-logo.png',
      badge: '/notification-icon.svg',
      data: { url: payload.data?.url || '/' },
      dir: 'rtl',
      lang: 'fa',
    };
    self.registration.showNotification(title, options);
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) return client.focus();
      }
      return clients.openWindow(destination);
    }),
  );
});
