import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, BarChart3, Bell, Check, ChevronDown,
  CircleDollarSign, CreditCard, LayoutDashboard, MoreHorizontal, Pencil,
  Plus, ReceiptText, Search, Settings, SlidersHorizontal, Target, Trash2,
  Utensils, CarFront, House, ShoppingBag, HeartPulse, Gamepad2, WalletCards,
  X, LogOut, Tags, Moon, ShieldCheck, UserRound,
  LockKeyhole, Mail, Sparkles, CalendarDays, Repeat2,
  ChevronLeft, ChevronRight, TrendingUp, Wrench, Loader2, RefreshCw,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  Alert, Avatar, Button, Card, Checkbox, ConfigProvider, Empty, Form, Input, InputNumber,
  List, Modal, Result, Segmented, Select, Spin, Switch, Tabs,
} from 'antd';
import { getCurrentUser, signInWithEmail, signInWithGoogle, signOut, signUpWithEmail, type User } from './auth';
import { enablePushNotifications, listenForForegroundNotifications, notificationPermission } from './firebaseMessaging';
import { categoryEmoji } from './categoryEmoji';
import { jalaaliMonthLength, toJalaali } from 'jalaali-js';
import { defaultDevSettings, devSettingsStorageKey, interpolateDevText, normalizeDevSettings, type DevSettings } from './devSettings';
import { budgetsFromFinancialSetup, calculateSavingsAmount, calculateSpendableAmount, millisecondsUntilReminder, normalizeFinancialSetup, setupStorageKey, type FinancialSetup } from './financialSetup';
import {
  displayJalaliDate, elapsedDaysInMonth, isInJalaliMonth, jalaliDateKey, jalaliMonthNames, jalaliToDate,
  monthFromOffset, parseJalaliDate, recentJalaliMonths, todayJalali, toPersianDigits, type JalaliMonth,
} from './dateUtils';
import { materializeRecurringTransactions, normalizeTransactions, type Recurrence, type Transaction, type TxType } from './transactions';
import {
  deleteCloudTransaction, loadCloudUserData, saveCloudAppSettings, saveCloudBudgets, saveCloudFinancialSetup,
  saveCloudProfile, saveCloudTransaction, saveNotificationDevice, type CloudUserData,
} from './database';
import { migrateLocalStorageToApi } from './localMigration';
import { persistThenCommit } from './cloudMutation';

const Onboarding = lazy(() => import('./Onboarding'));
const DevPanel = lazy(() => import('./DevPanel'));
const DesignReviewPanel = lazy(() => import('./DesignReviewPanel'));

type Page = 'dashboard' | 'transactions' | 'reports' | 'budgets' | 'settings' | 'profile' | 'dev';
type Category = { name: string; color: string; icon: string };
type BudgetMap = Record<string, number>;
type WeeklyBudgetStore = Record<string, BudgetMap>;
type UserProfile = { name: string; email: string; avatarUrl: string };

const categories: Category[] = [
  { name: 'خوراک', color: '#DF7899', icon: 'food' },
  { name: 'حمل‌ونقل', color: '#707070', icon: 'car' },
  { name: 'مسکن', color: '#F2A9C0', icon: 'home' },
  { name: 'خرید', color: '#BE5275', icon: 'shop' },
  { name: 'درمان', color: '#171717', icon: 'health' },
  { name: 'سرگرمی', color: '#FBE4EC', icon: 'fun' },
  { name: 'حقوق', color: '#DF7899', icon: 'wallet' },
  { name: 'سایر', color: '#707070', icon: 'other' },
];

const visualCategoryColors = ['#DF7899', '#707070', '#F2A9C0', '#BE5275', '#171717', '#FBE4EC'];

const initialTransactions: Transaction[] = [];

const initialBudgets: BudgetMap = {
  'خوراک': 0, 'حمل‌ونقل': 0, 'مسکن': 0,
  'خرید': 0, 'درمان': 0, 'سرگرمی': 0,
};
const initialWeeklyBudgets: WeeklyBudgetStore = {};
const profileStorageKey = (userKey: string) => `gav-profile-v1:${userKey}`;

const formatMoney = (value: number) => `${new Intl.NumberFormat('fa-IR').format(value)} تومان`;
const compactMoney = (value: number) => `${new Intl.NumberFormat('fa-IR', { notation: 'compact', maximumFractionDigits: 1 }).format(value)} تومان`;
const budgetCardMoney = (value: number) => {
  if (value >= 1_000_000) return `${new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 }).format(value / 1_000_000)}م`;
  if (value >= 1_000) return `${new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(value / 1_000)}هزار`;
  return new Intl.NumberFormat('fa-IR').format(value);
};
function transactionDate(value: string) {
  return jalaliToDate(value);
}

function weekRange(offset = 0) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const distanceFromSaturday = (today.getDay() + 1) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - distanceFromSaturday + offset * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  const formatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long' });
  return { start, end, key, label: `${formatter.format(start)} تا ${formatter.format(end)}` };
}

function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; }
  });
  const previousKey = useRef(key);
  useEffect(() => {
    if (previousKey.current !== key) {
      previousKey.current = key;
      try { setValue(JSON.parse(localStorage.getItem(key) || '') as T); }
      catch { setValue(fallback); }
      return;
    }
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value, fallback]);
  return [value, setValue] as const;
}

function CategoryIcon({ category, size = 18 }: { category: string; size?: number }) {
  const props = { size, strokeWidth: 1.8 };
  if (category === 'خوراک') return <Utensils {...props} />;
  if (category === 'حمل‌ونقل') return <CarFront {...props} />;
  if (category === 'مسکن') return <House {...props} />;
  if (category === 'خرید' || category === 'خرید شخصی') return <ShoppingBag {...props} />;
  if (category === 'درمان' || category === 'سلامت') return <HeartPulse {...props} />;
  if (category === 'سرگرمی' || category === 'تفریح') return <Gamepad2 {...props} />;
  if (category === 'پس‌انداز') return <Target {...props} />;
  if (category === 'حقوق') return <WalletCards {...props} />;
  return <CircleDollarSign {...props} />;
}

function BrandMark() {
  return <div className="brand-mark"><img src="/gav-logo.png" alt="لوگوی گاو" /></div>;
}

const navItems: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'نمای کلی', icon: LayoutDashboard },
  { id: 'transactions', label: 'تراکنش‌ها', icon: ReceiptText },
  { id: 'reports', label: 'گزارش‌ها', icon: BarChart3 },
  { id: 'budgets', label: 'بودجه‌بندی', icon: Target },
  { id: 'settings', label: 'تنظیمات', icon: Settings },
];
const mobileNavItems: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  ...navItems.slice(0, 4),
  { id: 'profile', label: 'پروفایل', icon: UserRound },
];

const avatarOptions = [
  '/avatars/cow-01.png', '/avatars/cow-02.png', '/avatars/cow-03.png',
  '/avatars/cow-04.png', '/avatars/cow-05.png',
];
const emptyProfile: UserProfile = { name: 'کاربر گاو', email: '', avatarUrl: avatarOptions[0] };

const onboardingSlides = [
  { image: '/avatars/cow-02.png', icon: WalletCards, kicker: 'همه‌چیز زیر کنترل', title: 'پولت را ساده‌تر مدیریت کن', description: 'درآمد و هزینه‌هایت را سریع ثبت کن و همیشه تصویر روشنی از مانده‌ی حسابت داشته باش.' },
  { image: '/avatars/cow-04.png', icon: Target, kicker: 'خرج‌کردن هوشمند', title: 'برای هر دسته سقف داشته باش', description: 'بودجه‌ی ماهانه تعیین کن و گاو خودش می‌گوید هر هفته چقدر اجازه‌ی خرج‌کردن داری.' },
  { image: '/avatars/cow-03.png', icon: BarChart3, kicker: 'تصمیم بهتر', title: 'الگوی مالی‌ات را بشناس', description: 'گزارش‌ها و هشدارهای به‌موقع کمکت می‌کنند قبل از عبور از بودجه تصمیم بگیری.' },
];

