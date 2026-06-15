// JWT auth middleware — verifies Supabase access token from Authorization header.
// Sets req.user = { id, email, plan, credits } for downstream handlers.
// Falls back to DEV_USER_ID in development when no token is present.

import supabase, { supabaseAuth } from '../config/supabaseClient.js';
import { AppError } from './errorHandler.js';
import { DEFAULT_PLAN, PLAN_LIMITS } from '../config/plans.js';

const DEV_USER_ID = process.env.DEV_USER_ID;
const IS_DEV      = process.env.NODE_ENV !== 'production';

async function ensureProfile(user) {
  const { data: existingProfile, error: readError } = await supabase
    .from('profiles')
    .select('id, full_name, plan_code, credits_remaining')
    .eq('id', user.id)
    .maybeSingle();

  if (readError) {
    throw new AppError(`Could not load profile: ${readError.message}`, 500);
  }

  if (existingProfile) return existingProfile;

  const fullName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'New user';

  const defaultCredits = PLAN_LIMITS[DEFAULT_PLAN]?.credits || 0;

  const { data: newProfile, error: insertError } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      full_name: fullName,
      plan_code: DEFAULT_PLAN,
      credits_remaining: defaultCredits,
    })
    .select('id, full_name, plan_code, credits_remaining')
    .single();

  if (insertError) {
    throw new AppError(`Could not create profile: ${insertError.message}`, 500);
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
