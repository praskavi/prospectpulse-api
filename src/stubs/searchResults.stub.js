/**
 * Stub search results for DEV_STUB mode.
 * Mirrors the column names in the `search_results` Supabase table.
 * Mix of records: some with contacts, some without — covers all card states.
 */

const STUB_POOL = [
  {
    business_name: 'Apex Digital Marketing',
    business_type: 'Digital Marketing Agency',
    city: 'Melbourne',
    state: 'VIC',
    phone: '+61 3 9123 4567',
    website: 'https://apexdigital.com.au',
    rating: 4.8,
    owner_name: 'Sarah Chen',
    email: 'sarah@apexdigital.com.au',
    linkedin_url: 'https://linkedin.com/in/sarah-chen-apex',
  },
  {
    business_name: 'Harbour View Plumbing',
    business_type: 'Plumbing Services',
    city: 'Sydney',
    state: 'NSW',
    phone: '+61 2 8765 4321',
    website: 'https://harbourplumbing.com.au',
    rating: 4.5,
    owner_name: null,
    email: null,
    linkedin_url: null,
  },
  {
    business_name: 'Greenfield Accounting',
    business_type: 'Accounting Firm',
    city: 'Brisbane',
    state: 'QLD',
    phone: '+61 7 3210 5678',
    website: 'https://greenfieldaccounting.com.au',
    rating: 4.9,
    owner_name: 'James Whitfield',
    email: 'james@greenfieldaccounting.com.au',
    linkedin_url: 'https://linkedin.com/in/jwhitfield-cpa',
  },
  {
    business_name: 'TechCore Solutions',
    business_type: 'IT Services',
    city: 'Melbourne',
    state: 'VIC',
    phone: '+61 3 9876 5432',
    website: 'https://techcore.com.au',
    rating: 4.2,
    owner_name: 'Raj Patel',
    email: 'raj.patel@techcore.com.au',
    linkedin_url: null,
  },
  {
    business_name: 'Coastal Real Estate Group',
    business_type: 'Real Estate Agency',
    city: 'Gold Coast',
    state: 'QLD',
    phone: '+61 7 5512 3456',
    website: 'https://coastalrealestate.com.au',
    rating: 4.6,
    owner_name: null,
    email: null,
    linkedin_url: null,
  },
  {
    business_name: 'Blue Ridge Law',
    business_type: 'Law Firm',
    city: 'Perth',
    state: 'WA',
    phone: '+61 8 9321 0987',
    website: 'https://blueridgelaw.com.au',
    rating: 4.7,
    owner_name: 'Angela Morrison',
    email: 'angela@blueridgelaw.com.au',
    linkedin_url: 'https://linkedin.com/in/angela-morrison-law',
  },
  {
    business_name: 'Summit Consulting Group',
    business_type: 'Management Consulting',
    city: 'Sydney',
    state: 'NSW',
    phone: '+61 2 9456 7890',
    website: 'https://summitconsulting.com.au',
    rating: 4.3,
    owner_name: 'David Park',
    email: 'david@summitconsulting.com.au',
    linkedin_url: 'https://linkedin.com/in/davidpark-summit',
  },
  {
    business_name: 'Brightside Dental',
    business_type: 'Dental Clinic',
    city: 'Adelaide',
    state: 'SA',
    phone: '+61 8 8210 4567',
    website: 'https://brightsidedental.com.au',
    rating: 4.9,
    owner_name: null,
    email: null,
    linkedin_url: null,
  },
  {
    business_name: 'NextGen Software Studio',
    business_type: 'Software Development',
    city: 'Melbourne',
    state: 'VIC',
    phone: '+61 3 9555 1234',
    website: 'https://nextgenstudio.com.au',
    rating: 4.6,
    owner_name: 'Priya Sharma',
    email: 'priya@nextgenstudio.com.au',
    linkedin_url: 'https://linkedin.com/in/priya-sharma-dev',
  },
  {
    business_name: 'Iron Peak Construction',
    business_type: 'Construction Company',
    city: 'Brisbane',
    state: 'QLD',
    phone: '+61 7 3345 6789',
    website: null,
    rating: 3.9,
    owner_name: null,
    email: null,
    linkedin_url: null,
  },
];

/**
 * Returns N stub records, cycling through the pool if N > pool size.
 * Overrides city/state/business_type with the real search params so cards look relevant.
 */
export function getStubResults({ maxResults, businessCategory, location }) {
  const count = Math.min(maxResults, STUB_POOL.length);
  return STUB_POOL.slice(0, count).map(record => ({
    ...record,
    // Inject actual search context so the stub looks meaningful
    business_type: businessCategory || record.business_type,
    city:  location ? location.split(',')[0].trim() : record.city,
    state: location ? (location.split(',')[1] || '').trim() || record.state : record.state,
  }));
}
