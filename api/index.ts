/**
 * MJ Maps Systems — API Server
 * Mounts all route handlers and starts Express.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { planRouter } from './routes/plan';
import { turnCheckRouter } from './routes/turn-check';
import { replanRouter } from './routes/replan';
import { stopPinRouter } from './routes/stop-pin';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Health
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// Routes
app.use('/api/plan', planRouter);
app.use('/api/turn-check', turnCheckRouter);
app.use('/api/replan', replanRouter);
app.use('/api/stop-pin', stopPinRouter);

const PORT = process.env.PORT ?? 3100;
app.listen(PORT, () => {
  console.log(`[mj-maps-systems] API listening on port ${PORT}`);
});

export default app;
