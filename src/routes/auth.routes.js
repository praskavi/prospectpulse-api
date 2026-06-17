import express from 'express';
import {
  createUser,
  getMe,
  getTransactions,
  loginUser,
  logoutUser,
  requestPasswordReset,
  resetPassword,
} from '../controllers/signup.controller.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  loginSchema,
  signupSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../schemas/auth.schemas.js';

const router = express.Router();

router.post('/signup', validateRequest(signupSchema), createUser);
router.post('/login', validateRequest(loginSchema), loginUser);
router.post('/logout', logoutUser);
router.post('/password/forgot', validateRequest(forgotPasswordSchema), requestPasswordReset);
router.post('/password/reset', validateRequest(resetPasswordSchema), resetPassword);
router.get('/me', requireAuth, getMe);
router.get('/me/transactions', requireAuth, getTransactions);

export default router;
