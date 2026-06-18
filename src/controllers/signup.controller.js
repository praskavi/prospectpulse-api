// supabase auth controller for handling user signup and login
// Auth operations (signUp, signIn, signOut) use supabaseAuth — the dedicated
// auth client — so the DB client's session is never set to a user token and
// service-role RLS bypass stays intact for all database operations.
import supabase, { supabaseAuth } from '../config/supabaseClient.js';
import { AppError } from '../middleware/errorHandler.js';
import { getPublicAppUrl } from '../utils/appUrl.js';

export async function createUser(req, res, next) {
  try {
    const { name, email, password } = req.body;
    const emailRedirectTo = `${getPublicAppUrl(req)}/confirm.html`;

    const { data, error } = await supabaseAuth.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: {
          full_name: name,
        },
      },
    });

    if (error) {
      throw new AppError(error.message, 400);
    }

    res.status(201).json({
      status: 'success',
      message: 'Account created. Please confirm your email to continue.',
      data: {
        user: data.user,
        emailRedirectTo,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function loginUser(req, res, next) {
  try {
    const { email, password } = req.body;

    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new AppError(error.message, 401);
    }

    res.status(200).json({
      status: 'success',
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function requestPasswordReset(req, res, next) {
  try {
    const { email } = req.body;

    if (!email) {
      throw new AppError('Email is required.', 400);
    }

    const emailRedirectTo = `${getPublicAppUrl(req)}/reset-password.html`;
    const { error } = await supabaseAuth.auth.resetPasswordForEmail(email, {
      redirectTo: emailRedirectTo,
    });

    if (error) {
      throw new AppError(error.message, 400);
    }

    res.status(200).json({
      status: 'success',
      message: 'If an account exists for that email, a password reset link has been sent.',
    });
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const { accessToken, password } = req.body;

    if (!accessToken) {
      throw new AppError('Password reset token is required.', 400);
    }

    if (!password || password.length < 6) {
      throw new AppError('Password must be at least 6 characters.', 400);
    }

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(accessToken);

    if (userError || !user) {
      throw new AppError('Password reset link is invalid or expired.', 401);
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password,
    });

    if (updateError) {
      throw new AppError(updateError.message, 400);
    }

    res.status(200).json({
      status: 'success',
      message: 'Password updated. You can now sign in.',
    });
  } catch (error) {
    next(error);
  }
}

export async function getMe(req, res, next) {
  try {
    // Prevent browser caching — credits change after every scan.
    res.set('Cache-Control', 'no-store');

    const { data: profile } = await supabase
      .from('profiles')
      .select('free_plan_eligible_at, subscription_cancelled_at, subscription_cancel_at, last_paid_plan_code')
      .eq('id', req.user.id)
      .maybeSingle();

    res.status(200).json({
      success: true,
      data: {
        id:      req.user.id,
        email:   req.user.email,
        plan:    req.user.plan,
        credits: req.user.credits,
        freePlanEligibleAt: profile?.free_plan_eligible_at || null,
        subscriptionCancelledAt: profile?.subscription_cancelled_at || null,
        subscriptionCancelAt: profile?.subscription_cancel_at || null,
        lastPaidPlan: profile?.last_paid_plan_code || null,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function logoutUser(req, res, next) {
  try {
    const { error } = await supabaseAuth.auth.signOut();

    if (error) {
      throw new AppError(error.message, 400);
    }

    res.status(200).json({
      status: 'success',
      message: 'Logged out',
    });
  } catch (error) {
    next(error);
  }
}

export async function getTransactions(req, res, next) {
  try {
    res.set('Cache-Control', 'no-store');

    const { data, error } = await supabase
      .from('credit_transactions')
      .select('id, transaction_type, credits, description, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    res.status(200).json({ success: true, data: data ?? [] });
  } catch (error) {
    next(error);
  }
}
