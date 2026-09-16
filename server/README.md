# Gav API

Backend مستقل اپ با Node.js 22، Express، Better Auth و PostgreSQL. این سرویس فایل‌های buildشده‌ی React و API را از یک origin ارائه می‌کند؛ در نتیجه session فقط در cookie امن و HttpOnly نگه‌داری می‌شود و هیچ credential دیتابیس وارد مرورگر نمی‌شود.

## اجرای محلی

1. فایل `server/.env.example` را به `server/.env` کپی و مقادیر محلی را تنظیم کنید.
2. schema را با `npm run db:migrate` اعمال کنید.
3. با `npm run dev` API را اجرا کنید.

دستورها باید از پوشه `server/` اجرا شوند. فایل‌های SQL در `postgres/migrations/` هستند و checksum هر migration در `public.schema_migrations` ثبت می‌شود.

## Google OAuth

در Google Cloud یک OAuth Client از نوع Web Application بسازید. برای محیط staging مقدار زیر باید در Authorized redirect URIs ثبت شود:

```text
https://staging.gavapp.ir/api/auth/callback/google
```

در production نیز همین مسیر را با دامنه production ثبت کنید. `GOOGLE_CLIENT_SECRET` فقط متغیر runtime سرور است و نباید با پیشوند `VITE_` تعریف شود.

## مسیرهای اصلی

- `GET /livez`: زنده‌بودن process، بدون query دیتابیس
- `GET /healthz`: readiness همراه با query PostgreSQL
- `/api/auth/*`: endpointهای Better Auth (ثبت‌نام، ورود، Google callback، session و خروج)
- `GET /api/v1/bootstrap`: snapshot داده‌های کاربر فعلی
- `PUT /api/v1/profile`
- `PUT /api/v1/financial-plan`
- `PUT /api/v1/categories`
- `POST|PUT|DELETE /api/v1/transactions`
- `PUT /api/v1/budgets`
- `PUT /api/v1/settings`
- `PUT /api/v1/notification-device`
- `GET|POST /api/v1/review-comments` و `PUT|DELETE /api/v1/review-comments/:id` (فقط admin)
- `GET|PUT /api/v1/migrations/:key`

تمام مسیرهای `/api/v1` session معتبر می‌خواهند. شناسه مالک از cookie/session گرفته می‌شود. هر query داده‌ی اپ ابتدا با `SET LOCAL ROLE gavapp_app` امتیازهای owner را کنار می‌گذارد و سپس در همان transaction مقدار `app.current_user_id` را تنظیم می‌کند؛ بنابراین policyهای `FORCE RLS` حتی با connection string مالک دیتابیس نیز enforce می‌شوند. جدول نقش‌ها endpoint نوشتن عمومی ندارد و دسترسی review علاوه بر RLS در middleware و repository نیز admin-check می‌شود.

مبلغ‌ها در PostgreSQL از نوع `bigint` هستند و در پاسخ JSON به شکل رشته‌ی رقمی ارسال می‌شوند. این قرارداد جلوی خطای اعشاری و عبور از محدوده امن JavaScript را می‌گیرد.

## استقرار هم‌روش

Docker image را از root repository بسازید:

```sh
docker build -f server/Dockerfile -t gav-app .
```

پورت سرویس `3000` و health check برابر `/healthz` است. حداقل runtime envها:

- `DATABASE_URL`
- `DATABASE_SSL`
- `BETTER_AUTH_SECRET`
- `APP_BASE_URL`
- `TRUSTED_ORIGINS`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

مقادیر secret نباید build argument باشند؛ آن‌ها را در Secret/Environment runtime هم‌روش قرار دهید. migration runner پیش از start اجرا می‌شود و با PostgreSQL advisory lock برای چند replica ایمن است.

## محدودیت ایمیل

ورود و ثبت‌نام ایمیل/رمز فعال است. ارسال ایمیل بازیابی رمز و تأیید ایمیل تا زمان اتصال یک email provider تراکنشی فعال نشده است؛ این قابلیت نباید در UI به‌عنوان آماده معرفی شود. Google OAuth مستقل از email provider کار می‌کند.
