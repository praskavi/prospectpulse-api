import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';

// vi.mock is hoisted — mock Stripe before app loads so billing controller
// never touches real Stripe API calls in these tests.
vi.mock('../src/config/stripe.js', () => ({
  default: {
    customers: {
      search: vi.fn().mockResolvedValue({ data: [] }),
      create: vi.fn().mockResolvedValue({ id: 'cus_mock_001', deleted: false }),
      retrieve: vi.fn().mockResolvedValue({ id: 'cus_mock_001', deleted: false }),
    },
    subscriptions: {
      list: vi.fn().mockResolvedValue({ data: [] }),
      update: vi.fn().mockResolvedValue({}),
    },
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: 'cs_mock_001',
          url: 'https://checkout.stripe.com/c/pay/cs_mock_001',
        }),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          url: 'https://billing.stripe.com/session/bps_mock_001',
        }),
      },
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  },
}));

import { app } from '../src/app.js';
import { getToken, resetProfile, TEST_USERS } from './helpers.js';

describe('05 – Billing Plans & Checkout (Stripe mocked)', () => {
  let starterToken;

  beforeAll(async () => {
    starterToken = await getToken(TEST_USERS.starter.email);
  });

  afterEach(async () => {
    // Remove any mock stripe_customer_id written during tests
    await resetProfile(TEST_USERS.starter.id, { stripe_customer_id: null });
  });

  // ── GET /api/billing/plans ───────────────────────────────────────────────

  it('GET /api/billing/plans – returns 200 without auth', async () => {
    const res = await request(app).get('/api/billing/plans');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/billing/plans – contains free, starter, growth plans', async () => {
    const res = await request(app).get('/api/billing/plans');
    const codes = res.body.data.map((p) => p.code).sort();
    expect(codes).toEqual(['free', 'growth', 'starter']);
  });

  it('GET /api/billing/plans – starter has correct limits', async () => {
    const res = await request(app).get('/api/billing/plans');
    const starter = res.body.data.find((p) => p.code === 'starter');
    expect(starter.credits).toBe(1000);
    expect(starter.maxResults).toBe(25);
    expect(starter.contactUnlock).toBe(true);
    expect(starter.unlockCost).toBe(15);
  });

  it('GET /api/billing/plans – growth has correct limits', async () => {
    const res = await request(app).get('/api/billing/plans');
    const growth = res.body.data.find((p) => p.code === 'growth');
    expect(growth.credits).toBe(4000);
    expect(growth.maxResults).toBe(50);
  });

  // ── POST /api/billing/checkout ───────────────────────────────────────────

  it('POST /api/billing/checkout – invalid bearer returns 401', async () => {
    const res = await request(app)
      .post('/api/billing/checkout')
      .set('Authorization', 'Bearer totally_invalid_token')
      .send({ plan: 'starter' });

    expect(res.status).toBe(401);
  });

  it('POST /api/billing/checkout – invalid plan name returns 400', async () => {
    const res = await request(app)
      .post('/api/billing/checkout')
      .set('Authorization', `Bearer ${starterToken}`)
      .send({ plan: 'enterprise' }); // not a valid plan

    expect(res.status).toBe(400);
  });

  it('POST /api/billing/checkout – missing plan returns 400', async () => {
    const res = await request(app)
      .post('/api/billing/checkout')
      .set('Authorization', `Bearer ${starterToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('POST /api/billing/checkout – valid plan returns checkout URL (mocked)', async () => {
    const res = await request(app)
      .post('/api/billing/checkout')
      .set('Authorization', `Bearer ${starterToken}`)
      .send({ plan: 'growth' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.url).toContain('stripe.com');
  });
});
