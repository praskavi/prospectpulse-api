// Retention days per plan — how long search results are kept before deletion
export const PLAN_RETENTION_DAYS = {
  free:    7,
  starter: 30,
  growth:  90,
};

export const PLAN_LIMITS = {
  free: {
    maxResults:        10,
    categoryTerms:     1,
    scrapeContacts:    false,
    maxLeadsPerPlace:  0,
    emailVerification: false,
    contactUnlock:     false,
    unlockCost:        0,
    label:             'Free',
    credits:           100,
  },
  starter: {
    maxResults:        25,
    categoryTerms:     1,
    scrapeContacts:    true,
    maxLeadsPerPlace:  1,
    emailVerification: true,
    contactUnlock:     true,
    unlockCost:        15,
    label:             'Starter',
    credits:           1000,
  },
  growth: {
    maxResults:        50,
    categoryTerms:     3,
    scrapeContacts:    true,
    maxLeadsPerPlace:  2,
    emailVerification: true,
    contactUnlock:     true,
    unlockCost:        15,
    label:             'Growth',
    credits:           4000,
  },
};

export const DEFAULT_PLAN = 'free';

export const FREE_PLAN_REENTRY_LOCKOUT_DAYS = 30;
export const FREE_TRIAL_REENROLL_DAYS = 30;