export default function App() {
  const isDesignReviewRoute = window.location.pathname.replace(/\/+$/, '') === '/dev/review';
  const [onboardingComplete, setOnboardingComplete] = useStoredState<boolean>('gav-onboarding-complete-v1', false);
  const [activeUserKey, setActiveUserKey] = useStoredState<string>('gav-active-user', 'local-user');
  const [page, setPage] = useState<Page>('dashboard');
  const [transactions, setTransactions] = useStoredState<Transaction[]>(`gav-transactions-v2:${activeUserKey}`, initialTransactions);
  const [budgets, setBudgets] = useStoredState<BudgetMap>(`gav-budgets-v3:${activeUserKey}`, initialBudgets);
  const [profile, setProfile] = useStoredState<UserProfile>(profileStorageKey(activeUserKey), emptyProfile);
  const [weeklyBudgets, setWeeklyBudgets] = useStoredState<WeeklyBudgetStore>(`gav-weekly-budgets-v1:${activeUserKey}`, initialWeeklyBudgets);
  const [financialSetup, setFinancialSetup] = useStoredState<FinancialSetup | null>(setupStorageKey(activeUserKey), null);
  const [devSettings, setDevSettings] = useStoredState<DevSettings>(devSettingsStorageKey, defaultDevSettings);
  const [editingSetup, setEditingSetup] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newTransactionDate, setNewTransactionDate] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [selectedMonthOffset, setSelectedMonthOffset] = useState(0);
  const [showDailyCalendar, setShowDailyCalendar] = useState(false);
  const [selectedDailyDate, setSelectedDailyDate] = useState(() => {
    const today = todayJalali();
    return jalaliDateKey(today.year, today.month, today.day);
  });
  const [toast, setToast] = useState('');
  const [authStatus, setAuthStatus] = useState<'loading' | 'authenticated' | 'unauthenticated' | 'error'>('loading');
  const [dataStatus, setDataStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [authError, setAuthError] = useState('');
  const [dataError, setDataError] = useState('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [databaseRole, setDatabaseRole] = useState<'user' | 'admin'>('user');
  const hydratedUserRef = useRef('');
  const activeFinancialSetup = normalizeFinancialSetup(financialSetup);
  const canAccessDevPanel = databaseRole === 'admin';

  useEffect(() => {
    document.documentElement.style.setProperty('--brand-accent', devSettings.accentColor || defaultDevSettings.accentColor);
  }, [devSettings.accentColor]);

  useEffect(() => {
    const normalized = normalizeDevSettings(devSettings);
    if (JSON.stringify(normalized) !== JSON.stringify(devSettings)) {
      setDevSettings(normalized);
      return;
    }
    if (['#f06f9b', '#d96f8a'].includes(normalized.accentColor.toLowerCase())) {
      setDevSettings(current => ({ ...normalizeDevSettings(current), accentColor: '#DF7899' }));
    }
  }, [devSettings.accentColor, setDevSettings]);

  useEffect(() => {
    if (page === 'dev' && !canAccessDevPanel) setPage('dashboard');
  }, [page, canAccessDevPanel]);

  useEffect(() => {
    if (profile.email || !activeUserKey.startsWith('email:')) return;
    const email = activeUserKey.slice(6);
    const resolvedName = profile.name.trim() && profile.name !== 'کاربر گاو' ? profile.name.trim() : email;
    setProfile({ name: resolvedName || 'کاربر گاو', email, avatarUrl: localStorage.getItem(`gav-avatar:${activeUserKey}`)?.replace(/^"|"$/g, '') || avatarOptions[0] });
  }, [activeUserKey, profile.email, profile.name, setProfile]);

  useEffect(() => {
    if (financialSetup && activeFinancialSetup && financialSetup.version !== 4) setFinancialSetup(activeFinancialSetup);
  }, [financialSetup, activeFinancialSetup, setFinancialSetup]);

  useEffect(() => {
    const normalized = materializeRecurringTransactions(normalizeTransactions(transactions));
    if (JSON.stringify(normalized) !== JSON.stringify(transactions)) {
      const previousIds = new Set(transactions.map(transaction => String(transaction.id)));
      const generated = normalized.filter(transaction => !previousIds.has(transaction.id));
      setTransactions(normalized);
      if (currentUser && dataStatus === 'ready' && generated.length) {
        Promise.all(generated.map(transaction => saveCloudTransaction(currentUser.id, transaction))).catch(error => setDataError(error instanceof Error ? error.message : 'ذخیره تراکنش تکرارشونده انجام نشد.'));
      }
    }
  }, [transactions, setTransactions, currentUser, dataStatus]);

  const applyCloudData = (userId: string, cloud: CloudUserData) => {
    localStorage.setItem(profileStorageKey(userId), JSON.stringify(cloud.profile));
    localStorage.setItem(`gav-transactions-v2:${userId}`, JSON.stringify(cloud.transactions));
    localStorage.setItem(`gav-budgets-v3:${userId}`, JSON.stringify(cloud.budgets));
    localStorage.setItem(`gav-weekly-budgets-v1:${userId}`, JSON.stringify(cloud.weeklyBudgets));
    localStorage.setItem(setupStorageKey(userId), JSON.stringify(cloud.financialSetup));
    setProfile(cloud.profile);
    setTransactions(cloud.transactions);
    setBudgets(cloud.budgets);
    setWeeklyBudgets(cloud.weeklyBudgets);
    setFinancialSetup(cloud.financialSetup);
    setDatabaseRole(cloud.role);
    if (cloud.appSettings) setDevSettings(normalizeDevSettings(cloud.appSettings));
  };

  const hydrateCloudUser = async (user: User) => {
    hydratedUserRef.current = user.id;
    setDataStatus('loading');
    setDataError('');
    setActiveUserKey(user.id);
    try {
      await migrateLocalStorageToApi(localStorage, user.id, user.email);
      const cloud = await loadCloudUserData(user);
      applyCloudData(user.id, cloud);
      hydratedUserRef.current = user.id;
      setDataStatus('ready');
    } catch (error) {
      hydratedUserRef.current = '';
      setDataError(error instanceof Error ? error.message : 'دریافت اطلاعات حساب انجام نشد.');
      setDataStatus('error');
      throw error;
    }
  };

  const retrySession = async () => {
    setAuthStatus('loading');
    setAuthError('');
    try {
      const user = await getCurrentUser();
      if (!user) {
        hydratedUserRef.current = '';
        setCurrentUser(null);
        setAuthStatus('unauthenticated');
        setDataStatus('idle');
        return;
      }
      setCurrentUser(user);
      setAuthStatus('authenticated');
      hydratedUserRef.current = '';
      await hydrateCloudUser(user);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'بررسی نشست کاربر انجام نشد.');
      setAuthStatus('error');
    }
  };

  useEffect(() => {
    let active = true;
    const sessionExpired = () => {
      hydratedUserRef.current = '';
      setCurrentUser(null);
      setDatabaseRole('user');
      setDataStatus('idle');
      setAuthStatus('unauthenticated');
    };
    window.addEventListener('gav:session-expired', sessionExpired);
    getCurrentUser().then(async user => {
      if (!active) return;
      if (!user) {
        setCurrentUser(null);
        setAuthStatus('unauthenticated');
        setDataStatus('idle');
        return;
      }
      setCurrentUser(user);
      setAuthStatus('authenticated');
      if (hydratedUserRef.current !== user.id) await hydrateCloudUser(user).catch(() => undefined);
    }).catch(error => {
      if (!active) return;
      setAuthError(error instanceof Error ? error.message : 'بررسی نشست کاربر انجام نشد.');
      setAuthStatus('error');
    });
    return () => { active = false; window.removeEventListener('gav:session-expired', sessionExpired); };
  }, []);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    let unsubscribe: () => void = () => {};
    listenForForegroundNotifications((payload) => {
      notify(payload.notification?.title || payload.data?.title || 'اعلان جدید دریافت شد');
    }).then(fn => { unsubscribe = fn; });
    return () => unsubscribe();
  }, [authStatus]);

  const selectedMonth = monthFromOffset(selectedMonthOffset);
  const openDailyCalendar = () => {
    const today = todayJalali();
    const day = selectedMonth.year === today.year && selectedMonth.month === today.month ? today.day : 1;
    setSelectedDailyDate(jalaliDateKey(selectedMonth.year, selectedMonth.month, day));
    setShowDailyCalendar(true);
  };
  const openNewTransaction = (date?: string) => {
    setEditingTransaction(null);
    setNewTransactionDate(date || null);
    setShowAdd(true);
  };
  const selectedTransactions = transactions.filter(transaction => isInJalaliMonth(transaction.date, selectedMonth));
  const totalIncome = selectedTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = selectedTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const totalSavings = selectedTransactions.filter(t => t.type === 'savings').reduce((s, t) => s + t.amount, 0);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2400);
  };

  useEffect(() => {
    if (authStatus !== 'authenticated' || !activeFinancialSetup?.reminder.enabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    let timeoutId: number;
    const schedule = () => {
      const delay = millisecondsUntilReminder(activeFinancialSetup.reminder.time);
      if (delay === null) return;
      timeoutId = window.setTimeout(() => {
        new Notification('گاو', { body: 'یادت نره مخارج امروزت رو ثبت کنی.', icon: '/gav-logo.png', dir: 'rtl', lang: 'fa' });
        schedule();
      }, delay);
    };
    schedule();
    return () => window.clearTimeout(timeoutId);
  }, [authStatus, activeFinancialSetup?.reminder.enabled, activeFinancialSetup?.reminder.time]);

  const addTransaction = async (transaction: Omit<Transaction, 'id'>) => {
    if (!currentUser) return;
    const next = { ...transaction, id: crypto.randomUUID() };
    try {
      if (currentUser) await saveCloudTransaction(currentUser.id, next);
      setTransactions([next, ...transactions]);
      setShowAdd(false);
      setNewTransactionDate(null);
      notify('تراکنش با موفقیت ثبت شد');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ثبت تراکنش انجام نشد. دوباره تلاش کن.';
      notify(message);
      throw new Error(message);
    }
  };

  const updateTransaction = async (transaction: Omit<Transaction, 'id'>) => {
    if (!editingTransaction || !currentUser) return;
    const next = { ...transaction, id: editingTransaction.id };
    try {
      if (currentUser) await saveCloudTransaction(currentUser.id, next);
      setTransactions(transactions.map(item => item.id === editingTransaction.id ? next : item));
      setEditingTransaction(null);
      notify('تراکنش با موفقیت ویرایش شد');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ویرایش تراکنش انجام نشد.';
      notify(message);
      throw new Error(message);
    }
  };

  const withTheme = (content: React.ReactNode) => <ConfigProvider theme={{ token: { colorPrimary: devSettings.accentColor || defaultDevSettings.accentColor } }}>{content}</ConfigProvider>;
  const lazyFallback = <div className="lazy-page-fallback"><Spin size="large" tip="در حال آماده‌سازی…"><span /></Spin></div>;

  if (!isDesignReviewRoute && !onboardingComplete && devSettings.showIntroOnboarding) return withTheme(<IntroOnboarding onComplete={() => setOnboardingComplete(true)} />);
  if (authStatus === 'loading') return <FullPageState title="در حال بررسی حساب" description="نشست امن شما در حال بازیابی است." loading/>;
  if (authStatus === 'error') return <FullPageState title="اتصال حساب انجام نشد" description={authError} actionLabel="تلاش دوباره" onAction={retrySession}/>;
  if (authStatus === 'unauthenticated') return <AuthScreen onAuthenticated={async user => {
    setCurrentUser(user);
    setAuthStatus('authenticated');
    hydratedUserRef.current = '';
    await hydrateCloudUser(user);
  }} onGoogleLogin={signInWithGoogle} settings={devSettings} />;
  if (dataStatus === 'loading' || dataStatus === 'idle') return <FullPageState title="در حال آماده‌سازی اطلاعات" description="اطلاعات مالی امن شما در حال دریافت است." loading/>;
  if (dataStatus === 'error') return <FullPageState title="دریافت اطلاعات انجام نشد" description={dataError} actionLabel="تلاش دوباره" onAction={() => currentUser && hydrateCloudUser(currentUser).catch(() => undefined)}/>;
  if (!currentUser) return <FullPageState title="نشست کاربر نامعتبر است" description="برای بازیابی نشست امن دوباره تلاش کن." actionLabel="تلاش دوباره" onAction={retrySession}/>;

  if (isDesignReviewRoute) {
    if (!currentUser || databaseRole !== 'admin') return withTheme(<main className="review-access-denied"><Result status="403" title="دسترسی محدود" subTitle="این مسیر فقط برای ادمینی فعال است که نقش او توسط دیتابیس و RLS تأیید شده باشد." extra={<Button type="primary" onClick={() => window.location.assign('/')}>بازگشت به برنامه</Button>}/></main>);
    return withTheme(<Suspense fallback={lazyFallback}><DesignReviewPanel userId={currentUser.id} onExit={() => window.location.assign('/')}/></Suspense>);
  }

  const completeSetup = async (setup: FinancialSetup) => {
    if (!currentUser) return;
    const nextBudgets = budgetsFromFinancialSetup(setup);
    try {
      if (currentUser) {
        await saveCloudFinancialSetup(currentUser.id, setup);
        await saveCloudBudgets(currentUser.id, nextBudgets, {});
      }
      setFinancialSetup(setup);
      setBudgets(nextBudgets);
      setWeeklyBudgets({});
      setEditingSetup(false);
      setPage('dashboard');
      notify('برنامه‌ی مالی شما با موفقیت ذخیره شد');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ذخیره برنامه مالی انجام نشد.';
      notify(message);
      throw new Error(message);
    }
  };

  if (!activeFinancialSetup?.onboardingCompleted || editingSetup) {
    return withTheme(<Suspense fallback={lazyFallback}><Onboarding initialSetup={activeFinancialSetup} onComplete={completeSetup} onCancel={activeFinancialSetup?.onboardingCompleted ? () => setEditingSetup(false) : undefined} /></Suspense>);
  }

  const expenseCategories: Category[] = activeFinancialSetup.categories.map((category, index) => ({ name: category.name, color: visualCategoryColors[index % visualCategoryColors.length], icon: category.icon }));
  const appCategories = [...expenseCategories, categories.find(category => category.name === 'حقوق')!];
  const visibleNavItems = canAccessDevPanel ? [...navItems, { id: 'dev' as const, label: 'پنل توسعه', icon: Wrench }] : navItems;
  const mobileHeaderTitle = page === 'dashboard'
    ? devSettings.appName
    : [...navItems, { id: 'profile' as const, label: 'پروفایل', icon: UserRound }].find(item => item.id === page)?.label || devSettings.appName;
  const removeTransaction = async (id: string) => {
    if (!currentUser) return;
    try {
      if (currentUser) await deleteCloudTransaction(currentUser.id, id);
      setTransactions(transactions.filter(transaction => transaction.id !== id));
      notify('تراکنش حذف شد');
    } catch (error) { notify(error instanceof Error ? error.message : 'حذف تراکنش انجام نشد.'); }
  };
  const updateBudgetMap = async (next: BudgetMap) => {
    await persistThenCommit(
      () => currentUser ? saveCloudBudgets(currentUser.id, next, weeklyBudgets) : Promise.resolve(),
      () => setBudgets(next),
    );
  };
  const updateWeeklyBudgetMap = async (next: WeeklyBudgetStore) => {
    await persistThenCommit(
      () => currentUser ? saveCloudBudgets(currentUser.id, budgets, next) : Promise.resolve(),
      () => setWeeklyBudgets(next),
    );
  };
  const updateProfile = async (next: UserProfile) => {
    await persistThenCommit(
      () => currentUser ? saveCloudProfile(currentUser.id, next) : Promise.resolve(),
      () => setProfile(next),
    );
  };
  const updateDevSettings = async (next: DevSettings) => {
    await persistThenCommit(
      () => currentUser && canAccessDevPanel ? saveCloudAppSettings(currentUser.id, next) : Promise.resolve(),
      () => setDevSettings(next),
    );
  };

  return withTheme(
    <div className={`app-shell page-${page}`}>
      <aside className="sidebar">
        <div className="brand"><BrandMark /><div><strong>{devSettings.appName}</strong><span>{devSettings.appTagline}</span></div></div>
        <nav>
          <p className="nav-title">منوی اصلی</p>
          {visibleNavItems.map(item => <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)}><item.icon size={20} /><span>{item.label}</span></button>)}
        </nav>
        <button className={`profile ${page === 'profile' ? 'active' : ''}`} onClick={() => setPage('profile')}><div className="avatar"><img src={profile.avatarUrl} alt="تصویر کاربر" /></div><div><strong>{profile.name}</strong><span>{profile.email || 'حساب شخصی'}</span></div><MoreHorizontal size={19} /></button>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="mobile-brand"><BrandMark /><strong>{mobileHeaderTitle}</strong></div>
          <div className="top-actions"><button className="icon-button" aria-label="اعلان‌ها"><Bell size={20} /></button><Button className="daily-calendar-button" aria-label="تقویم روزانه" icon={<CalendarDays size={17}/>} onClick={openDailyCalendar}><span>تقویم روزانه</span></Button><div className="month-switcher"><button aria-label="ماه قبل" onClick={() => setSelectedMonthOffset(value => value - 1)}><ChevronRight size={17}/></button><button className="month-picker" onClick={() => setSelectedMonthOffset(0)}>{selectedMonth.label}</button><button aria-label="ماه بعد" onClick={() => setSelectedMonthOffset(value => value + 1)} disabled={selectedMonthOffset >= 0}><ChevronLeft size={17}/></button></div></div>
        </header>

        <div className="content">
          {page === 'dashboard' && <Dashboard settings={devSettings} profile={profile} month={selectedMonth} plan={activeFinancialSetup} categoryOptions={appCategories} transactions={selectedTransactions} income={totalIncome} expense={totalExpense} savings={totalSavings} setPage={setPage} openAdd={() => openNewTransaction()} />}
          {page === 'transactions' && <Transactions month={selectedMonth} categoryOptions={appCategories} transactions={transactions} onEdit={(transaction) => { setShowAdd(false); setNewTransactionDate(null); setEditingTransaction(transaction); }} onDelete={removeTransaction} openAdd={() => openNewTransaction()} />}
          {page === 'reports' && <Reports month={selectedMonth} plan={activeFinancialSetup} categoryOptions={appCategories} transactions={transactions} income={totalIncome} expense={totalExpense} savings={totalSavings} />}
          {page === 'budgets' && <Budgets month={selectedMonth} categoryOptions={expenseCategories} transactions={transactions} budgets={budgets} setBudgets={updateBudgetMap} weeklyBudgets={weeklyBudgets} setWeeklyBudgets={updateWeeklyBudgetMap} notify={notify} />}
          {page === 'settings' && <SettingsPage userId={currentUser.id} cloudEnabled financialSetup={activeFinancialSetup} onEditFinancialSetup={() => setEditingSetup(true)} notify={notify} />}
          {page === 'profile' && <ProfilePage profile={profile} setProfile={updateProfile} notify={notify} onLogout={async () => {
            try {
              await signOut();
              hydratedUserRef.current = '';
              setCurrentUser(null);
              setDatabaseRole('user');
              setDataStatus('idle');
              setAuthStatus('unauthenticated');
            } catch (error) { notify(error instanceof Error ? error.message : 'خروج انجام نشد.'); }
          }} />}
          {page === 'dev' && canAccessDevPanel && <Suspense fallback={lazyFallback}><DevPanel settings={devSettings} setSettings={updateDevSettings} isLocalDevelopment={import.meta.env.DEV} notify={notify}/></Suspense>}
        </div>

        {!['profile', 'settings', 'budgets', 'dev'].includes(page) && <button className="fab" onClick={() => openNewTransaction()}><Plus size={24} /><span>ثبت تراکنش</span></button>}
        <nav className="mobile-nav">{mobileNavItems.map(item => <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => setPage(item.id)}><item.icon size={21} /><span>{item.label}</span></button>)}</nav>
      </main>

      {(showAdd || editingTransaction) && <TransactionModal initialTransaction={editingTransaction} initialDate={newTransactionDate} categoryOptions={expenseCategories} onClose={() => { setShowAdd(false); setNewTransactionDate(null); setEditingTransaction(null); }} onSubmit={editingTransaction ? updateTransaction : addTransaction} />}
      <DailyExpenseModal open={showDailyCalendar} date={selectedDailyDate} setDate={setSelectedDailyDate} categoryOptions={expenseCategories} transactions={transactions} onAddForDate={openNewTransaction} onClose={() => setShowDailyCalendar(false)}/>
      {toast && <div className="toast"><Check size={18} />{toast}</div>}
    </div>
  );
}

