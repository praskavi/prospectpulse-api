import { AppError } from '../middleware/errorHandler.js';
import supabase from '../config/supabaseClient.js';
// import from plans config for future use in calculating retention and credits based on user plan
import { PLAN_RETENTION_DAYS, PLAN_LIMITS, DEFAULT_PLAN } from '../config/plans.js';
import { getStubResults } from '../stubs/searchResults.stub.js';

const N8N_WEBHOOK_URL = process.env.N8N_PROSPECTPULSE_WEBHOOK_URL;
const DEV_STUB        = process.env.DEV_STUB === 'true';

// function to calculate expiry date based on plan retention days - currently unused but will be used in future for setting search result expiry
function calculateExpiryDate(plan) {
  const retentionDays = PLAN_RETENTION_DAYS[plan] || PLAN_RETENTION_DAYS[DEFAULT_PLAN.toLowerCase()] ||7;
  if(!retentionDays) {
    throw new AppError(`Invalid plan: ${plan}. Cannot calculate expiry date.`, 400);
  }
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + retentionDays);
  return expiryDate.toISOString();
}

function calculateEstimatedCredits(maxResults) {
  return Number(maxResults) || 0;
}

function calculateActualCredits(resultCount) {
  return (Number(resultCount) || 0) * 2;
}

// Returns the plan limits object, falling back to DEFAULT_PLAN if the plan key is unrecognised.
function getLimits(plan) {
  return PLAN_LIMITS[plan?.toLowerCase()] || PLAN_LIMITS[DEFAULT_PLAN];
}

// Normalises and enforces plan limits on the incoming search payload.
// plan defaults to DEFAULT_PLAN now; in M2 pass the real user plan from the auth token.
function normalizeSearchPayload(payload, plan = DEFAULT_PLAN) {
  const limits = getLimits(plan);

  const businessCategory = String(payload.businessCategory || payload.keyword || '').trim();
  const location         = String(payload.location || '').trim();

  if (!businessCategory) throw new AppError('businessCategory is required', 400);
  if (!location)         throw new AppError('location is required', 400);

  // Clamp maxResults — never exceed what the plan allows
  const maxResults = Math.min(
    Number.parseInt(payload.maxResults, 10) || limits.maxResults,
    limits.maxResults,
  );

  // Company contacts — silently cap; UI already prevents Free users from sending true
  const scrapeContacts = limits.scrapeContacts && payload.scrapeContacts !== false;

  // People enrichment — hard gate: throw 403 if plan doesn't include it
  const enrichBusinessLeads = Boolean(payload.enrichBusinessLeads || payload.bizdevDiscovery);
  if (enrichBusinessLeads && limits.maxLeadsPerPlace === 0) {
    throw new AppError(
      'Your plan does not include people enrichment. Upgrade to Starter or above.',
      403,
    );
  }

  // Clamp maxLeadsPerPlace to plan ceiling
  const maxLeadsPerPlace = enrichBusinessLeads
    ? Math.min(Math.max(Number.parseInt(payload.maxLeadsPerPlace, 10) || 1, 1), limits.maxLeadsPerPlace)
    : 0;

  // Email verification — silently cap; also requires enrichment to be on
  const verifyEmails =
    enrichBusinessLeads &&
    maxLeadsPerPlace > 0 &&
    limits.emailVerification &&
    Boolean(payload.verifyEmails);

  return {
    businessCategory,
    location,
    state:            String(payload.state || '').trim(),
    maxResults,
    companySize:      payload.companySize || '',
    roles:            Array.isArray(payload.roles) ? payload.roles : [],
    postCodes:        Array.isArray(payload.postCodes) ? payload.postCodes : [],
    bizdevDiscovery:  enrichBusinessLeads,
    scrapeContacts,
    enrichBusinessLeads,
    maxLeadsPerPlace,
    verifyEmails,
  };
}

async function createSearchRecord({ userId, search }) {
  if (!supabase) {
    throw new AppError('Supabase is not configured. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.', 500);
  }

  const { data, error } = await supabase
    .from('searches')
    .insert({
      user_id: userId,
      business_category: search.businessCategory,
      location: [search.location, search.state].filter(Boolean).join(', '),
      max_results: search.maxResults,
      search_status: 'running',
      estimated_credits: calculateEstimatedCredits(search.maxResults),
      expires_at: calculateExpiryDate(DEFAULT_PLAN), // M2: replace DEFAULT_PLAN with real user plan
    })
    .select('*')
    .single();

  if (error) {
    throw new AppError(`Could not create search record: ${error.message}`, 500);
  }

  return data;
}

