import express from 'express';
import { submitSupportContact } from '../controllers/support.controller.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { supportContactSchema } from '../schemas/support.schemas.js';

const router = express.Router();

router.post('/support/contact', validateRequest(supportContactSchema), submitSupportContact);

export default router;
