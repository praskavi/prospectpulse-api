// ─────────────────────────────────────────────────────────────────
//  ProspectPulse V2 — script.js
//  Frontend calls Express; Express calls n8n.
// ─────────────────────────────────────────────────────────────────

const SETTINGS_KEY  = 'pp_v2_settings';
const API_SEARCHES_URL = 'http://localhost:3000/api/searches';
const DEFAULT_WEBHOOK = API_SEARCHES_URL;
const SEARCH_POLL_INTERVAL_MS = 3000;
const SEARCH_POLL_TIMEOUT_MS = 180000;

// ── AUTH ──────────────────────────────────────────────────────────

function getToken() {
  return localStorage.getItem('pp_access_token');
}

function getAuthHeaders(includeContentType = false) {
  const token = getToken();
  const headers = {};
  if (includeContentType) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// ── CONTACT UNLOCK ─────────────────────────────────────────────────
async function unlockContact(resultId) {
  if (!resultId) return;

  const btn = document.querySelector(`[data-result-id="${resultId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Unlocking…'; }

  try {
    const res = await apiFetch(`http://localhost:3000/api/search-results/${resultId}/unlock`, {
      method: 'POST',
    });

    if (!res) return;

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast('error', err?.message || 'Could not unlock contact.');
      if (btn) { btn.disabled = false; btn.textContent = 'Unlock · 15 cr'; }
      return;
    }

    const json = await res.json();
    const contact = json?.data;

    // Reveal contact inline on the card
    const contactDiv = document.getElementById(`contact-${resultId}`);
    if (contactDiv && contact) {
      const rows = [
        contact.owner_name   ? `<div class="contact-row"><span class="cr-icon">👤</span><span>${escHtml(contact.owner_name)}</span></div>` : '',
        contact.email        ? `<div class="contact-row"><span class="cr-icon">✉️</span><a href="mailto:${escHtml(contact.email)}">${escHtml(contact.email)}</a></div>` : '',
        contact.linkedin_url ? `<div class="contact-row"><span class="cr-icon">🔗</span><a href="${escHtml(contact.linkedin_url)}" target="_blank" rel="noopener">LinkedIn</a></div>` : '',
      ].filter(Boolean).join('');

      contactDiv.innerHTML = rows
        ? `<div class="contact-revealed">${rows}</div>`
        : `<div class="contact-none">No contact details available</div>`;
    }

    if (!contact?.already_unlocked) {
      showToast('success', 'Contact unlocked!');
      creditHistoryLoaded = false; // stale — reload on next open
      // Update credit display with new balance from response
      if (contact?.credits_remaining !== undefined) {
        const creditsEl = document.getElementById('creditsAmount');
        if (creditsEl) creditsEl.textContent = contact.credits_remaining.toLocaleString();
      } else {
        fetchUserProfile(); // fallback refresh
      }
    }
  } catch (_) {
    showToast('error', 'Network error. Please try again.');
    if (btn) { btn.disabled = false; btn.textContent = 'Unlock · 15 cr'; }
  }
}

// ── STRIPE UPGRADE ─────────────────────────────────────────────────
async function startUpgrade(targetPlan) {
  const menuItem = document.getElementById('upgradeMenuItem');
  const growthMenuItem = document.getElementById('upgradeGrowthMenuItem');
  const plan = typeof targetPlan === 'string'
    ? targetPlan
    : menuItem?.dataset?.targetPlan;
  if (!plan) return;

  try {
    if (menuItem) menuItem.disabled = true;
    if (growthMenuItem) growthMenuItem.disabled = true;
    const res  = await apiFetch('http://localhost:3000/api/billing/checkout', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ plan }),
    });
    if (!res || !res.ok) {
      const err = await res?.json().catch(() => ({}));
      showToast('error', err?.message || 'Could not start checkout. Try again.');
      return;
    }
    const json = await res.json();
    if (json?.url) {
      window.location.href = json.url;
    }
  } catch (_) {
    showToast('error', 'Network error. Please try again.');
  } finally {
    if (menuItem) menuItem.disabled = false;
    if (growthMenuItem) growthMenuItem.disabled = false;
    fetchUserProfile(); // restore button label
  }
}

function openUpgradePage(targetPlan) {
  document.getElementById('userMenuDropdown')?.classList.remove('open');
  const suffix = targetPlan ? `?plan=${encodeURIComponent(targetPlan)}` : '';
  window.location.href = `/upgrade${suffix}`;
}

function openAdminDashboard() {
  document.getElementById('userMenuDropdown')?.classList.remove('open');
  window.location.href = 'admin.html';
}

function logout() {
  localStorage.removeItem('pp_access_token');
  localStorage.removeItem('pp_refresh_token');
  localStorage.removeItem('pp_user_email');
  localStorage.removeItem('pp_user_id');
  window.location.href = 'login.html';
}

function initAuth() {
  if (!getToken()) {
    window.location.href = 'login.html';
    return false;
  }
  const email = localStorage.getItem('pp_user_email') || '';
  const el = document.getElementById('navUserEmail');
  if (el && email) el.textContent = email;
  return true;
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...getAuthHeaders(), ...(options.headers || {}) },
  });
  if (res.status === 401) {
    // Token expired or invalid — clear session and redirect to login
    logout();
    return null;
  }
  return res;
}

async function refreshAdminMenuAccess() {
  const adminMenuItem = document.getElementById('adminMenuItem');
  if (!adminMenuItem) return;

  adminMenuItem.style.display = 'none';

  try {
    const res = await apiFetch('/api/admin/overview');
    if (res?.ok) {
      adminMenuItem.style.display = '';
    }
  } catch (_) {
    adminMenuItem.style.display = 'none';
  }
}

