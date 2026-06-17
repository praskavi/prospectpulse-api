import { z } from 'zod';

export const supportContactSchema = z.object({
  body: z.object({
    email: z.string().trim().email({ message: 'Valid email is required' }).max(254),
    name: z.string().trim().max(120).optional().default(''),
    category: z.string().trim().max(60).optional().default('general'),
    subject: z.string().trim().min(3, { message: 'Subject is required' }).max(160),
    message: z.string().trim().min(10, { message: 'Message must be at least 10 characters' }).max(5000),
    user_id: z.string().trim().max(120).optional().default(''),
    source: z.string().trim().max(80).optional().default('contact.html'),
  }),
});
