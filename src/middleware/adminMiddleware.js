import supabase from '../config/supabaseClient.js';
import { AppError } from './errorHandler.js';

export async function requireAdmin(req, res, next) {
  try {
    if (!req.user?.id) {
      throw new AppError('Admin access requires authentication.', 401);
    }

    const { data: admin, error } = await supabase
      .from('admin_users')
      .select('user_id, email, role')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) {
      throw new AppError(`Could not verify admin access: ${error.message}`, 500);
    }

    if (!admin) {
      throw new AppError('Admin access required.', 403);
    }

    req.admin = {
      userId: admin.user_id,
      email: admin.email,
      role: admin.role,
    };

    next();
  } catch (error) {
    next(error);
  }
}