async function assertSufficientCredits({ userId, estimatedCredits }) {
  if (!supabase) {
    throw new AppError('Supabase is not configured. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.', 500);
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('credits_remaining')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new AppError(`Could not read your credit balance: ${error.message}`, 500);
  }

  if (!profile) {
    throw new AppError('Could not read your credit balance.', 500);
  }

  const creditsRemaining = Number(profile.credits_remaining) || 0;
  if (creditsRemaining < estimatedCredits) {
    throw new AppError(
      `Insufficient credits. This search requires ${estimatedCredits} credits, but you have ${creditsRemaining}.`,
      402,
    );
  }
}

async function callN8nWorkflow({ searchId, userId, search }) {
  if (!N8N_WEBHOOK_URL) {
    throw new AppError('N8N_PROSPECTPULSE_WEBHOOK_URL is not configured.', 500);
  }

  const response = await fetch(N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...search,
      searchId,
      userId,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const details = errorBody ? ` - ${errorBody.slice(0, 500)}` : '';
    throw new AppError(`n8n workflow failed: HTTP ${response.status} ${response.statusText}${details}`, 502);
  }
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json') ? response.json() : {};
}

async function markSearchCompleted({ searchId, userId, n8nResult }) {
  const leads = Array.isArray(n8nResult?.leads) ? n8nResult.leads : [];
  const creditsUsed = calculateActualCredits(leads.length);

  // Mark completed FIRST — only deduct if the status update succeeds.
  // This ensures credits are never deducted for a search that didn't complete.
  const { error } = await supabase
    .from('searches')
    .update({
      search_status:    'completed',
      actual_credits:   creditsUsed,
      businesses_found: leads.length,
      contacts_found:   leads.filter(lead =>
        lead.contact_unlocked ||
        lead.owner_name ||
        lead.email ||
        lead.linkedin_url ||
        lead.ownerName ||
        lead.ownerEmail ||
        lead.ownerLinkedIn
      ).length,
    })
    .eq('id', searchId);

  if (error) {
    throw new AppError(`Search completed, but status update failed: ${error.message}`, 500);
  }

  await deductCredits({ userId, amount: creditsUsed, searchId });
}

export function hasFinalN8nResult(n8nResult) {
  return n8nResult?.success === true && Array.isArray(n8nResult?.leads);
}

// Insert a row into credit_transactions for audit trail.
// Non-fatal — a logging failure must never break the main operation.
async function logCreditTransaction({ userId, type, credits, description, relatedSearchId = null }) {
  if (!supabase || !userId) return;
  const { error } = await supabase.from('credit_transactions').insert({
    user_id:           userId,
    transaction_type:  type,
    credits,
    description,
    related_search_id: relatedSearchId || null,
  });
  if (error) {
    console.error(`[credit_transactions] Failed to log ${type} for ${userId}:`, error.message);
  }
}

async function deductCredits({ userId, amount, searchId = null }) {
  if (!userId || !amount || amount <= 0) return;

  // Read current balance, then write clamped value (MVP approach — fine for low concurrency)
  const { data: profile, error: readError } = await supabase
    .from('profiles')
    .select('credits_remaining')
    .eq('id', userId)
    .maybeSingle();

  if (readError) {
    console.error(`[deductCredits] Failed to read profile for ${userId}:`, readError.message);
    return;
  }

  if (profile) {
    const newBalance = Math.max(0, (profile.credits_remaining || 0) - amount);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ credits_remaining: newBalance })
      .eq('id', userId);

    if (updateError) {
      console.error(`[deductCredits] Failed to update credits for ${userId}:`, updateError.message);
    } else {
      console.log(`[deductCredits] User ${userId}: ${profile.credits_remaining} → ${newBalance} (−${amount})`);
      await logCreditTransaction({
        userId,
        type:            'search',
        credits:         -amount,
        description:     `Search deduction: ${amount} credits for ${amount / 2} results`,
        relatedSearchId: searchId,
      });
    }
  } else {
    console.error(`[deductCredits] No profile found for userId: ${userId}`);
  }
}

