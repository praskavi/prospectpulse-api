import express from 'express';
import {
  getMySupportTicket,
  listMySupportTickets,
  submitSupportContact,
} from '../controllers/support.controller.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { supportContactSchema } from '../schemas/support.schemas.js';

const router = express.Router();

router.post('/support/contact', validateRequest(supportContactSchema), submitSupportContact);
router.get('/me/support-tickets', requireAuth, listMySupportTickets);
router.get('/me/support-tickets/:ticketId', requireAuth, getMySupportTicket);

export default router;
