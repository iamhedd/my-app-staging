import { describe, expect, it } from 'vitest';
import { formatCompactRial, formatRial, formatTomanEquivalent } from './currency';

describe('rial amounts', () => {
  it('displays primary amounts only in rial', () => {
    expect(formatRial(2_000_000)).toBe('۲٬۰۰۰٬۰۰۰ ریال');
    expect(formatCompactRial(2_000_000)).toBe('۲ میلیون ریال');
  });

  it('shows an exact toman equivalent for any entered integer rial', () => {
    expect(formatTomanEquivalent(2_000_000)).toBe('معادل ۲۰۰ هزار تومان');
    expect(formatTomanEquivalent(1)).toBe('معادل ۰٫۱ تومان');
    expect(formatTomanEquivalent(1_000_001)).toBe('معادل ۱۰۰٬۰۰۰٫۱ تومان');
    expect(formatTomanEquivalent(null)).toBe('مبلغ را به ریال وارد کن.');
  });
});
