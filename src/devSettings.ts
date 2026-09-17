export type DevSettings = {
  appName: string;
  appTagline: string;
  authKicker: string;
  authTitle: string;
  authHighlight: string;
  authDescription: string;
  authQuote: string;
  dashboardGreeting: string;
  dashboardDescription: string;
  addTransactionLabel: string;
  accentColor: string;
  showAuthShowcase: boolean;
  showIntroOnboarding: boolean;
};

export const defaultDevSettings: DevSettings = {
  appName: 'گاو',
  appTagline: 'مالی ساده‌تر',
  authKicker: 'یک دید تازه به پولت',
  authTitle: 'پول‌هات را',
  authHighlight: 'بهتر بشناس.',
  authDescription: 'هزینه‌ها را ثبت کن، برای هدفت بودجه بساز و با خیال راحت‌تر برای آینده تصمیم بگیر.',
  authQuote: '«کنترل مالی از دیدن واضح شروع می‌شود.»',
  dashboardGreeting: 'سلام {name}، خوش آمدی!',
  dashboardDescription: 'این‌جا تصویر روشنی از وضعیت مالی {month} داری.',
  addTransactionLabel: 'تراکنش جدید',
  accentColor: '#DF7899',
  showAuthShowcase: true,
  showIntroOnboarding: true,
};

export const devSettingsStorageKey = 'gav-dev-settings-v1';

export function normalizeDevSettings(value: Partial<DevSettings> | null | undefined): DevSettings {
  return { ...defaultDevSettings, ...(value || {}) };
}

export function interpolateDevText(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template);
}

export function dashboardGreetingText(template: string, name: string) {
  const displayName = name.trim() || 'کاربر گاو';
  return template.includes('{name}')
    ? interpolateDevText(template, { name: displayName })
    : interpolateDevText(defaultDevSettings.dashboardGreeting, { name: displayName });
}
