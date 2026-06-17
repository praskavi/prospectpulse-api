import { AppError } from '../middleware/errorHandler.js';

const SUPPORT_WEBHOOK_URL = process.env.N8N_SUPPORT_CONTACT_WEBHOOK_URL;
const SUPPORT_WEBHOOK_TIMEOUT_MS = Number(process.env.N8N_SUPPORT_CONTACT_TIMEOUT_MS || 15000);

export async function submitSupportContact(req, res, next) {
  try {
    if (!SUPPORT_WEBHOOK_URL) {
      throw new AppError('Support contact workflow is not configured.', 503);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SUPPORT_WEBHOOK_TIMEOUT_MS);
    let response;

    try {
      response = await fetch(SUPPORT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new AppError('Support workflow timed out. Please try again shortly.', 504);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();
    let payload;

    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { success: false, message: text || 'Support workflow returned an invalid response.' };
    }

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: payload?.message || 'Could not submit support request.',
      });
    }

    return res.status(response.status).json(payload);
  } catch (error) {
    next(error);
  }
}
