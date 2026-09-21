import { describe, expect, it } from 'vitest';
import { categoryEmoji, categoryEmojiPalette, categoryImageOptions, isCategoryImage } from './categoryEmoji';

describe('category emoji picker', () => {
  it('keeps a directly selected emoji as the category icon', () => {
    expect(categoryEmoji('🍕', 'خوراک')).toBe('🍕');
  });

  it('offers contextual emoji plus every custom image', () => {
    expect(categoryEmojiPalette('حمل‌ونقل')).toHaveLength(6 + categoryImageOptions.length);
    expect(categoryEmojiPalette('حمل‌ونقل')).toContain('🚕');
    expect(categoryEmojiPalette('حمل‌ونقل')).toContain('/category-icons/taxi.jpg');
  });

  it('keeps a selected custom image as the category icon', () => {
    expect(categoryEmoji('/category-icons/cafe.jpg', 'کافه')).toBe('/category-icons/cafe.jpg');
    expect(isCategoryImage('/category-icons/cafe.jpg')).toBe(true);
  });
});