function FullPageState({ title, description, loading, actionLabel, onAction }: { title: string; description: string; loading?: boolean; actionLabel?: string; onAction?: () => void }) {
  return <main className="system-state-page" dir="rtl"><Card className="system-state-card ant-system-state"><BrandMark/>{loading ? <Spin size="large"/> : <Result status="warning" title={title} subTitle={description} extra={actionLabel && onAction ? <Button type="primary" icon={<RefreshCw size={17}/>} onClick={onAction}>{actionLabel}</Button> : undefined}/>} {loading && <><h1>{title}</h1><p>{description}</p></>}</Card></main>;
}

function IntroOnboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const slide = onboardingSlides[step];
  const SlideIcon = slide.icon;
  const isLast = step === onboardingSlides.length - 1;

  return <main className="intro-onboarding-page">
    <header className="intro-onboarding-top"><div className="intro-onboarding-brand"><BrandMark/><strong>گاو</strong></div><button onClick={onComplete}>رد کردن</button></header>
    <section className="intro-onboarding-card">
      <div className="intro-onboarding-visual"><div className="intro-onboarding-orbit orbit-one"/><div className="intro-onboarding-orbit orbit-two"/><img src={slide.image} alt="آواتار گاو"/><span><SlideIcon size={24}/></span></div>
      <div className="intro-onboarding-copy" key={step}><span>{slide.kicker}</span><h1>{slide.title}</h1><p>{slide.description}</p></div>
      <div className="intro-onboarding-dots">{onboardingSlides.map((_, index) => <button key={index} aria-label={`مرحله ${index + 1}`} className={index === step ? 'active' : ''} onClick={() => setStep(index)}/>)}</div>
      <div className="intro-onboarding-actions">{step > 0 && <button className="intro-onboarding-back" onClick={() => setStep(step - 1)}>قبلی</button>}<button className="intro-onboarding-next" onClick={() => isLast ? onComplete() : setStep(step + 1)}>{isLast ? 'شروع مدیریت مالی' : 'ادامه'}<span>←</span></button></div>
    </section>
    <p className="intro-onboarding-footnote">اطلاعات مالی تو فقط متعلق به خودت است.</p>
  </main>;
}

