import supabase from '../config/supabaseClient.js';

const TABLE = 'stripe_webhook_events';

function stripeCreatedAt(event) {
  return event?.created ? new Date(event.created * 1000).toISOString() : null;
}

function eventPayload(event) {
  return event
    ? {
        id: event.id,
        type: event.type,
        created: event.created,
        livemode: event.livemode,
        data: event.data,
      }
    : null;
}

async function safeWrite(operation, fallbackMessage) {
  if (!supabase) return null;

  const { data, error } = await operation();
  if (error) {
    console.warn(`${fallbackMessage}: ${error.message}`);
    return null;
  }

  return data;
}

export async function recordStripeWebhookReceived(event) {
  return safeWrite(
    () => supabase
      .from(TABLE)
      .upsert({
        stripe_event_id: event.id,
        event_type: event.type,
        status: 'received',
        livemode: Boolean(event.livemode),
        stripe_created_at: stripeCreatedAt(event),
        received_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        payload: eventPayload(event),
      }, { onConflict: 'stripe_event_id' })
      .select()
      .single(),
    '[webhook-events] Could not record received Stripe webhook',
  );
}

export async function markStripeWebhookQueued(eventId, jobId) {
  return safeWrite(
    () => supabase
      .from(TABLE)
      .update({
        status: 'queued',
        job_id: String(jobId || ''),
        queued_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('stripe_event_id', eventId)
      .select()
      .maybeSingle(),
    '[webhook-events] Could not mark Stripe webhook queued',
  );
}

export async function markStripeWebhookProcessing(eventId, attempts = 1) {
  return safeWrite(
    () => supabase
      .from(TABLE)
      .update({
        status: 'processing',
        attempts,
        processing_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('stripe_event_id', eventId)
      .select()
      .maybeSingle(),
    '[webhook-events] Could not mark Stripe webhook processing',
  );
}

export async function markStripeWebhookProcessed(eventId, status = 'processed') {
  return safeWrite(
    () => supabase
      .from(TABLE)
      .update({
        status,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('stripe_event_id', eventId)
      .select()
      .maybeSingle(),
    '[webhook-events] Could not mark Stripe webhook processed',
  );
}

export async function markStripeWebhookFailed(eventId, error, attempts = 1) {
  return safeWrite(
    () => supabase
      .from(TABLE)
      .update({
        status: 'failed',
        attempts,
        error_message: String(error?.message || error || 'Unknown webhook processing error').slice(0, 2000),
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_event_id', eventId)
      .select()
      .maybeSingle(),
    '[webhook-events] Could not mark Stripe webhook failed',
  );
}

export async function listStripeWebhookEvents({ limit = 25, page = 1, status, eventType } = {}) {
  let query = supabase
    .from(TABLE)
    .select(
      'id,stripe_event_id,event_type,status,livemode,job_id,attempts,error_message,received_at,queued_at,processing_started_at,processed_at,updated_at',
      { count: 'exact' },
    )
    .order('received_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (status) query = query.eq('status', status);
  if (eventType) query = query.eq('event_type', eventType);

  return query;
}
