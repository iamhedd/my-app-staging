const persianNumber = new Intl.NumberFormat('fa-IR');
const compactNumber = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 });
const tomanNumber = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });

/** All application money values are stored as integer rials. */
export function formatRial(value: number) {
  return `${persianNumber.format(value)} ریال`;
}

export function formatCompactRial(value: number) {
  const amount = Number.isFinite(value) ? Math.max(0, value) : 0;
  const units = [
    { threshold: 1_000_000_000, label: 'میلیارد' },
    { threshold: 1_000_000, label: 'میلیون' },
    { threshold: 1_000, label: 'هزار' },
  ];
  const unit = units.find(item => amount >= item.threshold);
  return unit ? `${compactNumber.format(amount / unit.threshold)} ${unit.label} ریال` : formatRial(amount);
}

/** Input help is deliberately in toman; one rial is exactly 0.1 toman. */
export function formatTomanEquivalent(rials: number | null | undefined) {
  if (rials === null || rials === undefined || !Number.isSafeInteger(rials) || rials < 0) return 'مبلغ را به ریال وارد کن.';
  const tomans = rials / 10;
  const units = [
    { threshold: 1_000_000_000, label: 'میلیارد' },
    { threshold: 1_000_000, label: 'میلیون' },
    { threshold: 1_000, label: 'هزار' },
  ];
  const unit = units.find(item => tomans >= item.threshold && rials % (item.threshold / 10) === 0);
  return `معادل ${unit ? `${compactNumber.format(tomans / unit.threshold)} ${unit.label}` : tomanNumber.format(tomans)} تومان`;
}