async function fetchUserProfile() {
  const refreshBtn = document.getElementById('creditsRefreshBtn');
  if (refreshBtn) refreshBtn.classList.add('spinning');

  try {
    const res  = await apiFetch('http://localhost:3000/api/me');
    if (!res || !res.ok) return;
    const json = await res.json();
    const user = json?.data;
    if (!user) return;

    ACTIVE_PLAN = user.plan || 'free';

    // Nav email + avatar
    const email = user.email || '';
    const emailEl = document.getElementById('navUserEmail');
    if (emailEl) emailEl.textContent = email;
    const avatarEl = document.getElementById('userAvatar');
    if (avatarEl) avatarEl.textContent = email ? email[0].toUpperCase() : '?';
    const menuEmailEl = document.getElementById('userMenuEmail');
    if (menuEmailEl) menuEmailEl.textContent = email;

    // Credits card
    const creditsEl = document.getElementById('creditsAmount');
    if (creditsEl) creditsEl.textContent = (user.credits ?? 0).toLocaleString();

    // Plan card + dropdown badge
    const planDisplayEl = document.getElementById('planDisplay');
    const planLabel = { free: 'Free', starter: 'Starter', growth: 'Growth' }[ACTIVE_PLAN] || ACTIVE_PLAN;
    if (planDisplayEl) planDisplayEl.textContent = planLabel;
    const planBadgeEl = document.getElementById('userMenuPlan');
    if (planBadgeEl) {
      planBadgeEl.textContent = planLabel;
      planBadgeEl.className = `user-plan-badge user-plan-badge--${ACTIVE_PLAN}`;
    }

    // Upgrade button (card) + menu item — hidden on Growth plan
    const upgradeMenuItem = document.getElementById('upgradeMenuItem');
    const upgradeMenuLabel = document.getElementById('upgradeMenuLabel');
    const planActions = {
      free:    { label: 'Upgrade to Starter', target: 'starter' },
      starter: { label: 'Upgrade to Growth', target: 'growth' },
      growth:  { label: 'Downgrade to Starter', target: 'starter' },
    };
    const planAction = planActions[ACTIVE_PLAN];
    const upgradeLabel = planAction?.label || '';

    if (!planAction) {
      if (upgradeMenuItem) upgradeMenuItem.style.display = 'none';
    } else {
      if (upgradeMenuItem) {
        upgradeMenuItem.style.display = '';
        upgradeMenuItem.dataset.targetPlan = planAction.target;
      }
      if (upgradeMenuLabel) upgradeMenuLabel.textContent = 'Upgrade Plan';
    }

    applyPlanToUI(ACTIVE_PLAN);
    updateCreditEstimator();
    refreshAdminMenuAccess();
  } catch (_) {
    // Non-fatal — UI falls back to defaults
  } finally {
    if (refreshBtn) refreshBtn.classList.remove('spinning');
  }
}

// ── PLAN CONFIG ───────────────────────────────────────────────────
const PLAN_LIMITS = {
  free: {
    maxResults:        10,
    categoryTerms:     1,
    scrapeContacts:    false,
    maxLeadsPerPlace:  0,
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

let ACTIVE_PLAN = 'free'; // updated from /api/me on load

let settings = {
  webhookUrl:     DEFAULT_WEBHOOK,
  webhookMethod:  'POST',
  responseMode:   'sync',
};

// ── SETTINGS ──────────────────────────────────────────────────────

function loadSettings() {
  localStorage.removeItem(SETTINGS_KEY);
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    settings = { ...settings, ...stored };
    // Always seed webhook URL if not yet stored
    if (!settings.webhookUrl) settings.webhookUrl = DEFAULT_WEBHOOK;
  } catch (e) {}

  document.getElementById('webhookUrl').value     = settings.webhookUrl;
  document.getElementById('webhookMethod').value  = settings.webhookMethod;
  document.getElementById('responseMode').value   = settings.responseMode;
  updateConnectionStatus();
}

function saveSettings() {
  settings.webhookUrl    = document.getElementById('webhookUrl').value.trim();
  settings.webhookMethod = document.getElementById('webhookMethod').value;
  settings.responseMode  = document.getElementById('responseMode').value;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  updateConnectionStatus();
  closeSettings();
  showToast('success', '✓', 'Settings saved!');
}

function updateConnectionStatus() {
  // statusDot / statusText removed from nav in V3 redesign — guard against missing elements
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  if (!dot || !txt) return;
  if (settings.webhookUrl) {
    dot.style.background  = 'var(--success)';
    dot.style.boxShadow   = '0 0 6px var(--success)';
    dot.style.animation   = 'pulse 2s infinite';
    txt.textContent        = 'Workflow connected';
  } else {
    dot.style.background  = '#5f5f8a';
    dot.style.boxShadow   = 'none';
    dot.style.animation   = 'none';
    txt.textContent        = 'Not configured';
  }
}

// ── USER MENU DROPDOWN ────────────────────────────────────────────

function toggleUserMenu(e) {
  e.stopPropagation();
  const dropdown = document.getElementById('userMenuDropdown');
  const isOpen   = dropdown.classList.toggle('open');
  document.getElementById('userMenuTrigger').setAttribute('aria-expanded', isOpen);
}

// Close dropdown when clicking outside
document.addEventListener('click', () => {
  const dropdown = document.getElementById('userMenuDropdown');
  if (dropdown) dropdown.classList.remove('open');
});

async function openBillingPortal() {
  document.getElementById('userMenuDropdown')?.classList.remove('open');
  showToast('info', 'Opening billing portal…');
  try {
    const res = await apiFetch('http://localhost:3000/api/billing/portal', { method: 'POST' });
    if (!res) return;
    const json = await res.json();
    if (!res.ok) {
      showToast('error', json.message || 'Could not open billing portal.');
      return;
    }
    window.location.href = json.url;
  } catch (_) {
    showToast('error', 'Network error. Please try again.');
  }
}

function scrollToCreditHistory() {
  document.getElementById('userMenuDropdown')?.classList.remove('open');
  const section = document.getElementById('creditHistorySection');
  if (!section) return;
  // Open the panel if collapsed
  const body = document.getElementById('creditHistoryBody');
  if (body && body.style.display === 'none') toggleCreditHistory();
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── CREDIT HISTORY ────────────────────────────────────────────────

let creditHistoryLoaded = false;

function toggleCreditHistory() {
  const body    = document.getElementById('creditHistoryBody');
  const chevron = document.getElementById('chToggle');
  if (!body) return;

  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : '';
  if (chevron) chevron.textContent = isOpen ? '▾' : '▴';

  if (!isOpen && !creditHistoryLoaded) {
    loadCreditHistory();
  }
}

async function loadCreditHistory() {
  const loading = document.getElementById('chLoading');
  const empty   = document.getElementById('chEmpty');
  const table   = document.getElementById('chTable');
  const tbody   = document.getElementById('chTableBody');
  const count   = document.getElementById('chCount');

  if (loading) loading.style.display = '';
  if (empty)   empty.style.display   = 'none';
  if (table)   table.style.display   = 'none';

  try {
    const res = await apiFetch('http://localhost:3000/api/me/transactions');
    if (!res || !res.ok) throw new Error('Failed');
    const json = await res.json();
    const rows = json.data ?? [];

    creditHistoryLoaded = true;
    if (count) count.textContent = rows.length ? `(${rows.length})` : '';

    if (rows.length === 0) {
      if (empty) empty.style.display = '';
      return;
    }

    if (tbody) {
      tbody.innerHTML = rows.map(r => {
        const date    = new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const credits = r.credits;
        const sign    = credits >= 0 ? '+' : '';
        const cls     = credits >= 0 ? 'ch-credits-pos' : 'ch-credits-neg';
        const typeMap = { search: '🔍 Search', unlock: '🔓 Unlock', subscription: '⚡ Subscription' };
        const badge   = typeMap[r.transaction_type] || r.transaction_type;
        return `<tr>
          <td class="ch-date">${date}</td>
          <td><span class="ch-badge ch-badge--${r.transaction_type}">${badge}</span></td>
          <td class="ch-desc">${r.description || '—'}</td>
          <td class="ch-col-credits ${cls}">${sign}${credits.toLocaleString()}</td>
        </tr>`;
      }).join('');
    }

    if (table) table.style.display = '';
  } catch (_) {
    if (empty) { empty.textContent = 'Failed to load transactions.'; empty.style.display = ''; }
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

// ── SETTINGS MODAL ────────────────────────────────────────────────

function openSettings() {
  document.getElementById('webhookUrl').value    = settings.webhookUrl;
  document.getElementById('webhookMethod').value = settings.webhookMethod;
  document.getElementById('responseMode').value  = settings.responseMode;
  document.getElementById('settingsModal').classList.add('show');
}

function closeSettings() {
  document.getElementById('settingsModal').classList.remove('show');
}

// ── TAGS (Decision Maker Roles) ───────────────────────────────────

const DEFAULT_TAGS = ['Owner', 'Founder', 'CEO', 'Director'];
const TAG_COLORS   = ['tag-orange', 'tag-purple', 'tag-blue', 'tag-green'];
let tags = [...DEFAULT_TAGS];

function renderTags() {
  const wrap  = document.getElementById('tagsWrap');
  const input = document.getElementById('tagInput');
  wrap.innerHTML = '';
  tags.forEach((tag, i) => {
    const el       = document.createElement('span');
    el.className   = 'tag ' + TAG_COLORS[i % TAG_COLORS.length];
    el.innerHTML   = `${escHtml(tag)} <span class="tag-remove" data-index="${i}">×</span>`;
    wrap.appendChild(el);
  });
  wrap.appendChild(input);

  wrap.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      tags.splice(parseInt(btn.dataset.index), 1);
      renderTags();
    });
  });
}

