import { getApp, getApps, initializeApp } from 'firebase/app';
import { getMessaging, getToken, isSupported, onMessage, type MessagePayload } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId &&
  firebaseConfig.messagingSenderId && firebaseConfig.appId && vapidKey,
);

function getFirebaseApp() {
  if (!isFirebaseConfigured) {
    throw new Error('اطلاعات Firebase و VAPID Key هنوز در فایل .env تنظیم نشده‌اند.');
  }
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

function serviceWorkerUrl() {
  const params = new URLSearchParams();
  Object.entries(firebaseConfig).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return `/firebase-messaging-sw.js?${params.toString()}`;
}

export async function enablePushNotifications() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    throw new Error('این مرورگر از اعلان‌های وب پشتیبانی نمی‌کند.');
  }
  if (!(await isSupported())) {
    throw new Error('Firebase Messaging در این مرورگر قابل استفاده نیست.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('اجازه‌ی نمایش اعلان داده نشد. می‌توانی آن را از تنظیمات مرورگر فعال کنی.');
  }

  const registration = await navigator.serviceWorker.register(serviceWorkerUrl());
  const messaging = getMessaging(getFirebaseApp());
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });

  if (!token) throw new Error('توکن اعلان دریافت نشد. دوباره تلاش کن.');
  localStorage.setItem('gav-fcm-token', token);
  return token;
}

export async function listenForForegroundNotifications(
  callback: (payload: MessagePayload) => void,
) {
  if (!isFirebaseConfigured || !(await isSupported())) return () => undefined;
  return onMessage(getMessaging(getFirebaseApp()), callback);
}

export function notificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}
