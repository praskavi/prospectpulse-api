import { z } from 'zod';

export const searchIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid({ message: 'Search ID must be a valid UUID' }),
  }),
});

export const listSearchesQuerySchema = z.object({
  query: z.object({
    page: z.preprocess((value) => {
      if (value === undefined || value === '') return undefined;
      return Number(value);
    }, z.number().int().positive().optional()),
    limit: z.preprocess((value) => {
      if (value === undefined || value === '') return undefined;
      return Number(value);
    }, z.number().int().positive().optional()),
    businessCategory: z.string().optional(),
    location: z.string().optional(),
    state: z.string().optional(),
  }),
});

export const createSearchSchema = z.object({
  body: z.object({
    businessCategory: z.string().min(1, { message: 'businessCategory is required' }),
    location: z.string().min(1, { message: 'location is required' }),
    state: z.string().optional(),
    maxResults: z.preprocess((value) => {
      if (value === undefined || value === '') return undefined;
      return Number(value);
    }, z.number().int().positive().optional()),
    companySize: z.string().optional(),
    roles: z.array(z.string()).optional(),
    postCodes: z.array(z.union([z.string(), z.number()]))
      .transform((values) => values.map(String))
      .optional(),
    enrichBusinessLeads: z.boolean().optional(),
    bizdevDiscovery: z.boolean().optional(),
    scrapeContacts: z.boolean().optional(),
    maxLeadsPerPlace: z.preprocess((value) => {
      if (value === undefined || value === '') return undefined;
      return Number(value);
    }, z.number().int().min(0).optional()),
    verifyEmails: z.boolean().optional(),
  }),
});
