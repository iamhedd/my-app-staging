import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Bell, Check, ChevronDown, CircleDollarSign, Clock3, Plus, Smile, Trash2, WalletCards } from 'lucide-react';
import { Alert, Button, Card, Input, InputNumber, Popover, Progress, Segmented, Switch } from 'antd';
import {
  addCategory, calculateCategoryAmounts, calculateSavingsAmount, calculateSpendableAmount, colorPalette, createCompletedSetup,
  createDefaultCategories, parseNonNegativeInteger, parsePositiveInteger, percentageToBps, removeCategory,
  validateFinancialSetup,
  type ExpenseReminder, type FinancialSetup, type SetupCategory,
} from './financialSetup';
import { categoryEmoji, categoryEmojiPalette, categoryIconLabel } from './categoryEmoji';
import CategoryIconVisual from './CategoryIconVisual';
import { monthFromOffset, parseJalaliDate } from './dateUtils';
import { createSavingsPortfolio, onboardingSavingsBalance, type SavingsGoal, type SavingsPortfolio } from './savings';

type Props = {
  initialSetup: FinancialSetup | null;
  initialSavingsPortfolio: SavingsPortfolio | null;
  onComplete: (setup: FinancialSetup, savingsPortfolio: SavingsPortfolio) => void | Promise<void>;
  onCancel?: () => void;
};

const money = (value: number) => `${new Intl.NumberFormat('fa-IR').format(value)} تومان`;

const savingsGoalPresets = ['صندوق اضطراری', 'سفر', 'خرید ماشین', 'خرید خانه', 'سرمایه‌گذاری', 'خرید لپ‌تاپ', 'سایر'];

