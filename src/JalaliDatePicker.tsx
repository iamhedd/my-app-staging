import { useEffect, useState } from 'react';
import { Button, Popover } from 'antd';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { jalaaliMonthLength } from 'jalaali-js';
import { displayJalaliDate, jalaliDateKey, jalaliMonthNames, jalaliToDate, parseJalaliDate, todayJalali, toPersianDigits } from './dateUtils';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

const weekdays = [
  { short: 'ش', label: 'شنبه' }, { short: 'ی', label: 'یکشنبه' }, { short: 'د', label: 'دوشنبه' },
  { short: 'س', label: 'سه‌شنبه' }, { short: 'چ', label: 'چهارشنبه' }, { short: 'پ', label: 'پنجشنبه' },
  { short: 'ج', label: 'جمعه' },
];

export default function JalaliDatePicker({ value, onChange, placeholder = 'انتخاب تاریخ' }: Props) {
  const initial = parseJalaliDate(value) || todayJalali();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ year: initial.year, month: initial.month });
  const selected = parseJalaliDate(value);
  const today = todayJalali();
  const monthLength = jalaaliMonthLength(view.year, view.month);
  const firstDay = jalaliToDate(jalaliDateKey(view.year, view.month, 1));
  const startOffset = firstDay ? (firstDay.getDay() + 1) % 7 : 0;

  useEffect(() => {
    const next = parseJalaliDate(value);
    if (next) setView({ year: next.year, month: next.month });
  }, [value]);

  const changeMonth = (offset: number) => {
    const index = view.year * 12 + view.month - 1 + offset;
    setView({ year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 + 1 });
  };

  const selectDay = (day: number) => {
    onChange(jalaliDateKey(view.year, view.month, day));
    setOpen(false);
  };

  const calendar = <div className="goal-date-calendar-popover" dir="rtl">
    <div className="goal-date-calendar-header">
      <Button type="text" aria-label="ماه قبل" icon={<ChevronRight size={17}/>} onClick={() => changeMonth(-1)}/>
      <strong>{jalaliMonthNames[view.month - 1]} {toPersianDigits(view.year)}</strong>
      <Button type="text" aria-label="ماه بعد" icon={<ChevronLeft size={17}/>} onClick={() => changeMonth(1)}/>
    </div>
    <div className="goal-date-calendar-grid" role="grid" aria-label={`تقویم ${jalaliMonthNames[view.month - 1]} ${toPersianDigits(view.year)}`}>
      {weekdays.map(weekday => <span className="goal-date-weekday" role="columnheader" aria-label={weekday.label} key={weekday.label}>{weekday.short}</span>)}
      {Array.from({ length: startOffset }, (_, index) => <i aria-hidden="true" key={`empty-${index}`}/>)}
      {Array.from({ length: monthLength }, (_, index) => {
        const day = index + 1;
        const active = selected?.year === view.year && selected.month === view.month && selected.day === day;
        const isToday = today.year === view.year && today.month === view.month && today.day === day;
        return <button type="button" role="gridcell" aria-selected={active} className={`${active ? 'selected' : ''} ${isToday ? 'today' : ''}`} key={day} onClick={() => selectDay(day)}>{toPersianDigits(day)}</button>;
      })}
    </div>
    <div className="goal-date-calendar-footer">
      <Button type="text" size="small" onClick={() => { onChange(today.key); setView({ year: today.year, month: today.month }); setOpen(false); }}>امروز</Button>
      {value && <Button type="text" danger size="small" onClick={() => { onChange(''); setOpen(false); }}>حذف تاریخ</Button>}
    </div>
  </div>;

  return <Popover open={open} onOpenChange={setOpen} trigger="click" placement="bottomRight" content={calendar} overlayClassName="goal-date-picker-popover">
    <button type="button" className={`goal-date-picker-trigger ${value ? 'has-value' : ''}`} aria-label="انتخاب تاریخ هدف" aria-expanded={open}>
      <CalendarDays size={18}/><span>{value ? displayJalaliDate(value) : placeholder}</span><ChevronDown size={15}/>
    </button>
  </Popover>;
}
