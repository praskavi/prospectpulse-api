import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import {
  cleanupSupportTickets,
  getToken,
  seedSupportTicket,
  TEST_USERS,
} from './helpers.js';

describe('08 - Customer support tickets', () => {
  let freeToken;
  let starterToken;
  let ownedTicket;
  let emailOwnedTicket;
  let otherTicket;

  beforeAll(async () => {
    freeToken = await getToken(TEST_USERS.free.email);
    starterToken = await getToken(TEST_USERS.starter.email);

    await cleanupSupportTickets('customer-support-visible@prospectpulse.test');
    await cleanupSupportTickets(TEST_USERS.free.email);
    await cleanupSupportTickets('customer-support-other@prospectpulse.test');

    ownedTicket = await seedSupportTicket({
      ticket_id: `SUP-CUSTOMER-ID-${Date.now().toString(36).toUpperCase()}`,
      email: 'customer-support-visible@prospectpulse.test',
      profile_id: TEST_USERS.free.id,
      subject: 'Profile-owned support ticket',
      message: 'This support ticket belongs to the Free test user by profile_id.',
      category: 'general',
    });

    emailOwnedTicket = await seedSupportTicket({
      ticket_id: `SUP-CUSTOMER-EMAIL-${Date.now().toString(36).toUpperCase()}`,
      email: TEST_USERS.free.email,
      profile_id: null,
      subject: 'Email-owned support ticket',
      message: 'This support ticket belongs to the Free test user by matching email.',
      category: 'billing',
    });

    otherTicket = await seedSupportTicket({
      ticket_id: `SUP-CUSTOMER-OTHER-${Date.now().toString(36).toUpperCase()}`,
      email: 'customer-support-other@prospectpulse.test',
      profile_id: TEST_USERS.starter.id,
      subject: 'Other user support ticket',
      message: 'This support ticket belongs to the Starter test user.',
      category: 'account',
    });
  });

  it('GET /api/me/support-tickets requires authentication', async () => {
    const res = await request(app).get('/api/me/support-tickets');

    expect(res.status).toBe(401);
  });

  it('GET /api/me/support-tickets returns tickets owned by profile id or account email', async () => {
    const res = await request(app)
      .get('/api/me/support-tickets')
      .set('Authorization', `Bearer ${freeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const ids = res.body.data.map(ticket => ticket.ticket_id);
    expect(ids).toContain(ownedTicket.ticket_id);
    expect(ids).toContain(emailOwnedTicket.ticket_id);
    expect(ids).not.toContain(otherTicket.ticket_id);
  });

  it('GET /api/me/support-tickets/:ticketId returns owned ticket detail', async () => {
    const res = await request(app)
      .get(`/api/me/support-tickets/${ownedTicket.ticket_id}`)
      .set('Authorization', `Bearer ${freeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(expect.objectContaining({
      ticket_id: ownedTicket.ticket_id,
      subject: 'Profile-owned support ticket',
    }));
  });

  it('GET /api/me/support-tickets/:ticketId does not expose another user ticket', async () => {
    const res = await request(app)
      .get(`/api/me/support-tickets/${otherTicket.ticket_id}`)
      .set('Authorization', `Bearer ${freeToken}`);

    expect(res.status).toBe(404);
  });

  it('GET /api/me/support-tickets returns only the starter user ticket for starter user', async () => {
    const res = await request(app)
      .get('/api/me/support-tickets')
      .set('Authorization', `Bearer ${starterToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map(ticket => ticket.ticket_id);
    expect(ids).toContain(otherTicket.ticket_id);
    expect(ids).not.toContain(ownedTicket.ticket_id);
  });
});
