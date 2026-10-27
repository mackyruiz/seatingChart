import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.js';
import siteRoutes from './routes/sites.js';
import floorRoutes from './routes/floors.js';
import deskRoutes from './routes/desks.js';
import peopleRoutes from './routes/people.js';
import userRoutes from './routes/users.js';
import historyRoutes from './routes/history.js';
import changeRequestRoutes from './routes/changeRequests.js';
import exportRoutes from './routes/export.js';
import auditRoutes from './routes/audit.js';

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

export const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Blanket rate limit as a backstop against scripted mass-edits/scraping
// (spec §8), on top of the stricter limiter on /auth/login specifically.
app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/floors', floorRoutes);
app.use('/api/desks', deskRoutes);
app.use('/api/people', peopleRoutes);
app.use('/api/users', userRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/change-requests', changeRequestRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/audit-log', auditRoutes);

// Central error handler — never leak stack traces to the client.
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error.' });
});
