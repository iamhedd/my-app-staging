export const categoryEmojiOptions = [
  { value: 'home', emoji: '🏠', label: 'خانه' },
  { value: 'food', emoji: '🍽️', label: 'خوراک' },
  { value: 'car', emoji: '🚕', label: 'حمل‌ونقل' },
  { value: 'receipt', emoji: '💡', label: 'قبوض' },
  { value: 'health', emoji: '💊', label: 'سلامت' },
  { value: 'fun', emoji: '🎮', label: 'تفریح' },
  { value: 'education', emoji: '📚', label: 'آموزش' },
  { value: 'shop', emoji: '🛍️', label: 'خرید' },
  { value: 'wallet', emoji: '💰', label: 'درآمد' },
  { value: 'other', emoji: '🧾', label: 'سایر' },
] as const;

export function categoryEmoji(icon: string, name = '') {
  const direct = categoryEmojiOptions.find(option => option.value === icon);
  if (direct) return direct.emoji;
  if (name.includes('مسکن') || name.includes('خانه')) return '🏠';
  if (name.includes('خوراک') || name.includes('غذا')) return '🍽️';
  if (name.includes('حمل')) return '🚕';
  if (name.includes('سلامت') || name.includes('درمان')) return '💊';
  if (name.includes('تفریح') || name.includes('سرگرمی')) return '🎮';
  return '🧾';
}