function focusTagInput() {
  document.getElementById('tagInput').focus();
}

// ── POSTCODES ─────────────────────────────────────────────────────

let postcodes = [];

function renderPostcodes() {
  const wrap  = document.getElementById('postcodesWrap');
  const input = document.getElementById('postcodeInput');
  wrap.innerHTML = '';
  postcodes.forEach((pc, i) => {
    const el     = document.createElement('span');
    el.className = 'tag tag-blue';
    el.innerHTML = `${escHtml(String(pc))} <span class="tag-remove" data-index="${i}">×</span>`;
    wrap.appendChild(el);
  });
  wrap.appendChild(input);

  wrap.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      postcodes.splice(parseInt(btn.dataset.index), 1);
      renderPostcodes();
    });
  });
}

function focusPostcodeInput() {
  document.getElementById('postcodeInput').focus();
}

// ── TOGGLE ────────────────────────────────────────────────────────

function toggleCompanyContacts() {
  const cb = document.getElementById('companyContactsToggle');
  cb.checked = !cb.checked;
  cb.dispatchEvent(new Event('change'));
}

function togglePeopleEnrichment() {
  const cb = document.getElementById('peopleEnrichmentToggle');
  cb.checked = !cb.checked;
  cb.dispatchEvent(new Event('change'));
}

function toggleEmailVerification() {
  const cb = document.getElementById('verifyEmailsToggle');
  if (cb.disabled) return;
  cb.checked = !cb.checked;
  cb.dispatchEvent(new Event('change'));
}

function updateEnrichmentControls() {
  const peopleToggle = document.getElementById('peopleEnrichmentToggle');
  const maxLeads     = document.getElementById('maxLeadsPerPlace');
  const verifyToggle = document.getElementById('verifyEmailsToggle');

  if (!peopleToggle || !maxLeads || !verifyToggle) return;

  maxLeads.disabled = !peopleToggle.checked;
  if (!peopleToggle.checked) {
    maxLeads.value = '0';
    verifyToggle.checked = false;
  } else if (maxLeads.value === '0') {
    maxLeads.value = '1';
  }

  verifyToggle.disabled = !peopleToggle.checked || Number(maxLeads.value) === 0;
  if (verifyToggle.disabled) verifyToggle.checked = false;

  const scrapeContacts = document.getElementById('companyContactsToggle')?.checked;
  const maxPeople = peopleToggle.checked ? Number(maxLeads.value) : 0;
  const verifyEmails = verifyToggle.checked;

  updateCreditEstimator();
}

// ── CREDIT ESTIMATOR ─────────────────────────────────────────────