function AuthScreen({ onAuthenticated, onGoogleLogin, settings }: { onAuthenticated: (user: User) => Promise<void>; onGoogleLogin: () => Promise<void>; settings: DevSettings }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === 'signup' && name.trim().length < 2) return setError('نام و نام خانوادگی را وارد کن.');
    if (!email.includes('@')) return setError('یک ایمیل معتبر وارد کن.');
    if (password.length < 8) return setError('رمز عبور باید حداقل ۸ کاراکتر باشد.');
    setError('');
    setSubmitting(true);
    try {
      const user = mode === 'signup'
        ? await signUpWithEmail(email, password, name)
        : await signInWithEmail(email, password);
      await onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ارتباط با سرویس ورود انجام نشد. دوباره تلاش کن.');
    } finally { setSubmitting(false); }
  };

  const switchMode = (next: 'login' | 'signup') => {
    setMode(next);
    setError('');
  };

  const googleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await onGoogleLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ورود با گوگل انجام نشد. دوباره تلاش کن.');
      setGoogleLoading(false);
    }
  };

  return <main className={`auth-page ${settings.showAuthShowcase ? '' : 'auth-page-form-only'}`}>
    {settings.showAuthShowcase && <section className="auth-showcase">
      <div className="auth-brand"><BrandMark /><div><strong>{settings.appName}</strong><span>{settings.appTagline}</span></div></div>
      <div className="auth-pitch"><div className="auth-badge"><Sparkles size={15}/> {settings.authKicker}</div><h1>{settings.authTitle}<br/><em>{settings.authHighlight}</em></h1><p>{settings.authDescription}</p></div>
      <p className="auth-quote">{settings.authQuote}</p>
    </section>}
    <section className="auth-form-side">
      <div className="auth-mobile-brand"><BrandMark /><strong>{settings.appName}</strong></div>
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-heading"><span>{mode === 'login' ? 'خوش برگشتی!' : 'شروع یک مسیر تازه'}</span><h2>{mode === 'login' ? 'ورود به حساب کاربری' : 'ساخت حساب کاربری'}</h2><p>{mode === 'login' ? 'اطلاعاتت را وارد کن تا به داشبورد برگردی.' : 'کمتر از یک دقیقه تا مدیریت بهتر پول‌هایت فاصله داری.'}</p></div>
        <Segmented className="auth-tabs-ant" block value={mode} options={[{ label: 'ورود', value: 'login' }, { label: 'ثبت‌نام', value: 'signup' }]} onChange={value => switchMode(value as 'login' | 'signup')}/>
        {mode === 'signup' && <label className="auth-field">نام و نام خانوادگی<Input className="auth-ant-input" prefix={<CircleDollarSign size={18}/>} value={name} onChange={e => setName(e.target.value)} placeholder="مثلاً هدیه شفاعی" autoComplete="name"/></label>}
        <label className="auth-field">ایمیل<Input className="auth-ant-input ltr-input" prefix={<Mail size={18}/>} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="email"/></label>
        <label className="auth-field">رمز عبور<Input.Password className="auth-ant-input ltr-input" prefix={<LockKeyhole size={18}/>} value={password} onChange={e => setPassword(e.target.value)} placeholder="حداقل ۸ کاراکتر" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}/></label>
        {mode === 'login' && <div className="auth-options"><Checkbox defaultChecked>مرا به خاطر بسپار</Checkbox></div>}
        {error && <Alert className="auth-ant-alert" type="error" showIcon message={error}/>}
        <Button className="auth-submit" type="primary" htmlType="submit" loading={submitting}>{mode === 'login' ? 'ورود به گاو' : 'ساخت حساب و شروع'}{!submitting && <span>←</span>}</Button>
        <div className="auth-divider"><span>یا ادامه با</span></div>
        <Button className="google-button" onClick={googleLogin} loading={googleLoading}><span className="google-mark">G</span> ادامه با حساب گوگل</Button>
        <p className="auth-legal">با ادامه دادن، <button type="button">قوانین استفاده</button> و <button type="button">حریم خصوصی</button> را می‌پذیری.</p>
      </form>
    </section>
  </main>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function Dashboard({ settings, profile, month, plan, categoryOptions, transactions, income, expense, savings, setPage, openAdd }: { settings: DevSettings; profile: UserProfile; month: JalaliMonth; plan: FinancialSetup; categoryOptions: Category[]; transactions: Transaction[]; income: number; expense: number; savings: number; setPage: (p: Page) => void; openAdd: () => void }) {
  const expenses = transactions.filter(t => t.type === 'expense');
  const savingsTarget = calculateSavingsAmount(plan.monthlyIncome, plan.savingsPercentBps);
  const spendableAmount = calculateSpendableAmount(plan.monthlyIncome, plan.savingsPercentBps);
  const byCategory = categoryOptions.filter(c => c.name !== 'حقوق').map(c => ({ ...c, value: expenses.filter(t => t.category === c.name).reduce((s, t) => s + t.amount, 0) })).filter(c => c.value > 0);
  const trendDays = [1, 5, 10, 15, 20, 25, month.length].filter((day, index, items) => items.indexOf(day) === index);
  const trendData = trendDays.map((day, index, days) => ({
    day: new Intl.NumberFormat('fa-IR').format(day),
    value: Math.round(expenses.filter(t => {
      const parsedDay = Number(t.date.split('/').at(-1)?.replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))));
      const nextDay = days[index + 1] ?? 32;
      return parsedDay >= day && parsedDay < nextDay;
    }).reduce((sum, t) => sum + t.amount, 0) / 1000),
  }));
  const todayLabel = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  const compactCards: Array<{ label: string; value: number; type: 'income' | 'expense' | 'savings'; note: string }> = [
    { label: 'درآمد برنامه‌ریزی‌شده', value: plan.monthlyIncome, type: 'income', note: income ? `${formatMoney(income)} درآمد ثبت‌شده` : 'مبنای برنامه‌ی مالی این ماه' },
    { label: 'مجموع هزینه', value: expense, type: 'expense', note: expense ? 'هزینه ثبت‌شده در این ماه' : 'هنوز هزینه‌ای ثبت نشده' },
    { label: 'پس‌انداز هدف', value: savingsTarget, type: 'savings', note: `${new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(plan.savingsPercentBps / 100)}٪ هدف · ${formatMoney(savings)} ثبت‌شده` },
  ];
  return <>
    <PageHeader eyebrow={todayLabel} title={interpolateDevText(settings.dashboardGreeting, { name: profile.name })} description={interpolateDevText(settings.dashboardDescription, { month: month.label })} action={<Button type="primary" className="desktop-add" icon={<Plus size={19}/>} onClick={openAdd}>{settings.addTransactionLabel}</Button>} />
    <section className="stat-grid has-savings">
      {compactCards.map((card, index) => <StatCard key={card.type} {...card} className={compactCards.length % 2 === 1 && index === compactCards.length - 1 ? 'mobile-wide' : ''}/>)}
      <StatCard label="مانده قابل خرج" value={Math.max(0, spendableAmount - expense)} type="balance" note={`${Math.max(0, Math.round(((spendableAmount - expense) / Math.max(spendableAmount, 1)) * 100))}٪ از مبلغ قابل‌هزینه باقی مانده`} />
    </section>
    <section className="dashboard-grid">
      <Card className="panel trend-panel" variant="borderless"><PanelTitle title="روند هزینه‌ها" subtitle={`هزینه‌ی روزانه در ${month.label}`} action={month.label} />
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trendData}><defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#DF7899" stopOpacity={0.38}/><stop offset="100%" stopColor="#DF7899" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#E8E8E8" vertical={false}/><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#707070', fontSize: 12 }}/><YAxis hide/><Tooltip contentStyle={{ border: 'none', borderRadius: 16, boxShadow: '0 12px 40px #1717171a', direction: 'rtl' }} formatter={(v) => [`${v} هزار تومان`, 'هزینه']}/><Area type="monotone" dataKey="value" stroke="#171717" strokeWidth={2.5} fill="url(#trendFill)" dot={{ r: 3, fill: '#171717', strokeWidth: 0 }} activeDot={{ r: 6, fill: '#DF7899', strokeWidth: 3, stroke: '#fff' }}/></AreaChart></ResponsiveContainer></div>
      </Card>
      <Card className="panel category-panel" variant="borderless"><PanelTitle title="هزینه بر اساس دسته" subtitle="سهم دسته‌ها از کل هزینه" />
        <div className={`donut-row ${byCategory.length ? '' : 'empty'}`}><div className="donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={byCategory} dataKey="value" innerRadius={55} outerRadius={77} paddingAngle={3} stroke="none">{byCategory.map(c => <Cell key={c.name} fill={c.color}/>)}</Pie></PieChart></ResponsiveContainer><div className="donut-center"><strong>{compactMoney(expense).replace(' تومان','')}</strong><span>کل هزینه</span></div></div>
          <div className="legend">{byCategory.slice(0, 5).map(c => <div key={c.name}><span style={{ background: c.color }}></span><label>{c.name}</label><b>{Math.round(c.value / Math.max(expense, 1) * 100)}٪</b></div>)}{!byCategory.length && <div className="dashboard-category-empty">هنوز هزینه‌ای ثبت نشده است.</div>}</div>
        </div>
      </Card>
    </section>
    <Card className="panel transactions-panel" variant="borderless"><PanelTitle title="تراکنش‌های اخیر" subtitle="آخرین فعالیت‌های مالی شما" customAction={<Button type="link" onClick={() => setPage('transactions')}>مشاهده همه</Button>} />
      <TransactionList categoryOptions={categoryOptions} items={transactions.slice(0, 5)} />
    </Card>
  </>;
}

