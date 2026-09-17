import { isValidJalaaliDate, jalaaliMonthLength, toGregorian, toJalaali } from 'jalaali-js';

export const jalaliMonthNames = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const persianDigits = '۰۱۲۳۴۵۶۷۸۹';

export type JalaliMonth = { year: number; month: number; key: string; label: string; length: number };
export type JalaliMonthWeek = {
  index: number;
  key: string;
  startDay: number;
  endDay: number;
  days: number;
  label: string;
  isCurrent: boolean;
};

export function toEnglishDigits(value: string) {
  return value.replace(/[۰-۹]/g, digit => String(persianDigits.indexOf(digit))).replace(/[٬,]/g, '');
}

export function toPersianDigits(value: string | number) {
  return String(value).replace(/\d/g, digit => persianDigits[Number(digit)]);
}

export function parseJalaliDate(value: string) {
  const parts = toEnglishDigits(value).split('/').map(Number);
  if (parts.length !== 3 || !isValidJalaaliDate(parts[0], parts[1], parts[2])) return null;
  return { year: parts[0], month: parts[1], day: parts[2] };
}

export function jalaliDateKey(year: number, month: number, day: number) {
  return `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
}

export function todayJalali(now = new Date()) {
  const value = toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return { year: value.jy, month: value.jm, day: value.jd, key: jalaliDateKey(value.jy, value.jm, value.jd) };
}

export function displayJalaliDate(value: string) {
  const parsed = parseJalaliDate(value);
  return parsed ? toPersianDigits(jalaliDateKey(parsed.year, parsed.month, parsed.day)) : value;
}

export function jalaliToDate(value: string) {
  const parsed = parseJalaliDate(value);
  if (!parsed) return null;
  const gregorian = toGregorian(parsed.year, parsed.month, parsed.day);
  return new Date(gregorian.gy, gregorian.gm - 1, gregorian.gd);
}

export function jalaliToIsoDate(value: string) {
  const parsed = parseJalaliDate(value);
  if (!parsed) return null;
  const gregorian = toGregorian(parsed.year, parsed.month, parsed.day);
  return `${gregorian.gy}-${String(gregorian.gm).padStart(2, '0')}-${String(gregorian.gd).padStart(2, '0')}`;
}

export function isoDateToJalali(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  const jalali = toJalaali(year, month, day);
  return jalaliDateKey(jalali.jy, jalali.jm, jalali.jd);
}

export function shiftJalaliMonth(year: number, month: number, offset: number): JalaliMonth {
  const index = year * 12 + month - 1 + offset;
  const nextYear = Math.floor(index / 12);
  const nextMonth = ((index % 12) + 12) % 12 + 1;
  return {
    year: nextYear,
    month: nextMonth,
    key: `${nextYear}/${String(nextMonth).padStart(2, '0')}`,
    label: `${jalaliMonthNames[nextMonth - 1]} ${toPersianDigits(nextYear)}`,
    length: jalaaliMonthLength(nextYear, nextMonth),
  };
}

export function monthFromOffset(offset = 0, now = new Date()) {
  const today = todayJalali(now);
  return shiftJalaliMonth(today.year, today.month, offset);
}

export function recentJalaliMonths(selected: JalaliMonth, count = 6) {
  return Array.from({ length: count }, (_, index) => shiftJalaliMonth(selected.year, selected.month, index - count + 1));
}

export function weeksOfJalaliMonth(month: JalaliMonth, now = new Date()): JalaliMonthWeek[] {
  const firstDate = jalaliToDate(jalaliDateKey(month.year, month.month, 1));
  if (!firstDate) return [];
  const today = todayJalali(now);
  const weeks: JalaliMonthWeek[] = [];
  let startDay = 1;
  let daysUntilFriday = 7 - ((firstDate.getDay() + 1) % 7);

  while (startDay <= month.length) {
    const days = Math.min(daysUntilFriday, month.length - startDay + 1);
    const endDay = startDay + days - 1;
    const segmentDate = jalaliToDate(jalaliDateKey(month.year, month.month, startDay))!;
    const saturday = new Date(segmentDate);
    saturday.setDate(segmentDate.getDate() - ((segmentDate.getDay() + 1) % 7));
    const key = `${saturday.getFullYear()}-${String(saturday.getMonth() + 1).padStart(2, '0')}-${String(saturday.getDate()).padStart(2, '0')}`;
    weeks.push({
      index: weeks.length,
      key,
      startDay,
      endDay,
      days,
      label: `${toPersianDigits(startDay)} تا ${toPersianDigits(endDay)} ${jalaliMonthNames[month.month - 1]}`,
      isCurrent: today.year === month.year && today.month === month.month && today.day >= startDay && today.day <= endDay,
    });
    startDay = endDay + 1;
    daysUntilFriday = 7;
  }
  return weeks;
}

export function allocateMonthlyAmountByWeek(amount: number, weeks: JalaliMonthWeek[]) {
  const safeAmount = Math.max(0, Math.round(amount));
  const totalDays = weeks.reduce((sum, week) => sum + week.days, 0);
  let cumulativeDays = 0;
  let allocated = 0;
  return weeks.map((week, index) => {
    cumulativeDays += week.days;
    const cumulativeAmount = index === weeks.length - 1 ? safeAmount : Math.round(safeAmount * cumulativeDays / Math.max(totalDays, 1));
    const weeklyAmount = cumulativeAmount - allocated;
    allocated = cumulativeAmount;
    return weeklyAmount;
  });
}

export function isInJalaliMonth(date: string, month: JalaliMonth) {
  const parsed = parseJalaliDate(date);
  return Boolean(parsed && parsed.year === month.year && parsed.month === month.month);
}

export function elapsedDaysInMonth(month: JalaliMonth, now = new Date()) {
  const today = todayJalali(now);
  if (month.year === today.year && month.month === today.month) return today.day;
  if (month.year < today.year || (month.year === today.year && month.month < today.month)) return month.length;
  return 0;
}

export function clampDay(year: number, month: number, day: number) {
  return Math.min(day, jalaaliMonthLength(year, month));
}
