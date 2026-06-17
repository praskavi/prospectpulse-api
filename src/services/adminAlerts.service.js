import supabase from '../config/supabaseClient.js';
import { stripeWebhookQueue } from '../queues/stripeWebhook.queue.js';

const TABLE = 'admin_alerts';
const ADMIN_ALERT_WEBHOOK_URL = process.env.N8N_ADMIN_ALERT_WEBHOOK_URL;
const ADMIN_ALERT_TIMEOUT_MS = Number(process.env.N8N_ADMIN_ALERT_TIMEOUT_MS || 10000);

function sinceIso(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function stuckCutoffIso() {
  return new Date(Date.now() - 15 * 60 * 1000).toISOString();
}

function alertPayload(alert) {
  return {
    alert_key: alert.alert_key,
    alert_type: alert.alert_type,
    severity: alert.severity,
    title: alert.title,
    message: alert.message,
    source_table: alert.source_table,
    source_id: alert.source_id,
    source_url: alert.source_url,
    metadata: alert.metadata || {},
    last_seen_at: alert.last_seen_at,
  };
}

async function notifyAdminAlert(alert) {
  if (!ADMIN_ALERT_WEBHOOK_URL) {
    return { status: 'skipped' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ADMIN_ALERT_TIMEOUT_MS);

  try {
    const response = await fetch(ADMIN_ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alertPayload(alert)),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}${text ? `: ${text.slice(0, 500)}` : ''}`);
    }

    return { status: 'sent' };
  } catch (error) {
    return {
      status: 'failed',
      error: error.name === 'AbortError'
        ? 'Admin alert workflow timed out.'
        : String(error.message || error).slice(0, 1000),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function writeNotificationResult(alertId, result) {
  const fields = {
    notification_status: result.status,
    notification_error: result.error || null,
    notified_at: result.status === 'sent' ? new Date().toISOString() : null,
  };

  const { error } = await supabase
    .from(TABLE)
    .update(fields)
    .eq('id', alertId);

  if (error) {
    console.warn(`[admin-alerts] Could not update notification result for ${alertId}:`, error.message);
  }
}

export async function upsertAdminAlert(input) {
  const now = new Date().toISOString();
  const alert = {
    severity: 'warning',
    status: 'open',
    last_seen_at: now,
    ...input,
  };

  const { data: existing, error: readError } = await supabase
    .from(TABLE)
    .select('*')
    .eq('alert_key', alert.alert_key)
    .maybeSingle();

  if (readError) throw readError;

  if (existing) {
    const shouldNotify = existing.status === 'resolved';
    const update = {
      alert_type: alert.alert_type,
      severity: alert.severity,
      status: existing.status === 'resolved' ? 'open' : existing.status,
      title: alert.title,
      message: alert.message,
      source_table: alert.source_table || null,
      source_id: alert.source_id || null,
      source_url: alert.source_url || null,
      metadata: alert.metadata || null,
      occurrence_count: Number(existing.occurrence_count || 0) + 1,
      last_seen_at: now,
      resolved_at: existing.status === 'resolved' ? null : existing.resolved_at,
    };

    const { data, error } = await supabase
      .from(TABLE)
      .update(update)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    if (shouldNotify) await writeNotificationResult(data.id, await notifyAdminAlert(data));
    return { alert: data, created: false, notified: shouldNotify };
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      ...alert,
      source_table: alert.source_table || null,
      source_id: alert.source_id || null,
      source_url: alert.source_url || null,
      metadata: alert.metadata || null,
      first_seen_at: now,
      last_seen_at: now,
    })
    .select()
    .single();

  if (error) throw error;

  const notification = await notifyAdminAlert(data);
  await writeNotificationResult(data.id, notification);

  return { alert: { ...data, notification_status: notification.status }, created: true, notified: true };
}

export async function scanOperationalAlerts() {
  const since = sinceIso(24);
  const cutoff = stuckCutoffIso();

  const [
    failedWebhooks,
    failedSearches,
    stuckSearches,
    failedSupportTickets,
    queueCounts,
  ] = await Promise.all([
    supabase
      .from('stripe_webhook_events')
      .select('stripe_event_id,event_type,attempts,error_message,updated_at')
      .eq('status', 'failed')
      .gte('updated_at', since)
      .order('updated_at', { ascending: false })
      .limit(20),
    supabase
      .from('searches')
      .select('id,user_id,business_category,location,created_at')
      .eq('search_status', 'failed')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('searches')
      .select('id,user_id,business_category,location,created_at')
      .eq('search_status', 'running')
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(20),
    supabase
      .from('support_tickets')
      .select('ticket_id,email,subject,n8n_error,updated_at')
      .eq('n8n_status', 'failed')
      .order('updated_at', { ascending: false })
      .limit(20),
    stripeWebhookQueue
      .getJobCounts('failed', 'delayed')
      .then(counts => ({ data: counts, error: null }))
      .catch(error => ({ data: null, error })),
  ]);

  for (const result of [failedWebhooks, failedSearches, stuckSearches, failedSupportTickets]) {
    if (result.error) throw result.error;
  }

  const candidates = [];

  for (const event of failedWebhooks.data || []) {
    candidates.push({
      alert_key: `stripe_webhook_failed:${event.stripe_event_id}`,
      alert_type: 'stripe_webhook_failed',
      severity: Number(event.attempts || 0) >= 5 ? 'critical' : 'warning',
      title: 'Stripe webhook processing failed',
      message: `${event.event_type} failed after ${event.attempts || 0} attempt(s). ${event.error_message || ''}`.trim(),
      source_table: 'stripe_webhook_events',
      source_id: event.stripe_event_id,
      source_url: 'admin.html#webhooks',
      metadata: event,
    });
  }

  for (const search of failedSearches.data || []) {
    candidates.push({
      alert_key: `search_failed:${search.id}`,
      alert_type: 'search_failed',
      severity: 'warning',
      title: 'Search failed',
      message: `${search.business_category || 'Search'} in ${search.location || 'unknown location'} failed.`,
      source_table: 'searches',
      source_id: search.id,
      source_url: `admin-search.html?id=${encodeURIComponent(search.id)}`,
      metadata: search,
    });
  }

  for (const search of stuckSearches.data || []) {
    candidates.push({
      alert_key: `search_stuck:${search.id}`,
      alert_type: 'search_stuck',
      severity: 'critical',
      title: 'Search stuck running',
      message: `${search.business_category || 'Search'} in ${search.location || 'unknown location'} has been running for more than 15 minutes.`,
      source_table: 'searches',
      source_id: search.id,
      source_url: `admin-search.html?id=${encodeURIComponent(search.id)}`,
      metadata: search,
    });
  }

  for (const ticket of failedSupportTickets.data || []) {
    candidates.push({
      alert_key: `support_n8n_failed:${ticket.ticket_id}`,
      alert_type: 'support_n8n_failed',
      severity: 'warning',
      title: 'Support ticket notification failed',
      message: `${ticket.ticket_id} for ${ticket.email} did not reach the support workflow. ${ticket.n8n_error || ''}`.trim(),
      source_table: 'support_tickets',
      source_id: ticket.ticket_id,
      source_url: 'admin.html#support',
      metadata: ticket,
    });
  }

  if (queueCounts.error) {
    candidates.push({
      alert_key: 'stripe_queue_unreachable',
      alert_type: 'stripe_queue_unreachable',
      severity: 'critical',
      title: 'Stripe webhook queue is unreachable',
      message: queueCounts.error.message || 'Could not read Stripe webhook queue counts.',
      source_table: null,
      source_id: 'stripe-webhooks',
      source_url: 'admin.html#system',
      metadata: { queue: 'stripe-webhooks' },
    });
  } else if (Number(queueCounts.data?.failed || 0) > 0) {
    candidates.push({
      alert_key: 'stripe_queue_failed_jobs',
      alert_type: 'stripe_queue_failed_jobs',
      severity: 'critical',
      title: 'Stripe webhook queue has failed jobs',
      message: `${queueCounts.data.failed} Stripe webhook job(s) are failed in BullMQ.`,
      source_table: null,
      source_id: 'stripe-webhooks',
      source_url: 'admin.html#system',
      metadata: { queue: 'stripe-webhooks', counts: queueCounts.data },
    });
  }

  const results = [];
  for (const candidate of candidates) {
    results.push(await upsertAdminAlert(candidate));
  }

  return {
    scannedAt: new Date().toISOString(),
    candidates: candidates.length,
    created: results.filter(result => result.created).length,
    updated: results.filter(result => !result.created).length,
    alerts: results.map(result => result.alert),
  };
}

export async function listAdminAlerts({ page = 1, limit = 25, status, severity, alertType } = {}) {
  let query = supabase
    .from(TABLE)
    .select('*', { count: 'exact' })
    .order('last_seen_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (status) query = query.eq('status', status);
  if (severity) query = query.eq('severity', severity);
  if (alertType) query = query.eq('alert_type', alertType);

  return query;
}

export async function updateAdminAlertStatus({ id, status, adminUserId }) {
  const now = new Date().toISOString();
  const fields = { status };

  if (status === 'acknowledged') {
    fields.acknowledged_at = now;
    fields.acknowledged_by = adminUserId || null;
  }

  if (status === 'resolved') {
    fields.resolved_at = now;
  }

  if (status === 'open') {
    fields.acknowledged_at = null;
    fields.acknowledged_by = null;
    fields.resolved_at = null;
  }

  return supabase
    .from(TABLE)
    .update(fields)
    .eq('id', id)
    .select()
    .maybeSingle();
}
