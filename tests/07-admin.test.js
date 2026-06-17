import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import {
  ADMIN_USER,
  cleanupAdminAlerts,
  cleanupSupportTickets,
  getMagicLinkToken,
  getToken,
  seedAdminAlert,
  seedSupportTicket,
  TEST_USERS,
} from './helpers.js';

describe('07 - Admin dashboard API', () => {
  let adminToken;
  let nonAdminToken;
  let existingSearch;
  let supportTicket;
  let adminAlert;

  beforeAll(async () => {
    adminToken = await getMagicLinkToken(ADMIN_USER.email);
    nonAdminToken = await getToken(TEST_USERS.free.email);
    await cleanupSupportTickets('support-admin-test@prospectpulse.test');
    await cleanupSupportTickets('support-retry-test@prospectpulse.test');
    await cleanupSupportTickets('alert-scan-test@prospectpulse.test');
    await cleanupAdminAlerts('vitest-alert');
    await cleanupAdminAlerts('support_n8n_failed:SUP-ALERT-SCAN');
    supportTicket = await seedSupportTicket({
      email: 'support-admin-test@prospectpulse.test',
      subject: 'Billing support admin test',
      category: 'billing',
      priority: 'high',
    });
    adminAlert = await seedAdminAlert({
      alert_key: `vitest-alert-${Date.now().toString(36)}`,
      title: 'Seeded admin alert test',
      alert_type: 'search_failed',
      severity: 'warning',
      status: 'open',
    });
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
    expect(res.body.data.support).toEqual(expect.objectContaining({
      open: expect.any(Number),
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

  it('GET /api/admin/support-tickets returns paged support tickets', async () => {
    const res = await request(app)
      .get('/api/admin/support-tickets?limit=5')
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

  it('GET /api/admin/support-tickets supports status and email filters', async () => {
    const res = await request(app)
      .get('/api/admin/support-tickets?status=open&email=support-admin-test&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    for (const ticket of res.body.data) {
      expect(ticket.status).toBe('open');
      expect(ticket.email).toContain('support-admin-test');
    }
  });

  it('GET /api/admin/support-tickets/:id returns support ticket details', async () => {
    const res = await request(app)
      .get(`/api/admin/support-tickets/${supportTicket.ticket_id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(expect.objectContaining({
      ticket_id: supportTicket.ticket_id,
      subject: 'Billing support admin test',
    }));
  });

  it('PATCH /api/admin/support-tickets/:id updates support ticket status', async () => {
    const res = await request(app)
      .patch(`/api/admin/support-tickets/${supportTicket.ticket_id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'resolved' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('resolved');
    expect(res.body.data.resolved_at).toBeTruthy();
  });

  it('POST /api/admin/support-tickets/:id/retry-workflow retries n8n forwarding', async () => {
    const retryTicket = await seedSupportTicket({
      email: 'support-retry-test@prospectpulse.test',
      subject: 'Retry support workflow test',
      category: 'billing',
      priority: 'high',
      n8n_status: 'failed',
    });

    const res = await request(app)
      .post(`/api/admin/support-tickets/${retryTicket.ticket_id}/retry-workflow`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.ticket_id).toBe(retryTicket.ticket_id);
    expect(res.body.data.n8n_status).toBe('sent');
  });

  it('GET /api/admin/alerts returns paged operational alerts', async () => {
    const res = await request(app)
      .get('/api/admin/alerts?status=open&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toEqual(expect.objectContaining({
      page: 1,
      limit: 10,
      total: expect.any(Number),
    }));
    expect(res.body.data.some(alert => alert.id === adminAlert.id)).toBe(true);
  });

  it('PATCH /api/admin/alerts/:id updates alert status', async () => {
    const res = await request(app)
      .patch(`/api/admin/alerts/${adminAlert.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'acknowledged' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('acknowledged');
    expect(res.body.data.acknowledged_at).toBeTruthy();
  });

  it('POST /api/admin/alerts/scan creates alert records from failed operational signals', async () => {
    const scanTicket = await seedSupportTicket({
      ticket_id: 'SUP-ALERT-SCAN',
      email: 'alert-scan-test@prospectpulse.test',
      subject: 'Alert scan support workflow failure',
      category: 'billing',
      priority: 'high',
      n8n_status: 'failed',
    });

    const res = await request(app)
      .post('/api/admin/alerts/scan')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(expect.objectContaining({
      candidates: expect.any(Number),
      created: expect.any(Number),
      updated: expect.any(Number),
    }));
    expect(res.body.data.alerts.some(alert => alert.source_id === scanTicket.ticket_id)).toBe(true);
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
