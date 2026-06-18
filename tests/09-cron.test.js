import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';

describe('09 - Cron endpoints', () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('GET /api/cron/alerts-scan rejects requests without CRON_SECRET configured', async () => {
    const res = await request(app).get('/api/cron/alerts-scan');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/cron/alerts-scan rejects invalid bearer token', async () => {
    process.env.CRON_SECRET = 'cron-test-secret';

    const res = await request(app)
      .get('/api/cron/alerts-scan')
      .set('Authorization', 'Bearer wrong-secret');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/cron/alerts-scan runs alert scanner with valid bearer token', async () => {
    process.env.CRON_SECRET = 'cron-test-secret';

    const res = await request(app)
      .get('/api/cron/alerts-scan')
      .set('Authorization', 'Bearer cron-test-secret');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(expect.objectContaining({
      scannedAt: expect.any(String),
      candidates: expect.any(Number),
      created: expect.any(Number),
      updated: expect.any(Number),
    }));
  });

  it('GET /api/cron/alerts-scan accepts Vercel Cron user-agent', async () => {
    const res = await request(app)
      .get('/api/cron/alerts-scan')
      .set('User-Agent', 'vercel-cron/1.0');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(expect.objectContaining({
      scannedAt: expect.any(String),
      candidates: expect.any(Number),
      created: expect.any(Number),
      updated: expect.any(Number),
    }));
  });
});
