import { describe, expect, it } from 'vitest';
import { dashboardGreetingText, defaultDevSettings, normalizeDevSettings } from './devSettings';

describe('normalizeDevSettings', () => {
  it('fills missing fields in settings saved by older versions', () => {
    expect(normalizeDevSettings({})).toEqual(defaultDevSettings);
    expect(normalizeDevSettings({ appName: 'نسخه شخصی' })).toEqual({
      ...defaultDevSettings,
      appName: 'نسخه شخصی',
    });
  });
});

describe('dashboardGreetingText', () => {
  it('always greets the resolved user name even with an old literal template', () => {
    expect(dashboardGreetingText('سلام {name}، خوش آمدی!', 'هدیه')).toBe('هدیه، خوش آمدی!');
    expect(dashboardGreetingText('سلام کاربر گاو، خوش آمدی!', 'هدیه')).toBe('هدیه، خوش آمدی!');
  });
});
