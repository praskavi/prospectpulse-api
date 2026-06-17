import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { getToken, resetProfile, cleanupTestSearches, TEST_USERS } from './helpers.js';

describe('02 – Search Plan Limits & Credit Guard', () => {
  let freeToken, starterToken, zeroCrToken;

  beforeAll(async () => {
    await Promise.all([
      resetProfile(TEST_USERS.free.id, { plan_code: 'free', credits_remaining: 100 }),
      resetProfile(TEST_USERS.starter.id, { plan_code: 'starter', credits_remaining: 1000 }),
      resetProfile(TEST_USERS.zerocredits.id, { plan_code: 'free', credits_remaining: 0 }),
    ]);

    [freeToken, starterToken, zeroCrToken] = await Promise.all([
      getToken(TEST_USERS.free.email),
      getToken(TEST_USERS.starter.email),
      getToken(TEST_USERS.zerocredits.email),
    ]);
  });

  afterEach(async () => {
    await Promise.all([
      resetProfile(TEST_USERS.free.id, { plan_code: 'free', credits_remaining: 100 }),
      resetProfile(TEST_USERS.starter.id, { plan_code: 'starter', credits_remaining: 1000 }),
      resetProfile(TEST_USERS.zerocredits.id, { plan_code: 'free', credits_remaining: 0 }),
      cleanupTestSearches(TEST_USERS.free.id),
      cleanupTestSearches(TEST_USERS.starter.id),
    ]);
  });

  // ── Search creation ──────────────────────────────────────────────────────

  it('Free user – valid search accepted (DEV_STUB) returns 201', async () => {
    const res = await request(app)
      .post('/api/searches')
      .set('Authorization', `Bearer ${freeToken}`)
      .send({ businessCategory: 'cafes', location: 'Sydney', maxResults: 5 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.search.search_status).toBe('running');
  });

  it('Free user – maxResults clamped to plan limit of 10', async () => {
    const res = await request(app)
      .post('/api/searches')
      .set('Authorization', `Bearer ${freeToken}`)
      .send({ businessCategory: 'cafes', location: 'Brisbane', maxResults: 99 });

    expect(res.status).toBe(201);
    expect(res.body.data.search.max_results).toBe(10);
  });

  it('Starter user – maxResults clamped to plan limit of 25', async () => {
    const res = await request(app)
      .post('/api/searches')
      .set('Authorization', `Bearer ${starterToken}`)
      .send({ businessCategory: 'dentists', location: 'Adelaide', maxResults: 99 });

    expect(res.status).toBe(201);
    expect(res.body.data.search.max_results).toBe(25);
  });

  // ── Plan gate: people enrichment ─────────────────────────────────────────

  it('Free user – enrichBusinessLeads=true blocked with 403', async () => {
    const res = await request(app)
      .post('/api/searches')
      .set('Authorization', `Bearer ${freeToken}`)
      .send({ businessCategory: 'gyms', location: 'Melbourne', enrichBusinessLeads: true });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/enrichment/i);
  });

  it('Starter user – enrichBusinessLeads allowed (201)', async () => {
    const res = await request(app)
      .post('/api/searches')
      .set('Authorization', `Bearer ${starterToken}`)
      .send({ businessCategory: 'lawyers', location: 'Perth', enrichBusinessLeads: true, maxLeadsPerPlace: 1 });

    expect(res.status).toBe(201);
  });

  // ── Credit guard: 402 ────────────────────────────────────────────────────

  it('Zero-credits user – search blocked with 402', async () => {
    const res = await request(app)
      .post('/api/searches')
      .set('Authorization', `Bearer ${zeroCrToken}`)
      .send({ businessCategory: 'plumbers', location: 'Perth', maxResults: 5 });

    expect(res.status).toBe(402);
    expect(res.body.message).toMatch(/insufficient credits/i);
  });

  // ── Search history ───────────────────────────────────────────────────────

  it('GET /api/searches – returns array for authenticated user', async () => {
    const res = await request(app)
      .get('/api/searches')
      .set('Authorization', `Bearer ${freeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/searches – invalid token returns 401', async () => {
    const res = await request(app)
      .get('/api/searches')
      .set('Authorization', 'Bearer bad_token');

    expect(res.status).toBe(401);
  });

  // ── Schema validation ────────────────────────────────────────────────────

  it('POST /api/searches – missing businessCategory returns 400', async () => {
    const res = await request(app)
      .post('/api/searches')
      .set('Authorization', `Bearer ${freeToken}`)
      .send({ location: 'Sydney' });

    expect(res.status).toBe(400);
  });
});
