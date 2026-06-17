import express from 'express';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  createSearch,
  getSearchResults,
  listSearches,
  unlockContact,
} from '../controllers/searches.controller.js';
import {
  createSearchSchema,
  listSearchesQuerySchema,
  searchIdParamSchema,
} from '../schemas/search.schema.js';

const router = express.Router();

router.get('/searches', validateRequest(listSearchesQuerySchema), listSearches);
router.get('/searches/:id/results', validateRequest(searchIdParamSchema), getSearchResults);
router.post('/searches', validateRequest(createSearchSchema), createSearch);
router.post('/search-results/:id/unlock', validateRequest(searchIdParamSchema), unlockContact);

export default router;
