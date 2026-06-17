import express from 'express';
import {
  createCheckoutSession,
  createPortalSession,
  getBillingPlans,
} from '../controllers/billing.controller.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/billing/plans', getBillingPlans);

// Checkout session — authenticated, JSON body
router.post('/billing/checkout', requireAuth, createCheckoutSession);

// Customer Portal — billing management, cancel subscription, download invoices
router.post('/billing/portal', requireAuth, createPortalSession);

// Stripe webhook — raw body (registered in server.js BEFORE express.json())
// The webhook endpoint is registered directly in server.js to intercept before json parsing.

export default router;
