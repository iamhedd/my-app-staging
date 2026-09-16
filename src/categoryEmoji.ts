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
  if (/\p{Extended_Pictographic}/u.test(icon)) return icon;
  if (name.includes('مسکن') || name.includes('خانه')) return '🏠';
  if (name.includes('خوراک') || name.includes('غذا')) return '🍽️';
  if (name.includes('حمل')) return '🚕';
  if (name.includes('سلامت') || name.includes('درمان')) return '💊';
  if (name.includes('تفریح') || name.includes('سرگرمی')) return '🎮';
  return '🧾';
}

const palettes = {
  home: ['🏠', '🏡', '🏢', '🛋️', '🔑', '🧰'],
  food: ['🍽️', '🍔', '🍕', '☕', '🛒', '🍎'],
  transport: ['🚕', '🚗', '🚌', '🚇', '⛽', '🚲'],
  bills: ['💡', '🧾', '📱', '💧', '🔥', '⚡'],
  health: ['💊', '🩺', '🏥', '🦷', '👓', '🧘'],
  fun: ['🎮', '🎬', '🎵', '🎟️', '⚽', '🎨'],
  education: ['📚', '🎓', '✏️', '💻', '🧠', '📝'],
  shopping: ['🛍️', '👕', '👟', '🎁', '💄', '🧴'],
  other: ['🧾', '📦', '🪙', '🧩', '📌', '✨'],
} as const;

export function categoryEmojiPalette(name: string) {
  if (name.includes('مسکن') || name.includes('خانه')) return palettes.home;
  if (name.includes('خوراک') || name.includes('غذا')) return palettes.food;
  if (name.includes('حمل') || name.includes('رفت')) return palettes.transport;
  if (name.includes('قبض') || name.includes('قبوض')) return palettes.bills;
  if (name.includes('سلامت') || name.includes('درمان')) return palettes.health;
  if (name.includes('تفریح') || name.includes('سرگرمی')) return palettes.fun;
  if (name.includes('آموزش') || name.includes('تحصیل')) return palettes.education;
  if (name.includes('خرید') || name.includes('شخصی')) return palettes.shopping;
  return palettes.other;
}
