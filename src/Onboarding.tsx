import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Bell, Check, ChevronDown, CircleDollarSign, Clock3, Pencil, Plus, Smile, Target, Trash2, Vault, WalletCards } from 'lucide-react';
import { Alert, Button, Card, Form, Input, InputNumber, Modal, Popover, Progress, Segmented, Slider, Statistic, Switch, Tag } from 'antd';
import {
  addCategory, calculateCategoryAmounts, calculateSavingsAmount, calculateSpendableAmount, colorPalette, createCompletedSetup,
  createDefaultCategories, formatCompactToman, parseNonNegativeInteger, parsePositiveInteger, percentageToBps, removeCategory,
  validateFinancialSetup,
  type ExpenseReminder, type FinancialSetup, type SetupCategory,
} from './financialSetup';
import { categoryEmoji, categoryEmojiPalette, categoryIconLabel } from './categoryEmoji';
import CategoryIconVisual from './CategoryIconVisual';
import { displayJalaliDate, monthFromOffset, parseJalaliDate } from './dateUtils';
import { createSavingsPortfolio, formatSavingsDuration, onboardingSavingsBalance, savingsGoalProjection, withGoalProgressSnapshot, type SavingsGoal, type SavingsPortfolio } from './savings';
import JalaliDatePicker from './JalaliDatePicker';

type Props = {
  initialSetup: FinancialSetup | null;
  initialSavingsPortfolio: SavingsPortfolio | null;
  onComplete: (setup: FinancialSetup, savingsPortfolio: SavingsPortfolio) => void | Promise<void>;
  onCancel?: () => void;
};

const money = (value: number) => `${new Intl.NumberFormat('fa-IR').format(value)} تومان`;

const savingsGoalPresets = ['صندوق اضطراری', 'سفر', 'خرید ماشین', 'خرید خانه', 'سرمایه‌گذاری', 'خرید لپ‌تاپ', 'سایر'];
const savingsGoalEmoji = (name: string) => name.includes('سفر') ? '✈️' : name.includes('اضطرار') ? '🛡️' : name.includes('ماشین') ? '🚗' : name.includes('خانه') ? '🏠' : name.includes('سرمایه') ? '📈' : name.includes('لپ‌تاپ') ? '💻' : '🎯';

