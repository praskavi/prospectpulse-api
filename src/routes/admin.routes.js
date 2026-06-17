import express from 'express';
import supabase, { supabaseAuth } from '../config/supabaseClient.js';
import { AppError } from '../middleware/errorHandler.js';
import { stripeWebhookQueue } from '../queues/stripeWebhook.queue.js';
import { listStripeWebhookEvents } from '../services/stripeWebhookEvents.service.js';

const router = express.Router();

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

function toPositiveInt(value, fallback = DEFAULT_LIMIT) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function pageRange(query) {
  const limit = Math.min(toPositiveInt(query.limit), MAX_LIMIT);
  const page = toPositiveInt(query.page, 1);
  const from = (page - 1) * limit;
  return { limit, page, from, to: from + limit - 1 };
}

function dayAgoIso() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

function stuckCutoffIso() {
  return new Date(Date.now() - 15 * 60 * 1000).toISOString();
}

async function countRows(table, apply = query => query) {
  const { count, error } = await apply(
    supabase.from(table).select('*', { count: 'exact', head: true }),
  );

  if (error) throw error;
  return count || 0;
}

async function listAuthUsersById(userIds) {
  const uniqueIds = [...new Set((userIds || []).filter(Boolean))];
  if (!uniqueIds.length || !supabaseAuth?.auth?.admin) return new Map();

  const usersById = new Map();
  let page = 1;
  const perPage = 100;

  while (page <= 20 && usersById.size < uniqueIds.length) {
    const { data, error } = await supabaseAuth.auth.admin.listUsers({ page, perPage });
    if (error) break;

    for (const user of data?.users || []) {
      if (uniqueIds.includes(user.id)) {
        usersById.set(user.id, user);
      }
    }

    if (!data?.users?.length || data.users.length < perPage) break;
    page += 1;
  }

  return usersById;
}

function enrichWithEmail(rows, usersById) {
  return rows.map(row => ({
    ...row,
    email: usersById.get(row.id || row.user_id)?.email || null,
  }));
}

