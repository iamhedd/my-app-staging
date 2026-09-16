# گاو — مدیریت مالی شخصی

وب‌اپ فارسی و RTL مدیریت درآمد، هزینه، پس‌انداز و بودجه‌بندی با React، Vite و Ant Design. نمودارها با Recharts هستند.

## معماری Production

- فرانت‌اند React/Vite و API در یک image و روی پورت `3000` اجرا می‌شوند.
- API با Node.js 22، Express و Better Auth ساخته شده است.
- داده‌ها در PostgreSQL هم‌روش ذخیره می‌شوند.
- ورود ایمیل/رمز و Google OAuth توسط Better Auth انجام می‌شود؛ هیچ کلید دیتابیس یا OAuth وارد bundle مرورگر نمی‌شود.
- migrationهای دیتابیس هنگام شروع container و پیش از اجرای API اعمال می‌شوند.
- `localStorage` فقط برای cache و مهاجرت idempotent داده‌های نسخه‌های قدیمی نگه داشته می‌شود.

## اجرای توسعه

ابتدا API را با مقادیر محلی `server/.env.example` اجرا کنید:

```bash
npm --prefix server install
npm --prefix server run dev
```

سپس فرانت‌اند را اجرا کنید:

```bash
npm install
npm run dev
```

## Docker Production

```bash
docker build -t gav-app:latest .
docker run --rm --env-file server/.env -p 3000:3000 gav-app:latest
curl --fail http://localhost:3000/healthz
```

در هم‌روش، Build Context باید ریشه مخزن، Dockerfile برابر `./Dockerfile` (یا `./server/Dockerfile`) و پورت سرویس `3000` باشد. Secretهای runtime را در پنل Secret Manager تنظیم کنید؛ هیچ build arg مربوط به دیتابیس یا OAuth لازم نیست.

متغیرهای الزامی Production:

```env
NODE_ENV=production
PORT=3000
APP_BASE_URL=https://staging.gavapp.ir
TRUSTED_ORIGINS=https://staging.gavapp.ir
DATABASE_URL=postgresql://...
DATABASE_SSL=require
BETTER_AUTH_SECRET=...
ENABLE_GOOGLE_AUTH=true
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

`DATABASE_URL`، `BETTER_AUTH_SECRET` و `GOOGLE_CLIENT_SECRET` فقط باید در Secret Manager سرور قرار بگیرند.

## Google OAuth

در Google Cloud یک OAuth Client از نوع Web Application بسازید:

- Authorized JavaScript origin: `https://staging.gavapp.ir`
- Authorized redirect URI: `https://staging.gavapp.ir/api/auth/callback/google`

برای دامنه Production نیز origin و callback متناظر را ثبت کنید.

## دیتابیس و نقش Admin

schema در `postgres/migrations` است. migration با advisory lock، checksum و ledger اجرا می‌شود و اجرای دوباره امن است. API برای هر درخواست کاربر، شناسه کاربر را در session دیتابیس قرار می‌دهد و FORCE RLS جداسازی داده‌ها را enforce می‌کند.

پس از اولین ورود، نقش اولین ادمین را فقط با اتصال امن مدیریتی دیتابیس تنظیم کنید:

```sql
update public.user_roles
set role = 'admin'
where user_id = '<BETTER_AUTH_USER_ID>';
```

## اعلان‌ها

Firebase Cloud Messaging همچنان اختیاری است و فقط مقادیر عمومی `VITE_FIREBASE_*` در زمان build قابل استفاده‌اند. یادآوری محلی مرورگر best-effort است؛ ارسال تضمینی هنگام بسته بودن مرورگر به worker/scheduler سرور نیاز دارد.

## تست

```bash
npm run typecheck
npm test
npm run build

npm --prefix server run typecheck
npm --prefix server test

# فقط روی یک دیتابیس disposable
DATABASE_URL='postgresql://...' npm run test:rls
```

تست RLS دیتابیس تست را بازسازی می‌کند؛ هرگز آن را روی دیتابیس staging یا production اجرا نکنید.

پوشه‌های قدیمی `supabase/` و `integration/` فعلاً فقط برای rollback و انتقال احتمالی داده‌های قبلی نگه داشته شده‌اند و در runtime یا build استفاده نمی‌شوند.
