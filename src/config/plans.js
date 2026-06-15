//Retention days per plan — how long search results are kept before deletion
export const PLAN_RETENTION_DAYS = {
    free: 7,
    starter: 30,
    growth: 90,
};

// plan features and limits can be added here in the future for reference when implementing subscription-based access control and credit deduction logic
export const PLAN_LIMITS = {
  free: {
    maxResults:        10,
    categoryTerms:     1,     // searchStringsArray length cap
    scrapeContacts:    false, // Find company contacts toggle
    maxLeadsPerPlace:  0,     // people enrichment — 0 = disabled
    emailVerification: false,
    label:             'Free',
    credits:           100,
  },
  starter: {
    maxResults:        25,
    categoryTerms:     1,
    scrapeContacts:    true,
    maxLeadsPerPlace:  1,
    emailVerification: true,
    label:             'Starter',
    credits:           1000,
  },
  growth: {
    maxResults:        50,
    categoryTerms:     3,
    scrapeContacts:    true,
    maxLeadsPerPlace:  2,
    emailVerification: true,
    label:             'Growth',
    credits:           4000,
  },
};
    
//used during development before auth +subscriptions are implemented
export const DEFAULT_PLAN  = 'starter';