function StatCard({ label, value, type, note, className = '' }: { label: string; value: number; type: 'income' | 'expense' | 'savings' | 'balance'; note: string; className?: string }) {
  const Icon = type === 'income' ? ArrowDownLeft : type === 'expense' ? ArrowUpRight : type === 'savings' ? Target : CreditCard;
  return <Card className={`stat-card ${type} ${className}`} variant="borderless"><div className="stat-top"><div className="stat-icon"><Icon size={21} /></div><MoreHorizontal size={19} /></div><span>{label}</span><strong>{formatMoney(value)}</strong><small>{note}</small></Card>;
}

function PanelTitle({ title, subtitle, action, customAction }: { title: string; subtitle: string; action?: string; customAction?: React.ReactNode }) {
  return <div className="panel-title"><div><h2>{title}</h2><p>{subtitle}</p></div>{customAction || (action && <Button type="text">{action}<ChevronDown size={15}/></Button>)}</div>;
}

function TransactionList({ categoryOptions, items, onDelete, onEdit }: { categoryOptions: Category[]; items: Transaction[]; onDelete?: (id: string) => void; onEdit?: (transaction: Transaction) => void }) {
  if (!items.length) return <Empty className="transactions-ant-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description="تراکنشی پیدا نشد."/>;
  return <List className="transaction-list ant-transaction-list" dataSource={items} renderItem={t => {
    const cat = t.type === 'savings' ? { name: 'پس‌انداز', color: '#BE5275', icon: 'savings' } : categoryOptions.find(c => c.name === t.category) || categories.at(-1)!;
    return <List.Item key={t.id} actions={[
      ...(onEdit ? [<Button key="edit" type="text" aria-label={`ویرایش ${t.title}`} icon={<Pencil size={16}/>} onClick={() => onEdit(t)}/>] : []),
      ...(onDelete ? [<Button key="delete" type="text" danger aria-label={`حذف ${t.title}`} icon={<Trash2 size={16}/>} onClick={() => onDelete(t.id)}/>] : []),
    ]}>
      <List.Item.Meta avatar={<Avatar className="transaction-ant-avatar" style={{ color: cat.color, background: `${cat.color}18` }} icon={<CategoryIcon category={t.category}/>}/>} title={<span className="transaction-ant-title">{t.title}{(t.recurrence === 'monthly' || t.generatedFrom) && <small className="recurring-badge"><Repeat2 size={11}/> تکرارشونده</small>}</span>} description={`${t.category} · ${displayJalaliDate(t.date)}`}/>
      <div className={`amount ${t.type}`}><strong>{t.type === 'income' ? '+' : '−'} {formatMoney(t.amount)}</strong><span>{t.type === 'income' ? 'واریز' : t.type === 'savings' ? 'پس‌انداز' : 'پرداخت'}</span></div>
    </List.Item>;
  }}/>;
}

