import assert from 'node:assert/strict';
import test from 'node:test';
import {
  budgetsInputSchema,
  categoriesInputSchema,
  migrationRunInputSchema,
  moneySchema,
  reviewCommentInputSchema,
  transactionInputSchema,
} from './schemas.js';

test('money values are normalized to decimal strings', () => {
  assert.equal(moneySchema.parse(12_345), '12345');
  assert.equal(moneySchema.parse('0012345'), '12345');
  assert.throws(() => moneySchema.parse('12.5'));
  assert.throws(() => moneySchema.parse('9007199254740992'));
});

test('categories reject duplicate client ids and names', () => {
  const duplicate = categoriesInputSchema.safeParse({
    categories: [
      { id: 'food', name: 'خوراک', percentageBps: 1000, amount: '1000', allocationMode: 'amount', color: '#DF7899', icon: 'food' },
      { id: 'food', name: 'خوراک', percentageBps: 2000, amount: '2000', allocationMode: 'percentage', color: '#707070', icon: 'food' },
    ],
  });
  assert.equal(duplicate.success, false);
});

test('transaction accepts only ISO dates and positive integer money', () => {
  assert.equal(transactionInputSchema.safeParse({
    title: 'خرید',
    category: 'خوراک',
    amount: '100000',
    type: 'expense',
    date: '2026-09-16',
  }).success, true);
  assert.equal(transactionInputSchema.safeParse({
    title: 'خرید',
    category: 'خوراک',
    amount: '0',
    type: 'expense',
    date: '۱۴۰۵/۰۶/۲۵',
  }).success, false);
});

test('budgets reject duplicate compound keys', () => {
  const result = budgetsInputSchema.safeParse({
    budgets: [
      { category: 'مسکن', periodType: 'monthly', periodKey: '1405-06', limitAmount: '1' },
      { category: 'مسکن', periodType: 'monthly', periodKey: '1405-06', limitAmount: '2' },
    ],
  });
  assert.equal(result.success, false);
});

test('review comments use bounded priority and status values', () => {
  assert.equal(reviewCommentInputSchema.safeParse({
    pageKey: 'dashboard',
    componentKey: '',
    commentText: 'فاصله کارت اصلاح شود',
    priority: 'high',
    status: 'open',
  }).success, true);
  assert.equal(reviewCommentInputSchema.safeParse({
    pageKey: 'dashboard',
    commentText: 'test',
    priority: 'urgent',
    status: 'open',
  }).success, false);
});

test('migration errors are accepted only for failed runs', () => {
  assert.equal(migrationRunInputSchema.safeParse({
    status: 'failed',
    migratedCounts: { transactions: 2 },
    errorMessage: 'network error',
  }).success, true);
  assert.equal(migrationRunInputSchema.safeParse({
    status: 'completed',
    errorMessage: 'stale error',
  }).success, false);
});
