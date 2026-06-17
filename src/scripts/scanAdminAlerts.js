import 'dotenv/config';
import { scanOperationalAlerts } from '../services/adminAlerts.service.js';

try {
  const result = await scanOperationalAlerts();
  console.log(JSON.stringify({
    success: true,
    scannedAt: result.scannedAt,
    candidates: result.candidates,
    created: result.created,
    updated: result.updated,
  }, null, 2));
  process.exit(0);
} catch (error) {
  console.error('[admin-alerts] scan failed:', error.message || error);
  process.exit(1);
}
