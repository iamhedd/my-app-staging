# Gav PostgreSQL schema

این پوشه schema مستقل PostgreSQL 17 را برای جایگزینی Supabase نگه می‌دارد. مهاجرت اولیه شامل مدل‌های Better Auth، همه داده‌های مالی برنامه، نقش ادمین، ایندکس‌ها، محدودیت‌های مالی و لایه دوم جداسازی کاربران با RLS است.

## پیش‌نیازها

- PostgreSQL 17
- ابزار خط فرمان `psql`
- کاربر migration با مجوز `CREATEROLE` برای ساخت نقش محدود `gavapp_app`
- یک database خالی یا databaseای که این migration قبلاً روی آن اجرا شده است
- اتصال TLS؛ مقدار `DATABASE_URL` فقط باید در secret manager سرور هم‌روش قرار بگیرد

هیچ‌یک از اطلاعات اتصال دیتابیس، Google OAuth یا session secret نباید با پیشوند `VITE_` ساخته شود یا وارد frontend شود.

## اجرا

```bash
export DATABASE_URL='postgresql://...'
./postgres/migrate.sh
```

runner هر فایل را در یک transaction اجرا می‌کند، checksum آن را در `schema_migrations` ثبت می‌کند و فایل اجراشده را دوباره اعمال نمی‌کند. تغییر دادن migration اجراشده باعث خطای checksum می‌شود؛ برای تغییر schema یک فایل شماره‌دار جدید بسازید.

برای اجرای smoke test جداسازی دو کاربر، جلوگیری از ارتقای نقش و دسترسی ادمین روی یک database موقت و قابل حذف:

```bash
export DATABASE_URL='postgresql://.../gav_test'
./postgres/test.sh
```

تست داخل transaction اجرا و در پایان rollback می‌شود؛ آن را فقط روی database موقت اجرا کنید.

## نگاشت Better Auth

Backend باید model nameها را به `users`، `sessions`، `accounts` و `verifications` و fieldها را به ستون‌های snake_case نگاشت کند. موارد مهم:

| Better Auth | PostgreSQL |
| --- | --- |
| `emailVerified` | `email_verified` |
| `createdAt` / `updatedAt` | `created_at` / `updated_at` |
| `expiresAt` | `expires_at` |
| `ipAddress` / `userAgent` | `ip_address` / `user_agent` |
| `userId` | `user_id` |
| `accountId` / `providerId` | `account_id` / `provider_id` |
| `accessToken` / `refreshToken` / `idToken` | `access_token` / `refresh_token` / `id_token` |
| `accessTokenExpiresAt` / `refreshTokenExpiresAt` | `access_token_expires_at` / `refresh_token_expires_at` |

شناسه‌های Auth از نوع `TEXT` هستند. بنابراین UUIDهای کاربران فعلی Supabase را می‌توان هنگام انتقال عیناً حفظ کرد و در عین حال شناسه‌های تولیدی Better Auth نیز پشتیبانی می‌شوند.

## RLS و context درخواست

Better Auth و `user_roles` فقط از backend قابل دسترسی‌اند. جدول‌های متعلق به کاربر RLS اجباری دارند. API برای هر عملیات داده باید transaction باز کند و شناسه session تأییدشده را به‌صورت transaction-local تنظیم کند:

```sql
begin;
set local role gavapp_app;
select set_config('app.current_user_id', $1, true);
-- queryهای همین درخواست
commit;
```

مقدار `$1` فقط باید از session اعتبارسنجی‌شده Better Auth بیاید، نه از body، query string یا header دلخواه کاربر. نقش `gavapp_app` از نوع `NOLOGIN`، `NOSUPERUSER` و `NOBYPASSRLS` است و فقط روی جدول‌های داده اپ CRUD دارد؛ Auth و migration با login مالک و بیرون این context اجرا می‌شوند. تمام queryهای مالی باید `user_id` را نیز صریحاً فیلتر کنند؛ RLS لایه دفاعی دوم است.

Migration عضویت `gavapp_app` را به `CURRENT_USER` می‌دهد تا همان login بتواند `SET LOCAL ROLE` اجرا کند. اگر migration و runtime با دو login متفاوت اجرا می‌شوند، مدیر دیتابیس باید یک‌بار اجرا کند:

```sql
grant gavapp_app to RUNTIME_DATABASE_ROLE;
```

نام واقعی role را در source code یا log عمومی قرار ندهید. `CONNECT` روی database جاری، `USAGE` روی schema و enumها، مجوز sequenceها، CRUD جدول‌های اپ و فقط `SELECT` محدودشده با RLS روی `user_roles` داده شده است؛ هیچ مجوزی روی `users`، `accounts`، `sessions` و `verifications` ندارد.

## تعیین اولین ادمین

ابتدا کاربر باید یک‌بار با Google یا ایمیل وارد شود تا ردیف `users` ساخته شود. سپس فقط از اتصال مدیریتی دیتابیس، نقش او را ارتقا دهید:

```sql
begin;
update public.user_roles
set role = 'admin', updated_at = now()
where user_id = (
  select id from public.users where lower(email) = lower($$ADMIN_EMAIL$$)
);
commit;
```

`ADMIN_EMAIL` در بالا placeholder است؛ ایمیل واقعی را در فایل migration یا log قرار ندهید. endpoint عمومی برای تغییر `user_roles` نسازید.

## انتقال داده

- `migration_runs` برای idempotency انتقال داده هر کاربر باقی مانده است و کلید `(user_id, migration_key)` یکتا است.
- ابتدا کاربران Better Auth را با همان شناسه متنی کاربران Supabase وارد کنید؛ سپس `profiles` و سایر جدول‌های وابسته منتقل شوند.
- روی conflict فقط رکورد همان کاربر و کلید پایدار (`legacy_id`، `client_id` یا کلید بودجه) را upsert کنید.
- Supabase را تا پایان مقایسه تعداد رکوردها، آزمایش ورود Google و rollback drill خاموش نکنید.

## تفاوت با Supabase

این schema هیچ ارجاعی به `auth.users`، `auth.uid()`، نقش‌های `authenticated`/`anon` یا Service Role ندارد. PostgreSQL به‌تنهایی Google OAuth یا ارسال ایمیل را انجام نمی‌دهد؛ آن بخش‌ها توسط Better Auth در backend انجام می‌شوند. کلیدهای Google و `BETTER_AUTH_SECRET` فقط secretهای backend هستند.