function updateCreditEstimator() {
  const maxResults   = parseInt(document.getElementById('maxResults')?.value || 0, 10);
  const enrichmentOn = document.getElementById('peopleEnrichmentToggle')?.checked;
  const verifyOn     = document.getElementById('verifyEmailsToggle')?.checked;
  const maxPeople    = enrichmentOn
    ? parseInt(document.getElementById('maxLeadsPerPlace')?.value || 0, 10)
    : 0;

  // Credit rates — mirrors BUSINESS_RULES.md
  const BUSINESS_CR_RATE  = 2;   // per place scraped (incl. contact attempt)
  const PEOPLE_CR_RATE    = 15;  // per person enriched (LinkedIn lookup)
  const EMAIL_CR_RATE     = 15;  // per charged email verification (ok/invalid/disposable only)

  // Worst-case calculation — actual will be lower based on hit rates
  const businessCredits = maxResults * BUSINESS_CR_RATE;
  const peopleCredits   = maxResults * maxPeople * PEOPLE_CR_RATE;
  // Email: ~50% of verifications are charged (catch_all/unknown/error are free)
  const emailCredits    = verifyOn ? Math.ceil(maxResults * maxPeople * EMAIL_CR_RATE * 0.5) : 0;
  const total           = businessCredits + peopleCredits + emailCredits;

  // Business row — always visible
  document.getElementById('estBusinessCount').textContent   = maxResults;
  document.getElementById('estBusinessCredits').textContent = `${businessCredits} cr`;

  // People row — show when enrichment on and maxPeople > 0
  const contactRow = document.getElementById('estContactRow');
  if (maxPeople > 0) {
    document.getElementById('estContactCount').textContent   = `${maxResults} × ${maxPeople}`;
    document.getElementById('estContactCredits').textContent = `${peopleCredits} cr`;
    contactRow.style.display = 'flex';
  } else {
    contactRow.style.display = 'none';
  }

  // Email row — show when email verification on
  const emailRow = document.getElementById('estEmailRow');
  if (emailRow) {
    if (verifyOn && maxPeople > 0) {
      document.getElementById('estEmailCredits').textContent = `${emailCredits} cr`;
      emailRow.style.display = 'flex';
    } else {
      emailRow.style.display = 'none';
    }
  }

  document.getElementById('estTotal').textContent = `${total.toLocaleString()} credits`;

  // Warn if total exceeds user's credit balance
  const balanceEl = document.getElementById('creditsAmount');
  const balance   = balanceEl ? parseInt(balanceEl.textContent.replace(/,/g, ''), 10) : Infinity;
  const totalEl   = document.getElementById('estTotal');
  if (totalEl) {
    totalEl.style.color = total > balance ? '#ef4444' : 'var(--orange, #f97316)';
  }
}

// ── PLAN UI ───────────────────────────────────────────────────────

function applyPlanToUI(plan) {
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS['starter'];

  // 1. Nav — show plan name and credit balance
  const planBadge = document.getElementById('planBadge');
  if (planBadge) planBadge.textContent = limits.label;

  const planCreditsDisplay = document.getElementById('planCreditsDisplay');
  if (planCreditsDisplay) {
    planCreditsDisplay.textContent = `${limits.credits.toLocaleString()} credits included`;
  }

  // 2. Max Results — rebuild dropdown to only show valid options
  const maxResultsEl = document.getElementById('maxResults');
  if (maxResultsEl) {
    const options = [10, 25, 50].filter(n => n <= limits.maxResults);
    maxResultsEl.innerHTML = options
      .map(n => `<option value="${n}">${n} Results</option>`)
      .join('');
    // default to the highest available option
    maxResultsEl.value = String(limits.maxResults);
  }

  // 3. Company contacts — disable toggle if plan doesn't include it
  const contactsToggle = document.getElementById('companyContactsToggle');
  const contactsRow    = contactsToggle?.closest('.toggle-row');
  if (contactsToggle) {
    if (!limits.scrapeContacts) {
      contactsToggle.checked  = false;
      contactsToggle.disabled = true;
      if (contactsRow) {
        contactsRow.style.opacity = '0.4';
        contactsRow.style.cursor  = 'not-allowed';
        contactsRow.title         = 'Upgrade to Starter to unlock company contacts';
      }
    } else {
      contactsToggle.disabled = false;
      if (contactsRow) {
        contactsRow.style.opacity = '1';
        contactsRow.style.cursor  = '';
        contactsRow.title         = '';
      }
    }
  }

  // 4. People enrichment — disable toggle if plan doesn't include it
  const peopleToggle = document.getElementById('peopleEnrichmentToggle');
  const peopleRow    = peopleToggle?.closest('.toggle-row');
  if (peopleToggle) {
    if (limits.maxLeadsPerPlace === 0) {
      peopleToggle.checked  = false;
      peopleToggle.disabled = true;
      if (peopleRow) {
        peopleRow.style.opacity = '0.4';
        peopleRow.style.cursor  = 'not-allowed';
        peopleRow.title         = 'Upgrade to Starter to unlock people enrichment';
      }
    } else {
      peopleToggle.disabled = false;
      if (peopleRow) {
        peopleRow.style.opacity = '1';
        peopleRow.style.cursor  = '';
        peopleRow.title         = '';
      }
    }
  }

  // 5. Max people per place — cap options to plan limit
  const maxLeadsEl = document.getElementById('maxLeadsPerPlace');
  if (maxLeadsEl) {
    const peopleOptions = [1, 2].filter(n => n <= limits.maxLeadsPerPlace);
    maxLeadsEl.innerHTML = [
      '<option value="0">0 People</option>',
      ...peopleOptions.map(n => `<option value="${n}">${n} Person${n > 1 ? 's' : ''}</option>`),
    ].join('');
  }

  // 6. Email verification — disable if plan doesn't include it
  const verifyToggle = document.getElementById('verifyEmailsToggle');
  if (verifyToggle && !limits.emailVerification) {
    verifyToggle.checked  = false;
    verifyToggle.disabled = true;
    const verifyRow = verifyToggle.closest('.toggle-row');
    if (verifyRow) {
      verifyRow.style.opacity = '0.4';
      verifyRow.title         = 'Upgrade to Starter to unlock email verification';
    }
  }

  updateEnrichmentControls();
}

// ── PROGRESS ──────────────────────────────────────────────────────

let progressInterval = null;
let progressValue    = 0;

