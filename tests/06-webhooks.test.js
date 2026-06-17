import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';

// Mock only the queue — real Stripe SDK handles signature verification
vi.mock('../src/queues/stripeWebhook.queue.js', () => ({
  enqueueStripeWebhookEvent: vi.fn().mockResolvedValue({ id: 'job-mock-1' }),
}));

import { app } from '../src/app.js';
import { processStripeWebhookEvent } from '../src/services/stripeBilling.service.js';
import { getProfile, resetProfile, TEST_USERS } from './helpers.js';

// ── Test customer IDs — set on profiles so the service can look them up ─────
const GROWTH_CUSTOMER  = 'cus_webhook_test_growth';
const STARTER_CUSTOMER = 'cus_webhook_test_starter';

// ── Webhook signature helper (matches Stripe's own algorithm) ───────────────
function signWebhookPayload(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return { header: `t=${timestamp},v1=${signature}`, timestamp };
}

describe('06 – Stripe Webhooks', () => {
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  const STARTER_PRICE  = process.env.STRIPE_PRICE_STARTER;
  const GROWTH_PRICE   = process.env.STRIPE_PRICE_GROWTH;

  // ── HTTP endpoint: signature verification ──────────────────────────────

  describe('Webhook endpoint – signature gate', () => {
    it('Missing stripe-signature header returns 400', async () => {
      const res = await request(app)
        .post('/api/webhooks/stripe')
        .type('application/json')
        .send(JSON.stringify({ type: 'ping' }));

      expect(res.status).toBe(400);
    });

    it('Tampered / wrong signature returns 400', async () => {
      const res = await request(app)
        .post('/api/webhooks/stripe')
        .type('application/json')
        .set('stripe-signature', 't=1234567890,v1=badhash000000000000000000000000000000000000000000000000000000000')
        .send(JSON.stringify({ type: 'ping' }));

      expect(res.status).toBe(400);
    });

    it('Valid signed event returns 200 + queued: true', async () => {
      const event = {
        id: 'evt_test_valid',
        type: 'customer.subscription.updated',
        data: { object: { customer: 'cus_ignore', items: { data: [] } } },
      };
      const payload = JSON.stringify(event);
      const { header } = signWebhookPayload(payload, WEBHOOK_SECRET);

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .type('application/json')
        .set('stripe-signature', header)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.queued).toBe(true);
    });
  });

  // ── Service unit tests: credit rule correctness ────────────────────────
  // These call processStripeWebhookEvent() directly — no HTTP, no queue.

  describe('processStripeWebhookEvent – credit rules', () => {
    beforeAll(async () => {
      await Promise.all([
        resetProfile(TEST_USERS.growth.id, {
          stripe_customer_id: GROWTH_CUSTOMER,
          plan_code: 'growth',
          credits_remaining: 2500,
          subscription_cancelled_at: null,
          subscription_cancel_at: null,
          free_plan_eligible_at: null,
        }),
        resetProfile(TEST_USERS.starter.id, {
          stripe_customer_id: STARTER_CUSTOMER,
          plan_code: 'starter',
          credits_remaining: 600,
          subscription_cancelled_at: null,
          subscription_cancel_at: null,
          free_plan_eligible_at: null,
        }),
      ]);
    });

    afterEach(async () => {
      // Restore both profiles after each sub-test
      await Promise.all([
        resetProfile(TEST_USERS.growth.id, {
          stripe_customer_id: GROWTH_CUSTOMER,
          plan_code: 'growth',
          credits_remaining: 2500,
          subscription_cancelled_at: null,
          subscription_cancel_at: null,
          free_plan_eligible_at: null,
        }),
        resetProfile(TEST_USERS.starter.id, {
          stripe_customer_id: STARTER_CUSTOMER,
          plan_code: 'starter',
          credits_remaining: 600,
          subscription_cancelled_at: null,
          subscription_cancel_at: null,
          free_plan_eligible_at: null,
        }),
      ]);
    });

    it('Growth → Starter downgrade resets credits to exactly 1000', async () => {
      await processStripeWebhookEvent({
        type: 'customer.subscription.updated',
        data: {
          object: {
            customer: GROWTH_CUSTOMER,
            cancel_at: null,
            cancel_at_period_end: false,
            current_period_end: null,
            items: { data: [{ price: { id: STARTER_PRICE } }] },
          },
        },
      });

      const profile = await getProfile(TEST_USERS.growth.id);
      expect(profile.plan_code).toBe('starter');
      expect(profile.credits_remaining).toBe(1000);
    });

    it('Starter → Growth upgrade adds 4000 to remaining balance (600 + 4000 = 4600)', async () => {
      await processStripeWebhookEvent({
        type: 'customer.subscription.updated',
        data: {
          object: {
            customer: STARTER_CUSTOMER,
            cancel_at: null,
            cancel_at_period_end: false,
            current_period_end: null,
            items: { data: [{ price: { id: GROWTH_PRICE } }] },
          },
        },
      });

      const profile = await getProfile(TEST_USERS.starter.id);
      expect(profile.plan_code).toBe('growth');
      expect(profile.credits_remaining).toBe(4600); // 600 remaining + 4000 Growth allocation
    });

    it('checkout.session.completed – sets plan to starter + 1000 credits', async () => {
      await resetProfile(TEST_USERS.free.id, {
        plan_code: 'free',
        credits_remaining: 50,
        stripe_customer_id: null,
      });

      await processStripeWebhookEvent({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_checkout',
            client_reference_id: TEST_USERS.free.id,
            customer: 'cus_checkout_test',
            metadata: { plan: 'starter', userId: TEST_USERS.free.id },
          },
        },
      });

      const profile = await getProfile(TEST_USERS.free.id);
      expect(profile.plan_code).toBe('starter');
      expect(profile.credits_remaining).toBe(1000);
      expect(profile.stripe_customer_id).toBe('cus_checkout_test');

      // Restore free user
      await resetProfile(TEST_USERS.free.id, {
        plan_code: 'free',
        credits_remaining: 100,
        stripe_customer_id: null,
      });
    });

    it('customer.subscription.deleted – downgrades to free, zeros credits, sets 30-day lockout', async () => {
      const cancelledAt = Math.floor(Date.now() / 1000);

      await processStripeWebhookEvent({
        type: 'customer.subscription.deleted',
        data: {
          object: {
            customer: GROWTH_CUSTOMER,
            canceled_at: cancelledAt,
          },
        },
      });

      const profile = await getProfile(TEST_USERS.growth.id);
      expect(profile.plan_code).toBe('free');
      expect(profile.credits_remaining).toBe(0);
      expect(profile.free_plan_eligible_at).toBeTruthy();

      // Lockout date should be ~30 days in the future
      const lockoutDate = new Date(profile.free_plan_eligible_at);
      const daysUntilEligible = (lockoutDate - new Date()) / (1000 * 60 * 60 * 24);
      expect(daysUntilEligible).toBeGreaterThan(28);
      expect(daysUntilEligible).toBeLessThan(32);
    });

    it('Scheduled cancellation – preserves plan/credits, sets subscription_cancel_at', async () => {
      const futureTs = Math.floor(Date.now() / 1000) + 30 * 86400; // 30 days from now

      await processStripeWebhookEvent({
        type: 'customer.subscription.updated',
        data: {
          object: {
            customer: STARTER_CUSTOMER,
            cancel_at: futureTs,
            cancel_at_period_end: false,
            current_period_end: null,
            items: { data: [{ price: { id: STARTER_PRICE } }] },
          },
        },
      });

      const profile = await getProfile(TEST_USERS.starter.id);
      // Plan and credits must NOT change during a scheduled cancellation
      expect(profile.plan_code).toBe('starter');
      expect(profile.credits_remaining).toBe(600);
      expect(profile.subscription_cancel_at).toBeTruthy();
    });
  });
});