export default function Onboarding({ initialSetup, initialSavingsPortfolio, onComplete, onCancel }: Props) {
  const [step, setStep] = useState(1);
  const [monthlyIncome, setMonthlyIncome] = useState(initialSetup?.monthlyIncome ?? 0);
  const [incomeInput, setIncomeInput] = useState(initialSetup?.monthlyIncome ? String(initialSetup.monthlyIncome) : '');
  const [savingsPercentBps, setSavingsPercentBps] = useState(initialSetup?.savingsPercentBps ?? 0);
  const [categories, setCategories] = useState<SetupCategory[]>(initialSetup?.categories ?? createDefaultCategories());
  const [allocationInputs, setAllocationInputs] = useState<Record<string, string>>(() => Object.fromEntries((initialSetup?.categories ?? createDefaultCategories()).map(category => [category.id, category.allocationMode === 'amount' ? String(category.amount) : String(category.percentageBps / 100)])));
  const [newCategory, setNewCategory] = useState('');
  const [savingsGoalChoice, setSavingsGoalChoice] = useState<'yes' | 'no' | null>(() => initialSavingsPortfolio ? (initialSavingsPortfolio.goals.length ? 'yes' : 'no') : null);
  const [savingsGoalStage, setSavingsGoalStage] = useState<'choice' | 'builder'>('choice');
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>(initialSavingsPortfolio?.goals ?? []);
  const [editingSavingsGoalId, setEditingSavingsGoalId] = useState<string | null>(null);
  const [newSavingsGoal, setNewSavingsGoal] = useState('');
  const [newSavingsGoalError, setNewSavingsGoalError] = useState('');
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

  const savingsPercent = savingsPercentBps / 100;
  const savingsAmount = savingsEnabled ? calculateSavingsAmount(monthlyIncome, savingsPercentBps) : 0;
  const spendableAmount = calculateSpendableAmount(monthlyIncome, savingsPercentBps, savingsAmount);
  const calculatedCategories = useMemo(() => calculateCategoryAmounts(spendableAmount, categories), [spendableAmount, categories]);
  const allocatedAmount = calculatedCategories.reduce((sum, category) => sum + category.amount, 0);
  const totalBps = spendableAmount > 0 ? Math.round(allocatedAmount / spendableAmount * 10000) : 0;
  const totalPercent = totalBps / 100;
  const remainingAmount = spendableAmount - allocatedAmount;
  const savingsAllocationTotal = savingsGoals.reduce((sum, goal) => sum + goal.allocatedAmount, 0);
  const onboardingSavingsTotal = onboardingSavingsBalance(initialSavingsPortfolio?.totalAmount ?? 0, savingsAmount);
  const unallocatedSavingsAmount = Math.max(0, onboardingSavingsTotal - savingsAllocationTotal);
  const editingSavingsGoal = savingsGoals.find(goal => goal.id === editingSavingsGoalId) ?? null;

  const changeIncome = (value: string) => {
    setIncomeInput(value);
    const parsed = parsePositiveInteger(value);
    setMonthlyIncome(parsed ?? 0);
    if (parsed) setError('');
  };

  const changeSavingsPercent = (value: number | null) => {
    const percent = Math.min(100, Math.max(0, value ?? 0));
    setSavingsPercentBps(Math.round(percent * 100));
    setError('');
  };

  const lastSavingsPercentRef = useRef(savingsPercentBps || 1000);
  const toggleSavings = (enabled: boolean) => {
    setSavingsEnabled(enabled);
    if (enabled) {
      setSavingsPercentBps(lastSavingsPercentRef.current || 1000);
    } else {
      if (savingsPercentBps > 0) lastSavingsPercentRef.current = savingsPercentBps;
      setSavingsPercentBps(0);
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
    if (!cleanName) return setNewSavingsGoalError('نام هدف را وارد کنید');
    if (savingsGoals.some(goal => goal.name.trim().toLocaleLowerCase('fa') === cleanName.toLocaleLowerCase('fa'))) return setNewSavingsGoalError('این هدف قبلاً اضافه شده است');
    const goal = { id: crypto.randomUUID(), name: cleanName, allocatedAmount: 0, monthlyContribution: 0, targetAmount: null, targetDate: null, completed: false, progressHistory: [] } satisfies SavingsGoal;
    setSavingsGoals(goals => [...goals, goal]);
    setNewSavingsGoal('');
    setNewSavingsGoalError('');
    setError('');
  };

  const selectSavingsGoalPreset = (name: string) => {
    setNewSavingsGoal(name);
    setNewSavingsGoalError('');
  };

  const skipSavingsGoals = () => {
    setSavingsGoalChoice('no');
    setSavingsGoals(initialSavingsPortfolio?.goals ?? []);
    setNewSavingsGoal('');
    setNewSavingsGoalError('');
    setError('');
    setStep(3);
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
    if (savingsGoals.some(goal => !Number.isSafeInteger(goal.monthlyContribution ?? 0) || (goal.monthlyContribution ?? 0) < 0)) return 'مبلغ ماهانه هدف معتبر نیست.';
    if (savingsGoals.some(goal => goal.targetAmount !== null && (!Number.isSafeInteger(goal.targetAmount) || goal.targetAmount <= 0))) return 'مبلغ نهایی هدف باید بیشتر از صفر باشد.';
    if (new Set(savingsGoals.map(goal => goal.name.trim().toLocaleLowerCase('fa'))).size !== savingsGoals.length) return 'نام هدف‌ها نباید تکراری باشد.';
    if (savingsGoals.some(goal => goal.targetDate && !parseJalaliDate(goal.targetDate))) return 'تاریخ هدف را به شکل ۱۴۰۶/۰۱/۳۱ وارد کن.';
    if (savingsAllocationTotal > onboardingSavingsTotal) return `${money(savingsAllocationTotal - onboardingSavingsTotal)} بیشتر از کل پس‌انداز هدف‌بندی شده است.`;
    return null;
  };

  const nextStep = () => {
    if (step === 1) {
      if (!monthlyIncome) return setError('درآمد ماهانه باید یک عدد مثبت باشد.');
      if (savingsEnabled && (savingsPercentBps <= 0 || savingsPercentBps > 10000)) return setError('درصد پس‌انداز باید بین یک تا صد باشد.');
      setError('');
      setSavingsGoalStage('choice');
      return setStep(savingsAmount > 0 ? 2 : 3);
    }
    if (step === 2) {
      if (!savingsGoalChoice) return setError('انتخاب کن که می‌خواهی پس‌اندازت را هدف‌بندی کنی یا نه.');
      if (savingsGoalStage === 'choice' && savingsGoalChoice === 'yes') {
        setError('');
        return setSavingsGoalStage('builder');
      }
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

  const previousStep = () => {
    setError('');
    if (step === 2 && savingsGoalStage === 'builder') return setSavingsGoalStage('choice');
    setStep(value => value === 3 && savingsAmount === 0 ? 1 : value - 1);
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
        if (savingsGoalChoice === 'yes') setSavingsGoalStage('builder');
        return;
      }
    }
    setSaving(true);
    const setup = createCompletedSetup(monthlyIncome, savingsPercentBps, categories, reminder, savingsAmount);
    const currentMonthKey = monthFromOffset(0).key;
    const basePortfolio = initialSavingsPortfolio ?? createSavingsPortfolio(onboardingSavingsTotal, currentMonthKey);
    const nextSavingsPortfolio = withGoalProgressSnapshot({
      ...basePortfolio,
      totalAmount: onboardingSavingsTotal,
      monthKey: currentMonthKey,
      monthlyTargetAmount: savingsAmount,
      goals: savingsAmount > 0
        ? savingsGoalChoice === 'yes' ? savingsGoals : initialSavingsPortfolio?.goals ?? []
        : initialSetup?.onboardingCompleted ? basePortfolio.goals : [],
      updatedAt: new Date().toISOString(),
    }, currentMonthKey);
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
        {step === 1 && <section className="onboarding-step income-step ant-savings-setup-step">
          <div className="onboarding-section-title"><div className="step-icon"><WalletCards size={23}/></div><div><span className="step-kicker">مرحله ۱ از ۳</span><h1>درآمد و پس‌انداز ماهانه</h1><p>اول درآمدت را بنویس، بعد درصدی را که می‌خواهی کنار بگذاری مشخص کن.</p></div></div>
          <Form component="div" layout="vertical" className="onboarding-ant-form">
            <Form.Item label="درآمد ماهانه" extra={incomeInput && parsePositiveInteger(incomeInput) ? `معادل ${formatCompactToman(parsePositiveInteger(incomeInput)!)} در ماه` : 'مبلغ را به تومان وارد کن.'}>
              <Input className="income-input" id="monthly-income" inputMode="numeric" value={incomeInput} onChange={event => changeIncome(event.target.value)} placeholder="مثلاً ۴۵۰۰۰۰۰۰" prefix={<CircleDollarSign size={19}/>} suffix="تومان"/>
            </Form.Item>
            <Card size="small" className="savings-percentage-card">
              <div className="savings-toggle-row"><div><Vault size={19}/><span><strong>پس‌انداز ماهانه</strong><small>درصدی از درآمدت را کنار بگذار.</small></span></div><Switch checked={savingsEnabled} onChange={toggleSavings}/></div>
              {savingsEnabled ? <div className="savings-percent-editor">
                <div className="savings-percent-heading"><span>چند درصد پس‌انداز می‌کنی؟</span><strong className="savings-percent-value">{new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(savingsPercent)}٪</strong></div>
                <Slider className="savings-percent-slider" aria-label="درصد پس انداز" min={1} max={100} step={0.5} value={savingsPercent} onChange={changeSavingsPercent} tooltip={{ formatter: value => `${new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(value ?? 0)}٪` }}/>
                <Alert type="info" showIcon message={<span>با این درصد، مبلغ پس‌اندازت <strong>{formatCompactToman(savingsAmount)}</strong> می‌شود.</span>}/>
              </div> : <Alert type="info" showIcon message="فعلاً بدون پس‌انداز ادامه می‌دهی؛ بعداً از تنظیمات می‌توانی فعالش کنی."/>}
            </Card>
            <div className="onboarding-income-summary"><Card size="small"><Statistic title={`پس‌انداز · ${new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(savingsPercent)}٪`} value={savingsAmount} formatter={() => formatCompactToman(savingsAmount)}/></Card><Card size="small"><Statistic title="مبلغ قابل‌هزینه" value={spendableAmount} formatter={() => formatCompactToman(spendableAmount)}/></Card></div>
          </Form>
        </section>}

        {step === 2 && <section className="onboarding-step savings-goals-step savings-goal-flow">
          <div className="savings-goal-flow-heading">
            <div className="savings-goal-flow-kicker"><span>مرحله ۲ از ۳</span><Tag bordered={false}>اختیاری</Tag></div>
            <h1>{savingsGoalStage === 'builder' ? 'پس‌اندازت رو برای هدف‌هات کنار بذار' : 'برای ذخیره‌هات هدف بذار'}</h1>
            <p>{savingsGoalStage === 'builder' ? <>از <strong>{formatCompactToman(onboardingSavingsTotal)}</strong> پس‌انداز این ماه، مشخص کن چقدر به هر هدف اختصاص پیدا کنه.</> : <>ذخیره‌ی این ماهت <strong>{formatCompactToman(onboardingSavingsTotal)}</strong>ـه. می‌تونی بین چند تا هدف تقسیمش کنی؛ هدف‌ها فقط برچسبن و پول اضافه‌ای حساب نمی‌شن.</>}</p>
          </div>

          {savingsGoalStage === 'choice' ? <div className="savings-goal-choice-grid">
            <Button className={`savings-goal-choice-option ${savingsGoalChoice === 'yes' ? 'selected' : ''}`} onClick={() => { setSavingsGoalChoice('yes'); setError(''); }}>
              <span className="choice-radio"/><span className="choice-icon"><Target size={21}/></span><strong>آره، هدف می‌ذارم</strong><small>مثلاً سفر، ماشین یا صندوق اضطراری</small>
            </Button>
            <Button className={`savings-goal-choice-option ${savingsGoalChoice === 'no' ? 'selected' : ''}`} onClick={() => { setSavingsGoalChoice('no'); setError(''); }}>
              <span className="choice-radio"/><span className="choice-icon neutral"><ArrowLeft size={21}/></span><strong>فعلاً نه</strong><small>بعداً از تنظیمات هم می‌تونی اضافه کنی</small>
            </Button>
          </div> : <>
            <Card className={`savings-allocation-overview ${savingsAllocationTotal > onboardingSavingsTotal ? 'over' : ''}`} variant="borderless">
              <div className="allocation-overview-primary"><strong>{formatCompactToman(unallocatedSavingsAmount)}</strong><span>باقی مانده</span></div>
              <div className="allocation-overview-meta"><span>{formatCompactToman(savingsAllocationTotal)} تخصیص داده شده</span><b>{savingsGoals.length ? `${new Intl.NumberFormat('fa-IR').format(savingsGoals.length)} هدف` : 'بدون هدف'}</b></div>
              {savingsAllocationTotal > onboardingSavingsTotal && <p>{formatCompactToman(savingsAllocationTotal - onboardingSavingsTotal)} بیشتر از پس‌انداز این ماه وارد شده است.</p>}
            </Card>

            <div className="savings-goal-summary-list">{savingsGoals.map(goal => {
              const projection = savingsGoalProjection(goal);
              const missingTargetAmount = !goal.targetAmount;
              const missingTargetDate = !goal.targetDate;
              const missingDetails = missingTargetAmount || missingTargetDate;
              const availableForGoal = Math.max(0, onboardingSavingsTotal - savingsAllocationTotal + goal.allocatedAmount);
              return <Card key={goal.id} className="savings-goal-summary-card" variant="borderless">
                <div className="goal-summary-main"><span className="goal-summary-emoji">{savingsGoalEmoji(goal.name)}</span><div className="goal-summary-copy"><div className="goal-summary-title"><strong>{goal.name}</strong><Button type="text" icon={<Pencil size={15}/>} aria-label={`ویرایش ${goal.name}`} onClick={() => setEditingSavingsGoalId(goal.id)}/></div>{missingDetails ? <div className="goal-summary-incomplete"><span>هدف هنوز کامل نشده</span><Button type="link" onClick={() => setEditingSavingsGoalId(goal.id)}>{missingTargetAmount && missingTargetDate ? 'تکمیل مبلغ و تاریخ' : missingTargetAmount ? 'تکمیل مبلغ هدف' : 'تکمیل تاریخ هدف'}</Button></div> : <small>هدف {formatCompactToman(goal.targetAmount!)} · تا {displayJalaliDate(goal.targetDate!)}</small>}</div></div>
                <div className="goal-summary-allocation-editor"><label htmlFor={`goal-allocation-${goal.id}`}>مبلغ ماهانه برای این هدف</label><InputNumber id={`goal-allocation-${goal.id}`} aria-label={`مبلغ ماهانه ${goal.name}`} className="goal-allocation-input" min={0} max={availableForGoal} precision={0} controls={false} value={goal.monthlyContribution ?? 0} onChange={value => updateSavingsGoal(goal.id, { allocatedAmount: value || 0, monthlyContribution: value || 0 })} addonAfter="تومان"/><small>{goal.monthlyContribution ? `معادل ${formatCompactToman(goal.monthlyContribution)} در ماه` : 'مبلغ ماهانه را وارد کن.'}</small></div>
                <div className={`goal-plan-preview ${missingDetails ? 'incomplete' : projection.status}`}>
                  <div className="goal-plan-preview-heading"><span>سرعت رسیدن به هدف</span><b>{missingDetails ? 'اطلاعات ناقص' : projection.status === 'on-track' ? 'طبق برنامه' : projection.status === 'behind' ? 'عقب‌تر از برنامه' : 'مبلغ ماهانه لازم است'}</b></div>
                  <Progress percent={Math.min(100, projection.pacePercent ?? 0)} showInfo={false} status={projection.status === 'behind' ? 'exception' : 'normal'}/>
                  <small>{missingDetails ? 'برای محاسبه سرعت پیشرفت، مبلغ نهایی و تاریخ هدف را تکمیل کن.' : <>{projection.requiredMonthlyAmount ? `برای رسیدن تا ${displayJalaliDate(goal.targetDate!)} ماهی ${formatCompactToman(projection.requiredMonthlyAmount)} لازم است.` : ''}{projection.projectedMonths ? ` با برنامه فعلی حدود ${formatSavingsDuration(projection.projectedMonths)} زمان می‌برد.` : ''}</>}</small>
                </div>
              </Card>;
            })}</div>

            <div className="savings-add-goal-box">
              <div className="savings-add-goal-heading"><strong>هدف دیگه‌ای داری؟</strong><span>یکی از پیشنهادها را انتخاب کن یا اسم هدف خودت را بنویس.</span></div>
              <div className="savings-add-goal-presets">{savingsGoalPresets.filter(name => !savingsGoals.some(goal => goal.name === name)).slice(0, 4).map(name => <Button className={newSavingsGoal === name ? 'selected' : ''} key={name} onClick={() => selectSavingsGoalPreset(name)}>{savingsGoalEmoji(name)} {name.replace('خرید ', '')}</Button>)}</div>
              <div className={`savings-add-goal-input ${newSavingsGoalError ? 'has-error' : ''}`}><Input value={newSavingsGoal} onChange={event => { setNewSavingsGoal(event.target.value); setNewSavingsGoalError(''); }} onPressEnter={() => addSavingsGoal(newSavingsGoal)} placeholder="مثلاً لپ‌تاپ جدید" aria-label="نام هدف جدید"/><Button type="primary" icon={<Plus size={16}/>} onClick={() => addSavingsGoal(newSavingsGoal)}>افزودن</Button></div>
              {newSavingsGoalError && <small className="savings-add-goal-error" role="alert">{newSavingsGoalError}</small>}
            </div>
          </>}
        </section>}

        {step === 3 && <section className="onboarding-step categories-step">
          <span className="step-kicker">مرحله ۳ از ۳</span>
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
          <span className="step-kicker">مرور نهایی</span>
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
        <footer className={`onboarding-actions ${step === 2 && savingsGoalStage === 'builder' ? 'has-skip' : ''}`}>
          {step > 1 ? <Button className="previous-button" icon={<ArrowRight size={18}/>} onClick={previousStep}>قبلی</Button> : <span/>}
          {step === 2 && savingsGoalStage === 'builder' && <Button type="text" className="skip-goals-button" onClick={skipSavingsGoals}>فعلاً رد شو</Button>}
          {step < 4 ? <Button type="primary" className="next-button" onClick={nextStep}>ادامه <ArrowLeft size={18}/></Button> : <Button type="primary" className="next-button" loading={saving} icon={!saving ? <Check size={18}/> : undefined} onClick={complete}>تأیید نهایی</Button>}
        </footer>
      </Card>
    </section>
    <Modal className="savings-goal-editor-modal" open={Boolean(editingSavingsGoal)} title={editingSavingsGoal ? `ویرایش ${editingSavingsGoal.name}` : 'ویرایش هدف'} footer={null} destroyOnHidden onCancel={() => setEditingSavingsGoalId(null)}>
      {editingSavingsGoal && <Form component="div" layout="vertical">
        <Form.Item label="نام هدف"><Input value={editingSavingsGoal.name} onChange={event => updateSavingsGoal(editingSavingsGoal.id, { name: event.target.value })}/></Form.Item>
        <Form.Item label="مبلغ نهایی (اختیاری)" extra={editingSavingsGoal.targetAmount ? `معادل ${formatCompactToman(editingSavingsGoal.targetAmount)}` : 'مبلغ را به تومان وارد کن.'}><InputNumber className="ant-money-input" min={1} precision={0} controls={false} value={editingSavingsGoal.targetAmount} onChange={value => updateSavingsGoal(editingSavingsGoal.id, { targetAmount: value })} addonAfter="تومان"/></Form.Item>
        <Form.Item label="مبلغ ماهانه" extra={editingSavingsGoal.monthlyContribution ? `معادل ${formatCompactToman(editingSavingsGoal.monthlyContribution)} در ماه` : 'مبلغ را به تومان وارد کن.'}><InputNumber className="ant-money-input" min={0} precision={0} controls={false} value={editingSavingsGoal.monthlyContribution ?? 0} onChange={value => updateSavingsGoal(editingSavingsGoal.id, { monthlyContribution: value || 0 })} addonAfter="تومان"/></Form.Item>
        <Form.Item label="تاریخ هدف (اختیاری)"><JalaliDatePicker value={editingSavingsGoal.targetDate || ''} onChange={value => updateSavingsGoal(editingSavingsGoal.id, { targetDate: value || null })}/></Form.Item>
        <div className="savings-goal-editor-actions"><Button danger type="text" icon={<Trash2 size={15}/>} onClick={() => { setSavingsGoals(goals => goals.filter(goal => goal.id !== editingSavingsGoal.id)); setEditingSavingsGoalId(null); }}>حذف هدف</Button><Button type="primary" onClick={() => setEditingSavingsGoalId(null)}>تمام</Button></div>
      </Form>}
    </Modal>
  </main>;
}