const STEPS       = ['step1','step2','step3','step4','step5'];
const STEP_LABELS = [
  'Locating businesses…',
  'Scraping Google Maps…',
  'Enriching with LinkedIn…',
  'Extracting contacts…',
  'Compiling results…',
];

function startProgress() {
  progressValue = 0;
  STEPS.forEach(id => { document.getElementById(id).className = 'pstep'; });
  document.getElementById('progressCard').classList.add('show');
  document.getElementById('progressBar').style.width   = '0%';
  document.getElementById('progressPct').textContent    = '0%';
  document.getElementById('progressLabel').textContent  = STEP_LABELS[0];
  document.getElementById('step1').classList.add('active');

  let stepIdx = 0;
  progressInterval = setInterval(() => {
    progressValue = Math.min(progressValue + (Math.random() * 3 + 1), 95);
    const pct     = Math.round(progressValue);
    document.getElementById('progressBar').style.width  = pct + '%';
    document.getElementById('progressPct').textContent   = pct + '%';

    const newStep = Math.min(Math.floor(progressValue / 20), 4);
    if (newStep > stepIdx) {
      document.getElementById(STEPS[stepIdx]).className = 'pstep done';
      stepIdx = newStep;
      document.getElementById(STEPS[stepIdx]).className = 'pstep active';
      document.getElementById('progressLabel').textContent = STEP_LABELS[stepIdx];
    }
  }, 400);
}

function finishProgress() {
  clearInterval(progressInterval);
  document.getElementById('progressBar').style.width  = '100%';
  document.getElementById('progressPct').textContent   = '100%';
  STEPS.forEach(id => { document.getElementById(id).className = 'pstep done'; });
  document.getElementById('progressLabel').textContent = 'Scan complete!';
  setTimeout(() => document.getElementById('progressCard').classList.remove('show'), 1200);
}

function stopProgress() {
  clearInterval(progressInterval);
  document.getElementById('progressCard').classList.remove('show');
}

// ── LAUNCH SCAN ───────────────────────────────────────────────────

async function launchScan() {
  const category = document.getElementById('businessCategory').value.trim();
  const location = document.getElementById('location').value.trim();
  const state = document.getElementById('state').value;

  if (!category || !location) {
    showToast('error', '⚠', 'Please enter a Business Category and Location.');
    return;
  }
  if (!state) {
    showToast('error', '!', 'Please select a State.');
    document.getElementById('state').focus();
    return;
  }

  // Flush any pending tag / postcode that wasn't committed with Enter
  const pendingTag = document.getElementById('tagInput').value.trim().replace(/,$/, '');
  if (pendingTag && !tags.includes(pendingTag)) {
    tags.push(pendingTag);
    document.getElementById('tagInput').value = '';
    renderTags();
  }

  const pendingPC = document.getElementById('postcodeInput').value.trim().replace(/,$/, '');
  if (pendingPC) {
    const num = parseInt(pendingPC, 10);
    if (!isNaN(num) && String(num) === pendingPC && !postcodes.includes(num)) {
      postcodes.push(num);
    }
    document.getElementById('postcodeInput').value = '';
    renderPostcodes();
  }

  hideError();
  setLaunchState(true);
  document.getElementById('resultsSection').classList.remove('show');
  startProgress();

  const payload = {
    businessCategory: category,
    location:         location,
    state:            state,                                           // string e.g. "VIC"
    maxResults:       parseInt(document.getElementById('maxResults').value),
    companySize:      document.getElementById('companySize').value,
    roles:            tags,
    postCodes:        postcodes.map(Number),                           // array of numbers
    bizdevDiscovery:  document.getElementById('peopleEnrichmentToggle').checked,
    scrapeContacts:   document.getElementById('companyContactsToggle').checked,
    enrichBusinessLeads: document.getElementById('peopleEnrichmentToggle').checked,
    maxLeadsPerPlace: document.getElementById('peopleEnrichmentToggle').checked
      ? parseInt(document.getElementById('maxLeadsPerPlace').value, 10)
      : 0,
    verifyEmails:     document.getElementById('verifyEmailsToggle').checked,
  };

  try {
    const response = await apiFetch(API_SEARCHES_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (!response) return; // 401 — apiFetch already redirected to login

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `HTTP ${response.status} — ${response.statusText}`);
    }

    const searchId = data?.data?.search?.id;
    if (!searchId) {
      throw new Error('The API did not return a search id.');
    }

    const completedData = await pollSearchResults(searchId);
    finishProgress();
    setTimeout(() => { renderResults(completedData); loadSearchHistory(); fetchUserProfile(); creditHistoryLoaded = false; }, 400);

  } catch (err) {
    stopProgress();
    showError(`Could not run the search: <strong>${escHtml(err.message)}</strong>. Check the backend console and the latest n8n workflow execution.`);
    showToast('error', '✕', err.message || 'Search failed — check backend API.');
  } finally {
    setLaunchState(false);
  }
}

function setLaunchState(loading) {
  const btn      = document.getElementById('launchBtn');
  const icon     = document.getElementById('launchBtnIcon');
  const label    = document.getElementById('launchBtnText');
  const arrow    = document.getElementById('launchBtnArrow');

  btn.disabled = loading;
  if (loading) {
    btn.classList.add('scanning');
    icon.innerHTML    = '<div class="spinner"></div>';
    label.textContent = 'Scanning…';
    if (arrow) arrow.style.visibility = 'hidden';
  } else {
    btn.classList.remove('scanning');
    icon.textContent  = '🚀';
    label.textContent = 'Launch Intelligence Scan';
    if (arrow) arrow.style.visibility = 'visible';
  }
}

// ── RESULTS ───────────────────────────────────────────────────────

let allLeads      = [];
let filteredLeads = [];
let currentPage   = 1;
const PAGE_SIZE   = 20;
let sortCol       = 'company';
let sortAsc       = true;

const AVATAR_COLORS = [
  '#f97316','#8b5cf6','#3b82f6','#10b981','#f59e0b','#ec4899','#6366f1','#14b8a6'
];

