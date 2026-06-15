ProspectPulse V3 UI Redesign Specification
Project Context
ProspectPulse is a Lead Generation Micro SaaS built on:
•	Frontend: HTML/CSS/JavaScriptBackend: Node.js
•	Workflow Engine: n8n
•	Data Source: Apify Google Maps Scraper
•	Future Database: Supabase
The application currently allows users to:
•	Search businesses by category and location
•	Enrich businesses with contact information
•	Display results in a table
•	Export CSV
The current UI is technically functional but is positioned more like a scraping tool than a SaaS product.
The objective of this redesign is to transform ProspectPulse into a credit-based Lead Generation SaaS optimized for profitability under Apify’s new pay-per-event pricing model.
________________________________________
Primary Product Goal
Users should understand:
Search Businesses → Unlock Contacts → Spend Credits → Export Leads
The UI must reinforce the concept that:
•	Businesses are inexpensive
•	Contacts are premium
•	Credits are the product currency
The UI should feel closer to:
•	Apollo.io
•	Instantly.ai
•	Clay
•	Leadswift
and less like a scraper dashboard.
________________________________________
Product Monetization Model
Business Credits
Business records include:
•	Company Name
•	Address
•	Phone
•	Website
•	Google Rating
Cost:
1 Business Credit
________________________________________
Contact Credits
Contact records include:
•	Owner Name
•	Director Name
•	Decision Maker Name
•	Email
•	LinkedIn Profile
•	Job Title
Cost:
5 Contact Credits
________________________________________
UI Objectives
The redesign must achieve:
1.	Simpler Search Experience
2.	Visible Credit Economy
3.	Prevent Cost Blowouts
4.	Encourage Contact Unlocks
5.	Encourage Upgrades
6.	Increase Export Usage
________________________________________
Page Layout
Replace the current single-page scraper interface with the following structure.
--------------------------------------------------
HEADER
--------------------------------------------------

Logo

Credits Remaining

Plan Badge

Upgrade Button

--------------------------------------------------
SEARCH PANEL
--------------------------------------------------

Business Category
Location
Max Results

Options

Estimated Credits

Search Button

--------------------------------------------------
RESULTS
--------------------------------------------------

Business Cards

Unlock Contacts

Bulk Export

--------------------------------------------------
________________________________________
HEADER REDESIGN
Remove
Current status indicators:
Workflow Connected
Webhook Connected
These are internal system concepts.
Users should never see them.
________________________________________
Add
Credit Balance Widget
Top Right
Example:
━━━━━━━━━━━━━━━━━━━
Credits Remaining

850 Credits
━━━━━━━━━━━━━━━━━━━
This should always remain visible.
________________________________________
Subscription Plan Badge
Example:
Starter
Growth
Agency
Display beside credits.
________________________________________
Upgrade Button
Example:
Upgrade Plan
Visible at all times.
Future Stripe integration will connect here.
________________________________________
SEARCH PANEL REDESIGN
Current form contains too many fields.
We want SaaS simplicity.
________________________________________
Keep
Business Category
Example:
Mortgage Brokers
Accountants
Real Estate Agents
________________________________________
Location
Example:
Melbourne
Sydney
Brisbane
________________________________________
Max Results
Example:
100
250
500
1000
________________________________________
Remove From V1
Hide entirely:
•	Company Size
•	State
•	Postcodes
•	Decision Maker Roles
These can return later under Advanced Filters.
________________________________________
Add Search Options Section
Business Details
Checkbox
Enabled by default.
Includes:
•	Company Name
•	Website
•	Phone
•	Rating
________________________________________
Contact Details
Checkbox
Includes:
•	Owner
•	Director
•	Manager
________________________________________
Verified Emails
Checkbox
Premium option.
________________________________________
LinkedIn Profiles
Checkbox
Premium option.
________________________________________
CREDIT ESTIMATOR (CRITICAL)
This is the most important feature.
Before every search the user must see an estimate.
Example:
━━━━━━━━━━━━━━━━━━━━

Estimated Results

Businesses: 500

Contacts: 200

Estimated Cost

500 Business Credits

1000 Contact Credits

Total

1500 Credits

━━━━━━━━━━━━━━━━━━━━
The estimate should update live.
This prevents users from accidentally running expensive searches.
________________________________________
SEARCH BUTTON
Replace:
Launch Intelligence Scan
with:
Search Leads
Cleaner SaaS terminology.
________________________________________
RESULTS SECTION REDESIGN
Current implementation uses a data table.
We want cards.
________________________________________
Business Card Layout
Example:
--------------------------------------------------

ABC Plumbing

★★★★★ 4.8

Melbourne VIC

Phone Available

Website Available

Owner Contact Available

[ Unlock Contact ]

--------------------------------------------------
________________________________________
Visible Fields
Show:
•	Company Name
•	Rating
•	Address
•	Website
•	Phone
These are low-cost items.
________________________________________
Hidden Fields
Do NOT show:
•	Email
•	LinkedIn
•	Owner Name
•	Director Name
until unlocked.
________________________________________
Unlock Contact Flow
If contacts exist:
Display:
Owner Contact Available

[ Unlock Contact ]
Clicking button:
Cost:
5 Credits
Then reveal:
Owner Name

Managing Director

Email

LinkedIn
________________________________________
Bulk Unlock
Add:
Unlock All Contacts
Display:
This will cost:

850 Credits
before confirmation.
________________________________________
EXPORT SYSTEM
Current export should be redesigned.
________________________________________
Export Businesses
Exports:
•	Company
•	Phone
•	Website
•	Rating
Cost:
1 credit per record
________________________________________
Export Contacts
Exports:
•	Owner
•	Email
•	LinkedIn
Cost:
5 credits per record
________________________________________
RESULTS SUMMARY
Above results add:
Results Found

Businesses: 487

Contacts Available: 198

Credits Required To Unlock All:
990
________________________________________
SEARCH HISTORY (Future)
Do not fully implement.
Prepare UI placeholder.
Search History

Mortgage Brokers Melbourne
487 Businesses

Accountants Sydney
712 Businesses
________________________________________
SAVED LISTS (Future)
Placeholder only.
My Lists

Mortgage Brokers
Real Estate
Accountants
________________________________________
REMOVE FROM CURRENT UI
Remove the following concepts entirely:
Workflow Settings Modal
Users should never configure:
•	Webhook URL
•	Webhook Method
•	Response Mode
These are system administration settings.
Move to environment variables or admin-only page.
________________________________________
Connection Status
Remove:
Workflow Connected
Users do not care.
________________________________________
Technical Language
Replace:
Launch Intelligence Scan
with:
Search Leads
Replace:
LinkedIn Enrichment
with:
LinkedIn Profiles
Replace:
BizDev Discovery
with:
Business Contacts
________________________________________
Mobile Requirements
Must support:
•	Mobile
•	Tablet
•	Desktop
Search panel should collapse cleanly.
Cards should stack vertically.
Credit widget remains visible.
________________________________________
Design Language
Maintain current visual style:
•	Dark Theme
•	Orange Accent
•	Purple Accent
•	Modern SaaS Look
Inspired by:
•	Apollo
•	Clay
•	Instantly
•	HubSpot
Avoid:
•	Technical dashboards
•	Developer tooling appearance
•	Scraper utility appearance
________________________________________
Success Criteria
A first-time user should understand within 10 seconds:
1.	I search for businesses.
2.	I spend credits.
3.	I unlock contacts.
4.	I export leads.
No technical knowledge should be required.
The application should feel like a lead generation SaaS, not an automation workflow front-end.
