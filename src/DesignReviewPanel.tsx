import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, Input, List, Modal, Popconfirm, Segmented, Select, Spin, Tag, message } from 'antd';
import { ArrowRight, CalendarDays, Check, ClipboardCopy, Download, Edit3, Eye, LayoutGrid, MessageSquarePlus, RefreshCw, Trash2 } from 'lucide-react';
import {
  createDesignReviewComment, deleteDesignReviewComment, loadDesignReviewComments, updateDesignReviewComment,
  type DesignReviewComment, type ReviewPriority, type ReviewStatus,
} from './database';

type Device = 'mobile' | 'tablet' | 'desktop';
type ReviewTarget = { key: string; title: string; description: string; components: string[] };

const targets: ReviewTarget[] = [
  { key: 'dashboard', title: 'داشبورد', description: 'کارت‌های خلاصه، نمودارها و تراکنش‌های اخیر', components: ['هدر', 'کارت‌های خلاصه', 'نمودار روند', 'نمودار دسته‌ها', 'تراکنش‌های اخیر'] },
  { key: 'budgets', title: 'بودجه‌بندی', description: 'بودجه ماهانه، هفتگی و کارت دسته‌ها', components: ['انتخاب بازه', 'کارت بودجه کل', 'کارت دسته‌بندی', 'Modal ویرایش'] },
  { key: 'savings', title: 'پس‌انداز', description: 'موجودی واقعی، مبلغ بدون هدف و هدف‌های پس‌انداز', components: ['خلاصه پس‌انداز', 'هدف ماهانه', 'کارت هدف', 'افزایش و برداشت', 'جابه‌جایی بین هدف‌ها'] },
  { key: 'transactions', title: 'تراکنش‌ها', description: 'جست‌وجو، فیلترها و فهرست تراکنش‌ها', components: ['جست‌وجو', 'فیلترها', 'فهرست تراکنش‌ها', 'Modal ثبت تراکنش'] },
  { key: 'reports', title: 'گزارش‌ها', description: 'مقایسه ماهانه، پیش‌بینی و دسته‌های پرخرج', components: ['خلاصه گزارش', 'نمودار مقایسه', 'دسته‌های پرخرج', 'کارت پیش‌بینی'] },
  { key: 'calendar', title: 'تقویم هزینه‌ها', description: 'تقویم شمسی ماهانه و هزینه روزانه', components: ['انتخاب ماه', 'شبکه تقویم', 'روز انتخاب‌شده', 'فهرست هزینه روز'] },
  { key: 'profile', title: 'پروفایل', description: 'نام، ایمیل، آواتار و خروج', components: ['کارت هویت', 'ویرایش نام', 'انتخاب آواتار', 'خروج از حساب'] },
  { key: 'settings', title: 'تنظیمات', description: 'برنامه مالی، اعلان‌ها و تنظیمات حساب', components: ['برنامه مالی', 'اعلان‌ها', 'فهرست تنظیمات'] },
  { key: 'login', title: 'ورود و ثبت‌نام', description: 'فرم ورود، ثبت‌نام و Google OAuth', components: ['معرفی محصول', 'فرم ورود', 'فرم ثبت‌نام', 'ورود گوگل'] },
  { key: 'onboarding', title: 'آنبوردینگ', description: 'درآمد، تخصیص بودجه و مرور نهایی', components: ['مرحله درآمد', 'خلاصه تخصیص', 'کارت دسته‌بندی', 'مرحله مرور'] },
];

const priorityOptions: Array<{ value: ReviewPriority; label: string }> = [
  { value: 'low', label: 'کم' }, { value: 'medium', label: 'متوسط' }, { value: 'high', label: 'زیاد' }, { value: 'critical', label: 'بحرانی' },
];
const statusOptions: Array<{ value: ReviewStatus; label: string }> = [
  { value: 'open', label: 'باز' }, { value: 'in_progress', label: 'در حال انجام' }, { value: 'resolved', label: 'حل‌شده' },
];
const priorityLabel = Object.fromEntries(priorityOptions.map(item => [item.value, item.label]));
const statusLabel = Object.fromEntries(statusOptions.map(item => [item.value, item.label]));