function normalizeLeads(data) {
  const leadKeys = ['business_name', 'companyName', 'company', 'name', 'contactName', 'contact', 'owner_name', 'ownerName', 'bizDevName', 'email', 'ownerEmail', 'bizDevEmail', 'linkedin', 'linkedinUrl', 'linkedin_url', 'ownerLinkedIn', 'bizDevLinkedIn'];
  const arrayKeys = ['leads', 'results', 'data', 'items', 'records', 'contacts'];
  const wrapperKeys = ['json', 'body', 'response', 'payload', 'output'];
  const preferredKeys = [...arrayKeys, ...wrapperKeys];

  const isLeadLike = item =>
    item && typeof item === 'object' && !Array.isArray(item) &&
    leadKeys.some(key => Object.prototype.hasOwnProperty.call(item, key));

  const unwrap = value => {
    if (!value) return [];

    if (Array.isArray(value)) {
      const nested = value.flatMap(item => {
        if (isLeadLike(item)) return [item];
        return unwrap(item);
      });

      return nested.length ? nested : value;
    }

    if (typeof value === 'object') {
      if (isLeadLike(value)) return [value];

      const preferred = preferredKeys
        .filter(key => Object.prototype.hasOwnProperty.call(value, key))
        .flatMap(key => unwrap(value[key]));
      if (preferred.length) return preferred;

      return Object.values(value).flatMap(unwrap);
    }

    return [];
  };

  return unwrap(data);
}

function firstPresent(...values) {
  return values.find(value => value !== undefined && value !== null && String(value).trim() !== '') || '';
}

function leadDisplayFields(l) {
  const locationParts = [l.city, l.state].filter(Boolean);
  return {
    company:  firstPresent(l.business_name, l.companyName, l.company, l.name),
    location: firstPresent(l.location, locationParts.join(', '), l.city, l.address),
    contact:  firstPresent(l.owner_name, l.contactName, l.contact, l.decisionMaker, l.ownerName, l.bizDevName),
    phone:    firstPresent(l.phone, l.contactPhone, l.phoneUnformatted),
    title:    firstPresent(l.business_type, l.jobTitle, l.role, l.ownerTitle, l.bizDevTitle),
    email:    firstPresent(l.email, l.contactEmail, l.ownerEmail, l.bizDevEmail),
    linkedin: firstPresent(l.linkedin, l.linkedinUrl, l.linkedin_url, l.ownerLinkedIn, l.bizDevLinkedIn),
    rating:   l.rating || l.totalScore || null,
    website:  firstPresent(l.website, l.websiteUrl, l.website_url),
  };
}

function renderStars(rating) {
  const n = Math.round(Number(rating));
  return '★'.repeat(Math.min(n, 5)) + '☆'.repeat(Math.max(0, 5 - n));
}

async function pollSearchResults(searchId) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < SEARCH_POLL_TIMEOUT_MS) {
    await wait(SEARCH_POLL_INTERVAL_MS);

    const response = await apiFetch(`${API_SEARCHES_URL}/${encodeURIComponent(searchId)}/results`);
    if (!response) return null; // 401 handled

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `HTTP ${response.status} — ${response.statusText}`);
    }

    const result = data?.data?.result;
    const leads = Array.isArray(result?.leads) ? result.leads : [];

    if (leads.length > 0 || result?.status === 'completed') {
      return data;
    }
  }

  throw new Error('The search is still running. Please check recent searches again shortly.');
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function renderResults(data) {
  allLeads      = normalizeLeads(data);
  filteredLeads = [...allLeads];
  currentPage   = 1;

  // Header count
  document.getElementById('resultsCount').textContent = allLeads.length.toLocaleString();

  // Stats
  const enriched  = allLeads.filter(l => leadDisplayFields(l).linkedin).length;
  const emails    = allLeads.filter(l => leadDisplayFields(l).email).length;
  const contacts  = allLeads.filter(l => {
    const f = leadDisplayFields(l);
    return Boolean(f.contact || f.email || f.linkedin);
  }).length;
  document.getElementById('statTotal').textContent    = allLeads.length;
  document.getElementById('statEnriched').textContent = enriched;
  document.getElementById('statEmails').textContent   = emails;
  document.getElementById('statBizdev').textContent   = contacts;

  document.getElementById('resultsSection').classList.add('show');
  renderPage();
  showToast('success', '✓', `Found ${allLeads.length} lead${allLeads.length !== 1 ? 's' : ''}!`);
}