function Transactions({ month, categoryOptions, transactions, onDelete, onEdit, openAdd }: { month: JalaliMonth; categoryOptions: Category[]; transactions: Transaction[]; onDelete: (id: string) => void; onEdit: (transaction: Transaction) => void; openAdd: () => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'expense'>('all');
  const filtered = transactions.filter(t => isInJalaliMonth(t.date, month) && (filter === 'all' || t.type === filter) && (t.title.includes(query) || t.category.includes(query)));
  return <><PageHeader title="تراکنش‌ها" description="همه‌ی ورودی‌ها و خروجی‌های مالی‌ات را یک‌جا مدیریت کن." action={<Button type="primary" className="desktop-add" icon={<Plus size={18}/>} onClick={openAdd}>تراکنش جدید</Button>} />
    <Card className="transactions-ant-filters"><Input allowClear prefix={<Search size={17}/>} value={query} onChange={event => setQuery(event.target.value)} placeholder="جست‌وجوی تراکنش..."/><Tabs activeKey={filter} onChange={key => setFilter(key as 'all' | 'expense')} items={[{key:'all',label:'همه'},{key:'expense',label:'هزینه‌ها'}]}/></Card>
    <Card className="transactions-page ant-transactions-card" title={`${new Intl.NumberFormat('fa-IR').format(filtered.length)} تراکنش`} extra={month.label}><TransactionList categoryOptions={categoryOptions} items={filtered} onDelete={onDelete} onEdit={onEdit}/></Card>
  </>;
}

function Reports({ month, plan, categoryOptions, transactions, income, expense, savings }: { month: JalaliMonth; plan: FinancialSetup; categoryOptions: Category[]; transactions: Transaction[]; income: number; expense: number; savings: number }) {
  const monthTransactions = transactions.filter(transaction => isInJalaliMonth(transaction.date, month));
  const data = categoryOptions.filter(c => c.name !== 'حقوق').map(c => ({ ...c, value: monthTransactions.filter(t => t.type === 'expense' && t.category === c.name).reduce((s, t) => s + t.amount, 0) })).filter(c => c.value).sort((a, b) => b.value - a.value);
  const comparison = recentJalaliMonths(month).map(item => {
    const items = transactions.filter(transaction => isInJalaliMonth(transaction.date, item));
    return {
      day: jalaliMonthNames[item.month - 1],
      expense: Math.round(items.filter(transaction => transaction.type === 'expense').reduce((sum, transaction) => sum + transaction.amount, 0) / 1000),
      savings: Math.round(items.filter(transaction => transaction.type === 'savings').reduce((sum, transaction) => sum + transaction.amount, 0) / 1000),
    };
  });
  const spendableAmount = calculateSpendableAmount(plan.monthlyIncome, plan.savingsPercentBps);
  const elapsedDays = elapsedDaysInMonth(month);
  const forecast = elapsedDays > 0 ? Math.round(expense / elapsedDays * month.length) : 0;
  const topCategory = data[0];
  return <><PageHeader title="گزارش‌ها" description="الگوی خرج‌کردنت را ببین و تصمیم‌های دقیق‌تری بگیر." />
    <div className="report-summary savings-report"><div><span>درآمد ثبت‌شده</span><strong className="green">{formatMoney(income)}</strong></div><div><span>هزینه این ماه</span><strong className="red">{formatMoney(expense)}</strong></div><div><span>پس‌انداز ثبت‌شده</span><strong className="savings-value">{formatMoney(savings)}</strong></div><div><span>مانده قابل خرج</span><strong>{formatMoney(Math.max(0, spendableAmount - expense))}</strong></div></div>
    <section className="dashboard-grid report-grid"><div className="panel trend-panel"><PanelTitle title="مقایسه ماهانه و روند پس‌انداز" subtitle="هزینه و پس‌انداز در ۶ ماه اخیر" action="هزار تومان"/><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={comparison}><CartesianGrid stroke="#E8E8E8" vertical={false}/><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill:'#707070',fontSize:11}}/><YAxis hide/><Tooltip formatter={(value, name) => [`${value} هزار تومان`, name === 'savings' ? 'پس‌انداز' : 'هزینه']}/><Area type="monotone" dataKey="expense" stroke="#DF7899" strokeWidth={2.5} fill="#FBE4EC"/><Area type="monotone" dataKey="savings" stroke="#BE5275" strokeWidth={2.5} fill="#F2A9C0"/></AreaChart></ResponsiveContainer></div><div className="chart-legend"><span><i className="expense-dot"/>هزینه</span><span><i className="savings-dot"/>پس‌انداز</span></div></div>
      <div className="panel category-panel"><PanelTitle title="دسته‌های پرخرج" subtitle={`رتبه‌بندی ${month.label}`}/><div className="category-bars">{data.length ? data.slice(0, 5).map(c => <div key={c.name}><div><span>{c.name}</span><b>{formatMoney(c.value)}</b></div><div className="bar"><i style={{width:`${c.value/Math.max(data[0].value, 1)*100}%`,background:c.color}}/></div></div>) : <div className="empty-state compact"><p>هنوز هزینه‌ای برای این ماه ثبت نشده است.</p></div>}</div></div></section>
    <section className="report-insights"><div className="panel insight-card"><div className="insight-icon"><TrendingUp size={20}/></div><div><span>پیش‌بینی هزینه پایان ماه</span><strong>{formatMoney(forecast)}</strong><small>{elapsedDays ? `بر اساس ${toPersianDigits(elapsedDays)} روز ثبت‌شده از ${toPersianDigits(month.length)} روز` : 'برای ماه‌های آینده پس از ثبت هزینه محاسبه می‌شود'}</small></div></div><div className="panel insight-card"><div className="insight-icon savings"><Target size={20}/></div><div><span>بیشترین هزینه</span><strong>{topCategory ? topCategory.name : 'بدون داده'}</strong><small>{topCategory ? formatMoney(topCategory.value) : 'برای تحلیل، تراکنش هزینه ثبت کن'}</small></div></div></section>
  </>;
}

function Budgets({ month, categoryOptions, transactions, budgets, setBudgets, weeklyBudgets, setWeeklyBudgets, notify }: { month: JalaliMonth; categoryOptions: Category[]; transactions: Transaction[]; budgets: BudgetMap; setBudgets: (b: BudgetMap) => void | Promise<void>; weeklyBudgets: WeeklyBudgetStore; setWeeklyBudgets: (b: WeeklyBudgetStore) => void | Promise<void>; notify: (s: string) => void }) {
  const [period, setPeriod] = useState<'monthly' | 'weekly'>('monthly');
  const [weekOffset, setWeekOffset] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetError, setBudgetError] = useState('');
  const selectedWeek = weekRange(weekOffset);
  const selectedWeekJalaali = toJalaali(selectedWeek.start.getFullYear(), selectedWeek.start.getMonth() + 1, selectedWeek.start.getDate());
  const selectedMonthLength = jalaaliMonthLength(selectedWeekJalaali.jy, selectedWeekJalaali.jm);
  const suggestedWeeklyBudgets = Object.fromEntries(categoryOptions.map(category => [category.name, Math.round((budgets[category.name] || 0) * 7 / selectedMonthLength)]));
  const weeklyOverrides = weeklyBudgets[selectedWeek.key] || {};
  const activeBudgets = period === 'monthly' ? budgets : { ...suggestedWeeklyBudgets, ...weeklyOverrides };
  const expenseFor = (name: string) => transactions.filter(t => {
    if (t.type !== 'expense' || t.category !== name) return false;
    if (period === 'monthly') return isInJalaliMonth(t.date, month);
    const date = transactionDate(t.date);
    return Boolean(date && date >= selectedWeek.start && date <= selectedWeek.end);
  }).reduce((s,t) => s+t.amount, 0);
  const totalBudget = Object.values(activeBudgets).reduce((s,v)=>s+v,0);
  const totalSpent = Object.keys(activeBudgets).reduce((s,c)=>s+expenseFor(c),0);
  const totalRemaining = totalBudget - totalSpent;
  const totalProgress = totalBudget > 0 ? Math.round(totalSpent / totalBudget * 100) : 0;
  const save = async () => {
    if (!editing || amount === '' || Number(amount) < 0) return;
    setSavingBudget(true);
    setBudgetError('');
    try {
      if (period === 'monthly') await setBudgets({ ...budgets, [editing]: Number(amount) });
      else await setWeeklyBudgets({ ...weeklyBudgets, [selectedWeek.key]: { ...weeklyOverrides, [editing]: Number(amount) } });
      setEditing(null);
      notify(`لیمیت ${period === 'weekly' ? 'هفتگی' : 'ماهانه'} به‌روزرسانی شد`);
    } catch (error) { setBudgetError(error instanceof Error ? error.message : 'ذخیره بودجه انجام نشد. دوباره تلاش کن.'); }
    finally { setSavingBudget(false); }
  };
  const resetWeeklyOverride = async (name: string) => {
    const nextOverrides = { ...weeklyOverrides };
    delete nextOverrides[name];
    const nextStore = { ...weeklyBudgets };
    if (Object.keys(nextOverrides).length) nextStore[selectedWeek.key] = nextOverrides;
    else delete nextStore[selectedWeek.key];
    setSavingBudget(true);
    setBudgetError('');
    try {
      await setWeeklyBudgets(nextStore);
      setEditing(null);
      notify('لیمیت هفتگی به پیشنهاد ماهانه بازگشت');
    } catch (error) { setBudgetError(error instanceof Error ? error.message : 'بازنشانی بودجه انجام نشد. دوباره تلاش کن.'); }
    finally { setSavingBudget(false); }
  };
  return <><PageHeader title="بودجه‌بندی" description="برای هر دسته سقف تعیین کن و کنترل هزینه‌ها را در دست بگیر." />
    <div className="budget-hero">
      <div className="budget-hero-copy"><span>{period === 'weekly' ? 'خلاصه هفته انتخاب‌شده' : `خلاصه ${month.label}`}</span><strong>{period === 'weekly' ? selectedWeek.label : month.label}</strong></div>
      <div className="budget-summary-values">
        <div><span>{period === 'weekly' ? 'سقف هفته' : 'بودجه ماه'}</span><strong>{formatMoney(totalBudget)}</strong></div>
        <div><span>مصرف</span><strong>{formatMoney(totalSpent)}</strong></div>
        <div><span>مانده</span><strong className={totalRemaining < 0 ? 'over' : ''}>{totalRemaining < 0 ? `− ${formatMoney(Math.abs(totalRemaining))}` : formatMoney(totalRemaining)}</strong></div>
      </div>
      <div className="budget-ring" style={{'--progress':`${Math.min(100,totalProgress)*3.6}deg`} as React.CSSProperties}><div><strong>{totalProgress}٪</strong><span>{period === 'weekly' ? 'مصرف هفته' : 'مصرف ماه'}</span></div></div>
    </div>
    <div className="budget-period-controls">
      <Segmented block value={period} onChange={value => setPeriod(value as 'monthly' | 'weekly')} options={[{value:'monthly',label:'ماهانه'},{value:'weekly',label:'هفتگی'}]} aria-label="دوره بودجه"/>
      {period === 'weekly' && <div className="week-picker"><Button aria-label="هفته قبل" onClick={() => setWeekOffset(value => value - 1)}>›</Button><div><strong>{weekOffset === 0 ? 'هفته جاری' : weekOffset < 0 ? `${Math.abs(weekOffset)} هفته قبل` : `${weekOffset} هفته بعد`}</strong><span>{selectedWeek.label}</span></div><Button aria-label="هفته بعد" onClick={() => setWeekOffset(value => value + 1)}>‹</Button></div>}
    </div>
    <div className="budget-list">{Object.entries(activeBudgets).map(([name, limit]) => {
      const spent = expenseFor(name);
      const pct = limit > 0 ? Math.round(spent / limit * 100) : 0;
      const status = pct >= 100 ? 'over' : pct >= 80 ? 'near' : '';
      const cat = categoryOptions.find(category => category.name === name) || { name, color: '#707070', icon: 'other' };
      return <div className={`panel budget-item ${status}`} key={name}>
        <div className="budget-item-head">
          <div className="category-icon emoji-icon">{categoryEmoji(cat.icon, name)}</div>
          <div className="budget-card-copy">
            <strong title={name}>{name}</strong>
            {status && <small className={`limit-alert ${status}`}>{status === 'over' ? 'عبور از سقف' : 'نزدیک سقف'}</small>}
          </div>
          <button className="icon-button budget-edit-button" aria-label={`ویرایش لیمیت ${name}`} onClick={() => { setBudgetError(''); setEditing(name); setAmount(limit ? String(limit) : ''); }}><Pencil size={16}/></button>
        </div>
        <div className="budget-card-amount" title={limit > 0 ? `${formatMoney(spent)} از ${formatMoney(limit)}` : undefined}><span>{period === 'weekly' ? 'مصرف / سقف هفته' : 'مصرف / بودجه ماه'}</span><strong>{limit > 0 ? `${budgetCardMoney(spent)} / ${budgetCardMoney(limit)}` : 'بدون سقف'}</strong></div>
        <div className="budget-progress" aria-label={`${pct} درصد مصرف شده`}><i style={{ width: `${Math.min(100, pct)}%` }}/></div>
      </div>;
    })}</div>
    <Modal open={Boolean(editing)} title={`لیمیت ${period === 'weekly' ? 'هفتگی' : 'ماهانه'} ${editing || ''}`} onCancel={() => !savingBudget && setEditing(null)} footer={null} destroyOnHidden>
      {period === 'weekly' && <p className="ant-modal-description">{selectedWeek.label}</p>}
      <Form layout="vertical" onFinish={save} requiredMark={false}><Form.Item label={`سقف ${period === 'weekly' ? 'هفتگی' : 'ماهانه'} (تومان)`}><InputNumber autoFocus className="ant-money-input" min={0} precision={0} value={amount === '' ? null : Number(amount)} disabled={savingBudget} onChange={value => setAmount(value === null ? '' : String(value))}/></Form.Item>{budgetError && <Alert type="error" showIcon message={budgetError}/>}<div className="ant-modal-actions"><Button disabled={savingBudget} onClick={() => setEditing(null)}>انصراف</Button>{period === 'weekly' && editing && Object.prototype.hasOwnProperty.call(weeklyOverrides, editing) && <Button disabled={savingBudget} onClick={() => resetWeeklyOverride(editing)}>بازگشت به پیشنهاد</Button>}<Button type="primary" htmlType="submit" loading={savingBudget}>{budgetError ? 'تلاش دوباره' : 'ذخیره تغییرات'}</Button></div></Form>
    </Modal>
  </>;
}