router.get('/overview', async (req, res, next) => {
  try {
    const since = dayAgoIso();
    const stuckCutoff = stuckCutoffIso();

    const [
      totalUsers,
      freeUsers,
      starterUsers,
      growthUsers,
      zeroCreditUsers,
      searchesLast24h,
      failedLast24h,
      stuckRunning,
      failedWebhooksLast24h,
      recentFailed,
      recentTransactions,
      recentWebhookFailures,
    ] = await Promise.all([
      countRows('profiles'),
      countRows('profiles', q => q.eq('plan_code', 'free')),
      countRows('profiles', q => q.eq('plan_code', 'starter')),
      countRows('profiles', q => q.eq('plan_code', 'growth')),
      countRows('profiles', q => q.lte('credits_remaining', 0)),
      countRows('searches', q => q.gte('created_at', since)),
      countRows('searches', q => q.eq('search_status', 'failed').gte('created_at', since)),
      countRows('searches', q => q.eq('search_status', 'running').lt('created_at', stuckCutoff)),
      countRows('stripe_webhook_events', q => q.eq('status', 'failed').gte('updated_at', since)),
      supabase
        .from('searches')
        .select('id,user_id,business_category,location,search_status,created_at,estimated_credits,actual_credits')
        .eq('search_status', 'failed')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('credit_transactions')
        .select('id,user_id,transaction_type,credits,description,created_at,related_search_id')
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('stripe_webhook_events')
        .select('stripe_event_id,event_type,status,attempts,error_message,received_at,updated_at')
        .eq('status', 'failed')
        .order('updated_at', { ascending: false })
        .limit(5),
    ]);

    if (recentFailed.error) throw recentFailed.error;
    if (recentTransactions.error) throw recentTransactions.error;
    if (recentWebhookFailures.error) throw recentWebhookFailures.error;

    res.status(200).json({
      success: true,
      data: {
        admin: req.admin,
        users: {
          total: totalUsers,
          free: freeUsers,
          starter: starterUsers,
          growth: growthUsers,
          zeroCredits: zeroCreditUsers,
        },
        searches: {
          last24h: searchesLast24h,
          failedLast24h,
          stuckRunning,
        },
        webhooks: {
          failedLast24h: failedWebhooksLast24h,
        },
        recentFailedSearches: recentFailed.data || [],
        recentTransactions: recentTransactions.data || [],
        recentWebhookFailures: recentWebhookFailures.data || [],
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    const { page, limit, from, to } = pageRange(req.query);
    let query = supabase
      .from('profiles')
      .select(
        'id,full_name,plan_code,credits_remaining,stripe_customer_id,last_paid_plan_code,subscription_cancelled_at,subscription_cancel_at,free_plan_eligible_at,created_at',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    if (req.query.plan) query = query.eq('plan_code', req.query.plan);
    if (req.query.zeroCredits === 'true') query = query.lte('credits_remaining', 0);
    if (req.query.hasStripeCustomer === 'true') query = query.not('stripe_customer_id', 'is', null);
    if (req.query.hasStripeCustomer === 'false') query = query.is('stripe_customer_id', null);
    if (req.query.cancelled === 'true') query = query.not('subscription_cancelled_at', 'is', null);
    if (req.query.lockout === 'true') query = query.not('free_plan_eligible_at', 'is', null);

    const { data, error, count } = await query;
    if (error) throw error;

    const usersById = await listAuthUsersById((data || []).map(row => row.id));
    let rows = enrichWithEmail(data || [], usersById);

    if (req.query.email) {
      const needle = String(req.query.email).toLowerCase();
      rows = rows.filter(row => String(row.email || '').toLowerCase().includes(needle));
    }

    res.status(200).json({
      success: true,
      data: rows,
      meta: { page, limit, total: count || rows.length },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const [profile, searches, transactions] = await Promise.all([
      supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('searches')
        .select('id,business_category,location,search_status,estimated_credits,actual_credits,businesses_found,contacts_found,created_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('credit_transactions')
        .select('id,transaction_type,credits,description,created_at,related_search_id')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    if (profile.error) throw profile.error;
    if (!profile.data) throw new AppError('User profile not found.', 404);
    if (searches.error) throw searches.error;
    if (transactions.error) throw transactions.error;

    const usersById = await listAuthUsersById([id]);

    res.status(200).json({
      success: true,
      data: {
        profile: {
          ...profile.data,
          email: usersById.get(id)?.email || null,
        },
        searches: searches.data || [],
        transactions: transactions.data || [],
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/searches', async (req, res, next) => {
  try {
    const { page, limit, from, to } = pageRange(req.query);
    let query = supabase
      .from('searches')
      .select(
        'id,user_id,business_category,location,max_results,search_status,estimated_credits,actual_credits,businesses_found,contacts_found,created_at,expires_at',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    if (req.query.status) query = query.eq('search_status', req.query.status);
    if (req.query.userId) query = query.eq('user_id', req.query.userId);
    if (req.query.category) query = query.ilike('business_category', `%${req.query.category}%`);
    if (req.query.location) query = query.ilike('location', `%${req.query.location}%`);
    if (req.query.failedOnly === 'true') query = query.eq('search_status', 'failed');
    if (req.query.stuck === 'true') {
      query = query.eq('search_status', 'running').lt('created_at', stuckCutoffIso());
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const usersById = await listAuthUsersById((data || []).map(row => row.user_id));
    const rows = (data || []).map(row => ({
      ...row,
      email: usersById.get(row.user_id)?.email || null,
    }));

    res.status(200).json({
      success: true,
      data: rows,
      meta: { page, limit, total: count || 0 },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/searches/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const [search, results] = await Promise.all([
      supabase.from('searches').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('search_results')
        .select('id,business_name,business_type,city,state,phone,website,rating,owner_name,email,linkedin_url,contact_unlocked,created_at')
        .eq('search_id', id)
        .order('created_at', { ascending: true })
        .limit(25),
    ]);

    if (search.error) throw search.error;
    if (!search.data) throw new AppError('Search not found.', 404);
    if (results.error) throw results.error;

    const usersById = await listAuthUsersById([search.data.user_id]);

    res.status(200).json({
      success: true,
      data: {
        search: {
          ...search.data,
          email: usersById.get(search.data.user_id)?.email || null,
        },
        results: results.data || [],
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/transactions', async (req, res, next) => {
  try {
    const { page, limit, from, to } = pageRange(req.query);
    let query = supabase
      .from('credit_transactions')
      .select('id,user_id,transaction_type,credits,description,created_at,related_search_id', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (req.query.userId) query = query.eq('user_id', req.query.userId);
    if (req.query.type) query = query.eq('transaction_type', req.query.type);
    if (req.query.positive === 'true') query = query.gte('credits', 0);
    if (req.query.negative === 'true') query = query.lt('credits', 0);

    const { data, error, count } = await query;
    if (error) throw error;

    const usersById = await listAuthUsersById((data || []).map(row => row.user_id));
    const rows = (data || []).map(row => ({
      ...row,
      email: usersById.get(row.user_id)?.email || null,
    }));

    res.status(200).json({
      success: true,
      data: rows,
      meta: { page, limit, total: count || 0 },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/billing/health', async (req, res, next) => {
  try {
    const [paidMissingStripe, freeWithStripe, fakeStripeIds, cancellationLockouts] = await Promise.all([
      supabase
        .from('profiles')
        .select('id,plan_code,credits_remaining,stripe_customer_id,last_paid_plan_code')
        .in('plan_code', ['starter', 'growth'])
        .is('stripe_customer_id', null)
        .limit(25),
      supabase
        .from('profiles')
        .select('id,plan_code,credits_remaining,stripe_customer_id,last_paid_plan_code')
        .eq('plan_code', 'free')
        .not('stripe_customer_id', 'is', null)
        .limit(25),
      supabase
        .from('profiles')
        .select('id,plan_code,credits_remaining,stripe_customer_id,last_paid_plan_code')
        .like('stripe_customer_id', 'cus_TEST%')
        .limit(25),
      supabase
        .from('profiles')
        .select('id,plan_code,credits_remaining,stripe_customer_id,subscription_cancelled_at,free_plan_eligible_at,last_paid_plan_code')
        .not('free_plan_eligible_at', 'is', null)
        .limit(25),
    ]);

    for (const result of [paidMissingStripe, freeWithStripe, fakeStripeIds, cancellationLockouts]) {
      if (result.error) throw result.error;
    }

    res.status(200).json({
      success: true,
      data: {
        paidMissingStripe: paidMissingStripe.data || [],
        freeWithStripe: freeWithStripe.data || [],
        fakeStripeIds: fakeStripeIds.data || [],
        cancellationLockouts: cancellationLockouts.data || [],
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/webhooks', async (req, res, next) => {
  try {
    const { page, limit } = pageRange(req.query);
    const { data, error, count } = await listStripeWebhookEvents({
      page,
      limit,
      status: req.query.status,
      eventType: req.query.eventType,
    });

    if (error) throw error;

    res.status(200).json({
      success: true,
      data: data || [],
      meta: { page, limit, total: count || 0 },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/system/health', async (req, res, next) => {
  try {
    const [profiles, searches, transactions, webhookCounts] = await Promise.all([
      countRows('profiles'),
      countRows('searches'),
      countRows('credit_transactions'),
      stripeWebhookQueue
        .getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed')
        .then(counts => ({ status: 'ok', counts }))
        .catch(error => ({
          status: 'error',
          error: error.message,
        })),
    ]);

    res.status(200).json({
      success: true,
      data: {
        api: 'ok',
        database: 'ok',
        checkedAt: new Date().toISOString(),
        counts: { profiles, searches, transactions },
        redis: {
          status: webhookCounts.status,
          queue: 'stripe-webhooks',
          counts: webhookCounts.counts || null,
          error: webhookCounts.error || null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
