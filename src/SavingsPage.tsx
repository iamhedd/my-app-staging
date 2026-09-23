import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, CalendarDays, Check, CircleDollarSign, Pencil, Plus, RotateCcw, Trash2, Vault } from 'lucide-react';
import { Alert, Button, Card, Empty, Form, Input, InputNumber, Modal, Progress, Segmented, Select, Tag } from 'antd';
import { displayJalaliDate, monthFromOffset, parseJalaliDate, type JalaliMonth } from './dateUtils';
import { allocatedSavings, createSavingsPortfolio, formatSavingsDuration, savingsGoalProjection, unallocatedSavings, validateSavingsPortfolio, withGoalProgressSnapshot, type SavingsGoal, type SavingsPortfolio } from './savings';
import JalaliDatePicker from './JalaliDatePicker';

type Props = {
  month: JalaliMonth;
  portfolio: SavingsPortfolio | null;
  fallbackTotal: number;
  suggestedAmount: number;
  onSave: (portfolio: SavingsPortfolio) => Promise<void>;
  notify: (message: string) => void;
};

const money = (value: number) => `${new Intl.NumberFormat('fa-IR').format(value)} تومان`;
const presets = ['صندوق اضطراری', 'سفر', 'خرید ماشین', 'خرید خانه', 'سرمایه‌گذاری', 'خرید لپ‌تاپ', 'سایر'];

