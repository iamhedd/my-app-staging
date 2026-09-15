# گاو — مدیریت مالی شخصی

نسخه‌ی اولیه‌ی وب‌اپ فارسی مدیریت درآمد، هزینه و بودجه بر اساس PRD.

رابط کاربری به‌صورت مرحله‌ای در حال مهاجرت به Ant Design است. `ConfigProvider` با RTL، زبان فارسی و Theme Tokenهای برند فعال شده و صفحه ورود و پنل توسعه از کامپوننت‌های Ant استفاده می‌کنند؛ نمودارها همچنان با Recharts هستند.

## اجرا

```bash
npm install
npm run dev
```

برای ساخت نسخه‌ی production:

```bash
npm run build
```

## Docker Production

تصویر چندمرحله‌ای با Node.js 22 ساخته و خروجی نهایی توسط Nginx روی پورت ۸۰ سرو می‌شود. متغیرهای `VITE_*` هنگام build تزریق می‌شوند؛ Service Role Key نباید به Docker build ارسال شود.

```bash
docker build \
  --build-arg VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
  --build-arg VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" \
  -t gav-finance:latest .
docker run --rm -p 8080:80 gav-finance:latest
curl --fail http://localhost:8080/healthz
```

Nginx شامل SPA fallback، gzip، cache بلندمدت فایل‌های hash‌شده، جلوگیری از cache شدن `index.html` و health check است.

Supabase Auth و PostgreSQL منبع اصلی داده‌های Production هستند. `localStorage` فقط برای cache و مهاجرت نسخه‌های قبلی نگه داشته می‌شود.

## پنل توسعه شخصی

صفحه «پنل توسعه» فقط برای حسابی نمایش داده می‌شود که در جدول `user_roles` نقش `admin` دارد. نقش از دیتابیس خوانده می‌شود و RLS اجازه ارتقای نقش توسط کاربر عادی را نمی‌دهد. اولین مدیر را فقط از SQL Editor یا محیط امن دارای Service Role تعیین کنید:

```sql
update public.user_roles set role = 'admin' where user_id = '<AUTH_USER_UUID>';
```

Service Role Key را هرگز در متغیرهای `VITE_*` یا کد مرورگر قرار ندهید.

## فعال‌سازی ورود با گوگل

1. فایل `.env.example` را با نام `.env` کپی و مقادیر Supabase را وارد کنید.
2. در Supabase از مسیر `Authentication > Providers > Google` ارائه‌دهنده‌ی Google را فعال کنید.
3. در Google Cloud، آدرس Callback نمایش‌داده‌شده توسط Supabase را به Authorized redirect URIs اضافه کنید.
4. آدرس اجرای برنامه (برای توسعه `http://localhost:5173`) را در Redirect URLs بخش Authentication تنظیم کنید.
5. migration دیتابیس را اعمال کنید:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

## فعال‌سازی اعلان‌های Firebase

1. یک Web App در Firebase بسازید و مقادیر آن را در `.env` قرار دهید.
2. در `Project settings > Cloud Messaging > Web Push certificates` یک Key Pair بسازید.
3. مقدار Key Pair را به‌عنوان `VITE_FIREBASE_VAPID_KEY` تنظیم کنید.
4. در تنظیمات برنامه روی «فعال‌سازی» بزنید تا مجوز مرورگر و FCM Token دریافت شود.

توکن دستگاه در جدول `notification_devices` و با `user_id` ذخیره می‌شود. نسخه محلی نیز برای مهاجرت امن حفظ می‌شود.

## شروع کار و برنامه مالی شخصی

کاربر جدید پس از ورود، یک onboarding سه‌مرحله‌ای برای ثبت درآمد، تعیین هدف پس‌انداز، تخصیص اختیاری مبلغ قابل‌هزینه و مرور نهایی می‌بیند. هر دسته می‌تواند مستقل با مبلغ یا درصد تنظیم شود. اطلاعات در PostgreSQL و با RLS کاربر ذخیره می‌شوند. پس‌انداز نوع تراکنش مستقل دارد و در هزینه‌ها، مصرف بودجه و هشدارهای سقف محاسبه نمی‌شود.

تراکنش‌ها با تاریخ واقعی شمسی نمایش داده و با تاریخ استاندارد PostgreSQL ذخیره می‌شوند. داده‌های قدیمی `localStorage` پس از اولین ورود به‌شکل idempotent منتقل می‌شوند؛ قیدهای یکتا از رکورد تکراری جلوگیری می‌کنند و اطلاعات محلی حذف نمی‌شود.

یادآوری شبانه به‌صورت محلی و best-effort اجرا می‌شود: اگر وب‌اپ باز و مجوز Notification فعال باشد، در ساعت انتخابی اعلان نمایش داده می‌شود. ارسال تضمینی وقتی مرورگر بسته است به یک Cloud Function یا backend scheduler نیاز دارد.

## تست

```bash
npm test
npm run typecheck
npm run build
```

برای تست RLS با Supabase CLI:

```bash
supabase test db
```

برای integration روی یک پروژه تست جداگانه، متغیرهای زیر را فقط در محیط shell یا CI امن قرار دهید؛ Service Role هرگز وارد فرانت‌اند نمی‌شود:

```bash
SUPABASE_URL=... \
SUPABASE_ANON_KEY=... \
SUPABASE_SERVICE_ROLE_KEY=... \
npm run test:integration
```
