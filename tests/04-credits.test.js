import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import {
  getToken,
  resetProfile,
  seedSearchResult,
  cleanupTestSearches,
  TEST_USERS,
} from './helpers.js';

describe('04 – Credit History (GET /api/me/transactions)', () => {
  let starterToken;

  beforeAll(async () => {
    starterToken = await getToken(TEST_USERS.starter.email);
  });

  afterEach(async () => {
    await Promise.all([
      resetProfile(TEST_USERS.starter.id, { plan_code: 'starter', credits_remaining: 1000 }),
      cleanupTestSearches(TEST_USERS.starter.id),
    ]);
  });

  it('Returns 200 with an array of transactions', async () => {
    const res = await request(app)
      .get('/api/me/transactions')
      .set('Authorization', `Bearer ${starterToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('Invalid token returns 401', async () => {
    const res = await request(app)
      .get('/api/me/transactions')
      .set('Authorization', 'Bearer not_a_real_token');

    expect(res.status).toBe(401);
  });

  it('Unlock transaction appears in history with correct type and amount', async () => {
    // Reset credits and seed a result to unlock
    await resetProfile(TEST_USERS.starter.id, { plan_code: 'starter', credits_remaining: 1000 });
    const { result } = await seedSearchResult(TEST_USERS.starter.id);

    // Perform unlock — this should log a credit_transaction
    await request(app)
      .post(`/api/search-results/${result.id}/unlock`)
      .set('Authorization', `Bearer ${starterToken}`);

    const res = await request(app)
      .get('/api/me/transactions')
      .set('Authorization', `Bearer ${starterToken}`);

    expect(res.status).toBe(200);
    const txns = res.body.data;

    const unlockTxn = txns.find(
      (t) => t.transaction_type === 'unlock' && t.credits === -15,
    );
    expect(unlockTxn).toBeTruthy();
    expect(unlockTxn.description).toContain(result.id);
  });

  it('Transactions are ordered newest first', async () => {
    const res = await request(app)
      .get('/api/me/transactions')
      .set('Authorization', `Bearer ${starterToken}`);

    const txns = res.body.data;
    if (txns.length > 1) {
      const dates = txns.map((t) => new Date(t.created_at).getTime());
      for (let i = 0; i < dates.length - 1; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
      }
    }
  });
});
