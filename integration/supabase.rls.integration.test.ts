import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const environment = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env || {};
const enabled = environment.RUN_SUPABASE_INTEGRATION === '1' && Boolean(environment.SUPABASE_URL && environment.SUPABASE_ANON_KEY && environment.SUPABASE_SERVICE_ROLE_KEY);
const integrationSuite = enabled ? describe : describe.skip;

integrationSuite('Supabase RLS integration', () => {
  let service: SupabaseClient;
  let userA: SupabaseClient;
  let userB: SupabaseClient;
  let admin: SupabaseClient;
  let userAId = '';
  let userBId = '';
  let adminId = '';
  const password = `T3st-${Date.now()}-Safe!`;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  beforeAll(async () => {
    const url = environment.SUPABASE_URL!;
    const anonKey = environment.SUPABASE_ANON_KEY!;
    service = createClient(url, environment.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const create = async (label: string) => {
      const email = `gav-rls-${label}-${suffix}@example.com`;
      const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) throw error || new Error('test user was not created');
      return { id: data.user.id, email };
    };
    const a = await create('a');
    const b = await create('b');
    const root = await create('admin');
    userAId = a.id;
    userBId = b.id;
    adminId = root.id;
    const { error: roleError } = await service.from('user_roles').update({ role: 'admin' }).eq('user_id', adminId);
    if (roleError) throw roleError;
    const signIn = async (email: string) => {
      const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return client;
    };
    [userA, userB, admin] = await Promise.all([signIn(a.email), signIn(b.email), signIn(root.email)]);
  }, 30_000);

  afterAll(async () => {
    if (!service) return;
    if (userAId) await service.from('transactions').delete().eq('user_id', userAId);
    if (adminId) await service.from('design_review_comments').delete().eq('created_by', adminId);
    for (const id of [userAId, userBId, adminId].filter(Boolean)) await service.auth.admin.deleteUser(id);
  }, 30_000);

  it('lets an owner persist idempotently without duplicates', async () => {
    const row = { user_id: userAId, legacy_id: 'integration-one', title: 'RLS test', category_name: 'سایر', amount: 1000, type: 'expense', transaction_date: '2026-09-15' };
    expect((await userA.from('transactions').upsert(row, { onConflict: 'user_id,legacy_id' })).error).toBeNull();
    expect((await userA.from('transactions').upsert({ ...row, amount: 2000 }, { onConflict: 'user_id,legacy_id' })).error).toBeNull();
    const { data, error } = await userA.from('transactions').select('amount').eq('legacy_id', 'integration-one');
    expect(error).toBeNull();
    expect(data).toEqual([{ amount: 2000 }]);
  });

  it('isolates two users and rejects cross-user writes', async () => {
    const { data } = await userB.from('transactions').select('legacy_id').eq('user_id', userAId);
    expect(data).toEqual([]);
    const { error } = await userB.from('transactions').insert({ user_id: userAId, legacy_id: 'forbidden', title: 'forbidden', category_name: 'سایر', amount: 1, type: 'expense', transaction_date: '2026-09-15' });
    expect(error).not.toBeNull();
  });

  it('prevents self-promotion', async () => {
    await userB.from('user_roles').update({ role: 'admin' }).eq('user_id', userBId);
    const { data, error } = await service.from('user_roles').select('role').eq('user_id', userBId).single();
    expect(error).toBeNull();
    expect(data?.role).toBe('user');
  });

  it('allows a database Admin to inspect user records', async () => {
    const { data, error } = await admin.from('transactions').select('legacy_id,user_id').eq('user_id', userAId);
    expect(error).toBeNull();
    expect(data?.some(row => row.legacy_id === 'integration-one')).toBe(true);
  });

  it('keeps design review comments completely hidden from regular users', async () => {
    const { data, error } = await userA.from('design_review_comments').select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { error: insertError } = await userA.from('design_review_comments').insert({
      page_key: 'dashboard',
      comment_text: 'این رکورد نباید ساخته شود',
      priority: 'high',
      status: 'open',
      created_by: userAId,
    });
    expect(insertError).not.toBeNull();
  });

  it('allows a verified database Admin to manage design review comments', async () => {
    const { data: created, error: createError } = await admin.from('design_review_comments').insert({
      page_key: 'dashboard',
      component_key: 'کارت‌های خلاصه',
      comment_text: 'بازخورد تست یکپارچه',
      priority: 'medium',
      status: 'open',
      created_by: adminId,
    }).select('id').single();
    expect(createError).toBeNull();
    expect(created?.id).toBeTruthy();

    const { data: updated, error: updateError } = await admin.from('design_review_comments')
      .update({ status: 'resolved', priority: 'high' })
      .eq('id', created!.id)
      .select('status,priority')
      .single();
    expect(updateError).toBeNull();
    expect(updated).toEqual({ status: 'resolved', priority: 'high' });

    const { error: deleteError } = await admin.from('design_review_comments').delete().eq('id', created!.id);
    expect(deleteError).toBeNull();
  });
});
