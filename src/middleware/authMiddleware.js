// JWT auth middleware — verifies Supabase access token from Authorization header.
// Sets req.user = { id, email, plan, credits } for downstream handlers.
// Falls back to DEV_USER_ID in development when no token is present.

import supabase, { supabaseAuth } from '../config/supabaseClient.js';
import { AppError } from './errorHandler.js';
import { DEFAULT_PLAN, FREE_TRIAL_REENROLL_DAYS, PLAN_LIMITS } from '../config/plans.js';

const DEV_USER_ID = process.env.DEV_USER_ID;
const IS_DEV      = process.env.NODE_ENV !== 'production';

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function getFreeTrialGrant({ email, userId }) {
  const normalizedEmail = normalizeEmail(email);
  const now = new Date();
  const nextEligibleAt = addDays(now, FREE_TRIAL_REENROLL_DAYS);
  const defaultGrant = {
    eligible: true,
    credits: PLAN_LIMITS.free.credits,
    startedAt: now,
    eligibleAt: nextEligibleAt,
  };

  if (!normalizedEmail) return defaultGrant;

  const { data: enrollment, error: readError } = await supabase
    .from('free_trial_enrollments')
    .select('trial_started_at, trial_eligible_at')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (readError) {
    console.warn('[free-trial] Could not read free_trial_enrollments. Apply migration 202606160006.', readError.message);
    return defaultGrant;
  }

  const existingEligibleAt = enrollment?.trial_eligible_at
    ? new Date(enrollment.trial_eligible_at)
    : null;

  if (existingEligibleAt && existingEligibleAt > now) {
    return {
      eligible: false,
      credits: 0,
      startedAt: enrollment.trial_started_at ? new Date(enrollment.trial_started_at) : null,
      eligibleAt: existingEligibleAt,
    };
  }

  const { error: upsertError } = await supabase
    .from('free_trial_enrollments')
    .upsert({
      email: normalizedEmail,
      user_id: userId,
      trial_started_at: now.toISOString(),
      trial_eligible_at: nextEligibleAt.toISOString(),
      updated_at: now.toISOString(),
    }, { onConflict: 'email' });

  if (upsertError) {
    console.warn('[free-trial] Could not record free trial enrollment.', upsertError.message);
  }

  return defaultGrant;
}

async function ensureProfile(user) {
  let { data: existingProfile, error: readError } = await supabase
    .from('profiles')
    .select('id, full_name, plan_code, credits_remaining, free_trial_started_at, free_trial_eligible_at')
    .eq('id', user.id)
    .maybeSingle();

  if (readError) {
    const fallback = await supabase
      .from('profiles')
      .select('id, full_name, plan_code, credits_remaining')
      .eq('id', user.id)
      .maybeSingle();

    existingProfile = fallback.data;
    readError = fallback.error;
  }

  if (readError) {
    throw new AppError(`Could not load profile: ${readError.message}`, 500);
  }

  if (existingProfile) return existingProfile;

  const fullName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'New user';

  const trialGrant = await getFreeTrialGrant({
    email: user.email,
    userId: user.id,
  });

  const profileFields = {
    id: user.id,
    full_name: fullName,
    plan_code: DEFAULT_PLAN,
    credits_remaining: trialGrant.credits,
    free_trial_started_at: trialGrant.startedAt?.toISOString() || null,
    free_trial_eligible_at: trialGrant.eligibleAt?.toISOString() || null,
  };

  let { data: newProfile, error: insertError } = await supabase
    .from('profiles')
    .insert(profileFields)
    .select('id, full_name, plan_code, credits_remaining, free_trial_started_at, free_trial_eligible_at')
    .single();

  if (insertError) {
    console.warn('[free-trial] Could not insert trial metadata on profile. Apply migration 202606160006.', insertError.message);

    const fallback = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        full_name: fullName,
        plan_code: DEFAULT_PLAN,
        credits_remaining: trialGrant.credits,
      })
    .select('id, full_name, plan_code, credits_remaining')
    .single();

    newProfile = fallback.data;
    insertError = fallback.error;
  }

  if (insertError) {
    throw new AppError(`Could not create profile: ${insertError.message}`, 500);
  }

  if (!trialGrant.eligible) {
    console.log(
      `[free-trial] Created restricted Free profile for ${user.email}; ` +
      `next trial eligible at ${trialGrant.eligibleAt.toISOString()}`,
    );
  }

  return newProfile;
}

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    // Development fallback — skip token check if DEV_USER_ID is set and no token provided
    if (!token && IS_DEV && DEV_USER_ID) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, plan_code, credits_remaining')
        .eq('id', DEV_USER_ID)
        .maybeSingle();

      req.user = profile
        ? { id: profile.id, email: 'dev@local', plan: profile.plan_code, credits: profile.credits_remaining }
        : { id: DEV_USER_ID, email: 'dev@local', plan: DEFAULT_PLAN, credits: 1000 };
      return next();
    }

    if (!token) throw new AppError('Missing Authorization header', 401);

    // Verify token using the dedicated auth client — never the DB client,
    // so getUser() can't pollute the DB client's session state and trigger RLS.
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

    if (error || !user) throw new AppError('Invalid or expired token', 401);

    const profile = await ensureProfile(user);

    req.user = {
      id: profile.id,
      email: user.email,
      plan: profile.plan_code || DEFAULT_PLAN,
      credits: profile.credits_remaining || 0,
    };
    next();
  } catch (error) {
    next(error);
  }
}