async function markSearchFailed(searchId) {
  if (!supabase || !searchId) return;

  await supabase
    .from('searches')
    .update({ search_status: 'failed' })
    .eq('id', searchId);
}

/**
 * DEV_STUB mode — skips n8n and Apify entirely.
 * Inserts fake search_results directly into Supabase after a short delay,
 * then marks the search completed. Frontend polling flow is unchanged.
 */
async function runStubWorkflow({ searchId, userId, search }) {
  // Simulate async processing time (2 seconds)
  await new Promise(resolve => setTimeout(resolve, 2000));

  const rows = getStubResults(search).map(record => ({
    search_id:     searchId,
    business_name: record.business_name,
    business_type: record.business_type,
    city:          record.city,
    state:         record.state,
    phone:         record.phone,
    website:       record.website,
    rating:        record.rating,
    owner_name:    record.owner_name,
    email:         record.email,
    linkedin_url:  record.linkedin_url,
  }));

  const { error: insertError } = await supabase
    .from('search_results')
    .insert(rows);

  if (insertError) {
    console.error(`[stub:${searchId}] Failed to insert stub results:`, insertError.message);
    await markSearchFailed(searchId);
    return;
  }

  const contactsFound = rows.filter(r => r.owner_name || r.email || r.linkedin_url).length;
  const creditsUsed   = calculateActualCredits(rows.length);

  // Mark search completed FIRST — only deduct credits if this succeeds.
  const { error: completeError } = await supabase
    .from('searches')
    .update({
      search_status:    'completed',
      actual_credits:   creditsUsed,
      businesses_found: rows.length,
      contacts_found:   contactsFound,
    })
    .eq('id', searchId);

  if (completeError) {
    console.error(`[stub:${searchId}] Failed to mark search completed:`, completeError.message);
    await markSearchFailed(searchId);
    return;
  }

  // Search confirmed complete — now safe to deduct.
  await deductCredits({ userId, amount: creditsUsed, searchId });

  console.log(`[stub:${searchId}] Completed: ${rows.length} results (${contactsFound} with contacts), deducted ${creditsUsed} credits`);
}

export async function createSearchAndRunWorkflow({ userId, plan, payload }) {
  const search = normalizeSearchPayload(payload, plan || DEFAULT_PLAN);
  const estimatedCredits = calculateEstimatedCredits(search.maxResults);

  await assertSufficientCredits({ userId, estimatedCredits });

  const searchRecord = await createSearchRecord({ userId, search });

  if (DEV_STUB) {
    console.log(`[stub:${searchRecord.id}] DEV_STUB=true — skipping n8n, using stub data`);
    runStubWorkflow({ searchId: searchRecord.id, userId, search })
      .catch(async error => {
        console.error(`[stub:${searchRecord.id}]`, error.message);
        await markSearchFailed(searchRecord.id);
      });
  } else {
    callN8nWorkflow({ searchId: searchRecord.id, userId, search })
      .then(async n8nResult => {
        if (hasFinalN8nResult(n8nResult)) {
          await markSearchCompleted({ searchId: searchRecord.id, userId, n8nResult });
          return;
        }

        console.log(`[n8n:${searchRecord.id}] Workflow accepted; waiting for n8n to insert results`);
      })
      .catch(async error => {
        console.error(`[n8n:${searchRecord.id}]`, error.message);
        await markSearchFailed(searchRecord.id);
      });
  }

  return {
    search: searchRecord,
    result: {
      success: true,
      status: 'running',
      leads: [],
    },
  };
}

