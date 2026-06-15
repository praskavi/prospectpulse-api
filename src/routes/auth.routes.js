import express from 'express';
import {
  createUser,
  getMe,
  loginUser,
  logoutUser,
  requestPasswordReset,
  resetPassword,
} from '../controllers/signup.controller.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/signup', createUser);
router.post('/login', loginUser);
router.post('/logout', logoutUser);
router.post('/password/forgot', requestPasswordReset);
router.post('/password/reset', resetPassword);
router.get('/me', requireAuth, getMe);

export default router;
