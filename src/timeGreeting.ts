export type TimeGreeting = 'بامداد بخیر' | 'صبح بخیر' | 'ظهر بخیر' | 'عصر بخیر' | 'شب بخیر';

const boundaries = [5, 11, 14, 18, 24];

export function timeGreeting(date = new Date()): TimeGreeting {
  const hour = date.getHours();
  if (hour < 5) return 'بامداد بخیر';
  if (hour < 11) return 'صبح بخیر';
  if (hour < 14) return 'ظهر بخیر';
  if (hour < 18) return 'عصر بخیر';
  return 'شب بخیر';
}

export function millisecondsUntilNextGreeting(date = new Date()) {
  const nextHour = boundaries.find(hour => hour > date.getHours()) ?? 24;
  const next = new Date(date);
  if (nextHour === 24) {
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
  } else {
    next.setHours(nextHour, 0, 0, 0);
  }
  return Math.max(1, next.getTime() - date.getTime());
}
