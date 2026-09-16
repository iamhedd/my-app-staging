import { describe, expect, it } from 'vitest';
import { categoryEmoji, categoryEmojiPalette } from './categoryEmoji';

describe('category emoji picker', () => {
  it('keeps a directly selected emoji as the category icon', () => {
    expect(categoryEmoji('🍕', 'خوراک')).toBe('🍕');
  });

  it('offers a six-item palette related to the category', () => {
    expect(categoryEmojiPalette('حمل‌ونقل')).toHaveLength(6);
    expect(categoryEmojiPalette('حمل‌ونقل')).toContain('🚕');
  });
});
