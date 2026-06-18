import { scanOperationalAlerts } from '../services/adminAlerts.service.js';
import { AppError } from '../middleware/errorHandler.js';

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function isVercelCronRequest(req) {
  return (req.headers['user-agent'] || '').includes('vercel-cron/1.0');
}

export async function runAlertScanCron(req, res, next) {
  try {
    const expectedSecret = process.env.CRON_SECRET;
    const hasValidBearer = expectedSecret && getBearerToken(req) === expectedSecret;
    const hasVercelCronUserAgent = isVercelCronRequest(req);

    if (!hasValidBearer && !hasVercelCronUserAgent) {
      throw new AppError('Unauthorized cron request.', 401);
    }

    const result = await scanOperationalAlerts();
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
