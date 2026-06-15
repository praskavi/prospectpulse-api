import express from 'express';
import { createSearch, getSearchResults, listSearches } from '../controllers/searches.controller.js';

const router = express.Router();

router.get('/searches', listSearches);
router.get('/searches/:id/results', getSearchResults);
router.post('/searches', createSearch);

export default router;
