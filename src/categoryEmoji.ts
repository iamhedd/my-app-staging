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

export const categoryImageOptions = [
  { value: '/category-icons/entertainment.jpg', label: 'سرگرمی و تئاتر' },
  { value: '/category-icons/roast-chicken.jpg', label: 'غذا و رستوران' },
  { value: '/category-icons/baby.jpg', label: 'کودک' },
  { value: '/category-icons/fuel.jpg', label: 'سوخت' },
  { value: '/category-icons/massage.jpg', label: 'ماساژ و مراقبت' },
  { value: '/category-icons/pharmacy.jpg', label: 'داروخانه' },
  { value: '/category-icons/car-repair.jpg', label: 'تعمیر خودرو' },
  { value: '/category-icons/cafe.jpg', label: 'کافه' },
  { value: '/category-icons/groceries.jpg', label: 'خرید مواد غذایی' },
  { value: '/category-icons/taxi.jpg', label: 'تاکسی' },
] as const;

export function isCategoryImage(value: string) {
  return categoryImageOptions.some(option => option.value === value);
}

export function categoryIconLabel(value: string) {
  return categoryImageOptions.find(option => option.value === value)?.label || value;
}

export function categoryEmoji(icon: string, name = '') {
  if (isCategoryImage(icon)) return icon;
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
  let contextual: readonly string[] = palettes.other;
  if (name.includes('مسکن') || name.includes('خانه')) contextual = palettes.home;
  else if (name.includes('خوراک') || name.includes('غذا')) contextual = palettes.food;
  else if (name.includes('حمل') || name.includes('رفت')) contextual = palettes.transport;
  else if (name.includes('قبض') || name.includes('قبوض')) contextual = palettes.bills;
  else if (name.includes('سلامت') || name.includes('درمان')) contextual = palettes.health;
  else if (name.includes('تفریح') || name.includes('سرگرمی')) contextual = palettes.fun;
  else if (name.includes('آموزش') || name.includes('تحصیل')) contextual = palettes.education;
  else if (name.includes('خرید') || name.includes('شخصی')) contextual = palettes.shopping;
  return [...contextual, ...categoryImageOptions.map(option => option.value)];
}
