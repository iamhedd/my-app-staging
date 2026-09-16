import { describe, expect, it } from 'vitest';
import { defaultDevSettings, normalizeDevSettings } from './devSettings';

describe('normalizeDevSettings', () => {
  it('fills missing fields in settings saved by older versions', () => {
    expect(normalizeDevSettings({})).toEqual(defaultDevSettings);
    expect(normalizeDevSettings({ appName: 'نسخه شخصی' })).toEqual({
      ...defaultDevSettings,
      appName: 'نسخه شخصی',
    });
  });
});
