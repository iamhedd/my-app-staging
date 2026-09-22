import { describe, expect, it } from 'vitest';
import { allocatedSavings, createSavingsPortfolio, unallocatedSavings, validateSavingsPortfolio } from './savings';

describe('savings portfolio', () => {
  it('treats goals as allocations, not extra assets', () => {
    const portfolio = {
      ...createSavingsPortfolio(20_000_000, '1405/07'),
      goals: [
        { id: 'travel', name: 'سفر', allocatedAmount: 5_000_000, targetAmount: 15_000_000, targetDate: null, completed: false },
        { id: 'laptop', name: 'لپ‌تاپ', allocatedAmount: 4_000_000, targetAmount: null, targetDate: null, completed: false },
      ],
    };
    expect(allocatedSavings(portfolio)).toBe(9_000_000);
    expect(unallocatedSavings(portfolio)).toBe(11_000_000);
    expect(portfolio.totalAmount).toBe(20_000_000);
    expect(validateSavingsPortfolio(portfolio)).toBeNull();
  });

  it('rejects allocations above the real savings balance', () => {
    const portfolio = {
      ...createSavingsPortfolio(10_000_000, '1405/07'),
      goals: [{ id: 'home', name: 'خانه', allocatedAmount: 11_000_000, targetAmount: null, targetDate: null, completed: false }],
    };
    expect(validateSavingsPortfolio(portfolio)).toContain('بیشتر');
  });
});
