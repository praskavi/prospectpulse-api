import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = process.env.SUPABASE_URL;
const serviceRoleKey  = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const clientOptions = {
  auth: {
    autoRefreshToken:   false,
    persistSession:     false,
    detectSessionInUrl: false,
  },
};

// ── DB client — used for all database operations (INSERT, SELECT, UPDATE).
//    Never has auth.getUser() called on it, so its session stays clean.
//    Service role key bypasses RLS entirely.
const supabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, clientOptions)
  : null;

// ── Auth client — used ONLY in authMiddleware to verify user JWTs.
//    Kept separate so calling getUser(token) here never bleeds into
//    the DB client's session state.
export const supabaseAuth = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, clientOptions)
  : null;

export default supabase;
