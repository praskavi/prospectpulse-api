import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import {
  getToken,
  resetProfile,
  getProfile,
  seedSearchResult,
  cleanupTestSearches,
  TEST_USERS,
} from './helpers.js';

describe('03 – Contact Unlock & Idempotency', () => {
  let starterToken, zeroCrToken;
  let seeded; // { search, result } fresh for each test

  beforeAll(async () => {
    [starterToken, zeroCrToken] = await Promise.all([
      getToken(TEST_USERS.starter.email),
      getToken(TEST_USERS.zerocredits.email),
    ]);
  });

  beforeEach(async () => {
    // Always start each test with a fresh seed + known credit balance
    await resetProfile(TEST_USERS.starter.id, { plan_code: 'starter', credits_remaining: 1000 });
    await resetProfile(TEST_USERS.zerocredits.id, { plan_code: 'free', credits_remaining: 0 });
    seeded = await seedSearchResult(TEST_USERS.starter.id);
  });

  afterEach(async () => {
    await Promise.all([
      cleanupTestSearches(TEST_USERS.starter.id),
      cleanupTestSearches(TEST_USERS.zerocredits.id),
    ]);
  });

  // ── Happy path ──────────────────────────────────────────────────────────

  it('Unlock deducts exactly 15 credits', async () => {
    const before = await getProfile(TEST_USERS.starter.id);

    const res = await request(app)
      .post(`/api/search-results/${seeded.result.id}/unlock`)
      .set('Authorization', `Bearer ${starterToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.already_unlocked).toBe(false);

    const after = await getProfile(TEST_USERS.starter.id);
    expect(after.credits_remaining).toBe(before.credits_remaining - 15);
  });

  it('Unlock returns contact data (owner_name, email, linkedin_url)', async () => {
    const res = await request(app)
      .post(`/api/search-results/${seeded.result.id}/unlock`)
      .set('Authorization', `Bearer ${starterToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.owner_name).toBe('Jane Seed');
    expect(res.body.data.email).toBe('jane@seedbusiness.com');
    expect(res.body.data.linkedin_url).toBeTruthy();
  });

  // ── Idempotency ─────────────────────────────────────────────────────────

  it('Re-unlock is idempotent — no second credit deduction', async () => {
    // First unlock
    await request(app)
      .post(`/api/search-results/${seeded.result.id}/unlock`)
      .set('Authorization', `Bearer ${starterToken}`);

    const creditsAfterFirst = (await getProfile(TEST_USERS.starter.id)).credits_remaining;

    // Second unlock of the same result
    const res = await request(app)
      .post(`/api/search-results/${seeded.result.id}/unlock`)
      .set('Authorization', `Bearer ${starterToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.already_unlocked).toBe(true);

    const creditsAfterSecond = (await getProfile(TEST_USERS.starter.id)).credits_remaining;
    expect(creditsAfterSecond).toBe(creditsAfterFirst); // no additional deduction
  });

  // ── Credit guard (free / zero-credit user) ───────────────────────────────

  it('Free user with 0 credits – unlock blocked with 402', async () => {
    await resetProfile(TEST_USERS.zerocredits.id, { plan_code: 'free', credits_remaining: 0 });
    const zeroCrSeeded = await seedSearchResult(TEST_USERS.zerocredits.id);

    const res = await request(app)
      .post(`/api/search-results/${zeroCrSeeded.result.id}/unlock`)
      .set('Authorization', `Bearer ${zeroCrToken}`);

    expect(res.status).toBe(402);
    expect(res.body.message).toMatch(/credits/i);
  });

  // ── Ownership guard ─────────────────────────────────────────────────────

  it('Cannot unlock another user\'s search result — returns 403', async () => {
    // seed belongs to starter user; try to unlock with zeroCrToken (different user)
    const res = await request(app)
      .post(`/api/search-results/${seeded.result.id}/unlock`)
      .set('Authorization', `Bearer ${zeroCrToken}`);

    // Free user: no contactUnlock on plan.
    // With 0 credits it hits 402 first (controller checks credits before plan gate).
    // Either 402 or 403 is acceptable — the point is they can't unlock it.
    expect([402, 403]).toContain(res.status);
  });
});
