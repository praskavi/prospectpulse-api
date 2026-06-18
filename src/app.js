import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import searchesRoutes from './routes/searches.routes.js';
import authRoutes from './routes/auth.routes.js';
import billingRoutes from './routes/billing.routes.js';
import supportRoutes from './routes/support.routes.js';
import { handleWebhook } from './controllers/billing.controller.js';
import { requireAuth } from './middleware/authMiddleware.js';
import adminRoutes from './routes/admin.routes.js';
import { requireAdmin } from './middleware/adminMiddleware.js';
import { errorHandler } from './middleware/errorHandler.js';
import { runAlertScanCron } from './controllers/cron.controller.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const app = express();

// Stripe webhook — MUST be registered before express.json() so it receives raw body
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), handleWebhook);
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), handleWebhook);

// Middleware
app.use(express.json());
app.use(cors());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..')));

app.get('/upgrade', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'upgrade.html'));
});

const deprecatedLeadsHandler = (req, res) => {
  res.status(410).json({
    success: false,
    message: 'The legacy leads API has been deprecated. Use searches and search_results for MVP1 user-scoped results.',
  });
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'ProspectPulse API is healthy' });
});

app.get('/api/cron/alerts-scan', runAlertScanCron);

// Auth routes — public
app.use('/api', authRoutes);
app.use('/api', supportRoutes);
// Billing router keeps plan metadata public and protects checkout/portal internally.
app.use('/api', billingRoutes);

// Searches routes — protected
app.use('/api', requireAuth, searchesRoutes);

//admin routes would go here, protected by requireAdmin middleware
app.use('/api/admin', requireAuth, requireAdmin, adminRoutes);
app.all('/api/leads', deprecatedLeadsHandler);
app.all('/api/leads/search', deprecatedLeadsHandler);
app.all('/api/leads/:id', deprecatedLeadsHandler);

// Global error handler
app.use(errorHandler);