function SettingsPage({ userId, cloudEnabled, financialSetup, onEditFinancialSetup, notify }: { userId: string; cloudEnabled: boolean; financialSetup: FinancialSetup; onEditFinancialSetup: () => void; notify: (message: string) => void }) {
  const rows = [{icon:Tags,title:'دسته‌بندی‌ها',sub:'مدیریت دسته‌های هزینه و درآمد'},{icon:Moon,title:'ظاهر برنامه',sub:'تنظیم پوسته و نمایش برنامه'},{icon:ShieldCheck,title:'حریم خصوصی و امنیت',sub:'رمز عبور و امنیت حساب'}];
  const [pushStatus, setPushStatus] = useState(notificationPermission());
  const [enablingPush, setEnablingPush] = useState(false);
  const enablePush = async () => {
    setEnablingPush(true);
    try {
      const token = await enablePushNotifications();
      if (cloudEnabled) await saveNotificationDevice(userId, token);
      setPushStatus('granted');
      notify('اعلان‌ها با موفقیت فعال شدند');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'فعال‌سازی اعلان انجام نشد');
      setPushStatus(notificationPermission());
    } finally { setEnablingPush(false); }
  };
  const savingsAmount = calculateSavingsAmount(financialSetup.monthlyIncome, financialSetup.savingsPercentBps);
  const spendableAmount = calculateSpendableAmount(financialSetup.monthlyIncome, financialSetup.savingsPercentBps);
  return <>
    <PageHeader title="تنظیمات" description="حساب و تجربه‌ی کاربری گاو را شخصی‌سازی کن."/>
    <div className="settings-layout">
      <Card className="financial-settings-card" variant="borderless"><div><CircleDollarSign size={22}/><div><strong>برنامه‌ی مالی شخصی</strong><span>درآمد {formatMoney(financialSetup.monthlyIncome)} · پس‌انداز {new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(financialSetup.savingsPercentBps / 100)}٪ ({formatMoney(savingsAmount)}) · قابل‌هزینه {formatMoney(spendableAmount)}</span></div></div><Button icon={<Pencil size={16}/>} onClick={onEditFinancialSetup}>ویرایش درآمد و بودجه</Button></Card>
      <Card className="notification-card" variant="borderless"><div className="notification-visual"><Bell size={23}/><i/></div><div><strong>اعلان‌های هوشمند</strong><span>{pushStatus === 'granted' ? 'اعلان‌های این دستگاه فعال هستند.' : 'هشدار عبور از بودجه و یادآوری‌ها را دریافت کن.'}</span></div><Button type={pushStatus === 'granted' ? 'default' : 'primary'} icon={pushStatus === 'granted' ? <Check size={17}/> : undefined} loading={enablingPush} onClick={enablePush} disabled={pushStatus === 'granted'}>{pushStatus === 'granted' ? 'فعال است' : 'فعال‌سازی'}</Button></Card>
      <Card className="panel settings-card" variant="borderless">
        <List dataSource={rows} renderItem={row => <List.Item className="settings-row" extra="‹"><List.Item.Meta avatar={<Avatar icon={<row.icon size={20}/>}/>} title={row.title} description={row.sub}/></List.Item>}/>
      </Card>
    </div>
  </>;
}

function ProfilePage({ profile, setProfile, onLogout, notify }: { profile: UserProfile; setProfile: (profile: UserProfile) => void | Promise<void>; onLogout: () => void; notify: (message: string) => void }) {
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState(profile.avatarUrl);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const openAvatarPicker = () => { setAvatarError(''); setSelectedAvatar(profile.avatarUrl); setShowAvatarPicker(true); };
  const saveAvatar = async () => {
    setSavingAvatar(true);
    setAvatarError('');
    try {
      await setProfile({ ...profile, avatarUrl: selectedAvatar });
      setShowAvatarPicker(false);
      notify('آواتار با موفقیت تغییر کرد');
    } catch (error) { setAvatarError(error instanceof Error ? error.message : 'ذخیره تصویر انجام نشد. دوباره تلاش کن.'); }
    finally { setSavingAvatar(false); }
  };
  return <>
    <PageHeader title="پروفایل" description="اطلاعات حساب و تصویر پروفایل خودت را مدیریت کن."/>
    <div className="profile-page-layout">
      <Card className="profile-hero-card" variant="borderless">
        <Avatar size={96} src={profile.avatarUrl}/>
        <div><strong>{profile.name}</strong><span>{profile.email || 'ایمیل ثبت نشده'}</span></div>
        <Button type="primary" icon={<Pencil size={17}/>} onClick={openAvatarPicker}>تغییر آواتار</Button>
      </Card>
      <Card className="profile-account-card" title="حساب کاربری" variant="borderless">
        <List>
          <List.Item><List.Item.Meta avatar={<Avatar icon={<UserRound size={19}/>}/>} title="نام کاربر" description={profile.name}/></List.Item>
          <List.Item><List.Item.Meta avatar={<Avatar icon={<Mail size={19}/>}/>} title="ایمیل" description={profile.email || 'ایمیل ثبت نشده'}/></List.Item>
        </List>
        <Alert type="info" showIcon message="با خروج از حساب، اطلاعات ذخیره‌شده حذف نمی‌شود و با ورود دوباره قابل دریافت است."/>
        <Button block danger size="large" icon={<LogOut size={19}/>} onClick={onLogout}>خروج از حساب</Button>
      </Card>
    </div>
    <Modal open={showAvatarPicker} title="آواتارت را انتخاب کن" onCancel={() => !savingAvatar && setShowAvatarPicker(false)} footer={null} destroyOnHidden>
      <p className="ant-modal-description">هر وقت خواستی می‌توانی دوباره تغییرش بدهی.</p>
      <div className="avatar-grid">{avatarOptions.map((avatar, index) => <Button key={avatar} disabled={savingAvatar} className={selectedAvatar === avatar ? 'selected' : ''} onClick={() => setSelectedAvatar(avatar)}><img src={avatar} alt={`آواتار گاو ${index + 1}`}/>{selectedAvatar === avatar && <span><Check size={17}/></span>}</Button>)}</div>
      {avatarError && <Alert type="error" showIcon message={avatarError}/>}
      <div className="ant-modal-actions"><Button disabled={savingAvatar} onClick={() => setShowAvatarPicker(false)}>انصراف</Button><Button type="primary" loading={savingAvatar} icon={!savingAvatar ? <Check size={18}/> : undefined} onClick={saveAvatar}>{avatarError ? 'تلاش دوباره' : 'انتخاب این آواتار'}</Button></div>
    </Modal>
  </>;
}

