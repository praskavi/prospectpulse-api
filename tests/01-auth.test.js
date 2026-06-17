import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { getToken, resetProfile, TEST_USERS } from './helpers.js';

describe('01 – Auth', () => {
  let validToken;

  beforeAll(async () => {
    await resetProfile(TEST_USERS.free.id, {
      plan_code: 'free',
      credits_remaining: 100,
    });
    validToken = await getToken(TEST_USERS.free.email);
  });

  it('POST /api/login – valid credentials returns 200 + access_token', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: TEST_USERS.free.email, password: 'TestPass123!' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.session.access_token).toBeTruthy();
  });

  it('POST /api/login – wrong password returns 401', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: TEST_USERS.free.email, password: 'WrongPassword99!' });

    expect(res.status).toBe(401);
  });

  it('POST /api/login – missing password returns 400 (schema validation)', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: TEST_USERS.free.email });

    expect(res.status).toBe(400);
  });

  it('GET /api/me – invalid token returns 401', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer this_is_not_a_valid_jwt');

    expect(res.status).toBe(401);
  });

  it('GET /api/me – valid token returns user data', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(TEST_USERS.free.id);
    expect(res.body.data.plan).toBe('free');
    expect(typeof res.body.data.credits).toBe('number');
  });
});
