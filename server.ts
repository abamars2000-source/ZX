import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { UPLOADS_DIR } from './server/auth.ts';
import { initDatabase } from './server/db.ts';
import { setupRealtimeServer } from './server/realtime.ts';
import { registerApiRoutes } from './server/routes.ts';

async function startServer() {
  initDatabase();

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10mb' }));

  // Serve uploaded media safely
  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));

  // Register REST API routes
  registerApiRoutes(app);

  // Error handler for Multer / API errors
  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  });

  const server = http.createServer(app);
  setupRealtimeServer(server);

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log(`ZX server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ZX server:', err);
  process.exit(1);
});
