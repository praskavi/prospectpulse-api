import { AppError } from '../middleware/errorHandler.js';
import supabase from '../config/supabaseClient.js';

const SUPPORT_WEBHOOK_URL = process.env.N8N_SUPPORT_CONTACT_WEBHOOK_URL;
const SUPPORT_WEBHOOK_TIMEOUT_MS = Number(process.env.N8N_SUPPORT_CONTACT_TIMEOUT_MS || 15000);

function generateTicketId() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SUP-${datePart}-${randomPart}`;
}

function priorityForCategory(category) {
  if (['billing', 'payment', 'account'].includes(category)) return 'high';
  if (category === 'security') return 'urgent';
  return 'normal';
}

function normalizeProfileId(value) {
  const id = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

async function updateTicket(ticketId, fields) {
  const { error } = await supabase
    .from('support_tickets')
    .update(fields)
    .eq('ticket_id', ticketId);

  if (error) {
    console.error(`[support] Could not update ticket ${ticketId}:`, error.message);
  }
}

async function forwardToWorkflow(ticket) {
  if (!SUPPORT_WEBHOOK_URL) {
    await updateTicket(ticket.ticket_id, { n8n_status: 'skipped' });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPPORT_WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(SUPPORT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ticket),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}${text ? `: ${text.slice(0, 500)}` : ''}`);
    }

    await updateTicket(ticket.ticket_id, {
      n8n_status: 'sent',
      n8n_error: null,
      n8n_sent_at: new Date().toISOString(),
    });
  } catch (error) {
    await updateTicket(ticket.ticket_id, {
      n8n_status: 'failed',
      n8n_error: error.name === 'AbortError'
        ? 'Support workflow timed out.'
        : String(error.message || error).slice(0, 1000),
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function submitSupportContact(req, res, next) {
  try {
    if (!supabase) {
      throw new AppError('Support ticket storage is not configured.', 503);
    }

    const ticket = {
      ticket_id: generateTicketId(),
      status: 'open',
      priority: priorityForCategory(req.body.category),
      category: req.body.category || 'general',
      email: req.body.email,
      name: req.body.name || null,
      subject: req.body.subject,
      message: req.body.message,
      profile_id: normalizeProfileId(req.body.user_id),
      source: req.body.source || 'contact.html',
      n8n_status: SUPPORT_WEBHOOK_URL ? 'not_sent' : 'skipped',
    };

    const { data, error } = await supabase
      .from('support_tickets')
      .insert(ticket)
      .select('id,ticket_id,status,priority,category,email,subject,created_at')
      .single();

    if (error) {
      throw new AppError(`Could not create support ticket: ${error.message}`, 500);
    }

    await forwardToWorkflow(ticket);

    return res.status(201).json({
      success: true,
      ticket_id: data.ticket_id,
      status: data.status,
      message: 'Support request received',
      data,
    });
  } catch (error) {
    next(error);
  }
}