function renderPage() {
  const grid  = document.getElementById('cardsGrid');
  const start = (currentPage - 1) * PAGE_SIZE;
  const end   = start + PAGE_SIZE;
  const page  = filteredLeads.slice(start, end);

  if (filteredLeads.length === 0) {
    grid.innerHTML = '';
    document.getElementById('emptyState').style.display = 'block';
  } else {
    document.getElementById('emptyState').style.display = 'none';

    grid.innerHTML = page.map((l, i) => {
      const fields          = leadDisplayFields(l);
      const name            = fields.company || '—';
      const color           = AVATAR_COLORS[(start + i) % AVATAR_COLORS.length];
      const initials        = name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
      const rating          = fields.rating ? Number(fields.rating).toFixed(1) : null;
      const hasContact      = Boolean(fields.contact || fields.email || fields.linkedin);
      const alreadyUnlocked = Boolean(l.contact_unlocked);
      const resultId        = l.id || '';
      const websiteDisplay  = fields.website
        ? fields.website.replace(/^https?:\/\//, '').replace(/\/$/, '')
        : '';

      const canUnlock = ACTIVE_PLAN === 'starter' || ACTIVE_PLAN === 'growth';

      // Contact section — three states: unlocked, locked+has data, no data
      let contactSection;
      if (alreadyUnlocked) {
        contactSection = `
          <div class="contact-revealed">
            ${fields.contact  ? `<div class="contact-row"><span class="cr-icon">👤</span><span>${escHtml(fields.contact)}</span></div>` : ''}
            ${fields.email    ? `<div class="contact-row"><span class="cr-icon">✉️</span><a href="mailto:${escHtml(fields.email)}">${escHtml(fields.email)}</a></div>` : ''}
            ${fields.linkedin ? `<div class="contact-row"><span class="cr-icon">🔗</span><a href="${escHtml(fields.linkedin)}" target="_blank" rel="noopener">LinkedIn</a></div>` : ''}
          </div>`;
      } else if (hasContact) {
        if (canUnlock) {
          contactSection = `
            <div class="contact-available">
              <span class="contact-badge">👤 Contact found</span>
              <button class="btn-unlock" onclick="unlockContact('${escHtml(resultId)}')" data-result-id="${escHtml(resultId)}">Unlock · 15 cr</button>
            </div>`;
        } else {
          contactSection = `
            <div class="contact-available">
              <span class="contact-badge">👤 Contact found</span>
              <button class="btn-unlock btn-unlock-locked" onclick="openUpgradePage('starter')" title="Upgrade to Starter or Growth to unlock contacts">Upgrade to unlock</button>
            </div>`;
        }
      } else {
        contactSection = `<div class="contact-none">No contact data</div>`;
      }

      return `
        <div class="business-card" id="card-${escHtml(resultId)}">
          <div class="card-header">
            <div class="card-avatar" style="background:${color}">${escHtml(initials)}</div>
            <div class="card-info">
              <div class="card-name" title="${escHtml(name)}">${escHtml(name)}</div>
              <div class="card-meta">
                ${rating ? `<span class="card-rating">${renderStars(rating)} ${rating}</span>` : ''}
                ${fields.title ? `<span class="card-category">${escHtml(fields.title)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="card-details">
            ${fields.location ? `<div class="card-detail"><span class="card-detail-icon">📍</span><span>${escHtml(fields.location)}</span></div>` : ''}
            ${fields.phone    ? `<div class="card-detail"><span class="card-detail-icon">📞</span><span>${escHtml(fields.phone)}</span></div>` : ''}
            ${fields.website  ? `<div class="card-detail"><span class="card-detail-icon">🌐</span><a href="${escHtml(fields.website)}" target="_blank" rel="noopener">${escHtml(websiteDisplay)}</a></div>` : ''}
          </div>
          <div class="card-contact" id="contact-${escHtml(resultId)}">
            ${contactSection}
          </div>
        </div>`;
    }).join('');
  }

  // Pagination
  const total     = filteredLeads.length;
  const pageCount = Math.ceil(total / PAGE_SIZE);
  document.getElementById('pageInfo').textContent =
    `Showing ${Math.min(start + 1, total)}–${Math.min(end, total)} of ${total} businesses`;

  const pb = document.getElementById('pageBtns');
  pb.innerHTML = '';
  if (pageCount > 1) {
    const addBtn = (label, page, active) => {
      const b         = document.createElement('button');
      b.className     = 'page-btn' + (active ? ' active' : '');
      b.textContent   = label;
      b.addEventListener('click', () => { currentPage = page; renderPage(); });
      pb.appendChild(b);
    };
    if (currentPage > 1) addBtn('‹', currentPage - 1, false);
    for (let p = Math.max(1, currentPage - 2); p <= Math.min(pageCount, currentPage + 2); p++) {
      addBtn(p, p, p === currentPage);
    }
    if (currentPage < pageCount) addBtn('›', currentPage + 1, false);
  }
}

// ── FILTER & SORT ─────────────────────────────────────────────────

function filterTable() {
  const q       = document.getElementById('tableSearch').value.toLowerCase();
  filteredLeads = allLeads.filter(l => JSON.stringify(l).toLowerCase().includes(q));
  currentPage   = 1;
  renderPage();
}

const SORT_KEYS = {
  company:  l => (leadDisplayFields(l).company  || '').toLowerCase(),
  location: l => (leadDisplayFields(l).location || '').toLowerCase(),
  contact:  l => (leadDisplayFields(l).contact  || '').toLowerCase(),
  title:    l => (leadDisplayFields(l).title    || '').toLowerCase(),
  email:    l => (leadDisplayFields(l).email    || '').toLowerCase(),
  rating:   l => Number(leadDisplayFields(l).rating || 0),
};

function sortTable(col) {
  if (sortCol === col) sortAsc = !sortAsc;
  else { sortCol = col; sortAsc = true; }

  ['company','location','contact','title','email','size'].forEach(c => {
    const el = document.getElementById('sort-' + c);
    if (el) { el.textContent = '▲'; el.parentElement.classList.remove('sort-asc','sort-desc'); }
  });

  const el = document.getElementById('sort-' + col);
  if (el) {
    el.textContent = sortAsc ? '▲' : '▼';
    el.parentElement.classList.add(sortAsc ? 'sort-asc' : 'sort-desc');
  }

  const fn = SORT_KEYS[col] || (() => '');
  filteredLeads.sort((a, b) => {
    const av = fn(a), bv = fn(b);
    return sortAsc ? (av > bv ? 1 : av < bv ? -1 : 0)
                   : (av < bv ? 1 : av > bv ? -1 : 0);
  });
  currentPage = 1;
  renderPage();
}

function sortBySelect() {
  const col = document.getElementById('sortSelect')?.value || '';
  const q   = (document.getElementById('tableSearch')?.value || '').toLowerCase();
  filteredLeads = allLeads.filter(l => JSON.stringify(l).toLowerCase().includes(q));
  if (col) {
    const fn  = SORT_KEYS[col] || (() => '');
    // rating sorts high-to-low; others low-to-high
    const asc = col !== 'rating';
    filteredLeads.sort((a, b) => {
      const av = fn(a), bv = fn(b);
      return asc ? (av > bv ? 1 : av < bv ? -1 : 0)
                 : (av < bv ? 1 : av > bv ? -1 : 0);
    });
  }
  currentPage = 1;
  renderPage();
}

// ── EXPORT CSV ────────────────────────────────────────────────────

function exportCSV() {
  if (!filteredLeads.length) { showToast('error', '⚠', 'No results to export.'); return; }

  const headers = ['Company','Location','Contact','Phone','Title','Email','LinkedIn'];
  const rows    = filteredLeads.map(l => {
    const fields = leadDisplayFields(l);
    return [
      fields.company,
      fields.location,
      fields.contact,
      fields.phone,
      fields.title,
      fields.email,
      fields.linkedin,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });

  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `prospectpulse-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('success', '⬇', `Exported ${filteredLeads.length} leads as CSV.`);
}

// ── HELPERS ───────────────────────────────────────────────────────

function resetScan() {
  document.getElementById('resultsSection').classList.remove('show');
  allLeads      = [];
  filteredLeads = [];
  document.getElementById('businessCategory').value = '';
  document.getElementById('location').value         = '';
  document.getElementById('state').value            = '';
  document.getElementById('tableSearch').value      = '';
  document.getElementById('companyContactsToggle').checked = true;
  document.getElementById('peopleEnrichmentToggle').checked = false;
  document.getElementById('maxLeadsPerPlace').value = '0';
  document.getElementById('verifyEmailsToggle').checked = false;
  updateEnrichmentControls();
  postcodes = [];
  renderPostcodes();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function copyText(text) {
  navigator.clipboard.writeText(text)
    .then(() => showToast('success', '⎘', 'Email copied to clipboard!'));
}

function showError(msg) {
  document.getElementById('errorMsg').innerHTML = msg;
  document.getElementById('errorCard').classList.add('show');
}
function hideError() {
  document.getElementById('errorCard').classList.remove('show');
}

let toastTimeout = null;
function showToast(type, icon, msg) {
  const el = document.getElementById('toast');
  document.getElementById('toastIcon').textContent = icon;
  document.getElementById('toastMsg').textContent  = msg;
  el.className = `toast ${type} show`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove('show'), 3200);
}

// ── SEARCH HISTORY ────────────────────────────────────────────────

const STATUS_META = {
  completed: { label: 'Completed', cls: 'status-completed' },
  running:   { label: 'Running…',  cls: 'status-running'   },
  failed:    { label: 'Failed',    cls: 'status-failed'    },
};

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  <  1) return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

async function loadSearchHistory() {
  try {
    const res  = await apiFetch(API_SEARCHES_URL);
    if (!res || !res.ok) return;
    const json = await res.json();
    const list = Array.isArray(json?.data) ? json.data : [];

    const section = document.getElementById('historySection');
    const ul      = document.getElementById('historyList');

    if (!list.length) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    ul.innerHTML = list.map(s => {
      const meta     = STATUS_META[s.search_status] || STATUS_META.failed;
      const count    = s.businesses_found ?? 0;
      const contacts = s.contacts_found   ?? 0;
      const canView  = s.search_status === 'completed' && count > 0;
      return `
        <div class="history-item">
          <div class="history-icon">🔍</div>
          <div class="history-info">
            <div class="history-query">
              ${escHtml(s.business_category || '—')}
              <span class="history-loc">${escHtml(s.location || '')}</span>
            </div>
            <div class="history-meta">
              <span class="history-badge ${meta.cls}">${meta.label}</span>
              ${count ? `<span class="history-stat">${count} businesses</span>` : ''}
              ${contacts ? `<span class="history-stat">${contacts} contacts</span>` : ''}
              <span class="history-time">${relativeTime(s.created_at)}</span>
            </div>
          </div>
          ${canView
            ? `<button class="btn-sm primary history-view-btn" onclick="viewHistoryResult('${escHtml(s.id)}')">View</button>`
            : `<div class="history-view-placeholder"></div>`
          }
        </div>`;
    }).join('');
  } catch (_) {
    // History is non-critical — silently ignore errors
  }
}

async function viewHistoryResult(searchId) {
  document.getElementById('resultsSection').classList.remove('show');
  document.getElementById('progressCard').style.display  = 'none';

  try {
    const res  = await apiFetch(`${API_SEARCHES_URL}/${encodeURIComponent(searchId)}/results`);
    if (!res) return;
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);

    const result = data?.data?.result;
    if (!result || !Array.isArray(result.leads) || result.leads.length === 0) {
      showToast('error', '⚠', 'No results found for this search.');
      return;
    }

    renderResults(result);
    document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    showToast('error', '⚠', err.message || 'Could not load results.');
  }
}

// ── INIT ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Guard: redirect to login if no token
  if (!initAuth()) return;

  // Tag input keyboard handling
  const ti = document.getElementById('tagInput');
  ti.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ',') && ti.value.trim()) {
      e.preventDefault();
      const val = ti.value.trim().replace(/,$/, '');
      if (val && !tags.includes(val)) tags.push(val);
      ti.value = '';
      renderTags();
    } else if (e.key === 'Backspace' && !ti.value && tags.length) {
      tags.pop();
      renderTags();
    }
  });

  // Postcode input — numbers only, Enter or comma to add
  const pi = document.getElementById('postcodeInput');
  pi.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ',') && pi.value.trim()) {
      e.preventDefault();
      const raw = pi.value.trim().replace(/,$/, '');
      const num = parseInt(raw, 10);
      if (!isNaN(num) && String(num) === raw && !postcodes.includes(num)) {
        postcodes.push(num);
        renderPostcodes();
      } else if (isNaN(num) || String(num) !== raw) {
        showToast('error', '⚠', 'Post codes must be numbers only.');
      }
      pi.value = '';
    } else if (e.key === 'Backspace' && !pi.value && postcodes.length) {
      postcodes.pop();
      renderPostcodes();
    } else if (!/[0-9]|Backspace|Delete|ArrowLeft|ArrowRight|Tab/.test(e.key)) {
      e.preventDefault();
    }
  });

  renderTags();
  renderPostcodes();
  updateEnrichmentControls();

  document.getElementById('companyContactsToggle').addEventListener('change', updateEnrichmentControls);
  document.getElementById('peopleEnrichmentToggle').addEventListener('change', updateEnrichmentControls);
  document.getElementById('verifyEmailsToggle').addEventListener('change', updateEnrichmentControls);
  document.getElementById('maxLeadsPerPlace').addEventListener('change', updateEnrichmentControls);
  document.getElementById('maxResults').addEventListener('change', updateCreditEstimator);
  loadSettings();
  applyPlanToUI(ACTIVE_PLAN);
  updateCreditEstimator();
  loadSearchHistory();
  fetchUserProfile();
  document.getElementById('settingsModal').addEventListener('click', e => {
    if (e.target === document.getElementById('settingsModal')) closeSettings();
  });
});