export async function getSearchResultsForUser({ userId, searchId }) {
  if (!supabase) {
    throw new AppError('Supabase is not configured. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.', 500);
  }

  const { data: search, error: searchError } = await supabase
    .from('searches')
    .select('*')
    .eq('id', searchId)
    .eq('user_id', userId)
    .single();

  if (searchError) {
    throw new AppError(`Could not fetch search: ${searchError.message}`, 404);
  }

  const { data: results, error: resultsError } = await supabase
    .from('search_results')
    .select('*')
    .eq('search_id', searchId)
    .order('created_at', { ascending: true });

  if (resultsError) {
    throw new AppError(`Could not fetch search results: ${resultsError.message}`, 500);
  }

  if (results.length > 0 && search.search_status !== 'completed') {
    const contactsFound = results.filter(lead =>
      lead.contact_unlocked || lead.owner_name || lead.email || lead.linkedin_url
    ).length;
    const creditsUsed = calculateActualCredits(results.length);

    await supabase
      .from('searches')
      .update({
        search_status: 'completed',
        actual_credits: creditsUsed,
        businesses_found: results.length,
        contacts_found: contactsFound,
      })
      .eq('id', searchId);

    search.search_status = 'completed';
    search.actual_credits = creditsUsed;
    search.businesses_found = results.length;
    search.contacts_found = contactsFound;

    await deductCredits({ userId, amount: creditsUsed, searchId });
  }

  return {
    search,
    result: {
      success: search.search_status !== 'failed',
      status: search.search_status,
      total: results.length,
      contactsFound: results.filter(lead =>
        lead.contact_unlocked || lead.owner_name || lead.email || lead.linkedin_url
      ).length,
      leads: results,
    },
  };
}

export async function listSearchesForUser(userId, filters = {}) {
  if (!supabase) {
    throw new AppError('Supabase is not configured. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.', 500);
  }

  const limit = Math.min(Number(filters.limit) || 25, 100);
  const page = Number(filters.page) || 1;
  const start = (page - 1) * limit;
  const end = start + limit - 1;

  let query = supabase
    .from('searches')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(start, end);

  if (filters.businessCategory) {
    query = query.ilike('business_category', `%${filters.businessCategory}%`);
  }
  if (filters.location) {
    query = query.ilike('location', `%${filters.location}%`);
  }
  if (filters.state) {
    query = query.ilike('location', `%${filters.state}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new AppError(`Could not fetch searches: ${error.message}`, 500);
  }

  return data;
}

// Unlock contact data for a single search result.
// Guards: result must belong to user's search, user must have enough credits.
// If already unlocked, returns contact data without deducting credits again.
export async function unlockSearchResult({ userId, resultId, creditCost }) {
  if (!supabase) {
    throw new AppError('Supabase is not configured.', 500);
  }

  // Fetch the result — join to searches to confirm ownership
  const { data: result, error: fetchError } = await supabase
    .from('search_results')
    .select('id, owner_name, email, linkedin_url, contact_unlocked, search_id, searches!inner(user_id)')
    .eq('id', resultId)
    .single();

  if (fetchError || !result) {
    throw new AppError('Search result not found.', 404);
  }

  // Ownership check
  if (result.searches.user_id !== userId) {
    throw new AppError('You do not have access to this result.', 403);
  }

  // Already unlocked — return data without charging again
  if (result.contact_unlocked) {
    return {
      owner_name:       result.owner_name,
      email:            result.email,
      linkedin_url:     result.linkedin_url,
      already_unlocked: true,
    };
  }

  // Check credits
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('credits_remaining')
    .eq('id', userId)
    .maybeSingle();

  if (profileError || !profile) {
    throw new AppError('Could not read your credit balance.', 500);
  }

  if (profile.credits_remaining < creditCost) {
    throw new AppError(
      `Not enough credits. Unlocking costs ${creditCost} credits — you have ${profile.credits_remaining}.`,
      402
    );
  }

  // Deduct credits
  const newBalance = profile.credits_remaining - creditCost;
  const { error: deductError } = await supabase
    .from('profiles')
    .update({ credits_remaining: newBalance })
    .eq('id', userId);

  if (deductError) {
    throw new AppError('Failed to deduct credits.', 500);
  }

  // Mark as unlocked
  const { error: unlockError } = await supabase
    .from('search_results')
    .update({ contact_unlocked: true })
    .eq('id', resultId);

  if (unlockError) {
    // Refund on failure
    await supabase.from('profiles').update({ credits_remaining: profile.credits_remaining }).eq('id', userId);
    throw new AppError('Failed to unlock contact.', 500);
  }

  console.log(`[unlock] User ${userId} unlocked result ${resultId} (−${creditCost} cr, balance: ${newBalance})`);

  await logCreditTransaction({
    userId,
    type:            'unlock',
    credits:         -creditCost,
    description:     `Contact unlock: result ${resultId}`,
    relatedSearchId: result.search_id,
  });

  return {
    owner_name:        result.owner_name,
    email:             result.email,
    linkedin_url:      result.linkedin_url,
    already_unlocked:  false,
    credits_remaining: newBalance,
  };
}
