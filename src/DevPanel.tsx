import { useEffect, useState } from 'react';
import { Alert, Button, ColorPicker, Input, Switch } from 'antd';
import { Check, Eye, Palette, RotateCcw, Save, ShieldCheck, Type, Wrench } from 'lucide-react';
import { defaultDevSettings, normalizeDevSettings, type DevSettings } from './devSettings';

type Props = {
  settings: DevSettings;
  setSettings: (settings: DevSettings) => void | Promise<void>;
  isLocalDevelopment: boolean;
  notify: (message: string) => void;
};

const textFields: Array<{ key: keyof DevSettings; label: string; hint: string; multiline?: boolean }> = [
  { key: 'appName', label: 'نام اپ', hint: 'در لوگو و منوی کناری نمایش داده می‌شود.' },
  { key: 'appTagline', label: 'شعار کوتاه', hint: 'زیر نام اپ نمایش داده می‌شود.' },
  { key: 'authKicker', label: 'برچسب صفحه ورود', hint: 'متن کوچک بالای تیتر صفحه ورود است.' },
  { key: 'authTitle', label: 'تیتر صفحه ورود', hint: 'بخش اول تیتر اصلی صفحه ورود است.' },
  { key: 'authHighlight', label: 'بخش تأکیدی تیتر', hint: 'بخش دوم و برجسته تیتر صفحه ورود است.' },
  { key: 'authDescription', label: 'توضیح صفحه ورود', hint: 'متن زیر تیتر صفحه ورود.', multiline: true },
  { key: 'authQuote', label: 'نقل‌قول صفحه ورود', hint: 'متن کوتاه پایین بخش معرفی.' },
  { key: 'dashboardGreeting', label: 'خوشامد داشبورد', hint: 'برای نام کاربر از {name} استفاده کن.' },
  { key: 'dashboardDescription', label: 'توضیح داشبورد', hint: 'برای ماه انتخابی از {month} استفاده کن.' },
  { key: 'addTransactionLabel', label: 'متن دکمه ثبت تراکنش', hint: 'روی دکمه اصلی داشبورد نمایش داده می‌شود.' },
];

export default function DevPanel({ settings, setSettings, isLocalDevelopment, notify }: Props) {
  const [draft, setDraft] = useState(() => normalizeDevSettings(settings));
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setDraft(normalizeDevSettings(settings)), [settings]);

  const update = <K extends keyof DevSettings>(key: K, value: DevSettings[K]) => {
    setDraft(current => ({ ...current, [key]: value }));
    setSaved(false);
    setError('');
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await setSettings(normalizeDevSettings(draft));
      setSaved(true);
      notify('تنظیمات پنل توسعه ذخیره شد');
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'ذخیره تنظیمات انجام نشد. دوباره تلاش کن.'); }
    finally { setSaving(false); }
  };

  const reset = async () => {
    setSaving(true);
    setError('');
    try {
      await setSettings(defaultDevSettings);
      setDraft(defaultDevSettings);
      setSaved(true);
      notify('تنظیمات ظاهری به حالت اولیه برگشت');
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'بازنشانی تنظیمات انجام نشد. دوباره تلاش کن.'); }
    finally { setSaving(false); }
  };

  return <>
    <div className="page-header dev-page-header"><div><span className="eyebrow">فقط مدیر</span><h1>پنل توسعه</h1><p>متن‌ها و ظاهر عمومی اپ را بدون تغییر کد تنظیم کن.</p></div><div className="dev-save-actions"><Button disabled={saving} onClick={reset} icon={<RotateCcw size={17}/>}>بازنشانی</Button><Button type="primary" loading={saving} onClick={save} icon={!saving && (saved ? <Check size={18}/> : <Save size={18}/>) }>{error ? 'تلاش دوباره' : saved ? 'ذخیره شد' : 'ذخیره تغییرات'}</Button></div></div>

    {error && <Alert className="dev-cloud-error" type="error" showIcon message={error}/>}

    <div className="dev-access-note"><ShieldCheck size={21}/><div><strong>دسترسی محافظت‌شده</strong><span>{isLocalDevelopment ? 'این حساب در دیتابیس نقش Admin دارد؛ RLS دسترسی مدیریتی را مستقل از محیط اجرا کنترل می‌کند.' : 'نقش Admin حساب فعلی توسط دیتابیس و RLS تأیید شده است.'}</span></div></div>

    <div className="dev-panel-grid">
      <section className="panel dev-section">
        <div className="dev-section-title"><Type size={20}/><div><strong>متن‌های اصلی</strong><span>تغییرات پس از ذخیره در صفحه‌های مرتبط اعمال می‌شوند.</span></div></div>
        <div className="dev-fields">{textFields.map(field => <label key={field.key} className={field.multiline ? 'wide' : ''}><span>{field.label}</span>{field.multiline ? <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} value={String(draft[field.key])} onChange={event => update(field.key, event.target.value as never)}/> : <Input value={String(draft[field.key])} onChange={event => update(field.key, event.target.value as never)}/>}<small>{field.hint}</small></label>)}</div>
      </section>

      <aside className="dev-side-column">
        <section className="panel dev-section">
          <div className="dev-section-title"><Palette size={20}/><div><strong>ظاهر برند</strong><span>رنگ تأکیدی دکمه‌ها و جزئیات.</span></div></div>
          <div className="dev-color-field"><ColorPicker value={draft.accentColor} showText onChangeComplete={color => update('accentColor', color.toHexString())}/><div><strong>رنگ تأکیدی</strong><span>{draft.accentColor}</span></div></div>
        </section>
        <section className="panel dev-section">
          <div className="dev-section-title"><Eye size={20}/><div><strong>نمایش بخش‌ها</strong><span>بخش‌های اختیاری تجربه اولیه.</span></div></div>
          <div className="dev-toggle"><div><strong>بخش معرفی صفحه ورود</strong><span>تیتر و توضیحات کنار فرم ورود</span></div><Switch checked={draft.showAuthShowcase} onChange={checked => update('showAuthShowcase', checked)}/></div>
          <div className="dev-toggle"><div><strong>معرفی اولیه محصول</strong><span>اسلایدهایی که فقط بار اول نمایش داده می‌شوند</span></div><Switch checked={draft.showIntroOnboarding} onChange={checked => update('showIntroOnboarding', checked)}/></div>
        </section>
        <section className="dev-preview" style={{ '--preview-accent': draft.accentColor } as React.CSSProperties}><Wrench size={19}/><span>{draft.authKicker}</span><strong>{draft.authTitle} {draft.authHighlight}</strong><p>{draft.authDescription}</p></section>
      </aside>
    </div>
  </>;
}