function DailyExpenseModal({ open, date, setDate, categoryOptions, transactions, onAddForDate, onClose }: { open: boolean; date: string; setDate: (date: string) => void; categoryOptions: Category[]; transactions: Transaction[]; onAddForDate: (date: string) => void; onClose: () => void }) {
  const selected = parseJalaliDate(date) || todayJalali();
  const monthLength = jalaaliMonthLength(selected.year, selected.month);
  const firstDay = jalaliToDate(jalaliDateKey(selected.year, selected.month, 1));
  const startOffset = firstDay ? (firstDay.getDay() + 1) % 7 : 0;
  const weekdays = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
  const dailyTotals = Object.fromEntries(Array.from({ length: monthLength }, (_, index) => {
    const dayKey = jalaliDateKey(selected.year, selected.month, index + 1);
    const amount = transactions.filter(transaction => transaction.type === 'expense' && transaction.date === dayKey).reduce((sum, transaction) => sum + transaction.amount, 0);
    return [dayKey, amount];
  }));
  const expenses = transactions.filter(transaction => transaction.type === 'expense' && transaction.date === date);
  const total = expenses.reduce((sum, transaction) => sum + transaction.amount, 0);
  const changeMonth = (offset: number) => {
    let year = selected.year;
    let month = selected.month + offset;
    if (month < 1) { year -= 1; month = 12; }
    if (month > 12) { year += 1; month = 1; }
    setDate(jalaliDateKey(year, month, Math.min(selected.day, jalaaliMonthLength(year, month))));
  };
  return <Modal className="daily-expense-modal" open={open} title={<span className="form-label-icon"><CalendarDays size={19}/>تقویم هزینه‌ها</span>} onCancel={onClose} footer={null} width={720} destroyOnHidden>
    <div className="daily-date-switcher month-calendar-switcher">
      <Button aria-label="ماه قبل تقویم" icon={<ChevronRight size={18}/>} onClick={() => changeMonth(-1)}/>
      <div><span>نمای ماهانه</span><strong>{jalaliMonthNames[selected.month - 1]} {toPersianDigits(selected.year)}</strong></div>
      <Button aria-label="ماه بعد تقویم" icon={<ChevronLeft size={18}/>} onClick={() => changeMonth(1)}/>
    </div>
    <div className="monthly-calendar" role="grid" aria-label={`تقویم ${jalaliMonthNames[selected.month - 1]} ${toPersianDigits(selected.year)}`}>
      {weekdays.map(weekday => <div className="calendar-weekday" role="columnheader" key={weekday}>{weekday}</div>)}
      {Array.from({ length: startOffset }, (_, index) => <div className="calendar-empty" key={`empty-${index}`} aria-hidden="true"/>)}
      {Array.from({ length: monthLength }, (_, index) => {
        const day = index + 1;
        const dayKey = jalaliDateKey(selected.year, selected.month, day);
        const amount = dailyTotals[dayKey] || 0;
        return <button type="button" role="gridcell" aria-selected={dayKey === date} aria-label={`${toPersianDigits(day)} ${jalaliMonthNames[selected.month - 1]}${amount ? `، ${formatMoney(amount)}` : ''}`} className={`calendar-day ${dayKey === date ? 'selected' : ''} ${amount ? 'has-expense' : ''}`} key={dayKey} onClick={() => setDate(dayKey)}><span>{toPersianDigits(day)}</span>{amount > 0 && <small>{compactMoney(amount)}</small>}</button>;
      })}
    </div>
    <Card className="daily-total-card" variant="borderless"><span>جمع خرج {displayJalaliDate(date)}</span><strong>{formatMoney(total)}</strong><small>{toPersianDigits(expenses.length)} تراکنش هزینه</small></Card>
    <Button className="daily-add-transaction" type="primary" size="large" block icon={<Plus size={18}/>} onClick={() => onAddForDate(date)}>ثبت تراکنش برای این روز</Button>
    <div className="daily-expense-list"><TransactionList categoryOptions={categoryOptions} items={expenses}/></div>
  </Modal>;
}

function TransactionModal({ initialTransaction, initialDate, categoryOptions, onClose, onSubmit }: { initialTransaction: Transaction | null; initialDate?: string | null; categoryOptions: Category[]; onClose: () => void; onSubmit: (t: Omit<Transaction,'id'>) => void | Promise<void> }) {
  const today = todayJalali();
  const initialJalaliDate = parseJalaliDate(initialTransaction?.date || initialDate || '') || today;
  const [type, setType] = useState<TxType>(initialTransaction?.type || 'expense');
  const [title, setTitle] = useState(initialTransaction?.title || '');
  const [amount, setAmount] = useState(initialTransaction ? String(initialTransaction.amount) : '');
  const [category, setCategory] = useState(initialTransaction?.category || categoryOptions[0]?.name || 'سایر');
  const [year, setYear] = useState(initialJalaliDate.year);
  const [month, setMonth] = useState(initialJalaliDate.month);
  const [day, setDay] = useState(initialJalaliDate.day);
  const [recurrence, setRecurrence] = useState<Recurrence>(initialTransaction?.recurrence || 'none');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dayCount = jalaaliMonthLength(year, month);
  const years = Array.from({ length: 12 }, (_, index) => today.year - 10 + index);
  const changeMonth = (nextMonth: number) => { setMonth(nextMonth); setDay(value => Math.min(value, jalaaliMonthLength(year, nextMonth))); };
  const changeYear = (nextYear: number) => { setYear(nextYear); setDay(value => Math.min(value, jalaaliMonthLength(nextYear, month))); };
  const submit = async () => {
    if (!title.trim()) return setError('عنوان تراکنش را وارد کن.');
    if (!Number.isSafeInteger(Number(amount)) || Number(amount) <= 0) return setError('مبلغ باید یک عدد مثبت باشد.');
    const date = jalaliDateKey(year, month, day);
    if (!parseJalaliDate(date)) return setError('تاریخ انتخاب‌شده معتبر نیست.');
    setSaving(true);
    setError('');
    try { await onSubmit({ title: title.trim(), amount: Number(amount), category: type === 'income' ? 'حقوق' : type === 'savings' ? 'پس‌انداز' : category, type, date, recurrence, generatedFrom: initialTransaction?.generatedFrom }); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'ذخیره تراکنش انجام نشد.'); }
    finally { setSaving(false); }
  };
  return <Modal className="transaction-ant-modal" open title={initialTransaction ? 'ویرایش تراکنش' : 'تراکنش جدید'} onCancel={onClose} footer={null} destroyOnHidden width={560}>
    <p className="ant-modal-description">جزئیات و تاریخ شمسی تراکنش را وارد کن.</p>
    <Form layout="vertical" onFinish={submit} requiredMark={false}>
      <Form.Item label="نوع تراکنش">
        <Segmented block value={type} onChange={value => setType(value as TxType)} options={[
          { value: 'expense', label: <span className="segment-label"><ArrowUpRight size={16}/>هزینه</span> },
          { value: 'income', label: <span className="segment-label"><ArrowDownLeft size={16}/>درآمد</span> },
          { value: 'savings', label: <span className="segment-label"><Target size={16}/>پس‌انداز</span> },
        ]}/>
      </Form.Item>
      <Form.Item label="عنوان تراکنش" required>
        <Input autoFocus value={title} onChange={event => setTitle(event.target.value)} placeholder={type === 'savings' ? 'مثلاً انتقال به حساب پس‌انداز' : 'مثلاً خرید روزانه'}/>
      </Form.Item>
      <Form.Item label="مبلغ (تومان)" required>
        <InputNumber className="ant-money-input" min={1} precision={0} value={amount ? Number(amount) : null} onChange={value => setAmount(value === null ? '' : String(value))} placeholder="۰"/>
      </Form.Item>
      {type === 'expense' && <Form.Item label="دسته‌بندی"><Select value={category} onChange={setCategory} options={categoryOptions.map(item => ({ value: item.name, label: item.name }))}/></Form.Item>}
      <Form.Item label={<span className="form-label-icon"><CalendarDays size={16}/>تاریخ شمسی</span>} required>
        <div className="jalali-ant-grid">
          <Select aria-label="سال" value={year} onChange={changeYear} options={years.map(value => ({ value, label: toPersianDigits(value) }))}/>
          <Select aria-label="ماه" value={month} onChange={changeMonth} options={jalaliMonthNames.map((name, index) => ({ value: index + 1, label: name }))}/>
          <Select aria-label="روز" value={day} onChange={setDay} options={Array.from({ length: dayCount }, (_, index) => ({ value: index + 1, label: toPersianDigits(index + 1) }))}/>
        </div>
      </Form.Item>
      <Form.Item label={<span className="form-label-icon"><Repeat2 size={16}/>تکرار تراکنش</span>}>
        <Select value={recurrence} onChange={value => setRecurrence(value as Recurrence)} options={[{ value: 'none', label: 'بدون تکرار' }, { value: 'monthly', label: 'ماهانه' }]}/>
      </Form.Item>
      {error && <Alert type="error" showIcon message={error}/>}
      <div className="ant-modal-actions"><Button onClick={onClose} disabled={saving}>انصراف</Button><Button type="primary" htmlType="submit" loading={saving}>{initialTransaction ? 'ذخیره ویرایش' : 'ثبت تراکنش'}</Button></div>
    </Form>
  </Modal>;
}
