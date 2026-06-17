import { z } from 'zod';

export const createSearchSchema = z.object({
  body: z.object({
    businessCategory: z.string().min(1, { message: 'businessCategory is required' }),
    location: z.string().min(1, { message: 'location is required' }),
    state: z.string().optional(),
    maxResults: z.preprocess((val) => Number(val), z.number().int().positive().optional()),
    companySize: z.string().optional(),
    roles: z.array(z.string()).optional(),
    postCodes: z.array(z.string()).optional(),
    enrichBusinessLeads: z.boolean().optional(),
    bizdevDiscovery: z.boolean().optional(),
    scrapeContacts: z.boolean().optional(),
    maxLeadsPerPlace: z.preprocess((val) => Number(val), z.number().int().positive().optional()),
    verifyEmails: z.boolean().optional(),
  }),
});