export default function SavingsPage({ month, portfolio, fallbackTotal, suggestedAmount, onSave, notify }: Props) {
  const monthKey = `${month.year}/${String(month.month).padStart(2, '0')}`;
  const [setupOpen, setSetupOpen] = useState(!portfolio);
  const [setupStep, setSetupStep] = useState<1 | 2>(1);
  const [setupAmount, setSetupAmount] = useState<number | null>(portfolio?.monthlyTargetAmount || suggestedAmount || fallbackTotal || null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [goalName, setGoalName] = useState('');
  const [goalAllocation, setGoalAllocation] = useState<number | null>(null);
  const [goalMonthlyContribution, setGoalMonthlyContribution] = useState<number | null>(null);
  const [goalTarget, setGoalTarget] = useState<number | null>(null);
  const [goalDate, setGoalDate] = useState('');
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [balanceMode, setBalanceMode] = useState<'add' | 'withdraw'>('add');
  const [balanceAmount, setBalanceAmount] = useState<number | null>(null);
  const [balanceBucket, setBalanceBucket] = useState('unallocated');
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState('unallocated');
  const [transferTo, setTransferTo] = useState('');
  const [transferAmount, setTransferAmount] = useState<number | null>(null);
  const [monthlyTargetOpen, setMonthlyTargetOpen] = useState(false);
  const [monthlyTarget, setMonthlyTarget] = useState<number | null>(portfolio?.monthlyTargetAmount || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (portfolio) {
      setSetupOpen(false);
      setMonthlyTarget(portfolio.monthlyTargetAmount);
    }
  }, [portfolio]);

  const allocated = allocatedSavings(portfolio);
  const unallocated = unallocatedSavings(portfolio);
  const bucketOptions = useMemo(() => [
    { value: 'unallocated', label: `پس‌انداز بدون هدف · ${money(unallocated)}` },
    ...(portfolio?.goals.map(goal => ({ value: goal.id, label: `${goal.name} · ${money(goal.allocatedAmount)}` })) || []),
  ], [portfolio, unallocated]);

  const persist = async (next: SavingsPortfolio, success: string) => {
    const nextWithProgress = withGoalProgressSnapshot(next, monthFromOffset(0).key);
    const validation = validateSavingsPortfolio(nextWithProgress);
    if (validation) return setError(validation);
    setSaving(true);
    setError('');
    try {
      await onSave({ ...nextWithProgress, updatedAt: new Date().toISOString() });
      notify(success);
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'ذخیره پس‌انداز انجام نشد.');
      return false;
    } finally { setSaving(false); }
  };

  const finishInitialSetup = async (categorize: boolean) => {
    if (!setupAmount || setupAmount <= 0) return setError('مبلغ پس‌انداز این ماه را وارد کن.');
    const saved = await persist(createSavingsPortfolio(setupAmount, monthKey), 'پس‌انداز این ماه ثبت شد');
    if (!saved) return;
    setSetupOpen(false);
    setSetupStep(1);
    if (categorize) openGoal();
  };

  const skipInitialSetup = async () => {
    const saved = await persist(createSavingsPortfolio(fallbackTotal, monthKey), 'فعلاً بدون هدف پس‌انداز ادامه می‌دهی');
    if (saved) {
      setSetupOpen(false);
      setSetupStep(1);
    }
  };

  const openGoal = (goal?: SavingsGoal) => {
    setEditingGoal(goal || null);
    setGoalName(goal?.name || '');
    setGoalAllocation(goal?.allocatedAmount ?? null);
    setGoalMonthlyContribution(goal?.monthlyContribution ?? null);
    setGoalTarget(goal?.targetAmount ?? null);
    setGoalDate(goal?.targetDate || '');
    setError('');
    setGoalOpen(true);
  };

  const saveGoal = async () => {
    if (!portfolio) return;
    if (!goalName.trim()) return setError('نام هدف را وارد کن.');
    const allocation = goalAllocation ?? 0;
    if (!Number.isSafeInteger(allocation) || allocation < 0) return setError('مبلغ تخصیص معتبر نیست.');
    const monthlyContribution = goalMonthlyContribution ?? 0;
    if (!Number.isSafeInteger(monthlyContribution) || monthlyContribution < 0) return setError('مبلغ ماهانه معتبر نیست.');
    if (goalTarget !== null && (!Number.isSafeInteger(goalTarget) || goalTarget <= 0)) return setError('مبلغ نهایی هدف معتبر نیست.');
    if (goalDate && !parseJalaliDate(goalDate)) return setError('تاریخ هدف را به شکل ۱۴۰۶/۰۱/۳۱ وارد کن.');
    const nextGoal: SavingsGoal = {
      id: editingGoal?.id || crypto.randomUUID(),
      name: goalName.trim(),
      allocatedAmount: allocation,
      monthlyContribution,
      targetAmount: goalTarget,
      targetDate: goalDate || null,
      completed: editingGoal?.completed || false,
      progressHistory: editingGoal?.progressHistory || [],
    };
    const goals = editingGoal
      ? portfolio.goals.map(goal => goal.id === editingGoal.id ? nextGoal : goal)
      : [...portfolio.goals, nextGoal];
    const saved = await persist({ ...portfolio, goals }, editingGoal ? 'هدف ویرایش شد' : 'هدف جدید اضافه شد');
    if (saved) setGoalOpen(false);
  };

  const patchGoal = async (id: string, patch: Partial<SavingsGoal>, message: string) => {
    if (!portfolio) return;
    await persist({ ...portfolio, goals: portfolio.goals.map(goal => goal.id === id ? { ...goal, ...patch } : goal) }, message);
  };

  const deleteGoal = async (goal: SavingsGoal) => {
    if (!portfolio) return;
    const saved = await persist({ ...portfolio, goals: portfolio.goals.filter(item => item.id !== goal.id) }, 'هدف حذف شد و مبلغش به پس‌انداز بدون هدف برگشت');
    if (saved) setGoalOpen(false);
  };

  const saveBalanceChange = async () => {
    if (!portfolio || !balanceAmount || balanceAmount <= 0) return setError('مبلغ را وارد کن.');
    const goal = portfolio.goals.find(item => item.id === balanceBucket);
    if (balanceMode === 'withdraw') {
      const available = goal ? goal.allocatedAmount : unallocated;
      if (balanceAmount > available) return setError(`از این بخش فقط ${money(available)} قابل برداشت است.`);
    }
    const direction = balanceMode === 'add' ? 1 : -1;
    const goals = goal ? portfolio.goals.map(item => item.id === goal.id
      ? { ...item, allocatedAmount: item.allocatedAmount + direction * balanceAmount }
      : item) : portfolio.goals;
    const next = { ...portfolio, totalAmount: portfolio.totalAmount + direction * balanceAmount, goals };
    const saved = await persist(next, balanceMode === 'add' ? 'مبلغ به پس‌انداز اضافه شد' : 'برداشت از پس‌انداز ثبت شد');
    if (saved) { setBalanceOpen(false); setBalanceAmount(null); }
  };

  const saveTransfer = async () => {
    if (!portfolio || !transferTo || transferFrom === transferTo || !transferAmount || transferAmount <= 0) return setError('مبدأ، مقصد و مبلغ جابه‌جایی را کامل کن.');
    const sourceGoal = portfolio.goals.find(goal => goal.id === transferFrom);
    const available = sourceGoal ? sourceGoal.allocatedAmount : unallocated;
    if (transferAmount > available) return setError(`در مبدأ فقط ${money(available)} موجود است.`);
    const goals = portfolio.goals.map(goal => {
      let amount = goal.allocatedAmount;
      if (goal.id === transferFrom) amount -= transferAmount;
      if (goal.id === transferTo) amount += transferAmount;
      return { ...goal, allocatedAmount: amount };
    });
    const saved = await persist({ ...portfolio, goals }, 'مبلغ بین هدف‌ها جابه‌جا شد؛ کل پس‌انداز تغییری نکرد');
    if (saved) { setTransferOpen(false); setTransferAmount(null); }
  };

  const saveMonthlyTarget = async () => {
    if (!portfolio || monthlyTarget === null || monthlyTarget < 0) return setError('مبلغ هدف این ماه را وارد کن.');
    const saved = await persist({ ...portfolio, monthKey, monthlyTargetAmount: monthlyTarget }, 'هدف پس‌انداز این ماه ذخیره شد');
    if (saved) setMonthlyTargetOpen(false);
  };

  return <section className="savings-page">
    <div className="page-header savings-page-header"><div><span className="eyebrow">پس‌انداز و هدف‌ها</span><h1>پولت برای چه هدف‌هایی کنار گذاشته شده؟</h1><p>هدف‌ها فقط تقسیم‌بندی همین موجودی‌اند و دوباره به دارایی تو اضافه نمی‌شوند.</p></div><Button type="primary" icon={<Plus size={17}/>} onClick={() => { setBalanceMode('add'); setBalanceBucket('unallocated'); setError(''); setBalanceOpen(true); }}>افزایش پس‌انداز</Button></div>

    <Card className="savings-hero" variant="borderless">
      <div className="savings-hero-icon"><Vault size={28}/></div>
      <div className="savings-total"><span>کل پس‌انداز</span><strong>{money(portfolio?.totalAmount || 0)}</strong><small>موجودی واقعی حساب پس‌انداز</small></div>
      <div className="savings-split"><div><span>هدف‌بندی‌شده</span><strong>{money(allocated)}</strong></div><div><span>بدون هدف</span><strong>{money(unallocated)}</strong></div></div>
      <div className="savings-actions"><Button icon={<ArrowLeftRight size={16}/>} disabled={!portfolio?.goals.length} onClick={() => { setTransferFrom('unallocated'); setTransferTo(portfolio?.goals[0]?.id || ''); setError(''); setTransferOpen(true); }}>جابه‌جایی</Button><Button icon={<CircleDollarSign size={16}/>} onClick={() => { setBalanceMode('withdraw'); setBalanceBucket('unallocated'); setError(''); setBalanceOpen(true); }}>برداشت</Button></div>
    </Card>

    <Card className="monthly-savings-target" variant="borderless"><div><CalendarDays size={20}/><div><span>هدف پس‌انداز {month.label}</span><strong>{portfolio?.monthKey === monthKey ? money(portfolio.monthlyTargetAmount) : 'هنوز ثبت نشده'}</strong></div></div><Button onClick={() => { setMonthlyTarget(portfolio?.monthKey === monthKey ? portfolio.monthlyTargetAmount : null); setError(''); setMonthlyTargetOpen(true); }}>{portfolio?.monthKey === monthKey ? 'ویرایش' : 'ثبت هدف این ماه'}</Button></Card>

    <div className="savings-section-heading"><div><h2>هدف‌های پس‌انداز</h2><span>{portfolio?.goals.length || 0} هدف</span></div><Button icon={<Plus size={16}/>} onClick={() => openGoal()}>هدف جدید</Button></div>
    {!portfolio?.goals.length ? <Card className="savings-empty" variant="borderless"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<><strong>فعلاً همه پس‌اندازت بدون هدف است</strong><span>هر وقت خواستی بخشی از آن را برای یک هدف کنار بگذار.</span></>}><Button type="primary" onClick={() => openGoal()}>اولین هدف را بساز</Button></Empty></Card> : <div className="savings-goal-grid">{portfolio.goals.map(goal => {
      const projection = savingsGoalProjection(goal);
      const pacePercent = Math.min(100, projection.pacePercent ?? 0);
      const monthlyGap = projection.requiredMonthlyAmount ? Math.max(0, projection.requiredMonthlyAmount - (goal.monthlyContribution ?? 0)) : 0;
      return <Card key={goal.id} className={`savings-goal-card ${goal.completed ? 'completed' : ''}`} variant="borderless">
        <div className="savings-goal-top"><div className="savings-goal-icon">{goal.completed ? <Check size={20}/> : <TargetIcon/>}</div><div><strong>{goal.name}</strong>{goal.completed && <Tag>تکمیل‌شده</Tag>}</div><Button type="text" aria-label={`ویرایش ${goal.name}`} icon={<Pencil size={16}/>} onClick={() => openGoal(goal)}/></div>
        <div className="savings-goal-amount"><span>تا الان کنار گذاشته‌ای</span><strong>{money(goal.allocatedAmount)}</strong>{goal.targetAmount && <small>از {money(goal.targetAmount)}</small>}</div>
        <div className={`goal-schedule ${projection.status}`}>
          <div className="goal-schedule-title"><strong>برنامه رسیدن به هدف</strong>{projection.status === 'on-track' && <Tag color="success">طبق برنامه</Tag>}{projection.status === 'behind' && <Tag color="warning">عقب‌تر از برنامه</Tag>}</div>
          {!goal.targetAmount ? <button type="button" className="goal-schedule-setup" onClick={() => openGoal(goal)}>مبلغ نهایی هدف را مشخص کن</button>
            : !goal.targetDate ? <div className="goal-schedule-estimate"><span>{goal.monthlyContribution ? `با ماهی ${money(goal.monthlyContribution)} حدود ${formatSavingsDuration(projection.projectedMonths)} دیگر به هدف می‌رسی.` : 'مبلغ ماهانه را مشخص کن.'}</span><Button type="link" onClick={() => openGoal(goal)}>تاریخ هدف را اضافه کن</Button></div>
              : <>
                <div className="goal-schedule-metrics"><div><span>برنامه ماهانه</span><b>{money(goal.monthlyContribution ?? 0)}</b></div><div><span>لازم برای موعد</span><b>{money(projection.requiredMonthlyAmount ?? 0)}</b></div></div>
                <div className="goal-schedule-bar-label"><span>پوشش مبلغ ماهانه لازم</span><b>{new Intl.NumberFormat('fa-IR').format(projection.pacePercent ?? 0)}٪</b></div>
                <Progress percent={pacePercent} showInfo={false} status={projection.status === 'behind' || projection.status === 'no-contribution' ? 'exception' : 'normal'}/>
                <p>{projection.status === 'completed' ? 'این هدف تکمیل شده است.' : projection.status === 'on-track' ? `با این روند حدود ${formatSavingsDuration(projection.projectedMonths)} دیگر و تا ${displayJalaliDate(goal.targetDate)} به هدف می‌رسی.` : projection.status === 'overdue' ? 'تاریخ هدف گذشته؛ موعد یا مبلغ ماهانه را ویرایش کن.' : projection.status === 'no-contribution' ? `برای رسیدن تا ${displayJalaliDate(goal.targetDate)} ماهی ${money(projection.requiredMonthlyAmount ?? 0)} کنار بگذار.` : `برای رسیدن به‌موقع، ماهی ${money(monthlyGap)} بیشتر کنار بگذار.`}</p>
              </>}
        </div>
        {goal.targetDate && <small className="savings-goal-date"><CalendarDays size={13}/> موعد هدف: {displayJalaliDate(goal.targetDate)}</small>}
        <div className="savings-goal-footer"><Button size="small" onClick={() => patchGoal(goal.id, { completed: !goal.completed }, goal.completed ? 'هدف دوباره فعال شد' : 'هدف تکمیل شد')}>{goal.completed ? 'فعال‌کردن دوباره' : 'علامت تکمیل'}</Button>{goal.allocatedAmount > 0 && <Button size="small" type="text" icon={<RotateCcw size={14}/>} onClick={() => patchGoal(goal.id, { allocatedAmount: 0 }, 'مبلغ هدف به پس‌انداز بدون هدف برگشت')}>برگشت به بدون هدف</Button>}</div>
      </Card>;
    })}</div>}

    <Modal open={setupOpen} closable maskClosable={!saving} title={setupStep === 1 ? 'پس‌انداز این ماه' : 'هدف‌بندی پس‌انداز'} footer={null} onCancel={() => !saving && (portfolio ? setSetupOpen(false) : skipInitialSetup())}>
      {setupStep === 1 ? <Form layout="vertical" onFinish={() => setupAmount && setupAmount > 0 ? (setError(''), setSetupStep(2)) : setError('مبلغ پس‌انداز این ماه را وارد کن.')}><p className="savings-modal-lead">این ماه چقدر می‌خوای پس‌انداز کنی؟</p><Form.Item label="مبلغ پس‌انداز"><InputNumber className="ant-money-input" autoFocus min={1} precision={0} value={setupAmount} onChange={setSetupAmount} addonAfter="تومان"/></Form.Item>{error && <Alert type="error" showIcon message={error}/>}<Button block type="primary" htmlType="submit">ادامه</Button><Button block type="text" loading={saving} onClick={skipInitialSetup}>فعلاً بعداً</Button></Form> : <div className="savings-choice-step"><Vault size={38}/><h3>می‌خوای پس‌اندازت رو برای هدف‌های مختلف دسته‌بندی کنی؟</h3><p>این مرحله اختیاری است و هر زمان بخواهی می‌توانی هدف بسازی.</p>{error && <Alert type="error" showIcon message={error}/>}<Button block type="primary" loading={saving} onClick={() => finishInitialSetup(true)}>بله، هدف‌بندی کنم</Button><Button block loading={saving} onClick={() => finishInitialSetup(false)}>فعلاً نه</Button></div>}
    </Modal>

    <Modal open={goalOpen} title={editingGoal ? 'ویرایش هدف' : 'هدف جدید'} footer={null} onCancel={() => !saving && setGoalOpen(false)} destroyOnHidden>
      <Form layout="vertical" onFinish={saveGoal}><div className="savings-presets">{presets.map(name => <Button key={name} size="small" className={goalName === name ? 'selected' : ''} onClick={() => setGoalName(name)}>{name}</Button>)}</div><Form.Item label="نام هدف"><Input autoFocus value={goalName} onChange={event => setGoalName(event.target.value)} placeholder="مثلاً سفر ژاپن"/></Form.Item><Form.Item label="موجودی فعلی این هدف"><InputNumber className="ant-money-input" min={0} max={(editingGoal?.allocatedAmount || 0) + unallocated} precision={0} value={goalAllocation} onChange={setGoalAllocation} addonAfter="تومان"/></Form.Item><Form.Item label="مبلغی که هر ماه کنار می‌گذاری"><InputNumber className="ant-money-input" min={0} precision={0} value={goalMonthlyContribution} onChange={setGoalMonthlyContribution} addonAfter="تومان"/></Form.Item><Form.Item label="مبلغ نهایی موردنیاز (اختیاری)"><InputNumber className="ant-money-input" min={1} precision={0} value={goalTarget} onChange={setGoalTarget} addonAfter="تومان"/></Form.Item><Form.Item label="تاریخ هدف (اختیاری)"><JalaliDatePicker value={goalDate} onChange={setGoalDate}/></Form.Item>{error && <Alert type="error" showIcon message={error}/>}<div className="ant-modal-actions">{editingGoal && <Button danger icon={<Trash2 size={15}/>} onClick={() => deleteGoal(editingGoal)}>حذف هدف</Button>}<span className="modal-action-spacer"/><Button onClick={() => setGoalOpen(false)}>انصراف</Button><Button type="primary" htmlType="submit" loading={saving}>ذخیره هدف</Button></div></Form>
    </Modal>

    <Modal open={balanceOpen} title={balanceMode === 'add' ? 'افزایش پس‌انداز' : 'برداشت از پس‌انداز'} footer={null} onCancel={() => !saving && setBalanceOpen(false)} destroyOnHidden><Form layout="vertical" onFinish={saveBalanceChange}><Segmented block value={balanceMode} onChange={value => { setBalanceMode(value as 'add' | 'withdraw'); setBalanceBucket('unallocated'); setError(''); }} options={[{value:'add',label:'افزایش موجودی'},{value:'withdraw',label:'برداشت'}]}/><Form.Item label="مبلغ"><InputNumber autoFocus className="ant-money-input" min={1} precision={0} value={balanceAmount} onChange={setBalanceAmount} addonAfter="تومان"/></Form.Item><Form.Item label={balanceMode === 'add' ? 'به کدام بخش اضافه شود؟' : 'از کدام بخش کم شود؟'}><Select value={balanceBucket} onChange={setBalanceBucket} options={bucketOptions}/></Form.Item>{error && <Alert type="error" showIcon message={error}/>}<div className="ant-modal-actions"><Button onClick={() => setBalanceOpen(false)}>انصراف</Button><Button type="primary" htmlType="submit" loading={saving}>{balanceMode === 'add' ? 'افزودن' : 'ثبت برداشت'}</Button></div></Form></Modal>

    <Modal open={transferOpen} title="جابه‌جایی بین هدف‌ها" footer={null} onCancel={() => !saving && setTransferOpen(false)} destroyOnHidden><Form layout="vertical" onFinish={saveTransfer}><Alert type="info" showIcon message="جابه‌جایی فقط تقسیم‌بندی را تغییر می‌دهد؛ کل پس‌انداز ثابت می‌ماند."/><Form.Item label="از"><Select value={transferFrom} onChange={setTransferFrom} options={bucketOptions}/></Form.Item><Form.Item label="به"><Select value={transferTo || undefined} onChange={setTransferTo} options={bucketOptions.filter(option => option.value !== transferFrom)} placeholder="مقصد را انتخاب کن"/></Form.Item><Form.Item label="مبلغ"><InputNumber className="ant-money-input" min={1} precision={0} value={transferAmount} onChange={setTransferAmount} addonAfter="تومان"/></Form.Item>{error && <Alert type="error" showIcon message={error}/>}<div className="ant-modal-actions"><Button onClick={() => setTransferOpen(false)}>انصراف</Button><Button type="primary" htmlType="submit" loading={saving}>جابه‌جایی مبلغ</Button></div></Form></Modal>

    <Modal open={monthlyTargetOpen} title={`هدف پس‌انداز ${month.label}`} footer={null} onCancel={() => !saving && setMonthlyTargetOpen(false)} destroyOnHidden><Form layout="vertical" onFinish={saveMonthlyTarget}><p className="savings-modal-lead">این ماه چقدر می‌خوای پس‌انداز کنی؟</p><Form.Item label="هدف این ماه"><InputNumber autoFocus className="ant-money-input" min={0} precision={0} value={monthlyTarget} onChange={setMonthlyTarget} addonAfter="تومان"/></Form.Item><Alert type="info" showIcon message="این عدد هدف ماهانه است؛ موجودی واقعی فقط با افزایش یا برداشت تغییر می‌کند."/>{error && <Alert type="error" showIcon message={error}/>}<div className="ant-modal-actions"><Button onClick={() => setMonthlyTargetOpen(false)}>انصراف</Button><Button type="primary" htmlType="submit" loading={saving}>ذخیره هدف ماه</Button></div></Form></Modal>
  </section>;
}

function TargetIcon() {
  return <span aria-hidden="true">◎</span>;
}
