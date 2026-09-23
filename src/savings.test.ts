import { describe, expect, it } from 'vitest';
import { allocatedSavings, createSavingsPortfolio, onboardingSavingsBalance, recentGoalProgress, unallocatedSavings, validateSavingsPortfolio, withGoalProgressSnapshot } from './savings';

describe('savings portfolio', () => {
  it('treats goals as allocations, not extra assets', () => {
    const portfolio = {
      ...createSavingsPortfolio(20_000_000, '1405/07'),
      goals: [
        { id: 'travel', name: 'سفر', allocatedAmount: 5_000_000, targetAmount: 15_000_000, targetDate: null, completed: false, progressHistory: [] },
        { id: 'laptop', name: 'لپ‌تاپ', allocatedAmount: 4_000_000, targetAmount: null, targetDate: null, completed: false, progressHistory: [] },
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
      goals: [{ id: 'home', name: 'خانه', allocatedAmount: 11_000_000, targetAmount: null, targetDate: null, completed: false, progressHistory: [] }],
    };
    expect(validateSavingsPortfolio(portfolio)).toContain('بیشتر');
  });

  it('never lowers an existing balance when onboarding receives a monthly amount', () => {
    expect(onboardingSavingsBalance(20_000_000, 5_000_000)).toBe(20_000_000);
    expect(onboardingSavingsBalance(0, 10_000_000)).toBe(10_000_000);
  });

  it('upserts one cumulative progress snapshot per Jalali month without changing total savings', () => {
    const portfolio = {
      ...createSavingsPortfolio(20_000_000, '1405/07'),
      goals: [{
        id: 'travel', name: 'سفر', allocatedAmount: 5_000_000, targetAmount: 15_000_000,
        targetDate: null, completed: false, progressHistory: [{ monthKey: '1405/06', amount: 3_000_000 }],
      }],
    };
    const first = withGoalProgressSnapshot(portfolio, '1405/07');
    const updated = withGoalProgressSnapshot({
      ...first,
      goals: first.goals.map(goal => ({ ...goal, allocatedAmount: 6_000_000 })),
    }, '1405/07');

    expect(updated.totalAmount).toBe(20_000_000);
    expect(updated.goals[0].progressHistory).toEqual([
      { monthKey: '1405/06', amount: 3_000_000 },
      { monthKey: '1405/07', amount: 6_000_000 },
    ]);
    expect(validateSavingsPortfolio(updated)).toBeNull();
  });

  it('shows a current-month fallback for goals created before progress history existed', () => {
    const goal = {
      id: 'home', name: 'خانه', allocatedAmount: 8_000_000, targetAmount: 40_000_000,
      targetDate: null, completed: false, progressHistory: [],
    };
    expect(recentGoalProgress(goal, '1405/07')).toEqual([{ monthKey: '1405/07', amount: 8_000_000 }]);
  });
});
