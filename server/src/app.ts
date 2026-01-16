import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';

// Import routes
import feedsRoutes from './routes/feeds';
import foldersRoutes from './routes/folders';
import articlesRoutes from './routes/articles';
import crosswordRoutes from './routes/crossword';
import seikaRoutes from './routes/seika';

// Import database
import { initializeDatabase } from './services/database';
import { startScheduler, isSchedulerRunning } from './services/scheduler';

const app = express();
const PORT = process.env.PORT || 30001;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/feeds', feedsRoutes);
app.use('/api/folders', foldersRoutes);
app.use('/api/articles', articlesRoutes);
app.use('/api/crossword', crosswordRoutes);
app.use('/api/seika', seikaRoutes);

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    scheduler: isSchedulerRunning() ? 'running' : 'stopped'
  });
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// Serve static files from client build (production)
const clientDistPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));

// SPA fallback - serve index.html for all non-API routes
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Initialize database and start server
async function start() {
  try {
    await initializeDatabase();
    console.log('Database initialized');

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);

      // Start background scheduler if enabled
      if (process.env.DISABLE_SCHEDULER !== 'true') {
        startScheduler();
      } else {
        console.log('[Scheduler] Disabled by environment variable');
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export default app;
