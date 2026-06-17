import { AppError } from '../middleware/errorHandler.js';
import { createSearchAndRunWorkflow, getSearchResultsForUser, listSearchesForUser, unlockSearchResult } from '../services/searches.service.js';
import { PLAN_LIMITS } from '../config/plans.js';
import supabase from '../config/supabaseClient.js';

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

export async function unlockContact(req, res, next) {
  try {
    const userId   = getUserId(req);
    const plan     = getUserPlan(req);
    const resultId = req.params.id;

    if (!userId) throw new AppError('Unauthorised', 401);

    const planConfig = PLAN_LIMITS[plan] || PLAN_LIMITS['free'];
    if (!planConfig.contactUnlock) {
      const unlockCost = PLAN_LIMITS.starter?.unlockCost || PLAN_LIMITS.growth?.unlockCost || 15;
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('credits_remaining')
        .eq('id', userId)
        .maybeSingle();

      if (profileError || !profile) {
        throw new AppError('Could not read your credit balance.', 500);
      }

      if ((Number(profile.credits_remaining) || 0) < unlockCost) {
        throw new AppError(
          `Not enough credits. Unlocking costs ${unlockCost} credits — you have ${profile.credits_remaining}.`,
          402,
        );
      }

      throw new AppError('Your plan does not include contact unlocking. Upgrade to Starter or Growth.', 403);
    }

    const data = await unlockSearchResult({
      userId,
      resultId,
      creditCost: planConfig.unlockCost,
    });

    res.status(200).json({ success: true, data });
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

    const searches = await listSearchesForUser(userId, res.locals.validatedQuery || req.query);

    res.status(200).json({
      success: true,
      data: searches,
    });
  } catch (error) {
    next(error);
  }
}
