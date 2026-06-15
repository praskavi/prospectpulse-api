import { AppError } from '../middleware/errorHandler.js';
import { createSearchAndRunWorkflow, getSearchResultsForUser, listSearchesForUser } from '../services/searches.service.js';

function getUserId(req)   { return req.user?.id; }
function getUserPlan(req) { return req.user?.plan; }

export async function createSearch(req, res, next) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      throw new AppError('Missing user id. For local testing, send x-user-id or set DEV_USER_ID.', 401);
    }

    const data = await createSearchAndRunWorkflow({
      userId,
      plan:    getUserPlan(req),
      payload: req.body,
    });

    res.status(201).json({
      success: true,
      message: 'Search started.',
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function getSearchResults(req, res, next) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      throw new AppError('Missing user id. For local testing, send x-user-id or set DEV_USER_ID.', 401);
    }

    const data = await getSearchResultsForUser({
      userId,
      searchId: req.params.id,
    });

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function listSearches(req, res, next) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      throw new AppError('Missing user id. For local testing, send x-user-id or set DEV_USER_ID.', 401);
    }

    const searches = await listSearchesForUser(userId);

    res.status(200).json({
      success: true,
      data: searches,
    });
  } catch (error) {
    next(error);
  }
}
