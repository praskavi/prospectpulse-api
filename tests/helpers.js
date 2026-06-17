import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const supabaseAuthAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Test user constants ──────────────────────────────────────────────────────
export const TEST_USERS = {
  free: {
    id: 'aaaaaaaa-0001-0001-0001-000000000001',
    email: 'test-free@prospectpulse.test',
    plan: 'free',
    credits: 100,
  },
  starter: {
    id: 'aaaaaaaa-0002-0002-0002-000000000002',
    email: 'test-starter@prospectpulse.test',
    plan: 'starter',
    credits: 1000,
  },
  growth: {
    id: 'aaaaaaaa-0003-0003-0003-000000000003',
    email: 'test-growth@prospectpulse.test',
    plan: 'growth',
    credits: 2500,
  },
  zerocredits: {
    id: 'aaaaaaaa-0004-0004-0004-000000000004',
    email: 'test-zerocredits@prospectpulse.test',
    plan: 'free',
    credits: 0,
  },
  cancelled: {
    id: 'aaaaaaaa-0005-0005-0005-000000000005',
    email: 'test-cancelled@prospectpulse.test',
    plan: 'free',
    credits: 0,
  },
};

export const ADMIN_USER = {
  id: 'da428e19-27a8-47fd-a5c9-b43014a9accf',
  email: 'dittprashant@gmail.com',
};

// ── Auth helpers ─────────────────────────────────────────────────────────────

/**
 * Get a real Supabase JWT for a test user via signInWithPassword.
 * Tokens are cached per email within a test run so each describe block
 * doesn't hammer Supabase auth on every beforeAll.
 */
const tokenCache = new Map();

export async function getToken(email, password = 'TestPass123!') {
  if (tokenCache.has(email)) return tokenCache.get(email);

  const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`getToken failed for ${email}: ${error.message}`);

  const token = data.session.access_token;
  tokenCache.set(email, token);
  return token;
}

export async function getMagicLinkToken(email) {
  const cacheKey = `magic:${email}`;
  if (tokenCache.has(cacheKey)) return tokenCache.get(cacheKey);

  const { data: linkData, error: linkError } = await supabaseAuthAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (linkError) throw new Error(`getMagicLinkToken link failed for ${email}: ${linkError.message}`);

  const tokenHash = linkData?.properties?.hashed_token;
  if (!tokenHash) throw new Error(`getMagicLinkToken failed for ${email}: missing token hash`);

  const { data: verifyData, error: verifyError } = await supabaseAuthAdmin.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  });

  if (verifyError) throw new Error(`getMagicLinkToken verify failed for ${email}: ${verifyError.message}`);

  const token = verifyData.session.access_token;
  tokenCache.set(cacheKey, token);
  return token;
}

// ── Profile helpers ──────────────────────────────────────────────────────────

export async function resetProfile(userId, fields) {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update(fields)
    .eq('id', userId);
  if (error) throw new Error(`resetProfile(${userId}) failed: ${error.message}`);
}

export async function getProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw new Error(`getProfile(${userId}) failed: ${error.message}`);
  return data;
}

// ── Search / result helpers ──────────────────────────────────────────────────

export async function cleanupTestSearches(userId) {
  // search_results cascade-delete when searches are deleted (FK)
  const { error } = await supabaseAdmin
    .from('searches')
    .delete()
    .eq('user_id', userId);
  if (error) console.warn(`cleanupTestSearches(${userId}): ${error.message}`);
}

/**
 * Insert a completed search + one search_result for a user.
 * Returns { search, result } so tests can reference the IDs.
 */
export async function seedSearchResult(userId, overrides = {}) {
  const { data: search, error: searchErr } = await supabaseAdmin
    .from('searches')
    .insert({
      user_id: userId,
      business_category: 'test-category',
      location: 'Test City, TS',
      max_results: 1,
      search_status: 'completed',
      estimated_credits: 2,
      actual_credits: 2,
      businesses_found: 1,
      contacts_found: 1,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    .select()
    .single();

  if (searchErr) throw new Error(`seedSearchResult — search insert failed: ${searchErr.message}`);

  const { data: result, error: resultErr } = await supabaseAdmin
    .from('search_results')
    .insert({
      search_id: search.id,
      business_name: 'Seed Business Pty Ltd',
      owner_name: 'Jane Seed',
      email: 'jane@seedbusiness.com',
      linkedin_url: 'https://linkedin.com/in/janeseed',
      contact_unlocked: overrides.contact_unlocked ?? false,
    })
    .select()
    .single();

  if (resultErr) throw new Error(`seedSearchResult — result insert failed: ${resultErr.message}`);

  return { search, result };
}

export async function cleanupSupportTickets(email = '@prospectpulse.test') {
  const { error } = await supabaseAdmin
    .from('support_tickets')
    .delete()
    .ilike('email', `%${email}%`);

  if (error) console.warn(`cleanupSupportTickets(${email}): ${error.message}`);
}

export async function seedSupportTicket(overrides = {}) {
  const timestamp = Date.now().toString(36).toUpperCase();
  const { data, error } = await supabaseAdmin
    .from('support_tickets')
    .insert({
      ticket_id: overrides.ticket_id || `SUP-TEST-${timestamp}`,
      status: overrides.status || 'open',
      priority: overrides.priority || 'normal',
      category: overrides.category || 'billing',
      email: overrides.email || `support-${timestamp.toLowerCase()}@prospectpulse.test`,
      name: overrides.name || 'Support Test',
      subject: overrides.subject || 'Support ticket test',
      message: overrides.message || 'This seeded support ticket is used by the admin API test suite.',
      profile_id: overrides.profile_id || null,
      source: overrides.source || 'vitest',
      n8n_status: overrides.n8n_status || 'skipped',
    })
    .select()
    .single();

  if (error) throw new Error(`seedSupportTicket failed: ${error.message}`);
  return data;
}