function PreviewMock({ pageKey }: { pageKey: string }) {
  if (pageKey === 'dashboard') return <><div className="review-mock-header"/><div className="review-mock-stats">{[1,2,3,4].map(item => <i key={item}/>)}</div><div className="review-mock-chart"><i/><i/><i/><i/><i/></div></>;
  if (pageKey === 'budgets') return <><div className="review-mock-tabs"/><div className="review-mock-hero"/><div className="review-mock-squares">{[1,2,3,4].map(item => <i key={item}/>)}</div></>;
  if (pageKey === 'savings') return <><div className="review-mock-hero"/><div className="review-mock-tabs"/><div className="review-mock-squares">{[1,2,3].map(item => <i key={item}/>)}</div></>;
  if (pageKey === 'transactions') return <><div className="review-mock-search"/><div className="review-mock-tabs"/><div className="review-mock-list">{[1,2,3,4].map(item => <i key={item}/>)}</div></>;
  if (pageKey === 'reports') return <><div className="review-mock-stats">{[1,2,3].map(item => <i key={item}/>)}</div><div className="review-mock-chart"><i/><i/><i/><i/></div><div className="review-mock-list"><i/><i/></div></>;
  if (pageKey === 'calendar') return <><div className="review-mock-tabs"/><div className="review-mock-calendar">{Array.from({length:35},(_,index)=><i key={index}/>)}</div><div className="review-mock-list"><i/><i/></div></>;
  if (pageKey === 'profile') return <><div className="review-mock-profile"><i/><b/><span/></div><div className="review-mock-form"/><div className="review-mock-list"><i/><i/></div></>;
  if (pageKey === 'login') return <><div className="review-mock-login"><div/><section><i/><i/><i/><b/></section></div></>;
  if (pageKey === 'onboarding') return <><div className="review-mock-steps"><i/><i/><i/></div><div className="review-mock-summary"/><div className="review-mock-form"/><div className="review-mock-form"/></>;
  return <><div className="review-mock-header"/><div className="review-mock-list">{[1,2,3,4].map(item => <i key={item}/>)}</div></>;
}

function ReviewPreview({ target, device }: { target: ReviewTarget; device: Device }) {
  return <div className={`review-device-stage device-${device}`}><div className="review-preview-surface" aria-label={`پیش‌نمایش خواندنی ${target.title}`}><PreviewMock pageKey={target.key}/></div></div>;
}