export default function Onboarding({ initialSetup, initialSavingsPortfolio, onComplete, onCancel }: Props) {
  const [step, setStep] = useState(1);
  const [monthlyIncome, setMonthlyIncome] = useState(initialSetup?.monthlyIncome ?? 0);
  const [incomeInput, setIncomeInput] = useState(initialSetup?.monthlyIncome ? String(initialSetup.monthlyIncome) : '');
  const [savingsPercentBps, setSavingsPercentBps] = useState(initialSetup?.savingsPercentBps ?? 0);
  const [savingsAmountInput, setSavingsAmountInput] = useState(initialSetup ? String(calculateSavingsAmount(initialSetup.monthlyIncome, initialSetup.savingsPercentBps, initialSetup.savingsTargetAmount)) : '');
  const [categories, setCategories] = useState<SetupCategory[]>(initialSetup?.categories ?? createDefaultCategories());
  const [allocationInputs, setAllocationInputs] = useState<Record<string, string>>(() => Object.fromEntries((initialSetup?.categories ?? createDefaultCategories()).map(category => [category.id, category.allocationMode === 'amount' ? String(category.amount) : String(category.percentageBps / 100)])));
  const [newCategory, setNewCategory] = useState('');
  const [savingsGoalChoice, setSavingsGoalChoice] = useState<'yes' | 'no' | null>(() => initialSavingsPortfolio ? (initialSavingsPortfolio.goals.length ? 'yes' : 'no') : null);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>(initialSavingsPortfolio?.goals ?? []);
  const [newSavingsGoal, setNewSavingsGoal] = useState('');
  const [openEmojiPicker, setOpenEmojiPicker] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => 'Notification' in window ? Notification.permission : 'unsupported');
  const [reminder, setReminder] = useState<ExpenseReminder>(initialSetup?.reminder ?? {
    enabled: false,
    time: '21:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tehran',
  });
  const [savingsEnabled, setSavingsEnabled] = useState(savingsPercentBps > 0);

  const enteredSavingsAmount = parseNonNegativeInteger(savingsAmountInput);
  const savingsAmount = savingsEnabled && enteredSavingsAmount !== null ? enteredSavingsAmount : 0;
  const spendableAmount = calculateSpendableAmount(monthlyIncome, savingsPercentBps, savingsAmount);
  const calculatedCategories = useMemo(() => calculateCategoryAmounts(spendableAmount, categories), [spendableAmount, categories]);
  const allocatedAmount = calculatedCategories.reduce((sum, category) => sum + category.amount, 0);
  const totalBps = spendableAmount > 0 ? Math.round(allocatedAmount / spendableAmount * 10000) : 0;
  const totalPercent = totalBps / 100;
  const remainingAmount = spendableAmount - allocatedAmount;
  const savingsAllocationTotal = savingsGoals.reduce((sum, goal) => sum + goal.allocatedAmount, 0);
  const onboardingSavingsTotal = onboardingSavingsBalance(initialSavingsPortfolio?.totalAmount ?? 0, savingsAmount);
  const unallocatedSavingsAmount = Math.max(0, onboardingSavingsTotal - savingsAllocationTotal);

  const changeIncome = (value: string) => {
    setIncomeInput(value);
    const parsed = parsePositiveInteger(value);
    setMonthlyIncome(parsed ?? 0);
    const saving = parseNonNegativeInteger(savingsAmountInput);
    if (parsed && saving !== null && saving <= parsed) setSavingsPercentBps(Math.round(saving / parsed * 10000));
    if (parsed) setError('');
  };

  const changeSavingsAmount = (value: string) => {
    setSavingsAmountInput(value);
    const parsed = parseNonNegativeInteger(value);
    if (parsed !== null && monthlyIncome > 0 && parsed <= monthlyIncome) setSavingsPercentBps(Math.round(parsed / monthlyIncome * 10000));
    setError('');
  };

  const lastSavingsAmountRef = useRef(savingsAmount || Math.round(monthlyIncome * 0.1));
  const toggleSavings = (enabled: boolean) => {
    setSavingsEnabled(enabled);
    if (enabled) {
      const restored = lastSavingsAmountRef.current || Math.round(monthlyIncome * 0.1);
      setSavingsAmountInput(String(restored));
      setSavingsPercentBps(monthlyIncome > 0 ? Math.round(restored / monthlyIncome * 10000) : 0);
    } else {
      if (savingsAmount > 0) lastSavingsAmountRef.current = savingsAmount;
      setSavingsPercentBps(0);
      setSavingsAmountInput('0');
    }
    setError('');
  };

  const updateCategory = (id: string, patch: Partial<SetupCategory>) => {
    setCategories(items => items.map(item => item.id === id ? { ...item, ...patch } : item));
    setError('');
  };

  const changePercentage = (id: string, value: string) => {
    setAllocationInputs(inputs => ({ ...inputs, [id]: value }));
    const bps = percentageToBps(value);
    if (bps !== null) updateCategory(id, { percentageBps: bps, allocationMode: 'percentage' });
  };

  const changeAmount = (id: string, value: string) => {
    setAllocationInputs(inputs => ({ ...inputs, [id]: value }));
    const amount = parseNonNegativeInteger(value);
    if (amount !== null) updateCategory(id, { amount, allocationMode: 'amount' });
  };

  const changeAllocationMode = (category: SetupCategory, mode: 'percentage' | 'amount') => {
    const calculated = calculatedCategories.find(item => item.id === category.id) || category;
    updateCategory(category.id, { allocationMode: mode, amount: calculated.amount, percentageBps: calculated.percentageBps });
    setAllocationInputs(inputs => ({ ...inputs, [category.id]: mode === 'amount' ? String(calculated.amount) : String(calculated.percentageBps / 100) }));
  };

  const addNewCategory = () => {
    if (newCategory.trim() === 'پس‌انداز') return setError('پس‌انداز به‌صورت جداگانه در مرحله اول تنظیم می‌شود.');
    const next = addCategory(categories, newCategory);
    if (next === categories) return setError('نام دسته خالی یا تکراری است.');
    const added = next[next.length - 1];
    setCategories(next);
    setAllocationInputs(inputs => ({ ...inputs, [added.id]: '0' }));
    setNewCategory('');
    setError('');
  };

  const deleteCategory = (id: string) => {
    if (categories.length === 1) return setError('حداقل یک دسته باید باقی بماند.');
    setCategories(items => removeCategory(items, id));
    setAllocationInputs(inputs => {
      const next = { ...inputs };
      delete next[id];
      return next;
    });
  };

  const addSavingsGoal = (name: string) => {
    const cleanName = name.trim();
    if (!cleanName || savingsGoals.some(goal => goal.name === cleanName)) return setError('نام هدف خالی یا تکراری است.');
    setSavingsGoals(goals => [...goals, { id: crypto.randomUUID(), name: cleanName, allocatedAmount: 0, targetAmount: null, targetDate: null, completed: false }]);
    setNewSavingsGoal('');
    setError('');
  };

  const updateSavingsGoal = (id: string, patch: Partial<SavingsGoal>) => {
    setSavingsGoals(goals => goals.map(goal => goal.id === id ? { ...goal, ...patch } : goal));
    setError('');
  };

  const validateSavingsGoals = () => {
    if (!savingsGoalChoice) return 'انتخاب کن که می‌خواهی پس‌اندازت را هدف‌بندی کنی یا نه.';
    if (savingsGoalChoice === 'no') return null;
    if (savingsGoals.some(goal => !goal.name.trim())) return 'نام همه هدف‌ها را مشخص کن.';
    if (savingsGoals.some(goal => !Number.isSafeInteger(goal.allocatedAmount) || goal.allocatedAmount < 0)) return 'مبلغ اختصاص‌یافته هدف معتبر نیست.';
    if (savingsGoals.some(goal => goal.targetAmount !== null && (!Number.isSafeInteger(goal.targetAmount) || goal.targetAmount <= 0))) return 'مبلغ نهایی هدف باید بیشتر از صفر باشد.';
    if (new Set(savingsGoals.map(goal => goal.name.trim().toLocaleLowerCase('fa'))).size !== savingsGoals.length) return 'نام هدف‌ها نباید تکراری باشد.';
    if (savingsGoals.some(goal => goal.targetDate && !parseJalaliDate(goal.targetDate))) return 'تاریخ هدف را به شکل ۱۴۰۶/۰۱/۳۱ وارد کن.';
    if (savingsAllocationTotal > onboardingSavingsTotal) return `${money(savingsAllocationTotal - onboardingSavingsTotal)} بیشتر از کل پس‌انداز هدف‌بندی شده است.`;
    return null;
  };

  const nextStep = () => {
    if (step === 1) {
      if (!monthlyIncome) return setError('درآمد ماهانه باید یک عدد مثبت باشد.');
      const enteredSavings = parseNonNegativeInteger(savingsAmountInput);
      if (savingsEnabled && (enteredSavings === null || enteredSavings > monthlyIncome)) return setError('مبلغ پس‌انداز باید بین صفر و درآمد ماهانه باشد.');
      setError('');
      return setStep(savingsAmount > 0 ? 2 : 3);
    }
    if (step === 2) {
      const savingsValidation = validateSavingsGoals();
      if (savingsValidation) return setError(savingsValidation);
      setError('');
      return setStep(3);
    }
    if (step === 3) {
      const validation = validateFinancialSetup(monthlyIncome, savingsPercentBps, categories, savingsAmount);
      if (validation) return setError(validation);
      setError('');
      return setStep(4);
    }
  };

  const requestPermission = async () => {
    if (!('Notification' in window)) return setPermission('unsupported');
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') setReminder(current => ({ ...current, enabled: true }));
  };

  const complete = async () => {
    const validation = validateFinancialSetup(monthlyIncome, savingsPercentBps, categories, savingsAmount);
    if (validation) {
      setError(validation);
      setStep(3);
      return;
    }
    if (savingsAmount > 0) {
      const savingsValidation = validateSavingsGoals();
      if (savingsValidation) {
        setError(savingsValidation);
        setStep(2);
        return;
      }
    }
    setSaving(true);
    const setup = createCompletedSetup(monthlyIncome, savingsPercentBps, categories, reminder, savingsAmount);
    const currentMonthKey = monthFromOffset(0).key;
    const basePortfolio = initialSavingsPortfolio ?? createSavingsPortfolio(onboardingSavingsTotal, currentMonthKey);
    const nextSavingsPortfolio: SavingsPortfolio = {
      ...basePortfolio,
      totalAmount: onboardingSavingsTotal,
      monthKey: currentMonthKey,
      monthlyTargetAmount: savingsAmount,
      goals: savingsAmount > 0 && savingsGoalChoice === 'yes' ? savingsGoals : initialSetup?.onboardingCompleted && savingsAmount === 0 ? basePortfolio.goals : [],
      updatedAt: new Date().toISOString(),
    };
    try {
      await onComplete(setup, nextSavingsPortfolio);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'ذخیره برنامه مالی انجام نشد. دوباره تلاش کن.');
    } finally { setSaving(false); }
  };

  return <main className="onboarding-page" dir="rtl">
    <header className="onboarding-header">
      <div className="onboarding-brand"><img src="/momo-app-icon.png" alt="لوگوی گاو"/><div><strong>گاو</strong><span>شروع مدیریت مالی شخصی</span></div></div>
      {onCancel && <Button className="onboarding-close" onClick={onCancel}>بازگشت به تنظیمات</Button>}
    </header>

    <section className="onboarding-shell">
      <Card className="onboarding-card" variant="borderless">
        {step === 1 && <section className="onboarding-step income-step">
          <div className="step-icon"><WalletCards size={26}/></div>
          <span className="step-kicker">مرحله اول</span>
          <h1>درآمد ماهانه‌ات چقدر است؟</h1>
          <p>درآمدت را بین پس‌انداز و هزینه‌های ماهانه تقسیم کن. بودجه‌ی دسته‌ها فقط از مبلغ قابل‌هزینه محاسبه می‌شود.</p>
          <label className="income-label" htmlFor="monthly-income">درآمد ماهانه</label>
          <Input className="income-input" id="monthly-income" inputMode="numeric" value={incomeInput} onChange={event => changeIncome(event.target.value)} placeholder="مثلاً ۴۵۰۰۰۰۰۰" aria-describedby="income-hint" prefix={<CircleDollarSign size={21}/>} suffix="تومان"/>
          <div id="income-hint" className="income-preview">{incomeInput && parsePositiveInteger(incomeInput) ? `معادل ${money(parsePositiveInteger(incomeInput)!)} در ماه` : 'درآمد ماهانه‌ات را به تومان وارد کن.'}</div>
          <div className="savings-toggle-row"><span>می‌خوای بخشی از درآمدت رو پس‌انداز کنی؟</span><Switch checked={savingsEnabled} onChange={toggleSavings}/></div>
          {savingsEnabled ? <>
            <label className="income-label" htmlFor="savings-amount">این ماه چقدر می‌خوای پس‌انداز کنی؟</label>
            <Input className="income-input" id="savings-amount" inputMode="numeric" value={savingsAmountInput} onChange={event => changeSavingsAmount(event.target.value)} aria-describedby="savings-hint" suffix="تومان"/>
            <div id="savings-hint" className="income-preview">معادل {new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(savingsPercentBps / 100)}٪ از درآمد ماهانه</div>
          </> : <div className="income-preview">فعلاً بدون پس‌انداز ادامه می‌دی؛ هر وقت خواستی می‌تونی از تنظیمات دوباره فعالش کنی.</div>}
          <div className="income-split"><div><span>برای پس‌انداز · {new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(savingsPercentBps / 100)}٪</span><strong>{money(savingsAmount)}</strong></div><div><span>قابل‌هزینه</span><strong>{money(spendableAmount)}</strong></div></div>
        </section>}

        {step === 2 && <section className="onboarding-step savings-goals-step">
          <span className="step-kicker">مرحله دوم · اختیاری</span>
          <h1>می‌خوای پس‌اندازت رو هدف‌بندی کنی؟</h1>
          <p>هدف‌ها فقط مشخص می‌کنند هر بخش از همین {money(onboardingSavingsTotal)} برای چه چیزی کنار گذاشته شده است.</p>
          <Segmented block value={savingsGoalChoice || undefined} onChange={value => { setSavingsGoalChoice(value as 'yes' | 'no'); setError(''); }} options={[{value:'yes',label:'بله، هدف‌بندی کنم'},{value:'no',label:'فعلاً نه'}]}/>
          {savingsGoalChoice === 'yes' && <>
            <div className={`onboarding-savings-summary ${savingsAllocationTotal > onboardingSavingsTotal ? 'over' : ''}`}><div><span>کل پس‌انداز</span><strong>{money(onboardingSavingsTotal)}</strong></div><div><span>هدف‌بندی‌شده</span><strong>{money(savingsAllocationTotal)}</strong></div><div><span>بدون هدف</span><strong>{money(unallocatedSavingsAmount)}</strong></div></div>
            <div className="onboarding-goal-presets">{savingsGoalPresets.map(name => <Button key={name} size="small" disabled={savingsGoals.some(goal => goal.name === name)} onClick={() => addSavingsGoal(name)}>{name}</Button>)}</div>
            <div className="onboarding-goal-list">{savingsGoals.map(goal => <Card key={goal.id} className="onboarding-goal-card" variant="borderless">
              <div className="onboarding-goal-name"><Input value={goal.name} onChange={event => updateSavingsGoal(goal.id, { name: event.target.value })} placeholder="نام هدف"/><Button type="text" danger icon={<Trash2 size={16}/>} aria-label={`حذف ${goal.name}`} onClick={() => setSavingsGoals(goals => goals.filter(item => item.id !== goal.id))}/></div>
              <div className="onboarding-goal-fields"><label>مبلغ اختصاص‌یافته<InputNumber min={0} precision={0} value={goal.allocatedAmount} onChange={value => updateSavingsGoal(goal.id, { allocatedAmount: value || 0 })} addonAfter="تومان"/></label><label>مبلغ نهایی (اختیاری)<InputNumber min={1} precision={0} value={goal.targetAmount} onChange={value => updateSavingsGoal(goal.id, { targetAmount: value })} addonAfter="تومان"/></label><label>تاریخ هدف (اختیاری)<Input inputMode="numeric" value={goal.targetDate || ''} onChange={event => updateSavingsGoal(goal.id, { targetDate: event.target.value || null })} placeholder="۱۴۰۶/۰۱/۳۱"/></label></div>
            </Card>)}</div>
            <div className="add-category"><Input value={newSavingsGoal} onChange={event => setNewSavingsGoal(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addSavingsGoal(newSavingsGoal); } }} placeholder="هدف دلخواه، مثلاً مهاجرت"/><Button type="primary" icon={<Plus size={18}/>} onClick={() => addSavingsGoal(newSavingsGoal)}>افزودن هدف</Button></div>
          </>}
          {savingsGoalChoice === 'no' && <div className="onboarding-savings-skip">کل مبلغ به‌عنوان «پس‌انداز بدون هدف» ذخیره می‌شود و بعداً از تب پس‌انداز می‌توانی برایش هدف بسازی.</div>}
        </section>}

        {step === 3 && <section className="onboarding-step categories-step">
          <span className="step-kicker">مرحله سوم</span>
          <h1>درآمدت را چطور تقسیم می‌کنی؟</h1>
          <p>برای هر دسته مبلغ یا درصد وارد کن؛ مقدار مقابل همان لحظه محاسبه می‌شود. لازم نیست تمام مبلغ را تخصیص بدهی.</p>
          <div className={`allocation-summary ${remainingAmount < 0 ? 'over' : remainingAmount === 0 ? 'complete' : ''}`}>
            <div className="allocation-summary-grid">
              <div><span>مجموع درصد</span><strong>{new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(totalPercent)}٪</strong></div>
              <div><span>مجموع مبلغ</span><strong>{money(allocatedAmount)}</strong></div>
              <div><span>تخصیص‌نیافته</span><strong>{remainingAmount >= 0 ? money(remainingAmount) : `− ${money(Math.abs(remainingAmount))}`}</strong></div>
            </div>
            <Progress className="allocation-bar" percent={Math.min(100, totalPercent)} showInfo={false} status={remainingAmount < 0 ? 'exception' : remainingAmount === 0 ? 'success' : 'active'}/>
            <p>{remainingAmount > 0 ? `${new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(Math.max(0, 100 - totalPercent))}٪ از مبلغ قابل‌خرج هنوز آزاد است.` : remainingAmount < 0 ? `${money(Math.abs(remainingAmount))} بیشتر از مبلغ قابل‌خرج تخصیص داده‌ای.` : 'تمام مبلغ قابل‌هزینه تقسیم شده است.'}</p>
          </div>
          <div className="setup-category-list">{calculatedCategories.map(category => <div className="setup-category allocation-card" key={category.id}>
            <div className="allocation-category-header">
              <Popover
                trigger="click"
                placement="bottomRight"
                open={openEmojiPicker === category.id}
                onOpenChange={open => setOpenEmojiPicker(open ? category.id : null)}
                content={<div className="category-emoji-palette" role="listbox" aria-label={`انتخاب آیکن ${category.name}`}>{categoryEmojiPalette(category.name).map(option => <button type="button" role="option" aria-label={categoryIconLabel(option)} aria-selected={categoryEmoji(category.icon, category.name) === option} className={categoryEmoji(category.icon, category.name) === option ? 'selected' : ''} key={option} onClick={() => { updateCategory(category.id, { icon: option }); setOpenEmojiPicker(null); }}><CategoryIconVisual icon={option}/></button>)}</div>}
              >
                <Button className="category-emoji-picker" aria-label={`آیکن دسته ${category.name}`}><CategoryIconVisual icon={category.icon} name={category.name}/><ChevronDown size={12}/></Button>
              </Popover>
              <Input className="category-name" value={category.name} onChange={event => updateCategory(category.id, { name: event.target.value })} aria-label="نام دسته"/>
              <Button className="remove-category" type="text" danger icon={<Trash2 size={17}/>} onClick={() => deleteCategory(category.id)} aria-label={`حذف دسته ${category.name}`}/>
            </div>
            <div className="allocation-financial-controls">
              <div className="allocation-mode-field"><label>نوع تخصیص</label><Segmented block value={category.allocationMode} onChange={mode => changeAllocationMode(category, mode as 'percentage' | 'amount')} options={[{value:'percentage',label:'درصد'},{value:'amount',label:'مبلغ'}]} aria-label={`نوع تخصیص ${category.name}`}/></div>
              <div className="allocation-value-field"><label htmlFor={`allocation-${category.id}`}>{category.allocationMode === 'amount' ? 'مبلغ تخصیص' : 'درصد تخصیص'}</label><Input id={`allocation-${category.id}`} inputMode={category.allocationMode === 'amount' ? 'numeric' : 'decimal'} value={allocationInputs[category.id] ?? ''} onChange={event => category.allocationMode === 'amount' ? changeAmount(category.id, event.target.value) : changePercentage(category.id, event.target.value)} onBlur={() => setAllocationInputs(inputs => ({ ...inputs, [category.id]: category.allocationMode === 'amount' ? String(category.amount) : String(category.percentageBps / 100) }))} aria-label={`${category.allocationMode === 'amount' ? 'مبلغ تخصیص' : 'درصد تخصیص'} ${category.name}`} suffix={category.allocationMode === 'amount' ? 'تومان' : '٪'}/></div>
            </div>
            <div className="allocation-equivalent">{category.allocationMode === 'amount' ? `معادل ${new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(category.percentageBps / 100)}٪ از مبلغ قابل‌خرج` : `معادل ${money(category.amount)}`}</div>
          </div>)}</div>
          <div className="add-category"><Input value={newCategory} onChange={event => setNewCategory(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addNewCategory(); } }} placeholder="نام دسته‌ی جدید" aria-label="نام دسته جدید"/><Button type="primary" icon={<Plus size={18}/>} onClick={addNewCategory}>افزودن دسته</Button></div>
          <div className="palette-note"><Smile size={16}/> برای هر دسته می‌توانی آیکن یا ایموجی انتخاب کنی.</div>
        </section>}

        {step === 4 && <section className="onboarding-step review-step">
          <span className="step-kicker">مرحله چهارم</span>
          <h1>همه‌چیز آماده است</h1>
          <p>قبل از شروع، خلاصه‌ی برنامه‌ی مالی‌ات را مرور کن.</p>
          <div className="review-income"><span>درآمد ماهانه</span><strong>{money(monthlyIncome)}</strong><small>پس‌انداز {new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(savingsPercentBps / 100)}٪: {money(savingsAmount)} · قابل‌هزینه: {money(spendableAmount)}</small></div>
          {savingsAmount > 0 && <div className="review-savings-goals"><span>تقسیم پس‌انداز</span><strong>{savingsGoalChoice === 'yes' ? `${savingsGoals.length} هدف · ${money(unallocatedSavingsAmount)} بدون هدف` : `${money(onboardingSavingsTotal)} بدون هدف`}</strong></div>}
          <div className="review-list">{calculatedCategories.map(category => <div key={category.id}><i className="review-emoji"><CategoryIconVisual icon={category.icon} name={category.name}/></i><span>{category.name}</span><b>{new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(category.percentageBps / 100)}٪</b><strong>{money(category.amount)}</strong></div>)}</div>
          <div className="review-total"><span>مجموع بودجه</span><strong>{money(calculatedCategories.reduce((sum, category) => sum + category.amount, 0))}</strong></div>
          <div className="reminder-setup">
            <div className="reminder-heading"><div className="step-icon small"><Bell size={19}/></div><div><strong>یادآوری ثبت مخارج</strong><span>هر شب یادت می‌اندازیم مخارج روزانه را ثبت کنی.</span></div><Switch checked={reminder.enabled} onChange={enabled => setReminder(current => ({ ...current, enabled }))}/></div>
            {reminder.enabled && <div className="reminder-options"><label><Clock3 size={17}/> ساعت یادآوری<Input type="time" value={reminder.time} onChange={event => setReminder(current => ({ ...current, time: event.target.value }))}/></label><div className="timezone">منطقه زمانی: <bdi>{reminder.timezone}</bdi></div>{permission !== 'granted' && <Button className="permission-button" onClick={requestPermission}>فعال‌سازی اعلان مرورگر</Button>}<Alert type="info" showIcon message="اعلان زمان‌بندی‌شده فقط وقتی این وب‌اپ باز باشد تضمین می‌شود. برای ارسال قطعی در حالت بسته، اتصال Cloud Function زمان‌بندی‌شده لازم است."/></div>}
          </div>
        </section>}

        {error && <Alert className="onboarding-error" type="error" showIcon message={error}/>}
        <footer className="onboarding-actions">
          {step > 1 ? <Button className="previous-button" icon={<ArrowRight size={18}/>} onClick={() => { setError(''); setStep(value => value === 3 && savingsAmount === 0 ? 1 : value - 1); }}>قبلی</Button> : <span/>}
          {step < 4 ? <Button type="primary" className="next-button" onClick={nextStep}>ادامه <ArrowLeft size={18}/></Button> : <Button type="primary" className="next-button" loading={saving} icon={!saving ? <Check size={18}/> : undefined} onClick={complete}>تأیید نهایی</Button>}
        </footer>
      </Card>
    </section>
  </main>;
}
