import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import {
  ADMIN_USER,
  getMagicLinkToken,
  getToken,
  TEST_USERS,
} from './helpers.js';

describe('07 - Admin dashboard API', () => {
  let adminToken;
  let nonAdminToken;
  let existingSearch;

  beforeAll(async () => {
    adminToken = await getMagicLinkToken(ADMIN_USER.email);
    nonAdminToken = await getToken(TEST_USERS.free.email);
  });

  it('rejects an invalid token before admin checks', async () => {
    const res = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', 'Bearer this_is_not_a_valid_jwt');

    expect(res.status).toBe(401);
  });

  it('rejects authenticated non-admin users', async () => {
    const res = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${nonAdminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/admin/overview returns admin summary cards and recent activity', async () => {
    const res = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.admin.email).toBe(ADMIN_USER.email);
    expect(res.body.data.users).toEqual(expect.objectContaining({
      total: expect.any(Number),
      free: expect.any(Number),
      starter: expect.any(Number),
      growth: expect.any(Number),
      zeroCredits: expect.any(Number),
    }));
    expect(res.body.data.searches).toEqual(expect.objectContaining({
      last24h: expect.any(Number),
      failedLast24h: expect.any(Number),
      stuckRunning: expect.any(Number),
    }));
    expect(res.body.data.webhooks).toEqual(expect.objectContaining({
      failedLast24h: expect.any(Number),
    }));
    expect(Array.isArray(res.body.data.recentFailedSearches)).toBe(true);
    expect(Array.isArray(res.body.data.recentTransactions)).toBe(true);
    expect(Array.isArray(res.body.data.recentWebhookFailures)).toBe(true);
  });

  it('GET /api/admin/users returns paged profiles with admin-only metadata', async () => {
    const res = await request(app)
      .get('/api/admin/users?limit=5')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toEqual(expect.objectContaining({
      page: 1,
      limit: 5,
      total: expect.any(Number),
    }));
  });

  it('GET /api/admin/users supports plan and credit filters', async () => {
    const res = await request(app)
      .get('/api/admin/users?plan=free&zeroCredits=true&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    for (const user of res.body.data) {
      expect(user.plan_code).toBe('free');
      expect(user.credits_remaining).toBeLessThanOrEqual(0);
    }
  });

  it('GET /api/admin/users/:id returns profile, recent searches, and transactions', async () => {
    const res = await request(app)
      .get(`/api/admin/users/${TEST_USERS.growth.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.profile).toEqual(expect.objectContaining({
      id: TEST_USERS.growth.id,
      email: TEST_USERS.growth.email,
    }));
    expect(Array.isArray(res.body.data.searches)).toBe(true);
    expect(Array.isArray(res.body.data.transactions)).toBe(true);
  });

  it('GET /api/admin/searches returns paged searches', async () => {
    const res = await request(app)
      .get('/api/admin/searches?limit=5')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    existingSearch = res.body.data[0] || null;
    expect(res.body.meta).toEqual(expect.objectContaining({
      page: 1,
      limit: 5,
      total: expect.any(Number),
    }));
  });

  it('GET /api/admin/searches supports status and text filters', async () => {
    const res = await request(app)
      .get('/api/admin/searches?status=completed&category=test&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    for (const search of res.body.data) {
      expect(search.search_status).toBe('completed');
      expect(String(search.business_category || '').toLowerCase()).toContain('test');
    }
  });

  it('GET /api/admin/searches/:id returns search metadata and results', async () => {
    if (!existingSearch) {
      const listRes = await request(app)
        .get('/api/admin/searches?limit=1')
        .set('Authorization', `Bearer ${adminToken}`);
      existingSearch = listRes.body.data[0] || null;
    }

    expect(existingSearch).toBeTruthy();

    const res = await request(app)
      .get(`/api/admin/searches/${existingSearch.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.search).toEqual(expect.objectContaining({
      id: existingSearch.id,
      user_id: existingSearch.user_id,
    }));
    expect(Array.isArray(res.body.data.results)).toBe(true);
  });

  it('GET /api/admin/transactions returns paged ledger rows', async () => {
    const res = await request(app)
      .get('/api/admin/transactions?limit=5')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toEqual(expect.objectContaining({
      page: 1,
      limit: 5,
      total: expect.any(Number),
    }));
  });

  it('GET /api/admin/transactions supports type and negative filters', async () => {
    const res = await request(app)
      .get('/api/admin/transactions?type=unlock&negative=true&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    for (const transaction of res.body.data) {
      expect(transaction.transaction_type).toBe('unlock');
      expect(transaction.credits).toBeLessThan(0);
    }
  });

  it('GET /api/admin/billing/health returns billing anomaly buckets', async () => {
    const res = await request(app)
      .get('/api/admin/billing/health')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(expect.objectContaining({
      paidMissingStripe: expect.any(Array),
      freeWithStripe: expect.any(Array),
      fakeStripeIds: expect.any(Array),
      cancellationLockouts: expect.any(Array),
    }));
  });

  it('GET /api/admin/webhooks returns paged Stripe webhook events', async () => {
    const res = await request(app)
      .get('/api/admin/webhooks?limit=5')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toEqual(expect.objectContaining({
      page: 1,
      limit: 5,
      total: expect.any(Number),
    }));
  });

  it('GET /api/admin/webhooks supports status filtering', async () => {
    const res = await request(app)
      .get('/api/admin/webhooks?status=failed&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    for (const event of res.body.data) {
      expect(event.status).toBe('failed');
    }
  });

  it('GET /api/admin/system/health returns API and database status', async () => {
    const res = await request(app)
      .get('/api/admin/system/health')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.api).toBe('ok');
    expect(res.body.data.database).toBe('ok');
    expect(res.body.data.counts).toEqual(expect.objectContaining({
      profiles: expect.any(Number),
      searches: expect.any(Number),
      transactions: expect.any(Number),
    }));
    expect(res.body.data.redis).toEqual(expect.objectContaining({
      status: expect.any(String),
      queue: 'stripe-webhooks',
    }));
  });
});
