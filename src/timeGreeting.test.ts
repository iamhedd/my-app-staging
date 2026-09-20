import { describe, expect, it } from 'vitest';
import { millisecondsUntilNextGreeting, timeGreeting } from './timeGreeting';

function at(hour: number, minute = 0) {
  return new Date(2026, 8, 17, hour, minute, 0, 0);
}

describe('timeGreeting', () => {
  it('uses five distinct Persian day periods', () => {
    expect(timeGreeting(at(0))).toBe('سلام');
    expect(timeGreeting(at(5))).toBe('صبح بخیر');
    expect(timeGreeting(at(11))).toBe('ظهر بخیر');
    expect(timeGreeting(at(14))).toBe('عصر بخیر');
    expect(timeGreeting(at(18))).toBe('شب بخیر');
  });

  it('schedules the next update exactly at the next boundary', () => {
    expect(millisecondsUntilNextGreeting(at(10, 30))).toBe(30 * 60 * 1000);
    expect(millisecondsUntilNextGreeting(at(23, 30))).toBe(30 * 60 * 1000);
  });
});