export default function DesignReviewPanel({ userId, onExit }: { userId: string; onExit: () => void }) {
  const [api, contextHolder] = message.useMessage();
  const [device, setDevice] = useState<Device>('desktop');
  const [comments, setComments] = useState<DesignReviewComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [componentKey, setComponentKey] = useState('');
  const [commentText, setCommentText] = useState('');
  const [priority, setPriority] = useState<ReviewPriority>('medium');
  const [status, setStatus] = useState<ReviewStatus>('open');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setComments(await loadDesignReviewComments()); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'دریافت بازخوردها انجام نشد.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const resetDraft = () => { setEditingId(null); setComponentKey(''); setCommentText(''); setPriority('medium'); setStatus('open'); };
  const openTarget = (target: ReviewTarget) => { resetDraft(); setReviewTarget(target); };
  const editComment = (comment: DesignReviewComment) => {
    const target = targets.find(item => item.key === comment.pageKey);
    if (!target) return;
    setReviewTarget(target); setEditingId(comment.id); setComponentKey(comment.componentKey); setCommentText(comment.commentText); setPriority(comment.priority); setStatus(comment.status);
  };
  const save = async () => {
    if (!reviewTarget || !commentText.trim()) return setError('متن بازخورد را وارد کن.');
    setSaving(true); setError('');
    try {
      const input = { pageKey: reviewTarget.key, componentKey, commentText: commentText.trim(), priority, status };
      if (editingId) {
        const updated = await updateDesignReviewComment(editingId, input);
        setComments(items => items.map(item => item.id === updated.id ? updated : item));
      } else {
        const created = await createDesignReviewComment(userId, input);
        setComments(items => [...items, created]);
      }
      resetDraft(); api.success('بازخورد ذخیره شد');
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'ذخیره بازخورد انجام نشد.'); }
    finally { setSaving(false); }
  };
  const remove = async (id: string) => {
    try { await deleteDesignReviewComment(id); setComments(items => items.filter(item => item.id !== id)); api.success('بازخورد حذف شد'); }
    catch (removeError) { setError(removeError instanceof Error ? removeError.message : 'حذف بازخورد انجام نشد.'); }
  };

  const structuredFeedback = useMemo(() => {
    const lines = ['# بازخورد تجمیعی طراحی', '', `تعداد موارد: ${comments.length}`, ''];
    for (const target of targets) {
      const items = comments.filter(comment => comment.pageKey === target.key);
      if (!items.length) continue;
      lines.push(`## ${target.title}`);
      items.forEach((comment, index) => lines.push(`${index + 1}. [اولویت: ${priorityLabel[comment.priority]}] [وضعیت: ${statusLabel[comment.status]}]${comment.componentKey ? ` [کامپوننت: ${comment.componentKey}]` : ''}\n   ${comment.commentText}`));
      lines.push('');
    }
    return lines.join('\n');
  }, [comments]);
  const copyAll = async () => {
    try { await navigator.clipboard.writeText(structuredFeedback); api.success('همه بازخوردها برای ارسال به Codex کپی شد'); }
    catch { api.error('کپی خودکار انجام نشد. دسترسی clipboard را بررسی کن.'); }
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), comments }, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'gav-design-feedback.json'; anchor.click(); URL.revokeObjectURL(url);
  };

  return <main className="design-review-page" dir="rtl">
    {contextHolder}
    <header className="design-review-header"><div><span><Eye size={17}/>فقط مدیر تأییدشده</span><h1>پنل بازبینی طراحی</h1><p>تمام صفحه‌ها را بدون تغییر داده واقعی مرور کن و بازخورد تجمیعی بساز.</p></div><div className="design-review-actions"><Button icon={<ArrowRight size={17}/>} onClick={onExit}>بازگشت به اپ</Button><Button icon={<Download size={17}/>} onClick={exportJson} disabled={!comments.length}>خروجی JSON</Button><Button type="primary" icon={<ClipboardCopy size={17}/>} onClick={copyAll} disabled={!comments.length}>کپی همه بازخوردها</Button></div></header>
    <section className="design-review-toolbar"><div><LayoutGrid size={18}/><strong>اندازه پیش‌نمایش</strong></div><Segmented value={device} onChange={value => setDevice(value as Device)} options={[{value:'mobile',label:'موبایل'},{value:'tablet',label:'تبلت'},{value:'desktop',label:'دسکتاپ'}]}/><Tag>{comments.length} بازخورد</Tag></section>
    {error && <Alert type="error" showIcon message={error} action={<Button size="small" icon={<RefreshCw size={14}/>} onClick={load}>تلاش دوباره</Button>}/>}
    {loading ? <div className="review-loading"><Spin size="large"/></div> : <section className="review-gallery">{targets.map(target => {
      const count = comments.filter(comment => comment.pageKey === target.key).length;
      return <Card className="review-gallery-card" key={target.key} title={target.title} extra={count ? <Tag color="magenta">{count}</Tag> : null}><p>{target.description}</p><ReviewPreview target={target} device={device}/><Button block icon={<MessageSquarePlus size={16}/>} onClick={() => openTarget(target)}>بازبینی و ثبت کامنت</Button></Card>;
    })}</section>}
    <section className="review-comments-section"><div className="review-section-title"><div><h2>بازخوردهای ثبت‌شده</h2><p>فقط ادمین‌ها با RLS می‌توانند این موارد را ببینند.</p></div><Button icon={<ClipboardCopy size={16}/>} onClick={copyAll} disabled={!comments.length}>کپی خروجی Codex</Button></div>{comments.length ? <List dataSource={comments} renderItem={comment => {
      const target = targets.find(item => item.key === comment.pageKey);
      return <List.Item actions={[<Button key="edit" type="text" icon={<Edit3 size={15}/>} onClick={() => editComment(comment)}>ویرایش</Button>,<Popconfirm key="delete" title="این بازخورد حذف شود؟" onConfirm={() => remove(comment.id)} okText="حذف" cancelText="انصراف"><Button type="text" danger icon={<Trash2 size={15}/>}>حذف</Button></Popconfirm>]}><List.Item.Meta title={<span className="review-comment-title"><b>{target?.title || comment.pageKey}</b>{comment.componentKey && <Tag>{comment.componentKey}</Tag>}<Tag color={comment.priority === 'critical' ? 'red' : comment.priority === 'high' ? 'volcano' : 'magenta'}>{priorityLabel[comment.priority]}</Tag><Tag>{statusLabel[comment.status]}</Tag></span>} description={comment.commentText}/></List.Item>;
    }}/> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="هنوز بازخوردی ثبت نشده است."/>}</section>
    <Modal open={Boolean(reviewTarget)} title={reviewTarget ? `بازبینی ${reviewTarget.title}` : ''} onCancel={() => { setReviewTarget(null); resetDraft(); setError(''); }} footer={null} width={820} destroyOnHidden>
      {reviewTarget && <><ReviewPreview target={reviewTarget} device={device}/><div className="review-comment-form"><label>کامپوننت<Select allowClear value={componentKey || undefined} onChange={value => setComponentKey(value || '')} placeholder="کل صفحه" options={reviewTarget.components.map(component => ({value:component,label:component}))}/></label><div className="review-form-row"><label>اولویت<Select value={priority} onChange={setPriority} options={priorityOptions}/></label><label>وضعیت<Select value={status} onChange={setStatus} options={statusOptions}/></label></div><label>متن بازخورد<Input.TextArea value={commentText} onChange={event => setCommentText(event.target.value)} autoSize={{minRows:3,maxRows:8}} maxLength={4000} showCount placeholder="مشکل، پیشنهاد و نتیجه مورد انتظار را بنویس…"/></label>{error && <Alert type="error" showIcon message={error}/>}<div className="ant-modal-actions"><Button onClick={() => { setReviewTarget(null); resetDraft(); }}>بستن</Button><Button type="primary" loading={saving} icon={!saving ? <Check size={16}/> : undefined} onClick={save}>{editingId ? 'ذخیره ویرایش' : 'ثبت بازخورد'}</Button></div></div></>}
    </Modal>
  </main>;
}
