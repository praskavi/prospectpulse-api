import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import searchesRoutes from './routes/searches.routes.js';
import authRoutes from './routes/auth.routes.js';
import { requireAuth } from './middleware/authMiddleware.js';
import { errorHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// Serve static frontend files (login.html, app.html, confirm.html, etc.)
app.use(express.static(path.join(__dirname, '..')));

const deprecatedLeadsHandler = (req, res) => {
  res.status(410).json({
    success: false,
    message: 'The legacy leads API has been deprecated. Use searches and search_results for MVP1 user-scoped results.',
  });
};

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'ProspectPulse API is healthy',
  });
});

// Auth routes — public (no token required)
app.use('/api', authRoutes);

// Searches routes — protected (JWT required, falls back to DEV_USER_ID in dev)
app.use('/api', requireAuth, searchesRoutes);

app.all('/api/leads', deprecatedLeadsHandler);
app.all('/api/leads/search', deprecatedLeadsHandler);
app.all('/api/leads/:id', deprecatedLeadsHandler);

// Global error handler — must be registered after all routes
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
